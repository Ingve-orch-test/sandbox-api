const http = require('node:http');
const { createStore } = require('./store');

function createServer({ store = createStore() } = {}) {
  return http.createServer((req, res) => {
    const target = String(req.url);
    const q = target.indexOf('?');
    const path = q === -1 ? target : target.slice(0, q);
    const query = q === -1 ? '' : target.slice(q + 1);
    if (req.method === 'GET' && path === '/messages') {
      const unreadOnly = new URLSearchParams(query).get('unread') === 'true';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: store.list({ unreadOnly }) }));
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
