const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── 유틸 ── */
const CHARS   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const genCode = () => Array.from({length:6}, () => CHARS[Math.floor(Math.random()*CHARS.length)]).join('');
const uid     = () => crypto.randomBytes(5).toString('hex');

/* ── 데이터 ── */
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return { rooms: {} };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { rooms: {} }; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

/* ── SSE (방별 실시간) ── */
const clients = new Map(); // code → Set<res>

function broadcast(code) {
  const room = loadData().rooms[code];
  if (!room || !clients.has(code)) return;
  const msg = `data: ${JSON.stringify(room)}\n\n`;
  for (const res of clients.get(code)) { try { res.write(msg); } catch {} }
}

app.get('/api/events/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const room = loadData().rooms[code];
  if (room) res.write(`data: ${JSON.stringify(room)}\n\n`);

  if (!clients.has(code)) clients.set(code, new Set());
  clients.get(code).add(res);
  req.on('close', () => clients.get(code)?.delete(res));
});

/* ── 방 ── */
app.get('/api/rooms/:code', (req, res) => {
  const room = loadData().rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: '존재하지 않는 방이에요' });
  res.json(room);
});

app.post('/api/rooms', (req, res) => {
  const data = loadData();
  let code;
  do { code = genCode(); } while (data.rooms[code]);
  data.rooms[code] = { code, name: req.body.name || '새 방', createdAt: Date.now(), sets: [], avail: {} };
  saveData(data);
  res.json({ code, name: data.rooms[code].name });
});

/* ── 세트 ── */
app.post('/api/rooms/:code/sets', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  if (!data.rooms[code]) return res.status(404).json({ error: '방 없음' });
  const set = { id: uid(), name: req.body.name, color: req.body.color, events: [] };
  data.rooms[code].sets.push(set);
  saveData(data); broadcast(code);
  res.json(set);
});

app.delete('/api/rooms/:code/sets/:id', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  if (!data.rooms[code]) return res.status(404).json({ error: '방 없음' });
  data.rooms[code].sets = data.rooms[code].sets.filter(s => s.id !== req.params.id);
  saveData(data); broadcast(code);
  res.json({ ok: true });
});

/* ── 이벤트 ── */
app.post('/api/rooms/:code/sets/:sid/events', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  const set  = data.rooms[code]?.sets.find(s => s.id === req.params.sid);
  if (!set) return res.status(404).json({ error: '세트 없음' });
  const ev = { id: uid(), date: req.body.date, title: req.body.title, desc: req.body.desc || '' };
  set.events.push(ev);
  saveData(data); broadcast(code);
  res.json(ev);
});

app.delete('/api/rooms/:code/sets/:sid/events/:eid', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  const set  = data.rooms[code]?.sets.find(s => s.id === req.params.sid);
  if (set) { set.events = set.events.filter(e => e.id !== req.params.eid); saveData(data); broadcast(code); }
  res.json({ ok: true });
});

/* ── 가용성 ── */
app.post('/api/rooms/:code/avail/:date', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  const room = data.rooms[code];
  if (!room) return res.status(404).json({ error: '방 없음' });
  const { name, status } = req.body;
  if (!room.avail[req.params.date]) room.avail[req.params.date] = [];
  room.avail[req.params.date] = room.avail[req.params.date].filter(a => a.name !== name);
  room.avail[req.params.date].push({ name, status, time: Date.now() });
  saveData(data); broadcast(code);
  res.json({ ok: true });
});

app.delete('/api/rooms/:code/avail/:date/:name', (req, res) => {
  const code = req.params.code.toUpperCase();
  const data = loadData();
  const room = data.rooms[code];
  const date = req.params.date;
  const name = decodeURIComponent(req.params.name);
  if (room?.avail[date]) {
    room.avail[date] = room.avail[date].filter(a => a.name !== name);
    saveData(data); broadcast(code);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n✅ 일정 조율 앱 실행 중 → http://localhost:${PORT}\n`);
});
