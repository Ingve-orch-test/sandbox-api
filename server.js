const http = require('node:http');
const fs = require('node:fs');
const nodePath = require('node:path');
const { createStore } = require('./store');

const PUBLIC_DIR = nodePath.join(__dirname, 'public', 'inbox');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

// Serves GET /inbox and GET /inbox/<file> from public/inbox. Anything that
// resolves outside that directory, or is not a known file type, is a 404.
// Returns false when the path is not an inbox path.
function serveInbox(path, res) {
  let rel;
  if (path === '/inbox' || path === '/inbox/') {
    rel = 'index.html';
  } else if (path.startsWith('/inbox/')) {
    try {
      rel = decodeURIComponent(path.slice('/inbox/'.length));
    } catch {
      notFound(res);
      return true;
    }
  } else {
    return false;
  }
  const type = TYPES[nodePath.extname(rel)];
  const file = nodePath.resolve(PUBLIC_DIR, rel);
  if (!type || rel.includes('\0') || !file.startsWith(PUBLIC_DIR + nodePath.sep)) {
    notFound(res);
    return true;
  }
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
  return true;
}

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
    // POST /messages/read-all -> 200 { updated: <number newly marked read>, messages: [...] }
    if (req.method === 'POST' && path === '/messages/read-all') {
      const updated = store.markAllRead();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ updated, messages: store.list() }));
      return;
    }
    // GET /messages/<id> -> 200 { message }, 404 if unknown
    if (req.method === 'GET' && path.startsWith('/messages/') && path !== '/messages/read-all') {
      const id = path.slice('/messages/'.length);
      const message = store.list().find((m) => m.id === id);
      if (!message) {
        notFound(res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message }));
      return;
    }
    if (req.method === 'GET' && serveInbox(path, res)) return;
    notFound(res);
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`listening on ${port}`));
}

module.exports = { createServer };
