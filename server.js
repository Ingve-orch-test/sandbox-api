const http = require('node:http');

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

// Returns ISO 8601 local time with numeric offset, or null if tz is invalid.
function isoInZone(date, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
  } catch (e) {
    return null;
  }
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offMin < 0 ? '-' : '+';
  const abs = Math.abs(offMin);
  return `${pad(p.year, 4)}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function handleTime(query, res) {
  const now = new Date();
  const epoch = Math.floor(now.getTime() / 1000);
  const tz = new URLSearchParams(query).get('tz');
  let iso;
  if (tz === null) {
    iso = new Date(epoch * 1000).toISOString().replace('.000Z', 'Z');
  } else {
    iso = isoInZone(now, tz);
    if (iso === null) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `invalid time zone: ${tz}` }));
      return;
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ iso, epoch }));
}

function createServer() {
  return http.createServer((req, res) => {
    const target = String(req.url);
    const q = target.indexOf('?');
    const path = q === -1 ? target : target.slice(0, q);
    if (req.method === 'GET' && path === '/time') {
      handleTime(q === -1 ? '' : target.slice(q + 1), res);
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

module.exports = { createServer, isoInZone };
