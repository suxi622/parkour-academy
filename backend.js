/*!
 * 汤姆猫跑酷学堂 · 后端接入层（Supabase）
 * ---------------------------------------------------------------------------
 *  这一层把「账号 / 密码 / 积分 / 班级 / 作业 / 错题 / 提问」全部接到云端数据库，
 *  对外暴露 window.PKBackend。没配置 config.js 时 configured === false，
 *  上层会自动退回单机演示模式。
 */
(function () {
  'use strict';

  var CFG = window.PK_SUPABASE || {};
  var LIB = window.supabase;
  var DOMAIN = CFG.studentEmailDomain || 'pk-academy.local';
  var enabled = !!(CFG.url && CFG.anonKey && LIB && typeof LIB.createClient === 'function');

  var client = enabled ? LIB.createClient(CFG.url, CFG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  var state = { session: null, profile: null, recovery: false, bootstrapped: false };
  var watchers = [];

  function emit() {
    watchers.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  /* ------------------------------------------------------------------ 工具 */

  function loginToEmail(login) {
    var v = String(login || '').trim();
    if (!v) return '';
    return v.indexOf('@') !== -1 ? v.toLowerCase() : (v.toLowerCase() + '@' + DOMAIN);
  }

  var FRIENDLY = [
    [/invalid login credentials/i, '账号或密码不正确'],
    [/email not confirmed/i, '账号还没激活，请联系老师或管理员'],
    [/user already registered|already been registered/i, '这个账号名已被占用，换一个试试'],
    [/password should be at least/i, '密码太短了，至少 6 位'],
    [/unable to validate email|invalid format/i, '账号名或邮箱格式不正确'],
    [/rate limit|too many requests/i, '操作太频繁，请稍等一会儿再试'],
    [/for security purposes/i, '操作太频繁，请稍等几秒再试'],
    [/duplicate key value/i, '这条记录已存在'],
    [/class not found/i, '没找到这个班级：请核对学校名与班级码'],
    [/row-level security|permission denied|violates row-level/i, '当前账号没有权限做这个操作'],
    [/failed to fetch|networkerror|load failed/i, '网络连接不上，请检查网络后重试']
  ];

  function friendly(err) {
    var msg = (err && (err.message || err.error_description || err.error)) || String(err || '');
    for (var i = 0; i < FRIENDLY.length; i++) {
      if (FRIENDLY[i][0].test(msg)) return FRIENDLY[i][1];
    }
    return msg || '操作失败，请稍后重试';
  }

  function ok(extra) { return Object.assign({ ok: true }, extra || {}); }
  function fail(err) { return { ok: false, error: friendly(err), raw: err }; }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function toastable(promise) {
    return promise.then(function (r) { return r; }).catch(function (e) { return fail(e); });
  }

  /* ------------------------------------------------------- 行 → 前端对象映射 */

  function mapClass(row, extra) {
    extra = extra || {};
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      school: row.school || '',
      gradeKey: row.grade_key || '',
      gradeLabel: row.grade_label || '',
      stage: row.stage || '',
      owner: row.teacher_id || '',
      teacher: row.teacher_name || '',
      students: Number(extra.students) || Number(row.students) || 0,
      avg: 0,
      rate: 0,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      fromCloud: true
    };
  }

  function mapQuestion(row) {
    var extra = row.extra || {};
    return {
      id: row.id,
      subject: row.subject,
      stage: extra.stage || '',
      difficulty: row.difficulty,
      type: row.kind,
      chapter: extra.chapter || '自定义章节',
      content: row.stem,
      options: row.options || [],
      answer: row.answer,
      accept: extra.accept || [],
      analysis: row.explain || '',
      source: row.owner_name ? ('教师自定义 · ' + row.owner_name) : '题库',
      image: row.image_url || '',
      link: extra.link || null,
      visibility: row.visibility || 'school',
      ownerId: row.owner_id || '',
      verified: true
    };
  }

  function questionToRow(q) {
    return {
      subject: q.subject || 'math',
      difficulty: q.difficulty || 'basic',
      kind: q.type || 'choice',
      stem: q.content || q.stem || '',
      options: q.options || [],
      answer: q.answer === undefined ? null : q.answer,
      explain: q.analysis || '',
      image_url: q.image || '',
      visibility: q.visibility || 'school',
      extra: { stage: q.stage || '', chapter: q.chapter || '', accept: q.accept || [], link: q.link || null }
    };
  }

  function mapHomework(row, questionIds, submissions) {
    var extra = row.extra || {};
    var subs = {};
    (submissions || []).forEach(function (s) {
      subs[s.student_name || s.student_id] = {
        victory: !!s.victory,
        score: Number(s.score) || 0,
        correct: Number(s.correct_count) || 0,
        total: Number(s.total) || 0,
        at: s.submitted_at ? new Date(s.submitted_at).getTime() : Date.now()
      };
    });
    return {
      id: row.id,
      title: row.title,
      note: extra.note || '',
      image: extra.image || '',
      link: extra.link || null,
      classId: row.class_id,
      className: (row.classes && row.classes.name) || extra.className || '未指定班级',
      questionIds: questionIds || [],
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      due: row.due_at ? new Date(row.due_at).toISOString().slice(0, 10) : '',
      status: row.status,
      submissions: subs
    };
  }

  function mapAsk(row, replies) {
    var last = (replies && replies.length) ? replies[replies.length - 1] : null;
    return {
      id: row.id,
      student: row.student_name || '同学',
      emoji: row.student_emoji || '🙂',
      studentId: row.student_id,
      klass: (row.classes && row.classes.name) || '',
      text: row.text || '',
      image: row.image_url || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      status: last ? 'answered' : (row.status === 'closed' ? 'closed' : 'open'),
      answer: last ? last.text : '',
      answeredAt: last ? new Date(last.created_at).getTime() : 0,
      answeredBy: last ? last.author_name : '',
      count: (replies || []).length
    };
  }

  function numMap(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) { out[k] = Number(obj[k]) || 0; });
    return out;
  }

  function mapLeaderRow(row) {
    return {
      id: row.student_id,
      name: row.name,
      emoji: row.emoji || '🐱',
      klass: row.class_name || row.grade_label || row.school || '',
      className: row.class_name || '',
      classId: row.class_id || '',
      school: row.school || '',
      gradeKey: row.grade_key || '',
      gradeLabel: row.grade_label || '',
      points: {
        today: Number(row.points_today) || 0,
        week: Number(row.points_week) || 0,
        total: Number(row.points_total) || 0
      },
      correct: Number(row.correct) || 0,
      total: Number(row.answered) || 0,
      streak: Number(row.streak) || 0,
      subjectPoints: numMap(row.subject_points),
      subjectToday: numMap(row.subject_today),
      subjectWeek: numMap(row.subject_week),
      at: row.at ? new Date(row.at).getTime() : Date.now()
    };
  }

  /* ------------------------------------------------------------------ 会话 */

  function setSession(session) {
    state.session = session || null;
    if (!session) state.profile = null;
    emit();
  }

  async function loadProfile() {
    if (!client || !state.session) { state.profile = null; return null; }
    var res = await client.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle();
    if (res.error) { state.profile = null; return null; }
    state.profile = res.data || null;
    emit();
    return state.profile;
  }

  async function init() {
    if (!enabled) { state.bootstrapped = true; emit(); return state; }
    try {
      var res = await client.auth.getSession();
      if (res.data && res.data.session) {
        state.session = res.data.session;
        await loadProfile();
      }
    } catch (e) { /* 忽略：离线时按未登录处理 */ }

    client.auth.onAuthStateChange(function (event, session) {
      state.session = session || null;
      if (event === 'PASSWORD_RECOVERY') state.recovery = true;
      if (event === 'SIGNED_OUT') state.profile = null;
      if (session) { loadProfile(); } else { emit(); }
    });

    state.bootstrapped = true;
    emit();
    return state;
  }

  /* ------------------------------------------------------------------ 认证 */

  async function signIn(login, password) {
    if (!enabled) return { ok: false, error: '还没有配置后端（config.js 为空）' };
    var email = loginToEmail(login);
    if (!email || !password) return { ok: false, error: '请填写账号和密码' };
    var res = await client.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return fail(res.error);
    state.session = res.data.session;
    await loadProfile();
    if (state.profile && state.profile.status === 'disabled') {
      await client.auth.signOut();
      return { ok: false, error: '这个账号已被停用，请联系老师或管理员' };
    }
    return ok({ profile: state.profile });
  }

  async function signUpStudent(o) {
    o = o || {};
    if (!enabled) return { ok: false, error: '还没有配置后端（config.js 为空）' };
    var login = String(o.login || '').trim();
    if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/.test(login)) {
      return { ok: false, error: '账号名请用 2–20 位字母、数字、下划线或中文' };
    }
    if (!o.password || String(o.password).length < 6) {
      return { ok: false, error: '密码至少 6 位' };
    }
    var res = await client.auth.signUp({
      email: loginToEmail(login),
      password: o.password,
      options: {
        data: {
          role: 'student',
          login_name: login,
          display_name: o.name || login,
          emoji: o.emoji || '🐱',
          school: o.school || ''
        }
      }
    });
    if (res.error) return fail(res.error);
    // 开了「确认邮箱」时不会立刻有 session，这里给出提示
    if (!res.data.session) {
      return { ok: true, needConfirm: true, message: '账号已创建。如果登录不了，请让管理员在 Supabase 里关闭 "Confirm email"。' };
    }
    state.session = res.data.session;
    await loadProfile();
    return ok({ profile: state.profile });
  }

  async function signUpTeacher(o) {
    o = o || {};
    if (!enabled) return { ok: false, error: '还没有配置后端（config.js 为空）' };
    if (!CFG.allowTeacherSelfSignup) {
      return { ok: false, error: '老师账号由管理员统一开通，请联系管理员' };
    }
    var email = String(o.email || '').trim().toLowerCase();
    if (email.indexOf('@') === -1) return { ok: false, error: '请填写有效的邮箱地址' };
    if (!o.password || String(o.password).length < 6) return { ok: false, error: '密码至少 6 位' };
    var res = await client.auth.signUp({
      email: email,
      password: o.password,
      options: {
        data: {
          role: 'teacher',
          login_name: email,
          display_name: o.name || '老师',
          emoji: o.emoji || '🧑‍🏫',
          school: o.school || ''
        }
      }
    });
    if (res.error) return fail(res.error);
    if (!res.data.session) {
      return {
        ok: true,
        needConfirm: true,
        message: '注册成功！请到邮箱里点确认链接激活账号，然后再回来登录。'
      };
    }
    state.session = res.data.session;
    await loadProfile();
    return ok({ profile: state.profile });
  }

  async function signOut() {
    if (!enabled) return ok();
    flushPlayerState();
    try { await client.auth.signOut(); } catch (e) {}
    state.session = null;
    state.profile = null;
    emit();
    return ok();
  }

  /** 自助找回密码：只有绑定了真实邮箱的账号（通常是老师）可用 */
  async function sendResetEmail(login) {
    if (!enabled) return { ok: false, error: '还没有配置后端' };
    var email = loginToEmail(login);
    if (email.indexOf('@' + DOMAIN) !== -1) {
      return {
        ok: false,
        error: '学生账号没有邮箱，无法自助找回。请让老师或管理员在后台为你重置密码。'
      };
    }
    var redirect = CFG.resetRedirect || (location.origin + location.pathname);
    var res = await client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    if (res.error) return fail(res.error);
    return ok({ message: '重置链接已发到邮箱，请查收（也看看垃圾邮件）。' });
  }

  /** 已登录状态下修改密码（这就是「用户自己改密码」的入口） */
  async function updatePassword(newPassword) {
    if (!enabled) return { ok: false, error: '还没有配置后端' };
    if (!newPassword || String(newPassword).length < 6) return { ok: false, error: '新密码至少 6 位' };
    var res = await client.auth.updateUser({ password: newPassword });
    if (res.error) return fail(res.error);
    if (state.profile && state.profile.must_change_password) {
      await client.from('profiles').update({ must_change_password: false }).eq('id', state.session.user.id);
      state.profile.must_change_password = false;
    }
    return ok({ message: '密码已更新' });
  }

  /** 用当前密码再登录一次，确认是本人操作 */
  async function verifyPassword(password) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var email = state.session.user.email;
    var res = await client.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return { ok: false, error: '当前密码不正确' };
    return ok();
  }

  async function updateProfileFields(fields) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var patch = {};
    if (fields.display_name !== undefined) patch.display_name = String(fields.display_name).slice(0, 20);
    if (fields.emoji !== undefined) patch.emoji = fields.emoji;
    if (fields.school !== undefined) patch.school = String(fields.school).slice(0, 30);
    if (fields.grade_key !== undefined) patch.grade_key = fields.grade_key;
    if (fields.grade_label !== undefined) patch.grade_label = fields.grade_label;
    var res = await client.from('profiles').update(patch).eq('id', state.session.user.id).select('*').maybeSingle();
    if (res.error) return fail(res.error);
    state.profile = res.data || state.profile;
    emit();
    return ok({ profile: state.profile });
  }

  /* -------------------------------------------------------- 数据：整体拉取 */

  async function bootstrap() {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var me = state.session.user.id;
    var isT = isTeacher();
    var out = { ok: true };

    var q = client.from('class_members').select('class_id, classes:class_id(*)').eq('student_id', me);
    var owned = client.from('classes').select('*').eq('teacher_id', me).eq('archived', false);
    var [memberRes, ownedRes, stateRes, wrongRes] = await Promise.all([
      q, owned, client.from('player_state').select('state').eq('user_id', me).maybeSingle(),
      client.from('wrong_book').select('question_id').eq('student_id', me).is('resolved_at', null)
    ]);

    var classes = [];
    var joinedClassIds = [];
    (memberRes.data || []).forEach(function (m) {
      if (m.classes) { classes.push(mapClass(m.classes)); joinedClassIds.push(m.class_id); }
    });
    if (isT) {
      (ownedRes.data || []).forEach(function (row) {
        var c = mapClass(row);
        if (!classes.some(function (x) { return x.id === c.id; })) classes.push(c);
      });
    }
    out.classes = classes;
    out.joinedClassIds = joinedClassIds;
    out.wrongIds = (wrongRes.data || []).map(function (r) { return r.question_id; });
    out.playerState = (stateRes.data && stateRes.data.state) || null;

    // 题库：老师的全部题目 + 学生能看到的本校题目（作业要用）
    var qRes = await client.from('questions')
      .select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(1000);
    out.questions = (qRes.data || []).map(mapQuestion);

    // 作业
    var hwRes = await client.from('homework')
      .select('*, classes:class_id(name)').order('created_at', { ascending: false }).limit(200);
    var hwRows = hwRes.data || [];
    var hwIds = hwRows.map(function (h) { return h.id; });
    var hwqRes = hwIds.length ? await client.from('homework_questions').select('*').in('homework_id', hwIds)
      : { data: [] };
    var subRes = hwIds.length ? await client.from('submissions').select('*').in('homework_id', hwIds)
      : { data: [] };
    out.homework = hwRows.map(function (h) {
      var ids = (hwqRes.data || []).filter(function (r) { return r.homework_id === h.id; })
        .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); }).map(function (r) { return r.question_id; });
      var subs = (subRes.data || []).filter(function (s) { return s.homework_id === h.id; });
      return mapHomework(h, ids, subs);
    });

    // 提问（学生看自己的，老师看自己班的）
    var askRes = await client.from('asks')
      .select('*, classes:class_id(name)').order('created_at', { ascending: false }).limit(200);
    var askRows = askRes.data || [];
    var askIds = askRows.map(function (a) { return a.id; });
    var repRes = askIds.length ? await client.from('ask_replies').select('*').in('ask_id', askIds)
      .order('created_at', { ascending: true }) : { data: [] };
    out.asks = askRows.map(function (a) {
      var reps = (repRes.data || []).filter(function (r) { return r.ask_id === a.id; });
      return mapAsk(a, reps);
    });

    return out;
  }

  async function loadPlayerState() {
    if (!enabled || !state.session) return null;
    var res = await client.from('player_state').select('state').eq('user_id', state.session.user.id).maybeSingle();
    return (res.data && res.data.state) || null;
  }

  var stateTimer = null;
  var statePending = null;
  function savePlayerState(obj) {
    if (!enabled || !state.session) return;
    var userId = state.session.user.id;      // 先记住是谁的存档：定时器可能在退出登录后才触发
    statePending = obj;
    if (stateTimer) return;
    stateTimer = setTimeout(function () {
      stateTimer = null;
      var payload = statePending;
      if (!userId) return;
      client.from('player_state')
        .upsert({ user_id: userId, state: payload, updated_at: new Date().toISOString() })
        .then(function () {}, function () {});
    }, 2500);
  }

  /** 退出登录时丢掉还没发出去的存档，避免把上一个人的数据写到下一个人头上 */
  function flushPlayerState() {
    if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; }
    statePending = null;
  }

  /* -------------------------------------------------------- 数据：班级 */

  async function createClass(o) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var school = String(o.school || (state.profile && state.profile.school) || '').trim();
    if (!school) return { ok: false, error: '请先填写学校名称' };
    var codeRes = await client.rpc('gen_class_code', { p_school: school });
    var code = (codeRes && codeRes.data) || String(Math.floor(1000 + Math.random() * 9000));
    var insert = await client.from('classes').insert({
      name: o.name,
      code: code,
      school: school,
      grade_key: o.gradeKey || '',
      grade_label: o.gradeLabel || '',
      stage: o.stage || '',
      teacher_id: state.session.user.id,
      teacher_name: (state.profile && state.profile.display_name) || '老师'
    }).select('*').maybeSingle();
    if (insert.error) return fail(insert.error);
    return ok({ klass: mapClass(insert.data), code: code });
  }

  async function joinClass(school, code) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.rpc('join_class', { p_school: school, p_code: code });
    if (res.error) return fail(res.error);
    var cls = await client.from('classes').select('*').eq('id', res.data).maybeSingle();
    return ok({ klass: cls.data ? mapClass(cls.data) : null, classId: res.data });
  }

  async function findClass(school, code) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.rpc('find_class', { p_school: school, p_code: code });
    if (res.error) return fail(res.error);
    var row = (res.data || [])[0];
    return row ? ok({ klass: mapClass({ id: row.id, name: row.name, code: row.code, school: row.school, grade_key: row.grade_key, grade_label: row.grade_label, teacher_name: row.teacher_name }, { students: row.students }) }) : { ok: false, error: '没找到这个班级' };
  }

  async function classRoster(classId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('class_members')
      .select('student_id, joined_at, profiles:student_id(id, display_name, emoji, school, grade_label, status)')
      .eq('class_id', classId);
    if (res.error) return fail(res.error);
    return ok({ members: (res.data || []).map(function (m) { return m.profiles; }).filter(Boolean) });
  }

  async function leaveClass(classId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('class_members').delete().eq('class_id', classId).eq('student_id', state.session.user.id);
    if (res.error) return fail(res.error);
    return ok();
  }

  async function archiveClass(classId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('classes').update({ archived: true }).eq('id', classId).select('id').maybeSingle();
    if (res.error) return fail(res.error);
    return ok();
  }

  async function removeClassMember(classId, studentId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('class_members').delete().eq('class_id', classId).eq('student_id', studentId);
    if (res.error) return fail(res.error);
    return ok();
  }

  /* -------------------------------------------------------- 数据：作业 */

  async function createHomework(hw) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('homework').insert({
      class_id: hw.classId,
      teacher_id: state.session.user.id,
      title: hw.title,
      status: 'open',
      due_at: hw.due ? new Date(hw.due + 'T23:59:59+08:00').toISOString() : null,
      extra: { note: hw.note || '', image: hw.image || '', link: hw.link || null, className: hw.className || '' }
    }).select('*').maybeSingle();
    if (res.error) return fail(res.error);
    var rows = (hw.questionIds || []).map(function (qid, i) {
      return { homework_id: res.data.id, question_id: qid, ord: i };
    });
    if (rows.length) {
      var link = await client.from('homework_questions').insert(rows);
      if (link.error) return fail(link.error);
    }
    return ok({ homework: mapHomework(res.data, hw.questionIds || [], []) });
  }

  async function setHomeworkStatus(id, status) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('homework').update({ status: status }).eq('id', id);
    if (res.error) return fail(res.error);
    return ok();
  }

  async function deleteHomework(id) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('homework').delete().eq('id', id);
    if (res.error) return fail(res.error);
    return ok();
  }

  async function submitHomework(sub) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('submissions').upsert({
      homework_id: sub.homeworkId,
      student_id: state.session.user.id,
      student_name: (state.profile && state.profile.display_name) || '同学',
      victory: !!sub.victory,
      score: Number(sub.score) || 0,
      correct_count: Number(sub.correctCount) || 0,
      total: Number(sub.total) || 0,
      answers: sub.answers || [],
      submitted_at: new Date().toISOString()
    }, { onConflict: 'homework_id,student_id' });
    if (res.error) return fail(res.error);
    return ok();
  }

  /* -------------------------------------------------------- 数据：题库 */

  async function saveQuestion(q) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    if (!isTeacher()) return { ok: false, error: '只有老师能新增题目' };
    var row = questionToRow(q);
    row.owner_id = state.session.user.id;
    row.owner_name = (state.profile && state.profile.display_name) || '老师';
    var res;
    if (q.id && String(q.id).indexOf('-') !== -1 && String(q.id).length === 36) {
      res = await client.from('questions').update(row).eq('id', q.id).select('*').maybeSingle();
    } else {
      res = await client.from('questions').insert(row).select('*').maybeSingle();
    }
    if (res.error) return fail(res.error);
    return ok({ question: mapQuestion(res.data) });
  }

  async function deleteQuestion(id) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('questions').update({ deleted: true }).eq('id', id);
    if (res.error) return fail(res.error);
    return ok();
  }

  /* -------------------------------------------------------- 数据：提问 */

  async function createAsk(a) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var klass = (a.classList && a.classList[0]) || null;
    var res = await client.from('asks').insert({
      student_id: state.session.user.id,
      student_name: (state.profile && state.profile.display_name) || '同学',
      student_emoji: (state.profile && state.profile.emoji) || '🙂',
      class_id: klass,
      teacher_id: a.teacherId || null,
      text: a.text || '',
      image_url: a.image || '',
      status: 'pending'
    }).select('*, classes:class_id(name)').maybeSingle();
    if (res.error) return fail(res.error);
    return ok({ ask: mapAsk(res.data, []) });
  }

  async function replyAsk(askId, text) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('ask_replies').insert({
      ask_id: askId,
      author_id: state.session.user.id,
      author_name: (state.profile && state.profile.display_name) || '老师',
      text: text
    }).select('*').maybeSingle();
    if (res.error) return fail(res.error);
    await client.from('asks').update({ status: 'answered', answered_at: new Date().toISOString() }).eq('id', askId);
    return ok({ reply: res.data });
  }

  async function deleteAsk(askId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('asks').delete().eq('id', askId);
    if (res.error) return fail(res.error);
    return ok();
  }

  /* -------------------------------------------------------- 数据：答题 */

  async function recordAnswer(o) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('answer_events').insert({
      student_id: state.session.user.id,
      question_id: o.questionId || null,
      subject: o.subject || 'math',
      correct: !!o.correct,
      points: Math.max(0, Number(o.points) || 0),
      source: o.source || 'game'
    });
    if (res.error) return fail(res.error);
    return ok();
  }

  async function myStats() {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var me = state.session.user.id;
    var [statsRes, dailyRes] = await Promise.all([
      client.from('player_stats').select('*').eq('student_id', me).maybeSingle(),
      client.from('player_daily').select('*').eq('student_id', me).order('day', { ascending: false }).limit(30)
    ]);
    return ok({ stats: statsRes.data || null, daily: dailyRes.data || [] });
  }

  async function resolveWrong(questionId) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('wrong_book')
      .update({ resolved_at: new Date().toISOString() })
      .eq('student_id', state.session.user.id).eq('question_id', questionId);
    if (res.error) return fail(res.error);
    return ok();
  }

  /* -------------------------------------------------------- 数据：榜单 */

  async function leaderboard(limit) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var res = await client.from('leaderboard_view').select('*')
      .order('points_total', { ascending: false }).limit(Math.min(500, limit || 200));
    if (res.error) return fail(res.error);
    return ok({ rows: (res.data || []).map(mapLeaderRow) });
  }

  /** 最近几分钟的答题动态（实时动态流） */
  async function recentEvents(minutes) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    var since = new Date(Date.now() - (minutes || 30) * 60000).toISOString();
    var res = await client.from('answer_events')
      .select('id, student_id, subject, correct, points, created_at, profiles:student_id(display_name, emoji)')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(30);
    if (res.error) return fail(res.error);
    var me = state.session.user.id;
    return ok({
      events: (res.data || []).map(function (e) {
        var p = e.profiles || {};
        return {
          id: String(e.id),
          studentId: e.student_id,
          name: p.display_name || '同学',
          emoji: p.emoji || '🙂',
          subject: e.subject || 'math',
          correct: !!e.correct,
          gain: Number(e.points) || 0,
          at: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
          isMe: e.student_id === me
        };
      })
    });
  }

  /* -------------------------------------------------------- 图片上传 */

  /**
   * 一键体检：把「地址对不对 / 有没有建表 / 密钥对不对」分开告诉用户。
   * 分不清问题时，这是最省事的一步——出错时提示里会直接写清楚该去做什么。
   */
  async function healthCheck() {
    if (!enabled) {
      return {
        ok: false, stage: 'noconfig',
        message: '还没有配置后端：config.js 里的 url 和 anonKey 是空的，所以现在跑在「单机演示模式」（数据只存在这台设备）。'
      };
    }

    var probe;
    try {
      probe = await client.from('profiles').select('id').limit(1);
    } catch (e) {
      return {
        ok: false, stage: 'unreachable',
        message: '连不上你填的地址（' + CFG.url + '）。请检查：① 地址有没有抄错；② 项目是否已经创建完成；③ 电脑网络是否正常。'
      };
    }

    if (probe.error) {
      var msg = String(probe.error.message || probe.error);
      if (/could not find the table|schema cache|does not exist|42P01|PGRST205/i.test(msg)) {
        return {
          ok: false, stage: 'noschema',
          message: '地址和密钥是对的 ✅，但数据库里还没有表格 ❌。请到 Supabase 网页 → SQL Editor → New query，把 supabase/schema.sql 全文粘贴执行一次。'
        };
      }
      if (/invalid api key|no api key|jwt|unauthorized|401|invalid.*key/i.test(msg)) {
        return {
          ok: false, stage: 'badkey',
          message: '地址能连上 ✅，但密钥不对 ❌。请重新复制 anon public（或 publishable）那一串，注意不要复制成 service_role / secret。'
        };
      }
      return { ok: false, stage: 'error', message: '数据库返回了错误：' + msg };
    }

    // 表格存在。再确认管理员函数在不在（schema.sql 是否完整跑完）
    var rpc = null;
    try { rpc = await client.rpc('admin_list_users'); } catch (e) { rpc = { error: e }; }
    var rpcMsg = String((rpc && rpc.error && (rpc.error.message || rpc.error)) || '');
    if (/could not find the function|PGRST202/i.test(rpcMsg)) {
      return {
        ok: false, stage: 'halfschema',
        message: '主要表格已在 ✅，但 schema.sql 没有执行完整（缺少管理员函数）。建议把 supabase/schema.sql 再完整执行一次，它重复执行也不会出错。'
      };
    }

    return {
      ok: true, stage: 'ok',
      message: '一切正常 ✅ 已连上数据库，表格齐全，可以注册登录了。'
    };
  }

  async function uploadImage(dataUrl, prefix) {
    if (!enabled || !state.session || !dataUrl) return dataUrl || '';
    if (String(dataUrl).indexOf('data:') !== 0) return dataUrl;   // 已经是网址
    try {
      var blob = await (await fetch(dataUrl)).blob();
      var ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      var path = state.session.user.id + '/' + (prefix || 'img') + '-' + Date.now() + '.' + ext;
      var up = await client.storage.from('pk-media').upload(path, blob, { upsert: true, contentType: blob.type });
      if (up.error) return dataUrl;
      return client.storage.from('pk-media').getPublicUrl(path).data.publicUrl;
    } catch (e) {
      return dataUrl;
    }
  }

  /* -------------------------------------------------------- 管理后台 */

  /**
   * 管理员操作有两条路：
   *   1) 部署了 Edge Function「admin-actions」→ 优先用它（官方做法，功能最全，支持批量建号）
   *   2) 没部署 → 自动改用 schema.sql 里的 public.admin_* 数据库函数
   * 两条路都在服务端校验管理员身份，前端拿不到超越权限的能力。
   */
  var ADMIN_RPC = {
    list_users: 'admin_list_users',
    reset_password: 'admin_set_password',
    set_role: 'admin_set_role',
    set_status: 'admin_set_status',
    delete_user: 'admin_delete_user',
    overview: 'admin_overview'
  };

  var ADMIN_RPC_ARGS = {
    list_users: function () { return {}; },
    overview: function () { return {}; },
    reset_password: function (p) { return { p_user_id: p.user_id, p_password: p.password }; },
    set_role: function (p) { return { p_user_id: p.user_id, p_role: p.role }; },
    set_status: function (p) { return { p_user_id: p.user_id, p_status: p.status }; },
    delete_user: function (p) { return { p_user_id: p.user_id }; }
  };

  function looksLikeMissingFunction(err) {
    var msg = String((err && (err.message || err.error_description || err.error)) || err || '');
    var status = err && err.context && err.context.status;
    return status === 404 || /not found|404|failed to send a request|function not deployed/i.test(msg);
  }

  /** 返回 null 表示「这个函数没部署」，让调用方走数据库函数 */
  async function callAdminFunction(action, payload) {
    try {
      var res = await client.functions.invoke('admin-actions', {
        body: Object.assign({ action: action }, payload || {})
      });
      if (res.error) {
        if (looksLikeMissingFunction(res.error)) return null;
        return fail(res.error);
      }
      return res.data || { ok: false, error: '空响应' };
    } catch (e) {
      if (looksLikeMissingFunction(e)) return null;
      return fail(e);
    }
  }

  /** 备用通道：调用数据库里的 public.admin_* 函数 */
  async function adminViaRpc(action, payload) {
    // 榜单：管理员本来就有全站读权限，直接查视图即可，不需要 Edge Function
    if (action === 'leaderboard') {
      var lb = await client.from('leaderboard_view').select('*')
        .order('points_total', { ascending: false }).limit(Math.min(500, (payload && payload.limit) || 200));
      if (lb.error) return fail(lb.error);
      return ok({ rows: lb.data || [] });
    }

    var fnName = ADMIN_RPC[action];
    if (!fnName) {
      if (action === 'create_user' || action === 'bulk_create_users') {
        return {
          ok: false,
          error: '批量建号需要先部署 admin-actions 函数（见部署指南步骤 4）。' +
                 '也可以让学生自己在登录页注册，不需要管理员开号。'
        };
      }
      return { ok: false, error: '这个功能需要部署 admin-actions 函数' };
    }

    var args = (ADMIN_RPC_ARGS[action] || function () { return {}; })(payload || {});
    var res = await client.rpc(fnName, args);
    if (res.error) {
      var msg = String(res.error.message || '');
      if (/需要管理员权限/.test(msg)) return { ok: false, error: '需要管理员权限' };
      if (/不能/.test(msg) || /密码至少/.test(msg) || /不存在/.test(msg) || /不合法/.test(msg)) {
        return { ok: false, error: msg };
      }
      return fail(res.error);
    }

    if (action === 'list_users') {
      return ok({ users: await enrichUsers(res.data || []), total: (res.data || []).length, page: 1, per_page: 50 });
    }
    if (action === 'overview') {
      return ok({ stats: res.data || {} });
    }
    return ok();
  }

  /** 给账号列表补上「在哪个班」，让后台界面和 Edge Function 版本显示一致 */
  async function enrichUsers(rows) {
    try {
      var res = await client.from('class_members').select('student_id, classes:class_id(name, code)');
      var map = {};
      (res.data || []).forEach(function (m) {
        var c = m.classes;
        if (!c) return;
        map[m.student_id] = (map[m.student_id] || []).concat([c.name + '(' + c.code + ')']);
      });
      return rows.map(function (u) {
        var found = map[u.id] || [];
        var all = (u.classes || []).slice();
        found.forEach(function (x) { if (all.indexOf(x) === -1) all.push(x); });
        return Object.assign({}, u, { classes: all });
      });
    } catch (e) {
      return rows.map(function (u) { return Object.assign({}, u, { classes: u.classes || [] }); });
    }
  }

  async function admin(action, payload) {
    if (!enabled || !state.session) return { ok: false, error: '未登录' };
    if (!isAdmin()) return { ok: false, error: '需要管理员权限' };
    var viaFunction = await callAdminFunction(action, payload);
    if (viaFunction !== null) return viaFunction;
    return adminViaRpc(action, payload);
  }

  /* -------------------------------------------------------- 对外接口 */

  function role() { return (state.profile && state.profile.role) || 'guest'; }
  function isAdmin() { return role() === 'admin'; }
  function isTeacher() { return role() === 'teacher' || role() === 'admin'; }

  window.PKBackend = {
    configured: enabled,
    client: client,
    init: init,
    onAuthChange: function (fn) { watchers.push(fn); return function () { watchers = watchers.filter(function (f) { return f !== fn; }); }; },
    session: function () { return state.session; },
    profile: function () { return state.profile; },
    role: role,
    isAdmin: isAdmin,
    isTeacher: isTeacher,
    mustChangePassword: function () { return !!(state.profile && state.profile.must_change_password); },
    recoveryMode: function () { return state.recovery; },
    clearRecovery: function () { state.recovery = false; },
    userEmail: function () { return state.session ? state.session.user.email : ''; },

    signIn: function (l, p) { return toastable(signIn(l, p)); },
    signUpStudent: function (o) { return toastable(signUpStudent(o)); },
    signUpTeacher: function (o) { return toastable(signUpTeacher(o)); },
    signOut: function () { return toastable(signOut()); },
    sendResetEmail: function (l) { return toastable(sendResetEmail(l)); },
    updatePassword: function (p) { return toastable(updatePassword(p)); },
    verifyPassword: function (p) { return toastable(verifyPassword(p)); },
    updateProfileFields: function (f) { return toastable(updateProfileFields(f)); },

    bootstrap: function () { return toastable(bootstrap()); },
    loadPlayerState: loadPlayerState,
    savePlayerState: savePlayerState,

    createClass: function (o) { return toastable(createClass(o)); },
    joinClass: function (s, c) { return toastable(joinClass(s, c)); },
    findClass: function (s, c) { return toastable(findClass(s, c)); },
    classRoster: function (id) { return toastable(classRoster(id)); },
    leaveClass: function (id) { return toastable(leaveClass(id)); },
    archiveClass: function (id) { return toastable(archiveClass(id)); },
    removeClassMember: function (c, s) { return toastable(removeClassMember(c, s)); },

    saveQuestion: function (q) { return toastable(saveQuestion(q)); },
    deleteQuestion: function (id) { return toastable(deleteQuestion(id)); },

    createHomework: function (h) { return toastable(createHomework(h)); },
    setHomeworkStatus: function (id, s) { return toastable(setHomeworkStatus(id, s)); },
    deleteHomework: function (id) { return toastable(deleteHomework(id)); },
    submitHomework: function (s) { return toastable(submitHomework(s)); },

    createAsk: function (a) { return toastable(createAsk(a)); },
    replyAsk: function (id, t) { return toastable(replyAsk(id, t)); },
    deleteAsk: function (id) { return toastable(deleteAsk(id)); },

    recordAnswer: function (o) { return toastable(recordAnswer(o)); },
    myStats: function () { return toastable(myStats()); },
    resolveWrong: function (id) { return toastable(resolveWrong(id)); },
    leaderboard: function (n) { return toastable(leaderboard(n)); },
    recentEvents: function (m) { return toastable(recentEvents(m)); },
    uploadImage: uploadImage,
    healthCheck: function () { return toastable(healthCheck()); },
    admin: admin
  };
})();
