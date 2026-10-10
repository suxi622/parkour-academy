/*!
 * 汤姆猫跑酷学堂 · 跑酷闯关引擎
 * 三跑道伪 3D 跑酷 + 答题门 + BOSS 战
 */
(function () {
  'use strict';
  var PK = window.PK;

  var CFG = {
    FAR: 1500,
    BASE_SPEED: 320,
    MAX_SPEED: 900,
    MIN_SPEED: 190,
    SPEED_UP: 55,
    SPEED_DOWN: 90,
    LANES: [-1, 0, 1],
    QUESTION_TRIGGER: 300,
    COIN_VALUE: 10,
    CORRECT_GOLD: 20,
    CORRECT_SCORE: 100,
    WRONG_SCORE: -20,
    MAX_LIVES: 3,
    BOSS_HP: 3
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  function mount(container, opts) {
    opts = opts || {};
    var questions = (opts.questions || []).slice();
    var scene = opts.scene || ['#0f172a', '#1e3a5f'];
    var subjectName = opts.subjectName || '数学';
    var difficultyName = opts.difficultyName || '基础关卡';
    var total = questions.length;

    var state = {
      phase: 'ready',            // ready | playing | question | paused | finished
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
      lane: 1,
      laneVisual: 1,
      jumpY: 0,
      vy: 0,
      jumping: false,
      invuln: 0,
      hurtFlash: 0,
      goodFlash: 0,
      lastSpawnAt: 0,
      spawnIndex: 0,
      questionPool: PK.shuffle(questions, opts.seed || 7),
      activeQuestion: null,
      activeObject: null,
      boss: null,
      bossHp: CFG.BOSS_HP,
      elapsed: 0,
      result: null
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
            '<div class="hud-chip" id="gSubject">' + subjectName + ' · ' + difficultyName + '</div>' +
            '<div class="hud-chip">🏆 <span id="gScore">0</span></div>' +
            '<div class="hud-chip">🪙 <span id="gGold">0</span></div>' +
          '</div>' +
          '<div class="hud-row" style="align-items:flex-end">' +
            '<div class="hud-chip">速度 <span id="gSpeed">1.0</span>x</div>' +
            '<div class="hud-chip">题目 <span id="gProgress">0/0</span></div>' +
            '<div class="hud-chip" id="gBoss" style="display:none">BOSS ❤️❤️❤️</div>' +
          '</div>' +
        '</div>' +
        '<div class="combo-badge" id="gCombo"></div>' +
        '<div id="gOverlay"></div>' +
      '</div>';

    var shell = container.querySelector('.game-shell');
    var canvas = container.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var overlay = container.querySelector('#gOverlay');
    var comboEl = container.querySelector('#gCombo');
    var hudLives = container.querySelector('#gLives');
    var hudScore = container.querySelector('#gScore');
    var hudGold = container.querySelector('#gGold');
    var hudSpeed = container.querySelector('#gSpeed');
    var hudProgress = container.querySelector('#gProgress');
    var hudBoss = container.querySelector('#gBoss');
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
      for (var i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * 0.42, r: Math.random() * 1.6 + 0.4, a: Math.random(), s: 0.5 + Math.random() });
      }
    }

    /* ---------------- 投影 ---------------- */
    function project(z, lane) {
      var t = Math.max(0, Math.min(1, z / CFG.FAR));
      var e = t * t * 0.6 + t * 0.4;
      var y = lerp(H * 0.9, H * 0.33, e);
      var scale = lerp(1, 0.16, e);
      var x = W / 2 + lane * (W * 0.34) * scale;
      return { x: x, y: y, scale: scale, t: t };
    }

    /** 五角星路径（用于金币内的星形） */
    function traceStar(cx, cy, outer, inner, spikes) {
      var rot = -Math.PI / 2, step = Math.PI / spikes;
      ctx.beginPath();
      ctx.moveTo(cx, cy - outer);
      for (var i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
        ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
      }
      ctx.closePath();
    }

    /** 远景山脊 / 城市剪影（视差） */
    function drawHills(baseY, parallax, color, hMin, step) {
      var offset = (state.distance * parallax) % step;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-step, baseY + 6);
      var x = -step * 2 - offset;
      var i = 0;
      while (x < W + step) {
        var h = hMin + ((i * 53) % 7) / 7 * hMin * 1.5;
        ctx.lineTo(x, baseY + 4);
        ctx.lineTo(x + step * 0.5, baseY - h);
        ctx.lineTo(x + step, baseY + 4);
        x += step; i++;
      }
      ctx.lineTo(W + step, baseY + 10);
      ctx.lineTo(-step, baseY + 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /** 天空、星空、地平线光晕、远景剪影 */
    function drawSky() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, scene[0]);
      g.addColorStop(1, scene[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      var tw = state.elapsed;
      stars.forEach(function (s) {
        ctx.globalAlpha = 0.28 + Math.abs(Math.sin(tw * s.s + s.x)) * 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(((s.x - state.distance * 0.02 * s.s) % W + W) % W, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      var glow = ctx.createRadialGradient(W / 2, H * 0.33, 0, W / 2, H * 0.33, W * 0.62);
      glow.addColorStop(0, 'rgba(255,255,255,0.2)');
      glow.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      drawHills(H * 0.335, 0.045, 'rgba(255,255,255,0.07)', 74, 250);
      drawHills(H * 0.335, 0.09, 'rgba(0,0,0,0.3)', 54, 190);
    }

    /** 高速时的速度线 */
    function drawSpeedLines() {
      var t = (state.speed - CFG.BASE_SPEED) / (CFG.MAX_SPEED - CFG.BASE_SPEED);
      if (t <= 0.12 || state.phase !== 'playing') return;
      var n = Math.round(t * 16);
      var roll = Math.floor(state.distance * 0.5);
      ctx.save();
      ctx.globalAlpha = Math.min(0.42, t * 0.45);
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

    /* ---------------- 生成 ---------------- */
    function spawnQuestion() {
      if (!state.questionPool.length) return false;
      var q = state.questionPool.shift();
      var lane = CFG.LANES[Math.floor(Math.random() * 3)];
      state.objects.push({ kind: 'question', z: CFG.FAR, lane: lane, question: q, destroyed: false, passed: false, bob: Math.random() * 6 });
      return true;
    }

    function spawnBlock() {
      var lane = CFG.LANES[Math.floor(Math.random() * 3)];
      state.objects.push({ kind: 'block', z: CFG.FAR, lane: lane, destroyed: false, passed: false, color: '#' + (['ef524d', '713cdd', '2b8cee'])[Math.floor(Math.random() * 3)] });
    }

    function spawnCoin() {
      var lane = CFG.LANES[Math.floor(Math.random() * 3)];
      var count = 1 + Math.floor(Math.random() * 3);
      for (var i = 0; i < count; i++) {
        state.objects.push({ kind: 'coin', z: CFG.FAR + i * 90, lane: lane, destroyed: false, passed: false, spin: Math.random() * 6 });
      }
    }

    function spawnBoss() {
      state.boss = { kind: 'boss', z: CFG.FAR, lane: 0, hp: CFG.BOSS_HP, destroyed: false, hitFlash: 0 };
      state.objects.push(state.boss);
      state.bossHp = CFG.BOSS_HP;
      hudBoss.style.display = '';
      updateBossHud();
    }

    function updateBossHud() {
      var hearts = '';
      for (var i = 0; i < CFG.BOSS_HP; i++) hearts += (i < state.bossHp ? '❤️' : '🖤');
      hudBoss.innerHTML = 'BOSS ' + hearts;
    }

    function maybeSpawn() {
      var gap = Math.max(280, 620 - state.speed * 0.28);
      if (state.distance - state.lastSpawnAt < gap) return;
      state.lastSpawnAt = state.distance;
      state.spawnIndex++;

      // 最后 3 道题 → BOSS 战
      var remaining = state.questionPool.length;
      var needBoss = total > 3 && state.answered >= total - 3 && !state.boss && state.lives > 0;
      if (needBoss) { spawnBoss(); spawnQuestion(); return; }

      var roll = Math.random();
      if (state.questionPool.length && (roll < 0.5 || state.spawnIndex % 3 === 0)) spawnQuestion();
      else if (roll < 0.74) spawnBlock();
      else spawnCoin();
    }

    function burst(x, y, color, n, spread) {
      for (var i = 0; i < n; i++) {
        var ang = Math.random() * Math.PI * 2;
        var sp = (spread || 150) * (0.35 + Math.random());
        state.particles.push({
          x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60,
          life: 0.7 + Math.random() * 0.4, age: 0, color: color, size: 2 + Math.random() * 4
        });
      }
    }

    /* ---------------- 更新 ---------------- */
    function update(dt) {
      state.elapsed += dt;
      if (state.invuln > 0) state.invuln -= dt;
      if (state.hurtFlash > 0) state.hurtFlash -= dt;
      if (state.goodFlash > 0) state.goodFlash -= dt;
      if (state.phase !== 'playing') return;

      state.distance += state.speed * dt;
      if (state.speed < CFG.MAX_SPEED) state.speed = Math.min(CFG.MAX_SPEED, state.speed + 6 * dt);

      // 换跑道平滑
      state.laneVisual += (state.lane - state.laneVisual) * Math.min(1, dt * 12);

      // 跳跃
      if (state.jumping) {
        state.vy += 2100 * dt;
        state.jumpY += state.vy * dt;
        if (state.jumpY >= 0) { state.jumpY = 0; state.vy = 0; state.jumping = false; }
      }

      maybeSpawn();

      for (var i = state.objects.length - 1; i >= 0; i--) {
        var o = state.objects[i];
        o.z -= state.speed * dt;

        if (o.kind === 'question' && !o.destroyed && !o.passed && o.z <= CFG.QUESTION_TRIGGER) {
          o.z = CFG.QUESTION_TRIGGER;
          askQuestion(o);
          return;
        }

        if (o.z <= 6 && o.z > -90 && !o.destroyed && !o.passed) {
          if (o.kind === 'coin') {
            if (o.lane === state.lane && !state.jumping) {
              o.destroyed = true;
              state.gold += CFG.COIN_VALUE;
              state.score += CFG.COIN_VALUE;
              var p = project(o.z, o.lane);
              burst(p.x, p.y, '#ffd75e', 10, 120);
              syncHud();
            } else if (o.z < -60) { o.passed = true; }
          } else if (o.lane === state.lane && !state.jumping) {
            if (o.kind === 'block') {
              o.passed = true;
              hurt('撞到了障碍物');
            } else if (o.kind === 'boss') {
              o.passed = true;
              hurt('被 BOSS 挡住了');
            }
          } else if (o.z < -60) {
            o.passed = true;
          }
        }

        if (o.z < -160) state.objects.splice(i, 1);
      }

      for (var j = state.particles.length - 1; j >= 0; j--) {
        var pt = state.particles[j];
        pt.age += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 520 * dt;
        if (pt.age >= pt.life) state.particles.splice(j, 1);
      }
    }

    function hurt(reason) {
      if (state.invuln > 0) return;
      state.lives -= 1;
      state.combo = 0;
      state.invuln = 1.2;
      state.hurtFlash = 0.45;
      state.speed = Math.max(CFG.MIN_SPEED, state.speed - CFG.SPEED_DOWN);
      syncHud();
      if (opts.onEvent) opts.onEvent({ type: 'hurt', reason: reason, lives: state.lives });
      if (state.lives <= 0) end(false);
    }

    /* ---------------- 答题 ---------------- */
    function askQuestion(obj) {
      state.phase = 'question';
      state.activeQuestion = obj.question;
      state.activeObject = obj;
      renderQuestion(obj.question);
    }

    function questionTypeName(type) {
      return type === 'judge' ? '判断题' : type === 'fill' ? '填空题' : '单选题';
    }

    function renderQuestion(q) {
      var html = [];
      html.push('<div class="overlay" id="qOverlay"><div class="overlay-card">');
      html.push('<div class="row between"><span class="q-type-chip">' + questionTypeName(q.type) + '</span>');
      html.push('<span class="badge">第 ' + (state.answered + 1) + ' / ' + total + ' 题</span></div>');
      html.push('<div class="q-content">' + esc(q.content) + '</div>');
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
      html.push('<div class="center muted" style="font-size:12px;margin-top:10px">答对：清除障碍 · 速度 +1 · 金币 +20 &nbsp;|&nbsp; 答错：扣 1 点生命</div>');
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

        // 正确/错误样式
        Array.prototype.forEach.call(body.querySelectorAll('.opt'), function (b, idx) {
          b.disabled = true;
          if (idx === res.expectedIndex) b.classList.add('correct');
          else if (idx === res.givenIndex) b.classList.add('wrong');
        });
        if (q.type === 'fill' && fill) {
          fill.disabled = true;
          fill.style.borderColor = res.correct ? '#28bd66' : '#ef524d';
        }

        feed.innerHTML =
          '<div class="verdict ' + (res.correct ? 'ok' : 'no') + '" style="margin-top:14px">' +
            (res.correct ? '✓ 回答正确！' : '✕ 回答错误') +
          '</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:6px">正确答案：<b style="color:#16202e">' + esc(res.expectedText) + '</b>' +
            (res.correct ? '' : '　你的答案：' + esc(res.givenText || '（空）')) +
          '</div>' +
          (q.analysis ? '<div class="analysis"><b>解析</b>　' + esc(q.analysis) + '</div>' : '');

        submit.textContent = '继续闯关';
        submit.className = 'btn btn-accent grow';
        submit.onclick = finishQuestion;
        var skipBtn = overlay.querySelector('#qSkip');
        if (skipBtn) skipBtn.style.display = 'none';

        if (res.correct) {
          state.correct++;
          state.combo++;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          state.gold += CFG.CORRECT_GOLD;
          state.score += CFG.CORRECT_SCORE + state.combo * 5;
          state.speed = Math.min(CFG.MAX_SPEED, state.speed + CFG.SPEED_UP);
          state.goodFlash = 0.35;
          var obj = state.activeObject;
          if (obj) {
            obj.destroyed = true;
            var p = project(obj.z, obj.lane);
            burst(p.x, p.y, '#4ade80', 26, 260);
          }
          if (state.boss && state.bossHp > 0) {
            state.bossHp -= 1;
            state.boss.hitFlash = 0.4;
            updateBossHud();
            if (state.bossHp <= 0) {
              var bp = project(state.boss.z, 0);
              burst(bp.x, bp.y, '#ffd75e', 46, 320);
            }
          }
          showCombo();
        } else {
          state.wrongIds.push(q.id);
          if (state.boss && state.bossHp < CFG.BOSS_HP) { state.bossHp += 1; updateBossHud(); }
          state.score = Math.max(0, state.score + CFG.WRONG_SCORE);
          hurt('答错题目');
        }
        syncHud();
        if (opts.onAnswer) opts.onAnswer(res.correct, q, payload, res);
        if (state.phase === 'finished') return;
        setTimeout(function () { if (settled && state.phase === 'question') finishQuestion(); }, 2600);
      }

      function finishQuestion() {
        overlay.innerHTML = '';
        state.activeQuestion = null;
        state.activeObject = null;
        if (state.lives <= 0) return;
        if (state.answered >= total && total > 0) { end(true); return; }
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
        hurt('跳过了题目');
        syncHud();
        if (opts.onAnswer) opts.onAnswer(false, q, '', { correct: false, expectedText: q.answer, givenText: '' });
        setTimeout(finishQuestion, 60);
      };
    }

    function showCombo() {
      if (state.combo < 2) return;
      comboEl.textContent = '连击 ×' + state.combo;
      comboEl.classList.remove('show');
      void comboEl.offsetWidth;
      comboEl.classList.add('show');
    }

    /* ---------------- 绘制 ---------------- */
    function draw() {
      drawSky();
      drawSpeedLines();

      // 跑道
      drawRoad();

      // 物体：远的先画
      var objs = state.objects.slice().sort(function (a, b) { return b.z - a.z; });
      objs.forEach(drawObject);

      // 玩家
      drawPlayer();

      // 粒子
      state.particles.forEach(function (p) {
        var a = 1 - p.age / p.life;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (state.hurtFlash > 0) {
        ctx.fillStyle = 'rgba(239,82,77,' + (state.hurtFlash * 0.7) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      if (state.goodFlash > 0) {
        ctx.fillStyle = 'rgba(74,222,128,' + (state.goodFlash * 0.35) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawRoad() {
      var near = { y: H * 0.98, half: W * 0.66 };
      var far = { y: H * 0.33, half: W * 0.055 };
      ctx.beginPath();
      ctx.moveTo(W / 2 - near.half, near.y);
      ctx.lineTo(W / 2 - far.half, far.y);
      ctx.lineTo(W / 2 + far.half, far.y);
      ctx.lineTo(W / 2 + near.half, near.y);
      ctx.closePath();
      var rg = ctx.createLinearGradient(0, far.y, 0, near.y);
      rg.addColorStop(0, 'rgba(32,46,76,0.62)');
      rg.addColorStop(0.5, 'rgba(18,28,52,0.86)');
      rg.addColorStop(1, 'rgba(9,16,32,0.97)');
      ctx.fillStyle = rg;
      ctx.fill();

      // 跑道分隔线（流动虚线）
      var seg = 130;
      var offset = state.distance % seg;
      for (var lane = -1; lane <= 1; lane += 2) {
        for (var z = -offset; z < CFG.FAR; z += seg) {
          var z1 = z < 0 ? 0 : z;
          var z2 = Math.min(CFG.FAR, z + seg * 0.5);
          if (z2 <= 0) continue;
          var a = project(z1, lane * 0.5);
          var b = project(z2, lane * 0.5);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineWidth = Math.max(1, 5 * a.scale);
          ctx.strokeStyle = 'rgba(120,200,255,' + (0.08 + 0.5 * a.scale) + ')';
          ctx.stroke();
        }
      }

      // 起点横向纹理
      var offz = state.distance % 260;
      for (var zz = -offz; zz < CFG.FAR; zz += 260) {
        if (zz < 0) continue;
        var p1 = project(zz, -1);
        var p2 = project(zz, 1);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = Math.max(1, 2.4 * p1.scale);
        ctx.strokeStyle = 'rgba(120,180,255,' + (0.05 + 0.18 * p1.scale) + ')';
        ctx.stroke();
      }

      // 两侧发光护栏
      drawRail(-1);
      drawRail(1);
    }

    function drawRail(side) {
      var spacing = 220;
      var off = state.distance % spacing;
      for (var z = -off; z < CFG.FAR; z += spacing) {
        if (z < 0) continue;
        var p = project(z, side * 1.34);
        if (p.scale < 0.05) continue;
        var h = 52 * p.scale + 4;
        var w = 5 * p.scale + 1.2;
        var g = ctx.createLinearGradient(0, p.y - h, 0, p.y);
        g.addColorStop(0, 'rgba(150,215,255,0.9)');
        g.addColorStop(1, 'rgba(43,140,238,0.22)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      }
    }

    function drawObject(o) {
      if (o.destroyed) return;
      var p = project(o.z, o.lane);
      if (p.scale <= 0.02) return;

      if (o.kind === 'coin') {
        var r = 15 * p.scale * 1.6;
        o.spin += 0.09;
        var squash = Math.abs(Math.cos(o.spin));
        ctx.save();
        ctx.translate(p.x, p.y - r * 1.5);
        ctx.scale(Math.max(0.18, squash), 1);
        var cg = ctx.createLinearGradient(0, -r, 0, r);
        cg.addColorStop(0, '#fff4c9');
        cg.addColorStop(0.5, '#ffd75e');
        cg.addColorStop(1, '#e0980b');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1, 2.2 * p.scale);
        ctx.stroke();
        // 内嵌五角星
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#fffbe8';
        traceStar(0, 0, r * 0.5, r * 0.22, 5);
        ctx.fill();
        ctx.restore();
        return;
      }

      var w = (o.kind === 'boss' ? 190 : 96) * p.scale * 1.4;
      var h = (o.kind === 'boss' ? 200 : 120) * p.scale * 1.4;
      var x = p.x - w / 2;
      var y = p.y - h;
      var radius = Math.max(3, 12 * p.scale * 1.4);

      if (o.kind === 'boss') {
        ctx.save();
        var pulse = o.hitFlash > 0 ? 1 : 0;
        o.hitFlash = Math.max(0, (o.hitFlash || 0) - 0.016);
        var bg = ctx.createLinearGradient(x, y, x + w, y + h);
        bg.addColorStop(0, pulse ? '#ffd0ce' : '#4a1f5e');
        bg.addColorStop(1, pulse ? '#ff6b66' : '#8a2fb0');
        ctx.fillStyle = bg;
        roundRect(x, y, w, h, radius);
        ctx.fill();
        // 触角
        ctx.strokeStyle = pulse ? '#ffd0ce' : '#c98cff';
        ctx.lineWidth = Math.max(2, 5 * p.scale);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + 2);
        ctx.lineTo(x + w * 0.08, y - h * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w * 0.8, y + 2);
        ctx.lineTo(x + w * 0.92, y - h * 0.2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, 2.4 * p.scale);
        roundRect(x, y, w, h, radius);
        ctx.stroke();
        // 眼睛（白底 + 瞳孔）
        ctx.fillStyle = pulse ? '#ffffff' : '#ff5a55';
        ctx.beginPath();
        ctx.arc(x + w * 0.32, y + h * 0.34, Math.max(2, w * 0.075), 0, Math.PI * 2);
        ctx.arc(x + w * 0.68, y + h * 0.34, Math.max(2, w * 0.075), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0a1f';
        ctx.beginPath();
        ctx.arc(x + w * 0.32, y + h * 0.34, Math.max(1, w * 0.03), 0, Math.PI * 2);
        ctx.arc(x + w * 0.68, y + h * 0.34, Math.max(1, w * 0.03), 0, Math.PI * 2);
        ctx.fill();
        // 嘴
        ctx.strokeStyle = '#1a0a1f';
        ctx.lineWidth = Math.max(1.2, 3 * p.scale);
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.54, w * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.restore();

        // BOSS 血条
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(x, y - 16 * p.scale - 8, w, Math.max(6, 12 * p.scale), 6);
        ctx.fill();
        ctx.fillStyle = '#ef524d';
        roundRect(x, y - 16 * p.scale - 8, w * (state.bossHp / CFG.BOSS_HP), Math.max(6, 12 * p.scale), 6);
        ctx.fill();
        return;
      }

      if (o.kind === 'question') {
        var bob = Math.sin(state.elapsed * 3 + o.bob) * 6 * p.scale;
        ctx.save();
        var qg = ctx.createLinearGradient(x, y + bob, x + w, y + h + bob);
        qg.addColorStop(0, '#7ad9ff');
        qg.addColorStop(0.5, '#2b8cee');
        qg.addColorStop(1, '#1b5ad0');
        ctx.fillStyle = qg;
        roundRect(x, y + bob, w, h, radius);
        ctx.fill();
        ctx.shadowColor = 'rgba(43,140,238,0.85)';
        ctx.shadowBlur = 30 * p.scale;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, 3 * p.scale);
        roundRect(x, y + bob, w, h, radius);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 内圈
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, 1.6 * p.scale);
        roundRect(x + w * 0.13, y + h * 0.13 + bob, w * 0.74, h * 0.74, radius * 0.7);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '900 ' + Math.max(10, 62 * p.scale * 1.4) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + w / 2, y + h / 2 + bob);
        ctx.restore();
        return;
      }

      // 普通障碍
      ctx.save();
      var g2 = ctx.createLinearGradient(x, y, x + w, y + h);
      g2.addColorStop(0, o.color || '#ef524d');
      g2.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g2;
      roundRect(x, y, w, h, radius);
      ctx.fill();
      // 警示斜纹
      ctx.save();
      roundRect(x, y, w, h, radius);
      ctx.clip();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = Math.max(2, 7 * p.scale);
      var stripe = Math.max(9, 24 * p.scale);
      for (var s = -h; s < w + h; s += stripe) {
        ctx.beginPath();
        ctx.moveTo(x + s, y + h);
        ctx.lineTo(x + s + h, y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(1, 2 * p.scale);
      roundRect(x, y, w, h, radius);
      ctx.stroke();
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawPlayer() {
      var p = project(0, state.laneVisual);
      var jump = state.jumpY;
      var x = p.x;
      var size = 54 * 1.35;
      var running = state.phase === 'playing' && !state.jumping;
      var bob = running ? Math.sin(state.elapsed * 16) * 3 : 0;
      var y = H * 0.88 + jump + bob;

      // 影子
      ctx.save();
      ctx.globalAlpha = state.jumping ? 0.18 : 0.34;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, H * 0.9 + 16, size * (state.jumping ? 0.3 : 0.42), size * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 奔跑残影（速度越快越明显）
      var speedT = (state.speed - CFG.BASE_SPEED) / (CFG.MAX_SPEED - CFG.BASE_SPEED);
      if (running && speedT > 0.08) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = size + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        for (var i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.16 * (1 - i / 4) * (0.5 + speedT);
          ctx.fillText('🐱', x - i * 15, y + 4);
        }
        ctx.restore();
      }

      if (state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45;
      var halo = ctx.createRadialGradient(x, y + size * 0.3, 0, x, y + size * 0.3, size * 0.92);
      halo.addColorStop(0, 'rgba(255,255,255,0.15)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y + size * 0.3, size * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = size + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('🐱', x, y + 4);
      ctx.globalAlpha = 1;

      // 无敌护盾
      if (state.invuln > 0) {
        ctx.beginPath();
        ctx.arc(x, y - size * 0.4, size * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,94,0.75)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    /* ---------------- HUD ---------------- */
    function syncHud() {
      var hearts = '';
      for (var i = 0; i < CFG.MAX_LIVES; i++) hearts += (i < state.lives ? '❤️' : '🖤');
      hudLives.textContent = hearts;
      hudScore.textContent = Math.round(state.score);
      hudGold.textContent = state.gold;
      hudSpeed.textContent = (state.speed / CFG.BASE_SPEED).toFixed(1);
      hudProgress.textContent = state.answered + '/' + total;
    }

    function syncHudStatic() {
      hudScore.textContent = Math.round(state.score);
      hudGold.textContent = state.gold;
    }

    /* ---------------- 结束/开始 ---------------- */
    function end(victory) {
      if (state.phase === 'finished') return;
      state.phase = 'finished';
      var accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
      var bossDefeated = !state.boss || state.bossHp <= 0;
      var bonus = victory && bossDefeated ? 100 : 0;
      state.gold += bonus;
      state.result = {
        victory: victory,
        score: Math.round(state.score),
        gold: state.gold,
        correct: state.correct,
        answered: state.answered,
        total: total,
        accuracy: accuracy,
        bestCombo: state.bestCombo,
        wrongIds: state.wrongIds.slice(),
        bonus: bonus,
        durationSec: Math.round(state.elapsed)
      };
      if (opts.onEnd) opts.onEnd(state.result);

      overlay.innerHTML =
        '<div class="overlay"><div class="overlay-card result-card">' +
          '<div style="font-size:52px">' + (victory ? '🏆' : '💥') + '</div>' +
          '<div class="result-title">' + (victory ? '闯关成功！' : '闯关失败') + '</div>' +
          '<p class="muted" style="margin-top:6px;font-size:13.5px">' +
            (victory
              ? (bossDefeated ? '你完成了全部题目并击败 BOSS，积分已实时计入排行榜' : '你完成了全部题目，积分已实时计入排行榜')
              : '生命值耗尽，再挑战一次会更熟练') +
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
          '<h2 style="margin-top:8px;font-size:23px;font-weight:900">' + subjectName + ' · ' + difficultyName + '</h2>' +
          '<p class="muted" style="margin-top:8px;font-size:13.5px">三跑道跑酷闯关，答对题目清除障碍，最后击败 BOSS</p>' +
          '<div class="grid grid-3" style="margin:18px 0;text-align:left">' +
            '<div class="result-cell"><b>' + total + '</b><span>本次题目</span></div>' +
            '<div class="result-cell"><b>' + CFG.MAX_LIVES + '</b><span>生命值</span></div>' +
            '<div class="result-cell"><b>+100</b><span>通关奖励金币</span></div>' +
          '</div>' +
          '<div class="muted" style="font-size:12.5px;line-height:1.9;text-align:left;background:#f7fafd;border-radius:12px;padding:12px 14px">' +
            '⬅️ ➡️ / A D 切换跑道　空格 / ↑ 跳跃<br>' +
            '📱 手机：左右滑动切换跑道，向上滑动跳跃<br>' +
            '📝 答对：清障 + 加速 + 20 金币　答错：扣 1 点生命' +
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
      state.vy = -880;
    }
    function keyHandler(e) {
      if (state.phase === 'question' && e.key === 'Escape') return;
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
      var t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY, at: Date.now() };
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      if (!touchStart) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStart.x;
      var dy = t.clientY - touchStart.y;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        var rect = canvas.getBoundingClientRect();
        move(t.clientX - rect.left < rect.width / 2 ? -1 : 1);
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
      state: state
    };
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.PKGame = { mount: mount, CFG: CFG };
})();
