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

test('GET /version returns package.json version as JSON', async () => {
  const res = await get('/version');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.deepStrictEqual(await res.json(), { version: require('./package.json').version });
});

test('GET /version?x=1 returns the version', async () => {
  const res = await get('/version?x=1');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { version: require('./package.json').version });
});

test('POST /version returns 404', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/version`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
    await res.text();
  } finally {
    server.close();
  }
});

test('GET /version returns 500 when package.json is unreadable or has no version', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-'));
  const noVersion = path.join(dir, 'package.json');
  fs.writeFileSync(noVersion, '{"name":"x"}');
  try {
    for (const packageFile of [path.join(dir, 'missing.json'), noVersion]) {
      const server = createServer({ packageFile });
      await new Promise((resolve) => server.listen(0, resolve));
      try {
        const res = await fetch(`http://localhost:${server.address().port}/version`);
        assert.strictEqual(res.status, 500);
        assert.match(res.headers.get('content-type'), /^application\/json/);
        assert.strictEqual(typeof (await res.json()).error, 'string');
      } finally {
        server.close();
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
