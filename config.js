/*!
 * 汤姆猫跑酷学堂 · 后端配置
 * ---------------------------------------------------------------------------
 *  把下面两项换成你自己 Supabase 项目的值（项目 → Settings → API）：
 *
 *    url     = Project URL      形如 https://abcdefghijklmn.supabase.co
 *    anonKey = anon public key  这一段可以放在前端，它靠 RLS 保护数据
 *
 *  注意：service_role key 是最高权限密钥，绝对不能写进这个文件，
 *        它只放在 Supabase Edge Function 的环境变量里（部署时自动注入）。
 *
 *  两项都留空时，网站会自动退回「单机演示模式」：能玩、能看界面，
 *  但账号和数据只存在本机浏览器里。
 */
window.PK_SUPABASE = {
  url: 'https://vntvggaphbnfhufllhxf.supabase.co',
  anonKey: 'sb_publishable_vYpBTU4fHmVTOfqksC2daw_cRoScUTL',

  // 学生没有邮箱，用「用户名 + 密码」登录，内部自动映射成这个域名下的邮箱。
  // 保持默认即可，除非你打算改 schema.sql 里的同名配置。
  studentEmailDomain: 'pk-academy.local',

  // 是否允许老师自己在登录页注册（用真实邮箱）。若学校要求管理员统一开号，改成 false。
  allowTeacherSelfSignup: true,

  // 密码重置邮件点击后回到哪个地址（一般就是你的站点首页）。
  // 留空则自动使用当前站点地址。
  resetRedirect: ''
};
