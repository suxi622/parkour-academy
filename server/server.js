#!/usr/bin/env node
/*!
 * 汤姆猫跑酷学堂 · 实时积分榜单后端
 *
 * 零依赖（只用 Node 内置模块），一个进程同时做两件事：
 *   1) 静态托管前端（index.html / app.js / …）
 *   2) 提供真实的多端实时榜单：REST + SSE 推送
 *
 * 启动：
 *   node server/server.js --port 4173
 * 可选参数：
 *   --port 4173          监听端口（默认 4173，环境变量 PORT 亦可）
 *   --root ../           静态资源目录（默认项目根目录）
 *   --data ./data.json   数据落盘文件（默认 server/data.json）
 *   --bots 3             演示机器人数量（默认 0；真实班级请保持 0）
 *   --admin TOKEN        设置管理令牌，用于 /api/admin/reset
 *
 * 接口：
 *   GET  /api/health                         健康检查
 *   POST /api/join                           {name,emoji,klass,participantId?,token?,seed?}
 *   POST /api/profile                        修改昵称/头像/班级
 *   POST /api/answer                         {participantId,token,correct,subject,bonus?}
 *   GET  /api/leaderboard?range=&subject=    榜单快照
 *   GET  /api/stream?participantId=          SSE 实时推送
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ============================================================
 * 参数
 * ============================================================ */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) === '--') {
      const key = a.slice(2);
      const val = argv[i + 1] && argv[i + 1].slice(0, 2) !== '--' ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PORT = Number(args.port || process.env.PORT || 4173);
const HOST = args.host || process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(args.root || path.join(__dirname, '..'));
// 数据文件默认放在站点根目录之外，避免被静态托管暴露（参与者令牌落在这里）
const DATA_FILE = path.resolve(args.data || path.join(ROOT, '..', '.pk-data', 'data.json'));
const BOTS = Math.max(0, Number(args.bots !== undefined ? args.bots : (process.env.BOTS || 0)));
const ADMIN_TOKEN = args.admin || process.env.ADMIN_TOKEN || '';
const MAX_PARTICIPANTS = 500;

/* ============================================================
 * 状态
 * ============================================================ */
const state = {
  participants: new Map(),   // id -> participant
  classes: new Map(),        // id -> class（每个班级的数据互相隔离）
  events: [],                // 最近的得分动态（带 classId）
  dayKey: dayKeyOf(new Date()),
  weekKey: weekKeyOf(new Date())
};

function dayKeyOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function weekKeyOf(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function blankPoints() { return { today: 0, week: 0, total: 0 }; }

function newToken() { return crypto.randomBytes(16).toString('hex'); }
function newId() { return 'p_' + crypto.randomBytes(6).toString('hex'); }
function newClassId() { return 'c_' + crypto.randomBytes(5).toString('hex'); }

// 班级码：去掉容易混淆的 0/O/1/I，6 位
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(len) {
  let out = '';
  const bytes = crypto.randomBytes(len || 6);
  for (let i = 0; i < (len || 6); i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function findClassByCode(code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) return null;
  for (const cls of state.classes.values()) {
    if (cls.code === target) return cls;
  }
  return null;
}

/** 班级里的学生（不含机器人） */
function classParticipants(classId) {
  return Array.from(state.participants.values()).filter(function (p) { return p.classId === classId; });
}

/** 姓名归一化，用于同班重名判定 */
function normalizeName(name) {
  return String(name || '').replace(/\s/g, '').toLowerCase();
}

function createClass(name, teacherToken) {
  let code;
  do { code = newCode(6); } while (findClassByCode(code));
  const cls = {
    id: newClassId(),
    name: String(name || '未命名班级').slice(0, 24),
    code: code,
    teacherToken: teacherToken || newToken(),
    createdAt: Date.now()
  };
  state.classes.set(cls.id, cls);
  return cls;
}

/** 跨天/跨周自动滚动积分 */
function rollover() {
  const today = dayKeyOf(new Date());
  const week = weekKeyOf(new Date());
  if (today !== state.dayKey) {
    state.dayKey = today;
    state.participants.forEach(function (p) { p.points.today = 0; });
  }
  if (week !== state.weekKey) {
    state.weekKey = week;
    state.participants.forEach(function (p) { p.points.week = 0; });
  }
}

function createParticipant(profile) {
  const p = {
    id: newId(),
    token: newToken(),
    pin: String(profile.pin || '').slice(0, 6) || String(Math.floor(1000 + Math.random() * 9000)),
    classId: profile.classId || '',
    name: String(profile.name || '同学').slice(0, 16),
    emoji: String(profile.emoji || '🐱').slice(0, 4),
    klass: String(profile.klass || '').slice(0, 24),
    school: String(profile.school || '').slice(0, 40),
    gradeKey: String(profile.gradeKey || '').slice(0, 12),
    gradeLabel: String(profile.gradeLabel || '').slice(0, 16),
    isBot: false,
    points: blankPoints(),
    subjectPoints: {},
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    lastGain: 0,
    lastPostAt: 0
  };
  if (!p.klass) {
    const cls = state.classes.get(p.classId);
    p.klass = cls ? cls.name : '未分班';
  }
  state.participants.set(p.id, p);
  return p;
}

function award(p, gain, subjectKey, label, silent) {
  gain = Math.max(0, Math.round(gain));
  if (!gain) return 0;
  rollover();
  p.points.today += gain;
  p.points.week += gain;
  p.points.total += gain;
  p.lastGain = gain;
  p.lastSeen = Date.now();
  if (subjectKey) p.subjectPoints[subjectKey] = (p.subjectPoints[subjectKey] || 0) + gain;
  if (!silent) {
    state.events.unshift({
      id: p.id + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36),
      participantId: p.id,
      classId: p.classId || '',
      name: p.name,
      emoji: p.emoji,
      klass: p.klass,
      subjectKey: subjectKey || 'math',
      subject: subjectName(subjectKey),
      label: label || '答对题目',
      gain: gain,
      at: Date.now()
    });
    if (state.events.length > 60) state.events.length = 60;
  }
  return gain;
}

const SUBJECT_NAMES = {
  math: '数学', chinese: '语文', english: '英语', physics: '物理', chemistry: '化学',
  biology: '生物', politics: '政治', history: '历史', geography: '地理'
};
function subjectName(key) { return SUBJECT_NAMES[key] || key || '综合'; }

/* ============================================================
 * 落盘
 * ============================================================ */
let saveTimer = null;

function serialize() {
  return {
    savedAt: Date.now(),
    dayKey: state.dayKey,
    weekKey: state.weekKey,
    events: state.events.slice(0, 60),
    classes: Array.from(state.classes.values()),
    participants: Array.from(state.participants.values()).map(function (p) {
      return {
        id: p.id, token: p.token, pin: p.pin, classId: p.classId,
        name: p.name, emoji: p.emoji, klass: p.klass,
        points: p.points, subjectPoints: p.subjectPoints, streak: p.streak, bestStreak: p.bestStreak,
        correct: p.correct, answered: p.answered, createdAt: p.createdAt, lastSeen: p.lastSeen
      };
    })
  };
}

function saveNow() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(serialize(), null, 2));
  } catch (e) {
    console.error('[warn] 数据落盘失败：', e.message);
  }
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, 3000);
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state.dayKey = raw.dayKey || state.dayKey;
    state.weekKey = raw.weekKey || state.weekKey;
    state.events = Array.isArray(raw.events) ? raw.events : [];
    (raw.classes || []).forEach(function (c) {
      if (c && c.id) state.classes.set(c.id, c);
    });
    (raw.participants || []).forEach(function (p) {
      state.participants.set(p.id, {
        id: p.id, token: p.token, pin: p.pin || '', classId: p.classId || '',
        name: p.name, emoji: p.emoji, klass: p.klass,
        school: p.school || '', gradeKey: p.gradeKey || '', gradeLabel: p.gradeLabel || '',
        isBot: false,
        points: Object.assign(blankPoints(), p.points || {}),
        subjectPoints: p.subjectPoints || {},
        streak: p.streak || 0, bestStreak: p.bestStreak || 0,
        correct: p.correct || 0, answered: p.answered || 0,
        createdAt: p.createdAt || Date.now(), lastSeen: p.lastSeen || Date.now(),
        lastGain: 0, lastPostAt: 0
      });
    });
    rollover();
    console.log('[info] 已加载历史数据：' + state.classes.size + ' 个班级 / ' + state.participants.size + ' 位参与者');
  } catch (e) {
    console.error('[warn] 读取数据文件失败：', e.message);
  }
}

/* ============================================================
 * 快照 & 广播
 * ============================================================ */
function publicEntry(p) {
  return {
    id: p.id,
    classId: p.classId || '',
    name: p.name,
    emoji: p.emoji,
    klass: p.klass,
    school: p.school || '',
    gradeKey: p.gradeKey || '',
    gradeLabel: p.gradeLabel || '',
    isBot: !!p.isBot,
    points: { today: p.points.today, week: p.points.week, total: p.points.total },
    subjectPoints: p.subjectPoints,
    streak: p.streak,
    correct: p.correct,
    answered: p.answered,
    online: Date.now() - p.lastSeen < 90000
  };
}

function snapshot(range, subject, classId) {
  rollover();
  const all = Array.from(state.participants.values());
  const scoped = classId ? all.filter(function (p) { return p.classId === classId; }) : all;
  const entries = scoped.map(publicEntry);
  const at = Date.now();
  return {
    ok: true,
    at: at,
    range: range || 'today',
    subject: subject || 'all',
    classId: classId || '',
    online: entries.filter(function (e) { return e.online && !e.isBot; }).length,
    totalParticipants: entries.length,
    entries: entries,
    events: state.events.filter(function (ev) { return !classId || ev.classId === classId; }).slice(0, 20).map(function (ev) {
      return {
        id: ev.id, participantId: ev.participantId, name: ev.name, emoji: ev.emoji,
        subject: ev.subject, subjectKey: ev.subjectKey, gain: ev.gain, label: ev.label, at: ev.at
      };
    })
  };
}

const sseClients = new Set();

function broadcast() {
  if (!sseClients.size) return;
  const cache = {};
  sseClients.forEach(function (client) {
    try {
      const key = client.classId || '__all__';
      if (!cache[key]) cache[key] = JSON.stringify(snapshot('today', 'all', client.classId));
      client.res.write('event: leaderboard\ndata: ' + cache[key] + '\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

let broadcastTimer = null;
function broadcastSoon() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(function () { broadcastTimer = null; broadcast(); }, 120);
}

/* ============================================================
 * HTTP 工具
 * ============================================================ */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > (limit || 64 * 1024)) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 只对外暴露前端资源：屏蔽 server 目录、数据文件与任何隐藏文件
  const blocked = /^\/(server|\.pk-data|\.git)(\/|$)/i.test(rel) || /(^|\/)\.[^/]/.test(rel);
  if (blocked) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const target = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (target.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(target, function (err, stat) {
    if (err || !stat.isFile()) {
      // 前端是 hash 路由，未命中的路径统一回首页
      const fallback = path.join(ROOT, 'index.html');
      fs.readFile(fallback, function (e2, buf) {
        if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    fs.readFile(target, function (e3, buf) {
      if (e3) { res.writeHead(500); res.end('read error'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60'
      });
      res.end(buf);
    });
  });
}

/* ============================================================
 * API 处理
 * ============================================================ */
function findParticipant(id, token) {
  const p = state.participants.get(String(id || ''));
  if (!p) return null;
  if (token && p.token !== token) return null;
  return p;
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token'
    });
    res.end();
    return true;
  }

  if (route === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'parkour-academy-leaderboard',
      version: 2,
      now: Date.now(),
      classes: state.classes.size,
      participants: state.participants.size,
      online: Array.from(state.participants.values()).filter(function (p) { return Date.now() - p.lastSeen < 90000; }).length,
      bots: Array.from(state.participants.values()).filter(function (p) { return p.isBot; }).length,
      day: state.dayKey
    });
    return true;
  }

  /* ---------- 登录 / 会话 ---------- */
  if (route === '/api/join' && req.method === 'POST') {
    // 前端自适应层使用的无班级会话入口：有会话则恢复，没有则新建
    const body = await readBody(req);
    let p = findParticipant(body.participantId, body.token);
    if (p) {
      if (body.name) p.name = String(body.name).slice(0, 16);
      if (body.emoji) p.emoji = String(body.emoji).slice(0, 4);
      if (body.klass) p.klass = String(body.klass).slice(0, 24);
      if (body.school !== undefined) p.school = String(body.school).slice(0, 40);
      if (body.gradeKey !== undefined) p.gradeKey = String(body.gradeKey).slice(0, 12);
      if (body.gradeLabel !== undefined) p.gradeLabel = String(body.gradeLabel).slice(0, 16);
    } else {
      if (state.participants.size >= MAX_PARTICIPANTS) {
        const oldest = Array.from(state.participants.values())
          .filter(function (x) { return !x.isBot; })
          .sort(function (a, b) { return a.lastSeen - b.lastSeen; })[0];
        if (oldest) state.participants.delete(oldest.id);
      }
      p = createParticipant({ name: body.name, emoji: body.emoji, klass: body.klass });
      p.school = String(body.school || '').slice(0, 40);
      p.gradeKey = String(body.gradeKey || '').slice(0, 12);
      p.gradeLabel = String(body.gradeLabel || '').slice(0, 16);
      // 首次接入可用本机历史进度做初始化（带上限，避免被刷）
      const seed = body.seed || {};
      if (seed.points) {
        p.points = {
          today: Math.max(0, Math.min(Number(seed.points.today) || 0, 3000)),
          week: Math.max(0, Math.min(Number(seed.points.week) || 0, 8000)),
          total: Math.max(0, Math.min(Number(seed.points.total) || 0, 20000))
        };
      }
      if (seed.subjectPoints) {
        Object.keys(seed.subjectPoints).slice(0, 12).forEach(function (k) {
          p.subjectPoints[k] = Math.max(0, Math.min(Number(seed.subjectPoints[k]) || 0, 20000));
        });
      }
    }
    p.lastSeen = Date.now();
    save();
    broadcastSoon();
    sendJson(res, 200, { ok: true, participantId: p.id, token: p.token, me: publicEntry(p) });
    return true;
  }

  if (route === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);

    // 1) 已有会话 → 直接恢复
    let p = findParticipant(body.participantId, body.token);
    if (p) {
      p.lastSeen = Date.now();
      const cls = state.classes.get(p.classId);
      save();
      broadcastSoon();
      sendJson(res, 200, {
        ok: true, resumed: true, created: false,
        participantId: p.id, token: p.token, pin: p.pin,
        classId: p.classId, className: cls ? cls.name : p.klass, classCode: cls ? cls.code : '',
        me: publicEntry(p)
      });
      return true;
    }

    // 2) 班级码登录
    const cls = findClassByCode(body.code);
    if (!cls) { sendJson(res, 404, { ok: false, error: 'class_not_found', message: '班级码不正确，请向老师确认' }); return true; }
    const name = String(body.name || '').trim().slice(0, 12);
    if (!name) { sendJson(res, 400, { ok: false, error: 'name_required', message: '请输入姓名' }); return true; }

    const sameName = classParticipants(cls.id).filter(function (x) {
      return !x.isBot && normalizeName(x.name) === normalizeName(name);
    })[0];

    if (sameName) {
      // 同名：需要 4 位 PIN 才能进入（防止冒名）
      const pin = String(body.pin || '').trim();
      if (!pin) { sendJson(res, 403, { ok: false, error: 'need_pin', message: '该姓名已在本班使用，请输入 4 位 PIN' }); return true; }
      if (pin !== sameName.pin) { sendJson(res, 403, { ok: false, error: 'bad_pin', message: 'PIN 不正确' }); return true; }
      sameName.lastSeen = Date.now();
      save();
      broadcastSoon();
      sendJson(res, 200, {
        ok: true, resumed: true, created: false,
        participantId: sameName.id, token: sameName.token, pin: sameName.pin,
        classId: cls.id, className: cls.name, classCode: cls.code,
        me: publicEntry(sameName)
      });
      return true;
    }

    if (state.participants.size >= MAX_PARTICIPANTS) {
      const oldest = Array.from(state.participants.values())
        .filter(function (x) { return !x.isBot; })
        .sort(function (a, b) { return a.lastSeen - b.lastSeen; })[0];
      if (oldest) state.participants.delete(oldest.id);
    }
    p = createParticipant({ name: name, emoji: body.emoji, classId: cls.id, klass: cls.name });
    // 首次登录可用本机历史进度做初始化（带上限，避免被刷）
    const seed = body.seed || {};
    if (seed.points) {
      p.points = {
        today: Math.max(0, Math.min(Number(seed.points.today) || 0, 3000)),
        week: Math.max(0, Math.min(Number(seed.points.week) || 0, 8000)),
        total: Math.max(0, Math.min(Number(seed.points.total) || 0, 20000))
      };
    }
    if (seed.subjectPoints) {
      Object.keys(seed.subjectPoints).slice(0, 12).forEach(function (k) {
        p.subjectPoints[k] = Math.max(0, Math.min(Number(seed.subjectPoints[k]) || 0, 20000));
      });
    }
    save();
    broadcastSoon();
    sendJson(res, 200, {
      ok: true, resumed: false, created: true,
      participantId: p.id, token: p.token, pin: p.pin,
      classId: cls.id, className: cls.name, classCode: cls.code,
      me: publicEntry(p)
    });
    return true;
  }

  /* ---------- 班级管理（教师） ---------- */
  if (route === '/api/class/create' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 24);
    if (!name) { sendJson(res, 400, { ok: false, error: 'name_required', message: '请填写班级名称' }); return true; }
    const cls = createClass(name);
    saveNow();
    sendJson(res, 200, { ok: true, classId: cls.id, name: cls.name, code: cls.code, teacherToken: cls.teacherToken, createdAt: cls.createdAt });
    return true;
  }

  if (route === '/api/class/info' && req.method === 'GET') {
    const classId = url.searchParams.get('classId') || '';
    const teacherToken = url.searchParams.get('teacherToken') || req.headers['x-teacher-token'] || '';
    const cls = state.classes.get(classId);
    if (!cls) { sendJson(res, 404, { ok: false, error: 'class_not_found' }); return true; }
    if (cls.teacherToken !== teacherToken) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return true; }
    const snap = snapshot('today', 'all', cls.id);
    sendJson(res, 200, {
      ok: true,
      class: { id: cls.id, name: cls.name, code: cls.code, createdAt: cls.createdAt },
      students: snap.entries.filter(function (e) { return !e.isBot; }),
      online: snap.online,
      events: snap.events,
      at: snap.at
    });
    return true;
  }

  if (route === '/api/class/reset' && req.method === 'POST') {
    const body = await readBody(req);
    const cls = state.classes.get(String(body.classId || ''));
    if (!cls) { sendJson(res, 404, { ok: false, error: 'class_not_found' }); return true; }
    if (cls.teacherToken !== body.teacherToken) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return true; }
    classParticipants(cls.id).forEach(function (p) {
      p.points = blankPoints();
      p.subjectPoints = {};
      p.streak = 0;
      p.correct = 0;
      p.answered = 0;
    });
    state.events = state.events.filter(function (ev) { return ev.classId !== cls.id; });
    saveNow();
    broadcast();
    sendJson(res, 200, { ok: true, cleared: true });
    return true;
  }

  if (route === '/api/class/remove-student' && req.method === 'POST') {
    const body = await readBody(req);
    const cls = state.classes.get(String(body.classId || ''));
    if (!cls) { sendJson(res, 404, { ok: false, error: 'class_not_found' }); return true; }
    if (cls.teacherToken !== body.teacherToken) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return true; }
    const target = state.participants.get(String(body.participantId || ''));
    if (!target || target.classId !== cls.id) { sendJson(res, 404, { ok: false, error: 'student_not_found' }); return true; }
    state.participants.delete(target.id);
    saveNow();
    broadcast();
    sendJson(res, 200, { ok: true, removed: target.name });
    return true;
  }

  if (route === '/api/profile' && req.method === 'POST') {
    const body = await readBody(req);
    const p = findParticipant(body.participantId, body.token);
    if (!p) { sendJson(res, 403, { ok: false, error: 'invalid participant or token' }); return true; }
    if (body.name) p.name = String(body.name).slice(0, 16);
    if (body.emoji) p.emoji = String(body.emoji).slice(0, 4);
    if (body.klass) p.klass = String(body.klass).slice(0, 24);
    if (body.school !== undefined) p.school = String(body.school).slice(0, 40);
    if (body.gradeKey !== undefined) p.gradeKey = String(body.gradeKey).slice(0, 12);
    if (body.gradeLabel !== undefined) p.gradeLabel = String(body.gradeLabel).slice(0, 16);
    const clsOfP = state.classes.get(p.classId);
    if (clsOfP) p.klass = clsOfP.name;   // 班级名称以班级记录为准，防止改名字绕过隔离
    p.lastSeen = Date.now();
    save();
    broadcastSoon();
    sendJson(res, 200, { ok: true, me: publicEntry(p) });
    return true;
  }

  if (route === '/api/answer' && req.method === 'POST') {
    const body = await readBody(req);
    const p = findParticipant(body.participantId, body.token);
    if (!p) { sendJson(res, 403, { ok: false, error: 'invalid participant or token' }); return true; }
    const now = Date.now();
    // 限流：40ms 最小间隔 + 10 秒内最多 20 次作答（防止脚本刷分，同时不影响课堂竞速连点）
    if (now - p.lastPostAt < 40) { sendJson(res, 429, { ok: false, error: 'too fast' }); return true; }
    if (!Array.isArray(p.postWindow)) p.postWindow = [];
    p.postWindow = p.postWindow.filter(function (t) { return now - t < 10000; });
    if (p.postWindow.length >= 20) { sendJson(res, 429, { ok: false, error: 'rate limited' }); return true; }
    p.postWindow.push(now);
    p.lastPostAt = now;
    p.lastSeen = now;
    p.answered += 1;

    let gain = 0;
    if (body.correct) {
      p.correct += 1;
      p.streak += 1;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      gain = 12 + Math.min(p.streak, 10) * 2;
      const bonus = Math.max(0, Math.min(50, Number(body.bonus) || 0));
      gain += bonus;
      award(p, gain, String(body.subject || 'math').slice(0, 24),
        p.streak >= 3 ? '连击 ×' + p.streak : '答对题目');
    } else {
      p.streak = 0;
    }
    save();
    broadcastSoon();
    sendJson(res, 200, {
      ok: true,
      gain: gain,
      me: publicEntry(p),
      streak: p.streak,
      correct: p.correct,
      answered: p.answered
    });
    return true;
  }

  if (route === '/api/leaderboard' && req.method === 'GET') {
    const range = url.searchParams.get('range') || 'today';
    const subject = url.searchParams.get('subject') || 'all';
    // 学生：凭会话读取自己班级；教师：凭班级令牌
    const teacherToken = url.searchParams.get('teacherToken') || req.headers['x-teacher-token'] || '';
    const classIdParam = url.searchParams.get('classId') || '';
    if (teacherToken && classIdParam) {
      const cls = state.classes.get(classIdParam);
      if (!cls || cls.teacherToken !== teacherToken) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return true; }
      sendJson(res, 200, snapshot(range, subject, cls.id));
      return true;
    }
    const p = findParticipant(url.searchParams.get('participantId'), url.searchParams.get('token'));
    if (!p) { sendJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' }); return true; }
    p.lastSeen = Date.now();
    sendJson(res, 200, snapshot(range, subject, p.classId));
    return true;
  }

  if (route === '/api/stream' && req.method === 'GET') {
    const pid = url.searchParams.get('participantId');
    const p = findParticipant(pid, url.searchParams.get('token'));
    if (!p) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end('unauthorized');
      return true;
    }
    p.lastSeen = Date.now();
    const classId = p.classId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    // 部分反向代理/隧道会缓冲小响应体，先补一段注释把缓冲区顶开，保证低延迟
    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.write(':' + ' '.repeat(2048) + '\n\n');
    res.write('retry: 3000\n\n');
    res.write('event: hello\ndata: ' + JSON.stringify(snapshot('today', 'all', classId)) + '\n\n');

    const client = { res: res, pid: pid, classId: classId };
    sseClients.add(client);
    const heartbeat = setInterval(function () {
      try { res.write(': ping ' + Date.now() + '\n\n'); } catch (e) {}
    }, 15000);

    // 心跳式在线标记
    const seen = setInterval(function () {
      if (p) { p.lastSeen = Date.now(); broadcastSoon(); }
    }, 30000);

    req.on('close', function () {
      clearInterval(heartbeat);
      clearInterval(seen);
      sseClients.delete(client);
    });
    return true;
  }

  if (route === '/api/admin/reset' && req.method === 'POST') {
    if (!ADMIN_TOKEN) { sendJson(res, 403, { ok: false, error: 'admin token not configured' }); return true; }
    if (req.headers['x-admin-token'] !== ADMIN_TOKEN) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return true; }
    state.participants.clear();
    state.classes.clear();
    state.events = [];
    saveNow();
    broadcast();
    sendJson(res, 200, { ok: true, cleared: true });
    return true;
  }

  return false;
}

/* ============================================================
 * 演示机器人（默认关闭）
 * ============================================================ */
const BOT_SEED = [
  { name: '演示·王雨欣', emoji: '🐰', klass: '演示班级', focus: 'chinese' },
  { name: '演示·李泽宇', emoji: '🐯', klass: '演示班级', focus: 'math' },
  { name: '演示·陈思远', emoji: '🐼', klass: '演示班级', focus: 'physics' },
  { name: '演示·张浩然', emoji: '🦊', klass: '演示班级', focus: 'math' },
  { name: '演示·刘梓涵', emoji: '🐨', klass: '演示班级', focus: 'english' }
];

function startBots(count) {
  let demoClass = Array.from(state.classes.values())[0];
  if (!demoClass) demoClass = createClass('演示班级');
  for (let i = 0; i < count; i++) {
    const seed = BOT_SEED[i % BOT_SEED.length];
    const p = createParticipant(Object.assign({}, seed, { classId: demoClass.id, klass: demoClass.name }));
    p.isBot = true;
    p.subjectPoints[seed.focus] = 600 + Math.round(Math.random() * 400);
    p.points = {
      today: Math.round(200 + Math.random() * 400),
      week: Math.round(700 + Math.random() * 600),
      total: Math.round(2200 + Math.random() * 1600)
    };
  }
  setInterval(function () {
    const bots = Array.from(state.participants.values()).filter(function (p) { return p.isBot; });
    if (!bots.length) return;
    const p = bots[Math.floor(Math.random() * bots.length)];
    const gain = 20 + Math.round(Math.random() * 110);
    const subj = p.subjectPoints && Object.keys(p.subjectPoints)[0] || 'math';
    award(p, gain, subj, Math.random() < 0.25 ? '连击 ×' + (3 + Math.floor(Math.random() * 6)) : '答对题目');
    save();
    broadcastSoon();
  }, 2200);
  console.log('[info] 已启动 ' + count + ' 个演示机器人（真实班级请使用 --bots 0）→ 演示班级码：' + demoClass.code);
}

/* ============================================================
 * 服务器
 * ============================================================ */
const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.indexOf('/api/') === 0) {
    handleApi(req, res, url).then(function (handled) {
      if (!handled) sendJson(res, 404, { ok: false, error: 'unknown api: ' + url.pathname });
    }).catch(function (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

load();
if (BOTS > 0) startBots(BOTS);

server.listen(PORT, HOST, function () {
  console.log('');
  console.log('  汤姆猫跑酷学堂 · 实时榜单后端已启动');
  console.log('  ├─ 本地地址：http://' + HOST + ':' + PORT + '/index.html');
  console.log('  ├─ 静态目录：' + ROOT);
  console.log('  ├─ 数据文件：' + DATA_FILE);
  console.log('  ├─ 参与者数：' + state.participants.size);
  console.log('  └─ 演示机器人：' + BOTS);
  console.log('');
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[info] 正在保存数据并退出…');
  try { saveNow(); } catch (e) {}
  sseClients.forEach(function (c) { try { c.res.end(); } catch (e) {} });
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
