const http = require('node:http');

// clock returns monotonic milliseconds; the default is immune to wall-clock changes.
function createServer(clock = () => performance.now()) {
  const start = clock();
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && req.url.split('?')[0] === '/uptime') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ uptime: Math.max(0, Math.floor((clock() - start) / 1000)) }));
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
