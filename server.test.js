const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('./server');
const { createStore } = require('./store');

async function get(path, opts) {
  const server = createServer(opts);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fetch(`http://localhost:${server.address().port}${path}`);
  } finally {
    server.close();
  }
}

test('GET /messages returns the documented shape', async () => {
  const res = await get('/messages');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ['messages']);
  assert.ok(body.messages.length > 0);
  for (const m of body.messages) {
    assert.deepStrictEqual(Object.keys(m).sort(), ['id', 'senderImage', 'senderName', 'title', 'unread']);
    assert.strictEqual(typeof m.id, 'string');
    assert.strictEqual(typeof m.senderName, 'string');
    assert.strictEqual(typeof m.title, 'string');
    assert.ok(new URL(m.senderImage).href);
    assert.strictEqual(typeof m.unread, 'boolean');
  }
});

test('seed data has both read and unread messages', async () => {
  const { messages } = await (await get('/messages')).json();
  assert.ok(messages.some((m) => m.unread));
  assert.ok(messages.some((m) => !m.unread));
});

test('GET /messages?unread=true returns only unread', async () => {
  const all = (await (await get('/messages')).json()).messages;
  const { messages } = await (await get('/messages?unread=true')).json();
  assert.ok(messages.length > 0);
  assert.ok(messages.every((m) => m.unread === true));
  assert.strictEqual(messages.length, all.filter((m) => m.unread).length);
});

test('other unread values return everything', async () => {
  const all = (await (await get('/messages')).json()).messages;
  for (const q of ['?unread=false', '?unread=1', '?foo=bar']) {
    assert.deepStrictEqual((await (await get('/messages' + q)).json()).messages, all, q);
  }
});

test('read flag reflects the injected store', async () => {
  const store = createStore([
    { id: 'a', senderName: 'A', senderImage: 'https://x.test/a.png', title: 'T', unread: false },
  ]);
  const { messages } = await (await get('/messages', { store })).json();
  assert.deepStrictEqual(messages.map((m) => [m.id, m.unread]), [['a', false]]);
});

test('responses are copies; mutation does not leak into the store', () => {
  const store = createStore();
  store.list()[0].unread = !store.list()[0].unread;
  assert.deepStrictEqual(store.list(), createStore().list());
});

test('unknown path and POST /messages return 404', async () => {
  const res = await get('/other');
  assert.strictEqual(res.status, 404);
  await res.text();
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const r = await fetch(`http://localhost:${server.address().port}/messages`, { method: 'POST' });
    assert.strictEqual(r.status, 404);
    await r.text();
  } finally {
    server.close();
  }
});

async function getRaw(path) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await new Promise((resolve, reject) => {
      require('node:http').get({ port: server.address().port, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  } finally {
    server.close();
  }
}

test('GET /inbox serves the page as HTML', async () => {
  for (const p of ['/inbox', '/inbox/', '/inbox?x=1']) {
    const res = await get(p);
    assert.strictEqual(res.status, 200, p);
    assert.strictEqual(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await res.text(), /<title>Inbox<\/title>/);
  }
});

test('inbox assets are served with correct content types', async () => {
  const css = await get('/inbox/inbox.css');
  assert.strictEqual(css.status, 200);
  assert.strictEqual(css.headers.get('content-type'), 'text/css; charset=utf-8');
  const js = await get('/inbox/inbox.js');
  assert.strictEqual(js.status, 200);
  assert.strictEqual(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await js.text(), /fetch\('\/messages'\)/);
});

test('unknown inbox paths return 404 JSON', async () => {
  for (const p of ['/inbox/missing.js', '/inbox/nope', '/inbox/sub/', '/inboxx']) {
    const res = await get(p);
    assert.strictEqual(res.status, 404, p);
    assert.deepStrictEqual(await res.json(), { error: 'not found' });
  }
});

test('path traversal attempts on /inbox are rejected', async () => {
  const attempts = [
    '/inbox/../server.js',
    '/inbox/%2e%2e/server.js',
    '/inbox/..%2fserver.js',
    '/inbox/%2e%2e%2fpackage.json',
    '/inbox/..%5cserver.js',
    '/inbox/../../etc/passwd',
    '/inbox/%00.js',
    '/inbox/%zz.js',
    '/inbox//etc/passwd',
  ];
  for (const p of attempts) {
    const res = await getRaw(p);
    assert.ok(res.status === 404, `${p} -> ${res.status}`);
    assert.ok(!/require\(|"name"/.test(res.body), `${p} leaked file content`);
  }
});

test('non-GET on /inbox is 404 and /messages still works', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/inbox`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  } finally {
    server.close();
  }
  assert.strictEqual((await get('/messages')).status, 200);
});

test('unreadCount counts only unread messages', () => {
  const { unreadCount } = require('./public/inbox/unread');
  assert.strictEqual(unreadCount([{ unread: true }, { unread: false }, { unread: true }]), 2);
  assert.strictEqual(unreadCount([]), 0);
  assert.strictEqual(unreadCount(undefined), 0);
});

test('badge shows the unread number and is hidden at 0', () => {
  const { badgeState } = require('./public/inbox/unread');
  assert.deepStrictEqual(badgeState([{ unread: true }, { unread: true }, { unread: false }]),
    { hidden: false, text: '2', label: '2 unread' });
  assert.deepStrictEqual(badgeState([{ unread: false }]), { hidden: true, text: '', label: '' });
  assert.deepStrictEqual(badgeState([]), { hidden: true, text: '', label: '' });
});

test('unread.js is served and the page loads it before inbox.js', async () => {
  const js = await get('/inbox/unread.js');
  assert.strictEqual(js.status, 200);
  assert.strictEqual(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const html = await (await get('/inbox')).text();
  assert.ok(html.indexOf('/inbox/unread.js') !== -1 && html.indexOf('/inbox/unread.js') < html.indexOf('/inbox/inbox.js'));
});

test('POST /messages/read-all marks every message read and persists', async () => {
  const server = createServer({ store: createStore() });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    const before = (await (await fetch(`${base}/messages`)).json()).messages;
    const res = await fetch(`${base}/messages/read-all`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.updated, before.filter((m) => m.unread).length);
    assert.ok(body.messages.every((m) => m.unread === false));
    const after = (await (await fetch(`${base}/messages`)).json()).messages;
    assert.strictEqual(after.length, before.length);
    assert.ok(after.every((m) => m.unread === false));
    assert.strictEqual((await (await fetch(`${base}/messages?unread=true`)).json()).messages.length, 0);
    assert.strictEqual((await (await fetch(`${base}/messages/read-all`, { method: 'POST' })).json()).updated, 0);
  } finally {
    server.close();
  }
});

test('read-all rejects wrong methods and paths with 404 JSON', async () => {
  for (const [method, p] of [['GET', '/messages/read-all'], ['PUT', '/messages/read-all'], ['POST', '/messages/read-all/x'], ['POST', '/read-all']]) {
    const res = await get(p, { method });
    assert.strictEqual(res.status, 404, `${method} ${p}`);
    assert.deepStrictEqual(await res.json(), { error: 'not found' });
  }
});

test('store.markAllRead mutates the stored messages', () => {
  const store = createStore();
  assert.ok(store.markAllRead() > 0);
  assert.ok(store.list().every((m) => !m.unread));
  assert.strictEqual(store.markAllRead(), 0);
});

test('mark-all-read button state: disabled at 0 unread, enabled when >0', () => {
  const { markAllReadState } = require('./public/inbox/unread.js');
  assert.strictEqual(markAllReadState([]).disabled, true);
  assert.strictEqual(markAllReadState(undefined).disabled, true);
  assert.strictEqual(markAllReadState('x').disabled, true);
  assert.strictEqual(markAllReadState([{ unread: false }]).disabled, true);
  assert.strictEqual(markAllReadState([{ unread: false }, { unread: true }]).disabled, false);
  assert.strictEqual('hidden' in markAllReadState([]), false);
});

test('GET /messages/<id> returns one message, and 404 for an unknown id', async () => {
  const hit = await get('/messages/m1');
  assert.strictEqual(hit.status, 200);
  assert.strictEqual((await hit.json()).message.id, 'm1');
  const miss = await get('/messages/nope');
  assert.strictEqual(miss.status, 404);
  assert.deepStrictEqual(await miss.json(), { error: 'not found' });
});

test('DELETE /messages/<id> removes the message, 404 for unknown or repeated id', async () => {
  const server = createServer({ store: createStore() });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    const before = (await (await fetch(`${base}/messages`)).json()).messages;
    const del = await fetch(`${base}/messages/m1`, { method: 'DELETE' });
    assert.strictEqual(del.status, 204);
    assert.strictEqual(await del.text(), '');
    const after = (await (await fetch(`${base}/messages`)).json()).messages;
    assert.strictEqual(after.length, before.length - 1);
    assert.ok(!after.some((m) => m.id === 'm1'));
    for (const p of ['/messages/m1', '/messages/nope']) {
      const miss = await fetch(`${base}${p}`, { method: 'DELETE' });
      assert.strictEqual(miss.status, 404, p);
      assert.deepStrictEqual(await miss.json(), { error: 'not found' });
    }
    assert.strictEqual((await fetch(`${base}/messages/m1`)).status, 404);
  } finally {
    server.close();
  }
});

test('removeMessage drops only the deleted id and does not mutate', () => {
  const { removeMessage, unreadCount, badgeState, markAllReadState } = require('./public/inbox/unread.js');
  const msgs = [{ id: 'a', unread: true }, { id: 'b', unread: false }, { id: 'c', unread: true }];
  const after = removeMessage(msgs, 'b');
  assert.deepStrictEqual(after.map((m) => m.id), ['a', 'c']);
  assert.strictEqual(msgs.length, 3);
  assert.deepStrictEqual(removeMessage(msgs, 'zzz').map((m) => m.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(removeMessage(undefined, 'a'), []);
  // deleting a read message keeps the unread count
  assert.strictEqual(unreadCount(after), 2);
  // deleting an unread message lowers it
  assert.strictEqual(unreadCount(removeMessage(msgs, 'a')), 1);
  // deleting the last unread hides the badge and disables mark-all
  const last = removeMessage([{ id: 'a', unread: true }, { id: 'b', unread: false }], 'a');
  assert.strictEqual(badgeState(last).hidden, true);
  assert.strictEqual(markAllReadState(last).disabled, true);
});

// ---- issue #47: search + archive ----
const FIVE = ['id', 'senderImage', 'senderName', 'title', 'unread'];
async function withServer(fn, opts = { store: createStore() }) {
  const server = createServer(opts);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const ids = async (p) => (await (await fetch(base + p)).json()).messages.map((m) => m.id);
  try { await fn(base, ids); } finally { server.close(); }
}

test('?q= searches sender and title case-insensitively; blank q is a no-op', async () => {
  await withServer(async (base, ids) => {
    const all = await ids('/messages');
    assert.deepStrictEqual(await ids('/messages?q=ADA'), ['m1']);
    assert.deepStrictEqual(await ids('/messages?q=moth'), ['m2']);
    assert.deepStrictEqual(await ids('/messages?q=zzzz'), []);
    assert.deepStrictEqual(await ids('/messages?q='), all);
    assert.deepStrictEqual(await ids('/messages?q=%20%20'), all);
    assert.deepStrictEqual(await ids('/messages?q=re%3A'), ['m3']);
    // ANDs with unread=true: m2 matches "moth" but is read
    assert.deepStrictEqual(await ids('/messages?q=moth&unread=true'), []);
    assert.deepStrictEqual(await ids('/messages?q=ada&unread=true'), ['m1']);
  });
});

test('archive hides from default, shows under archived=true/all; unarchive restores', async () => {
  await withServer(async (base, ids) => {
    const all = await ids('/messages');
    const r = await fetch(`${base}/messages/m1/archive`, { method: 'POST' });
    assert.strictEqual(r.status, 200);
    const { message } = await r.json();
    assert.deepStrictEqual(Object.keys(message).sort(), FIVE);
    assert.strictEqual(message.id, 'm1');
    assert.deepStrictEqual(await ids('/messages'), all.filter((i) => i !== 'm1'));
    assert.ok(!(await ids('/messages?unread=true')).includes('m1'));
    assert.deepStrictEqual(await ids('/messages?archived=true'), ['m1']);
    assert.deepStrictEqual(await ids('/messages?archived=all'), all);
    for (const v of ['false', '1', 'x']) assert.deepStrictEqual(await ids('/messages?archived=' + v), all.filter((i) => i !== 'm1'), v);
    assert.deepStrictEqual(await ids('/messages?archived=true&q=ada'), ['m1']);
    assert.deepStrictEqual(await ids('/messages?archived=true&q=grace'), []);
    // idempotent, and still reachable by id
    assert.strictEqual((await fetch(`${base}/messages/m1/archive`, { method: 'POST' })).status, 200);
    assert.strictEqual((await (await fetch(`${base}/messages/m1`)).json()).message.id, 'm1');
    const u = await fetch(`${base}/messages/m1/unarchive`, { method: 'POST' });
    assert.strictEqual(u.status, 200);
    assert.strictEqual((await u.json()).message.id, 'm1');
    assert.strictEqual((await fetch(`${base}/messages/m1/unarchive`, { method: 'POST' })).status, 200);
    assert.deepStrictEqual(await ids('/messages'), all);
    assert.deepStrictEqual(await ids('/messages?archived=true'), []);
  });
});

test('archive endpoints: unknown id and wrong methods are 404 JSON', async () => {
  await withServer(async (base) => {
    for (const [method, p] of [['POST', '/messages/nope/archive'], ['POST', '/messages/nope/unarchive'],
      ['GET', '/messages/m1/archive'], ['DELETE', '/messages/m1/archive'], ['PUT', '/messages/m1/unarchive'],
      ['POST', '/messages/m1/archive/x'], ['POST', '/messages//archive']]) {
      const res = await fetch(base + p, { method });
      assert.strictEqual(res.status, 404, `${method} ${p}`);
      assert.deepStrictEqual(await res.json(), { error: 'not found' });
    }
  });
});

test('archived messages keep the five-field shape in every list; read-all covers them', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/messages/m1/archive`, { method: 'POST' });
    for (const p of ['/messages', '/messages?archived=true', '/messages?archived=all']) {
      for (const m of (await (await fetch(base + p)).json()).messages) assert.deepStrictEqual(Object.keys(m).sort(), FIVE, p);
    }
    const ra = await (await fetch(`${base}/messages/read-all`, { method: 'POST' })).json();
    assert.strictEqual(ra.updated, 2); // m1 (archived) and m3
    assert.ok(!ra.messages.some((m) => m.id === 'm1'));
    const arch = (await (await fetch(`${base}/messages?archived=true`)).json()).messages;
    assert.strictEqual(arch[0].unread, false);
    assert.strictEqual((await fetch(`${base}/messages/m1`, { method: 'DELETE' })).status, 204);
    assert.deepStrictEqual((await (await fetch(`${base}/messages?archived=all`)).json()).messages.map((m) => m.id), ['m2', 'm3', 'm4']);
  });
});

test('store.list archived/q filters and setArchived', () => {
  const store = createStore();
  assert.strictEqual(store.setArchived('nope', true), null);
  assert.strictEqual(store.setArchived('m2', true).id, 'm2');
  assert.deepStrictEqual(store.list().map((m) => m.id), ['m1', 'm3', 'm4']);
  assert.deepStrictEqual(store.list({ archived: true }).map((m) => m.id), ['m2']);
  assert.strictEqual(store.list({ archived: 'all' }).length, 4);
  assert.deepStrictEqual(store.list({ q: 'TURING' }).map((m) => m.id), ['m3']);
  assert.ok(store.list({ archived: 'all' }).every((m) => !('archived' in m)));
  store.setArchived('m2', false);
  assert.strictEqual(store.list().length, 4);
});

test('inbox page has the search box and view toggle, and keeps the default fetch', async () => {
  const html = await (await get('/inbox')).text();
  assert.match(html, /id="search"/);
  assert.match(html, /id="view-inbox"/);
  assert.match(html, /id="view-archive"/);
  const js = await (await get('/inbox/inbox.js')).text();
  assert.ok(js.includes("fetch('/messages')"));
  assert.match(js, /No matches/);
});

test('listQuery is empty for the plain inbox and encodes search/archive', () => {
  const { listQuery } = require('./public/inbox/unread.js');
  assert.strictEqual(listQuery('', false), '');
  assert.strictEqual(listQuery('   ', false), '');
  assert.strictEqual(listQuery(undefined, undefined), '');
  assert.strictEqual(listQuery(' a&b ', false), 'q=a%26b');
  assert.strictEqual(listQuery('', true), 'archived=true');
  assert.strictEqual(listQuery('x', true), 'q=x&archived=true');
});

// ---- issue #47 review follow-ups ----
test('archived=bogus and archived=false behave as the default', async () => {
  await withServer(async (base, ids) => {
    await fetch(`${base}/messages/m1/archive`, { method: 'POST' });
    const def = await ids('/messages');
    assert.ok(!def.includes('m1'));
    for (const v of ['bogus', 'false', '']) assert.deepStrictEqual(await ids('/messages?archived=' + v), def, v);
  });
});

test('deleting an archived message removes it everywhere', async () => {
  await withServer(async (base, ids) => {
    await fetch(`${base}/messages/m1/archive`, { method: 'POST' });
    assert.strictEqual((await fetch(`${base}/messages/m1`, { method: 'DELETE' })).status, 204);
    assert.deepStrictEqual(await ids('/messages?archived=true'), []);
    assert.ok(!(await ids('/messages?archived=all')).includes('m1'));
    assert.strictEqual((await fetch(`${base}/messages/m1`)).status, 404);
  });
});

test('q combined with archived=true and archived=all', async () => {
  await withServer(async (base, ids) => {
    await fetch(`${base}/messages/m1/archive`, { method: 'POST' });
    await fetch(`${base}/messages/m3/archive`, { method: 'POST' });
    assert.deepStrictEqual(await ids('/messages?archived=true&q=turing'), ['m3']);
    assert.deepStrictEqual(await ids('/messages?archived=true&q=grace'), []);
    assert.deepStrictEqual(await ids('/messages?q=turing'), []);
    assert.deepStrictEqual(await ids('/messages?archived=all&q=a'), ['m1', 'm2', 'm3', 'm4']);
    assert.deepStrictEqual(await ids('/messages?archived=true&q=ada&unread=true'), ['m1']);
  });
});

test('q with URL-special characters (&, %, +) matches end to end', async () => {
  const mk = (id, title) => ({ id, senderName: 'S', senderImage: 'https://x.test/a.png', title, unread: false });
  const store = createStore([mk('a', 'R&D 100% plan'), mk('b', 'a+b=c'), mk('c', 'plain title')]);
  await withServer(async (base, ids) => {
    assert.deepStrictEqual(await ids('/messages?q=' + encodeURIComponent('R&D')), ['a']);
    assert.deepStrictEqual(await ids('/messages?q=' + encodeURIComponent('100%')), ['a']);
    assert.deepStrictEqual(await ids('/messages?q=' + encodeURIComponent('a+b')), ['b']);
    // a raw "+" in a query string decodes to a space, so it matches nothing here
    assert.deepStrictEqual(await ids('/messages?q=a+b'), []);
    assert.deepStrictEqual(await ids('/messages?q=' + encodeURIComponent('50%')), []);
  }, { store });
});
