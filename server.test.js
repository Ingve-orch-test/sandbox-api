const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('./server');

async function get(path, clock, options) {
  const server = createServer(clock);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fetch(`http://localhost:${server.address().port}${path}`, options);
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

test('GET /uptime is 0 right after start, as JSON', async () => {
  const res = await get('/uptime', () => 5000);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.deepStrictEqual(await res.json(), { uptime: 0 });
});

test('GET /uptime reports whole seconds, rounded down', async () => {
  let now = 1000;
  const server = createServer(() => now);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}/uptime`;
  try {
    now += 1900;
    assert.deepStrictEqual(await (await fetch(url)).json(), { uptime: 1 });
    now += 40100;
    assert.deepStrictEqual(await (await fetch(url)).json(), { uptime: 42 });
  } finally {
    server.close();
  }
});

test('GET /uptime?x=1 returns 200', async () => {
  const res = await get('/uptime?x=1');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(typeof (await res.json()).uptime, 'number');
});

test('POST /uptime returns 404', async () => {
  const res = await get('/uptime', undefined, { method: 'POST' });
  assert.strictEqual(res.status, 404);
  await res.text();
});
