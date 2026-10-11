/*!
 * 汤姆猫跑酷学堂 · 实时榜单数据源适配层
 *
 * 同一个 leaderboard 接口，三种模式自动切换：
 *   - remote：检测到同源后端（/api/health）→ REST + SSE，真实多端同步
 *   - cloud ：检测到公网中继（ntfy.sh）→ 浏览器直连的云端实时同步（静态托管也能多端同步）
 *   - local ：以上都没有 → 本机实时模拟（离线 / file:// 也能完整演示）
 *
 * 对外接口与 PK.createLeaderboard() 完全一致，app.js 无需关心当前用的是哪一种数据源。
 */
(function () {
  'use strict';
  var PK = window.PK;
  var ACCOUNT_KEY = 'pk-account-v1';
  var IDENTITY_KEY = 'pk-identity-v1';

  /* 公网实时中继：ntfy.sh 的公共主题，浏览器可直接读写（CORS 全开）。
     同一个主题名的所有设备共享同一份榜单；换主题名即可开一个独立榜单。 */
  var CLOUD = {
    base: 'https://ntfy.sh',
    topic: 'pkacademy-v4-4m4tnfwq6md3r',   // v4：换新房间，彻底清掉历史测试数据（未登录也不再发布）
    sinceStream: '3h',
    sincePoll: '8h',
    publishMinGap: 600,
    pollInterval: 3000
  };

  // 支持用 ?topic=自己的房间名 开一个独立榜单（老师可以和班里约定一个只有本班知道的房间名）
  try {
    var customTopic = (new URLSearchParams(location.search).get('topic') || '').trim();
    if (/^[A-Za-z0-9_-]{4,64}$/.test(customTopic)) CLOUD.topic = customTopic;
  } catch (e) {}

  function readStore(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function writeStore(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function rand(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); })
    ]);
  }
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  /**
   * @param {Object} opts 与 PK.createLeaderboard 相同，额外支持：
   *        onModeChange(mode, info)  模式切换回调
   *        onAward(gain, subject)    积分入账回调（三种模式都会触发）
   */
  function createAdaptive(opts) {
    opts = opts || {};
    var local = PK.createLeaderboard(opts);
    var mode = 'local';
    var remote = null;
    var listeners = [];
    var modeListeners = [];
    var payload = null;
    var prevRanks = {};
    var account = readStore(ACCOUNT_KEY);

    /* ---------------- 本机身份（每台设备一个，跨会话保持） ---------------- */
    var identity = readStore(IDENTITY_KEY);
    if (!identity || !identity.id) {
      identity = {
        id: rand('dev'),
        name: (opts.me && opts.me.name) || '小跑者',
        emoji: (opts.me && opts.me.emoji) || '🐱',
        klass: (opts.me && opts.me.klass) || '',
        school: (opts.me && opts.me.school) || '',
        gradeKey: (opts.me && opts.me.gradeKey) || '',
        gradeLabel: (opts.me && opts.me.gradeLabel) || ''
      };
      writeStore(IDENTITY_KEY, identity);
    }
    if (!identity.school && opts.me && opts.me.school) identity.school = opts.me.school;
    local.me.id = identity.id;

    function setMode(next, info) {
      mode = next;
      facade.mode = next;
      modeListeners.forEach(function (fn) { try { fn(next, info || null); } catch (e) {} });
    }

    /* ============================================================
     * remote：同源后端（REST + SSE）
     * ============================================================ */
    var streamAlive = false;
    var watchdog = null;

    function openStream() {
      if (!window.EventSource) { startPolling(); return; }
      try {
        var es = new EventSource('/api/stream?participantId=' + encodeURIComponent(account.participantId) + '&token=' + encodeURIComponent(account.token));
        es.addEventListener('hello', function (e) { streamAlive = true; onPayload(JSON.parse(e.data)); });
        es.addEventListener('leaderboard', function (e) { streamAlive = true; onPayload(JSON.parse(e.data)); });
        es.onerror = function () { startPolling(); };
        remote.stream = es;
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(function () { if (!streamAlive) startPolling(); }, 4000);
      } catch (e) {
        startPolling();
      }
    }

    function startPolling() {
      if (!remote || remote.poll) return;
      fetchSnapshot();
      remote.poll = setInterval(function () { fetchSnapshot(); }, 2000);
    }

    function fetchSnapshot() {
      var auth = account
        ? '&participantId=' + encodeURIComponent(account.participantId) + '&token=' + encodeURIComponent(account.token)
        : '';
      return fetch('/api/leaderboard?range=today&subject=all' + auth, { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(onPayload)
        .catch(function () {});
    }

    function onPayload(data) {
      if (!data || !data.ok) return;
      payload = data;
      if (remote.poll && streamAlive) { clearInterval(remote.poll); remote.poll = null; }
      var mine = data.entries.filter(function (e) { return e.id === account.participantId; })[0];
      if (mine) {
        remote.me.points = mine.points;
        remote.me.subjectPoints = mine.subjectPoints || {};
        remote.me.streak = mine.streak || 0;
        remote.me.correct = mine.correct || 0;
        remote.me.total = mine.answered || 0;
      }
      listeners.forEach(function (fn) { try { fn(facade.snapshot()); } catch (e) {} });
    }

    function mapEntry(e) {
      return {
        id: e.id,
        name: e.name,
        emoji: e.emoji,
        klass: e.klass || '未分班',
        school: e.school || '',
        gradeKey: e.gradeKey || '',
        gradeLabel: e.gradeLabel || '',
        isMe: e.id === account.participantId,
        isBot: !!e.isBot,
        demo: !!e.isBot,
        online: !!e.online,
        points: e.points,
        subjectPoints: e.subjectPoints || {},
        streak: e.streak || 0,
        focus: (Object.keys(e.subjectPoints || {})[0]) || 'math',
        level: 1
      };
    }

    function computeEntries(range, subjectKey) {
      if (!payload) return [];
      var rangeKey = range || 'today';
      return payload.entries.map(function (e) {
        var score;
        if (subjectKey && subjectKey !== 'all') {
          var sub = (e.subjectPoints || {})[subjectKey] || 0;
          score = Math.round(sub * (rangeKey === 'total' ? 1 : rangeKey === 'week' ? 0.75 : 0.35));
        } else {
          score = (e.points && e.points[rangeKey]) || 0;
        }
        return Object.assign(mapEntry(e), { score: score });
      });
    }

    function createRemote() {
      return {
        stream: null,
        poll: null,
        me: {
          id: account.participantId,
          name: opts.me.name,
          emoji: opts.me.emoji,
          klass: opts.me.klass,
          isMe: true,
          points: Object.assign({ today: 0, week: 0, total: 0 }, opts.me.points || {}),
          subjectPoints: Object.assign({}, opts.me.subjectPoints || {}),
          streak: 0, correct: 0, total: 0
        }
      };
    }

    /* ============================================================
     * cloud：公网中继（ntfy.sh 公共主题，浏览器直连）
     * ============================================================ */
    var cloud = {
      participants: {},
      events: [],
      ready: false,          // 登录后才向云端发布，避免游客/测试数据污染榜单
      stream: null,
      poll: null,
      watch: null,
      alive: false,
      lastMessageAt: 0,
      lastPublishAt: 0,
      publishTimer: null,
      seen: {}
    };
    var farAsks = [];      // 从云端中继收到的「学生提问 / 老师回复」
    var farClasses = [];   // 从云端中继收到的班级档案（跨设备共享班级信息）

    function cloudSelfSnapshot() {
      var me = local.me;
      var pts = me.points || {};
      return {
        id: identity.id,
        name: identity.name,
        emoji: identity.emoji,
        klass: identity.klass || '未分班',
        school: identity.school || '',
        gradeKey: identity.gradeKey || '',
        gradeLabel: identity.gradeLabel || '',
        points: { today: pts.today || 0, week: pts.week || 0, total: pts.total || 0 },
        subjectPoints: me.subjectPoints || {},
        streak: me.streak || 0,
        correct: me.correct || 0,
        total: me.total || 0,
        at: Date.now()
      };
    }

    function ingest(raw) {
      var m = raw;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
      if (!m || m.v !== 1) return;
      // 学生提问 / 老师回复：走同一条中继，单独收集（不参与积分统计）
      if (m.kind === 'ask' || m.kind === 'reply') {
        var askKey = 'a:' + m.kind + ':' + (m.qid || '') + ':' + (m.at || 0);
        if (cloud.seen[askKey]) return;
        cloud.seen[askKey] = 1;
        farAsks.push(m);
        notifyCloud();
        return;
      }
      // 班级档案：老师在 A 设备建班，学生 / 其他设备都能收到并加入
      if (m.kind === 'class') {
        var clsKey = 'c:' + (m.cid || '') + ':' + (m.at || 0);
        if (cloud.seen[clsKey]) return;
        cloud.seen[clsKey] = 1;
        farClasses.push(m);
        notifyCloud();
        return;
      }
      if (!m.p) return;
      if (m.msgId && cloud.seen[m.msgId]) return;
      if (m.msgId) cloud.seen[m.msgId] = 1;

      var p = cloud.participants[m.p];
      if (!p) {
        p = cloud.participants[m.p] = {
          id: m.p, name: m.n || '同学', emoji: m.e || '🙂', klass: m.k || '未分组',
          points: { today: 0, week: 0, total: 0 }, subjectPoints: {}, streak: 0,
          correct: 0, total: 0, at: 0, _tt: -1, demo: false,
          school: '', gradeKey: '', gradeLabel: ''
        };
      }
      var tt = Number(m.tt) || 0;
      if (tt >= (p._tt || -1)) {
        p._tt = tt;
        p.name = m.n || p.name;
        p.emoji = m.e || p.emoji;
        p.klass = m.k || p.klass;
        p.school = m.sc || p.school || '';
        p.gradeKey = m.gr || p.gradeKey || '';
        p.gradeLabel = m.grl || p.gradeLabel || '';
        p.points = { today: Number(m.tc) || 0, week: Number(m.tw) || 0, total: tt };
        if (m.sp && typeof m.sp === 'object') p.subjectPoints = m.sp;
        p.streak = Number(m.st) || 0;
        p.correct = Number(m.c) || 0;
        p.total = Number(m.a) || 0;
        p.at = Number(m.at) || Date.now();
      }

      var gain = Number(m.g) || 0;
      if (gain > 0) {
        var key = m.p + '-' + (m.at || 0) + '-' + gain;
        if (!cloud.seen['evt:' + key]) {
          cloud.seen['evt:' + key] = 1;
          cloud.events.unshift({
            id: key,
            name: p.name,
            emoji: p.emoji,
            isMe: m.p === identity.id,
            klass: p.klass || '',
            school: p.school || '',
            gradeKey: p.gradeKey || '',
            subject: PK.subjectByKey(m.s).name,
            subjectKey: m.s || 'math',
            gain: gain,
            label: (Number(m.st) || 0) >= 3 ? ('连击 ×' + m.st) : '答对题目',
            at: Number(m.at) || Date.now()
          });
          cloud.events = cloud.events.slice(0, 40);
        }
      }
    }

    function publishSelf(extra) {
      if (mode !== 'cloud') return;
      if (!cloud.ready) return;
      var me = cloudSelfSnapshot();
      var msg = {
        v: 1,
        type: extra ? 'answer' : 'sync',
        p: identity.id, n: me.name, e: me.emoji, k: me.klass,
        sc: me.school || '', gr: me.gradeKey || '', grl: me.gradeLabel || '',
        tc: me.points.today, tw: me.points.week, tt: me.points.total,
        sp: me.subjectPoints, st: me.streak, c: me.correct, a: me.total,
        at: Date.now()
      };
      if (extra) { msg.g = Number(extra.gain) || 0; msg.s = extra.subject || 'math'; }
      else { msg.s = me.focus || 'math'; }

      // 本地立刻合并，界面无须等待回程
      cloud.participants[identity.id] = Object.assign({}, me, { _tt: me.points.total, demo: false });

      var fire = function () {
        cloud.lastPublishAt = Date.now();
        fetch(CLOUD.base + '/' + CLOUD.topic, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          cache: 'no-store',
          body: JSON.stringify(msg)
        }).catch(function () {});
      };
      var now = Date.now();
      if (now - cloud.lastPublishAt < CLOUD.publishMinGap) {
        if (cloud.publishTimer) clearTimeout(cloud.publishTimer);
        cloud.publishTimer = setTimeout(fire, CLOUD.publishMinGap - (now - cloud.lastPublishAt));
      } else {
        fire();
      }
    }

    function cloudPollOnce() {
      return fetch(CLOUD.base + '/' + CLOUD.topic + '/json?since=' + CLOUD.sincePoll + '&poll=1', { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          txt.split('\n').forEach(function (line) {
            if (!line.trim()) return;
            try {
              var m = JSON.parse(line);
              if (m && m.message) {
                var body = JSON.parse(m.message);
                body.msgId = m.id;
                ingest(body);
              }
            } catch (e) {}
          });
          cloud.alive = true;
          notifyCloud();
        })
        .catch(function () {});
    }

    function startCloudPoll() {
      if (cloud.poll) return;
      cloudPollOnce();
      cloud.poll = setInterval(cloudPollOnce, CLOUD.pollInterval);
    }
    function stopCloudPoll() { if (cloud.poll) { clearInterval(cloud.poll); cloud.poll = null; } }

    function openCloudStream() {
      if (!window.EventSource) { startCloudPoll(); return; }
      try {
        var es = new EventSource(CLOUD.base + '/' + CLOUD.topic + '/sse?since=' + CLOUD.sinceStream);
        es.addEventListener('open', function () { cloud.alive = true; notifyCloud(); });
        es.addEventListener('message', function (e) {
          try {
            var m = JSON.parse(e.data);
            if (m && m.message) {
              var body = JSON.parse(m.message);
              body.msgId = m.id;
              ingest(body);
              cloud.lastMessageAt = Date.now();
            }
            cloud.alive = true;
            stopCloudPoll();          // SSE 真的收到数据了，才关掉轮询兜底
            notifyCloud();
          } catch (err) {}
        });
        es.onerror = function () { cloud.alive = false; startCloudPoll(); };
        cloud.stream = es;
      } catch (e) {
        startCloudPoll();
      }
    }

    /* 有些代理 / 隧道会缓冲 SSE：连得上却收不到消息。
       这里定期检查，只要最近一段时间没有 SSE 消息，就自动切到 3 秒轮询兜底。 */
    function ensureTransport() {
      if (!cloud.poll && Date.now() - cloud.lastMessageAt > 6000) startCloudPoll();
    }

    var cloudNotifyPending = false;
    function notifyCloud() {
      if (cloudNotifyPending) return;
      cloudNotifyPending = true;
      requestAnimationFrame(function () {
        cloudNotifyPending = false;
        listeners.forEach(function (fn) { try { fn(facade.snapshot()); } catch (e) {} });
      });
    }

    function mapCloud(p, subjectKey) {
      var sp = p.subjectPoints || {};
      var keys = Object.keys(sp);
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        klass: p.klass || '未分班',
        school: p.school || '',
        gradeKey: p.gradeKey || '',
        gradeLabel: p.gradeLabel || '',
        isMe: p.id === identity.id,
        demo: !!p.demo,
        online: p.demo ? true : (Date.now() - (p.at || 0) < 5 * 60 * 1000),
        points: p.points || { today: 0, week: 0, total: 0 },
        subjectPoints: sp,
        streak: p.streak || 0,
        focus: keys.length ? keys[0] : 'math',
        level: 1,
        subjectKey: subjectKey
      };
    }

    function cloudEntries(subjectKey) {
      var list = [];
      Object.keys(cloud.participants).forEach(function (id) {
        list.push(mapCloud(cloud.participants[id], subjectKey));
      });
      if (!cloud.participants[identity.id]) list.push(mapCloud(cloudSelfSnapshot(), subjectKey));
      // 榜单只展示真实进入的用户，不再注入任何演示 / 测试账号
      return list;
    }

    function cloudEventsForFeed() {
      if (cloud.events.length) return cloud.events;
      return local.snapshot({ range: 'today' }).events;
    }

    function cloudSnapshot(o) {
      o = o || {};
      var range = o.range || 'today';
      var subjectKey = o.subject || 'all';
      var list = cloudEntries(subjectKey).map(function (e) {
        var score;
        if (subjectKey && subjectKey !== 'all') {
          var sub = (e.subjectPoints || {})[subjectKey] || 0;
          score = Math.round(sub * (range === 'total' ? 1 : range === 'week' ? 0.75 : 0.35));
        } else {
          score = (e.points && e.points[range]) || 0;
        }
        return Object.assign({}, e, { score: score });
      });
      list.sort(function (a, b) { return b.score - a.score || String(a.name).localeCompare(String(b.name), 'zh'); });
      list.forEach(function (e, idx) {
        e.rank = idx + 1;
        var key = range + ':' + subjectKey + ':' + e.id;
        e.prevRank = prevRanks[key] !== undefined ? prevRanks[key] : e.rank;
        e.delta = e.prevRank - e.rank;
        prevRanks[key] = e.rank;
      });
      return { entries: list, events: cloudEventsForFeed(), range: range, subject: subjectKey, tick: Date.now(), at: Date.now() };
    }

    function enterCloud(info) {
      if (mode === 'cloud') return;
      local.stop();
      cloud.participants[identity.id] = Object.assign({}, cloudSelfSnapshot(), { _tt: (local.me.points || {}).total || 0, demo: false });
      setMode('cloud', info);
      publishSelf();
      openCloudStream();
      cloudPollOnce();
      if (cloud.watch) clearInterval(cloud.watch);
      cloud.watch = setInterval(ensureTransport, 4000);
      setTimeout(ensureTransport, 3500);
      listeners.forEach(function (fn) { try { fn(facade.snapshot()); } catch (e) {} });
    }

    function probeCloud() {
      return withTimeout(
        fetch(CLOUD.base + '/' + CLOUD.topic + '/json?since=1m&poll=1', { cache: 'no-store' }).then(function (r) { return r.ok; }),
        3500
      );
    }

    /* ---------- 对外的统一接口 ---------- */
    var facade = {
      mode: 'local',
      cloudTopic: CLOUD.topic,
      get online() {
        if (mode === 'remote') return payload ? payload.online : 0;
        if (mode === 'cloud') return cloudEntries('all').filter(function (e) { return e.online && !e.demo; }).length;
        return local.snapshot({ range: 'today' }).entries.length;
      },
      get connected() { return mode !== 'local'; },

      snapshot: function (o) {
        o = o || {};
        if (mode === 'remote') {
          var list = computeEntries(o.range, o.subject);
          list.sort(function (a, b) { return b.score - a.score || String(a.name).localeCompare(String(b.name), 'zh'); });
          list.forEach(function (e, idx) {
            e.rank = idx + 1;
            var key = (o.range || 'today') + ':' + (o.subject || 'all') + ':' + e.id;
            e.prevRank = prevRanks[key] !== undefined ? prevRanks[key] : e.rank;
            e.delta = e.prevRank - e.rank;
            prevRanks[key] = e.rank;
          });
          return {
            entries: list,
            events: (payload && payload.events) || [],
            range: o.range || 'today',
            subject: o.subject || 'all',
            tick: payload ? payload.at : Date.now(),
            at: payload ? payload.at : Date.now()
          };
        }
        if (mode === 'cloud') return cloudSnapshot(o);
        return local.snapshot(o);
      },

      subscribe: function (fn) {
        listeners.push(fn);
        var offLocal = local.subscribe(fn);
        return function () {
          listeners = listeners.filter(function (f) { return f !== fn; });
          offLocal();
        };
      },

      onModeChange: function (fn) { modeListeners.push(fn); },

      start: function (interval) { local.start(interval || 2000); probe(); },
      stop: function () {
        local.stop();
        if (remote) {
          if (remote.stream) { try { remote.stream.close(); } catch (e) {} }
          if (remote.poll) clearInterval(remote.poll);
        }
        if (cloud.stream) { try { cloud.stream.close(); } catch (e) {} }
        stopCloudPoll();
        if (cloud.watch) { clearInterval(cloud.watch); cloud.watch = null; }
      },

      addMine: function (gain, subjectKey, label) {
        var got = local.addMine(gain, subjectKey, label);
        if (opts.onAward) opts.onAward(got, subjectKey);
        if (mode === 'cloud') publishSelf({ gain: got, subject: subjectKey });
        return got;
      },

      addMineAnswer: function (correct, subjectKey, bonus) {
        subjectKey = subjectKey || 'math';
        if (mode === 'remote' && account) {
          post('/api/answer', {
            participantId: account.participantId,
            token: account.token,
            correct: !!correct,
            subject: subjectKey,
            bonus: bonus || 0
          }).then(function (res) {
            if (!res || !res.ok) return;
            if (res.me) {
              remote.me.points = res.me.points;
              remote.me.subjectPoints = res.me.subjectPoints || remote.me.subjectPoints;
              remote.me.streak = res.me.streak;
              remote.me.correct = res.me.correct;
              remote.me.total = res.me.answered;
            }
            if (opts.onAward) opts.onAward(res.gain || 0, subjectKey);
            fetchSnapshot();
          }).catch(function () {});
          return 0;
        }
        var gain = local.addMineAnswer(correct, subjectKey, bonus);
        if (opts.onAward) opts.onAward(gain, subjectKey);
        if (mode === 'cloud') publishSelf({ gain: gain, subject: subjectKey });
        return gain;
      },

      updateProfile: function (profile) {
        identity.name = profile.name || identity.name;
        identity.emoji = profile.emoji || identity.emoji;
        identity.klass = profile.klass || identity.klass;
        if (profile.school !== undefined) identity.school = profile.school || '';
        if (profile.gradeKey !== undefined) identity.gradeKey = profile.gradeKey || '';
        if (profile.gradeLabel !== undefined) identity.gradeLabel = profile.gradeLabel || '';
        writeStore(IDENTITY_KEY, identity);
        if (mode === 'remote' && account) {
          return post('/api/profile', {
            participantId: account.participantId,
            token: account.token,
            name: identity.name,
            emoji: identity.emoji,
            klass: identity.klass,
            school: identity.school,
            gradeKey: identity.gradeKey,
            gradeLabel: identity.gradeLabel
          }).then(function (res) {
            if (res && res.ok && res.me) {
              remote.me.name = res.me.name;
              remote.me.emoji = res.me.emoji;
              remote.me.klass = res.me.klass;
            }
            return !!(res && res.ok);
          });
        }
        if (mode === 'cloud') { publishSelf(); return Promise.resolve(true); }
        return Promise.resolve(false);
      },

      toJSON: function () { return { mode: mode, account: account, identity: identity }; },
      load: function (state) {
        if (!state) return;
        if (state.account) account = state.account;
        if (state.identity && state.identity.id) {
          identity = state.identity;
          local.me.id = identity.id;
        }
      },

      /* ---------- 学生提问 / 老师回复（云端中继；本机模式由 app.js 自己保存） ---------- */
      takeAsks: function () { var out = farAsks.slice(); farAsks = []; return out; },
      /** 登录完成后再开始向云端发布自己的成绩（未登录不发布） */
      setReady: function (v) {
        cloud.ready = !!v;
        if (cloud.ready && mode === 'cloud') publishSelf();
        return cloud.ready;
      },
      takeClasses: function () { var out = farClasses.slice(); farClasses = []; return out; },
      publishClass: function (payload) {
        if (mode !== 'cloud') return false;
        fetch(CLOUD.base + '/' + CLOUD.topic, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          cache: 'no-store',
          body: JSON.stringify(Object.assign({ v: 1, kind: 'class' }, payload))
        }).catch(function () {});
        return true;
      },
      publishQuestion: function (payload) {
        if (mode !== 'cloud') return false;
        fetch(CLOUD.base + '/' + CLOUD.topic, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          cache: 'no-store',
          body: JSON.stringify(Object.assign({ v: 1, kind: 'ask' }, payload))
        }).catch(function () {});
        return true;
      },
      publishReply: function (payload) {
        if (mode !== 'cloud') return false;
        fetch(CLOUD.base + '/' + CLOUD.topic, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          cache: 'no-store',
          body: JSON.stringify(Object.assign({ v: 1, kind: 'reply' }, payload))
        }).catch(function () {});
        return true;
      }
    };

    Object.defineProperty(facade, 'me', {
      get: function () { return mode === 'remote' && remote ? remote.me : local.me; }
    });
    Object.defineProperty(facade, 'peers', {
      get: function () {
        if (mode === 'remote' && payload) {
          return payload.entries.filter(function (e) { return e.id !== account.participantId; }).map(mapEntry);
        }
        if (mode === 'cloud') {
          return cloudEntries('all').filter(function (e) { return e.id !== identity.id; });
        }
        return local.peers;
      }
    });

    /* ---------- 探测顺序：同源后端 → 公网中继 → 本机模拟 ---------- */
    function probe() {
      var health;
      try {
        health = withTimeout(fetch('/api/health', { cache: 'no-store' }).then(function (r) {
          return r.ok ? r.json() : null;
        }), 2500);
      } catch (e) { health = Promise.resolve(null); }

      health.then(function (h) {
        if (!h || !h.ok) throw new Error('no-backend');
        var isNew = !account || !account.participantId;
        var body = {
          participantId: account && account.participantId,
          token: account && account.token,
          name: identity.name,
          emoji: identity.emoji,
          klass: identity.klass,
          school: identity.school,
          gradeKey: identity.gradeKey,
          gradeLabel: identity.gradeLabel
        };
        if (isNew) body.seed = { points: opts.me.points, subjectPoints: opts.me.subjectPoints, streak: opts.me.streak };
        return post('/api/join', body).then(function (res) {
          if (!res || !res.ok) throw new Error('join-failed');
          account = { participantId: res.participantId, token: res.token };
          writeStore(ACCOUNT_KEY, account);
          remote = createRemote();
          local.stop();
          setMode('remote', h);
          if (res.me) {
            remote.me.points = res.me.points;
            remote.me.subjectPoints = res.me.subjectPoints || {};
            remote.me.streak = res.me.streak || 0;
            remote.me.correct = res.me.correct || 0;
            remote.me.total = res.me.answered || 0;
            remote.me.name = res.me.name;
            remote.me.emoji = res.me.emoji;
            remote.me.klass = res.me.klass;
          }
          openStream();
          fetchSnapshot();
        });
      }).catch(function () {
        return probeCloud().then(function (ok) {
          if (ok) { enterCloud({ topic: CLOUD.topic }); return; }
          throw new Error('no-cloud');
        });
      }).catch(function () {
        setMode('local', null);
      });
    }

    facade.probe = probe;
    if (typeof opts.onModeChange === 'function') modeListeners.push(opts.onModeChange);
    return facade;
  }

  window.PKApi = {
    createAdaptive: createAdaptive,
    CLOUD: CLOUD,
    identity: function () { return readStore(IDENTITY_KEY); },
    account: readStore(ACCOUNT_KEY),
    clearAccount: function () { try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) {} }
  };
})();
