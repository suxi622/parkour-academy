/*!
 * 汤姆猫跑酷学堂 · 跑酷闯关引擎（精致版 v2）
 *
 * 玩法：三跑道跑酷 → 撞到建筑才会弹出题目 → 答对爆金币（题目越难金币越多）
 *       躲开建筑（换道 / 跳跃）不会触发题目 → 冲过终点结算。
 * 场景：每个学科一套独立的皮肤（天空 / 路面 / 护栏 / 远景 / 装饰）。
 */
(function () {
  'use strict';
  var PK = window.PK;

  var CFG = {
    FAR: 1500,
    BASE_SPEED: 330,
    MAX_SPEED: 880,
    MIN_SPEED: 190,
    SPEED_UP: 58,
    SPEED_DOWN: 95,
    LANES: [-1, 0, 1],
    MAX_LIVES: 3,
    CORRECT_SCORE: 120,
    WRONG_SCORE: -30,
    FINISH_PAD: 1300
  };

  var COIN_BY_DIFF = { basic: 10, consolidated: 20, final: 30 };
  function coinBase(q) { return COIN_BY_DIFF[q && q.difficulty] || 12; }

  /* ============================================================
   * 每个学科一套场景皮肤
   *   sky    天空渐变      road   路面渐变
   *   line   车道线颜色     rail   护栏颜色
   *   accent 主题色         wall   建筑主色 / wallDark 建筑暗部
   *   scenery 远景类型       deco   飘浮装饰
   * ============================================================ */
  var THEMES = {
    math: {
      sky: ['#04091a', '#10224a', '#1b3f74'], road: ['#24395f', '#080f1f'],
      line: 'rgba(124,200,255,', rail: ['#9fd8ff', 'rgba(43,140,238,0.22)'],
      accent: '#5cc8ff', wall: '#2b4b86', wallDark: '#16294d',
      fog: 'rgba(120,180,255,0.16)', scenery: 'city', deco: ['➗', '✖️', '📐', '🔢', '➕']
    },
    chinese: {
      sky: ['#f7efdd', '#efdcbb', '#dcc39a'], road: ['#5b4a35', '#2a2014'],
      line: 'rgba(255,236,190,', rail: ['#e8c896', 'rgba(150,110,60,0.2)'],
      accent: '#c2410c', wall: '#b8442a', wallDark: '#7c2d12',
      fog: 'rgba(255,240,210,0.35)', scenery: 'ink', deco: ['🖌️', '📜', '🎋', '🀄', '🍃']
    },
    english: {
      sky: ['#0b1a3f', '#123a72', '#1b62ac'], road: ['#1f3760', '#0a1730'],
      line: 'rgba(255,214,102,', rail: ['#ffe08a', 'rgba(200,150,40,0.22)'],
      accent: '#fbbf24', wall: '#2f5fa8', wallDark: '#153059',
      fog: 'rgba(255,225,150,0.18)', scenery: 'blocks', deco: ['🔤', '🅰️', '📚', '✏️', '💬']
    },
    physics: {
      sky: ['#04030d', '#1a1038', '#2c1a5c'], road: ['#2a1d4e', '#08060f'],
      line: 'rgba(196,132,252,', rail: ['#dcb6fe', 'rgba(140,80,220,0.22)'],
      accent: '#c084fc', wall: '#4c2b8a', wallDark: '#291552',
      fog: 'rgba(190,140,255,0.2)', scenery: 'space', deco: ['🪐', '⚛️', '🔭', '🧲', '✨']
    },
    chemistry: {
      sky: ['#02130d', '#0a2c20', '#0f4433'], road: ['#123a2c', '#03130e'],
      line: 'rgba(110,231,183,', rail: ['#7ef0c0', 'rgba(20,160,110,0.22)'],
      accent: '#34d399', wall: '#166b4d', wallDark: '#083526',
      fog: 'rgba(110,231,183,0.18)', scenery: 'lab', deco: ['⚗️', '🧪', '💧', '🔬', '🫧']
    },
    biology: {
      sky: ['#03120a', '#0d3118', '#164c21'], road: ['#143a21', '#04140a'],
      line: 'rgba(134,239,172,', rail: ['#a7f3c0', 'rgba(40,160,80,0.22)'],
      accent: '#4ade80', wall: '#1f7a3c', wallDark: '#0c3d1e',
      fog: 'rgba(134,239,172,0.18)', scenery: 'forest', deco: ['🌿', '🍃', '🐛', '🧬', '🌱']
    },
    politics: {
      sky: ['#f7f1e6', '#ebdcc4', '#cdb894'], road: ['#5a5142', '#292318'],
      line: 'rgba(255,242,206,', rail: ['#f0d6a4', 'rgba(160,120,60,0.2)'],
      accent: '#b45309', wall: '#a8622a', wallDark: '#6b3d13',
      fog: 'rgba(255,246,225,0.4)', scenery: 'dome', deco: ['⚖️', '📜', '🏛️', '📖', '🕊️']
    },
    history: {
      sky: ['#120e08', '#2b2010', '#462f14'], road: ['#3c2c18', '#140d05'],
      line: 'rgba(253,224,71,', rail: ['#fde68a', 'rgba(180,120,30,0.22)'],
      accent: '#fbbf24', wall: '#8a5a24', wallDark: '#4a2e0f',
      fog: 'rgba(255,220,140,0.16)', scenery: 'ancient', deco: ['🏮', '🏯', '📜', '🗿', '🧧']
    },
    geography: {
      sky: ['#01101a', '#062b40', '#08506b'], road: ['#0d4155', '#02121a'],
      line: 'rgba(103,232,249,', rail: ['#a5f3fc', 'rgba(14,116,144,0.22)'],
      accent: '#22d3ee', wall: '#0e6b86', wallDark: '#053444',
      fog: 'rgba(103,232,249,0.18)', scenery: 'globe', deco: ['🌏', '☁️', '🧭', '⛰️', '🌊']
    }
  };
  function themeFor(key) { return THEMES[key] || THEMES.math; }

  function mount(container, opts) {
    opts = opts || {};
    var questions = PK.shuffle((opts.questions || []).slice(), opts.seed || 7);
    var subjectName = opts.subjectName || '数学';
    var difficultyName = opts.difficultyName || '基础关卡';
    var theme = themeFor(opts.subjectKey || (questions[0] && questions[0].subject) || 'math');
    var runner = opts.runner || 'partner-cat';          // 当前出战伙伴（在「我的家园」购买/装备）
    var partnerName = opts.partnerName || '伙伴';
    var partnerLevel = Math.max(1, Number(opts.partnerLevel) || 1);
    var coinBonusPct = Math.max(0, Number(opts.coinBonusPct) || 0);
    var scoreBonusPct = Math.max(0, Number(opts.scoreBonusPct) || 0);

    var state = {
      phase: 'ready',            // ready | countdown | playing | question | paused | finished
      distance: 0,
      speed: CFG.BASE_SPEED,
      lives: CFG.MAX_LIVES,
      gold: 0,
      score: 0,
      correct: 0,
      answered: 0,
      combo: 0,
      bestCombo: 0,
      wrongIds: [],
      objects: [],
      particles: [],
      floats: [],
      lane: 1,
      laneVisual: 1,
      jumpY: 0,
      vy: 0,
      jumping: false,
      invuln: 0,
      hurtFlash: 0,
      goodFlash: 0,
      shake: 0,
      lastSpawnAt: 0,
      spawned: 0,
      resolved: 0,
      dodged: 0,
      planned: questions.length,
      questionPool: questions.slice(),
      activeQuestion: null,
      activeObject: null,
      finish: null,
      elapsed: 0,
      result: null,
      lastCoin: 0
    };

    /* ---------------- DOM ---------------- */
    container.innerHTML =
      '<div class="game-shell">' +
        '<canvas class="game-canvas"></canvas>' +
        '<div class="game-topbar">' +
          '<button id="gPause" title="暂停 / 继续">⏸</button>' +
          '<button id="gFull" title="全屏">⛶</button>' +
        '</div>' +
        '<div class="game-hud">' +
          '<div class="hud-row">' +
            '<div class="hud-chip"><span class="hearts" id="gLives">❤️❤️❤️</span></div>' +
            '<div class="hud-chip" id="gSubject">' + esc(subjectName) + ' · ' + esc(difficultyName) + '</div>' +
            '<div class="hud-chip">🏆 <span id="gScore">0</span></div>' +
            '<div class="hud-chip gold">🪙 <span id="gGold">0</span></div>' +
          '</div>' +
          '<div class="hud-bar"><i id="gBar"></i><span id="gBarText">0 / ' + state.planned + ' 座建筑</span></div>' +
          '<div class="hud-row" style="align-items:flex-end">' +
            '<div class="hud-chip">速度 <span id="gSpeed">1.0</span>x</div>' +
            '<div class="hud-chip">连击 <span id="gCombo">0</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="combo-badge" id="gComboBadge"></div>' +
        '<div id="gOverlay"></div>' +
      '</div>';

    var shell = container.querySelector('.game-shell');
    var canvas = container.querySelector('canvas');
    var ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      // 极少数环境没有 Canvas（或被策略禁用），给出提示而不是直接崩掉
      container.innerHTML = '<div class="empty"><span class="em">🖼️</span>当前浏览器不支持 Canvas 画布，无法运行跑酷关卡。<br>请换用 Chrome / Edge / Safari 最新版打开。</div>';
      return { destroy: function () {}, state: { phase: 'unsupported' } };
    }
    var overlay = container.querySelector('#gOverlay');
    var comboEl = container.querySelector('#gComboBadge');
    var hudLives = container.querySelector('#gLives');
    var hudScore = container.querySelector('#gScore');
    var hudGold = container.querySelector('#gGold');
    var hudSpeed = container.querySelector('#gSpeed');
    var hudCombo = container.querySelector('#gCombo');
    var hudBar = container.querySelector('#gBar');
    var hudBarText = container.querySelector('#gBarText');
    var pauseBtn = container.querySelector('#gPause');
    var fullBtn = container.querySelector('#gFull');

    var W = 900, H = 560, DPR = 1;
    var stars = [];

    function resize() {
      var rect = shell.getBoundingClientRect();
      var cssW = Math.max(320, rect.width || 900);
      var cssH = Math.round(cssW * 0.62);
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * DPR);
      canvas.height = Math.round(cssH * DPR);
      canvas.style.height = cssH + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      W = cssW; H = cssH;
      stars = [];
      for (var i = 0; i < 64; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * 0.4, r: Math.random() * 1.5 + 0.35, s: 0.5 + Math.random() });
      }
    }

    /* ---------------- 投影：lane 0/1/2 → -1/0/1 ---------------- */
    function project(z, lane) {
      var laneOff = (lane === undefined || lane === null ? 1 : lane) - 1;
      var t = Math.max(0, Math.min(1, z / CFG.FAR));
      var e = t * t * 0.6 + t * 0.4;
      var y = lerp(H * 0.9, H * 0.35, e);
      var scale = lerp(1, 0.16, e);
      var x = W / 2 + laneOff * (W * 0.34) * scale;
      return { x: x, y: y, scale: scale, t: t };
    }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function roundRect(x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    /* ============================================================
     * 生成
     * ============================================================ */
    function pickFreeLane() {
      var busy = [];
      state.objects.forEach(function (o) {
        if (o.kind === 'building' && !o.destroyed && o.z > CFG.FAR - 320) busy.push(o.lane);
      });
      var free = [0, 1, 2].filter(function (l) { return busy.indexOf(l) === -1; });
      var pool = free.length ? free : [0, 1, 2];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function spawnBuilding() {
      if (state.spawned >= state.planned) return;
      var q = state.questionPool.shift();
      if (!q) return;
      state.objects.push({
        kind: 'building',
        z: CFG.FAR,
        lane: pickFreeLane(),
        q: q,
        boss: state.spawned === state.planned - 1,
        seed: Math.random() * 6,
        destroyed: false,
        passed: false,
        resolved: false,
        flash: 0
      });
      state.spawned++;
    }

    function maybeSpawn() {
      if (state.spawned >= state.planned) return;
      var gap = 560 + Math.random() * 260 - Math.min(150, state.speed * 0.16);
      if (state.distance - state.lastSpawnAt < gap) return;
      state.lastSpawnAt = state.distance;
      spawnBuilding();
    }

    function checkFinish() {
      if (state.finish) return;
      if (state.resolved >= state.planned && state.spawned >= state.planned) {
        state.finish = { z: CFG.FAR + CFG.FINISH_PAD };
      }
    }

    /* ---------------- 粒子 / 飘字 ---------------- */
    function burst(x, y, color, n, spread) {
      for (var i = 0; i < n; i++) {
        var ang = Math.random() * Math.PI * 2;
        var sp = (spread || 150) * (0.35 + Math.random());
        state.particles.push({
          x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 70,
          life: 0.7 + Math.random() * 0.5, age: 0, color: color, size: 2 + Math.random() * 4
        });
      }
    }

    /** 答对：从建筑里爆出金币 */
    function coinBurst(x, y, amount) {
      var n = Math.max(8, Math.min(30, Math.round(amount * 0.8)));
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI * (0.15 + Math.random() * 0.7);
        var sp = 180 + Math.random() * 240;
        state.particles.push({
          x: x, y: y, vx: Math.cos(ang) * sp * (Math.random() < 0.5 ? -1 : 1),
          vy: Math.sin(ang) * sp - 120, life: 0.9 + Math.random() * 0.6, age: 0,
          color: '#ffd75e', size: 5 + Math.random() * 4, coin: true, spin: Math.random() * 6
        });
      }
      state.floats.push({ x: x, y: y - 10, text: '+' + amount + ' 🪙', color: '#ffe08a', age: 0, life: 1.3, size: 26 });
      state.floats.push({ x: x, y: y + 18, text: '答对啦！', color: '#7ef0c0', age: 0, life: 1.1, size: 18 });
    }

    function dust(x, y) {
      state.particles.push({
        x: x, y: y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60,
        life: 0.45, age: 0, color: 'rgba(255,255,255,0.5)', size: 2 + Math.random() * 3
      });
    }

    /* ============================================================
     * 更新
     * ============================================================ */
    function update(dt) {
      state.elapsed += dt;
      if (state.invuln > 0) state.invuln -= dt;
      if (state.hurtFlash > 0) state.hurtFlash -= dt;
      if (state.goodFlash > 0) state.goodFlash -= dt;
      if (state.shake > 0) state.shake -= dt;

      // 粒子 / 飘字即便在答题时也要继续演算，金币才会自然落下
      stepParticles(dt);

      if (state.phase !== 'playing') return;

      state.distance += state.speed * dt;
      if (state.speed < CFG.MAX_SPEED) state.speed = Math.min(CFG.MAX_SPEED, state.speed + 6 * dt);
      state.laneVisual += (state.lane - state.laneVisual) * Math.min(1, dt * 12);

      if (state.jumping) {
        state.vy += 2100 * dt;
        state.jumpY += state.vy * dt;
        if (state.jumpY >= 0) { state.jumpY = 0; state.vy = 0; state.jumping = false; }
      }

      maybeSpawn();

      var i, o;
      for (i = state.objects.length - 1; i >= 0; i--) {
        o = state.objects[i];
        o.z -= state.speed * dt;
        if (o.flash > 0) o.flash -= dt;

        // 撞到建筑 → 弹题
        if (o.kind === 'building' && !o.destroyed && !o.passed && !o.resolved && o.z <= 12 && o.z > -46) {
          if (o.lane === state.lane && !state.jumping) {
            askQuestion(o);
            return;
          }
        }
        // 躲过去了（换道或跳过去）
        if (o.kind === 'building' && !o.destroyed && !o.passed && !o.resolved && o.z <= -46) {
          o.passed = true;
          state.resolved++;
          state.dodged++;
          checkFinish();
        }
        if (o.z < -220) state.objects.splice(i, 1);
      }

      if (state.finish) {
        state.finish.z -= state.speed * dt;
        if (state.finish.z <= 6) { state.finish.z = 6; end(true); return; }
      }
    }

    function stepParticles(dt) {
      var j, p;
      for (j = state.particles.length - 1; j >= 0; j--) {
        p = state.particles[j];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.coin ? 620 : 520) * dt;
        if (p.coin) p.spin += dt * 10;
        if (p.age >= p.life) state.particles.splice(j, 1);
      }
      for (j = state.floats.length - 1; j >= 0; j--) {
        p = state.floats[j];
        p.age += dt;
        p.y -= 26 * dt;
        if (p.age >= p.life) state.floats.splice(j, 1);
      }
    }

    function hurt(reason) {
      if (state.invuln > 0) return;
      state.lives -= 1;
      state.combo = 0;
      state.invuln = 1.2;
      state.hurtFlash = 0.45;
      state.shake = 0.3;
      state.speed = Math.max(CFG.MIN_SPEED, state.speed - CFG.SPEED_DOWN);
      syncHud();
      if (opts.onEvent) opts.onEvent({ type: 'hurt', reason: reason, lives: state.lives });
      if (state.lives <= 0) end(false);
    }

    /* ============================================================
     * 答题（撞建筑才触发）
     * ============================================================ */
    function askQuestion(o) {
      state.phase = 'question';
      state.activeQuestion = o.q;
      state.activeObject = o;
      o.flash = 0.5;
      state.floats.push({ x: project(o.z, o.lane).x, y: project(o.z, o.lane).y - 40, text: '📚 遇到建筑！', color: '#fff', age: 0, life: 0.9, size: 18 });
      renderQuestion(o.q, o);
    }

    function questionTypeName(type) {
      return type === 'judge' ? '判断题' : type === 'fill' ? '填空题' : '单选题';
    }

    function rewardFor(q, o) {
      var base = coinBase(q);
      var comboBonus = Math.round(base * Math.min(state.combo, 10) * 0.05);
      var raw = (base + comboBonus) * (o && o.boss ? 3 : 1);
      return Math.round(raw * (1 + coinBonusPct / 100));   // 伙伴等级越高，金币越多
    }

    function renderQuestion(q, o) {
      var base = coinBase(q);
      var html = [];
      html.push('<div class="overlay" id="qOverlay"><div class="overlay-card q-card">');
      html.push('<div class="row between"><span class="q-type-chip">' + questionTypeName(q.type) + '</span>');
      html.push('<span class="q-reward">答对可得 <b>+' + (o && o.boss ? base * 3 : base) + '</b> 🪙</span></div>');
      html.push('<div class="q-content">' + esc(q.content) + '</div>');
      if (q.image) html.push('<img class="q-image" src="' + esc(q.image) + '" alt="题目配图">');
      if (q.link && q.link.url) {
        html.push('<a class="q-link" href="' + esc(q.link.url) + '" target="_blank" rel="noopener">🔗 ' + esc(q.link.title || '参考资料') + '</a>');
      }
      html.push('<div id="qBody">');
      if (q.type === 'fill') {
        html.push('<input class="fill-input" id="qFill" placeholder="在这里输入答案，回车提交" autocomplete="off" />');
      } else {
        (q.options || []).forEach(function (opt, idx) {
          html.push('<button class="opt" data-opt="' + idx + '"><span class="key">' + String.fromCharCode(65 + idx) + '</span><span>' + esc(opt) + '</span></button>');
        });
      }
      html.push('</div><div id="qFeed"></div>');
      html.push('<div class="row" style="margin-top:16px;gap:10px">');
      html.push('<button class="btn btn-primary grow" id="qSubmit">确认答案</button>');
      html.push('<button class="btn btn-ghost" id="qSkip">跳过</button>');
      html.push('</div>');
      html.push('<div class="center muted" style="font-size:12px;margin-top:10px">答对：建筑爆金币（越难越多）· 加速前进 &nbsp;|&nbsp; 答错：扣 1 点生命 · 躲开建筑则不会出题</div>');
      html.push('</div></div>');
      overlay.innerHTML = html.join('');

      var selected = null;
      var body = overlay.querySelector('#qBody');
      var feed = overlay.querySelector('#qFeed');
      var submit = overlay.querySelector('#qSubmit');
      var fill = overlay.querySelector('#qFill');
      var settled = false;

      if (q.type !== 'fill') {
        body.addEventListener('click', function (e) {
          var btn = e.target.closest('.opt');
          if (!btn || settled) return;
          selected = parseInt(btn.getAttribute('data-opt'), 10);
          Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
        });
      } else if (fill) {
        fill.focus();
        fill.addEventListener('keydown', function (e) { if (e.key === 'Enter') settle(); });
      }

      function settle() {
        if (settled) return;
        var payload = q.type === 'fill' ? (fill ? fill.value : '') : selected;
        if (q.type === 'fill' && !String(payload).trim()) { flashInput(fill); return; }
        if (q.type !== 'fill' && selected === null) { if (opts.onEvent) opts.onEvent({ type: 'notice', message: '请先选择一个答案' }); return; }

        settled = true;
        var res = PK.grade(q, payload);
        state.answered++;

        Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b, idx) {
          b.disabled = true;
          if (idx === res.expectedIndex) b.classList.add('correct');
          else if (idx === res.givenIndex) b.classList.add('wrong');
        });
        if (q.type === 'fill' && fill) {
          fill.disabled = true;
          fill.style.borderColor = res.correct ? '#28bd66' : '#ef524d';
        }

        var gain = res.correct ? rewardFor(q, o) : 0;
        feed.innerHTML =
          '<div class="verdict ' + (res.correct ? 'ok' : 'no') + '" style="margin-top:14px">' +
            (res.correct ? '✓ 回答正确！建筑爆出 ' + gain + ' 金币' : '✕ 回答错误') +
          '</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:6px">正确答案：<b style="color:#16202e">' + esc(res.expectedText) + '</b>' +
            (res.correct ? '' : '　你的答案：' + esc(res.givenText || '（空）')) +
          '</div>' +
          (q.analysis ? '<div class="analysis"><b>解析</b>　' + esc(q.analysis) + '</div>' : '');

        submit.textContent = '继续跑酷';
        submit.className = 'btn btn-accent grow';
        submit.onclick = finishQuestion;
        var skipBtn = overlay.querySelector('#qSkip');
        if (skipBtn) skipBtn.style.display = 'none';

        if (res.correct) {
          state.correct++;
          state.combo++;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          state.gold += gain;
          state.lastCoin = gain;
          state.score += Math.round((CFG.CORRECT_SCORE + state.combo * 10 + Math.round(gain * 2)) * (1 + scoreBonusPct / 100));
          state.speed = Math.min(CFG.MAX_SPEED, state.speed + CFG.SPEED_UP);
          state.goodFlash = 0.35;
          if (o) {
            o.destroyed = true;
            var p = project(o.z, o.lane);
            coinBurst(p.x, p.y - 30, gain);
            burst(p.x, p.y - 20, theme.accent, 16, 220);
            if (!o.resolved) { o.resolved = true; state.resolved++; checkFinish(); }
          }
          showCombo();
        } else {
          state.wrongIds.push(q.id);
          state.score = Math.max(0, state.score + CFG.WRONG_SCORE);
          if (o && !o.resolved) { o.resolved = true; state.resolved++; checkFinish(); }
          hurt('答错题目');
        }
        syncHud();
        if (opts.onAnswer) opts.onAnswer(res.correct, q, payload, res);
        if (state.phase === 'finished') return;
        setTimeout(function () { if (settled && state.phase === 'question') finishQuestion(); }, 2900);
      }

      function finishQuestion() {
        overlay.innerHTML = '';
        state.activeQuestion = null;
        state.activeObject = null;
        if (state.lives <= 0) return;
        if (state.finish && state.finish.z <= 60) { end(true); return; }
        state.phase = 'playing';
      }

      function flashInput(input) {
        if (!input) return;
        input.style.borderColor = '#ef524d';
        input.style.boxShadow = '0 0 0 4px rgba(239,82,77,.14)';
        input.focus();
        setTimeout(function () { input.style.boxShadow = ''; }, 900);
      }

      submit.onclick = settle;
      overlay.querySelector('#qSkip').onclick = function () {
        if (settled) return;
        settled = true;
        state.answered++;
        state.combo = 0;
        state.wrongIds.push(q.id);
        if (o && !o.resolved) { o.resolved = true; state.resolved++; checkFinish(); }
        hurt('跳过了题目');
        syncHud();
        if (opts.onAnswer) opts.onAnswer(false, q, '', { correct: false, expectedText: q.answer, givenText: '' });
        setTimeout(finishQuestion, 60);
      };

      // 键盘：1-4 选项，回车确认
      keyAnswer = function (e) {
        if (settled) return;
        if (q.type === 'fill' && e.key === 'Enter') { settle(); return; }
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= (q.options || []).length) {
          var btn2 = body.querySelector('.opt[data-opt="' + (n - 1) + '"]');
          if (btn2) { selected = n - 1; Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b) { b.classList.remove('selected'); }); btn2.classList.add('selected'); }
        }
      };
    }
    var keyAnswer = null;

    function showCombo() {
      if (state.combo < 2) return;
      comboEl.textContent = '连击 ×' + state.combo;
      comboEl.classList.remove('show');
      void comboEl.offsetWidth;
      comboEl.classList.add('show');
    }

    /* ============================================================
     * 绘制
     * ============================================================ */
    function draw() {
      ctx.save();
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake * 22, (Math.random() - 0.5) * state.shake * 22);
      }
      drawSky();
      drawScenery();
      drawSpeedLines();
      drawRoad();

      if (state.finish) drawFinish();

      var objs = state.objects.slice().sort(function (a, b) { return b.z - a.z; });
      objs.forEach(drawObject);

      drawPlayer();
      drawParticles();
      drawFloats();

      if (state.hurtFlash > 0) {
        ctx.fillStyle = 'rgba(239,82,77,' + (state.hurtFlash * 0.6) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (state.goodFlash > 0) {
        ctx.fillStyle = 'rgba(74,222,128,' + (state.goodFlash * 0.32) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    function drawSky() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.sky[0]);
      g.addColorStop(0.55, theme.sky[1]);
      g.addColorStop(1, theme.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 星空（亮色主题下弱一些）
      var light = isLightSky();
      stars.forEach(function (s) {
        ctx.globalAlpha = (light ? 0.16 : 0.3) + Math.abs(Math.sin(state.elapsed * s.s + s.x)) * (light ? 0.16 : 0.55);
        ctx.fillStyle = light ? 'rgba(120,90,50,1)' : '#ffffff';
        ctx.beginPath();
        ctx.arc(((s.x - state.distance * 0.02 * s.s) % W + W) % W, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      var glow = ctx.createRadialGradient(W / 2, H * 0.34, 0, W / 2, H * 0.34, W * 0.66);
      glow.addColorStop(0, theme.fog);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    function isLightSky() {
      var hex = theme.sky[0];
      var r = parseInt(hex.slice(1, 3), 16), g2 = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return (r * 299 + g2 * 587 + b * 114) / 1000 > 150;
    }

    /* ---------------- 每个学科不同的远景 ---------------- */
    function drawScenery() {
      var d = state.distance;
      switch (theme.scenery) {
        case 'city': drawCity(d); break;
        case 'ink': drawInk(d); break;
        case 'blocks': drawBlocks(d); break;
        case 'space': drawSpace(d); break;
        case 'lab': drawLab(d); break;
        case 'forest': drawForest(d); break;
        case 'dome': drawDome(d); break;
        case 'ancient': drawAncient(d); break;
        case 'globe': drawGlobe(d); break;
      }
      drawDeco(d);
    }

    function drawCity(d) {
      var baseY = H * 0.37;
      for (var layer = 0; layer < 2; layer++) {
        var step = 130 + layer * 70, off = (d * (0.05 + layer * 0.05)) % step;
        for (var x = -step - off; x < W + step; x += step) {
          var hh = 70 + layer * 46 + (Math.abs(Math.round(x / step)) % 4) * 22;
          ctx.fillStyle = layer === 0 ? 'rgba(120,180,255,0.10)' : 'rgba(6,12,26,0.34)';
          ctx.fillRect(x, baseY - hh, step * 0.66, hh);
          ctx.fillStyle = 'rgba(255,214,120,' + (layer === 0 ? 0.14 : 0.24) + ')';
          for (var wy = baseY - hh + 12; wy < baseY - 10; wy += 18) {
            for (var wx = x + 8; wx < x + step * 0.66 - 10; wx += 15) ctx.fillRect(wx, wy, 5, 8);
          }
        }
      }
    }

    function drawInk(d) {
      var baseY = H * 0.4;
      ctx.fillStyle = 'rgba(120,96,64,0.16)';
      ctx.beginPath();
      ctx.moveTo(-120, baseY + 30);
      for (var x = -120; x < W + 200; x += 190) {
        ctx.lineTo(x + 95, baseY - 62 - (Math.abs(Math.round(x / 190)) % 3) * 20);
        ctx.lineTo(x + 190, baseY + 30);
      }
      ctx.lineTo(W + 200, baseY + 90); ctx.lineTo(-120, baseY + 90); ctx.closePath(); ctx.fill();

      var off = (d * 0.08) % 150;
      ctx.strokeStyle = 'rgba(70,110,60,0.26)';
      ctx.lineWidth = 7;
      for (var bx = -150 - off; bx < W + 150; bx += 150) {
        ctx.beginPath(); ctx.moveTo(bx, baseY + 40); ctx.lineTo(bx + 9, H * 0.05); ctx.stroke();
      }
    }

    function drawBlocks(d) {
      var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      for (var i = 0; i < 7; i++) {
        var seed = i * 137;
        var x = ((seed * 13) % W + W - (d * 0.05 * (0.6 + i * 0.08)) % (W + 260) + (W + 260)) % (W + 260) - 130;
        var y = H * 0.13 + ((seed * 7) % Math.round(H * 0.22));
        var r = 16 + (seed % 4) * 5;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(state.elapsed * 0.8 + i) * 0.07);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        roundRect(-r, -r, r * 2, r * 2, r * 0.42); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '900 ' + (r * 1.05) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(letters[i % letters.length], 0, 1);
        ctx.restore();
      }
    }

    function drawSpace(d) {
      var baseY = H * 0.36;
      // 行星
      ctx.save();
      var px = W * 0.78, py = baseY - 40, pr = Math.min(W, H) * 0.09;
      var pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
      pg.addColorStop(0, 'rgba(216,180,254,0.9)');
      pg.addColorStop(1, 'rgba(88,28,135,0.75)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(216,180,254,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // 轨道弧线
      ctx.strokeStyle = 'rgba(196,132,252,0.2)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(W * 0.28, baseY - 20, 120 + i * 70, 26 + i * 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawLab(d) {
      var baseY = H * 0.4;
      var off = (d * 0.07) % 170;
      ctx.strokeStyle = 'rgba(110,231,183,0.28)';
      ctx.lineWidth = 3;
      for (var x = -170 - off; x < W + 170; x += 170) {
        // 试管
        ctx.beginPath();
        ctx.moveTo(x, baseY - 90);
        ctx.lineTo(x, baseY - 20);
        ctx.quadraticCurveTo(x, baseY, x + 16, baseY);
        ctx.quadraticCurveTo(x + 32, baseY, x + 32, baseY - 20);
        ctx.lineTo(x + 32, baseY - 90);
        ctx.stroke();
        ctx.fillStyle = 'rgba(110,231,183,0.18)';
        ctx.fillRect(x + 2, baseY - 48, 28, 46);
      }
      // 气泡
      for (var i = 0; i < 14; i++) {
        var seed = i * 71;
        var bxp = (seed * 29) % W;
        var byp = baseY - ((state.elapsed * 26 + seed * 7) % 260);
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#a7f3d0';
        ctx.beginPath(); ctx.arc(bxp, byp, 2 + (seed % 4), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawForest(d) {
      var baseY = H * 0.4;
      var off = (d * 0.07) % 160;
      for (var x = -160 - off; x < W + 160; x += 160) {
        ctx.fillStyle = 'rgba(20,70,40,0.5)';
        ctx.beginPath();
        ctx.moveTo(x, baseY + 40);
        ctx.lineTo(x + 42, baseY - 96);
        ctx.lineTo(x + 84, baseY + 40);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(12,50,28,0.55)';
        ctx.fillRect(x + 36, baseY + 20, 12, 34);
      }
      for (var i = 0; i < 16; i++) {
        var seed = i * 53;
        var fx = ((seed * 37) % W) + Math.sin(state.elapsed * 0.7 + i) * 16;
        var fy = H * 0.16 + ((seed * 11) % Math.round(H * 0.22)) + Math.cos(state.elapsed * 0.9 + i) * 8;
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin(state.elapsed * 1.6 + i)) * 0.5;
        ctx.fillStyle = '#bbf7d0';
        ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawDome(d) {
      var baseY = H * 0.4;
      var off = (d * 0.05) % 240;
      for (var x = -240 - off; x < W + 240; x += 240) {
        ctx.fillStyle = 'rgba(120,80,30,0.22)';
        // 山花
        ctx.beginPath();
        ctx.moveTo(x, baseY - 92);
        ctx.lineTo(x + 110, baseY - 132);
        ctx.lineTo(x + 220, baseY - 92);
        ctx.closePath(); ctx.fill();
        // 立柱
        for (var c = 0; c < 6; c++) ctx.fillRect(x + 12 + c * 35, baseY - 92, 18, 92);
        ctx.fillRect(x, baseY - 6, 220, 14);
      }
    }

    function drawAncient(d) {
      var baseY = H * 0.4;
      var off = (d * 0.05) % 260;
      for (var x = -260 - off; x < W + 260; x += 260) {
        ctx.fillStyle = 'rgba(30,20,8,0.5)';
        for (var t = 0; t < 3; t++) {
          var tw = 140 - t * 34, th = 34;
          ctx.fillRect(x + (140 - tw) / 2, baseY - 60 - t * 44, tw, th);
          ctx.beginPath();
          ctx.moveTo(x + (140 - tw) / 2 - 14, baseY - 60 - t * 44);
          ctx.lineTo(x + 70, baseY - 78 - t * 44);
          ctx.lineTo(x + (140 + tw) / 2 + 14, baseY - 60 - t * 44);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillRect(x + 60, baseY - 60, 20, 60);
      }
      // 灯笼
      for (var i = 0; i < 5; i++) {
        var lx = ((i * 197) % W);
        var ly = H * 0.14 + Math.sin(state.elapsed * 1.2 + i) * 8;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.ellipse(lx, ly, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillRect(lx - 11, ly - 2, 22, 3);
      }
      ctx.globalAlpha = 1;
    }

    function drawGlobe(d) {
      var cx = W * 0.5, cy = H * 0.32, r = Math.min(W, H) * 0.3;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#a5f3fc';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      for (var i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r * (i / 5), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(34,211,238,0.2)';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.2, r * 0.36, r * 0.22, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.32, cy + r * 0.22, r * 0.28, r * 0.18, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 云
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#e0f2fe';
      var off = (d * 0.06) % (W + 200);
      for (var c = 0; c < 3; c++) {
        var x = W - off + c * 260;
        ctx.beginPath();
        ctx.ellipse(x, H * 0.14 + c * 22, 52, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawDeco(d) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < 5; i++) {
        var seed = i * 91;
        var x = ((seed * 29) % W + W - (d * 0.04 * (0.5 + i * 0.07)) % (W + 260) + (W + 260)) % (W + 260) - 130;
        var y = H * 0.1 + ((seed * 17) % Math.round(H * 0.24)) + Math.sin(state.elapsed * 1.5 + i) * 7;
        ctx.globalAlpha = 0.5;
        ctx.font = (17 + (seed % 3) * 7) + 'px system-ui, "Apple Color Emoji", sans-serif';
        ctx.fillText(theme.deco[i % theme.deco.length], x, y);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawSpeedLines() {
      var t = (state.speed - CFG.BASE_SPEED) / (CFG.MAX_SPEED - CFG.BASE_SPEED);
      if (t <= 0.14 || state.phase !== 'playing') return;
      var n = Math.round(t * 16);
      var roll = Math.floor(state.distance * 0.5);
      ctx.save();
      ctx.globalAlpha = Math.min(0.4, t * 0.42);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.6;
      for (var i = 0; i < n; i++) {
        var seed = (i * 97 + roll) % 1000;
        var y = ((seed * 37) % (H * 0.46)) + H * 0.24;
        var side = (i % 2 === 0) ? -1 : 1;
        var x0 = W / 2 + side * (W * 0.28 + ((seed * 13) % 70));
        var len = 40 + ((seed * 7) % 100);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + side * len, y + 3);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawRoad() {
      var near = { y: H * 0.98, half: W * 0.66 };
      var far = { y: H * 0.35, half: W * 0.055 };
      ctx.beginPath();
      ctx.moveTo(W / 2 - near.half, near.y);
      ctx.lineTo(W / 2 - far.half, far.y);
      ctx.lineTo(W / 2 + far.half, far.y);
      ctx.lineTo(W / 2 + near.half, near.y);
      ctx.closePath();
      var rg = ctx.createLinearGradient(0, far.y, 0, near.y);
      rg.addColorStop(0, hexA(theme.road[0], 0.86));
      rg.addColorStop(1, hexA(theme.road[1], 0.97));
      ctx.fillStyle = rg;
      ctx.fill();

      // 车道线
      var seg = 130, offset = state.distance % seg;
      for (var lane = 0; lane <= 1; lane++) {
        var laneIdx = lane + 0.5;   // 0.5 / 1.5
        for (var z = -offset; z < CFG.FAR; z += seg) {
          var z1 = z < 0 ? 0 : z;
          var z2 = Math.min(CFG.FAR, z + seg * 0.5);
          if (z2 <= 0) continue;
          var a = project(z1, laneIdx), b = project(z2, laneIdx);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.lineWidth = Math.max(1, 5 * a.scale);
          ctx.strokeStyle = theme.line + (0.1 + 0.5 * a.scale) + ')';
          ctx.stroke();
        }
      }

      // 横向纹理
      var offz = state.distance % 260;
      for (var zz = -offz; zz < CFG.FAR; zz += 260) {
        if (zz < 0) continue;
        var p1 = project(zz, 0), p2 = project(zz, 2);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = Math.max(1, 2.4 * p1.scale);
        ctx.strokeStyle = theme.line + (0.05 + 0.18 * p1.scale) + ')';
        ctx.stroke();
      }

      drawRail(-0.34);
      drawRail(2.34);
    }

    function drawRail(laneIdx) {
      var spacing = 220, off = state.distance % spacing;
      for (var z = -off; z < CFG.FAR; z += spacing) {
        if (z < 0) continue;
        var p = project(z, laneIdx);
        if (p.scale < 0.05) continue;
        var h = 52 * p.scale + 4, w = 5 * p.scale + 1.2;
        var g = ctx.createLinearGradient(0, p.y - h, 0, p.y);
        g.addColorStop(0, theme.rail[0]);
        g.addColorStop(1, theme.rail[1]);
        ctx.fillStyle = g;
        ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      }
    }

    function drawFinish() {
      var p = project(state.finish.z, 1);
      var half = W * 0.34 * p.scale + W * 0.06;
      var h = 60 * p.scale + 26;
      // 门柱
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(p.x - half, p.y - h, Math.max(3, 9 * p.scale), h);
      ctx.fillRect(p.x + half - Math.max(3, 9 * p.scale), p.y - h, Math.max(3, 9 * p.scale), h);
      // 格子横幅
      var cols = 14, cw = (half * 2) / cols, ch = Math.max(6, 22 * p.scale);
      for (var i = 0; i < cols; i++) {
        for (var r = 0; r < 2; r++) {
          ctx.fillStyle = ((i + r) % 2 === 0) ? '#ffffff' : '#16202e';
          ctx.fillRect(p.x - half + i * cw, p.y - h + r * ch, cw, ch);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '900 ' + Math.max(10, 22 * p.scale + 8) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', p.x, p.y - h - 12);
    }

    function hexA(hex, a) {
      if (hex.charAt(0) !== '#') return hex;
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    /* ---------------- 建筑 ---------------- */
    function drawObject(o) {
      if (o.kind !== 'building' || o.destroyed) return;
      var p = project(o.z, o.lane);
      if (p.scale <= 0.02) return;

      var boss = o.boss;
      var w = (boss ? 150 : 108) * p.scale * 1.32;
      var h = (boss ? 262 : 196) * p.scale * 1.32;
      var x = p.x - w / 2, y = p.y - h;
      var flash = o.flash > 0;
      var radius = Math.max(3, 10 * p.scale * 1.32);

      ctx.save();
      // 影子
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, w * 0.52, Math.max(3, 10 * p.scale), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // 楼体
      var bg = ctx.createLinearGradient(x, y, x + w, y + h);
      bg.addColorStop(0, flash ? '#ffffff' : theme.wall);
      bg.addColorStop(1, flash ? theme.accent : theme.wallDark);
      ctx.fillStyle = bg;
      roundRect(x, y, w, h, radius);
      ctx.fill();

      // 窗户
      var cols = boss ? 4 : 3, rows = boss ? 6 : 5;
      var pad = w * 0.14;
      var gw = (w - pad * 2) / cols, gh = (h * 0.62) / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var lit = ((r * 3 + c * 5 + Math.floor(p.scale * 40) + (o.seed | 0)) % 4) !== 0;
          ctx.fillStyle = lit ? 'rgba(255,232,150,0.9)' : 'rgba(10,20,40,0.55)';
          var wx = x + pad + c * gw + gw * 0.18;
          var wy = y + h * 0.12 + r * gh + gh * 0.16;
          ctx.fillRect(wx, wy, gw * 0.64, gh * 0.58);
        }
      }

      // 门
      ctx.fillStyle = 'rgba(8,14,28,0.62)';
      roundRect(x + w * 0.36, y + h * 0.78, w * 0.28, h * 0.22, Math.max(2, 5 * p.scale));
      ctx.fill();

      // 顶部招牌
      var sign = Math.max(10, Math.min(w * 0.6, 46 * p.scale * 1.32 + 16));
      ctx.fillStyle = flash ? '#ffffff' : theme.accent;
      roundRect(p.x - sign / 2, y - sign * 0.62, sign, sign * 0.62 + 4, sign * 0.22);
      ctx.fill();
      ctx.fillStyle = flash ? theme.wallDark : 'rgba(10,16,30,0.85)';
      ctx.font = '900 ' + (sign * 0.5) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', p.x, y - sign * 0.3);

      // 轮廓
      ctx.strokeStyle = flash ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, 2.2 * p.scale);
      roundRect(x, y, w, h, radius);
      ctx.stroke();
      ctx.restore();
    }

    /* ---------------- 主角：手绘小猫 ---------------- */
    function drawPlayer() {
      var p = project(0, state.laneVisual);
      var jumping = state.jumping;
      var running = state.phase === 'playing' && !jumping;
      var bob = running ? Math.sin(state.elapsed * 17) * 3 : 0;
      var x = p.x;
      var y = H * 0.885 + state.jumpY + bob;
      var s = Math.max(0.72, Math.min(1.25, W / 780));

      // 影子
      ctx.save();
      ctx.globalAlpha = jumping ? 0.16 : 0.32;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, H * 0.9 + 12, 34 * s * (jumping ? 0.62 : 1), 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 速度残影
      var speedT = (state.speed - CFG.BASE_SPEED) / (CFG.MAX_SPEED - CFG.BASE_SPEED);
      if (running && speedT > 0.08) {
        for (var i = 1; i <= 3; i++) {
          ctx.save();
          ctx.globalAlpha = 0.14 * (1 - i / 4) * (0.5 + speedT);
          drawRunner(runner, x - i * 18 * s, y, s, state.elapsed - i * 0.02, { jumping: false, ghost: true });
          ctx.restore();
        }
      }

      if (state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      drawRunner(runner, x, y, s, state.elapsed, { jumping: jumping });
      ctx.globalAlpha = 1;

      if (state.invuln > 0) {
        ctx.beginPath();
        ctx.arc(x, y - 40 * s, 46 * s, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,94,0.75)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    /** 出战伙伴：买谁就用谁跑酷 */
    function drawRunner(kind, x, y, s, t, o) {
      if (kind === 'partner-dino') return drawDino(x, y, s, t, o);
      if (kind === 'partner-rocket') return drawRocket(x, y, s, t, o);
      if (kind === 'partner-unicorn') return drawUnicorn(x, y, s, t, o);
      return drawCat(x, y, s, t, o);
    }

    function drawDino(x, y, s, t, o) {
      var jumping = o && o.jumping;
      var run = jumping ? 0 : Math.sin(t * 17);
      var run2 = jumping ? 0 : Math.sin(t * 17 + Math.PI);
      var body = '#4ade80', dark = '#22a95c', belly = '#e8fcef', spike = '#166534', ink = '#0f2b1a';
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      // 尾巴 + 尾刺
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-10, -22);
      ctx.quadraticCurveTo(-38, -18 + run * 5, -46, -38 + run * 8);
      ctx.quadraticCurveTo(-30, -30, -12, -32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = spike;
      [0, 1, 2].forEach(function (i) {
        var tx = -20 - i * 9, ty = -24 - i * 3 + run * 4;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 6, ty - 12); ctx.lineTo(tx + 5, ty - 3); ctx.closePath(); ctx.fill();
      });

      // 远侧腿
      ctx.strokeStyle = dark; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-6, -2 + (jumping ? -8 : run * 6)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(9, -2 + (jumping ? -10 : run2 * 6)); ctx.stroke();

      // 身体
      ctx.fillStyle = body;
      roundRect(-17, -40, 34, 30, 13); ctx.fill();
      ctx.fillStyle = belly;
      roundRect(-9, -33, 19, 20, 8); ctx.fill();

      // 背刺
      ctx.fillStyle = spike;
      [0, 1, 2].forEach(function (i) {
        var sx = -10 + i * 11, sy = -40;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 5, sy - 13); ctx.lineTo(sx + 10, sy); ctx.closePath(); ctx.fill();
      });

      // 近侧腿
      ctx.strokeStyle = body; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-3, -1 + (jumping ? -5 : run2 * 7)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(11, -1 + (jumping ? -12 : run * 7)); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3, -1 + (jumping ? -5 : run2 * 7), 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -1 + (jumping ? -12 : run * 7), 4, 0, Math.PI * 2); ctx.fill();

      // 小手
      ctx.strokeStyle = body; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(6, -30); ctx.lineTo(15, -26 + run2 * 3); ctx.stroke();

      // 头 + 吻部
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, -52, 17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(13, -47, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = belly;
      ctx.beginPath(); ctx.ellipse(15, -44, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(12, -51, 1.2, 0, Math.PI * 2); ctx.fill();
      // 头顶小刺
      ctx.fillStyle = spike;
      ctx.beginPath(); ctx.moveTo(-4, -66); ctx.lineTo(0, -76); ctx.lineTo(5, -66); ctx.closePath(); ctx.fill();
      // 眼睛
      var blink = (Math.sin(t * 1.6) > 0.985) ? 0.2 : 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-6, -55, 4.6, 5 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -55, 4.6, 5 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(-5.4, -55, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5.6, -55, 2.2, 0, Math.PI * 2); ctx.fill();
      // 牙
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(14, -41); ctx.lineTo(17, -41); ctx.lineTo(15.5, -37); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawRocket(x, y, s, t, o) {
      var jumping = o && o.jumping;
      var flame = jumping ? 1.5 : 1 + Math.abs(Math.sin(t * 22)) * 0.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      // 尾焰
      var fy = jumping ? -6 : 0;
      var fg = ctx.createLinearGradient(0, fy, 0, fy + 34 * flame);
      fg.addColorStop(0, '#fff1a8');
      fg.addColorStop(0.45, '#ffb020');
      fg.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-11, fy);
      ctx.quadraticCurveTo(0, fy + 40 * flame, 11, fy);
      ctx.closePath();
      ctx.fill();

      // 尾翼
      ctx.fillStyle = '#ef524d';
      ctx.beginPath(); ctx.moveTo(-14, -34); ctx.lineTo(-30, -8 + (jumping ? -6 : 0)); ctx.lineTo(-13, -10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, -34); ctx.lineTo(30, -8 + (jumping ? -6 : 0)); ctx.lineTo(13, -10); ctx.closePath(); ctx.fill();

      // 箭体
      var bg = ctx.createLinearGradient(-16, 0, 16, 0);
      bg.addColorStop(0, '#f8fafc');
      bg.addColorStop(0.45, '#e2e8f0');
      bg.addColorStop(1, '#94a3b8');
      ctx.fillStyle = bg;
      roundRect(-15, -58, 30, 54, 13); ctx.fill();

      // 头锥
      ctx.fillStyle = '#ef524d';
      ctx.beginPath();
      ctx.moveTo(-15, -58);
      ctx.quadraticCurveTo(0, -92, 15, -58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(-15, -58); ctx.quadraticCurveTo(-6, -80, -2, -84); ctx.lineTo(-2, -58); ctx.closePath(); ctx.fill();

      // 舷窗
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(0, -42, 9.5, 0, Math.PI * 2); ctx.fill();
      var wg = ctx.createRadialGradient(-3, -45, 1, 0, -42, 9);
      wg.addColorStop(0, '#bae6fd');
      wg.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(0, -42, 7.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-2.6, -44.6, 2, 0, Math.PI * 2); ctx.fill();

      // 小眼睛（画在舷窗下方，让它更可爱）
      ctx.fillStyle = '#1b2437';
      ctx.beginPath(); ctx.arc(-6.5, -24, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, -24, 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b2437'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, -21, 3.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.restore();
    }

    function drawUnicorn(x, y, s, t, o) {
      var jumping = o && o.jumping;
      var run = jumping ? 0 : Math.sin(t * 17);
      var run2 = jumping ? 0 : Math.sin(t * 17 + Math.PI);
      var fur = '#fdf2f8', shade = '#f3d9e8', ink = '#4a3550';
      var mane = ['#f9a8d4', '#fcd34d', '#7dd3fc', '#a7f3d0', '#c4b5fd'];
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      // 彩虹尾巴
      mane.forEach(function (col, i) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 4.4;
        ctx.beginPath();
        ctx.moveTo(-12, -30);
        ctx.quadraticCurveTo(-30 - i * 3, -22 + run * 5, -34 - i * 2, -44 + run * 7 + i * 3);
        ctx.stroke();
      });

      // 远侧腿
      ctx.strokeStyle = shade; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-6, -2 + (jumping ? -8 : run * 6)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(9, -2 + (jumping ? -10 : run2 * 6)); ctx.stroke();

      // 身体
      ctx.fillStyle = fur;
      roundRect(-17, -42, 34, 32, 14); ctx.fill();
      ctx.fillStyle = shade;
      roundRect(-9, -30, 18, 16, 7); ctx.fill();

      // 近侧腿
      ctx.strokeStyle = fur; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-3, -1 + (jumping ? -5 : run2 * 7)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(11, -1 + (jumping ? -12 : run * 7)); ctx.stroke();
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath(); ctx.arc(-3, -1 + (jumping ? -5 : run2 * 7), 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -1 + (jumping ? -12 : run * 7), 3.6, 0, Math.PI * 2); ctx.fill();

      // 头
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.arc(0, -54, 17, 0, Math.PI * 2); ctx.fill();
      // 耳朵
      ctx.beginPath(); ctx.moveTo(-14, -60); ctx.lineTo(-9, -74); ctx.lineTo(-1, -64); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, -60); ctx.lineTo(9, -74); ctx.lineTo(1, -64); ctx.closePath(); ctx.fill();
      // 鬃毛
      mane.forEach(function (col, i) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-6 + (i % 2) * 12, -62 - i * 3.2, 7, 4.4, (i % 2 ? 0.5 : -0.5), 0, Math.PI * 2);
        ctx.fill();
      });
      // 角
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.moveTo(-4, -66); ctx.lineTo(1, -84); ctx.lineTo(5, -65); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-1, -72); ctx.lineTo(3, -70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -77); ctx.lineTo(3, -75.5); ctx.stroke();
      // 眼睛
      var blink = (Math.sin(t * 1.6) > 0.985) ? 0.2 : 1;
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(-6, -56, 3, 3.6 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, -56, 3, 3.6 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-5, -57.4, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -57.4, 1.1, 0, Math.PI * 2); ctx.fill();
      // 腮红
      ctx.fillStyle = 'rgba(249,168,212,0.7)';
      ctx.beginPath(); ctx.ellipse(-11, -50, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(11, -50, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      // 鼻子
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath(); ctx.moveTo(0, -50.6); ctx.lineTo(-2.4, -48); ctx.lineTo(2.4, -48); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawCat(x, y, s, t, o) {
      var jumping = o && o.jumping;
      var run = jumping ? 0 : Math.sin(t * 17);
      var run2 = jumping ? 0 : Math.sin(t * 17 + Math.PI);
      var fur = '#546686', furDark = '#3d4c6b', belly = '#eef4fc';
      var pink = '#ffb3c1', ink = '#1b2437';

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);

      // 尾巴
      ctx.strokeStyle = fur;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-13, -22);
      ctx.quadraticCurveTo(-32 - run * 5, -34 + run * 6, -26 - run * 7, -52 + run * 9);
      ctx.stroke();

      // 远侧的腿
      ctx.strokeStyle = furDark;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-6, -2 + (jumping ? -8 : run * 6)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(9, -2 + (jumping ? -10 : run2 * 6)); ctx.stroke();

      // 身体
      ctx.fillStyle = fur;
      roundRect(-17, -40, 34, 30, 13); ctx.fill();
      ctx.fillStyle = belly;
      roundRect(-10, -32, 20, 19, 8); ctx.fill();

      // 近侧的腿
      ctx.strokeStyle = fur;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(-3, -1 + (jumping ? -5 : run2 * 7)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(11, -1 + (jumping ? -12 : run * 7)); ctx.stroke();

      // 爪子
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3, -1 + (jumping ? -5 : run2 * 7), 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -1 + (jumping ? -12 : run * 7), 3.6, 0, Math.PI * 2); ctx.fill();

      // 头
      ctx.fillStyle = fur;
      ctx.beginPath(); ctx.arc(0, -52, 18, 0, Math.PI * 2); ctx.fill();

      // 耳朵
      ctx.beginPath(); ctx.moveTo(-16, -58); ctx.lineTo(-10, -76); ctx.lineTo(-1, -62); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(16, -58); ctx.lineTo(10, -76); ctx.lineTo(1, -62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = pink;
      ctx.beginPath(); ctx.moveTo(-13, -60); ctx.lineTo(-10, -70); ctx.lineTo(-5, -62); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(13, -60); ctx.lineTo(10, -70); ctx.lineTo(5, -62); ctx.closePath(); ctx.fill();

      // 口鼻区
      ctx.fillStyle = belly;
      ctx.beginPath(); ctx.ellipse(0, -48, 12, 8.6, 0, 0, Math.PI * 2); ctx.fill();

      // 眼睛
      var blink = (Math.sin(t * 1.6) > 0.985) ? 0.18 : 1;
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(-6.4, -54, 3.4, 3.9 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6.4, -54, 3.4, 3.9 * blink, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-5.4, -55.4, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7.4, -55.4, 1.2, 0, Math.PI * 2); ctx.fill();

      // 鼻子与嘴
      ctx.fillStyle = pink;
      ctx.beginPath(); ctx.moveTo(0, -49.6); ctx.lineTo(-2.6, -47); ctx.lineTo(2.6, -47); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, -47); ctx.lineTo(0, -44.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(-2.4, -44.6, 2.4, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(2.4, -44.6, 2.4, 0, Math.PI); ctx.stroke();

      // 胡须
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-10, -49); ctx.lineTo(-22, -51); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -46); ctx.lineTo(-22, -45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -49); ctx.lineTo(22, -51); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -46); ctx.lineTo(22, -45); ctx.stroke();

      ctx.restore();
    }

    function drawParticles() {
      state.particles.forEach(function (p) {
        var a = Math.max(0, 1 - p.age / p.life);
        ctx.globalAlpha = a;
        if (p.coin) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(Math.max(0.2, Math.abs(Math.cos(p.spin || 0))), 1);
          var g = ctx.createLinearGradient(0, -p.size, 0, p.size);
          g.addColorStop(0, '#fff3c4');
          g.addColorStop(0.5, '#ffd75e');
          g.addColorStop(1, '#e0980b');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + a), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    function drawFloats() {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      state.floats.forEach(function (f) {
        var a = Math.max(0, 1 - f.age / f.life);
        ctx.globalAlpha = a;
        ctx.font = '900 ' + f.size + 'px system-ui, "Apple Color Emoji", sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(6,12,24,0.65)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      });
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* ---------------- HUD ---------------- */
    function syncHud() {
      var hearts = '';
      for (var i = 0; i < CFG.MAX_LIVES; i++) hearts += (i < state.lives ? '❤️' : '🖤');
      hudLives.textContent = hearts;
      hudScore.textContent = Math.round(state.score);
      hudGold.textContent = state.gold;
      hudSpeed.textContent = (state.speed / CFG.BASE_SPEED).toFixed(1);
      if (hudCombo) hudCombo.textContent = state.combo;
      var total = state.planned || 1;
      var pct = Math.min(100, Math.round((state.resolved / total) * 100));
      if (hudBar) hudBar.style.width = pct + '%';
      if (hudBarText) hudBarText.textContent = state.resolved + ' / ' + state.planned + ' 座建筑';
    }

    /* ---------------- 结束 / 开始 ---------------- */
    function end(victory) {
      if (state.phase === 'finished') return;
      state.phase = 'finished';
      var accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
      var bonus = victory ? 200 : 0;   // 完赛额外计入“得分”，金币只来自答对题目
      state.score += bonus;
      state.result = {
        victory: victory,
        score: Math.round(state.score),
        gold: state.gold,
        correct: state.correct,
        answered: state.answered,
        total: state.planned,
        accuracy: accuracy,
        bestCombo: state.bestCombo,
        dodged: state.dodged,
        wrongIds: state.wrongIds.slice(),
        bonus: bonus,
        durationSec: Math.round(state.elapsed)
      };
      if (opts.onEnd) opts.onEnd(state.result);

      var stars = victory ? (accuracy >= 90 ? '⭐⭐⭐' : accuracy >= 70 ? '⭐⭐' : '⭐') : '💥';
      overlay.innerHTML =
        '<div class="overlay"><div class="overlay-card result-card">' +
          '<div style="font-size:52px">' + (victory ? '🏁' : '💥') + '</div>' +
          '<div class="result-title">' + (victory ? '冲过终点！' : '生命耗尽') + '</div>' +
          '<div class="result-stars">' + stars + '</div>' +
          '<p class="muted" style="margin-top:6px;font-size:13.5px">' +
            (victory
              ? '本关共 ' + state.planned + ' 座建筑，答对 ' + state.correct + ' 题、躲开 ' + state.dodged + ' 座'
              : '答错的建筑会扣生命，换道或跳跃可以躲开建筑（躲开不会出题）') +
          '</p>' +
          '<div class="result-grid">' +
            '<div class="result-cell"><b>' + state.result.score + '</b><span>本次得分</span></div>' +
            '<div class="result-cell"><b>+' + state.result.gold + '</b><span>获得金币</span></div>' +
            '<div class="result-cell"><b>' + accuracy + '%</b><span>正确率</span></div>' +
          '</div>' +
          '<div class="row" style="justify-content:center;gap:18px;font-size:13px;color:var(--muted);margin-bottom:18px">' +
            '<span>答对 ' + state.result.correct + ' / ' + state.result.answered + ' 题</span>' +
            '<span>最高连击 ×' + state.bestCombo + '</span>' +
            '<span>用时 ' + state.result.durationSec + 's</span>' +
          '</div>' +
          (state.result.wrongIds.length ? '<div class="analysis">错题已自动加入「错题修复」，共 ' + state.result.wrongIds.length + ' 道</div>' : '') +
          '<div class="row" style="margin-top:18px;gap:10px">' +
            '<button class="btn btn-primary grow" id="gAgain">再玩一次</button>' +
            '<button class="btn btn-ghost grow" id="gBack">返回学生端</button>' +
          '</div>' +
        '</div></div>';

      var again = overlay.querySelector('#gAgain');
      var back = overlay.querySelector('#gBack');
      if (again) again.onclick = function () { if (opts.onRestart) opts.onRestart(); };
      if (back) back.onclick = function () { if (opts.onQuit) opts.onQuit(); };
    }

    function ready() {
      overlay.innerHTML =
        '<div class="overlay"><div class="overlay-card center">' +
          '<div style="font-size:50px">🐱</div>' +
          '<h2 style="margin-top:8px;font-size:23px;font-weight:900">' + esc(subjectName) + ' · ' + esc(difficultyName) + '</h2>' +
          '<div class="ready-partner">🐾 出战伙伴：' + esc(partnerName) + ' Lv' + partnerLevel +
            (coinBonusPct > 0 ? '（金币 +' + coinBonusPct + '%、分数 +' + scoreBonusPct + '%）' : '') + '</div>' +
          '<p class="muted" style="margin-top:8px;font-size:13.5px">跑起来，撞到建筑就会出题，答对让建筑爆金币</p>' +
          '<div class="rule-grid">' +
            '<div class="rule-item"><span>🏢</span><div><b>撞建筑 → 出题</b><p>换道或跳跃躲开就不会出题</p></div></div>' +
            '<div class="rule-item"><span>🪙</span><div><b>答对 → 爆金币</b><p>题目越难，金币越多（基础 10 / 巩固 20 / 冲刺 30）</p></div></div>' +
            '<div class="rule-item"><span>❤️</span><div><b>答错 → 掉血</b><p>共 3 点生命，连对可以叠连击奖励</p></div></div>' +
            '<div class="rule-item"><span>🏁</span><div><b>跑完全程 → 结算</b><p>躲得越稳、答得越准，得分越高</p></div></div>' +
          '</div>' +
          '<div class="muted" style="font-size:12.5px;line-height:1.9;text-align:left;background:#f7fafd;border-radius:12px;padding:12px 14px;margin-top:14px">' +
            '⬅️ ➡️ / A D 切换跑道　空格 / ↑ 跳跃（跳过建筑＝躲开）<br>' +
            '📱 手机：左右滑动换道，向上滑动跳跃　⌨️ 答题时按 1-4 选选项，回车提交' +
          '</div>' +
          '<div class="row" style="margin-top:18px;gap:10px">' +
            '<button class="btn btn-primary btn-lg grow" id="gStart">开始跑酷</button>' +
            '<button class="btn btn-ghost" id="gExit">返回</button>' +
          '</div>' +
        '</div></div>';
      overlay.querySelector('#gStart').onclick = function () { startCountdown(); };
      overlay.querySelector('#gExit').onclick = function () { if (opts.onQuit) opts.onQuit(); };
    }

    /* ---------------- 倒计时 / 暂停 ---------------- */
    function startCountdown() {
      overlay.innerHTML = '';
      var old = shell.querySelector('.game-countdown');
      if (old) old.remove();
      var cd = document.createElement('div');
      cd.className = 'game-countdown';
      shell.appendChild(cd);
      state.phase = 'countdown';
      var n = 3;
      (function step() {
        if (n > 0) {
          cd.innerHTML = '<span>' + n + '</span>';
          n -= 1;
          setTimeout(step, 700);
        } else {
          cd.innerHTML = '<span>GO!</span>';
          setTimeout(function () {
            cd.remove();
            state.phase = 'playing';
            syncHud();
          }, 480);
        }
      })();
    }

    function pause() {
      if (state.phase !== 'playing') return;
      state.phase = 'paused';
      overlay.innerHTML =
        '<div class="overlay"><div class="overlay-card center">' +
          '<div style="font-size:44px">⏸️</div>' +
          '<h2 style="margin-top:8px;font-size:22px;font-weight:900">已暂停</h2>' +
          '<p class="muted" style="margin-top:6px;font-size:13px">' + esc(subjectName) + ' · ' + esc(difficultyName) + '</p>' +
          '<div class="row" style="margin-top:18px;gap:10px">' +
            '<button class="btn btn-primary grow" id="gResume">继续跑酷</button>' +
            '<button class="btn btn-ghost" id="gQuit">退出</button>' +
          '</div>' +
        '</div></div>';
      overlay.querySelector('#gResume').onclick = function () { resume(); };
      overlay.querySelector('#gQuit').onclick = function () { if (opts.onQuit) opts.onQuit(); };
    }

    function resume() {
      if (state.phase !== 'paused') return;
      overlay.innerHTML = '';
      last = performance.now();
      state.phase = 'playing';
    }

    /* ---------------- 输入 ---------------- */
    function move(dir) {
      if (state.phase !== 'playing') return;
      state.lane = Math.max(0, Math.min(2, state.lane + dir));
    }
    function jump() {
      if (state.phase !== 'playing' || state.jumping) return;
      state.jumping = true;
      state.vy = -900;
      dust(project(0, state.laneVisual).x, H * 0.9 + 12);
    }
    function keyHandler(e) {
      if (state.phase === 'question' && keyAnswer) { keyAnswer(e); if (e.key === 'Enter') e.preventDefault(); return; }
      var k = e.key;
      if ((k === 'p' || k === 'P') && (state.phase === 'playing' || state.phase === 'paused')) {
        e.preventDefault();
        if (state.phase === 'paused') resume(); else pause();
        return;
      }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); move(-1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); move(1); }
      else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); jump(); }
    }
    document.addEventListener('keydown', keyHandler);

    var touchStart = null;
    canvas.addEventListener('touchstart', function (e) {
      var t2 = e.changedTouches[0];
      touchStart = { x: t2.clientX, y: t2.clientY };
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!touchStart) return;
      var t2 = e.changedTouches[0];
      var dx = t2.clientX - touchStart.x;
      var dy = t2.clientY - touchStart.y;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        var rect = canvas.getBoundingClientRect();
        move(t2.clientX - rect.left < rect.width / 2 ? -1 : 1);
      } else if (dy < -34 && Math.abs(dy) > Math.abs(dx)) {
        jump();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        move(dx > 0 ? 1 : -1);
      }
      touchStart = null;
    }, { passive: true });

    /* ---------------- 主循环 ---------------- */
    var last = performance.now();
    var raf = null;
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', resize);
    if (pauseBtn) pauseBtn.onclick = function () { if (state.phase === 'paused') resume(); else pause(); };
    if (fullBtn) fullBtn.onclick = function () {
      try {
        if (!document.fullscreenElement) { if (shell.requestFullscreen) shell.requestFullscreen(); }
        else if (document.exitFullscreen) document.exitFullscreen();
      } catch (e) {}
    };
    ready();
    syncHud();
    raf = requestAnimationFrame(loop);

    return {
      destroy: function () {
        if (raf) cancelAnimationFrame(raf);
        document.removeEventListener('keydown', keyHandler);
        window.removeEventListener('resize', resize);
      },
      state: state,
      theme: theme,
      partner: { id: runner, name: partnerName, level: partnerLevel, coinBonusPct: coinBonusPct, scoreBonusPct: scoreBonusPct }
    };
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.PKGame = { mount: mount, CFG: CFG, THEMES: THEMES, coinBase: coinBase };
})();
