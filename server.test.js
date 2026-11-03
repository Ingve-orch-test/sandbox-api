const { test } = require('node:test');
const assert = require('node:assert');
const { createServer, isoInZone } = require('./server');

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

const JSON_CT = /application\/json/;

test('GET /time defaults to UTC with iso ending in Z and whole-second epoch', async () => {
  const res = await get('/time');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), JSON_CT);
  const body = await res.json();
  assert.match(body.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(Number.isInteger(body.epoch));
  assert.strictEqual(Date.parse(body.iso) / 1000, body.epoch);
});

test('isoInZone gives the right offsets (winter, summer, half-hour)', () => {
  const winter = new Date('2026-11-03T09:41:00Z');
  const summer = new Date('2026-07-03T09:41:00Z');
  assert.strictEqual(isoInZone(winter, 'Europe/Oslo'), '2026-11-03T10:41:00+01:00');
  assert.strictEqual(isoInZone(summer, 'Europe/Oslo'), '2026-07-03T11:41:00+02:00');
  assert.strictEqual(isoInZone(winter, 'Asia/Kolkata'), '2026-11-03T15:11:00+05:30');
  assert.strictEqual(isoInZone(winter, 'America/New_York'), '2026-11-03T04:41:00-05:00');
  assert.strictEqual(isoInZone(winter, 'Nope/Zone'), null);
});

test('GET /time?tz=Europe/Oslo gives local time with +01:00 or +02:00', async () => {
  const res = await get('/time?tz=Europe/Oslo');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.match(body.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/);
  assert.strictEqual(Date.parse(body.iso) / 1000, body.epoch);
});

test('GET /time?tz=Asia/Kolkata has +05:30 offset', async () => {
  const res = await get('/time?tz=Asia/Kolkata');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.match(body.iso, /\+05:30$/);
  assert.strictEqual(Date.parse(body.iso) / 1000, body.epoch);
});

test('GET /time?tz=Nope/Zone returns 400 JSON error', async () => {
  const res = await get('/time?tz=Nope/Zone');
  assert.strictEqual(res.status, 400);
  assert.match(res.headers.get('content-type'), JSON_CT);
  assert.strictEqual(typeof (await res.json()).error, 'string');
});

test('GET /time?tz= (empty) returns 400 JSON error', async () => {
  const res = await get('/time?tz=');
  assert.strictEqual(res.status, 400);
  assert.match(res.headers.get('content-type'), JSON_CT);
  assert.strictEqual(typeof (await res.json()).error, 'string');
});

test('GET /time ignores other query parameters', async () => {
  const res = await get('/time?foo=bar');
  assert.strictEqual(res.status, 200);
  assert.ok('iso' in (await res.json()));
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
