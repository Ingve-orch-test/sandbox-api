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
