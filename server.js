/**
 * 일정 조율 앱 - 서버
 * 실행: node server.js
 * 접속: http://localhost:3000
 *
 * 관리자 비밀번호 변경: ADMIN_PW 상수를 수정하세요
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── 데이터 유틸 ─────────────────────────────── */

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return defaultData();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return defaultData(); }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ── SSE: 실시간 변경사항 전송 ────────────────── */
const clients = new Set();

function broadcast() {
  const data = JSON.stringify(loadData());
  for (const res of clients) {
    try { res.write(`data: ${data}\n\n`); }
    catch {}
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // 첫 연결 시 현재 데이터 즉시 전송
  res.write(`data: ${JSON.stringify(loadData())}\n\n`);
  clients.add(res);

  req.on('close', () => clients.delete(res));
});

/* ── REST API ────────────────────────────────── */

// 전체 데이터 조회
app.get('/api/data', (req, res) => res.json(loadData()));

// 관리자 인증
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PW) res.json({ ok: true });
  else res.status(401).json({ ok: false, message: '비밀번호가 틀렸어요' });
});

/* 세트 CRUD */
app.post('/api/sets', (req, res) => {
  const data = loadData();
  const set  = { id: uid(), name: req.body.name, color: req.body.color, events: [] };
  data.sets.push(set);
  saveData(data);
  broadcast();
  res.json(set);
});

app.delete('/api/sets/:id', (req, res) => {
  const data = loadData();
  data.sets   = data.sets.filter(s => s.id !== req.params.id);
  saveData(data);
  broadcast();
  res.json({ ok: true });
});

/* 이벤트 CRUD */
app.post('/api/sets/:id/events', (req, res) => {
  const data = loadData();
  const set  = data.sets.find(s => s.id === req.params.id);
  if (!set) return res.status(404).json({ error: '세트를 찾을 수 없어요' });
  const event = { id: uid(), date: req.body.date, title: req.body.title, desc: req.body.desc || '' };
  set.events.push(event);
  saveData(data);
  broadcast();
  res.json(event);
});

app.delete('/api/sets/:sid/events/:eid', (req, res) => {
  const data = loadData();
  const set  = data.sets.find(s => s.id === req.params.sid);
  if (!set) return res.status(404).json({ error: '세트를 찾을 수 없어요' });
  set.events = set.events.filter(e => e.id !== req.params.eid);
  saveData(data);
  broadcast();
  res.json({ ok: true });
});

/* 가용성 CRUD */
app.post('/api/avail/:date', (req, res) => {
  const data = loadData();
  const { date } = req.params;
  const { name, status } = req.body;
  if (!data.avail[date]) data.avail[date] = [];
  data.avail[date] = data.avail[date].filter(a => a.name !== name);
  data.avail[date].push({ name, status, time: Date.now() });
  saveData(data);
  broadcast();
  res.json({ ok: true });
});

app.delete('/api/avail/:date/:name', (req, res) => {
  const data = loadData();
  const { date, name } = req.params;
  if (data.avail[date]) {
    data.avail[date] = data.avail[date].filter(a => a.name !== decodeURIComponent(name));
    saveData(data);
    broadcast();
  }
  res.json({ ok: true });
});

/* ── 서버 시작 ────────────────────────────────── */
app.listen(PORT, () => {
  console.log('\n✅ 일정 조율 앱 서버 실행 중');
  console.log(`   📅 주소: http://localhost:${PORT}`);
  console.log('\n   같은 네트워크의 다른 기기에서 접속하려면:');
  console.log(`   http://[이 컴퓨터의 IP]:${PORT}\n`);
});
