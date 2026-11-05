const test = require('node:test');
const assert = require('node:assert');

test('TEMP: deliberately failing test to verify CI fails', () => {
  assert.strictEqual(false, true);
});
