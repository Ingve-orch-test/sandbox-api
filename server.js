const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function readVersion(file) {
  try {
    const { version } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof version !== 'string' || version === '') {
      return { error: 'version not found in package.json' };
    }
    return { version };
  } catch (err) {
    return { error: `cannot read package.json: ${err.message}` };
  }
}

function createServer({ packageFile = path.join(__dirname, 'package.json') } = {}) {
  const info = readVersion(packageFile);
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/version') {
      res.writeHead('error' in info ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
      return;
    }
    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`listening on ${port}`));
}

module.exports = { createServer };
