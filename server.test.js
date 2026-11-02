const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('./server');

test('GET /health returns 200 and {"status":"ok"}', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/health`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});
