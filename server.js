const http = require('node:http');

const MESSAGES = [
  { id: 'm3', senderName: 'Grace Hopper', preview: 'Found the bug, it was a moth.', timestamp: '2026-11-02T17:30:00.000Z', unread: false },
  { id: 'm1', senderName: 'Ada Lovelace', preview: 'The engine is ready for review.', timestamp: '2026-11-03T09:41:00.000Z', unread: true },
  { id: 'm4', senderName: null, preview: 'Weekly digest: 3 new items.', timestamp: '2026-11-01T06:00:00.000Z', unread: false },
  { id: 'm2', senderName: null, preview: 'Your verification code is 123456.', timestamp: '2026-11-03T08:15:00.000Z', unread: true },
];

function listMessages(query) {
  const unreadOnly = new URLSearchParams(query).get('unread') === 'true';
  return MESSAGES.filter((m) => !unreadOnly || m.unread)
    .map((m) => ({ ...m }))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
}

function createServer() {
  return http.createServer((req, res) => {
    const target = String(req.url);
    const q = target.indexOf('?');
    const path = q === -1 ? target : target.slice(0, q);
    const query = q === -1 ? '' : target.slice(q + 1);
    if (req.method === 'GET' && path === '/messages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: listMessages(query) }));
      return;
    }
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.method === 'GET' && path === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('pong');
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
