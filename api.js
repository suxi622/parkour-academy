/*!
 * 汤姆猫跑酷学堂 · 数据源选择层
 * ---------------------------------------------------------------------------
 *  对外只暴露 window.PKApi.createAdaptive(opts)，与旧版接口完全兼容：
 *
 *   配置了后端（config.js 填了 Supabase）→ 真实云端榜单 + 班级 + 提问
 *   没配置后端                        → 自动退回 api-offline.js（本机模拟 / 公网中继）
 *
 *  这样既能上线真实后端，离线打开也能继续演示。
 */
(function () {
  'use strict';

  /* ==========================================================================
   * 一、云端模式（Supabase）
   * ========================================================================== */
  function createBackendFacade(opts) {
    opts = opts || {};
    var BE = window.PKBackend;
    var session = BE.session();
    var myId = (session && session.user.id) || 'me';

    var listeners = [];
    var modeListeners = [];
    var rows = [];              // 云端榜单原始行
    var events = [];            // 最近答题动态
    var tickCount = 0;
    var prevRanks = {};
    var lastFetchAt = 0;
    var fetching = false;
    var queuedClasses = [];
    var queuedAsks = [];

    var me = {
      id: myId,
      name: opts.me && opts.me.name || '同学',
      emoji: opts.me && opts.me.emoji || '🐱',
      klass: opts.me && opts.me.klass || '',
      school: opts.me && opts.me.school || '',
      gradeKey: opts.me && opts.me.gradeKey || '',
      gradeLabel: opts.me && opts.me.gradeLabel || '',
      isMe: true,
      focus: 'math',
      level: 1,
      points: { today: 0, week: 0, total: 0 },
      subjectPoints: {},
      subjectToday: {},
      subjectWeek: {},
      correct: 0,
      total: 0,
      streak: 0
    };
    if (opts.me && opts.me.points) me.points = Object.assign({}, me.points, opts.me.points);

    function myRow() {
      return rows.filter(function (r) { return r.id === myId; })[0] || null;
    }

    function syncMeFromRow() {
      var r = myRow();
      if (!r) return;
      me.name = r.name || me.name;
      me.emoji = r.emoji || me.emoji;
      me.klass = r.klass || me.klass;
      me.school = r.school || me.school;
      me.gradeKey = r.gradeKey || me.gradeKey;
      me.gradeLabel = r.gradeLabel || me.gradeLabel;
      me.points = Object.assign({}, r.points);
      me.subjectPoints = Object.assign({}, r.subjectPoints);
      me.subjectToday = Object.assign({}, r.subjectToday);
      me.subjectWeek = Object.assign({}, r.subjectWeek);
      me.correct = r.correct;
      me.total = r.total;
      me.streak = r.streak;
    }

    function emit() {
      tickCount++;
      var snap = snapshot();
      listeners.forEach(function (fn) { try { fn(snap); } catch (e) {} });
    }

    function pointsFor(row, subjectKey) {
      if (!subjectKey || subjectKey === 'all') {
        return { today: row.points.today, week: row.points.week, total: row.points.total };
      }
      var sp = row.subjectPoints || {}, st = row.subjectToday || {}, sw = row.subjectWeek || {};
      return { today: st[subjectKey] || 0, week: sw[subjectKey] || 0, total: sp[subjectKey] || 0 };
    }

    function toEntry(row, subjectKey) {
      return {
        id: row.id,
        name: row.name,
        emoji: row.emoji,
        klass: row.klass,
        school: row.school,
        gradeKey: row.gradeKey,
        gradeLabel: row.gradeLabel,
        isMe: row.id === myId,
        focus: 'math',
        level: 1,
        points: pointsFor(row, subjectKey),
        streak: row.streak || 0,
        correct: row.correct || 0,
        total: row.total || 0,
        at: row.at
      };
    }

    function snapshot(o) {
      o = o || {};
      var range = o.range || 'today';
      var subjectKey = o.subject || 'all';
      var list = rows.map(function (r) {
        var e = toEntry(r, subjectKey);
        e.score = e.points[range] || 0;
        return e;
      });
      if (!list.some(function (e) { return e.isMe; })) {
        var mine = toEntry(me, subjectKey);
        mine.score = mine.points[range] || 0;
        list.push(mine);
      }
      list.sort(function (a, b) { return b.score - a.score || String(a.name).localeCompare(String(b.name), 'zh'); });
      list.forEach(function (e, idx) {
        e.rank = idx + 1;
        var key = range + ':' + subjectKey + ':' + e.id;
        e.prevRank = prevRanks[key] !== undefined ? prevRanks[key] : e.rank;
        e.delta = e.prevRank - e.rank;
        prevRanks[key] = e.rank;
      });
      return {
        entries: list,
        events: events.slice(0, 12),
        range: range,
        subject: subjectKey,
        tick: tickCount,
        at: Date.now()
      };
    }

    function refresh() {
      if (fetching || !BE.session()) return Promise.resolve();
      fetching = true;
      lastFetchAt = Date.now();
      return Promise.all([BE.leaderboard(300), BE.recentEvents(60)]).then(function (res) {
        if (res[0] && res[0].ok) rows = res[0].rows || [];
        if (res[1] && res[1].ok) {
          events = (res[1].events || []).map(function (e) {
            return {
              id: e.id,
              name: e.name,
              emoji: e.emoji,
              subject: subjectLabel(e.subject),
              label: e.correct ? '答对题目' : '答错了',
              gain: e.gain,
              isMe: e.isMe,
              at: e.at
            };
          });
        }
        syncMeFromRow();
        fetching = false;
        emit();
      }, function () { fetching = false; });
    }

    var SUBJECT_NAMES = {};
    try {
      (window.PK.SUBJECTS || []).forEach(function (s) { SUBJECT_NAMES[s.key] = s.name; });
    } catch (e) {}
    function subjectLabel(key) {
      return SUBJECT_NAMES[key] || '知识闯关';
    }

    function scheduleRefresh(delay) {
      setTimeout(refresh, delay || 1200);
    }

    /* 乐观更新：本机立刻显示得分，不等服务器回程 */
    function bumpMine(subjectKey, gain, correct) {
      me.points.today += gain;
      me.points.week += gain;
      me.points.total += gain;
      if (correct) {
        me.subjectPoints[subjectKey] = (me.subjectPoints[subjectKey] || 0) + gain;
        me.subjectToday[subjectKey] = (me.subjectToday[subjectKey] || 0) + gain;
        me.subjectWeek[subjectKey] = (me.subjectWeek[subjectKey] || 0) + gain;
      }
      if (correct) me.streak += 1; else me.streak = 0;
      me.total += 1;
      if (correct) me.correct += 1;
    }

    var facade = {
      me: me,
      snapshot: snapshot,
      subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      onModeChange: function (fn) { modeListeners.push(fn); },

      start: function (interval) {
        refresh();
        if (facade._timer) clearInterval(facade._timer);
        facade._timer = setInterval(function () {
          // 标签页在后台时降频，省流量也省电量
          var gap = document.hidden ? 60000 : (interval || 8000);
          if (Date.now() - lastFetchAt >= gap) refresh();
        }, 5000);
        return facade;
      },
      stop: function () {
        if (facade._timer) { clearInterval(facade._timer); facade._timer = null; }
      },
      refresh: refresh,

      /** 记录一次答题（questionId 用于自动维护云端错题本） */
      addMineAnswer: function (correct, subjectKey, bonus, questionId) {
        subjectKey = subjectKey || 'math';
        if (correct) {
          // 注意：单题得分上限 80，和数据库里的服务端定分规则保持一致
          var gain = Math.min(80, 12 + Math.min(me.streak, 10) * 2 + Math.max(0, Math.min(50, Number(bonus) || 0)));
          bumpMine(subjectKey, gain, true);
          emit();
          BE.recordAnswer({ questionId: questionId, subject: subjectKey, correct: true, points: gain, source: 'game' })
            .then(function () { scheduleRefresh(1500); });
          return gain;
        }
        bumpMine(subjectKey, 0, false);
        emit();
        BE.recordAnswer({ questionId: questionId, subject: subjectKey, correct: false, points: 0, source: 'game' })
          .then(function () { scheduleRefresh(1500); });
        return 0;
      },

      addMine: function (gain, subjectKey) {
        subjectKey = subjectKey || 'math';
        gain = Math.max(0, Number(gain) || 0);
        bumpMine(subjectKey, gain, true);
        emit();
        BE.recordAnswer({ subject: subjectKey, correct: true, points: gain, source: 'game' })
          .then(function () { scheduleRefresh(1500); });
        return gain;
      },

      updateProfile: function (profile) {
        if (profile.name) me.name = profile.name;
        if (profile.emoji) me.emoji = profile.emoji;
        if (profile.klass) me.klass = profile.klass;
        if (profile.school !== undefined) me.school = profile.school;
        if (profile.gradeKey !== undefined) me.gradeKey = profile.gradeKey;
        if (profile.gradeLabel !== undefined) me.gradeLabel = profile.gradeLabel;
        emit();
        return BE.updateProfileFields({
          display_name: me.name, emoji: me.emoji, school: me.school,
          grade_key: me.gradeKey, grade_label: me.gradeLabel
        }).then(function (r) {
          scheduleRefresh(600);
          return !!(r && r.ok);
        });
      },

      toJSON: function () { return { mode: 'backend', me: { points: me.points, streak: me.streak, correct: me.correct, total: me.total } }; },
      load: function () { /* 云端的分数以数据库为准，不需要从 localStorage 恢复 */ },

      /* 班级 / 提问：云端模式下由 app.js 直接调用 PKBackend，这里保留接口兼容旧代码 */
      takeAsks: function () { var out = queuedAsks.slice(); queuedAsks = []; return out; },
      takeClasses: function () { var out = queuedClasses.slice(); queuedClasses = []; return out; },
      setReady: function () { return true; },
      refreshCloud: function () { refresh(); return Promise.resolve(true); },
      publishClass: function () { return false; },     // 班级已经在数据库里，无需再广播
      publishQuestion: function (payload) {
        return BE.createAsk({
          text: payload.text || payload.qt || '',
          image: payload.image || payload.qimg || '',
          classList: myClassIds()
        }).then(function (r) {
          if (r.ok) { scheduleRefresh(300); return true; }
          return false;
        });
      },
      publishReply: function (payload) {
        return BE.replyAsk(payload.qid, payload.text || '').then(function (r) {
          scheduleRefresh(300);
          return !!r.ok;
        });
      },

      get online() {
        var now = Date.now();
        return rows.filter(function (r) { return r.id !== myId && now - (r.at || 0) < 5 * 60 * 1000; }).length;
      },
      get peers() {
        return rows.filter(function (r) { return r.id !== myId; })
          .map(function (r) { return toEntry(r, 'all'); });
      },
      get mode() { return 'backend'; }
    };

    /** 学生当前加入的班级（提问会挂到班级上，老师端才看得到） */
    function myClassIds() {
      try {
        var st = window.PKApp && window.PKApp.state;
        return ((st && st.joinedClassIds) || []).slice();
      } catch (e) { return []; }
    }

    facade.start(opts.interval);
    return facade;
  }

  /* ==========================================================================
   * 二、对外入口：有后端走后端，没后端走离线
   * ========================================================================== */
  function createAdaptive(opts) {
    opts = opts || {};
    if (window.PKBackend && window.PKBackend.configured && window.PKBackend.session()) {
      try {
        return createBackendFacade(opts);
      } catch (e) {
        /* 云端初始化失败时退回离线，保证页面还能用 */
      }
    }
    if (window.PKApiOffline && window.PKApiOffline.createAdaptive) {
      return window.PKApiOffline.createAdaptive(opts);
    }
    throw new Error('没有可用的数据源：既没有配置后端，也没有离线数据层');
  }

  window.PKApi = {
    createAdaptive: createAdaptive,
    CLOUD: (window.PKApiOffline && window.PKApiOffline.CLOUD) || null,
    identity: function () { return null; },
    account: null,
    clearAccount: function () {}
  };
})();
