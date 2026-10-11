/*!
 * 汤姆猫跑酷学堂 · 应用外壳
 * 首页 / 学生端 / 跑酷闯关 / 错题修复 / 我的家园 / 数据中心 / 实时积分榜单 / 教师端
 */
(function () {
  'use strict';
  var PK = window.PK;

  /* ============================================================
   * 工具
   * ============================================================ */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(n) { return Number(n || 0).toLocaleString('zh-CN'); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function uid(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36); }

  var toastBox = document.createElement('div');
  toastBox.className = 'toasts';
  document.body.appendChild(toastBox);

  function toast(message, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = message;
    toastBox.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s ease, transform .3s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateY(-10px)';
      setTimeout(function () { t.remove(); }, 320);
    }, 2100);
  }

  function confetti(count) {
    var box = document.createElement('div');
    box.className = 'confetti';
    var colors = ['#2b8cee', '#28bd66', '#f49d25', '#713cdd', '#ef524d', '#ffd75e'];
    for (var i = 0; i < (count || 70); i++) {
      var piece = document.createElement('i');
      piece.style.left = Math.random() * 100 + '%';
      piece.style.top = '-20px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.opacity = String(0.7 + Math.random() * 0.3);
      box.appendChild(piece);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3600);
  }

  /* ============================================================
   * 状态
   * ============================================================ */
  var STORAGE_KEY = 'pk-academy-v5';   // v5：清掉历史测试数据（班级 / 演示账号 / 榜单缓存）

  function defaultState() {
    return {
      user: { name: '', emoji: '🐱', klass: '', role: 'student', school: '', gradeKey: '', gradeLabel: '' },
      lastSchool: '',          // 记住上次填写的学校名，下次登录自动带出
      loggedIn: false,        // 是否已经登录（未登录只显示登录页）
      coins: 320,
      stats: {},              // { [subjectKey]: { answered, correct, points } }
      wrongIds: [],
      masteredIds: [],
      inventory: ['partner-cat'],
      equipped: { partner: 'partner-cat', theme: 'theme-star' },
      partners: {},           // { 'partner-dino': { level: 2 } } 伙伴等级（金币升级）
      home: { placed: [] },   // 家园摆件：[{ id, slot }]
      chat: {},               // { 'partner-cat': [{ who, text, at }] } 与伙伴的聊天记录
      aiConfig: null,         // 可选：接入自己的大模型 { endpoint, key, model }
      history: [],            // 最近闯关记录
      daily: {},              // { 'YYYY-MM-DD': points }
      customQuestions: [],    // 教师自定义题目
      classes: [],            // 不再内置任何班级 / 测试账号，全部由老师创建
      homework: [],           // 教师发布的作业：[{ id, title, classId, className, questionIds, createdAt, due, status, submissions }]
      asks: [],               // 学生向老师提的问题：[{ id, student, klass, text, image, createdAt, status, answer, answeredAt, answeredBy }]
      joinedClassIds: [],     // 学生已加入的班级
      seenGuide: false,       // 是否看过使用解说
      leader: null,
      lastVisit: ''
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }

  var S = loadState();

  function save() {
    try {
      S.leader = leaderboard.toJSON();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    } catch (e) { /* 忽略存储失败 */ }
  }

  var lbMode = 'local';
  var lbOnline = 0;

  var leaderboard = window.PKApi.createAdaptive({
    seed: 20261009,
    me: {
      id: 'me',
      name: S.user.name,
      emoji: S.user.emoji,
      klass: S.user.klass,
      school: S.user.school,
      gradeKey: S.user.gradeKey,
      gradeLabel: S.user.gradeLabel,
      isMe: true,
      points: { today: 0, week: 0, total: 0 },
      subjectPoints: {},
      correct: 0,
      total: 0,
      streak: 0
    },
    onAward: function (gain, subjectKey) {
      if (!gain) return;
      var key = todayKey();
      S.daily[key] = (S.daily[key] || 0) + gain;
      save();
    },
    onModeChange: function (mode) {
      lbMode = mode;
      updateLiveBadge();
      if (mode === 'remote') toast('已连接实时后端，榜单为真实多端同步', 'ok');
      else if (mode === 'cloud') toast('已连接云端实时榜单，多台设备打开同一网址即可同屏竞技', 'ok');
      if (!currentGame) render();
    }
  });
  if (S.leader) leaderboard.load(S.leader);
  leaderboard.me.name = S.user.name;
  leaderboard.me.emoji = S.user.emoji;
  leaderboard.me.klass = S.user.klass;
  if (!leaderboard.me.points) leaderboard.me.points = { today: 0, week: 0, total: 0 };

  var ui = {
    loginRole: '',
    lbRange: 'today',
    lbSubject: 'all',
    lbScope: 'class',       // 学生榜单范围：class=本班 / grade=同年级
    lbClass: 'all',         // 老师榜单：按班级筛选
    subject: 'math',
    difficulty: 'basic',
    teacherTab: 'classes',
    questionFilter: { subject: 'all', type: 'all', difficulty: 'all' },
    hwPick: { subject: 'all', type: 'all', difficulty: 'all' },
    hwSelected: []
  };

  function bank() { return PK.QUESTION_BANK.concat(S.customQuestions || []); }
  function questionById(id) { return bank().filter(function (q) { return q.id === id; })[0] || null; }

  function statsFor(key) {
    if (!S.stats[key]) S.stats[key] = { answered: 0, correct: 0, points: 0 };
    return S.stats[key];
  }

  function accuracy() {
    var answered = 0, correct = 0;
    PK.SUBJECTS.forEach(function (s) {
      var st = S.stats[s.key];
      if (!st) return;
      answered += st.answered;
      correct += st.correct;
    });
    return answered ? Math.round((correct / answered) * 100) : 0;
  }

  function totalAnswered() {
    var n = 0;
    PK.SUBJECTS.forEach(function (s) { if (S.stats[s.key]) n += S.stats[s.key].answered; });
    return n;
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayKeyAgo(offset) {
    var d = new Date();
    d.setDate(d.getDate() - offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------------- 班级 / 身份 辅助 ---------------- */
  function isTeacher() { return S.user.role === 'teacher'; }

  function genClassCode() {
    var code;
    do { code = String(1000 + Math.floor(Math.random() * 9000)); }
    while ((S.classes || []).some(function (c) { return c.code === code; }));
    return code;
  }

  function classByCode(code) {
    code = String(code === undefined || code === null ? '' : code).trim();
    if (!code) return null;
    return (S.classes || []).filter(function (c) { return c.code === code; })[0] || null;
  }

  /** 学校名归一化：去空格 + 忽略大小写 + 全角转半角，用于"同一所学校"的判断 */
  function normSchool(name) {
    return String(name === undefined || name === null ? '' : name)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/[\s\u3000]/g, '')
      .toLowerCase();
  }

  /** 学校名 + 班级码 才能定位到同一个班级 */
  function classBySchoolCode(school, code) {
    var c0 = String(code === undefined || code === null ? '' : code).trim();
    if (!c0) return null;
    var sc = normSchool(school);
    var hit = (S.classes || []).filter(function (c) {
      if (c.code !== c0) return false;
      if (!c.school || !sc) return true;     // 老数据没有学校字段时宽松处理
      return normSchool(c.school) === sc;
    });
    return hit[0] || null;
  }

  /** 老师自己带领的班级（同一所学校的班级） */
  function leadingClasses() {
    var sc = normSchool(S.user.school);
    return (S.classes || []).filter(function (c) {
      if (c.owner && S.user.name && c.owner !== S.user.name) return false;
      if (sc && c.school && normSchool(c.school) !== sc) return false;
      return true;
    });
  }

  function teacherClassNames() {
    return leadingClasses().map(function (c) { return c.name; });
  }

  /** 学生视角的班级信息 */
  function myScope() {
    var cls = myClass();
    return {
      school: S.user.school || '',
      schoolKey: normSchool(S.user.school),
      className: cls ? cls.name : (S.user.klass || ''),
      gradeKey: (cls && cls.gradeKey) || S.user.gradeKey || '',
      gradeLabel: (cls && cls.gradeLabel) || S.user.gradeLabel || ''
    };
  }

  function sameSchool(e) {
    var sc = normSchool(S.user.school);
    if (!sc) return true;
    if (!e.school) return true;          // 老数据没有学校字段时不排除
    return normSchool(e.school) === sc;
  }

  /** 把一个榜单快照按身份过滤：学生只看本班 / 同年级，老师只看自己带的学生 */
  function eventInScope(ev) {
    if (!ev) return false;
    if (ev.isMe) return true;
    var klass = ev.klass || ev.k || '';
    var school = ev.school || ev.sc || '';
    var grade = ev.gradeKey || ev.gr || '';
    if (school && normSchool(school) !== normSchool(S.user.school)) return false;
    if (!klass) return true;                 // 没有班级信息时不武断过滤
    if (isTeacher()) {
      var names = teacherClassNames();
      if (!names.length) return true;
      if (ui.lbClass && ui.lbClass !== 'all' && klass !== ui.lbClass) return false;
      return names.indexOf(klass) !== -1;
    }
    var mine = myScope();
    if ((ui.lbScope || 'class') === 'grade') {
      if (!mine.gradeKey) return klass === mine.className;
      return grade ? grade === mine.gradeKey : klass === mine.className;
    }
    return klass === mine.className;
  }

  function scopeSnapshot(snap, scope) {
    if (!snap) return snap;
    scope = scope || (isTeacher() ? 'teacher' : (ui.lbScope || 'class'));
    var mine = myScope();
    var list = (snap.entries || []).filter(function (e) {
      if (e.isMe) return true;
      if (!sameSchool(e)) return false;
      if (isTeacher()) {
        var names = teacherClassNames();
        if (!names.length) return true;
        if (ui.lbClass && ui.lbClass !== 'all' && e.klass !== ui.lbClass) return false;
        return names.indexOf(e.klass) !== -1;
      }
      if (scope === 'grade') {
        if (!mine.gradeKey) return e.klass === mine.className;
        return e.gradeKey ? e.gradeKey === mine.gradeKey : e.klass === mine.className;
      }
      return e.klass === mine.className;
    });
    list.sort(function (a, b) { return (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name), 'zh'); });
    list.forEach(function (e, i) {
      if (e.rank !== i + 1) e.delta = 0;
      e.rank = i + 1;
    });
    // 实时动态同样只显示范围内的同学
    var byName = {};
    (snap.entries || []).forEach(function (e) { byName[e.name] = e; });
    var events = (snap.events || []).filter(function (ev) {
      var src = byName[ev.name] || {};
      return eventInScope({
        isMe: ev.isMe === true || ev.name === S.user.name,
        klass: ev.klass || ev.k || src.klass || '',
        school: ev.school || ev.sc || src.school || '',
        gradeKey: ev.gradeKey || ev.gr || src.gradeKey || ''
      });
    });
    return Object.assign({}, snap, { entries: list, events: events });
  }

  function classById(id) {
    return (S.classes || []).filter(function (c) { return c.id === id; })[0] || null;
  }

  function myClass() {
    var ids = S.joinedClassIds || [];
    if (!ids.length) return null;
    return classById(ids[ids.length - 1]);
  }

  function joinClassById(cls) {
    if (!cls) return false;
    if ((S.joinedClassIds || []).indexOf(cls.id) === -1) S.joinedClassIds = (S.joinedClassIds || []).concat(cls.id);
    S.user.klass = cls.name;
    if (cls.gradeKey) { S.user.gradeKey = cls.gradeKey; S.user.gradeLabel = cls.gradeLabel || ''; }
    leaderboard.me.klass = cls.name;
    if (leaderboard.updateProfile) {
      leaderboard.updateProfile({
        name: S.user.name, emoji: S.user.emoji, klass: cls.name,
        school: S.user.school, gradeKey: S.user.gradeKey, gradeLabel: S.user.gradeLabel
      });
    }
    return true;
  }

  function enterApp(role, name) {
    S.user.role = role;
    S.user.name = name || S.user.name || (role === 'teacher' ? '老师' : '同学');
    S.loggedIn = true;
    leaderboard.me.name = S.user.name;
    leaderboard.me.emoji = S.user.emoji;
    if (leaderboard.updateProfile) {
      leaderboard.updateProfile({
        name: S.user.name, emoji: S.user.emoji, klass: S.user.klass,
        school: S.user.school, gradeKey: S.user.gradeKey, gradeLabel: S.user.gradeLabel
      });
    }
    if (leaderboard.setReady) leaderboard.setReady(true);
    save();
  }

  function homeworkById(id) {
    return (S.homework || []).filter(function (h) { return h.id === id; })[0] || null;
  }

  function homeworkForMe() {
    if (isTeacher()) return [];
    var cls = myClass();
    return (S.homework || []).filter(function (h) {
      if (h.status === 'closed') return false;
      if (cls && h.classId && h.classId !== cls.id) return false;
      return true;
    });
  }

  function homeworkDone(h) {
    var s = h.submissions && h.submissions[S.user.name];
    return !!(s && s.victory);
  }

  /* ---------------- 学生提问 / 老师回复 ---------------- */
  function allAsks() {
    return (S.asks || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  function askById(id) { return (S.asks || []).filter(function (a) { return a.id === id; })[0] || null; }
  function myAsks() { return allAsks().filter(function (a) { return a.student === S.user.name; }); }
  function pendingAskCount() { return allAsks().filter(function (a) { return a.status !== 'answered'; }).length; }
  function askTimeText(at) {
    if (!at) return '';
    var d = new Date(at);
    var same = new Date().toDateString() === d.toDateString();
    return same
      ? (String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
      : ((d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
  }
  /** 合并一条来自云端中继的班级档案（跨设备共享「学校 + 班级码 + 年级」） */
  function mergeClass(m) {
    if (!m || !m.cid) return false;
    S.classes = S.classes || [];
    var cur = classById(m.cid);
    if (!cur && m.code) {
      cur = S.classes.filter(function (c) {
        return c.code === m.code && (!c.school || !m.school || normSchool(c.school) === normSchool(m.school));
      })[0] || null;
    }
    var fresh = {
      id: m.cid, name: m.name || '未命名班级', code: m.code || '',
      school: m.school || '', gradeKey: m.gradeKey || '', gradeLabel: m.gradeLabel || '', stage: m.stage || '',
      owner: m.owner || '', teacher: m.teacher || '', students: Number(m.students) || 0,
      avg: 0, rate: 0, createdAt: m.at || Date.now(), fromCloud: true
    };
    if (!cur) { S.classes.push(fresh); return true; }
    var changed = false;
    ['name', 'code', 'school', 'gradeKey', 'gradeLabel', 'stage', 'owner', 'teacher'].forEach(function (k) {
      if (fresh[k] && cur[k] !== fresh[k]) { cur[k] = fresh[k]; changed = true; }
    });
    cur.fromCloud = true;
    return changed;
  }

  /** 合并一条来自云端中继的提问 / 回复，返回是否有变化 */
  function mergeAsk(m) {
    if (!m || !m.qid) return false;
    S.asks = S.asks || [];
    if (m.kind === 'reply') {
      var target = askById(m.qid);
      if (!target) {
        S.asks.unshift({
          id: m.qid, student: m.sn || '同学', emoji: m.se || '🙂', klass: m.sk || '',
          text: m.qt || '', image: m.qimg || '', createdAt: m.qat || m.at || Date.now(),
          status: 'answered', answer: m.text || '', answeredAt: m.at || Date.now(), answeredBy: m.n || '老师'
        });
        return true;
      }
      if (target.answer === (m.text || '')) return false;
      target.answer = m.text || '';
      target.status = 'answered';
      target.answeredAt = m.at || Date.now();
      target.answeredBy = m.n || '老师';
      return true;
    }
    var cur = askById(m.qid);
    if (cur) {
      var touched = false;
      if (m.img && cur.image !== m.img) { cur.image = m.img; touched = true; }
      return touched;
    }
    S.asks.unshift({
      id: m.qid, student: m.n || '同学', emoji: m.e || '🙂', klass: m.k || '',
      text: m.text || '', image: m.img || '', createdAt: m.at || Date.now(), status: 'open'
    });
    return true;
  }
  function askRowHtml(a, forTeacher) {
    var answered = a.status === 'answered';
    return '<div class="ask-row' + (answered ? ' done' : '') + '">' +
      '<div class="ask-head">' +
        '<span class="ask-avatar">' + esc(a.emoji || '🙂') + '</span>' +
        '<div class="grow">' +
          '<div class="ask-meta"><b>' + esc(a.student || '同学') + '</b>' +
            (forTeacher && a.klass ? '<span class="badge">' + esc(a.klass) + '</span>' : '') +
            '<span class="muted">' + esc(askTimeText(a.createdAt)) + '</span>' +
            '<span class="badge ' + (answered ? 'live' : '') + '">' + (answered ? '老师已回复' : '等待老师回复') + '</span>' +
          '</div>' +
          '<div class="ask-text">' + esc(a.text) + '</div>' +
          (a.image ? '<img class="q-image" src="' + esc(a.image) + '" alt="提问配图">' : '') +
        '</div>' +
      '</div>' +
      (answered
        ? '<div class="ask-answer"><b>' + esc(a.answeredBy || '老师') + '：</b>' + esc(a.answer || '') +
          '<div class="lb-sub">' + esc(askTimeText(a.answeredAt)) + '</div></div>'
        : (forTeacher
            ? '<div class="ask-reply"><textarea class="textarea" id="askReply-' + a.id + '" rows="2" placeholder="写下你的回复，学生端会立刻看到…"></textarea>' +
              '<div class="row" style="gap:8px;margin-top:8px"><button class="btn btn-teacher btn-sm" data-action="ask-reply" data-id="' + a.id + '">发送回复</button>' +
              '<button class="btn btn-ghost btn-sm" data-action="ask-delete" data-id="' + a.id + '">删除</button></div></div>'
            : '<div class="ask-waiting">⏳ 老师还没回复，可以先继续闯关～</div>')) +
    '</div>';
  }

  /* ============================================================
   * 通用片段
   * ============================================================ */
  function deltaTag(delta) {
    if (delta > 0) return '<span class="delta up">▲ ' + delta + '</span>';
    if (delta < 0) return '<span class="delta down">▼ ' + Math.abs(delta) + '</span>';
    return '<span class="delta same">–</span>';
  }

  function rankClass(rank) {
    return rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
  }

  function leaderboardRows(entries, highlightFlash) {
    return entries.map(function (e) {
      var flash = highlightFlash && e.delta !== 0 ? ' rank-flash' : '';
      return '<div class="lb-row ' + (e.isMe ? 'me' : '') + flash + '">' +
        '<div class="lb-rank ' + rankClass(e.rank) + '">' + (e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank) + '</div>' +
        '<div class="lb-person">' +
          '<div class="lb-avatar">' + e.emoji + '</div>' +
          '<div class="grow">' +
            '<div class="lb-name">' + esc(e.name) + (e.isMe ? ' <span class="badge live">我</span>' : '') + (e.demo ? ' <span class="badge">演示</span>' : '') + deltaTag(e.delta) + '</div>' +
            '<div class="lb-sub">' + esc(e.klass) + (e.streak ? ' · 连对 ' + e.streak + ' 题' : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lb-score">' + fmt(e.score) + '<div class="lb-sub">积分</div></div>' +
      '</div>';
    }).join('');
  }

  function podiumHtml(entries) {
    var order = [1, 0, 2];              // 视觉顺序：左 = 第二名，中 = 冠军，右 = 第三名
    var rankClassByName = ['first', 'second', 'third'];
    var crowns = ['👑', '🥈', '🥉'];
    var html = '<div class="podium">';
    order.forEach(function (idx) {
      var e = entries[idx];
      if (!e) { html += '<div></div>'; return; }
      html += '<div class="podium-item ' + rankClassByName[idx] + '">' +
        '<div class="podium-crown">' + crowns[idx] + '</div>' +
        '<div class="podium-avatar">' + e.emoji + '</div>' +
        '<span class="podium-name">' + esc(e.name) + '</span>' +
        '<div class="podium-score">' + fmt(e.score) + '</div>' +
        '<div class="lb-sub">' + esc(e.klass) + '</div>' +
      '</div>';
    });
    return html + '</div>';
  }

  function feedHtml(events) {
    if (!events.length) return '<div class="empty"><span class="em">📡</span>等待同学们开始答题…</div>';
    return events.map(function (ev) {
      return '<div class="feed-item ' + (ev.isMe ? 'me' : '') + '">' +
        '<span class="feed-emoji">' + ev.emoji + '</span>' +
        '<span class="grow"><b>' + esc(ev.name) + '</b> 在【' + esc(ev.subject) + '】' + esc(ev.label) + '</span>' +
        '<span class="feed-gain">+' + ev.gain + '</span>' +
      '</div>';
    }).join('');
  }

  function scopedSnapshot(range, subject) {
    return scopeSnapshot(leaderboard.snapshot({ range: range || 'today', subject: subject || 'all' }));
  }
  function myPoints() { return scopedSnapshot('today').entries.filter(function (e) { return e.isMe; })[0]; }

  function subjectTile(s) {
    var st = S.stats[s.key] || { answered: 0, correct: 0 };
    var rate = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
    return '<button class="subject-btn' + (ui.subject === s.key ? ' active' : '') + '" data-action="pick-subject" data-key="' + s.key + '">' +
      '<div class="top"><span class="em">' + s.emoji + '</span><span class="badge">' + (st.answered ? rate + '%' : '未开始') + '</span></div>' +
      '<div class="nm">' + s.name + '</div>' +
      '<div class="prog"><i style="width:' + rate + '%"></i></div>' +
      '<div class="lb-sub">已答 ' + st.answered + ' 题</div>' +
    '</button>';
  }

  /* ============================================================
   * 登录页（学生 / 老师共用一个入口，切换简洁）
   * ============================================================ */
  /** 身份不匹配时的拦截页（学生/老师身份在登录页确定，之后不能互切） */
  function blockedView(role) {
    var isTeacherRole = role === 'teacher';
    return '<div class="center fade-in" style="padding-top:40px">' +
      '<div class="card center" style="max-width:520px;margin:0 auto;padding:34px 26px">' +
        '<div style="font-size:44px">🔒</div>' +
        '<h2 style="margin-top:12px;font-size:20px;font-weight:900">当前身份无法进入这个页面</h2>' +
        '<p class="muted" style="font-size:13.5px;margin-top:8px;line-height:1.8">' +
          (isTeacherRole
            ? '你当前是<b>老师</b>身份，不能进入学生端。<br>身份在登录时确定，如需以学生身份使用，请退出后重新选择身份登录。'
            : '你当前是<b>学生</b>身份，不能进入教师端。<br>身份在登录时确定，如需以老师身份使用，请退出后重新选择身份登录。') +
        '</p>' +
        '<div class="row" style="gap:10px;margin-top:18px;justify-content:center">' +
          '<button class="btn btn-primary" data-go="' + (isTeacherRole ? '#/teacher' : '#/student') + '">回到我的课堂</button>' +
          '<button class="btn btn-ghost" data-action="logout">退出并切换身份</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function viewLogin() {
    var role = ui.loginRole || S.user.role || 'student';
    var isStu = role !== 'teacher';
    var cls = myClass();
    var steps = [
      ['🧑‍🎓', '学生', '填昵称即可进入，有班级码就填、没有也能先体验'],
      ['🧑‍🏫', '老师', '不用班级码，进入后创建班级并发放 4 位班级码'],
      ['🏃', '跑酷答题', '答对清障加速，答错自动进错题本'],
      ['🏆', '实时榜单', '多台设备同屏竞技，积分名次实时更新']
    ];
    return '<div class="login-wrap fade-in">' +
      '<div class="login-card">' +
        '<div class="login-brand">' +
          '<div class="login-logo">🐱</div>' +
          '<div><div class="login-title">汤姆猫跑酷学堂</div>' +
          '<div class="login-sub">边跑边学 · 实时积分榜 · 游戏化课堂</div></div>' +
        '</div>' +

        '<div class="role-switch" role="tablist">' +
          '<button data-action="login-role" data-role="student" class="' + (isStu ? 'on' : '') + '">🧑‍🎓 我是学生</button>' +
          '<button data-action="login-role" data-role="teacher" class="' + (!isStu ? 'on' : '') + '">🧑‍🏫 我是老师</button>' +
        '</div>' +

        (isStu
          ? '<div class="login-form">' +
              '<div class="form-field"><label>学校名称</label>' +
                '<input class="input" id="lgSchool" maxlength="20" placeholder="例如：阳光小学" value="' + esc(S.user.school || S.lastSchool || '') + '"></div>' +
              '<div class="form-field"><label>你的昵称</label>' +
                '<input class="input" id="lgName" maxlength="12" placeholder="例如：小明" value="' + esc(S.user.name || '') + '"></div>' +
              '<div class="form-field"><label>班级码 <span class="opt-tag">选填</span></label>' +
                '<input class="input code-input" id="lgCode" inputmode="numeric" maxlength="4" placeholder="老师给的 4 位数字" value="' + esc(ui.joinCode || (cls ? cls.code : '')) + '"></div>' +
              '<div id="lgMsg" class="login-msg"></div>' +
              '<button class="btn btn-primary btn-lg btn-block" data-action="login-enter" data-role="student">🚀 进入学生端</button>' +
              '<button class="btn btn-ghost btn-block" data-action="login-enter" data-role="student" data-skip="1">暂时没有班级码，先进入体验</button>' +
              '<p class="login-tip">' +
                (S.classes.length
                  ? '填写班级码会加入对应班级，作业和班级排名都会算进去。'
                  : '老师还没有创建班级，你可以直接进入先体验跑酷闯关。') +
              '</p>' +
            '</div>'
          : '<div class="login-form">' +
              '<div class="form-field"><label>学校名称</label>' +
                '<input class="input" id="lgSchool" maxlength="20" placeholder="例如：阳光小学" value="' + esc(S.user.school || S.lastSchool || '') + '"></div>' +
              '<div class="form-field"><label>你的称呼</label>' +
                '<input class="input" id="lgName" maxlength="12" placeholder="例如：李老师" value="' + esc(S.user.name || '') + '"></div>' +
              '<div id="lgMsg" class="login-msg"></div>' +
              '<button class="btn btn-teacher btn-lg btn-block" data-action="login-enter" data-role="teacher">🧑‍🏫 进入教师端</button>' +
              '<p class="login-tip">老师不需要班级码。进入后到「班级学情」创建班级，会立刻弹出班级码发给学生。</p>' +
            '</div>') +
      '</div>' +

      '<div class="login-side">' +
        '<h2 class="login-side-title">30 秒上手</h2>' +
        '<div class="login-steps">' +
          steps.map(function (s, i) {
            return '<div class="login-step">' +
              '<div class="login-step-num">' + (i + 1) + '</div>' +
              '<div class="login-step-emoji">' + s[0] + '</div>' +
              '<div><b>' + s[1] + '</b><p>' + s[2] + '</p></div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<button class="btn btn-ghost btn-block" data-action="open-guide" style="margin-top:14px">📖 查看完整使用解说</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
   * 首页
   * ============================================================ */
  function viewHome() {
    var snap = scopedSnapshot('today');
    var me = snap.entries.filter(function (e) { return e.isMe; })[0];
    var test = PK.selfTest(bank());
    var html = '';

    html += '<section class="hero fade-in">' +
      '<span class="hero-eyebrow">🎮 游戏化学习 · 实时积分榜 · 答案判定已修复</span>' +
      '<h1>汤姆猫跑酷学堂<br><span class="grad">边跑边学，快乐成长</span></h1>' +
      '<p class="lead">三跑道跑酷闯关，答对题目清除障碍、击败 BOSS。学生的每一次答题都会实时累计积分，冲上班级榜单——教师端可随时查看学情与错题分布。</p>' +
      '<div class="hero-actions">' +
        '<button class="btn btn-primary btn-lg" data-go="#/student">🐱 立即开始闯关</button>' +
        '<button class="btn btn-secondary btn-lg" data-go="#/leaderboard">🏆 实时积分榜单</button>' +
        '<button class="btn btn-ghost btn-lg" data-go="#/teacher">🧑‍🏫 教师端</button>' +
      '</div>' +
      '<div class="hero-stats">' +
        '<div class="hero-stat"><b>' + bank().length + '</b><span>已校验题目</span></div>' +
        '<div class="hero-stat"><b>9</b><span>全学科覆盖</span></div>' +
        '<div class="hero-stat"><b>' + (leaderboard.peers.length + 1) + '</b><span>今日在线同学</span></div>' +
        '<div class="hero-stat"><b>' + test.passed + '/' + test.total + '</b><span>答案自检通过</span></div>' +
        '<div class="hero-stat"><b>' + fmt(me ? me.score : 0) + '</b><span>我的今日积分</span></div>' +
      '</div>' +
    '</section>';

    html += '<section style="margin-top:26px">' +
      '<div class="row between" style="margin-bottom:12px"><h2 style="font-size:19px;font-weight:900">选择学科开始跑酷</h2>' +
      '<button class="btn btn-ghost btn-sm" data-go="#/student">全学科看板 →</button></div>' +
      '<div class="subject-marquee">' +
        PK.SUBJECTS.map(function (s) {
          var st = S.stats[s.key] || { answered: 0 };
          return '<button class="subject-tile fade-in" style="background:linear-gradient(140deg,' + s.grad[0] + ',' + s.grad[1] + ')" data-action="pick-subject" data-key="' + s.key + '" data-jump="#/student">' +
            '<span class="emoji">' + s.emoji + '</span>' +
            '<div><div class="name">' + s.name + '</div><div class="meta">' + (st.answered ? '已答 ' + st.answered + ' 题' : '开始第一关') + '</div></div>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</section>';

    html += '<section class="grid grid-4" style="margin-top:26px">' +
      featureCard('🏃', '伪 3D 跑酷闯关', '三跑道、跳跃、金币、BOSS 战，答题正确即刻清障加速，错误扣血并自动收录错题。') +
      featureCard('📈', '实时积分榜单', '答题得分实时入榜，2 秒刷新、名次升降动画、前三名领奖台，支持分学科与时间维度。') +
      featureCard('✅', '答案判定引擎', '统一兼容字母 / 下标 / 选项原文，判断题口语化写法，填空题等价答案与单位容错。') +
      featureCard('🧑‍🏫', '教师端学情', '题库增删改、班级学情看板、课堂竞速、错题统计，一键导出学生成绩。') +
      featureCard('🐾', '伙伴陪伴与成长', '用答题赚的金币购买伙伴、给它升级、布置家园；出战哪个伙伴，跑酷里跑的就是它，还能陪你聊天。') +
    '</section>';

    html += '<section class="split" style="margin-top:26px">' +
      '<div class="card">' +
        '<div class="card-title"><span class="emoji">🏆</span>实时积分榜单 <span class="live-dot"></span><span class="card-sub">每 2 秒刷新</span>' +
        '<span class="grow"></span><button class="btn btn-ghost btn-sm" data-go="#/leaderboard">查看全部</button></div>' +
        '<div data-live="home-lb">' + leaderboardRows(snap.entries.slice(0, 6), false) + '</div>' +
        '<div class="my-rank-bar">' +
          '<span style="font-size:22px">' + (me ? me.emoji : '🐱') + '</span>' +
          '<div class="grow"><b>我的今日排名</b><div style="font-size:12px;opacity:.75">' + (me ? esc(me.klass) : '') + '</div></div>' +
          '<div style="text-align:right"><div class="live-rank" style="font-size:20px;font-weight:900">第 ' + (me ? me.rank : '-') + ' 名</div>' +
          '<div class="live-score" style="font-size:12px;opacity:.75">' + fmt(me ? me.score : 0) + ' 积分</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><span class="emoji">📡</span>实时动态</div>' +
        '<div class="feed" data-live="home-feed">' + feedHtml(snap.events) + '</div>' +
      '</div>' +
    '</section>';

    html += '<footer class="footer">© 2026 汤姆猫跑酷学堂 · 让学习像游戏一样有趣　|　答案判定引擎自检 ' + test.passed + '/' + test.total + ' 通过</footer>';
    return html;
  }

  function featureCard(emoji, title, desc) {
    return '<div class="card feature-card">' +
      '<div class="feature-icon">' + emoji + '</div>' +
      '<h3>' + title + '</h3><p>' + desc + '</p>' +
    '</div>';
  }

  /* ============================================================
   * 学生端
   * ============================================================ */
  function viewStudent() {
    var me = myPoints();
    var snap = scopedSnapshot('today');
    var acc = accuracy();
    var subject = PK.subjectByKey(ui.subject);
    var pool = PK.questionsFor({ subject: ui.subject, difficulty: ui.difficulty });
    var html = '';

    html += '<section class="student-top">' +
      '<div class="profile-card fade-in">' +
        '<div class="row" style="gap:14px">' +
          '<div class="profile-avatar">' + S.user.emoji + '</div>' +
          '<div class="grow">' +
            '<div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="font-size:22px;font-weight:900">' + esc(S.user.name) + '</h2>' +
            '<span class="badge" style="background:rgba(255,255,255,.24);color:#fff">学生</span>' +
            (myClass() ? '<span class="badge" style="background:rgba(255,255,255,.24);color:#fff">' + esc(myClass().name) + ' · 班级码 ' + esc(myClass().code) + '</span>' : '') +
            '</div>' +
            '<p style="opacity:.9;font-size:13px;margin-top:4px">' +
              (myClass() ? ('已加入 ' + esc(myClass().name) + '，欢迎回来，今天也要加油！') : '还没有班级，输入老师给的 4 位班级码即可加入') +
            '</p>' +
          '</div>' +
          '<div class="row" style="gap:8px;flex-wrap:wrap">' +
            (myClass() ? '<button class="btn btn-ghost btn-sm" data-action="join-class">切换班级</button>' : '<button class="btn btn-accent btn-sm" data-action="join-class">加入班级</button>') +
            '<button class="btn btn-ghost btn-sm" data-action="rename">修改昵称</button>' +
          '</div>' +
        '</div>' +
        '<div class="profile-stats">' +
          '<div class="profile-stat"><b>' + fmt(me ? me.score : 0) + '</b><span>今日积分</span></div>' +
          '<div class="profile-stat"><b>第 ' + (me ? me.rank : '-') + '</b><span>班级排名</span></div>' +
          '<div class="profile-stat"><b>' + fmt(S.coins) + '</b><span>金币余额</span></div>' +
          '<div class="profile-stat"><b>' + acc + '%</b><span>总正确率</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="card fade-in">' +
        '<div class="card-title"><span class="emoji">🎯</span>本节课目标</div>' +
        '<div class="list-row"><span class="grow">完成 10 道题</span><b>' + Math.min(10, totalAnswered()) + '/10</b></div>' +
        '<div class="list-row"><span class="grow">正确率 ≥ 80%</span><b>' + acc + '%</b></div>' +
        '<div class="list-row"><span class="grow">错题修复</span><b>' + S.wrongIds.length + ' 道待处理</b></div>' +
        '<button class="btn btn-accent btn-block" style="margin-top:12px" data-action="start-game">▶ 开始 ' + subject.name + ' · ' + difficultyName(ui.difficulty) + '</button>' +
      '</div>' +
    '</section>';

    var hw = homeworkForMe();
    if (hw.length) {
      html += '<section class="card fade-in" style="margin-top:18px">' +
        '<div class="card-title"><span class="emoji">📝</span>待完成作业 <span class="card-sub">共 ' + hw.length + ' 项' + (myClass() ? ' · ' + esc(myClass().name) : '') + '</span></div>' +
        '<div class="hw-list">' +
          hw.map(function (h) {
            var done = homeworkDone(h);
            var count = (h.questionIds || []).length;
            return '<div class="hw-item' + (done ? ' done' : '') + '">' +
              '<div class="hw-emoji">' + (done ? '✅' : '📌') + '</div>' +
              '<div class="grow"><b>' + esc(h.title) + '</b>' +
                '<div class="lb-sub">' + count + ' 道题 · ' + (h.due ? ('截止 ' + esc(h.due)) : '长期有效') + ' · 来自 ' + esc(h.className || '我的班级') + '</div>' +
                (h.note ? '<div class="lb-sub">📝 ' + esc(h.note) + '</div>' : '') +
                (h.image ? '<img class="q-image hw-image" src="' + esc(h.image) + '" alt="作业配图">' : '') +
                (h.link && h.link.url ? '<a class="q-link" href="' + esc(h.link.url) + '" target="_blank" rel="noopener">🔗 ' + esc(h.link.title || '参考资料') + '</a>' : '') +
              '</div>' +
              (done
                ? '<span class="badge live">已完成</span>'
                : '<button class="btn btn-primary btn-sm" data-action="start-homework" data-id="' + h.id + '">▶ 去完成</button>') +
            '</div>';
          }).join('') +
        '</div>' +
      '</section>';
    }

    var mine = myAsks();
    if (mine.length) {
      var openMine = mine.filter(function (a) { return a.status !== 'answered'; });
      html += '<section class="card fade-in" style="margin-top:18px">' +
        '<div class="row between wrap" style="gap:10px">' +
          '<div class="card-title" style="margin:0"><span class="emoji">🙋</span>我的提问 <span class="card-sub">待回复 ' + openMine.length + ' / 共 ' + mine.length + ' 条</span></div>' +
          '<div class="row" style="gap:8px">' +
            '<button class="btn btn-ghost btn-sm" data-go="#/student/ask">全部提问 →</button>' +
            '<button class="btn btn-accent btn-sm" data-action="ask-open">＋ 向老师提问</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-top:12px">' + mine.slice(0, 2).map(function (a) { return askRowHtml(a, false); }).join('') + '</div>' +
      '</section>';
    }

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">📚</span>选择学科 <span class="card-sub">共 9 个学科</span></div>' +
      '<div class="subject-grid">' + PK.SUBJECTS.map(subjectTile).join('') + '</div>' +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">⚡</span>选择关卡难度 <span class="card-sub">' + subject.name + ' 当前可选 ' + pool.length + ' 道题</span></div>' +
      '<div class="diff-row">' +
        PK.DIFFICULTIES.map(function (d) {
          var count = PK.questionsFor({ subject: ui.subject, difficulty: d.key }).length;
          return '<button class="diff-btn' + (ui.difficulty === d.key ? ' active' : '') + '" data-action="pick-difficulty" data-key="' + d.key + '">' +
            '<b><span class="badge ' + d.key + '">' + d.name + '</span></b>' +
            '<span>' + d.desc + ' · ' + count + ' 题</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="row" style="margin-top:16px;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn-primary btn-lg" data-action="start-game">🚀 开始闯关</button>' +
        '<button class="btn btn-ghost" data-action="start-wrong">🧯 错题修复（' + S.wrongIds.length + '）</button>' +
        '<button class="btn btn-ghost" data-action="start-mixed">🎲 随机混合闯关</button>' +
      '</div>' +
    '</section>';

    html += '<section class="grid grid-4" style="margin-top:18px">' +
      quickLink('🙋', '向老师提问', '不会的题直接问老师', '#/student/ask') +
      quickLink(partnerMeta(equippedPartnerId()).emoji, '伙伴 ' + partnerMeta(equippedPartnerId()).name,
        'Lv' + partnerLevel(equippedPartnerId()) + ' · 点我和我聊天', '#/student/chat') +
      quickLink('🧯', '错题修复', S.wrongIds.length + ' 道错题待复习', '#/student/wrong') +
      quickLink('🏡', '我的家园', '金币 ' + fmt(S.coins) + ' · 装扮与徽章', '#/student/garden') +
      quickLink('📊', '数据中心', '正确率 ' + acc + '%', '#/student/data') +
      quickLink('🏆', '实时榜单', '当前第 ' + (me ? me.rank : '-') + ' 名', '#/leaderboard') +
    '</section>';

    html += '<section class="split" style="margin-top:18px">' +
      '<div class="card">' +
        '<div class="card-title"><span class="emoji">🏆</span>实时积分榜单 <span class="live-dot"></span><span class="card-sub">每 2 秒刷新</span></div>' +
        '<div data-live="student-lb">' + leaderboardRows(snap.entries.slice(0, 8), false) + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title"><span class="emoji">📡</span>实时动态</div>' +
        '<div class="feed" data-live="student-feed">' + feedHtml(snap.events) + '</div>' +
      '</div>' +
    '</section>';
    return html;
  }

  function quickLink(emoji, title, sub, href) {
    return '<button class="quick-link" data-go="' + href + '">' +
      '<div class="quick-icon">' + emoji + '</div>' +
      '<div class="grow"><b>' + title + '</b><p>' + sub + '</p></div>' +
      '<span class="muted">›</span>' +
    '</button>';
  }

  function difficultyName(key) {
    var d = PK.DIFFICULTIES.filter(function (x) { return x.key === key; })[0];
    return d ? d.name : key;
  }

  /* ============================================================
   * 跑酷闯关
   * ============================================================ */
  var currentGame = null;

  function viewGame(segments) {
    var mode = segments[2] || 'normal';
    var opts = { maxQuestions: 10 };

    if (mode === 'wrong') {
      var ids = S.wrongIds.slice(0, 12);
      if (!ids.length) {
        return '<div class="card center"><div style="font-size:40px">🎉</div><h2 style="margin-top:8px">错题本是空的</h2>' +
          '<p class="muted" style="margin-top:6px">先去闯关吧，答错的题目会自动收进这里。</p>' +
          '<button class="btn btn-primary" style="margin-top:16px" data-go="#/student">返回学生端</button></div>';
      }
      opts.questions = ids.map(questionById).filter(Boolean);
      opts.subjectName = '错题修复';
      opts.difficultyName = '专项训练';
      opts.scene = ['#1a0f2e', '#2d1b5e'];
    } else if (mode === 'mixed') {
      opts.questions = PK.questionsFor({ subject: 'all', difficulty: 'all', shuffle: true, seed: Date.now() }).slice(0, 10);
      opts.subjectName = '随机混合';
      opts.difficultyName = '综合挑战';
      opts.scene = ['#0f172a', '#1e3a5f'];
    } else if (mode === 'homework') {
      var hw = homeworkById(segments[3]);
      opts.questions = hw ? (hw.questionIds || []).map(questionById).filter(Boolean) : [];
      opts.subjectName = hw ? hw.title : '家庭作业';
      opts.difficultyName = '班级作业';
      opts.subjectKey = opts.questions[0] ? opts.questions[0].subject : 'math';
      opts.scene = ['#241038', '#3a1b5e'];
    } else {
      var subjectKey = segments[2] || ui.subject;
      var diffKey = segments[3] || ui.difficulty;
      ui.subject = subjectKey;
      ui.difficulty = diffKey;
      var subject = PK.subjectByKey(subjectKey);
      opts.questions = PK.questionsFor({ subject: subjectKey, difficulty: diffKey });
      if (opts.questions.length < 4) opts.questions = PK.questionsFor({ subject: subjectKey });
      opts.questions = PK.shuffle(opts.questions, Date.now()).slice(0, 10);
      opts.subjectName = subject.name;
      opts.subjectKey = subjectKey;
      opts.difficultyName = difficultyName(diffKey);
      opts.scene = subject.scene;
    }
    opts.subjectKey = opts.subjectKey || (opts.questions[0] ? opts.questions[0].subject : 'math');

    var subjectObj = PK.subjectByKey(opts.subjectKey);
    return '<div class="fade-in">' +
      '<div class="row between" style="margin-bottom:14px">' +
        '<h2 style="font-size:19px;font-weight:900">' + subjectObj.emoji + ' ' + opts.subjectName + ' · ' + opts.difficultyName + '</h2>' +
        '<button class="btn btn-ghost btn-sm" data-go="#/student">← 返回学生端</button>' +
      '</div>' +
      '<div id="gameHost"></div>' +
    '</div>';
  }

  function mountGame() {
    var host = $('#gameHost');
    if (!host) return;
    if (currentGame) { currentGame.destroy(); currentGame = null; }

    var segments = parseRoute().segments;
    var mode = segments[2] || 'normal';
    var subjectKey = mode === 'normal' ? (segments[2] && PK.subjectByKey(segments[2]) ? segments[2] : ui.subject) : 'math';
    var questions;
    var subjectName, difficultyLabel, scene;
    var homeworkId = null;

    if (mode === 'wrong') {
      questions = S.wrongIds.slice(0, 12).map(questionById).filter(Boolean);
      subjectName = '错题修复'; difficultyLabel = '专项训练';
      scene = ['#1a0f2e', '#2d1b5e'];
      subjectKey = questions[0] ? questions[0].subject : 'math';
    } else if (mode === 'mixed') {
      questions = PK.questionsFor({ shuffle: true, seed: Date.now() }).slice(0, 10);
      subjectName = '随机混合'; difficultyLabel = '综合挑战';
      scene = ['#0f172a', '#1e3a5f'];
    } else if (mode === 'homework') {
      var hw = homeworkById(segments[3]);
      homeworkId = hw ? hw.id : null;
      questions = hw ? (hw.questionIds || []).map(questionById).filter(Boolean) : [];
      subjectName = hw ? hw.title : '家庭作业'; difficultyLabel = '班级作业';
      scene = ['#241038', '#3a1b5e'];
      subjectKey = questions[0] ? questions[0].subject : 'math';
    } else {
      var subj = PK.subjectByKey(segments[2] || ui.subject);
      var diff = segments[3] || ui.difficulty;
      subjectKey = subj.key;
      questions = PK.questionsFor({ subject: subj.key, difficulty: diff });
      if (questions.length < 4) questions = PK.questionsFor({ subject: subj.key });
      questions = PK.shuffle(questions, Date.now()).slice(0, 10);
      subjectName = subj.name; difficultyLabel = difficultyName(diff);
      scene = subj.scene;
    }
    if (!questions.length) {
      host.innerHTML = '<div class="empty"><span class="em">📭</span>这个关卡暂时没有题目，换个学科试试吧。</div>';
      return;
    }

    currentGame = window.PKGame.mount(host, {
      questions: questions,
      scene: scene,
      subjectName: subjectName,
      difficultyName: difficultyLabel,
      subjectKey: subjectKey,
      runner: equippedPartnerId(),
      partnerName: partnerMeta(equippedPartnerId()).name,
      partnerLevel: partnerLevel(equippedPartnerId()),
      coinBonusPct: partnerBonus(equippedPartnerId()).coin,
      scoreBonusPct: partnerBonus(equippedPartnerId()).score,
      seed: Date.now() % 100000,
      onEvent: function (ev) {
        if (ev.type === 'notice') toast(ev.message);
        else if (ev.type === 'hurt') toast(ev.reason + '，剩余生命 ' + ev.lives, 'bad');
      },
      onAnswer: function (correct, question) {
        var st = statsFor(question.subject);
        st.answered += 1;
        if (correct) {
          st.correct += 1;
          st.points += 12;
          // 积分由数据源统一入账（连后端时为后端权威值，onAward 回调里累计到每日趋势）
          leaderboard.addMineAnswer(true, question.subject, question.difficulty === 'final' ? 20 : question.difficulty === 'consolidated' ? 10 : 0);
          S.coins += 20;
          if (S.wrongIds.indexOf(question.id) !== -1 && correct) {
            S.wrongIds = S.wrongIds.filter(function (id) { return id !== question.id; });
            if (S.masteredIds.indexOf(question.id) === -1) S.masteredIds.push(question.id);
            toast('错题已攻克：' + question.content.slice(0, 14) + '…', 'ok');
          }
        } else {
          leaderboard.addMineAnswer(false, question.subject);
          if (S.wrongIds.indexOf(question.id) === -1) S.wrongIds.push(question.id);
        }
        save();
        refreshLive();
      },
      onEnd: function (result) {
        S.coins += result.gold;
        S.history.unshift({
          id: uid('run'),
          subject: subjectName,
          difficulty: difficultyLabel,
          score: result.score,
          gold: result.gold,
          correct: result.correct,
          answered: result.answered,
          accuracy: result.accuracy,
          at: Date.now(),
          victory: result.victory
        });
        S.history = S.history.slice(0, 40);
        result.wrongIds.forEach(function (id) { if (S.wrongIds.indexOf(id) === -1) S.wrongIds.push(id); });
        result.wrongIds.forEach(function (id) {
          if (S.masteredIds.indexOf(id) !== -1) S.masteredIds = S.masteredIds.filter(function (x) { return x !== id; });
        });
        if (homeworkId) {
          var hwDone = homeworkById(homeworkId);
          if (hwDone) {
            hwDone.submissions = hwDone.submissions || {};
            hwDone.submissions[S.user.name] = {
              at: Date.now(), score: result.score, accuracy: result.accuracy,
              correct: result.correct, answered: result.answered, victory: result.victory
            };
            toast(result.victory ? '作业已完成并提交，老师能看到你的成绩啦' : '作业本次未通过，可以再挑战一次', result.victory ? 'ok' : 'bad');
          }
        }
        save();
        refreshLive();
        if (result.victory) confetti(90);
        if (!homeworkId) toast(result.victory ? '闯关成功！+' + result.score + ' 分 · +' + result.gold + ' 金币' : '本次获得 ' + result.gold + ' 金币，继续加油！', result.victory ? 'ok' : 'bad');
      },
      onRestart: function () { mountGame(); },
      onQuit: function () { location.hash = '#/student'; }
    });
  }

  /* ============================================================
   * 错题修复
   * ============================================================ */
  function viewWrong() {
    var items = S.wrongIds.map(questionById).filter(Boolean);
    var html = '<div class="fade-in">' +
      '<div class="row between" style="margin-bottom:16px">' +
        '<div><h2 style="font-size:20px;font-weight:900">🧯 错题修复</h2>' +
        '<p class="muted" style="font-size:13px;margin-top:4px">答错的题目会自动收录，答对后自动移出</p></div>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn-ghost btn-sm" data-action="clear-wrong"' + (items.length ? '' : ' disabled') + '>清空错题</button>' +
          '<button class="btn btn-primary" data-action="start-wrong"' + (items.length ? '' : ' disabled') + '>▶ 开始修复训练</button>' +
        '</div>' +
      '</div>';

    if (!items.length) {
      html += '<div class="empty"><span class="em">🎉</span>太棒了，目前没有错题！<br>去闯关挑战更多题目吧。</div>';
    } else {
      html += '<div class="grid grid-2">' + items.map(function (q) {
        var subj = PK.subjectByKey(q.subject);
        var expected = PK.grade(q, q.answer);
        return '<div class="card">' +
          '<div class="row between" style="margin-bottom:10px">' +
            '<span class="badge ' + q.difficulty + '">' + subj.emoji + ' ' + subj.name + ' · ' + difficultyName(q.difficulty) + '</span>' +
            '<span class="badge">' + typeName(q.type) + ' · ' + esc(q.chapter || '') + '</span>' +
          '</div>' +
          '<div style="font-weight:700;line-height:1.65;font-size:14.5px">' + esc(q.content) + '</div>' +
          (q.image ? '<img class="q-image" src="' + esc(q.image) + '" alt="题目配图">' : '') +
          (q.link && q.link.url ? '<a class="q-link" href="' + esc(q.link.url) + '" target="_blank" rel="noopener">🔗 ' + esc(q.link.title || '参考资料') + '</a>' : '') +
          (q.options && q.options.length ? '<div class="muted" style="font-size:12.5px;margin-top:8px">' + q.options.map(function (o, i) { return String.fromCharCode(65 + i) + '. ' + esc(o); }).join('　') + '</div>' : '') +
          '<div class="analysis"><b>正确答案</b>　' + esc(expected.expectedText) + '<br><b>解析</b>　' + esc(q.analysis) + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }

  function typeName(t) {
    return t === 'judge' ? '判断题' : t === 'fill' ? '填空题' : '单选题';
  }

  /* ============================================================
   * 我的家园（金币商城）
   * ============================================================ */
  var SHOP = [
    { id: 'partner-cat', type: 'partner', name: '汤姆猫', art: '🐱', price: 0, rarity: 'common', desc: '默认伙伴，一起跑酷' },
    { id: 'partner-dino', type: 'partner', name: '小恐龙', art: '🦖', price: 300, rarity: 'rare', desc: '冲刺时尾巴会发光' },
    { id: 'partner-rocket', type: 'partner', name: '火箭背包', art: '🚀', price: 600, rarity: 'epic', desc: '跳跃高度 +10%（外观）' },
    { id: 'partner-unicorn', type: 'partner', name: '彩虹独角兽', art: '🦄', price: 1200, rarity: 'legend', desc: '全学科积分 +5%（外观）' },
    { id: 'deco-plant', type: 'deco', name: '绿植盆栽', art: '🪴', price: 120, rarity: 'common', desc: '给房间添一点生机' },
    { id: 'deco-lamp', type: 'deco', name: '星星台灯', art: '💡', price: 180, rarity: 'common', desc: '夜里一闪一闪的' },
    { id: 'deco-rug', type: 'deco', name: '彩虹地毯', art: '🌈', price: 200, rarity: 'rare', desc: '踩上去软软的' },
    { id: 'deco-cake', type: 'deco', name: '奖励蛋糕', art: '🍰', price: 240, rarity: 'rare', desc: '庆祝每一次进步' },
    { id: 'deco-sofa', type: 'deco', name: '云朵沙发', art: '🛋️', price: 260, rarity: 'rare', desc: '坐上去会陷进去' },
    { id: 'deco-books', type: 'deco', name: '小书架', art: '📚', price: 300, rarity: 'rare', desc: '摆满你喜欢的书' },
    { id: 'deco-fish', type: 'deco', name: '小水族箱', art: '🐠', price: 420, rarity: 'epic', desc: '小鱼会吐泡泡' },
    { id: 'deco-game', type: 'deco', name: '游戏机', art: '🎮', price: 520, rarity: 'epic', desc: '休息一下再学习' },
    { id: 'deco-window', type: 'deco', name: '星空落地窗', art: '🪟', price: 660, rarity: 'legend', desc: '抬头就能看见星星' },
    { id: 'badge-math', type: 'badge', name: '数学小达人', art: '📐', price: 200, rarity: 'rare', desc: '数学连对 10 题解锁' },
    { id: 'badge-storm', type: 'badge', name: '连击风暴', art: '⚡', price: 400, rarity: 'epic', desc: '单局连击 ×8 解锁' },
    { id: 'badge-champion', type: 'badge', name: '榜单冠军', art: '🏆', price: 800, rarity: 'legend', desc: '登顶实时榜单解锁' },
    { id: 'theme-star', type: 'theme', name: '星空赛道', art: '🌌', price: 0, rarity: 'common', desc: '默认赛道主题' },
    { id: 'theme-candy', type: 'theme', name: '糖果森林', art: '🍬', price: 500, rarity: 'rare', desc: '糖果色跑道与金币' },
    { id: 'theme-ocean', type: 'theme', name: '深海竞速', art: '🌊', price: 900, rarity: 'epic', desc: '气泡粒子与蓝色赛道' }
  ];

  /* ============================================================
   * 伙伴（成长 / 出战 / 对话）辅助
   * ============================================================ */
  var PARTNER_META = {
    'partner-cat': { name: '汤姆', emoji: '🐱', tag: '温柔机灵', color: '#f59e0b' },
    'partner-dino': { name: '阿古', emoji: '🦖', tag: '憨憨可靠', color: '#22c55e' },
    'partner-rocket': { name: '小火箭', emoji: '🚀', tag: '元气满满', color: '#ef524d' },
    'partner-unicorn': { name: '彩虹', emoji: '🦄', tag: '梦幻温柔', color: '#a855f7' }
  };
  function partnerMeta(id) { return PARTNER_META[id] || PARTNER_META['partner-cat']; }
  function partnerLevel(id) {
    var rec = (S.partners || {})[id];
    return (rec && Number(rec.level)) || 1;
  }
  function partnerBonus(id) {
    var lv = partnerLevel(id);
    return { coin: (lv - 1) * 4, score: (lv - 1) * 3, level: lv };
  }
  function upgradeCost(level) { return 150 + (level - 1) * 120; }
  function ownedPartners() {
    return SHOP.filter(function (it) {
      return it.type === 'partner' && S.inventory.indexOf(it.id) !== -1;
    });
  }
  function equippedPartnerId() {
    var id = S.equipped && S.equipped.partner;
    return PARTNER_META[id] ? id : 'partner-cat';
  }
  function homeDecoSlots() { return 8; }
  function placedDeco() { return (S.home && S.home.placed) || []; }

  var RARITY_CN = { common: '普通', rare: '稀有', epic: '史诗', legend: '传说' };
  function decoById(id) { return SHOP.filter(function (x) { return x.id === id; })[0] || null; }

  function shopSection(type, label, emoji) {
    var html = '<section class="card" style="margin-top:18px"><div class="card-title"><span class="emoji">' + emoji + '</span>' + label + '</div><div class="grid grid-4">';
    SHOP.filter(function (it) { return it.type === type; }).forEach(function (it) {
      var owned = S.inventory.indexOf(it.id) !== -1;
      var equipped = S.equipped[type] === it.id;
      html += '<div class="shop-item' + (owned ? ' owned' : '') + '">' +
        '<div class="shop-art">' + it.art + '</div>' +
        '<div><b>' + it.name + '</b><div class="lb-sub" style="margin-top:4px">' + it.desc + '</div></div>' +
        '<span class="rarity ' + it.rarity + '">' + RARITY_CN[it.rarity] + '</span>' +
        (owned
          ? '<button class="btn ' + (equipped ? 'btn-ghost' : 'btn-accent') + ' btn-sm btn-block" data-action="equip" data-id="' + it.id + '" data-type="' + type + '"' + (equipped ? ' disabled' : '') + '>' + (equipped ? '已装备' : '装备') + '</button>'
          : '<button class="btn btn-secondary btn-sm btn-block" data-action="buy" data-id="' + it.id + '">🪙 ' + it.price + ' 金币</button>') +
      '</div>';
    });
    return html + '</div></section>';
  }

  function viewGarden() {
    var partId = equippedPartnerId();
    var pm = partnerMeta(partId);
    var bonus = partnerBonus(partId);
    var lv = partnerLevel(partId);
    var html = '<div class="fade-in">';

    html += '<section class="profile-card" style="background:linear-gradient(120deg,#f49d25,#f5b551 45%,#28bd66 130%)">' +
      '<div class="row between wrap" style="gap:12px">' +
        '<div><h2 style="font-size:22px;font-weight:900">🏡 我的家园</h2>' +
        '<p style="opacity:.94;font-size:13px;margin-top:6px">答题赚金币 → 给伙伴升级 → 装饰你们的家</p></div>' +
        '<div class="row" style="gap:14px;align-items:center">' +
          '<div style="text-align:right"><div style="font-size:28px;font-weight:900">' + fmt(S.coins) + '</div><span style="font-size:12px;opacity:.9">金币余额</span></div>' +
          '<button class="btn btn-primary" data-go="#/student/chat">💬 和伙伴聊天</button>' +
        '</div>' +
      '</div></section>';

    // 房间场景
    var placed = placedDeco();
    var slots = [];
    for (var i = 0; i < homeDecoSlots(); i++) {
      var item = placed.filter(function (p) { return p.slot === i; })[0];
      var def = item ? decoById(item.id) : null;
      slots.push('<div class="home-slot' + (def ? ' filled' : '') + '">' +
        (def ? '<span class="home-deco" title="' + esc(def.name) + '">' + def.art + '</span>' +
          '<button class="home-slot-x" data-action="remove-deco" data-slot="' + i + '" title="收起">×</button>'
          : '<span class="home-slot-hint">空位</span>') +
      '</div>');
    }
    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🛋️</span>你们的家 <span class="card-sub">已摆放 ' + placed.length + ' / ' + homeDecoSlots() + ' 件</span></div>' +
      '<div class="home-room">' +
        '<div class="home-wall"></div>' +
        '<div class="home-slots">' + slots.join('') + '</div>' +
        '<div class="home-partner">' +
          '<div class="home-partner-art">' + pm.emoji + '</div>' +
          '<div class="home-partner-plate"><b>' + esc(pm.name) + '</b> · Lv' + lv +
            ' <span class="lb-sub">金币 +' + bonus.coin + '% · 分数 +' + bonus.score + '%</span></div>' +
          '<div class="home-partner-say" id="partnerSay">“' + esc(pm.name) + '在等你一起去跑酷～”</div>' +
        '</div>' +
      '</div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:10px">提示：买下摆件会自动放进空位；点摆件右上角的 × 可以收起，再买一件就能换位置。</p>' +
    '</section>';

    // 伙伴成长
    var owned = ownedPartners();
    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🐾</span>伙伴成长 <span class="card-sub">升级后一起跑酷金币更多</span></div>' +
      '<div class="partner-grid">' +
        owned.map(function (p) {
          var meta = partnerMeta(p.id);
          var l = partnerLevel(p.id);
          var b = partnerBonus(p.id);
          var isOn = p.id === partId;
          var cost = upgradeCost(l);
          var maxed = l >= 10;
          return '<div class="partner-card' + (isOn ? ' on' : '') + '">' +
            '<div class="partner-art" style="background:linear-gradient(140deg,#fff,' + meta.color + '22)">' + meta.emoji + '</div>' +
            '<div class="row between" style="margin-top:10px"><b>' + esc(meta.name) + '</b><span class="badge">Lv' + l + '</span></div>' +
            '<div class="lb-sub" style="margin-top:4px">' + meta.tag + ' · 金币 +' + b.coin + '% · 分数 +' + b.score + '%</div>' +
            '<div class="bar-track" style="margin-top:8px"><div class="bar-fill" style="width:' + (l / 10 * 100) + '%"></div></div>' +
            '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">' +
              (isOn
                ? '<button class="btn btn-ghost btn-sm grow" disabled>出战中</button>'
                : '<button class="btn btn-accent btn-sm grow" data-action="equip" data-id="' + p.id + '" data-type="partner">出战</button>') +
              (maxed
                ? '<button class="btn btn-ghost btn-sm grow" disabled>已满级</button>'
                : '<button class="btn btn-secondary btn-sm grow" data-action="upgrade-partner" data-id="' + p.id + '">⬆ 升级 🪙' + cost + '</button>') +
              '<button class="btn btn-ghost btn-sm" data-action="chat-partner" data-id="' + p.id + '">💬</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</section>';

    // 伙伴商店（还没买的）
    var unowned = SHOP.filter(function (it) { return it.type === 'partner' && S.inventory.indexOf(it.id) === -1; });
    if (unowned.length) {
      html += '<section class="card" style="margin-top:18px">' +
        '<div class="card-title"><span class="emoji">🛒</span>伙伴商店 <span class="card-sub">买下就能出战、也能陪聊</span></div>' +
        '<div class="grid grid-4">' +
          unowned.map(function (it) {
            var meta = partnerMeta(it.id);
            return '<div class="shop-item">' +
              '<div class="shop-art">' + it.art + '</div>' +
              '<div><b>' + it.name + '</b><div class="lb-sub" style="margin-top:4px">' + meta.tag + '</div></div>' +
              '<span class="rarity ' + it.rarity + '">' + RARITY_CN[it.rarity] + '</span>' +
              '<button class="btn btn-secondary btn-sm btn-block" data-action="buy" data-id="' + it.id + '">🪙 ' + it.price + ' 金币</button>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</section>';
    }

    // 摆件商店
    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🧸</span>家园摆件 <span class="card-sub">买下即自动摆放</span></div>' +
      '<div class="grid grid-4">' +
        SHOP.filter(function (it) { return it.type === 'deco'; }).map(function (it) {
          var count = placed.filter(function (p) { return p.id === it.id; }).length;
          var full = placed.length >= homeDecoSlots();
          return '<div class="shop-item">' +
            '<div class="shop-art">' + it.art + '</div>' +
            '<div><b>' + it.name + '</b><div class="lb-sub" style="margin-top:4px">' + it.desc + (count ? ' · 已摆 ' + count + ' 件' : '') + '</div></div>' +
            '<span class="rarity ' + it.rarity + '">' + RARITY_CN[it.rarity] + '</span>' +
            '<button class="btn btn-secondary btn-sm btn-block" data-action="buy-deco" data-id="' + it.id + '"' + (full ? ' disabled' : '') + '>' +
              (full ? '位置已满' : '🪙 ' + it.price) + '</button>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</section>';

    html += shopSection('badge', '徽章', '🏅');
    html += shopSection('theme', '赛道主题', '🌌');
    return html + '</div>';
  }

  /* ============================================================
   * 伙伴聊天（本地陪伴模式 + 可选接入大模型）
   * ============================================================ */
  var chatState = { brain: null, brainId: '', chips: [], sending: false };

  function chatCtx() {
    var partId = equippedPartnerId();
    var me = myPoints();
    var weak = null, worst = 101;
    PK.SUBJECTS.forEach(function (s) {
      var st = S.stats[s.key];
      if (!st || !st.answered) return;
      var rate = Math.round((st.correct / st.answered) * 100);
      if (rate < worst) { worst = rate; weak = s.name; }
    });
    return {
      userName: S.user.name,
      coins: S.coins,
      level: partnerLevel(partId),
      points: me ? me.score : 0,
      rank: me ? me.rank : 0,
      wrongCount: S.wrongIds.length,
      subject: ui.subject,
      subjectName: PK.subjectByKey(ui.subject).name,
      weakSubject: weak,
      homeworkCount: homeworkForMe().length,
      customQuestions: S.customQuestions || [],
      accuracy: accuracy(),
      partnerId: partId
    };
  }
  function chatBrain() {
    var id = equippedPartnerId();
    if (!chatState.brain || chatState.brainId !== id) {
      chatState.brain = window.PKChat.create(id, chatCtx);
      chatState.brainId = id;
    }
    return chatState.brain;
  }
  function chatMessages(id) {
    if (!S.chat) S.chat = {};
    if (!S.chat[id]) S.chat[id] = [];
    return S.chat[id];
  }
  function chatPush(partnerId, who, text) {
    var list = chatMessages(partnerId);
    list.push({ who: who, text: String(text), at: Date.now() });
    if (list.length > 40) list.splice(0, list.length - 40);
    save();
  }
  function chatModeLabel() {
    if (S.aiConfig && S.aiConfig.endpoint) return '已接入大模型';
    if (window.ai && window.ai.languageModel) return '浏览器内置模型';
    return '本地陪伴模式';
  }
  function chatListHtml(partnerId) {
    var pm = partnerMeta(partnerId);
    var list = chatMessages(partnerId);
    if (!list.length) {
      return '<div class="chat-empty">' + pm.emoji + '<div>点下面的按钮，或直接说点什么，' + esc(pm.name) + '就会回应你～</div></div>';
    }
    return list.map(function (m) {
      var body = esc(m.text).replace(/\n/g, '<br>');
      return m.who === 'me'
        ? '<div class="chat-msg me"><div class="chat-bubble">' + body + '</div></div>'
        : '<div class="chat-msg ai"><div class="chat-mini-avatar">' + pm.emoji + '</div><div class="chat-bubble">' + body + '</div></div>';
    }).join('');
  }
  function chatChipsHtml() {
    var chips = chatState.chips && chatState.chips.length ? chatState.chips : ['给我出道题', '讲个笑话', '今天学什么', '鼓励我一下'];
    return chips.map(function (c) {
      return '<button class="chat-chip" data-action="chat-chip" data-text="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  }
  function viewChat() {
    var partId = equippedPartnerId();
    var pm = partnerMeta(partId);
    var lv = partnerLevel(partId);
    if (!chatMessages(partId).length) {
      var welcome = chatBrain().greet();
      chatPush(partId, 'ai', welcome.text);
      chatState.chips = welcome.chips;
    }
    return '<div class="fade-in chat-page">' +
      '<div class="row between wrap" style="gap:12px;margin-bottom:14px">' +
        '<div class="row" style="gap:12px">' +
          '<div class="chat-avatar">' + pm.emoji + '</div>' +
          '<div><h2 style="font-size:19px;font-weight:900">' + esc(pm.name) + ' <span class="badge">Lv' + lv + '</span></h2>' +
          '<p class="muted" style="font-size:12.5px;margin-top:3px">' + esc(pm.tag) + ' · ' + chatModeLabel() + '</p></div>' +
        '</div>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" data-action="ai-config">⚙ AI 设置</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="clear-chat">清空对话</button>' +
          '<button class="btn btn-ghost btn-sm" data-go="#/student/game/' + ui.subject + '/' + ui.difficulty + '">🏃 去跑酷</button>' +
        '</div>' +
      '</div>' +
      '<div class="chat-box">' +
        '<div class="chat-list" id="chatList">' + chatListHtml(partId) + '</div>' +
        '<div class="chat-chips" id="chatChips">' + chatChipsHtml() + '</div>' +
        '<div class="chat-input-row">' +
          '<input class="input" id="chatInput" placeholder="和' + esc(pm.name) + '说点什么…" autocomplete="off" maxlength="200">' +
          '<button class="btn btn-primary" data-action="chat-send">发送</button>' +
        '</div>' +
      '</div>' +
      '<p class="muted chat-tip">本地陪伴模式不需要联网，可以出题、讲题、鼓励你；如果想让伙伴像豆包一样自由对话，点右上角「AI 设置」填一个你自己的大模型接口即可。</p>' +
    '</div>';
  }
  function renderChatOnly() {
    var partId = equippedPartnerId();
    var listEl = $('#chatList');
    if (listEl) listEl.innerHTML = chatListHtml(partId);
    var chipsEl = $('#chatChips');
    if (chipsEl) chipsEl.innerHTML = chatChipsHtml();
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }
  function scrollChatToEnd() {
    var listEl = $('#chatList');
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }
  function chatFinish(partnerId, reply) {
    chatPush(partnerId, 'ai', reply.text);
    chatState.chips = reply.chips || [];
    renderChatOnly();
  }
  function chatSend(text) {
    text = String(text || '').trim();
    if (!text) return;
    var partId = equippedPartnerId();
    chatPush(partId, 'me', text);
    chatState.chips = [];
    renderChatOnly();
    var cfg = S.aiConfig;
    if (cfg && cfg.endpoint) {
      chatState.sending = true;
      askRemoteModel(cfg, text).then(function (out) {
        chatState.sending = false;
        if (out) chatFinish(partId, { text: out, chips: ['给我出道题', '讲个笑话'] });
        else chatFinish(partId, chatBrain().reply(text));
      }).catch(function () {
        chatState.sending = false;
        var r = chatBrain().reply(text);
        r.text = '（大模型暂时连不上，先用本地陪伴模式回答你）\n' + r.text;
        chatFinish(partId, r);
      });
      return;
    }
    setTimeout(function () { chatFinish(partId, chatBrain().reply(text)); }, 140);
  }
  function askRemoteModel(cfg, text) {
    var partId = equippedPartnerId();
    var pm = partnerMeta(partId);
    var history = chatMessages(partId).slice(-10).map(function (m) {
      return { role: m.who === 'me' ? 'user' : 'assistant', content: m.text };
    });
    var c = chatCtx();
    var sys = '你是中小学生的成长伙伴「' + pm.name + '」（' + pm.tag + '）。' +
      '语气亲切、简短（每次不超过 120 字），多用鼓励，遇到知识问题要讲清楚思路，不要直接给答案。' +
      '学生叫' + (c.userName || '小明') + '，当前 ' + (c.points || 0) + ' 分、金币 ' + (c.coins || 0) + '，伙伴等级 Lv' + (c.level || 1) + '。';
    var timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, 25000); });
    return Promise.race([
      fetch(cfg.endpoint, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}),
        body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: sys }].concat(history), temperature: 0.8 })
      }).then(function (r) { return r.json(); }),
      timeout
    ]).then(function (j) {
      if (!j) return '';
      if (j.choices && j.choices[0]) {
        var msg = j.choices[0].message || {};
        return msg.content || j.choices[0].text || '';
      }
      if (j.reply) return String(j.reply);
      if (j.message && typeof j.message === 'string') return j.message;
      return '';
    });
  }
  function openAiConfig() {
    var cfg = S.aiConfig || {};
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">⚙ AI 设置</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">默认「本地陪伴模式」不联网也能聊天、出题、讲题。若想让伙伴像豆包一样自由对话，可填入一个 <b>OpenAI 兼容</b>的接口（自建服务、代理或云厂商均可）。密钥只保存在你自己的浏览器里，不会上传到本站。</p>' +
      '<div class="form-field"><label>接口地址（chat/completions）</label><input class="input" id="aiEndpoint" placeholder="https://api.openai.com/v1/chat/completions" value="' + esc(cfg.endpoint || '') + '"></div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>模型名</label><input class="input" id="aiModel" placeholder="gpt-4o-mini / doubao-pro / qwen-plus…" value="' + esc(cfg.model || '') + '"></div>' +
        '<div class="form-field"><label>密钥（可留空）</label><input class="input" id="aiKey" type="password" placeholder="sk-..." value="' + esc(cfg.key || '') + '"></div>' +
      '</div>' +
      '<div id="aiMsg" class="muted modal-sub"></div>' +
      '<div class="row" style="gap:10px"><button class="btn btn-primary grow" id="aiSave">保存并启用</button>' +
      '<button class="btn btn-ghost" id="aiClear">改回本地模式</button></div>'
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };
    wrap.querySelector('#aiSave').onclick = function () {
      var endpoint = wrap.querySelector('#aiEndpoint').value.trim();
      var model = wrap.querySelector('#aiModel').value.trim();
      var key = wrap.querySelector('#aiKey').value.trim();
      if (!endpoint) { wrap.querySelector('#aiMsg').innerHTML = '<span class="bad">请填写接口地址</span>'; return; }
      S.aiConfig = { endpoint: endpoint, model: model, key: key };
      save();
      wrap.remove();
      toast('已启用大模型对话（如失败会自动切回本地陪伴）', 'ok');
      render();
    };
    wrap.querySelector('#aiClear').onclick = function () {
      S.aiConfig = null;
      save();
      wrap.remove();
      toast('已改回本地陪伴模式');
      render();
    };
  }

  /* ============================================================
   * 我的提问（学生）
   * ============================================================ */
  function viewMyAsks() {
    var mine = myAsks();
    var pending = mine.filter(function (a) { return a.status !== 'answered'; }).length;
    var html = '<div class="fade-in">' +
      '<div class="row between wrap" style="gap:12px;margin-bottom:16px">' +
        '<div><h2 style="font-size:20px;font-weight:900">🙋 我的提问</h2>' +
        '<p class="muted" style="font-size:13px;margin-top:4px">共 ' + mine.length + ' 条 · 待回复 ' + pending + ' 条 · 老师回复后会出现在下面</p></div>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-primary" data-action="ask-open">＋ 向老师提问</button>' +
          '<button class="btn btn-ghost" data-go="#/student">← 返回学生端</button>' +
        '</div>' +
      '</div>';
    if (!mine.length) {
      html += '<div class="empty"><span class="em">📮</span>还没有提过问题。<br>遇到不会的题，点右上角「向老师提问」告诉老师吧。</div>';
    } else {
      html += '<section class="card">' + mine.map(function (a) { return askRowHtml(a, false); }).join('') + '</section>';
    }
    return html + '</div>';
  }

  /* ============================================================
   * 数据中心
   * ============================================================ */
  function viewData() {
    var acc = accuracy();
    var answered = totalAnswered();
    var correctTotal = PK.SUBJECTS.reduce(function (n, s) { return n + ((S.stats[s.key] && S.stats[s.key].correct) || 0); }, 0);

    var subjectStats = PK.SUBJECTS.map(function (s) {
      var st = S.stats[s.key] || { answered: 0, correct: 0 };
      return { s: s, answered: st.answered, correct: st.correct, rate: st.answered ? Math.round((st.correct / st.answered) * 100) : 0 };
    });
    var weak = subjectStats.filter(function (x) { return x.answered > 0; }).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 4);

    var days = [];
    for (var i = 6; i >= 0; i--) {
      var key = dayKeyAgo(i);
      days.push({ key: key, label: (i === 0 ? '今天' : (i + '天前')), value: S.daily[key] || 0 });
    }
    var maxDay = Math.max(60, days.reduce(function (m, d) { return Math.max(m, d.value); }, 0));
    var points = days.map(function (d, idx) {
      var x = 20 + idx * 56;
      var y = 140 - (d.value / maxDay) * 108;
      return x + ',' + y;
    }).join(' ');

    var html = '<div class="fade-in">';
    html += '<h2 style="font-size:20px;font-weight:900;margin-bottom:16px">📊 我的数据中心</h2>';
    html += '<section class="grid grid-3">' +
      '<div class="card center">' +
        '<div class="ring">' +
          '<svg width="150" height="150"><circle cx="75" cy="75" r="62" stroke="#eef2f8" stroke-width="14" fill="none"></circle>' +
          '<circle cx="75" cy="75" r="62" stroke="url(#accGrad)" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="' + (2 * Math.PI * 62).toFixed(1) + '" stroke-dashoffset="' + (2 * Math.PI * 62 * (1 - acc / 100)).toFixed(1) + '"></circle>' +
          '<defs><linearGradient id="accGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#57b3ff"/><stop offset="100%" stop-color="#28bd66"/></linearGradient></defs></svg>' +
          '<div class="ring-label"><b>' + acc + '%</b><span>总正确率</span></div>' +
        '</div>' +
        '<div class="row" style="justify-content:center;gap:18px;margin-top:10px;font-size:13px">' +
          '<span class="muted">答题 ' + answered + ' 题</span><span class="muted">答对 ' + correctTotal + ' 题</span>' +
        '</div>' +
      '</div>' +
      '<div class="card span-2">' +
        '<div class="card-title"><span class="emoji">📈</span>近 7 天积分趋势</div>' +
        '<svg viewBox="0 0 380 160" style="width:100%;height:170px">' +
          '<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(43,140,238,.35)"/><stop offset="100%" stop-color="rgba(43,140,238,0)"/></linearGradient></defs>' +
          '<polyline points="' + points + '" fill="none" stroke="#2b8cee" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
          '<polygon points="20,150 ' + points + ' 356,150" fill="url(#areaGrad)"></polygon>' +
          days.map(function (d, idx) {
            var x = 20 + idx * 56;
            var y = 140 - (d.value / maxDay) * 108;
            return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#fff" stroke="#2b8cee" stroke-width="2.5"></circle>';
          }).join('') +
        '</svg>' +
        '<div class="row between" style="font-size:11.5px;color:var(--muted);padding:0 8px">' + days.map(function (d) { return '<span>' + d.label + '</span>'; }).join('') + '</div>' +
      '</div>' +
    '</section>';

    html += '<section class="split" style="margin-top:18px">' +
      '<div class="card">' +
        '<div class="card-title"><span class="emoji">🎯</span>各学科掌握度</div>' +
        subjectStats.map(function (x) {
          return '<div style="margin-bottom:14px">' +
            '<div class="row between" style="margin-bottom:6px;font-size:13.5px">' +
              '<span><b>' + x.s.emoji + ' ' + x.s.name + '</b> <span class="muted">· 已答 ' + x.answered + ' 题</span></span>' +
              '<b style="color:' + (x.rate >= 80 ? '#12833f' : x.rate >= 60 ? '#b26a00' : '#c62c27') + '">' + (x.answered ? x.rate + '%' : '—') + '</b>' +
            '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + x.rate + '%"></div></div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div>' +
        '<div class="card">' +
          '<div class="card-title"><span class="emoji">⚠️</span>薄弱知识点</div>' +
          (weak.length ? weak.map(function (x) {
            return '<div class="list-row"><span class="grow">' + x.s.emoji + ' ' + x.s.name + ' · 正确率偏低</span><b style="color:#c62c27">' + x.rate + '%</b></div>';
          }).join('') : '<div class="empty"><span class="em">🌱</span>还没有足够数据，先去闯关吧</div>') +
        '</div>' +
        '<div class="card" style="margin-top:18px">' +
          '<div class="card-title"><span class="emoji">🕘</span>最近闯关记录</div>' +
          (S.history.length ? S.history.slice(0, 6).map(function (h) {
            return '<div class="list-row">' +
              '<span style="font-size:17px">' + (h.victory ? '🏆' : '💥') + '</span>' +
              '<span class="grow"><b>' + esc(h.subject) + ' · ' + esc(h.difficulty) + '</b><div class="lb-sub">' + new Date(h.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div></span>' +
              '<span style="text-align:right"><b>' + h.score + ' 分</b><div class="lb-sub">' + h.accuracy + '% 正确</div></span>' +
            '</div>';
          }).join('') : '<div class="empty"><span class="em">📭</span>还没有闯关记录</div>') +
        '</div>' +
      '</div>' +
    '</section>';
    return html + '</div>';
  }

  /* ============================================================
   * 实时积分榜单
   * ============================================================ */
  function viewLeaderboard() {
    var snap = scopedSnapshot(ui.lbRange, ui.lbSubject);
    var me = snap.entries.filter(function (e) { return e.isMe; })[0];
    var top = snap.entries.slice(0, 3);
    var rest = snap.entries.slice(3);
    var mine = myScope();
    var scopeName = isTeacher()
      ? (ui.lbClass && ui.lbClass !== 'all' ? ui.lbClass : '我带领的全部班级')
      : (ui.lbScope === 'grade'
          ? ('同年级' + (mine.gradeLabel ? '（' + mine.gradeLabel + '）' : ''))
          : ('本班' + (mine.className ? '（' + mine.className + '）' : '')));

    var html = '<div class="fade-in">';
    html += '<div class="row between wrap" style="gap:12px;margin-bottom:18px">' +
      '<div><h2 style="font-size:21px;font-weight:900">🏆 实时积分榜单</h2>' +
      '<p class="muted" style="font-size:13px;margin-top:4px">当前范围：<b>' + esc(scopeName) + '</b> · 每 2 秒刷新 · 只看自己范围内的同学</p></div>' +
      '<div class="row" style="gap:10px;flex-wrap:wrap">' +
        '<div class="filter-tabs">' +
          [['today', '今日榜'], ['week', '本周榜'], ['total', '总榜']].map(function (r) {
            return '<button data-action="lb-range" data-key="' + r[0] + '" class="' + (ui.lbRange === r[0] ? 'active' : '') + '">' + r[1] + '</button>';
          }).join('') +
        '</div>' +
        '<select class="select" style="width:auto;min-width:130px" data-action="lb-subject">' +
          '<option value="all"' + (ui.lbSubject === 'all' ? ' selected' : '') + '>全部学科</option>' +
          PK.SUBJECTS.map(function (s) { return '<option value="' + s.key + '"' + (ui.lbSubject === s.key ? ' selected' : '') + '>' + s.name + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
    '</div>';

    // 范围切换：学生只能看本班 / 同年级；老师看自己带领的班级
    html += '<div class="card" style="margin-bottom:16px">' +
      '<div class="row between wrap" style="gap:10px">' +
        '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">' +
          '<span class="card-sub">查看范围</span>' +
          (isTeacher()
            ? '<select class="select" style="width:auto;min-width:170px" data-action="lb-class">' +
                '<option value="all"' + (ui.lbClass === 'all' ? ' selected' : '') + '>我带领的全部班级</option>' +
                leadingClasses().map(function (c) {
                  return '<option value="' + esc(c.name) + '"' + (ui.lbClass === c.name ? ' selected' : '') + '>' + esc(c.name) + '（' + esc(c.gradeLabel || '未识别') + '）</option>';
                }).join('') +
              '</select>'
            : '<div class="filter-tabs">' +
                '<button data-action="lb-scope" data-key="class" class="' + (ui.lbScope !== 'grade' ? 'active' : '') + '">本班榜</button>' +
                '<button data-action="lb-scope" data-key="grade" class="' + (ui.lbScope === 'grade' ? 'active' : '') + '"' + (mine.gradeKey ? '' : ' disabled') + '>同年级榜</button>' +
              '</div>') +
        '</div>' +
        '<span class="lb-sub">' +
          (isTeacher()
            ? '只统计你带领的班级（同一所学校）'
            : (ui.lbScope === 'grade'
                ? '只显示同校同年级的同学' + (mine.gradeLabel ? '（' + esc(mine.gradeLabel) + '）' : '')
                : '只显示同校同班的同学')) +
        '</span>' +
      '</div>' +
    '</div>';

    html += '<div class="split">' +
      '<div class="card">' +
        '<div class="row between" style="margin-bottom:6px">' +
          '<div class="card-title" style="margin:0"><span class="live-dot"></span>榜单 TOP 3</div>' +
          '<span class="card-sub">参与 ' + snap.entries.length + ' 人 · 更新于 ' + new Date(snap.at).toLocaleTimeString('zh-CN') + '</span>' +
        '</div>' +
        '<div data-live="lb-podium">' + podiumHtml(top) + '</div>' +
        (snap.entries.length <= 2 ? '<div class="analysis" style="margin-bottom:14px">📣 现在只有 ' + snap.entries.length + ' 位参与者。把当前网址分享给同学或投屏到教室大屏，大家在自己设备上答题，这里的积分与名次会实时变化。</div>' : '') +
        '<div style="margin-top:6px">' +
          '<div class="card-title" style="font-size:14px"><span class="emoji">📋</span>完整榜单</div>' +
          '<div data-live="lb-list">' + leaderboardRows(rest, true) + '</div>' +
        '</div>' +
        '<div class="my-rank-bar">' +
          '<span style="font-size:22px">' + (me ? me.emoji : '🐱') + '</span>' +
          '<div class="grow"><b>我 · ' + esc(S.user.name) + '</b><div style="font-size:12px;opacity:.75">' + esc(S.user.klass) + ' · ' + (me && me.streak ? '连对 ' + me.streak + ' 题' : '继续加油') + '</div></div>' +
          '<div style="text-align:right"><div class="live-rank" style="font-size:20px;font-weight:900">第 ' + (me ? me.rank : '-') + ' 名</div>' +
          '<div class="live-score" style="font-size:12px;opacity:.75">' + fmt(me ? me.score : 0) + ' 积分 ' + (me ? deltaTag(me.delta) : '') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<div class="card">' +
          '<div class="card-title"><span class="emoji">📡</span>实时得分动态</div>' +
          '<div class="feed" data-live="lb-feed">' + feedHtml(snap.events) + '</div>' +
        '</div>' +
        '<div class="card" style="margin-top:18px">' +
          '<div class="card-title"><span class="emoji">📌</span>榜单规则</div>' +
          '<div class="list-row"><span class="grow">答对 1 题</span><b>+12 积分</b></div>' +
          '<div class="list-row"><span class="grow">连续答对</span><b>额外加成</b></div>' +
          '<div class="list-row"><span class="grow">闯关通关</span><b>+100 金币</b></div>' +
          '<div class="list-row"><span class="grow">错题修复成功</span><b>记入积分</b></div>' +
          '<div class="list-row"><span class="grow">当前数据源</span><b>' + (lbMode === 'remote' ? '🟢 实时后端' : '🟡 本地模拟') + '</b></div>' +
          '<p class="muted" style="font-size:12px;margin-top:10px;line-height:1.7">' +
            (lbMode === 'remote'
              ? '已连接实时后端（REST + SSE），所有设备看到的榜单是同一份数据：同学在自己设备上答题，你这里 2 秒内就能看到积分与名次变化。'
              : '当前没有检测到后端，使用本机实时模拟数据，离线也能完整演示。把同一份文件用 <code class="mono">node server/server.js</code> 启动后，会自动切换为真实多端同步。') +
          '</p>' +
        '</div>' +
      '</div>' +
    '</div>';
    return html + '</div>';
  }

  /* ============================================================
   * 教师端
   * ============================================================ */
  function viewTeacher() {
    var test = PK.selfTest(bank());
    var html = '<div class="fade-in">';
    html += '<section class="teacher-hero">' +
      '<div class="row between wrap" style="gap:14px">' +
        '<div><span class="badge teacher" style="background:rgba(255,255,255,.22);color:#fff">教师端</span>' +
        '<h2 style="font-size:23px;font-weight:900;margin-top:10px">汤姆猫跑酷学堂 · 教学工作台</h2>' +
        '<p style="opacity:.92;font-size:13.5px;margin-top:6px">班级学情 · 题库管理 · 答案判定引擎自检 · 课堂竞速</p></div>' +
        '<div class="row" style="gap:22px">' +
          '<div><div style="font-size:26px;font-weight:900">' + S.classes.length + '</div><span style="font-size:12px;opacity:.85">班级</span></div>' +
          '<div><div style="font-size:26px;font-weight:900">' + S.classes.reduce(function (n, c) { return n + c.students; }, 0) + '</div><span style="font-size:12px;opacity:.85">学生</span></div>' +
          '<div><div style="font-size:26px;font-weight:900">' + bank().length + '</div><span style="font-size:12px;opacity:.85">题目</span></div>' +
        '</div>' +
      '</div>' +
    '</section>';

    html += '<div class="filter-tabs" style="margin:18px 0">' +
      [['classes', '班级学情'], ['analysis', '班级对比统计'], ['ask', '学生提问'], ['homework', '作业管理'], ['questions', '题库管理'], ['engine', '答案判定引擎'], ['race', '课堂竞速']].map(function (t) {
        var badge = (t[0] === 'ask' && pendingAskCount()) ? ' <span class="tab-badge">' + pendingAskCount() + '</span>' : '';
        return '<button data-action="teacher-tab" data-key="' + t[0] + '" class="' + (ui.teacherTab === t[0] ? 'active' : '') + '">' + t[1] + badge + '</button>';
      }).join('') +
    '</div>';

    if (ui.teacherTab === 'classes') html += teacherClasses();
    else if (ui.teacherTab === 'analysis') html += teacherAnalysis();
    else if (ui.teacherTab === 'ask') html += teacherAskView();
    else if (ui.teacherTab === 'homework') html += teacherHomework();
    else if (ui.teacherTab === 'questions') html += teacherQuestions();
    else if (ui.teacherTab === 'engine') html += teacherEngine(test);
    else html += teacherRace();

    return html + '</div>';
  }

  function teacherClasses() {
    var snap = scopedSnapshot('today');
    var my = leadingClasses();
    var html = '';

    html += '<section class="card" style="margin-bottom:18px">' +
      '<div class="row between wrap" style="gap:12px">' +
        '<div><div class="card-title" style="margin:0"><span class="emoji">🏫</span>我的班级 <span class="card-sub">共 ' + my.length + ' 个' +
          (S.user.school ? ' · ' + esc(S.user.school) : '') + '</span></div>' +
        '<p class="muted" style="font-size:12.5px;margin-top:6px">创建班级后会立刻弹出 4 位班级码；学生必须输入<b>同一所学校名 + 同一班级码</b>才算加入。年级由 AI 根据班级名称自动识别。</p></div>' +
        '<button class="btn btn-teacher" data-action="create-class">＋ 创建班级</button>' +
      '</div>' +
    '</section>';

    html += my.length === 0
      ? '<section class="card center" style="padding:34px 20px">' +
          '<div style="font-size:38px">🏫</div>' +
          '<h3 style="margin-top:10px;font-size:17px;font-weight:900">还没有班级</h3>' +
          '<p class="muted" style="font-size:13px;margin-top:6px">创建第一个班级后，会立刻弹出 4 位班级码，发给学生即可加入（学生需同校）。</p>' +
          '<button class="btn btn-teacher" style="margin-top:16px" data-action="create-class">＋ 创建第一个班级</button>' +
        '</section>'
      : '<section class="grid grid-3">' + my.map(function (c) {
      return '<div class="card">' +
        '<div class="row between"><b style="font-size:15px">' + esc(c.name) + '</b><span class="badge">班级码 ' + esc(c.code) + '</span></div>' +
        '<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">' +
          '<span class="badge">🏫 ' + esc(c.school || S.user.school || '未填学校') + '</span>' +
          '<span class="badge">🎓 ' + esc(c.gradeLabel || '未识别年级') + (c.stage ? '·' + esc(c.stage) : '') + '</span>' +
        '</div>' +
        '<div class="row" style="gap:20px;margin-top:14px">' +
          '<div><div style="font-size:21px;font-weight:900">' + c.students + '</div><span class="lb-sub">学生数</span></div>' +
          '<div><div style="font-size:21px;font-weight:900;color:var(--primary)">' + c.avg + '</div><span class="lb-sub">平均分</span></div>' +
          '<div><div style="font-size:21px;font-weight:900;color:var(--accent)">' + c.rate + '%</div><span class="lb-sub">完成率</span></div>' +
        '</div>' +
        '<div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm grow" data-action="show-class-code" data-id="' + c.id + '">📋 班级码</button>' +
          '<button class="btn btn-teacher btn-sm grow" data-action="teacher-tab" data-key="race">⚡ 课堂竞速</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="row between" style="margin-bottom:6px"><div class="card-title" style="margin:0"><span class="emoji">📊</span>今日学生积分排行</div>' +
      '<div class="row" style="gap:8px"><span class="live-dot"></span><span class="card-sub">实时刷新</span>' +
      '<button class="btn btn-ghost btn-sm" data-action="export">导出成绩</button></div></div>' +
      '<div data-live="teacher-table">' + teacherStudentTable(snap.entries) + '</div>' +
    '</section>';
    return html;
  }

  function teacherStudentTable(entries) {
    return '<table class="table"><thead><tr><th>排名</th><th>学生</th><th>班级</th><th>今日积分</th><th>本周积分</th><th>连对</th><th>状态</th></tr></thead><tbody>' +
      entries.map(function (e) {
        var tag = e.rank <= 3 ? '<span class="badge live">TOP ' + e.rank + '</span>' : e.isMe ? '<span class="badge">本人</span>' : '<span class="badge">在线</span>';
        return '<tr><td><b>' + e.rank + '</b></td>' +
          '<td>' + e.emoji + ' ' + esc(e.name) + '</td>' +
          '<td class="muted">' + esc(e.klass) + '</td>' +
          '<td><b>' + fmt(e.points.today) + '</b></td>' +
          '<td>' + fmt(e.points.week) + '</td>' +
          '<td>' + (e.streak || 0) + ' 题</td>' +
          '<td>' + tag + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ============================================================
   * 班级对比统计（自动实时计算，老师只看结果）
   * ============================================================ */
  function classStats() {
    var snap = leaderboard.snapshot({ range: 'today', subject: 'all' });
    var my = leadingClasses();
    var rows = my.map(function (c) {
      var members = (snap.entries || []).filter(function (e) {
        if (e.klass !== c.name) return false;
        if (e.school && c.school && normSchool(e.school) !== normSchool(c.school)) return false;
        return true;
      });
      var answered = 0, correct = 0, todaySum = 0, totalSum = 0, active = 0;
      members.forEach(function (e) {
        answered += e.answered || 0;
        correct += e.correct || 0;
        todaySum += (e.points && e.points.today) || 0;
        totalSum += (e.points && e.points.total) || 0;
        if ((e.answered || 0) > 0) active++;
      });
      var students = Math.max(members.length, c.students || 0, active);
      var hwList = (S.homework || []).filter(function (h) {
        return h.classId === c.id || h.className === c.name;
      });
      var pairs = 0, done = 0;
      hwList.forEach(function (h) {
        var d = Object.keys(h.submissions || {}).length;
        pairs += Math.max(students, d, 1);
        done += d;
      });
      var acc = answered ? Math.round((correct / answered) * 100) : 0;
      return {
        cls: c, students: students, joined: members.length, active: active,
        answered: answered, correct: correct, accuracy: acc, wrongRate: answered ? 100 - acc : 0,
        avgToday: members.length ? Math.round(todaySum / members.length) : 0,
        totalPoints: totalSum,
        hwCount: hwList.length,
        hwRate: pairs ? Math.round((done / pairs) * 100) : 0,
        hwSubmitted: done, hwPairs: pairs
      };
    });
    rows.sort(function (a, b) {
      return PK.gradeOrder(a.cls) - PK.gradeOrder(b.cls) || String(a.cls.name).localeCompare(String(b.cls.name), 'zh');
    });
    return rows;
  }

  function analysisInsights(rows) {
    var out = [];
    if (!rows.length) return ['还没有班级数据。先在「班级学情」创建班级，把班级码发给学生，这里就会自动生成对比分析。'];
    var withData = rows.filter(function (r) { return r.answered > 0; });
    if (withData.length) {
      var byAcc = withData.slice().sort(function (a, b) { return b.accuracy - a.accuracy; });
      out.push('📈 正确率最高：' + byAcc[0].cls.name + '（' + byAcc[0].accuracy + '%），可以作为示范班。');
      var worst = byAcc[byAcc.length - 1];
      if (worst.cls.id !== byAcc[0].cls.id) {
        out.push('⚠️ ' + worst.cls.name + ' 正确率最低（' + worst.accuracy + '%），建议优先讲评这个班的错题。');
      }
      var byWrong = withData.slice().sort(function (a, b) { return b.wrongRate - a.wrongRate; })[0];
      out.push('🧯 错题率最高：' + byWrong.cls.name + '（' + byWrong.wrongRate + '%），错题修复训练先安排它。');
      var byAvg = withData.slice().sort(function (a, b) { return b.avgToday - a.avgToday; })[0];
      out.push('🏆 今日人均积分最高：' + byAvg.cls.name + '（' + byAvg.avgToday + ' 分）。');
    } else {
      out.push('📭 今天还没有班级答题数据，学生开始闯关后这里会自动更新。');
    }
    var hwRows = rows.filter(function (r) { return r.hwCount > 0; });
    if (hwRows.length) {
      var low = hwRows.slice().sort(function (a, b) { return a.hwRate - b.hwRate; })[0];
      out.push('📝 作业提交率最低：' + low.cls.name + '（' + low.hwRate + '%，' + low.hwSubmitted + '/' + low.hwPairs + '），记得提醒未交的同学。');
      if (low.hwRate < 60) out.push('💡 建议：把截止时间设近一点，或在课上留 5 分钟让学生当场完成。');
    } else {
      out.push('📝 还没有给班级布置作业，布置后这里会出现各班的作业提交率对比。');
    }
    var idle = rows.filter(function (r) { return r.active === 0; });
    if (idle.length) out.push('💤 今天还没有人答题：' + idle.map(function (r) { return r.cls.name; }).join('、') + '。');
    return out;
  }

  function teacherAnalysis() {
    var rows = classStats();
    var totals = rows.reduce(function (acc, r) {
      acc.students += r.students;
      acc.answered += r.answered;
      acc.correct += r.correct;
      acc.hwPairs += r.hwPairs;
      acc.hwSubmitted += r.hwSubmitted;
      return acc;
    }, { students: 0, answered: 0, correct: 0, hwPairs: 0, hwSubmitted: 0 });
    var accAvg = totals.answered ? Math.round((totals.correct / totals.answered) * 100) : 0;
    var hwAvg = totals.hwPairs ? Math.round((totals.hwSubmitted / totals.hwPairs) * 100) : 0;
    var maxAvg = Math.max(1, rows.reduce(function (m, r) { return Math.max(m, r.avgToday); }, 0));
    var maxAcc = 100;

    var html = '<div data-live="teacher-analysis">';
    html += '<section class="grid grid-4">' +
      '<div class="card center"><div style="font-size:24px;font-weight:900">' + rows.length + '</div><span class="lb-sub">我带领的班级</span></div>' +
      '<div class="card center"><div style="font-size:24px;font-weight:900">' + totals.students + '</div><span class="lb-sub">学生总数</span></div>' +
      '<div class="card center"><div style="font-size:24px;font-weight:900;color:var(--primary)">' + accAvg + '%</div><span class="lb-sub">整体正确率</span></div>' +
      '<div class="card center"><div style="font-size:24px;font-weight:900;color:var(--accent)">' + hwAvg + '%</div><span class="lb-sub">作业提交率</span></div>' +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="row between wrap" style="gap:10px">' +
        '<div class="card-title" style="margin:0"><span class="emoji">📊</span>班级对比统计 <span class="card-sub">自动实时计算 · 无需手动汇总</span></div>' +
        '<span class="row" style="gap:6px"><span class="live-dot"></span><span class="card-sub">每 2 秒自动刷新</span></span>' +
      '</div>' +
      (rows.length
        ? '<div style="overflow-x:auto"><table class="table" style="margin-top:12px"><thead><tr>' +
            '<th>班级</th><th>年级</th><th>人数</th><th>今日人均分</th><th>正确率</th><th>错题率</th><th>答题数</th><th>作业提交率</th>' +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            var accColor = r.accuracy >= 80 ? '#12833f' : r.accuracy >= 60 ? '#b26a00' : '#c62c27';
            return '<tr>' +
              '<td><b>' + esc(r.cls.name) + '</b><div class="lb-sub">' + esc(r.cls.school || S.user.school || '') + ' · 班级码 ' + esc(r.cls.code) + '</div></td>' +
              '<td>' + esc(r.cls.gradeLabel || '未识别') + '</td>' +
              '<td>' + r.students + (r.joined ? '<div class="lb-sub">已上榜 ' + r.joined + '</div>' : '') + '</td>' +
              '<td><b style="color:var(--primary)">' + r.avgToday + '</b>' +
                '<div class="bar-track" style="margin-top:5px;width:70px"><div class="bar-fill" style="width:' + Math.round((r.avgToday / maxAvg) * 100) + '%"></div></div></td>' +
              '<td><b style="color:' + accColor + '">' + (r.answered ? r.accuracy + '%' : '—') + '</b>' +
                '<div class="bar-track" style="margin-top:5px;width:70px"><div class="bar-fill" style="width:' + Math.round((r.accuracy / maxAcc) * 100) + '%"></div></div></td>' +
              '<td>' + (r.answered ? r.wrongRate + '%' : '—') + '</td>' +
              '<td>' + r.answered + '</td>' +
              '<td>' + (r.hwCount ? r.hwRate + '%<div class="lb-sub">' + r.hwSubmitted + '/' + r.hwPairs + '</div>' : '<span class="muted">未布置</span>') + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div>'
        : '<div class="empty"><span class="em">🏫</span>还没有班级，先到「班级学情」创建班级</div>') +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🤖</span>AI 自动分析 <span class="card-sub">根据上面的数据实时生成，老师只需查看</span></div>' +
      analysisInsights(rows).map(function (t) {
        return '<div class="list-row" style="align-items:flex-start"><span class="grow" style="line-height:1.75">' + esc(t) + '</span></div>';
      }).join('') +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">📌</span>统计口径说明</div>' +
      '<div class="list-row"><span class="grow">学生范围</span><b>仅统计我带领的班级（同校 + 班级码一致）</b></div>' +
      '<div class="list-row"><span class="grow">正确率 / 错题率</span><b>按学生答题记录汇总（答对 ÷ 答题）</b></div>' +
      '<div class="list-row"><span class="grow">作业提交率</span><b>已提交人次 ÷ 应提交人次</b></div>' +
      '<div class="list-row"><span class="grow">年级归属</span><b>由 AI 从班级名称自动识别</b></div>' +
    '</section>';
    return html + '</div>';
  }

  function teacherAskView() {
    var list = allAsks();
    var pending = list.filter(function (a) { return a.status !== 'answered'; });
    var html = '<section class="card">' +
      '<div class="row between wrap" style="gap:12px;margin-bottom:14px">' +
        '<div><div class="card-title" style="margin:0"><span class="emoji">🙋</span>学生提问 <span class="card-sub">共 ' + list.length + ' 条 · 待回复 ' + pending.length + ' 条</span></div>' +
        '<p class="muted" style="font-size:12.5px;margin-top:6px">学生在「学生端 → 向老师提问」发来的问题会出现在这里；回复后学生端立刻能看到（同一个网址的不同设备通过云端实时同步）。</p></div>' +
        '<button class="btn btn-ghost btn-sm" data-action="ask-refresh">🔄 刷新</button>' +
      '</div>' +
      (list.length
        ? list.map(function (a) { return askRowHtml(a, true); }).join('')
        : '<div class="empty"><span class="em">📭</span>暂时还没有学生提问。<br>把网址发给学生，他们在学生端点「向老师提问」就能给你留言。</div>') +
    '</section>';
    return html;
  }

  function teacherHomework() {
    var list = (S.homework || []).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var html = '<section class="card">' +
      '<div class="row between wrap" style="gap:12px;margin-bottom:14px">' +
        '<div><div class="card-title" style="margin:0"><span class="emoji">📝</span>作业管理 <span class="card-sub">共 ' + list.length + ' 份</span></div>' +
        '<p class="muted" style="font-size:12.5px;margin-top:6px">发布作业时从题库挑选题目布置给学生（需要新题请先到「题库管理 → 新增题目」）。</p></div>' +
        '<button class="btn btn-teacher" data-action="publish-homework">＋ 发布作业</button>' +
      '</div>' +
      (list.length
        ? '<div class="hw-list">' + list.map(function (h) {
            var cls = classById(h.classId);
            var done = Object.keys(h.submissions || {}).length;
            var total = cls ? cls.students : 0;
            return '<div class="hw-item">' +
              '<div class="hw-emoji">' + (h.status === 'closed' ? '🗄️' : h.status === 'draft' ? '📄' : '📌') + '</div>' +
              '<div class="grow"><b>' + esc(h.title) + '</b>' +
                '<div class="lb-sub">' + esc(h.className || '未指定班级') + ' · ' + (h.questionIds || []).length + ' 道题 · ' +
                  (h.due ? '截止 ' + esc(h.due) : '长期有效') + ' · 已交 ' + done + (total ? '/' + total : '') + ' 人' +
                  (h.image ? ' · 📷' : '') + (h.link ? ' · 🔗' : '') + '</div>' +
              '</div>' +
              '<span class="badge ' + (h.status === 'open' ? 'live' : '') + '">' +
                (h.status === 'open' ? '进行中' : h.status === 'closed' ? '已结束' : '待发布') + '</span>' +
              '<div class="row" style="gap:6px;flex-wrap:wrap">' +
                (h.status === 'draft' ? '<button class="btn btn-teacher btn-sm" data-action="hw-publish" data-id="' + h.id + '">发布</button>' : '') +
                (h.status === 'open' ? '<button class="btn btn-ghost btn-sm" data-action="hw-close" data-id="' + h.id + '">结束</button>' : '') +
                '<button class="btn btn-ghost btn-sm" data-action="hw-preview" data-id="' + h.id + '">查看题目</button>' +
                '<button class="btn btn-danger-ghost btn-sm" data-action="hw-delete" data-id="' + h.id + '">删除</button>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="empty"><span class="em">🗂️</span>还没有作业，点击右上角「发布作业」从题库选题布置</div>') +
    '</section>';
    return html;
  }

  function teacherQuestions() {
    var f = ui.questionFilter;
    var list = bank().filter(function (q) {
      if (f.subject !== 'all' && q.subject !== f.subject) return false;
      if (f.type !== 'all' && q.type !== f.type) return false;
      if (f.difficulty !== 'all' && q.difficulty !== f.difficulty) return false;
      return true;
    });
    var html = '<section class="card">' +
      '<div class="row between wrap" style="gap:10px;margin-bottom:14px">' +
        '<div class="card-title" style="margin:0"><span class="emoji">🗂️</span>题库管理 <span class="card-sub">共 ' + list.length + ' 道</span></div>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' +
          '<select class="select" style="width:auto" data-action="filter-subject">' +
            '<option value="all"' + (f.subject === 'all' ? ' selected' : '') + '>全部学科</option>' +
            PK.SUBJECTS.map(function (s) { return '<option value="' + s.key + '"' + (f.subject === s.key ? ' selected' : '') + '>' + s.name + '</option>'; }).join('') +
          '</select>' +
          '<select class="select" style="width:auto" data-action="filter-type">' +
            '<option value="all"' + (f.type === 'all' ? ' selected' : '') + '>全部题型</option>' +
            PK.TYPES.map(function (t) { return '<option value="' + t.key + '"' + (f.type === t.key ? ' selected' : '') + '>' + t.name + '</option>'; }).join('') +
          '</select>' +
          '<select class="select" style="width:auto" data-action="filter-difficulty">' +
            '<option value="all"' + (f.difficulty === 'all' ? ' selected' : '') + '>全部难度</option>' +
            PK.DIFFICULTIES.map(function (d) { return '<option value="' + d.key + '"' + (f.difficulty === d.key ? ' selected' : '') + '>' + d.name + '</option>'; }).join('') +
          '</select>' +
          '<button class="btn btn-teacher btn-sm" data-action="new-question">+ 新增题目</button>' +
        '</div>' +
      '</div>' +
      '<div style="overflow-x:auto"><table class="table"><thead><tr><th>学科</th><th>题型</th><th>难度</th><th>题干</th><th>正确答案</th><th>答案校验</th><th>操作</th></tr></thead><tbody>' +
      list.map(function (q) {
        var subj = PK.subjectByKey(q.subject);
        var res = PK.grade(q, q.answer);
        return '<tr>' +
          '<td>' + subj.emoji + ' ' + subj.name + '</td>' +
          '<td>' + typeName(q.type) + '</td>' +
          '<td><span class="badge ' + q.difficulty + '">' + difficultyName(q.difficulty) + '</span></td>' +
          '<td style="max-width:320px">' + esc(String(q.content).slice(0, 42)) + (String(q.content).length > 42 ? '…' : '') +
            (q.image ? ' <span title="含配图">📷</span>' : '') + (q.link ? ' <span title="含参考链接">🔗</span>' : '') + '</td>' +
          '<td><b>' + esc(res.expectedText) + '</b></td>' +
          '<td><span class="ok">✓ 通过</span></td>' +
          '<td>' + (q.source && q.source.indexOf('自定义') === -1 && q.id.indexOf('custom') === -1
            ? '<span class="muted">内置</span>'
            : '<button class="btn btn-danger-ghost btn-sm" data-action="delete-question" data-id="' + q.id + '">删除</button>') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</section>';
    return html;
  }

  function teacherEngine(test) {
    var html = '<section class="test-banner">' +
      '<div style="font-size:38px">✅</div>' +
      '<div class="grow"><div class="big">' + test.passed + ' / ' + test.total + ' 题目判定全部通过</div>' +
      '<p class="muted" style="font-size:13px;margin-top:4px">答案判定引擎已完成结构校验、正误判定校验与等价答案校验，' +
      '<b style="color:#c62c27">原版逻辑会判错其中 ' + test.legacyBrokenCount + ' 道题</b>，现已全部修复。</p></div>' +
      '<button class="btn btn-accent" data-action="rerun-test">重新自检</button>' +
    '</section>';

    html += '<section class="grid grid-4" style="margin-top:18px">' +
      ['single', 'judge', 'fill'].map(function (t) {
        var n = test.stats[t] || 0;
        return '<div class="card center"><div style="font-size:24px;font-weight:900">' + n + '</div><span class="lb-sub">' + typeName(t) + '</span></div>';
      }).join('') +
      '<div class="card center"><div style="font-size:24px;font-weight:900">' + Object.keys(test.bySubject).length + '</div><span class="lb-sub">覆盖学科</span></div>' +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🛠️</span>本次修复的答案判定问题</div>' +
      [
        ['选择题答案表示不统一', '教师端保存的是选项字母（A/B/C/D），学生端却拿「选项文字」去比较，导致正确作答被判错、正确答案高亮也失效。修复：统一解析为选项下标，兼容字母 / 下标 / 选项原文三种写法。'],
        ['判断题无法判定', '判断题选项是「正确/错误」，答案存的是 A/B，文本比较永远不相等。修复：归一化 A/B、对/错、√/×、T/F、true/false 等写法。'],
        ['填空题容错为 0', '原逻辑仅做小写与去空格，全角字符、单位、中文数字、等价数值都会被判错。修复：全半角归一、去单位、数值等价、中文数字转阿拉伯、英文单复数容错。'],
        ['正确答案高亮错位', '渲染时用 options[i] === answer 判断高亮，答案存字母时永远高亮不出来。修复：先解析答案下标再高亮。'],
        ['填空题答案为空时崩溃', 'answer 为空时对 undefined 调用 toLowerCase() 会抛错，整局游戏中断。修复：类型守卫与兜底。']
      ].map(function (item) {
        return '<div class="list-row" style="align-items:flex-start"><span style="color:#c62c27;font-weight:900">✗</span>' +
          '<span class="grow"><b>' + item[0] + '</b><div class="muted" style="font-size:12.5px;line-height:1.7;margin-top:3px">' + item[1] + '</div></span></div>';
      }).join('') +
    '</section>';

    html += '<section class="card" style="margin-top:18px">' +
      '<div class="card-title"><span class="emoji">🔬</span>原版逻辑 vs 新版引擎 逐题对比</div>' +
      '<p class="muted" style="font-size:12.5px;margin-bottom:12px">下表列出原版会判错的题目（共 ' + test.legacyBrokenCount + ' 道），新版引擎全部判对。</p>' +
      '<div style="overflow-x:auto;max-height:460px;overflow-y:auto"><table class="table">' +
      '<thead><tr><th>题目</th><th>类型</th><th>标准答案</th><th>学生选择正确答案后</th><th>正确答案高亮</th></tr></thead><tbody>' +
      test.legacyBroken.map(function (b) {
        var q = questionById(b.id);
        if (!q) return '';
        var legacy = b.legacyOk ? '<span class="ok">判对</span>' : '<span class="bad">判错</span>';
        var hl = b.legacyHighlight === b.expectedIndex ? '<span class="ok">正常</span>' : '<span class="bad">失效</span>';
        return '<tr><td style="max-width:320px">' + esc(String(q.content).slice(0, 36)) + '…</td>' +
          '<td>' + typeName(q.type) + '</td>' +
          '<td><b>' + esc((q.options && q.options[PK.resolveChoiceIndex(q, q.answer)]) || q.answer) + '</b></td>' +
          '<td>' + legacy + ' <span class="muted">→</span> <span class="ok">✓ 新版判对</span></td>' +
          '<td>' + hl + ' <span class="muted">→</span> <span class="ok">✓ 已修复</span></td></tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</section>';

    if (!test.ok) {
      html += '<section class="card" style="margin-top:18px"><div class="card-title"><span class="emoji">⚠️</span>未通过的题目</div>' +
        test.failures.map(function (f) { return '<div class="list-row"><span class="grow">' + esc(f.id) + '</span><span class="bad">' + esc(f.message) + '</span></div>'; }).join('') +
      '</section>';
    }
    return html;
  }

  var raceState = null;

  function teacherRace() {
    var html = '<section class="split">';
    html += '<div class="card">' +
      '<div class="row between" style="margin-bottom:8px">' +
        '<div class="card-title" style="margin:0"><span class="emoji">⚡</span>课堂竞速 · 实时排行榜</div>' +
        '<span class="row" style="gap:6px"><span class="live-dot"></span><span class="card-sub">每 2 秒刷新</span></span>' +
      '</div>' +
      '<p class="muted" style="font-size:13px;margin-bottom:14px">全班同屏竞技，学生答题进度与积分实时同步到教师大屏。</p>' +
      '<div class="row" style="gap:10px;margin-bottom:16px">' +
        '<button class="btn btn-teacher" data-action="start-race">' + (raceState && raceState.running ? '重新开始竞速' : '⚡ 开始竞速') + '</button>' +
        '<button class="btn btn-ghost" data-action="stop-race"' + (raceState && raceState.running ? '' : ' disabled') + '>结束竞速</button>' +
      '</div>' +
      '<div id="raceBoard">' + raceBoardHtml() + '</div>' +
    '</div>';

    var snap = scopedSnapshot('today');
    html += '<div>' +
      '<div class="card"><div class="card-title"><span class="emoji">🧭</span>竞速设置</div>' +
        '<div class="list-row"><span class="grow">题目来源</span><b>' + (PK.subjectByKey(ui.subject).name) + ' · ' + difficultyName(ui.difficulty) + '</b></div>' +
        '<div class="list-row"><span class="grow">题目数量</span><b>' + PK.questionsFor({ subject: ui.subject, difficulty: ui.difficulty }).length + ' 道</b></div>' +
        '<div class="list-row"><span class="grow">参与人数</span><b>' + (leaderboard.peers.length + 1) + ' 人</b></div>' +
        '<div class="list-row"><span class="grow">榜单刷新</span><b>2 秒 / 次</b></div>' +
      '</div>' +
      '<div class="card" style="margin-top:18px"><div class="card-title"><span class="emoji">🏅</span>今日积分总览</div>' +
        snap.entries.slice(0, 5).map(function (e) {
          return '<div class="list-row"><span style="font-size:16px">' + e.emoji + '</span><span class="grow">' + esc(e.name) + '</span><b>' + fmt(e.score) + '</b></div>';
        }).join('') +
      '</div>' +
    '</div>';
    return html + '</section>';
  }

  function raceBoardHtml() {
    if (!raceState || !raceState.rows) {
      return '<div class="empty"><span class="em">🏁</span>点击「开始竞速」，全班同学的答题进度会实时出现在这里</div>';
    }
    return raceState.rows.map(function (r, idx) {
      return '<div class="race-row' + (r.moved ? ' moving' : '') + '">' +
        '<div class="lb-rank ' + rankClass(idx + 1) + '">' + (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1) + '</div>' +
        '<div><div class="row between" style="font-size:13.5px"><b>' + r.emoji + ' ' + esc(r.name) + '</b><span class="muted">' + r.done + '/' + r.total + ' 题 · ' + fmt(r.score) + ' 分</span></div>' +
        '<div class="race-progress" style="margin-top:6px"><i style="width:' + Math.round((r.done / r.total) * 100) + '%"></i></div></div>' +
        '<div style="text-align:right">' + (r.finished ? '<span class="badge live">已完赛</span>' : '<span class="badge">' + (r.speed || 1).toFixed(1) + 'x</span>') + '</div>' +
      '</div>';
    }).join('');
  }

  function startRace() {
    var total = Math.max(6, Math.min(10, PK.questionsFor({ subject: ui.subject, difficulty: ui.difficulty }).length || 8));
    raceState = {
      running: true,
      total: total,
      rows: [leaderboard.me].concat(leaderboard.peers).slice(0, 10).map(function (p, i) {
        return { id: p.id, name: p.name, emoji: p.emoji, done: 0, score: 0, speed: 0.8 + Math.random() * 0.6, finished: false, moved: false };
      })
    };
    if (raceState.interval) clearInterval(raceState.interval);
    raceState.interval = setInterval(function () {
      if (!raceState || !raceState.running) return;
      raceState.rows.forEach(function (r) {
        r.moved = false;
        if (r.finished) return;
        if (Math.random() < 0.55 * r.speed) {
          r.done = Math.min(raceState.total, r.done + 1);
          var correct = Math.random() < 0.82;
          r.score += correct ? 100 + Math.floor(Math.random() * 30) : 20;
          if (r.done >= raceState.total) r.finished = true;
        }
      });
      raceState.rows.sort(function (a, b) { return b.done - a.done || b.score - a.score; });
      var board = $('#raceBoard');
      if (board) board.innerHTML = raceBoardHtml();
      if (raceState.rows.every(function (r) { return r.finished; })) {
        raceState.running = false;
        if (raceState.interval) clearInterval(raceState.interval);
        var board2 = $('#raceBoard');
        if (board2) board2.innerHTML = '<div class="analysis" style="margin-bottom:12px">🏁 全班已完赛，冠军：' + esc(raceState.rows[0].name) + '</div>' + raceBoardHtml();
      }
    }, 2000);
    refreshLive();
  }

  /* ============================================================
   * 路由与渲染
   * ============================================================ */
  function parseRoute() {
    var hash = location.hash.replace(/^#\/?/, '');
    var segments = hash.split('/').filter(function (x) { return x !== ''; });
    if (!segments.length) segments = ['home'];
    return { segments: segments, path: '/' + segments.join('/') };
  }

  function render() {
    var route = parseRoute();
    var seg = route.segments;
    var html = '';

    // 邀请链接里的 ?school=xxx#/student/join/1234 ：自动带出学校名与班级码
    try {
      var qs = new URLSearchParams(location.search || '');
      var qSchool = (qs.get('school') || '').trim();
      if (qSchool && !S.user.school) { S.lastSchool = qSchool.slice(0, 20); }
      if (seg[0] === 'student' && seg[1] === 'join') ui.joinCode = seg[2] || ui.joinCode;
    } catch (e) {}

    if (currentGame) { currentGame.destroy(); currentGame = null; }

    // 身份在登录页确定后不可跨端：学生进不了教师端，老师也进不了学生端
    var crossRole = S.loggedIn && seg[0] !== 'login' &&
      ((isTeacher() && seg[0] === 'student') || (!isTeacher() && seg[0] === 'teacher'));

    // 跑酷页：手机端整页沉浸式（隐藏顶栏与底部导航，画面铺满屏幕）
    document.body.classList.toggle('game-page', !!(S.loggedIn && !crossRole && seg[0] === 'student' && seg[1] === 'game'));

    if (!S.loggedIn) html = viewLogin();
    else if (seg[0] === 'login') html = viewLogin();
    else if (crossRole) html = blockedView(isTeacher() ? 'teacher' : 'student');
    else if (seg[0] === 'home') html = viewHome();
    else if (seg[0] === 'my') html = isTeacher() ? viewTeacher() : viewStudent();
    else if (seg[0] === 'student') {
      if (seg[1] === 'game') html = viewGame(seg);
      else if (seg[1] === 'wrong') html = viewWrong();
      else if (seg[1] === 'garden') html = viewGarden();
      else if (seg[1] === 'data') html = viewData();
      else if (seg[1] === 'chat') html = viewChat();
      else if (seg[1] === 'ask') html = viewMyAsks();
      else html = viewStudent();
    } else if (seg[0] === 'leaderboard') html = viewLeaderboard();
    else if (seg[0] === 'guide') html = viewGuide();
    else if (seg[0] === 'teacher') html = viewTeacher();
    else html = '<div class="empty"><span class="em">🧭</span>页面不存在<button class="btn btn-ghost" style="margin-left:10px" data-go="#/home">返回首页</button></div>';

    $('#view').innerHTML = html;

    if (!crossRole && seg[0] === 'student' && seg[1] === 'game') mountGame();
    if (!crossRole && seg[0] === 'student' && seg[1] === 'join') openJoinClass(seg[2]);
    if (!crossRole && seg[0] === 'student' && seg[1] === 'chat') {
      var chatPid = equippedPartnerId();
      if (!chatMessages(chatPid).length) {
        var greeting = chatBrain().greet();
        chatPush(chatPid, 'ai', greeting.text);
        chatState.chips = greeting.chips;
      }
      requestAnimationFrame(function () {
        renderChatOnly();
        scrollChatToEnd();
        var inp = $('#chatInput');
        if (inp) inp.focus();
      });
    }
    if (!crossRole && seg[0] === 'teacher' && ui.teacherTab === 'race') {
      var board = $('#raceBoard');
      if (board && raceState && raceState.running) board.innerHTML = raceBoardHtml();
    }
    window.scrollTo(0, 0);
    updateNav(route);
    renderTopStats();
  }

  function updateNav(route) {
    var seg = route.segments;
    var key;
    if (!S.loggedIn) key = '';
    else if (seg[0] === 'student' && isTeacher()) key = '';
    else if (seg[0] === 'teacher' && !isTeacher()) key = '';
    else {
      key = seg[1] === 'garden' ? 'garden' : seg[0];
      if (key === 'student' || key === 'teacher') key = 'my';   // 学生端 / 教师端共用一个「我的课堂」入口
    }
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      var target = a.getAttribute('data-nav');
      a.classList.toggle('active', target === key);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mobile-nav a'), function (a) {
      var t = a.getAttribute('data-nav');
      a.classList.toggle('active', t === key || (t === 'garden' && key === 'garden'));
    });
  }

  function renderTopStats() {
    var me = myPoints();
    var pointsEl = $('#topPoints');
    var coinsEl = $('#topCoins');
    if (pointsEl) pointsEl.textContent = fmt(me ? me.score : 0);
    if (coinsEl) coinsEl.textContent = fmt(S.coins);
    var nameEl = $('#topName');
    if (nameEl) nameEl.textContent = S.user.name;
    var emojiEl = $('#topEmoji');
    if (emojiEl) emojiEl.textContent = S.user.emoji;
    var roleEl = $('#roleSwitch');
    if (roleEl) {
      roleEl.textContent = isTeacher() ? '🧑‍🏫 老师' : '🧑‍🎓 学生';
      roleEl.classList.toggle('teacher', isTeacher());
    }
    document.body.classList.toggle('auth', !!S.loggedIn);
    var outBtn = $('#logoutBtn');
    if (outBtn) outBtn.style.display = S.loggedIn ? '' : 'none';
    updateLiveBadge();
  }

  /** 顶栏显示当前数据源状态：真实后端 / 本地模拟 */
  function updateLiveBadge() {
    var el = $('#topLive');
    if (!el) return;
    var online = 0;
    try {
      online = leaderboard.online || 0;
      var snap = leaderboard.snapshot({ range: 'today' });
      if (!online) online = snap.entries.filter(function (e) { return !e.isBot && (e.online === undefined || e.online); }).length;
    } catch (e) {}
    lbOnline = online;
    if (lbMode === 'remote') {
      el.innerHTML = '🟢 实时后端 · ' + online + ' 人在线';
      el.style.background = 'linear-gradient(135deg,#eefaf3,#dcf5e6)';
      el.style.borderColor = '#bfe9cf';
      el.style.color = '#12833f';
      el.title = '已连接真实后端，榜单为多设备实时同步（REST + SSE）';
    } else if (lbMode === 'cloud') {
      el.innerHTML = '🌐 云端实时 · ' + online + ' 人在线';
      el.style.background = 'linear-gradient(135deg,#eefaf3,#dcf5e6)';
      el.style.borderColor = '#bfe9cf';
      el.style.color = '#12833f';
      el.title = '已连接云端实时榜单：把网址分享给同学，各自设备答题，积分与名次实时同步';
    } else {
      el.innerHTML = '🟡 本地模拟';
      el.style.background = '';
      el.style.borderColor = '';
      el.style.color = '';
      el.title = '未检测到后端与云端中继，使用本机实时模拟数据；用 启动网址.command 或部署后会自动切换为真实同步';
    }
  }

  var pendingLive = false;
  function refreshLive() {
    if (pendingLive) return;
    pendingLive = true;
    requestAnimationFrame(function () {
      pendingLive = false;

      // 先合并来自云端中继的学生提问 / 老师回复
      var farCls = (leaderboard.takeClasses ? leaderboard.takeClasses() : []);
      if (farCls.length) {
        var clsChanged = false;
        farCls.forEach(function (m) { if (mergeClass(m)) clsChanged = true; });
        if (clsChanged) { save(); if (!currentGame) render(); }
      }

      var far = (leaderboard.takeAsks ? leaderboard.takeAsks() : []);
      if (far.length) {
        var askChanged = false;
        far.forEach(function (m) {
          var existed = !!askById(m.qid);
          var did = mergeAsk(m);
          if (did) askChanged = true;
          if (m.kind === 'ask' && !existed && isTeacher()) {
            toast('收到 ' + (m.n || '同学') + ' 的新提问', 'ok');
          } else if (m.kind === 'reply' && did) {
            var t = askById(m.qid);
            if (t && t.student === S.user.name) toast('老师回复了你的提问', 'ok');
          }
        });
        if (askChanged) {
          save();
          var typing = false;
          Array.prototype.forEach.call(document.querySelectorAll('textarea[id^="askReply-"]'), function (t) {
            if (t.value.trim()) typing = true;
          });
          if (!currentGame && !typing) render();
        }
      }

      renderTopStats();
      var snap = scopedSnapshot('today');

      var homeLb = document.querySelector('[data-live="home-lb"]');
      if (homeLb) homeLb.innerHTML = leaderboardRows(snap.entries.slice(0, 6), false);
      var studentLb = document.querySelector('[data-live="student-lb"]');
      if (studentLb) studentLb.innerHTML = leaderboardRows(snap.entries.slice(0, 8), false);
      var homeFeed = document.querySelector('[data-live="home-feed"]');
      if (homeFeed) homeFeed.innerHTML = feedHtml(snap.events);
      var studentFeed = document.querySelector('[data-live="student-feed"]');
      if (studentFeed) studentFeed.innerHTML = feedHtml(snap.events);

      var lbSnap = scopedSnapshot(ui.lbRange, ui.lbSubject);
      var podium = document.querySelector('[data-live="lb-podium"]');
      if (podium) podium.innerHTML = podiumHtml(lbSnap.entries.slice(0, 3));
      var lbList = document.querySelector('[data-live="lb-list"]');
      if (lbList) lbList.innerHTML = leaderboardRows(lbSnap.entries.slice(3), true);
      var lbFeed = document.querySelector('[data-live="lb-feed"]');
      if (lbFeed) lbFeed.innerHTML = feedHtml(lbSnap.events);

      var teacherTable = document.querySelector('[data-live="teacher-table"]');
      if (teacherTable) teacherTable.innerHTML = teacherStudentTable(snap.entries);

      var teacherAnalysisBox = document.querySelector('[data-live="teacher-analysis"]');
      if (teacherAnalysisBox) {
        var holder = document.createElement('div');
        holder.innerHTML = teacherAnalysis();
        var fresh = holder.querySelector('[data-live="teacher-analysis"]');
        if (fresh) teacherAnalysisBox.innerHTML = fresh.innerHTML;
      }

      var myBars = document.querySelectorAll('.my-rank-bar');
      if (myBars.length) {
        var me = snap.entries.filter(function (e) { return e.isMe; })[0];
        Array.prototype.forEach.call(myBars, function (bar) {
          var rankEl = bar.querySelector('.live-rank');
          if (rankEl && me) rankEl.textContent = '第 ' + me.rank + ' 名';
          var scoreEl = bar.querySelector('.live-score');
          if (scoreEl && me) scoreEl.innerHTML = fmt(me.score) + ' 积分 ' + deltaTag(me.delta);
        });
      }
    });
  }

  /* ============================================================
   * 交互
   * ============================================================ */
  document.addEventListener('click', function (e) {
    var goEl = e.target.closest('[data-go]');
    if (goEl) {
      var target = goEl.getAttribute('data-go');
      if (target) { location.hash = target; }
      return;
    }
    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    var action = actionEl.getAttribute('data-action');

    switch (action) {
      case 'pick-subject': {
        ui.subject = actionEl.getAttribute('data-key');
        var jump = actionEl.getAttribute('data-jump');
        if (jump) location.hash = jump; else render();
        break;
      }
      case 'pick-difficulty':
        ui.difficulty = actionEl.getAttribute('data-key');
        render();
        break;
      case 'start-game':
        location.hash = '#/student/game/' + ui.subject + '/' + ui.difficulty;
        break;
      case 'start-wrong':
        if (!S.wrongIds.length) { toast('错题本是空的，先去闯关吧'); break; }
        location.hash = '#/student/game/wrong';
        break;
      case 'start-mixed':
        location.hash = '#/student/game/mixed';
        break;
      case 'clear-wrong':
        S.wrongIds = [];
        save();
        toast('错题本已清空');
        render();
        break;
      case 'buy': {
        var item = SHOP.filter(function (x) { return x.id === actionEl.getAttribute('data-id'); })[0];
        if (!item) break;
        if (S.coins < item.price) { toast('金币不足，还差 ' + (item.price - S.coins) + ' 金币', 'bad'); break; }
        S.coins -= item.price;
        S.inventory.push(item.id);
        if (item.type === 'partner') {
          S.partners = S.partners || {};
          if (!S.partners[item.id]) S.partners[item.id] = { level: 1 };
        }
        save();
        toast(item.type === 'partner'
          ? '买下「' + item.name + '」！现在可以出战，也能陪你聊天'
          : '购买成功！获得「' + item.name + '」', 'ok');
        confetti(40);
        render();
        break;
      }
      case 'equip': {
        var id = actionEl.getAttribute('data-id');
        var type = actionEl.getAttribute('data-type');
        S.equipped[type] = id;
        save();
        toast('已装备');
        render();
        break;
      }
      case 'rename': {
        var name = window.prompt('请输入新的昵称', S.user.name);
        if (name && name.trim()) {
          S.user.name = name.trim().slice(0, 12);
          leaderboard.me.name = S.user.name;
          if (leaderboard.updateProfile) {
            leaderboard.updateProfile({ name: S.user.name, emoji: S.user.emoji, klass: S.user.klass });
          }
          save();
          render();
          toast('昵称已更新', 'ok');
        }
        break;
      }
      case 'lb-range':
        ui.lbRange = actionEl.getAttribute('data-key');
        render();
        break;
      case 'lb-scope':
        ui.lbScope = actionEl.getAttribute('data-key') === 'grade' ? 'grade' : 'class';
        render();
        break;
      case 'teacher-tab':
        ui.teacherTab = actionEl.getAttribute('data-key');
        render();
        break;
      case 'login-role':
        ui.loginRole = actionEl.getAttribute('data-role') || 'student';
        render();
        break;
      case 'login-enter': {
        var wantRole = actionEl.getAttribute('data-role') || ui.loginRole || 'student';
        var skipCode = actionEl.getAttribute('data-skip') === '1';
        var schoolInput = $('#lgSchool');
        var loginSchool = schoolInput ? schoolInput.value.trim() : '';
        var nameInput = $('#lgName');
        var msgBox = $('#lgMsg');
        var loginName = nameInput ? nameInput.value.trim() : '';
        if (!loginSchool) {
          if (msgBox) msgBox.innerHTML = '<span class="bad">请先填写学校名称</span>';
          if (schoolInput) schoolInput.focus();
          break;
        }
        if (!loginName) {
          if (msgBox) msgBox.innerHTML = '<span class="bad">请先填写昵称，再进入</span>';
          if (nameInput) nameInput.focus();
          break;
        }
        S.user.school = loginSchool.slice(0, 20);
        S.lastSchool = S.user.school;
        if (wantRole === 'teacher') {
          S.user.klass = S.user.klass || '教师';
          enterApp('teacher', loginName);
          ui.loginRole = 'teacher';
          ui.teacherTab = 'classes';
          toast('欢迎，' + loginName + ' 老师', 'ok');
          location.hash = '#/teacher';
          render();
          maybeFirstGuide();
          break;
        }
        var codeInput = $('#lgCode');
        var code = codeInput ? String(codeInput.value || '').replace(/\s/g, '') : '';
        if (code && !skipCode) {
          if (!/^\d{4}$/.test(code)) {
            if (msgBox) msgBox.innerHTML = '<span class="bad">班级码是 4 位数字，请检查一下</span>';
            break;
          }
          var targetClass = classBySchoolCode(loginSchool, code);
          if (!targetClass) {
            if (msgBox) msgBox.innerHTML = '<span class="bad">这所学校里没有找到该班级码，请核对学校名与班级码（也可以点「先进入体验」）</span>';
            break;
          }
          joinClassById(targetClass);
        }
        enterApp('student', loginName);
        ui.loginRole = 'student';
        toast('欢迎，' + loginName + (myClass() ? '，已加入 ' + myClass().name : ''), 'ok');
        location.hash = '#/student';
        render();
        maybeFirstGuide();
        break;
      }
      case 'logout':
        S.loggedIn = false;
        ui.loginRole = S.user.role;
        save();
        location.hash = '#/login';
        render();
        toast('已退出，可切换账号重新进入');
        break;
      case 'upgrade-partner': {
        var upId = actionEl.getAttribute('data-id');
        var curLv = partnerLevel(upId);
        if (curLv >= 10) { toast('已经是满级啦，超厉害！', 'ok'); break; }
        var cost = upgradeCost(curLv);
        if (S.coins < cost) { toast('金币不足，还差 ' + (cost - S.coins) + ' 金币（去答题赚金币吧）', 'bad'); break; }
        S.coins -= cost;
        S.partners = S.partners || {};
        S.partners[upId] = { level: curLv + 1 };
        save();
        confetti(50);
        toast(partnerMeta(upId).name + ' 升到 Lv' + (curLv + 1) + '！金币 +' + partnerBonus(upId).coin + '%', 'ok');
        render();
        break;
      }
      case 'buy-deco': {
        var dId = actionEl.getAttribute('data-id');
        var deco = decoById(dId);
        if (!deco) break;
        if (placedDeco().length >= homeDecoSlots()) { toast('房间位置满了，先收起一件吧', 'bad'); break; }
        if (S.coins < deco.price) { toast('金币不足，还差 ' + (deco.price - S.coins) + ' 金币', 'bad'); break; }
        S.coins -= deco.price;
        var usedSlots = placedDeco().map(function (p) { return p.slot; });
        var freeSlot = 0;
        while (usedSlots.indexOf(freeSlot) !== -1) freeSlot++;
        S.home = S.home || { placed: [] };
        S.home.placed.push({ id: dId, slot: freeSlot });
        save();
        confetti(40);
        toast('已把「' + deco.name + '」摆进家园', 'ok');
        render();
        break;
      }
      case 'remove-deco': {
        var slotNo = parseInt(actionEl.getAttribute('data-slot'), 10);
        S.home = S.home || { placed: [] };
        S.home.placed = placedDeco().filter(function (p) { return p.slot !== slotNo; });
        save();
        toast('已收起');
        render();
        break;
      }
      case 'chat-partner': {
        var cid = actionEl.getAttribute('data-id');
        if (cid && PARTNER_META[cid]) { S.equipped.partner = cid; save(); }
        chatState.brain = null;
        location.hash = '#/student/chat';
        render();
        break;
      }
      case 'chat-chip':
        chatSend(actionEl.getAttribute('data-text'));
        break;
      case 'chat-send': {
        var chatInput = $('#chatInput');
        if (chatInput) { var v = chatInput.value; chatInput.value = ''; chatSend(v); }
        break;
      }
      case 'ai-config':
        openAiConfig();
        break;
      case 'clear-chat':
        S.chat = S.chat || {};
        S.chat[equippedPartnerId()] = [];
        chatState.brain = null;
        save();
        toast('对话已清空');
        render();
        break;
      case 'ask-open':
        openAskTeacher();
        break;
      case 'ask-reply': {
        var askId = actionEl.getAttribute('data-id');
        var replyBox = $('#askReply-' + askId);
        var replyText = replyBox ? replyBox.value.trim() : '';
        if (!replyText) { toast('先写下回复内容再发送', 'bad'); break; }
        var askRec = askById(askId);
        if (askRec) {
          askRec.answer = replyText;
          askRec.status = 'answered';
          askRec.answeredAt = Date.now();
          askRec.answeredBy = S.user.name || '老师';
        }
        save();
        if (leaderboard.publishReply) {
          leaderboard.publishReply({ qid: askId, text: replyText, n: S.user.name || '老师', at: Date.now() });
        }
        toast('回复已发送，学生端可以看到啦', 'ok');
        render();
        break;
      }
      case 'ask-delete': {
        var delAsk = actionEl.getAttribute('data-id');
        S.asks = (S.asks || []).filter(function (a) { return a.id !== delAsk; });
        save();
        toast('已删除该提问');
        render();
        break;
      }
      case 'ask-refresh':
        render();
        toast('已刷新');
        break;
      case 'open-guide':
        openGuide();
        break;
      case 'create-class':
        openCreateClass();
        break;
      case 'show-class-code':
        showClassCode(actionEl.getAttribute('data-id'));
        break;
      case 'join-class':
        openJoinClass();
        break;
      case 'publish-homework':
        openHomeworkForm();
        break;
      case 'hw-publish': {
        var hp = homeworkById(actionEl.getAttribute('data-id'));
        if (hp) { hp.status = 'open'; save(); toast('作业已发布'); render(); }
        break;
      }
      case 'hw-close': {
        var hc = homeworkById(actionEl.getAttribute('data-id'));
        if (hc) { hc.status = 'closed'; save(); toast('作业已结束'); render(); }
        break;
      }
      case 'hw-delete': {
        var hdId = actionEl.getAttribute('data-id');
        S.homework = (S.homework || []).filter(function (h) { return h.id !== hdId; });
        save(); toast('作业已删除'); render();
        break;
      }
      case 'hw-preview': {
        var hpv = homeworkById(actionEl.getAttribute('data-id'));
        if (hpv) showHomeworkPreview(hpv);
        break;
      }
      case 'start-homework':
        location.hash = '#/student/game/homework/' + actionEl.getAttribute('data-id');
        break;
      case 'rerun-test': {
        var t = PK.selfTest(bank());
        toast(t.ok ? '自检通过：' + t.passed + '/' + t.total + ' 题目判定正确' : '自检发现 ' + t.failures.length + ' 个问题', t.ok ? 'ok' : 'bad');
        render();
        break;
      }
      case 'new-question':
        openQuestionForm();
        break;
      case 'delete-question': {
        var qid = actionEl.getAttribute('data-id');
        S.customQuestions = (S.customQuestions || []).filter(function (q) { return q.id !== qid; });
        save();
        toast('题目已删除');
        render();
        break;
      }
      case 'export': {
        var snap = scopedSnapshot('today');
        var csv = '排名,学生,学校,班级,今日积分,本周积分,总积分\n' + snap.entries.map(function (e2) {
          return [e2.rank, e2.name, e2.school || S.user.school || '', e2.klass, e2.points.today, e2.points.week, e2.points.total].join(',');
        }).join('\n');
        download('跑酷学堂-成绩单.csv', '\ufeff' + csv);
        toast('成绩单已导出', 'ok');
        break;
      }
      case 'start-race':
        startRace();
        toast('课堂竞速已开始，榜单每 2 秒刷新', 'ok');
        render();
        break;
      case 'stop-race':
        if (raceState) { raceState.running = false; if (raceState.interval) clearInterval(raceState.interval); }
        toast('竞速已结束');
        render();
        break;
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    var action = el.getAttribute && el.getAttribute('data-action');
    if (!action) return;
    if (action === 'lb-subject') { ui.lbSubject = el.value; render(); }
    else if (action === 'lb-class') { ui.lbClass = el.value; render(); }
    else if (action === 'filter-subject') { ui.questionFilter.subject = el.value; render(); }
    else if (action === 'filter-type') { ui.questionFilter.type = el.value; render(); }
    else if (action === 'filter-difficulty') { ui.questionFilter.difficulty = el.value; render(); }
  });

  // 聊天输入框回车发送
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'chatInput' && e.key === 'Enter') {
      e.preventDefault();
      var v = e.target.value;
      e.target.value = '';
      chatSend(v);
    }
  });

  function download(filename, content) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ============================================================
   * 覆盖层：创建班级 / 班级码 / 加入班级 / 使用解说 / 发布作业
   * ============================================================ */
  function overlay(html, maxWidth) {
    var wrap = document.createElement('div');
    wrap.className = 'overlay modal';
    wrap.innerHTML = '<div class="overlay-card" style="max-width:' + (maxWidth || 560) + 'px">' + html + '</div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = String(text); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch (e) {}
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || '已复制', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(String(text)).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  function inviteLink(code, school) {
    var q = school ? ('?school=' + encodeURIComponent(school)) : '';
    return location.origin + location.pathname + q + '#/student/join/' + code;
  }

  function openCreateClass() {
    if (!isTeacher()) { toast('请先切换到「老师」身份再创建班级', 'bad'); return; }
    var gradeOptions = PK.GRADES.map(function (g) {
      return '<option value="' + g.key + '">' + g.label + '（' + g.stage + '）</option>';
    }).join('');
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">创建班级</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">填好学校名与班级名后，<b>AI 会自动识别所属年级</b>（用于「同年级榜」和班级对比统计）；创建后会立刻弹出 4 位班级码。</p>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>学校名称</label><input class="input" id="ccSchool" maxlength="20" placeholder="例如：阳光小学" value="' + esc(S.user.school || '') + '"></div>' +
        '<div class="form-field"><label>班级名称</label><input class="input" id="ccName" placeholder="例如：五年级 3 班"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>年级（AI 自动识别，可修改）</label>' +
          '<select class="select" id="ccGrade"><option value="unknown">未识别 / 其它</option>' + gradeOptions + '</select>' +
          '<div id="ccGradeHint" class="lb-sub">🤖 输入班级名称后自动识别年级</div></div>' +
        '<div class="form-field"><label>学生人数（可留空）</label><input class="input" id="ccStudents" type="number" min="0" placeholder="0"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>授课老师</label><input class="input" id="ccTeacher" placeholder="例如：李老师"></div>' +
      '</div>' +
      '<div id="ccMsg" class="muted modal-sub"></div>' +
      '<div class="row" style="gap:10px;margin-top:6px"><button class="btn btn-teacher grow" id="ccSave">创建班级</button></div>'
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };

    // AI 自动识别年级：一边输入班级名一边更新
    var nameInput = wrap.querySelector('#ccName');
    var gradeSel = wrap.querySelector('#ccGrade');
    var hint = wrap.querySelector('#ccGradeHint');
    var gradeTouched = false;
    gradeSel.addEventListener('change', function () { gradeTouched = true; });
    nameInput.addEventListener('input', function () {
      var g = PK.inferGrade(nameInput.value);
      if (g.auto && !gradeTouched) gradeSel.value = g.key;
      var byKey = PK.gradeByKey(gradeSel.value);
      if (g.auto) {
        hint.innerHTML = '🤖 AI 识别：<b>' + g.label + '</b>' + (g.stage ? '（' + g.stage + '）' : '') + '，可手动修改';
      } else {
        hint.innerHTML = nameInput.value ? '🤖 未能自动识别，请手动选择年级' : '🤖 输入班级名称后自动识别年级';
      }
      if (byKey) hint.innerHTML = hint.innerHTML.replace('可手动修改', '当前选择：' + byKey.label);
    });

    wrap.querySelector('#ccSave').onclick = function () {
      var name = nameInput.value.trim();
      var school = wrap.querySelector('#ccSchool').value.trim();
      var msg = wrap.querySelector('#ccMsg');
      if (!school) { msg.innerHTML = '<span style="color:#c62c27">请填写学校名称</span>'; return; }
      if (!name) { msg.innerHTML = '<span style="color:#c62c27">请填写班级名称</span>'; return; }
      var picked = PK.gradeByKey(gradeSel.value) || PK.inferGrade(name);
      if (!picked || picked.key === 'unknown') picked = { key: 'unknown', label: '未识别', stage: '' };
      var cls = {
        id: uid('cls'),
        name: name.slice(0, 20),
        code: genClassCode(),
        school: school.slice(0, 20),
        gradeKey: picked.key,
        gradeLabel: picked.label,
        stage: picked.stage || '',
        owner: S.user.name || '老师',
        teacher: wrap.querySelector('#ccTeacher').value.trim() || '我',
        students: Math.max(0, parseInt(wrap.querySelector('#ccStudents').value, 10) || 0),
        avg: 0, rate: 0, createdAt: Date.now()
      };
      S.classes.push(cls);
      S.user.school = cls.school;
      save();
      if (leaderboard.publishClass) {
        leaderboard.publishClass({
          cid: cls.id, name: cls.name, code: cls.code, school: cls.school,
          gradeKey: cls.gradeKey, gradeLabel: cls.gradeLabel, stage: cls.stage,
          owner: cls.owner, teacher: cls.teacher, students: cls.students, at: cls.createdAt
        });
      }
      save();
      wrap.remove();
      ui.teacherTab = 'classes';
      render();
      showClassCode(cls.id, true);
    };
  }

  function showClassCode(classId, justCreated) {
    var cls = classById(classId);
    if (!cls) return;
    var link = inviteLink(cls.code, cls.school);
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">' + (justCreated ? '班级创建成功 🎉' : '班级码') + '</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">学生要在登录时输入<b>同一所学校名</b> + 下面 4 位班级码，才算加入 <b>' + esc(cls.name) + '</b>。</p>' +
      '<div class="ask-answer" style="margin-bottom:12px"><b>学校：</b>' + esc(cls.school || '—') +
        '　<b>年级：</b>' + esc(cls.gradeLabel || '未识别') + (cls.stage ? '（' + esc(cls.stage) + '）' : '') +
        '<div class="lb-sub">🤖 年级由 AI 根据班级名称自动识别，可在创建时修改</div></div>' +
      '<div class="code-box"><div class="code-label">班级码</div><div class="code-value">' + esc(cls.code) + '</div></div>' +
      '<div class="row" style="gap:10px;margin-top:14px;flex-wrap:wrap">' +
        '<button class="btn btn-teacher grow" data-copy-code>📋 复制班级码</button>' +
        '<button class="btn btn-ghost grow" data-copy-link>🔗 复制邀请链接</button>' +
      '</div>' +
      '<div class="invite-preview mono">' + esc(link) + '</div>' +
      (justCreated ? '<div class="analysis" style="margin-top:12px">✅ 老师账号不会作为学生加入班级，请把班级码交给学生使用。</div>' : '')
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };
    wrap.querySelector('[data-copy-code]').onclick = function () { copyText(cls.code, '班级码已复制：' + cls.code); };
    wrap.querySelector('[data-copy-link]').onclick = function () { copyText(link, '邀请链接已复制'); };
  }

  function openJoinClass(prefill) {
    if (isTeacher()) {
      toast('老师账号不能作为学生加入班级，请在教师端创建 / 管理班级', 'bad');
      return;
    }
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">加入班级</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">需要和老师<b>同校 + 同一个班级码</b>才算加入同一个班级。</p>' +
      '<div class="form-field"><label>学校名称</label><input class="input" id="jcSchool" maxlength="20" placeholder="例如：阳光小学" value="' + esc(S.user.school || S.lastSchool || '') + '"></div>' +
      '<div class="form-field"><label>班级码</label><input class="input code-input" id="jcCode" inputmode="numeric" maxlength="4" placeholder="4 位数字" value="' + esc(prefill || '') + '"></div>' +
      '<div id="jcMsg" class="muted modal-sub"></div>' +
      '<div class="row" style="gap:10px;margin-top:6px"><button class="btn btn-primary grow" id="jcJoin">加入班级</button></div>'
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };
    var schoolInput = wrap.querySelector('#jcSchool');
    var input = wrap.querySelector('#jcCode');
    var msg = wrap.querySelector('#jcMsg');
    var doJoin = function () {
      var code = String(input.value || '').replace(/\s/g, '');
      var school = schoolInput.value.trim();
      if (!school) { msg.innerHTML = '<span style="color:#c62c27">请先填写学校名称</span>'; schoolInput.focus(); return; }
      if (!/^\d{4}$/.test(code)) { msg.innerHTML = '<span style="color:#c62c27">请输入 4 位数字班级码</span>'; return; }
      var cls = classBySchoolCode(school, code);
      if (!cls) { msg.innerHTML = '<span style="color:#c62c27">这所学校里没有找到该班级码，请核对学校名与班级码</span>'; return; }
      S.user.school = school.slice(0, 20);
      S.lastSchool = S.user.school;
      joinClassById(cls);
      save();
      wrap.remove();
      toast('已加入「' + cls.name + '」', 'ok');
      confetti(40);
      render();
    };
    wrap.querySelector('#jcJoin').onclick = doJoin;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJoin(); });
    setTimeout(function () { input.focus(); }, 30);
  }

  function guideSteps() {
    return [
      { e: '🏫', who: '老师', t: '创建班级，秒出班级码', d: '进入「教师端 → 班级学情」，点「创建班级」，填好名称点创建，界面会立刻弹出 4 位班级码，点「复制班级码 / 复制邀请链接」发给学生即可。老师账号不会作为学生加入班级。' },
      { e: '🧑‍🎓', who: '学生', t: '用班级码加入班级', d: '进入「学生端」，点右上角「加入班级」，输入老师给的 4 位数字班级码。加入后你的积分会算进这个班级。' },
      { e: '🏃', who: '学生', t: '跑酷闯关答题', d: '在「学生端」选学科与难度，点「开始闯关」。三跑道跑酷：撞到建筑才会弹出题目，答对让建筑爆出金币（题目越难金币越多），答错扣 1 点生命并自动收录错题；换道或跳跃躲开建筑就不会出题。每个学科一套专属场景，键盘 ←/→ 换道、空格跳跃，手机左右滑动换道。' },
      { e: '📝', who: '老师', t: '从题库发布作业', d: '进入「教师端 → 作业管理 → 发布作业」，填标题、选班级，再从题库中勾选题目组成作业。需要新题请先到「题库管理 → 新增题目」，保存后即可选中——作业题目统一来自题库，无需另外上传。' },
      { e: '📷', who: '老师', t: '题目和作业可以带图片、链接', d: '新增题目或发布作业时，可以上传图片（也可直接粘图片网址），还能附上参考网页链接；学生答题时会看到图和可点开的资料。' },
      { e: '🐾', who: '学生', t: '伙伴成长与家园布置', d: '答题赚金币 → 在「我的家园」买伙伴、给伙伴升级（每级金币 +4%、分数 +3%），还能买摆件布置你们的房间。出战哪个伙伴，跑酷游戏里跑的就是它。' },
      { e: '💬', who: '学生', t: '和伙伴聊天', d: '点「学生端 → 伙伴」或家园里的「和伙伴聊天」，可以让它出题、讲题、讲笑话、讲故事、陪你聊心情。默认本地陪伴模式不用联网；想更自由对话，可在「AI 设置」里填自己的大模型接口。' },
      { e: '🧯', who: '学生', t: '错题修复与作业', d: '答错的题会自动进入「错题修复」，答对后自动移出。老师布置的作业会出现在「学生端 → 待完成作业」，点「去完成」即可作答。' },
      { e: '🙋', who: '学生', t: '不会就问老师', d: '在「学生端 → 向老师提问」写下不会的题或听不懂的知识点（可以配一张题目截图，或粘贴图片网址）。老师在「教师端 → 学生提问」里看到后会逐条回复，回复内容会立刻出现在你的「我的提问」里。' },
      { e: '🏆', who: '全员', t: '实时积分榜单', d: '每次答题的积分都会实时计入榜单，支持今日 / 本周 / 总榜与分学科筛选，含前三名领奖台与实时动态。把网址发给同学，多台设备打开即可同屏竞技。' },
      { e: '📊', who: '老师', t: '学情分析与课堂竞速', d: '「班级学情」查看今日学生积分排行并可一键导出成绩；「课堂竞速」让全班同屏 PK；「答案判定引擎」可查看判分自检与逐题对比。' },
      { e: '🏡', who: '学生', t: '金币与我的家园', d: '闯关获得金币，在「我的家园」兑换伙伴、徽章与赛道主题，让跑酷更有趣。' }
    ];
  }

  function guideHtml(inModal) {
    var html = '<div class="row between"><h3 class="modal-title">📖 使用解说</h3>' +
      (inModal ? '<button class="btn btn-ghost btn-sm" data-close>关闭</button>' : '<button class="btn btn-primary btn-sm" data-action="start-game">🚀 开始体验</button>') +
      '</div>' +
      '<p class="muted modal-sub">30 秒了解全部玩法。学生填昵称即可进（班级码选填），老师进入后建班出题；<b>身份在登录页选定后不会互相切换</b>，要换身份请先「退出」。</p>' +
      '<div class="guide-grid">' + guideSteps().map(function (s, i) {
        return '<div class="guide-step">' +
          '<div class="guide-num">' + (i + 1) + '</div>' +
          '<div class="guide-emoji">' + s.e + '</div>' +
          '<div class="grow"><div class="row" style="gap:8px;align-items:center"><b>' + s.t + '</b>' +
          '<span class="badge ' + (s.who === '老师' ? 'teacher' : '') + '">' + s.who + '</span></div>' +
          '<p class="muted" style="font-size:12.5px;line-height:1.75;margin-top:5px">' + s.d + '</p></div>' +
        '</div>';
      }).join('') + '</div>' +
      (inModal
        ? '<label class="row" style="gap:8px;margin-top:14px;font-size:13px"><input type="checkbox" id="gdNever"' + (S.seenGuide ? ' checked' : '') + '> 下次打开不再自动弹出</label>'
        : '');
    return html;
  }

  function viewGuide() {
    return '<div class="fade-in"><section class="card">' + guideHtml(false) + '</section></div>';
  }

  function openGuide() {
    var wrap = overlay(guideHtml(true), 780);
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };
    var never = wrap.querySelector('#gdNever');
    if (never) never.onchange = function () { S.seenGuide = never.checked; save(); };
  }

  /* 第一次登录后自动弹一次使用解说（勾选“下次不再弹出”后不再打扰） */
  function maybeFirstGuide() {
    if (S.seenGuide) return;
    setTimeout(function () {
      if (!S.seenGuide && S.loggedIn && !document.querySelector('.overlay.modal')) openGuide();
    }, 700);
  }

  function openHomeworkForm() {
    if (!S.classes.length) { toast('请先创建班级，再发布作业', 'bad'); ui.teacherTab = 'classes'; render(); return; }
    ui.hwPick = { subject: 'all', type: 'all', difficulty: 'all' };
    ui.hwSelected = [];
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">发布作业</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">作业题目从题库中挑选布置。需要新题请先到「题库管理 → 新增题目」，保存后即可在这里选中。</p>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>作业标题</label><input class="input" id="hwTitle" placeholder="例如：数学 · 一元二次方程 第 1 次作业"></div>' +
        '<div class="form-field"><label>发布班级</label><select class="select" id="hwClass">' +
          S.classes.slice().reverse().map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '（班级码 ' + esc(c.code) + '）</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>截止日期（可留空）</label><input class="input" id="hwDue" type="date"></div>' +
        '<div class="form-field"><label>作业说明（可留空）</label><input class="input" id="hwNote" placeholder="例如：放学前完成"></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>作业配图（可选 · 上传图片 / 拍照）</label>' +
          '<input class="input" type="file" id="hwImage" accept="image/*"><div id="hwImagePreview"></div>' +
          '<input class="input" id="hwImageUrl" style="margin-top:8px" placeholder="或粘贴图片网址 https://..."></div>' +
        '<div class="form-field"><label>参考资料链接（可选 · 分享网页给学生）</label>' +
          '<div class="grid grid-2"><input class="input" id="hwLinkTitle" placeholder="链接标题，如：微课视频">' +
          '<input class="input" id="hwLinkUrl" placeholder="https://..."></div></div>' +
      '</div>' +
      '<div class="picker-bar">' +
        '<select class="select" style="width:auto" id="hwFSubject"><option value="all">全部学科</option>' +
          PK.SUBJECTS.map(function (s) { return '<option value="' + s.key + '">' + s.name + '</option>'; }).join('') + '</select>' +
        '<select class="select" style="width:auto" id="hwFType"><option value="all">全部题型</option>' +
          PK.TYPES.map(function (t) { return '<option value="' + t.key + '">' + t.name + '</option>'; }).join('') + '</select>' +
        '<select class="select" style="width:auto" id="hwFDiff"><option value="all">全部难度</option>' +
          PK.DIFFICULTIES.map(function (d) { return '<option value="' + d.key + '">' + d.name + '</option>'; }).join('') + '</select>' +
        '<span class="grow"></span>' +
        '<button class="btn btn-ghost btn-sm" id="hwPickAll">全选筛选结果</button>' +
        '<button class="btn btn-ghost btn-sm" id="hwClear">清空</button>' +
      '</div>' +
      '<div class="picker-list" id="hwList"></div>' +
      '<div id="hwMsg" class="muted modal-sub"></div>' +
      '<div class="row between" style="margin-top:14px">' +
        '<span id="hwCount" class="muted">已选 0 道题</span>' +
        '<button class="btn btn-teacher" id="hwSave">发布作业</button>' +
      '</div>', 840
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };

    var hwImage = '';
    var hwImageInput = wrap.querySelector('#hwImage');
    if (hwImageInput) {
      hwImageInput.onchange = function () {
        var f = hwImageInput.files && hwImageInput.files[0];
        if (!f) return;
        readImageFile(f, function (dataUrl) {
          hwImage = dataUrl;
          wrap.querySelector('#hwImagePreview').innerHTML = attachPreviewHtml(dataUrl, f.name);
          var x = wrap.querySelector('#hwImagePreview .attach-x');
          if (x) x.onclick = function () { hwImage = ''; wrap.querySelector('#hwImagePreview').innerHTML = ''; hwImageInput.value = ''; };
        });
      };
    }

    var listEl = wrap.querySelector('#hwList');
    function filtered() {
      var f = ui.hwPick;
      return bank().filter(function (q) {
        if (f.subject !== 'all' && q.subject !== f.subject) return false;
        if (f.type !== 'all' && q.type !== f.type) return false;
        if (f.difficulty !== 'all' && q.difficulty !== f.difficulty) return false;
        return true;
      });
    }
    function renderPick() {
      var list = filtered();
      listEl.innerHTML = list.length ? list.map(function (q) {
        var subj = PK.subjectByKey(q.subject);
        var checked = ui.hwSelected.indexOf(q.id) !== -1;
        return '<label class="pick-item' + (checked ? ' on' : '') + '">' +
          '<input type="checkbox" data-pick="' + q.id + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="grow"><b>' + esc(String(q.content).slice(0, 46)) + (String(q.content).length > 46 ? '…' : '') + '</b>' +
          '<span class="lb-sub">' + subj.emoji + ' ' + subj.name + ' · ' + typeName(q.type) + ' · ' + difficultyName(q.difficulty) +
          ' · 答案 ' + esc(PK.grade(q, q.answer).expectedText) + '</span></span>' +
        '</label>';
      }).join('') : '<div class="empty"><span class="em">🔍</span>当前筛选下没有题目</div>';
      wrap.querySelector('#hwCount').textContent = '已选 ' + ui.hwSelected.length + ' 道题';
    }
    renderPick();

    listEl.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-pick]');
      if (!cb) return;
      var id = cb.getAttribute('data-pick');
      if (cb.checked) { if (ui.hwSelected.indexOf(id) === -1) ui.hwSelected.push(id); }
      else ui.hwSelected = ui.hwSelected.filter(function (x) { return x !== id; });
      var item = cb.closest('.pick-item');
      if (item) item.classList.toggle('on', cb.checked);
      wrap.querySelector('#hwCount').textContent = '已选 ' + ui.hwSelected.length + ' 道题';
    });
    ['hwFSubject', 'hwFType', 'hwFDiff'].forEach(function (sel) {
      wrap.querySelector('#' + sel).addEventListener('change', function (e) {
        var key = sel === 'hwFSubject' ? 'subject' : sel === 'hwFType' ? 'type' : 'difficulty';
        ui.hwPick[key] = e.target.value;
        renderPick();
      });
    });
    wrap.querySelector('#hwPickAll').onclick = function () {
      filtered().forEach(function (q) { if (ui.hwSelected.indexOf(q.id) === -1) ui.hwSelected.push(q.id); });
      renderPick();
    };
    wrap.querySelector('#hwClear').onclick = function () { ui.hwSelected = []; renderPick(); };

    wrap.querySelector('#hwSave').onclick = function () {
      var msg = wrap.querySelector('#hwMsg');
      var title = wrap.querySelector('#hwTitle').value.trim();
      if (!title) { msg.innerHTML = '<span style="color:#c62c27">请填写作业标题</span>'; return; }
      if (!ui.hwSelected.length) { msg.innerHTML = '<span style="color:#c62c27">请至少从题库中选择 1 道题</span>'; return; }
      var clsId = wrap.querySelector('#hwClass').value;
      var cls = classById(clsId);
      var due = wrap.querySelector('#hwDue').value || '';
      var note = wrap.querySelector('#hwNote').value.trim();
      S.homework = S.homework || [];
      S.homework.unshift({
        id: uid('hw'),
        title: title.slice(0, 40),
        note: note,
        image: hwImage || wrap.querySelector('#hwImageUrl').value.trim() || '',
        link: (wrap.querySelector('#hwLinkUrl').value.trim()
          ? { title: wrap.querySelector('#hwLinkTitle').value.trim() || '参考资料', url: wrap.querySelector('#hwLinkUrl').value.trim() }
          : null),
        classId: clsId,
        className: cls ? cls.name : '未指定班级',
        questionIds: ui.hwSelected.slice(),
        createdAt: Date.now(),
        due: due,
        status: 'open',
        submissions: {}
      });
      save();
      wrap.remove();
      toast('作业已发布给「' + (cls ? cls.name : '') + '」，共 ' + ui.hwSelected.length + ' 道题', 'ok');
      confetti(50);
      ui.teacherTab = 'homework';
      render();
    };
  }

  /** 读取图片文件并压缩成 dataURL（避免 localStorage 爆掉） */
  function readImageFile(file, cb) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var raw = String(reader.result || '');
      try {
        var img = new Image();
        img.onload = function () {
          var max = 900;
          var w = img.width || max, h = img.height || max;
          if (w > max) { h = Math.round(h * max / w); w = max; }
          try {
            var cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            cb(cv.toDataURL('image/jpeg', 0.72));
          } catch (e) { cb(raw); }
        };
        img.onerror = function () { cb(raw); };
        img.src = raw;
      } catch (e) { cb(raw); }
    };
    reader.onerror = function () { toast('图片读取失败，请换一张试试', 'bad'); };
    reader.readAsDataURL(file);
  }

  function attachPreviewHtml(src, name) {
    if (!src) return '';
    return '<div class="attach-preview"><img src="' + esc(src) + '" alt="配图"><button type="button" class="attach-x">×</button>' +
      (name ? '<span class="lb-sub">' + esc(name) + '</span>' : '') + '</div>';
  }

  /* ============================================================
   * 学生向老师提问
   * ============================================================ */
  function openAskTeacher() {
    if (isTeacher()) { toast('老师身份不需要提问，可在「学生提问」里回复同学', 'bad'); return; }
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">🙋 向老师提问</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">不会的题、听不懂的知识点都可以问。老师会在「教师端 → 学生提问」看到并回复，回复后你在这里就能看到。</p>' +
      '<div class="form-field"><label>你的问题</label>' +
        '<textarea class="textarea" id="askText" rows="4" placeholder="例如：这道一元二次方程为什么不能直接开平方？"></textarea></div>' +
      '<div class="grid grid-2">' +
        '<div class="form-field"><label>题目截图（可选 · 上传）</label>' +
          '<input class="input" type="file" id="askImage" accept="image/*"><div id="askPreview"></div>' +
          '<span class="lb-sub">上传的图片保存在你这台设备上，老师端看不到</span></div>' +
        '<div class="form-field"><label>或粘贴图片网址（可选 · 老师也能看到）</label>' +
          '<input class="input" id="askImageUrl" placeholder="https://example.com/pic.png">' +
          '<span class="lb-sub">想让老师也看到图，请用图片网址</span></div>' +
      '</div>' +
      '<div id="askMsg" class="muted modal-sub"></div>' +
      '<div class="row" style="gap:10px"><button class="btn btn-primary grow" id="askSave">发送给老师</button></div>'
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };

    var uploaded = '';
    var fileInput = wrap.querySelector('#askImage');
    if (fileInput) {
      fileInput.onchange = function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        readImageFile(f, function (dataUrl) {
          uploaded = dataUrl;
          wrap.querySelector('#askPreview').innerHTML = attachPreviewHtml(dataUrl, f.name);
          var x = wrap.querySelector('#askPreview .attach-x');
          if (x) x.onclick = function () { uploaded = ''; wrap.querySelector('#askPreview').innerHTML = ''; fileInput.value = ''; };
        });
      };
    }

    wrap.querySelector('#askSave').onclick = function () {
      var text = wrap.querySelector('#askText').value.trim();
      var msg = wrap.querySelector('#askMsg');
      if (text.length < 2) { msg.innerHTML = '<span class="bad">请把问题写清楚一点（至少 2 个字）</span>'; return; }
      var imgUrl = wrap.querySelector('#askImageUrl').value.trim();
      var rec = {
        id: uid('ask'),
        student: S.user.name || '同学',
        emoji: S.user.emoji || '🙂',
        klass: S.user.klass || '',
        classId: (myClass() || {}).id || '',
        text: text.slice(0, 500),
        image: imgUrl || uploaded,
        createdAt: Date.now(),
        status: 'open'
      };
      S.asks = S.asks || [];
      S.asks.unshift(rec);
      save();
      if (leaderboard.publishQuestion) {
        leaderboard.publishQuestion({
          qid: rec.id, n: rec.student, e: rec.emoji, k: rec.klass,
          text: rec.text, img: imgUrl || '', at: rec.createdAt
        });
      }
      wrap.remove();
      confetti(30);
      toast('问题已发给老师，回复后会出现在「我的提问」里', 'ok');
      render();
    };
  }

  function showHomeworkPreview(h) {
    var qs = (h.questionIds || []).map(questionById).filter(Boolean);
    var wrap = overlay(
      '<div class="row between"><h3 class="modal-title">' + esc(h.title) + '</h3><button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted modal-sub">' + esc(h.className || '') + ' · ' + qs.length + ' 道题 · ' + (h.due ? '截止 ' + esc(h.due) : '长期有效') + (h.note ? ' · ' + esc(h.note) : '') + '</p>' +
      (h.image ? '<img class="q-image" src="' + esc(h.image) + '" alt="作业配图">' : '') +
      (h.link && h.link.url ? '<a class="q-link" href="' + esc(h.link.url) + '" target="_blank" rel="noopener">🔗 ' + esc(h.link.title || '参考资料') + '</a>' : '') +
      '<div class="picker-list">' + (qs.length ? qs.map(function (q, i) {
        var subj = PK.subjectByKey(q.subject);
        return '<div class="pick-item on"><span class="grow"><b>' + (i + 1) + '. ' + esc(q.content) + '</b>' +
          '<span class="lb-sub">' + subj.emoji + ' ' + subj.name + ' · ' + typeName(q.type) + ' · 答案 ' + esc(PK.grade(q, q.answer).expectedText) + '</span></span></div>';
      }).join('') : '<div class="empty">暂无题目</div>') + '</div>',
      720
    );
    wrap.querySelector('[data-close]').onclick = function () { wrap.remove(); };
  }

  function openQuestionForm() {
    var wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.style.position = 'fixed';
    wrap.style.zIndex = '100';
    wrap.innerHTML =
      '<div class="overlay-card">' +
        '<div class="row between"><h3 style="font-size:18px;font-weight:900">新增题目</h3>' +
        '<button class="btn btn-ghost btn-sm" id="qfClose">关闭</button></div>' +
        '<p class="muted" style="font-size:12.5px;margin:8px 0 14px">保存前会用答案判定引擎自动校验：正确答案必须能判对、其它选项必须判错。</p>' +
        '<div class="grid grid-3">' +
          '<div class="form-field"><label>学科</label><select class="select" id="qfSubject">' +
            PK.SUBJECTS.map(function (s) { return '<option value="' + s.key + '">' + s.name + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-field"><label>学段</label><select class="select" id="qfStage">' +
            PK.STAGES.map(function (s) { return '<option value="' + s.key + '">' + s.name + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-field"><label>难度</label><select class="select" id="qfDifficulty">' +
            PK.DIFFICULTIES.map(function (d) { return '<option value="' + d.key + '">' + d.name + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
        '<div class="form-field"><label>题型</label><select class="select" id="qfType">' +
          PK.TYPES.map(function (t) { return '<option value="' + t.key + '">' + t.name + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-field"><label>章节</label><input class="input" id="qfChapter" placeholder="例如：一元二次方程"></div>' +
        '<div class="form-field"><label>题干</label><textarea class="textarea" id="qfContent" placeholder="请输入题干"></textarea></div>' +
        '<div class="grid grid-2">' +
          '<div class="form-field"><label>题目配图（可选 · 支持拍照/上传图片）</label>' +
            '<input class="input" type="file" id="qfImage" accept="image/*">' +
            '<div id="qfImagePreview"></div></div>' +
          '<div class="form-field"><label>或粘贴图片网址（可选）</label>' +
            '<input class="input" id="qfImageUrl" placeholder="https://example.com/pic.png"></div>' +
        '</div>' +
        '<div class="form-field"><label>参考资料链接（可选）</label>' +
          '<div class="grid grid-2"><input class="input" id="qfLinkTitle" placeholder="链接标题，如：知识点讲解">' +
          '<input class="input" id="qfLinkUrl" placeholder="https://..."></div></div>' +
        '<div id="qfOptions"></div>' +
        '<div class="form-field"><label>正确答案</label><div id="qfAnswerHost"></div></div>' +
        '<div class="form-field"><label>解析</label><textarea class="textarea" id="qfAnalysis" placeholder="请输入题目解析"></textarea></div>' +
        '<div id="qfMsg" class="muted" style="font-size:12.5px;min-height:18px"></div>' +
        '<div class="row" style="margin-top:12px;gap:10px"><button class="btn btn-teacher grow" id="qfSave">保存并校验</button></div>' +
      '</div>';
    document.body.appendChild(wrap);

    var typeSel = $('#qfType', wrap);
    var optionsHost = $('#qfOptions', wrap);
    var answerHost = $('#qfAnswerHost', wrap);

    function renderOptions() {
      var type = typeSel.value;
      if (type === 'fill') {
        optionsHost.innerHTML = '';
        answerHost.innerHTML = '<input class="input" id="qfAnswerText" placeholder="填写正确答案，多个等价答案用 | 分隔">';
      } else if (type === 'judge') {
        optionsHost.innerHTML = '<div class="form-field"><label>选项</label><input class="input" value="正确 / 错误" disabled></div>';
        answerHost.innerHTML = '<select class="select" id="qfAnswerSel"><option value="A">正确（A）</option><option value="B">错误（B）</option></select>';
      } else {
        optionsHost.innerHTML = '<div class="form-field"><label>选项（4 个）</label>' +
          [0, 1, 2, 3].map(function (i) { return '<input class="input" style="margin-bottom:8px" id="qfOpt' + i + '" placeholder="选项 ' + String.fromCharCode(65 + i) + '">'; }).join('') + '</div>';
        answerHost.innerHTML = '<select class="select" id="qfAnswerSel">' +
          [0, 1, 2, 3].map(function (i) { return '<option value="' + String.fromCharCode(65 + i) + '">' + String.fromCharCode(65 + i) + '</option>'; }).join('') + '</select>';
      }
    }
    renderOptions();
    typeSel.addEventListener('change', renderOptions);
    $('#qfClose', wrap).onclick = function () { wrap.remove(); };

    // 配图：上传的照片会压缩后保存；也可以直接粘贴图片网址
    var uploadedImage = '';
    var imgInput = $('#qfImage', wrap);
    if (imgInput) {
      imgInput.onchange = function () {
        var f = imgInput.files && imgInput.files[0];
        if (!f) return;
        readImageFile(f, function (dataUrl) {
          uploadedImage = dataUrl;
          $('#qfImagePreview', wrap).innerHTML = attachPreviewHtml(dataUrl, f.name);
          var x = $('#qfImagePreview .attach-x', wrap);
          if (x) x.onclick = function () { uploadedImage = ''; $('#qfImagePreview', wrap).innerHTML = ''; imgInput.value = ''; };
        });
      };
    }

    $('#qfSave', wrap).onclick = function () {
      var type = typeSel.value;
      var content = $('#qfContent', wrap).value.trim();
      var msg = $('#qfMsg', wrap);
      var options = [];
      var answer = '';
      var accept = [];

      if (!content) { msg.innerHTML = '<span style="color:#c62c27">请填写题干</span>'; return; }
      if (type === 'fill') {
        var raw = $('#qfAnswerText', wrap).value.trim();
        if (!raw) { msg.innerHTML = '<span style="color:#c62c27">请填写正确答案</span>'; return; }
        var parts = raw.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
        answer = parts[0];
        accept = parts.slice(1);
      } else if (type === 'judge') {
        options = ['正确', '错误'];
        answer = $('#qfAnswerSel', wrap).value;
      } else {
        options = [0, 1, 2, 3].map(function (i) { return ($('#qfOpt' + i, wrap).value || '').trim(); });
        if (options.filter(Boolean).length < 4) { msg.innerHTML = '<span style="color:#c62c27">请填写完整的 4 个选项</span>'; return; }
        answer = $('#qfAnswerSel', wrap).value;
      }

      var q = {
        id: uid('custom'),
        subject: $('#qfSubject', wrap).value,
        stage: $('#qfStage', wrap).value,
        difficulty: $('#qfDifficulty', wrap).value,
        type: type,
        chapter: $('#qfChapter', wrap).value.trim() || '自定义章节',
        content: content,
        options: options,
        answer: answer,
        accept: accept,
        analysis: $('#qfAnalysis', wrap).value.trim() || '教师自定义题目',
        source: '教师自定义',
        image: uploadedImage || $('#qfImageUrl', wrap).value.trim() || '',
        link: ($('#qfLinkUrl', wrap).value.trim()
          ? { title: $('#qfLinkTitle', wrap).value.trim() || '参考资料', url: $('#qfLinkUrl', wrap).value.trim() }
          : null),
        verified: true
      };

      var check = PK.selfTest([q]);
      if (!check.ok) {
        msg.innerHTML = '<span style="color:#c62c27">答案校验未通过：' + esc(check.failures[0].message) + '</span>';
        return;
      }
      S.customQuestions.push(q);
      save();
      wrap.remove();
      toast('题目已保存，答案校验通过', 'ok');
      render();
    };
  }

  /* ============================================================
   * 实时刷新循环 & 启动
   * ============================================================ */
  leaderboard.subscribe(function () { refreshLive(); });
  leaderboard.start(2000);

  window.addEventListener('hashchange', function () {
    render();
  });

  if (!S.loggedIn) {
    // 未登录：只显示登录页，其余入口全部拦住
    if (location.hash !== '#/login') location.hash = '#/login';
    render();
  } else if (!location.hash) {
    location.hash = '#/home';
  } else {
    render();
  }
  if (S.loggedIn && leaderboard.setReady) leaderboard.setReady(true);

  // 登录后首次进入自动弹出「使用解说」（勾选“下次不再弹出”后不再自动弹）
  if (!S.seenGuide && S.loggedIn) {
    setTimeout(function () {
      if (!S.seenGuide && S.loggedIn && !document.querySelector('.overlay')) openGuide();
    }, 900);
  }

  setInterval(function () { save(); }, 15000);
  window.addEventListener('beforeunload', save);

  window.PKApp = {
    state: S,
    leaderboard: leaderboard,
    render: render,
    getGame: function () { return currentGame; },
    refreshLive: refreshLive,
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.reload();
    }
  };
})();
