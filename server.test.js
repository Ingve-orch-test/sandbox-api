const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('./server');

async function get(path) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fetch(`http://localhost:${server.address().port}${path}`);
  } finally {
    server.close();
  }
}

test('GET /health returns 200 and {"status":"ok"}', async () => {
  const res = await get('/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'ok' });
});

test('GET /health?x=1 returns 200 and {"status":"ok"}', async () => {
  const res = await get('/health?x=1');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'ok' });
});

test('GET /other returns 404', async () => {
  const res = await get('/other');
  assert.strictEqual(res.status, 404);
  await res.text();
});

test('GET // returns 404 and the server keeps serving /health', async () => {
  const http = require('node:http');
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const raw = (path) =>
    new Promise((resolve, reject) => {
      http.get({ host: 'localhost', port, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
  try {
    assert.strictEqual((await raw('//')).status, 404);
    const health = await raw('/health');
    assert.strictEqual(health.status, 200);
    assert.deepStrictEqual(JSON.parse(health.body), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('GET /messages returns the documented shape', async () => {
  const res = await get('/messages');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  const body = await res.json();
  assert.deepStrictEqual(Object.keys(body), ['messages']);
  assert.ok(body.messages.length > 0);
  for (const m of body.messages) {
    assert.deepStrictEqual(Object.keys(m).sort(), ['id', 'preview', 'senderName', 'timestamp', 'unread']);
    assert.strictEqual(typeof m.id, 'string');
    assert.ok(m.senderName === null || typeof m.senderName === 'string');
    assert.strictEqual(typeof m.preview, 'string');
    assert.strictEqual(new Date(m.timestamp).toISOString(), m.timestamp);
    assert.strictEqual(typeof m.unread, 'boolean');
  }
  assert.ok(body.messages.some((m) => m.unread));
  assert.ok(body.messages.some((m) => !m.unread));
  assert.ok(body.messages.some((m) => m.senderName === null));
});

test('GET /messages is sorted newest first', async () => {
  const { messages } = await (await get('/messages')).json();
  const times = messages.map((m) => Date.parse(m.timestamp));
  assert.deepStrictEqual(times, [...times].sort((a, b) => b - a));
  assert.deepStrictEqual(messages.map((m) => m.id), ['m1', 'm2', 'm3', 'm4']);
});

test('GET /messages?unread=true returns only unread', async () => {
  const { messages } = await (await get('/messages?unread=true')).json();
  assert.ok(messages.length > 0);
  assert.ok(messages.every((m) => m.unread === true));
  const all = (await (await get('/messages')).json()).messages;
  assert.strictEqual(messages.length, all.filter((m) => m.unread).length);
});

test('unread=false, other values and unknown params return everything', async () => {
  const all = (await (await get('/messages')).json()).messages;
  for (const q of ['?unread=false', '?unread=1', '?unread=', '?foo=bar', '?foo=bar&unread=TRUE', '?unread=%', '?unread=%E0%A4%A']) {
    const { messages } = await (await get('/messages' + q)).json();
    assert.deepStrictEqual(messages, all, q);
  }
});

test('query strings do not break the /messages path match', async () => {
  const res = await get('/messages?x=1');
  assert.strictEqual(res.status, 200);
  await res.json();
  const other = await get('/messagesx?unread=true');
  assert.strictEqual(other.status, 404);
  await other.text();
});

test('GET /ping returns 200, exact body pong and text/plain content type', async () => {
  const res = await get('/ping');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.strictEqual(await res.text(), 'pong');
});

test('GET /ping?x=1 returns 200 and pong', async () => {
  const res = await get('/ping?x=1');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), 'pong');
});

test('POST /ping returns 404', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/ping`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
    await res.text();
  } finally {
    server.close();
  }
});
