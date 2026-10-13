/*!
 * 汤姆猫跑酷学堂 · 后台管理
 * ---------------------------------------------------------------------------
 *  能做什么：
 *    · 概览：账号 / 班级 / 题目 / 作业 / 近 7 天答题量
 *    · 用户管理：搜索、建号（单个 + 批量）、改角色、停用/启用、重置密码、删除
 *    · 班级管理：查看全部班级、班级码、成员数，解散班级
 *    · 排行与数据：全站榜单，一键导出 CSV
 *    · 审计日志：谁做了什么（重置密码、删号等敏感操作都有记录）
 *
 *  权限有两道锁：
 *    1) 数据库 RLS：只有 admin 角色能读到全站数据
 *    2) Edge Function：建号 / 重置密码 / 改角色 / 删号都在服务端校验管理员身份
 *       （浏览器拿不到 service_role key，所以这些操作前端做不了，必须走服务端）
 */
(function () {
  'use strict';

  var BE = window.PKBackend;
  var root = document.getElementById('adminRoot');
  var view = 'overview';
  var busy = false;

  var cache = {
    overview: null,
    users: [],
    usersTotal: 0,
    page: 1,
    query: '',
    classes: [],
    board: [],
    logs: []
  };

  /* ------------------------------------------------------------------ 工具 */

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return '—'; }
  }

  function toast(msg, kind) {
    var host = document.querySelector('.admin-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'admin-toast-host';
      document.body.appendChild(host);
    }
    var item = document.createElement('div');
    item.className = 'admin-toast' + (kind ? ' ' + kind : '');
    item.textContent = msg;
    host.appendChild(item);
    setTimeout(function () { item.remove(); }, 3600);
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || '已复制', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function randomPassword() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var out = 'pk';
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function csvDownload(filename, rows) {
    var text = rows.map(function (row) {
      return row.map(function (cell) {
        var v = String(cell === null || cell === undefined ? '' : cell);
        return '"' + v.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('已导出 ' + filename, 'ok');
  }

  function modal(html) {
    var back = document.createElement('div');
    back.className = 'admin-modal-backdrop';
    back.innerHTML = '<div class="admin-modal">' + html + '</div>';
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
    Array.prototype.forEach.call(back.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { back.remove(); });
    });
    return back;
  }

  function roleChip(role) {
    var label = role === 'admin' ? '管理员' : role === 'teacher' ? '老师' : '学生';
    return '<span class="chip ' + esc(role) + '">' + label + '</span>';
  }

  /* -------------------------------------------------------------- 登录关卡 */

  function renderGate(opts) {
    opts = opts || {};
    root.innerHTML =
      '<div class="gate-wrap"><div class="gate-card">' +
        '<div class="gate-logo">🛠</div>' +
        '<div class="gate-title">' + (opts.title || '后台管理登录') + '</div>' +
        '<p class="muted" style="font-size:13px;margin-top:8px;line-height:1.8">' + (opts.desc || '请用管理员账号登录。只有角色为「管理员」的账号才能进入后台。') + '</p>' +
        (opts.form
          ? '<div class="form-field" style="margin-top:14px"><label>账号或邮箱</label>' +
              '<input class="input" id="adUser" placeholder="管理员账号"></div>' +
            '<div class="form-field"><label>密码</label>' +
              '<input class="input" id="adPass" type="password" placeholder="密码"></div>' +
            '<div id="adMsg" class="login-msg"></div>' +
            '<button class="btn btn-primary btn-block" id="adLogin" style="margin-top:6px">登录</button>'
          : '') +
        '<a class="btn btn-ghost btn-block" href="index.html" style="margin-top:12px">← 返回学习平台</a>' +
      '</div></div>';

    var msg = root.querySelector('#adMsg');
    var btn = root.querySelector('#adLogin');
    if (!btn) return;
    var doLogin = function () {
      var u = root.querySelector('#adUser').value.trim();
      var p = root.querySelector('#adPass').value;
      if (!u || !p) { msg.innerHTML = '<span class="bad">请填写账号和密码</span>'; return; }
      btn.disabled = true;
      btn.textContent = '登录中…';
      BE.signIn(u, p).then(function (r) {
        btn.disabled = false;
        btn.textContent = '登录';
        if (!r.ok) { msg.innerHTML = '<span class="bad">' + esc(r.error) + '</span>'; return; }
        if (!BE.isAdmin()) {
          renderGate({ title: '没有后台权限', desc: '这个账号不是管理员。请联系管理员把你的角色改成「管理员」。', form: false });
          return;
        }
        startApp();
      });
    };
    btn.addEventListener('click', doLogin);
    root.querySelector('#adPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  }

  /* ---------------------------------------------------------------- 骨架 */

  var NAV = [
    ['overview', '📊', '概览'],
    ['users', '👥', '用户管理'],
    ['classes', '🏫', '班级管理'],
    ['board', '🏆', '排行榜'],
    ['logs', '🧾', '审计日志']
  ];

  function renderShell() {
    var profile = BE.profile() || {};
    root.innerHTML =
      '<div class="admin-layout">' +
        '<aside class="admin-side">' +
          '<div class="admin-brand">' +
            '<div class="admin-brand-mark">🛠</div>' +
            '<div><div class="admin-brand-name">跑酷学堂后台</div>' +
            '<div class="admin-brand-sub">ADMIN CONSOLE</div></div>' +
          '</div>' +
          NAV.map(function (n) {
            return '<button class="admin-nav-btn' + (view === n[0] ? ' on' : '') + '" data-nav="' + n[0] + '">' +
              '<span>' + n[1] + '</span><span>' + n[2] + '</span></button>';
          }).join('') +
          '<div class="admin-side-foot">' +
            '<div class="muted" style="font-size:12px">👤 ' + esc(profile.display_name || '管理员') + '</div>' +
            '<a class="btn btn-ghost btn-sm" href="index.html">返回站点</a>' +
            '<button class="btn btn-ghost btn-sm" id="adSignOut">退出登录</button>' +
          '</div>' +
        '</aside>' +
        '<main class="admin-main" id="adMain"></main>' +
      '</div>';

    Array.prototype.forEach.call(root.querySelectorAll('[data-nav]'), function (b) {
      b.addEventListener('click', function () {
        view = b.getAttribute('data-nav');
        cache.page = 1;
        renderShell();
        renderView();
      });
    });
    root.querySelector('#adSignOut').addEventListener('click', function () {
      BE.signOut().then(function () {
        renderGate({ title: '已退出', desc: '可以换一个管理员账号登录。', form: true });
      });
    });
  }

  function setMain(html) { root.querySelector('#adMain').innerHTML = html; }

  function renderView() {
    if (!root.querySelector('#adMain')) return;
    if (view === 'overview') return renderOverview();
    if (view === 'users') return renderUsers();
    if (view === 'classes') return renderClasses();
    if (view === 'board') return renderBoard();
    if (view === 'logs') return renderLogs();
  }

  function loading(text) {
    setMain('<div class="admin-empty"><div class="spinner" style="margin:0 auto 12px"></div>' + esc(text || '加载中…') + '</div>');
  }

  function viewHead(title, sub, actionsHtml) {
    return '<div class="admin-head"><div><div class="admin-title">' + esc(title) + '</div>' +
      '<div class="admin-sub">' + esc(sub) + '</div></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + (actionsHtml || '') + '</div></div>';
  }

  /* -------------------------------------------------------------- 概览 */

  function renderOverview() {
    loading('正在统计…');
    BE.admin('overview').then(function (r) {
      if (!r.ok) { setMain('<div class="admin-empty">加载失败：' + esc(r.error) + '</div>'); return; }
      var s = r.stats || {};
      var cards = [
        ['users', '账号总数'], ['students', '学生'], ['teachers', '老师'],
        ['disabled', '已停用'], ['classes', '班级'], ['questions', '题目'],
        ['homework', '作业'], ['submissions', '作业提交'], ['answers_7d', '近 7 天答题']
      ];
      var html = viewHead('概览', '全站数据一览', '<button class="btn btn-ghost btn-sm" id="adRefresh">🔄 刷新</button>');
      html += '<div class="admin-stats">' + cards.map(function (c) {
        return '<div class="stat-card"><b>' + (s[c[0]] === undefined ? '—' : s[c[0]]) + '</b><span>' + c[1] + '</span></div>';
      }).join('') + '</div>';
      html += '<div class="table-wrap"><div style="padding:18px">' +
        '<div class="card-title">🔐 安全提示</div>' +
        '<p class="muted" style="font-size:13px;line-height:2">' +
          '· 学生忘记密码 → 在「用户管理」里点「重置密码」，把临时密码给他，他登录后在「账号设置」里改成自己的密码。<br>' +
          '· 老师忘记密码 → 如果注册时用了真实邮箱，可以让他在登录页点「找回密码」自助重置；也可以在这里直接重置。<br>' +
          '· 你可以把某个账号的角色改成「管理员」来授予后台权限，但请只给可信的人。<br>' +
          '· 重置密码、改角色、删号都会记录到「审计日志」。' +
        '</p></div></div>';
      setMain(html);
      var refresh = root.querySelector('#adRefresh');
      if (refresh) refresh.addEventListener('click', renderOverview);
    });
  }

  /* ------------------------------------------------------------ 用户管理 */

  function renderUsers() {
    loading('正在读取账号…');
    BE.admin('list_users', { page: cache.page, per_page: 50 }).then(function (r) {
      if (!r.ok) { setMain('<div class="admin-empty">加载失败：' + esc(r.error) + '</div>'); return; }
      cache.users = r.users || [];
      cache.usersTotal = r.total || cache.users.length;
      var q = cache.query.toLowerCase();
      var rows = cache.users.filter(function (u) {
        if (!q) return true;
        return [u.login_name, u.display_name, u.school, u.email, u.role].join(' ').toLowerCase().indexOf(q) !== -1;
      });

      var html = viewHead('用户管理', '共 ' + cache.usersTotal + ' 个账号，本页 ' + cache.users.length + ' 个',
        '<button class="btn btn-primary btn-sm" id="adNewUser">＋ 新建账号</button>' +
        '<button class="btn btn-ghost btn-sm" id="adBulk">📥 批量建号</button>' +
        '<button class="btn btn-ghost btn-sm" id="adExportUsers">⬇️ 导出 CSV</button>');

      html += '<div class="admin-toolbar">' +
        '<input class="input" id="adQuery" placeholder="搜索账号 / 昵称 / 学校" value="' + esc(cache.query) + '">' +
        '<button class="btn btn-ghost btn-sm" id="adSearch">搜索</button>' +
        ' <span class="muted" style="font-size:12.5px">第 ' + cache.page + ' 页</span>' +
        (cache.page > 1 ? '<button class="btn btn-ghost btn-sm" id="adPrev">上一页</button>' : '') +
        (cache.users.length >= 50 ? '<button class="btn btn-ghost btn-sm" id="adNext">下一页</button>' : '') +
      '</div>';

      html += '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>账号</th><th>昵称</th><th>角色</th><th>学校 / 班级</th><th>状态</th><th>最近登录</th><th>操作</th>' +
        '</tr></thead><tbody>' +
        (rows.length ? rows.map(function (u) {
          return '<tr>' +
            '<td><div style="font-weight:700">' + esc(u.login_name) + '</div>' +
              '<div class="muted mono" style="font-size:11.5px">' + esc(u.email || '') + '</div></td>' +
            '<td>' + esc(u.display_name || '—') + '</td>' +
            '<td>' + roleChip(u.role) + (u.must_change_password ? '<div class="muted" style="font-size:11px;margin-top:4px">待改密码</div>' : '') + '</td>' +
            '<td>' + esc(u.school || '—') + (u.classes && u.classes.length ? '<div class="muted" style="font-size:11.5px">' + esc(u.classes.join('、')) + '</div>' : '') + '</td>' +
            '<td>' + (u.status === 'disabled' ? '<span class="chip off">已停用</span>' : '<span class="chip muted-chip">正常</span>') + '</td>' +
            '<td class="muted" style="font-size:12px">' + fmtTime(u.last_sign_in_at) + '</td>' +
            '<td><div class="cell-actions">' +
              '<button class="btn btn-ghost btn-sm" data-act="reset" data-id="' + esc(u.id) + '">重置密码</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="role" data-id="' + esc(u.id) + '">改角色</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="status" data-id="' + esc(u.id) + '">' + (u.status === 'disabled' ? '启用' : '停用') + '</button>' +
              '<button class="btn btn-danger-ghost btn-sm" data-act="delete" data-id="' + esc(u.id) + '">删除</button>' +
            '</div></td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="7"><div class="admin-empty">没有匹配的账号</div></td></tr>') +
        '</tbody></table></div>';

      setMain(html);
      bindUsers();
    });
  }

  function bindUsers() {
    var byId = {};
    cache.users.forEach(function (u) { byId[u.id] = u; });

    var queryInput = root.querySelector('#adQuery');
    var search = function () { cache.query = queryInput.value.trim(); renderUsers(); };
    root.querySelector('#adSearch').addEventListener('click', search);
    queryInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });

    var prev = root.querySelector('#adPrev');
    if (prev) prev.addEventListener('click', function () { cache.page = Math.max(1, cache.page - 1); renderUsers(); });
    var next = root.querySelector('#adNext');
    if (next) next.addEventListener('click', function () { cache.page += 1; renderUsers(); });

    root.querySelector('#adNewUser').addEventListener('click', openCreateUser);
    root.querySelector('#adBulk').addEventListener('click', openBulkCreate);
    root.querySelector('#adExportUsers').addEventListener('click', function () {
      csvDownload('账号列表.csv', [['账号', '邮箱', '昵称', '角色', '学校', '班级', '状态', '最近登录', '创建时间']]
        .concat(cache.users.map(function (u) {
          return [u.login_name, u.email, u.display_name, u.role, u.school, (u.classes || []).join('、'),
            u.status === 'disabled' ? '已停用' : '正常', fmtTime(u.last_sign_in_at), fmtTime(u.created_at)];
        })));
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-act]'), function (btn) {
      var u = byId[btn.getAttribute('data-id')];
      if (!u) return;
      var act = btn.getAttribute('data-act');
      btn.addEventListener('click', function () {
        if (busy) return;
        if (act === 'reset') doResetPassword(u);
        else if (act === 'role') openRolePicker(u);
        else if (act === 'status') doSetStatus(u, u.status === 'disabled' ? 'active' : 'disabled');
        else if (act === 'delete') doDeleteUser(u);
      });
    });
  }

  function openRolePicker(u) {
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">改角色 · ' + esc(u.login_name) + '</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted" style="font-size:13px;line-height:1.9;margin-top:10px">' +
        '<b>学生</b>：只能答题、交作业、看本班/本校榜单。<br>' +
        '<b>老师</b>：可以建班级、发作业、出题、看自己班的学情。<br>' +
        '<b>管理员</b>：额外拥有这个后台的全部权限，请只授予可信的人。</p>' +
      '<div class="row" style="gap:10px;margin-top:14px;flex-wrap:wrap">' +
        ['student', 'teacher', 'admin'].map(function (r) {
          return '<button class="btn ' + (u.role === r ? 'btn-teacher' : 'btn-ghost') + '" data-role="' + r + '">' +
            (r === 'admin' ? '管理员' : r === 'teacher' ? '老师' : '学生') + '</button>';
        }).join('') +
      '</div>');
    Array.prototype.forEach.call(back.querySelectorAll('[data-role]'), function (b) {
      b.addEventListener('click', function () {
        var role = b.getAttribute('data-role');
        if (role === u.role) { back.remove(); return; }
        busy = true;
        BE.admin('set_role', { user_id: u.id, role: role }).then(function (r) {
          busy = false;
          if (!r.ok) { toast(r.error, 'bad'); return; }
          toast('已把 ' + u.login_name + ' 改成「' + (role === 'admin' ? '管理员' : role === 'teacher' ? '老师' : '学生') + '」', 'ok');
          back.remove();
          renderUsers();
        });
      });
    });
  }

  function doSetStatus(u, status) {
    busy = true;
    BE.admin('set_status', { user_id: u.id, status: status }).then(function (r) {
      busy = false;
      if (!r.ok) { toast(r.error, 'bad'); return; }
      toast(status === 'disabled' ? '已停用 ' + u.login_name : '已恢复 ' + u.login_name, 'ok');
      renderUsers();
    });
  }

  function doResetPassword(u) {
    var pwd = randomPassword();
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">重置密码 · ' + esc(u.login_name) + '</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted" style="font-size:13px;line-height:1.9;margin-top:10px">' +
        '下面是为这个账号生成的临时密码。点「确认重置」后，对方就能用它登录，' +
        '登录后系统会提示他到「账号设置」里改成自己的密码。</p>' +
      '<div class="pwd-box" id="adPwd">' + esc(pwd) + '</div>' +
      '<div class="row" style="gap:10px">' +
        '<button class="btn btn-ghost grow" id="adPwdCopy">📋 复制密码</button>' +
        '<button class="btn btn-primary grow" id="adPwdOk">确认重置</button>' +
      '</div>' +
      '<p class="muted" style="font-size:12px;margin-top:10px">忘记密码的学生也可以自己改：登录后 →「账号设置」→ 修改密码。</p>');
    back.querySelector('#adPwdCopy').addEventListener('click', function () { copyText(pwd, '临时密码已复制'); });
    back.querySelector('#adPwdOk').addEventListener('click', function () {
      var btn = back.querySelector('#adPwdOk');
      btn.disabled = true;
      btn.textContent = '重置中…';
      BE.admin('reset_password', { user_id: u.id, password: pwd }).then(function (r) {
        btn.disabled = false;
        btn.textContent = '确认重置';
        if (!r.ok) { toast(r.error, 'bad'); return; }
        toast('已重置，请把临时密码告诉 ' + (u.display_name || u.login_name), 'ok');
        back.remove();
        renderUsers();
      });
    });
  }

  function doDeleteUser(u) {
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">删除账号</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p style="font-size:13.5px;line-height:1.9;margin-top:10px">' +
        '确定要删除 <b>' + esc(u.display_name || u.login_name) + '</b>（' + esc(u.login_name) + '）吗？<br>' +
        '<span class="muted">这个账号的积分、错题、作业提交、提问都会被一起删除，且无法恢复。' +
        '如果只是暂时不用，建议改成「停用」。</span></p>' +
      '<div class="row" style="gap:10px;margin-top:14px">' +
        '<button class="btn btn-ghost grow" data-close>取消</button>' +
        '<button class="btn btn-primary grow" id="adDelOk" style="background:linear-gradient(135deg,#f4706c,var(--danger))">确认删除</button>' +
      '</div>');
    back.querySelector('#adDelOk').addEventListener('click', function () {
      var btn = back.querySelector('#adDelOk');
      btn.disabled = true;
      btn.textContent = '删除中…';
      BE.admin('delete_user', { user_id: u.id }).then(function (r) {
        btn.disabled = false;
        btn.textContent = '确认删除';
        if (!r.ok) { toast(r.error, 'bad'); return; }
        toast('已删除 ' + u.login_name, 'ok');
        back.remove();
        renderUsers();
      });
    });
  }

  function openCreateUser() {
    var pwd = randomPassword();
    var classOptions = ['<option value="">（不加入班级）</option>'].concat(
      cache.classes.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + ' · ' + esc(c.code) + ' · ' + esc(c.school) + '</option>';
      })).join('');
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">新建账号</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:8px">学生没有邮箱也能建号，他会用下面的「账号 + 临时密码」登录。</p>' +
      '<div class="form-field"><label>账号（登录用）</label><input class="input" id="nuUser" placeholder="例如 xiaoming"></div>' +
      '<div class="form-field"><label>昵称</label><input class="input" id="nuName" placeholder="例如 小明"></div>' +
      '<div class="form-field"><label>学校</label><input class="input" id="nuSchool" placeholder="例如 阳光小学"></div>' +
      '<div class="form-field"><label>角色</label><select class="select" id="nuRole">' +
        '<option value="student">学生</option><option value="teacher">老师</option><option value="admin">管理员</option>' +
      '</select></div>' +
      '<div class="form-field"><label>加入班级（可选）</label><select class="select" id="nuClass">' + classOptions + '</select></div>' +
      '<div class="form-field"><label>初始密码</label><input class="input" id="nuPass" value="' + esc(pwd) + '"></div>' +
      '<div id="nuMsg" class="login-msg"></div>' +
      '<button class="btn btn-primary btn-block" id="nuOk">创建账号</button>');

    back.querySelector('#nuOk').addEventListener('click', function () {
      var btn = back.querySelector('#nuOk');
      var user = back.querySelector('#nuUser').value.trim();
      var name = back.querySelector('#nuName').value.trim();
      var school = back.querySelector('#nuSchool').value.trim();
      var pass = back.querySelector('#nuPass').value.trim();
      var msg = back.querySelector('#nuMsg');
      if (!user) { msg.innerHTML = '<span class="bad">请填写账号</span>'; return; }
      if (pass.length < 6) { msg.innerHTML = '<span class="bad">密码至少 6 位</span>'; return; }
      btn.disabled = true;
      btn.textContent = '创建中…';
      BE.admin('create_user', {
        login_name: user, password: pass, display_name: name || user, school: school,
        role: back.querySelector('#nuRole').value,
        class_id: back.querySelector('#nuClass').value || null
      }).then(function (r) {
        btn.disabled = false;
        btn.textContent = '创建账号';
        if (!r.ok || (r.failed && r.failed.length)) {
          var err = r.error || (r.failed[0] && r.failed[0].error) || '创建失败';
          msg.innerHTML = '<span class="bad">' + esc(err) + '</span>';
          return;
        }
        back.remove();
        modal(
          '<div class="row between"><div class="card-title" style="margin:0">账号已创建 ✅</div>' +
          '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
          '<p class="muted" style="font-size:13px;margin-top:10px">把这个账号和密码发给学生，他登录后可自行修改密码。</p>' +
          '<div class="pwd-box">' + esc(user) + ' / ' + esc(pass) + '</div>' +
          '<button class="btn btn-ghost btn-block" id="nuCopy">📋 复制账号密码</button>');
        document.querySelector('#nuCopy').addEventListener('click', function () { copyText(user + ' / ' + pass, '账号密码已复制'); });
        renderUsers();
      });
    });
  }

  function openBulkCreate() {
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">批量建号</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:8px;line-height:1.9">' +
        '每行一个学生，格式：<b>账号,昵称,学校,班级码</b><br>' +
        '后面两项可以省略；密码会自动生成，创建完可以导出 CSV 发给学生。</p>' +
      '<div class="form-field"><textarea class="textarea" id="bulkText" rows="8" placeholder="xiaoming,小明,阳光小学,2043&#10;xiaohong,小红,阳光小学,2043"></textarea></div>' +
      '<div class="form-field"><label>统一初始密码（留空则自动生成）</label><input class="input" id="bulkPass" placeholder="例如 pk123456"></div>' +
      '<div id="bulkMsg" class="login-msg"></div>' +
      '<button class="btn btn-primary btn-block" id="bulkOk">开始创建</button>');

    back.querySelector('#bulkOk').addEventListener('click', function () {
      var btn = back.querySelector('#bulkOk');
      var msg = back.querySelector('#bulkMsg');
      var shared = back.querySelector('#bulkPass').value.trim();
      var lines = back.querySelector('#bulkText').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { msg.innerHTML = '<span class="bad">请至少填一行</span>'; return; }

      var byCode = {};
      cache.classes.forEach(function (c) { byCode[c.code] = c.id; });

      var list = lines.map(function (line) {
        var parts = line.split(',').map(function (s) { return s.trim(); });
        return {
          login_name: parts[0] || '',
          display_name: parts[1] || parts[0] || '',
          school: parts[2] || '',
          password: shared || randomPassword(),
          role: 'student',
          class_id: parts[3] ? (byCode[parts[3]] || null) : null
        };
      }).filter(function (x) { return x.login_name; });

      btn.disabled = true;
      btn.textContent = '创建中…';
      BE.admin('bulk_create_users', { users: list }).then(function (r) {
        btn.disabled = false;
        btn.textContent = '开始创建';
        if (!r.ok) { msg.innerHTML = '<span class="bad">' + esc(r.error) + '</span>'; return; }
        var created = r.created || [];
        var failed = r.failed || [];
        back.remove();
        toast('成功 ' + created.length + ' 个' + (failed.length ? '，失败 ' + failed.length + ' 个' : ''), failed.length ? 'bad' : 'ok');
        if (created.length) {
          csvDownload('新账号.csv', [['账号', '密码', '昵称', '学校']]
            .concat(created.map(function (c, i) {
              return [c.login_name, c.password, list[i] ? list[i].display_name : '', list[i] ? list[i].school : ''];
            })));
        }
        if (failed.length) {
          modal('<div class="row between"><div class="card-title" style="margin:0">失败的账号</div>' +
            '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
            '<div class="table-wrap" style="margin-top:12px"><table class="admin-table"><thead><tr><th>账号</th><th>原因</th></tr></thead><tbody>' +
            failed.map(function (f) { return '<tr><td>' + esc(f.login_name) + '</td><td>' + esc(f.error) + '</td></tr>'; }).join('') +
            '</tbody></table></div>');
        }
        renderUsers();
      });
    });
  }

  /* ------------------------------------------------------------ 班级管理 */

  function renderClasses() {
    loading('正在读取班级…');
    var client = BE.client;
    Promise.all([
      client.from('classes').select('*').eq('archived', false).order('created_at', { ascending: false }),
      client.from('class_members').select('class_id')
    ]).then(function (res) {
      var classes = res[0].data || [];
      var members = res[1].data || [];
      var counts = {};
      members.forEach(function (m) { counts[m.class_id] = (counts[m.class_id] || 0) + 1; });
      cache.classes = classes.map(function (c) { return Object.assign({}, c, { _count: counts[c.id] || 0 }); });

      var html = viewHead('班级管理', '共 ' + classes.length + ' 个班级',
        '<button class="btn btn-ghost btn-sm" id="adExportClasses">⬇️ 导出 CSV</button>');
      html += '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>班级</th><th>班级码</th><th>学校</th><th>年级</th><th>老师</th><th>学生数</th><th>创建时间</th><th>操作</th>' +
        '</tr></thead><tbody>' +
        (classes.length ? cache.classes.map(function (c) {
          return '<tr>' +
            '<td style="font-weight:700">' + esc(c.name) + '</td>' +
            '<td><span class="mono" style="font-weight:800;color:var(--primary)">' + esc(c.code) + '</span></td>' +
            '<td>' + esc(c.school) + '</td>' +
            '<td>' + esc(c.grade_label || '未识别') + '</td>' +
            '<td>' + esc(c.teacher_name || '—') + '</td>' +
            '<td>' + c._count + ' 人</td>' +
            '<td class="muted" style="font-size:12px">' + fmtTime(c.created_at) + '</td>' +
            '<td><div class="cell-actions">' +
              '<button class="btn btn-ghost btn-sm" data-cid="' + esc(c.id) + '" data-one="members">看成员</button>' +
              '<button class="btn btn-danger-ghost btn-sm" data-cid="' + esc(c.id) + '" data-one="archive">解散</button>' +
            '</div></td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="8"><div class="admin-empty">还没有班级</div></td></tr>') +
        '</tbody></table></div>';
      setMain(html);

      root.querySelector('#adExportClasses').addEventListener('click', function () {
        csvDownload('班级列表.csv', [['班级', '班级码', '学校', '年级', '老师', '学生数', '创建时间']]
          .concat(cache.classes.map(function (c) {
            return [c.name, c.code, c.school, c.grade_label || '', c.teacher_name || '', c._count, fmtTime(c.created_at)];
          })));
      });

      Array.prototype.forEach.call(root.querySelectorAll('[data-one]'), function (btn) {
        var id = btn.getAttribute('data-cid');
        var cls = cache.classes.filter(function (c) { return c.id === id; })[0];
        btn.addEventListener('click', function () {
          if (!cls) return;
          if (btn.getAttribute('data-one') === 'members') showMembers(cls);
          else archiveClass(cls);
        });
      });
    });
  }

  function showMembers(cls) {
    var client = BE.client;
    client.from('class_members')
      .select('joined_at, profiles:student_id(display_name, login_name, emoji, status)')
      .eq('class_id', cls.id).then(function (res) {
        var rows = (res.data || []).filter(function (r) { return r.profiles; });
        modal(
          '<div class="row between"><div class="card-title" style="margin:0">' + esc(cls.name) + ' · 成员 ' + rows.length + ' 人</div>' +
          '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
          (rows.length
            ? '<div class="table-wrap" style="margin-top:12px"><table class="admin-table"><thead><tr><th>学生</th><th>账号</th><th>状态</th><th>加入时间</th></tr></thead><tbody>' +
              rows.map(function (r) {
                return '<tr><td>' + esc((r.profiles.emoji || '') + ' ' + (r.profiles.display_name || '')) + '</td>' +
                  '<td class="mono">' + esc(r.profiles.login_name || '') + '</td>' +
                  '<td>' + (r.profiles.status === 'disabled' ? '<span class="chip off">已停用</span>' : '<span class="chip muted-chip">正常</span>') + '</td>' +
                  '<td class="muted" style="font-size:12px">' + fmtTime(r.joined_at) + '</td></tr>';
              }).join('') + '</tbody></table></div>'
            : '<div class="admin-empty">这个班还没有学生加入</div>'));
      });
  }

  function archiveClass(cls) {
    var back = modal(
      '<div class="row between"><div class="card-title" style="margin:0">解散班级</div>' +
      '<button class="btn btn-ghost btn-sm" data-close>关闭</button></div>' +
      '<p style="font-size:13.5px;line-height:1.9;margin-top:10px">确定解散 <b>' + esc(cls.name) + '</b>（' + esc(cls.code) + '）吗？<br>' +
      '<span class="muted">解散后学生不能再加入，榜单也不再统计这个班。已有的答题记录会保留。</span></p>' +
      '<div class="row" style="gap:10px;margin-top:14px">' +
        '<button class="btn btn-ghost grow" data-close>取消</button>' +
        '<button class="btn btn-primary grow" id="adArcOk" style="background:linear-gradient(135deg,#f4706c,var(--danger))">确认解散</button>' +
      '</div>');
    back.querySelector('#adArcOk').addEventListener('click', function () {
      BE.client.from('classes').update({ archived: true }).eq('id', cls.id).then(function (res) {
        if (res.error) { toast(res.error.message, 'bad'); return; }
        toast('已解散 ' + cls.name, 'ok');
        back.remove();
        renderClasses();
      });
    });
  }

  /* -------------------------------------------------------------- 排行榜 */

  function renderBoard() {
    loading('正在统计榜单…');
    BE.admin('leaderboard', { limit: 200 }).then(function (r) {
      if (!r.ok) { setMain('<div class="admin-empty">加载失败：' + esc(r.error) + '</div>'); return; }
      cache.board = r.rows || [];
      var html = viewHead('排行榜', '按总积分排序，最多显示 200 人',
        '<button class="btn btn-ghost btn-sm" id="adExportBoard">⬇️ 导出 CSV</button>');
      var rank = 0;
      html += '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>#</th><th>学生</th><th>班级</th><th>学校</th><th>今日</th><th>本周</th><th>总分</th><th>正确率</th><th>连对</th>' +
        '</tr></thead><tbody>' +
        (cache.board.length ? cache.board.map(function (row) {
          rank += 1;
          var rate = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
          return '<tr>' +
            '<td style="font-weight:800">' + rank + '</td>' +
            '<td>' + esc((row.emoji || '') + ' ' + (row.name || '')) + '</td>' +
            '<td>' + esc(row.class_name || '—') + '</td>' +
            '<td>' + esc(row.school || '—') + '</td>' +
            '<td>' + (row.points_today || 0) + '</td>' +
            '<td>' + (row.points_week || 0) + '</td>' +
            '<td style="font-weight:800;color:var(--primary)">' + (row.points_total || 0) + '</td>' +
            '<td>' + rate + '%</td>' +
            '<td>' + (row.streak || 0) + '</td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="9"><div class="admin-empty">还没有学生答题</div></td></tr>') +
        '</tbody></table></div>';
      setMain(html);
      root.querySelector('#adExportBoard').addEventListener('click', function () {
        csvDownload('排行榜.csv', [['名次', '学生', '班级', '学校', '今日', '本周', '总分', '答题数', '正确率']]
          .concat(cache.board.map(function (row, i) {
            var rate = row.answered ? Math.round((row.correct / row.answered) * 100) + '%' : '—';
            return [i + 1, row.name, row.class_name || '', row.school || '', row.points_today || 0, row.points_week || 0, row.points_total || 0, row.answered || 0, rate];
          })));
      });
    });
  }

  /* ------------------------------------------------------------ 审计日志 */

  function renderLogs() {
    loading('正在读取日志…');
    BE.client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(150).then(function (res) {
      if (res.error) { setMain('<div class="admin-empty">加载失败：' + esc(res.error.message) + '</div>'); return; }
      cache.logs = res.data || [];
      var LABEL = {
        create_user: '新建账号', reset_password: '重置密码', set_role: '修改角色',
        set_status: '启用/停用', delete_user: '删除账号'
      };
      var html = viewHead('审计日志', '最近 150 条敏感操作记录',
        '<button class="btn btn-ghost btn-sm" id="adRefreshLogs">🔄 刷新</button>');
      html += '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th>' +
        '</tr></thead><tbody>' +
        (cache.logs.length ? cache.logs.map(function (l) {
          return '<tr>' +
            '<td class="muted" style="font-size:12px;white-space:nowrap">' + fmtTime(l.created_at) + '</td>' +
            '<td>' + esc(l.actor_name || '—') + '</td>' +
            '<td><span class="chip teacher">' + esc(LABEL[l.action] || l.action) + '</span></td>' +
            '<td class="mono" style="font-size:12px">' + esc(l.target || '—') + '</td>' +
            '<td class="muted" style="font-size:12px">' + esc(JSON.stringify(l.detail || {})) + '</td>' +
          '</tr>';
        }).join('') : '<tr><td colspan="5"><div class="admin-empty">还没有操作记录</div></td></tr>') +
        '</tbody></table></div>';
      setMain(html);
      root.querySelector('#adRefreshLogs').addEventListener('click', renderLogs);
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function startApp() {
    view = 'overview';
    // 先把班级列表拉下来，"新建账号"时可以选班级
    BE.client.from('classes').select('id, name, code, school').eq('archived', false).then(function (res) {
      cache.classes = res.data || [];
    });
    renderShell();
    renderView();
  }

  if (!BE || !BE.configured) {
    renderGate({
      title: '还没有配置后端',
      desc: '请先在 config.js 里填入 Supabase 的 url 与 anonKey，后台管理才能使用。',
      form: false
    });
    return;
  }

  BE.init().then(function () {
    if (!BE.session()) {
      renderGate({ title: '后台管理登录', desc: '请用管理员账号登录。', form: true });
      return;
    }
    if (!BE.isAdmin()) {
      renderGate({
        title: '没有后台权限',
        desc: '当前登录的账号不是管理员。请让管理员在「用户管理」里把你的角色改成「管理员」，或用管理员账号登录。',
        form: false
      });
      return;
    }
    startApp();
  });

  // 会话变化（在别处登录 / 退出 / 登录过期）时，后台界面跟着切换
  if (BE.onAuthChange) {
    BE.onAuthChange(function () {
      if (!BE.session()) {
        if (!document.querySelector('#adUser')) {
          renderGate({ title: '已退出', desc: '请用管理员账号重新登录。', form: true });
        }
        return;
      }
      if (!BE.isAdmin()) {
        renderGate({
          title: '没有后台权限',
          desc: '当前登录的账号不是管理员。请让管理员在「用户管理」里把你的角色改成「管理员」，或用管理员账号登录。',
          form: false
        });
        return;
      }
      if (!document.querySelector('.admin-layout')) startApp();
    });
  }
})();
