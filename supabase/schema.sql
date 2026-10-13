-- ============================================================================
--  汤姆猫跑酷学堂 · 完整版后端 Schema（Supabase / PostgreSQL）
-- ----------------------------------------------------------------------------
--  在 Supabase 控制台 → SQL Editor 里整份粘贴执行一次即可。
--  执行完成后再按「部署指南.md」把 config.js 填上项目地址与 anon key。
--
--  设计要点：
--   1. auth.users 负责“账号 + 密码 + 密码重置”，public.profiles 负责“身份 + 角色”。
--   2. 所有读写都受 RLS（行级安全）约束，越权拿不到数据，前端改不了自己的角色。
--   3. 积分、答题、错题、作业、提问全部落库，换设备登录数据跟着人走。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 扩展
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. 身份档案
--    role 三档：student 学生 / teacher 老师 / admin 管理员
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  role                  text not null default 'student' check (role in ('student','teacher','admin')),
  display_name          text not null default '同学',
  emoji                 text not null default '🐱',
  school                text not null default '',
  grade_key             text not null default '',
  grade_label           text not null default '',
  login_name            text not null default '',      -- 登录用的用户名（学生为用户名，老师可为邮箱）
  must_change_password  boolean not null default false, -- 被老师重置过密码后置 true
  status                text not null default 'active' check (status in ('active','disabled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists profiles_school_idx on public.profiles (school);
create index if not exists profiles_role_idx   on public.profiles (role);
create unique index if not exists profiles_login_name_key
  on public.profiles (lower(login_name)) where login_name <> '';

-- 仅本人可读的游戏存档（金币 / 伙伴 / 家园 / 装备 / 聊天记录），别人看不到
create table if not exists public.player_state (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. 班级
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null,                       -- 4 位班级码
  school        text not null default '',
  grade_key     text not null default '',
  grade_label   text not null default '',
  stage         text not null default '',
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  teacher_name  text not null default '',
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- 同一所学校内班级码唯一
create unique index if not exists classes_school_code_key
  on public.classes (lower(school), code) where archived = false;
create index if not exists classes_teacher_idx on public.classes (teacher_id);

create table if not exists public.class_members (
  class_id    uuid not null references public.classes(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (class_id, student_id)
);

create index if not exists class_members_student_idx on public.class_members (student_id);

-- ---------------------------------------------------------------------------
-- 3. 题库
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles(id) on delete set null,
  owner_name  text not null default '',
  subject     text not null default 'math',
  difficulty  text not null default 'basic',
  kind        text not null default 'choice',        -- choice / judge / fill ...
  stem        text not null,
  options     jsonb not null default '[]'::jsonb,
  answer      jsonb,                                 -- 下标 / 布尔 / 文本，按题型
  explain     text not null default '',
  image_url   text not null default '',
  extra       jsonb not null default '{}'::jsonb,      -- 章节 / 可接受答案 / 参考资料链接等
  visibility  text not null default 'school' check (visibility in ('private','school','public')),
  deleted     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists questions_owner_idx   on public.questions (owner_id);
create index if not exists questions_subject_idx on public.questions (subject);

-- ---------------------------------------------------------------------------
-- 4. 作业与提交
-- ---------------------------------------------------------------------------
create table if not exists public.homework (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  status      text not null default 'open' check (status in ('open','closed')),
  due_at      timestamptz,
  extra       jsonb not null default '{}'::jsonb,      -- 说明 / 配图 / 参考资料链接
  created_at  timestamptz not null default now()
);

create index if not exists homework_class_idx on public.homework (class_id);

create table if not exists public.homework_questions (
  homework_id uuid not null references public.homework(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  ord         int  not null default 0,
  primary key (homework_id, question_id)
);

create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  homework_id    uuid not null references public.homework(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  student_name   text not null default '',
  victory        boolean not null default false,
  score          int not null default 0,
  correct_count  int not null default 0,
  total          int not null default 0,
  answers        jsonb not null default '[]'::jsonb,
  submitted_at   timestamptz not null default now(),
  unique (homework_id, student_id)
);

create index if not exists submissions_student_idx on public.submissions (student_id);

-- ---------------------------------------------------------------------------
-- 5. 答题流水 / 积分 / 错题本
-- ---------------------------------------------------------------------------
create table if not exists public.answer_events (
  id          bigserial primary key,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  question_id uuid,
  subject     text not null default 'math',
  correct     boolean not null default false,
  points      int not null default 0,
  source      text not null default 'game',           -- game / homework / wrongbook
  created_at  timestamptz not null default now()
);

create index if not exists answer_events_student_time_idx on public.answer_events (student_id, created_at desc);
create index if not exists answer_events_time_idx on public.answer_events (created_at desc);
create index if not exists answer_events_question_idx on public.answer_events (question_id);

alter table public.answer_events drop constraint if exists answer_events_points_sane;
alter table public.answer_events add constraint answer_events_points_sane
  check (points >= 0 and points <= 80);

-- 触发器维护的汇总（榜单查询不用每次扫全表）
create table if not exists public.player_stats (
  student_id   uuid primary key references public.profiles(id) on delete cascade,
  points_total int not null default 0,
  answered     int not null default 0,
  correct      int not null default 0,
  streak       int not null default 0,
  best_streak  int not null default 0,
  updated_at   timestamptz not null default now()
);

-- 按天累计（“今日积分 / 本周积分”）
create table if not exists public.player_daily (
  student_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  points     int not null default 0,
  answered   int not null default 0,
  correct    int not null default 0,
  primary key (student_id, day)
);

create index if not exists player_daily_day_idx on public.player_daily (day);

-- 按「科目 + 天」累计（榜单切到某一科时要显示真实分数，不能用估算值）
create table if not exists public.player_subject_daily (
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject    text not null,
  day        date not null,
  points     int not null default 0,
  answered   int not null default 0,
  correct    int not null default 0,
  primary key (student_id, subject, day)
);

create index if not exists player_subject_daily_day_idx on public.player_subject_daily (day);

create table if not exists public.wrong_book (
  student_id     uuid not null references public.profiles(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  wrong_count    int not null default 1,
  first_wrong_at timestamptz not null default now(),
  last_wrong_at  timestamptz not null default now(),
  resolved_at    timestamptz,
  primary key (student_id, question_id)
);

create index if not exists wrong_book_student_idx on public.wrong_book (student_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- 6. 学生提问 / 老师回复
-- ---------------------------------------------------------------------------
create table if not exists public.asks (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  student_name text not null default '',
  student_emoji text not null default '🙂',
  class_id     uuid references public.classes(id) on delete set null,
  teacher_id   uuid references public.profiles(id) on delete set null,
  text         text not null default '',
  image_url    text not null default '',
  status       text not null default 'pending' check (status in ('pending','answered','closed')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);

create index if not exists asks_class_idx   on public.asks (class_id, created_at desc);
create index if not exists asks_student_idx on public.asks (student_id, created_at desc);

create table if not exists public.ask_replies (
  id         uuid primary key default gen_random_uuid(),
  ask_id     uuid not null references public.asks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '',
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists ask_replies_ask_idx on public.ask_replies (ask_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. 管理员操作审计
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigserial primary key,
  actor_id   uuid,
  actor_name text not null default '',
  action     text not null,
  target     text not null default '',
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. 权限判定辅助函数（security definer，避免 RLS 递归）
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin' and p.status = 'active')
$$;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('teacher','admin') and p.status = 'active')
$$;

create or replace function public.my_school()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select p.school from public.profiles p where p.id = auth.uid()), '')
$$;

create or replace function public.teaches_class(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.classes c where c.id = cid and c.teacher_id = auth.uid())
$$;

create or replace function public.in_class(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.class_members m where m.class_id = cid and m.student_id = auth.uid())
$$;

-- 是不是我班上的学生（老师看学情用）
create or replace function public.is_my_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists(
    select 1 from public.class_members m
    join public.classes c on c.id = m.class_id
    where m.student_id = sid and c.teacher_id = auth.uid())
$$;

-- 同班同学（榜单里能看到彼此）
create or replace function public.shares_class_with(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.class_members a
    join public.class_members b on b.class_id = a.class_id
    where a.student_id = auth.uid() and b.student_id = sid)
$$;

-- 学生凭「学校 + 班级码」查班级（不暴露其它班级名单）
create or replace function public.find_class(p_school text, p_code text)
returns table (id uuid, name text, code text, school text, grade_key text, grade_label text,
               teacher_name text, students bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.code, c.school, c.grade_key, c.grade_label, c.teacher_name,
         (select count(*) from public.class_members m where m.class_id = c.id)
  from public.classes c
  where c.archived = false
    and c.code = p_code
    and lower(c.school) = lower(coalesce(p_school, ''))
$$;

-- 学生加入班级（只能加“学校 + 班级码”对得上的班）
create or replace function public.join_class(p_school text, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select c.id into cid from public.classes c
   where c.archived = false and c.code = p_code
     and lower(c.school) = lower(coalesce(p_school, ''))
   limit 1;
  if cid is null then raise exception 'class not found'; end if;
  insert into public.class_members (class_id, student_id)
  values (cid, auth.uid())
  on conflict do nothing;
  update public.profiles p set school = p_school,
         grade_key = coalesce(nullif((select c.grade_key from public.classes c where c.id = cid), ''), p.grade_key),
         grade_label = coalesce(nullif((select c.grade_label from public.classes c where c.id = cid), ''), p.grade_label),
         updated_at = now()
   where p.id = auth.uid();
  return cid;
end $$;

-- 老师生成不重复的 4 位班级码
create or replace function public.gen_class_code(p_school text)
returns text language plpgsql security definer set search_path = public as $$
declare
  candidate text;
  i int := 0;
begin
  loop
    i := i + 1;
    candidate := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.classes c
                          where c.code = candidate and lower(c.school) = lower(coalesce(p_school,''))
                            and c.archived = false);
    if i > 200 then raise exception 'cannot allocate class code'; end if;
  end loop;
  return candidate;
end $$;

-- ---------------------------------------------------------------------------
-- 9. 通用触发器
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 关键：不允许用户自己改角色 / 改状态 / 改 must_change_password
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.must_change_password is distinct from old.must_change_password then
    raise exception 'not allowed to change privileged fields';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- 新用户注册后自动建档
-- 安全要点：只有服务端（service_role，例如管理后台的 Edge Function）才能指定角色，
--          普通用户自助注册拿到的永远是 student，避免有人把 role 写成 admin。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_trusted boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  insert into public.profiles (id, role, display_name, emoji, school, grade_key, grade_label, login_name)
  values (
    new.id,
    case
      when is_trusted and meta->>'role' in ('student','teacher','admin') then meta->>'role'
      when not is_trusted and meta->>'role' = 'teacher' then 'teacher'   -- 老师可自助注册（用真实邮箱）
      else 'student'
    end,
    coalesce(nullif(meta->>'display_name',''), '同学'),
    coalesce(nullif(meta->>'emoji',''), '🐱'),
    coalesce(meta->>'school',''),
    coalesce(meta->>'grade_key',''),
    coalesce(meta->>'grade_label',''),
    coalesce(meta->>'login_name', split_part(coalesce(new.email,''), '@', 1))
  )
  on conflict (id) do nothing;
  insert into public.player_state (user_id) values (new.id) on conflict do nothing;
  insert into public.player_stats (student_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 答题流水 → 自动累计积分/连对/每日成绩
-- 先定分：答错一律 0 分，答对单题最多 80 分。
-- 这样即使有人绕过前端直接调接口伪造流水，也刷不出离谱的分数。
create or replace function public.clamp_answer_event()
returns trigger language plpgsql as $$
begin
  new.points := case
    when new.correct then least(greatest(coalesce(new.points, 0), 0), 80)
    else 0
  end;
  return new;
end $$;

drop trigger if exists answer_events_clamp on public.answer_events;
create trigger answer_events_clamp before insert on public.answer_events
  for each row execute function public.clamp_answer_event();

create or replace function public.apply_answer_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d date := (new.created_at at time zone 'Asia/Shanghai')::date;
begin
  insert into public.player_stats (student_id, points_total, answered, correct, streak, best_streak)
  values (new.student_id, greatest(new.points,0), 1, case when new.correct then 1 else 0 end,
          case when new.correct then 1 else 0 end, case when new.correct then 1 else 0 end)
  on conflict (student_id) do update set
    points_total = public.player_stats.points_total + greatest(new.points, 0),
    answered     = public.player_stats.answered + 1,
    correct      = public.player_stats.correct + case when new.correct then 1 else 0 end,
    streak       = case when new.correct then public.player_stats.streak + 1 else 0 end,
    best_streak  = greatest(public.player_stats.best_streak,
                            case when new.correct then public.player_stats.streak + 1 else public.player_stats.best_streak end),
    updated_at   = now();

  insert into public.player_daily (student_id, day, points, answered, correct)
  values (new.student_id, d, greatest(new.points,0), 1, case when new.correct then 1 else 0 end)
  on conflict (student_id, day) do update set
    points   = public.player_daily.points + greatest(new.points, 0),
    answered = public.player_daily.answered + 1,
    correct  = public.player_daily.correct + case when new.correct then 1 else 0 end;

  insert into public.player_subject_daily (student_id, subject, day, points, answered, correct)
  values (new.student_id, new.subject, d, greatest(new.points,0), 1, case when new.correct then 1 else 0 end)
  on conflict (student_id, subject, day) do update set
    points   = public.player_subject_daily.points + greatest(new.points, 0),
    answered = public.player_subject_daily.answered + 1,
    correct  = public.player_subject_daily.correct + case when new.correct then 1 else 0 end;

  -- 错题本自动维护
  if new.question_id is not null then
    if new.correct then
      update public.wrong_book w set resolved_at = now()
       where w.student_id = new.student_id and w.question_id = new.question_id
         and w.resolved_at is null;
    else
      insert into public.wrong_book (student_id, question_id)
      values (new.student_id, new.question_id)
      on conflict (student_id, question_id) do update set
        wrong_count   = public.wrong_book.wrong_count + 1,
        last_wrong_at = now(),
        resolved_at   = null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists answer_events_apply on public.answer_events;
create trigger answer_events_apply after insert on public.answer_events
  for each row execute function public.apply_answer_event();

-- ---------------------------------------------------------------------------
-- 10. 榜单视图（security_invoker：仍然受 RLS 约束）
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_view
with (security_invoker = true) as
select
  p.id                          as student_id,
  p.display_name                as name,
  p.emoji                       as emoji,
  p.school                      as school,
  p.grade_key                   as grade_key,
  p.grade_label                 as grade_label,
  cls.class_id                  as class_id,
  cls.class_name                as class_name,
  coalesce(ps.correct, 0)       as correct,
  coalesce(ps.answered, 0)      as answered,
  coalesce(ps.points_total, 0)  as points_total,
  coalesce(ps.streak, 0)        as streak,
  coalesce(pd.points, 0)        as points_today,
  coalesce(pw.points, 0)        as points_week,
  coalesce(sp.sp_total, '{}'::jsonb) as subject_points,
  coalesce(sp.sp_today, '{}'::jsonb) as subject_today,
  coalesce(sp.sp_week,  '{}'::jsonb) as subject_week,
  coalesce(ps.updated_at, p.created_at) as at
from public.profiles p
left join public.player_stats ps on ps.student_id = p.id
left join lateral (
  select c.id as class_id, c.name as class_name
  from public.class_members m join public.classes c on c.id = m.class_id
  where m.student_id = p.id and c.archived = false
  order by m.joined_at desc
  limit 1
) cls on true
left join lateral (
  select sum(d.points) as points from public.player_daily d
  where d.student_id = p.id
    and d.day = (now() at time zone 'Asia/Shanghai')::date
) pd on true
left join lateral (
  select sum(d.points) as points from public.player_daily d
  where d.student_id = p.id
    and d.day >= (date_trunc('week', now() at time zone 'Asia/Shanghai'))::date
) pw on true
left join lateral (
  select
    jsonb_object_agg(x.subject, x.total)  filter (where x.total  is not null) as sp_total,
    jsonb_object_agg(x.subject, x.today)  filter (where x.today  is not null) as sp_today,
    jsonb_object_agg(x.subject, x.week)   filter (where x.week   is not null) as sp_week
  from (
    select d.subject,
           sum(d.points) as total,
           sum(d.points) filter (where d.day = (now() at time zone 'Asia/Shanghai')::date) as today,
           sum(d.points) filter (where d.day >= (date_trunc('week', now() at time zone 'Asia/Shanghai'))::date) as week
    from public.player_subject_daily d
    where d.student_id = p.id
    group by d.subject
  ) x
) sp on true
where p.status = 'active' and p.role = 'student';

-- ---------------------------------------------------------------------------
-- 11. 行级安全策略
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.player_state     enable row level security;
alter table public.classes          enable row level security;
alter table public.class_members    enable row level security;
alter table public.questions        enable row level security;
alter table public.homework         enable row level security;
alter table public.homework_questions enable row level security;
alter table public.submissions      enable row level security;
alter table public.answer_events    enable row level security;
alter table public.player_stats     enable row level security;
alter table public.player_daily     enable row level security;
alter table public.player_subject_daily enable row level security;
alter table public.wrong_book       enable row level security;
alter table public.asks             enable row level security;
alter table public.ask_replies      enable row level security;
alter table public.audit_logs       enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or public.shares_class_with(id)
  or (public.my_school() <> '' and school = public.my_school())
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- player_state --------------------------------------------------------------
drop policy if exists player_state_own on public.player_state;
create policy player_state_own on public.player_state for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- classes -------------------------------------------------------------------
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated
using (
  public.is_admin()
  or teacher_id = auth.uid()
  or public.in_class(id)
  or (my_school() <> '' and school = my_school())
);

drop policy if exists classes_insert on public.classes;
create policy classes_insert on public.classes for insert to authenticated
with check (public.is_teacher() and teacher_id = auth.uid());

drop policy if exists classes_update on public.classes;
create policy classes_update on public.classes for update to authenticated
using (teacher_id = auth.uid() or public.is_admin())
with check (teacher_id = auth.uid() or public.is_admin());

drop policy if exists classes_delete on public.classes;
create policy classes_delete on public.classes for delete to authenticated
using (teacher_id = auth.uid() or public.is_admin());

-- class_members -------------------------------------------------------------
drop policy if exists class_members_select on public.class_members;
create policy class_members_select on public.class_members for select to authenticated
using (student_id = auth.uid() or public.teaches_class(class_id) or public.is_admin());

drop policy if exists class_members_insert on public.class_members;
create policy class_members_insert on public.class_members for insert to authenticated
with check (student_id = auth.uid() or public.teaches_class(class_id) or public.is_admin());

drop policy if exists class_members_delete on public.class_members;
create policy class_members_delete on public.class_members for delete to authenticated
using (student_id = auth.uid() or public.teaches_class(class_id) or public.is_admin());

-- questions -----------------------------------------------------------------
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select to authenticated
using (
  deleted = false and (
    public.is_admin() or owner_id = auth.uid() or visibility in ('school','public')
  )
);

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions for insert to authenticated
with check (public.is_teacher() and owner_id = auth.uid());

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions for update to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- homework ------------------------------------------------------------------
drop policy if exists homework_select on public.homework;
create policy homework_select on public.homework for select to authenticated
using (public.is_admin() or teacher_id = auth.uid() or public.in_class(class_id));

drop policy if exists homework_write on public.homework;
create policy homework_write on public.homework for all to authenticated
using (teacher_id = auth.uid() or public.is_admin())
with check (public.is_teacher() and (teacher_id = auth.uid() or public.is_admin()));

drop policy if exists homework_questions_select on public.homework_questions;
create policy homework_questions_select on public.homework_questions for select to authenticated
using (exists (select 1 from public.homework h where h.id = homework_id
                 and (h.teacher_id = auth.uid() or public.in_class(h.class_id) or public.is_admin())));

drop policy if exists homework_questions_write on public.homework_questions;
create policy homework_questions_write on public.homework_questions for all to authenticated
using (exists (select 1 from public.homework h where h.id = homework_id and (h.teacher_id = auth.uid() or public.is_admin())))
with check (exists (select 1 from public.homework h where h.id = homework_id and (h.teacher_id = auth.uid() or public.is_admin())));

-- submissions ---------------------------------------------------------------
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated
using (student_id = auth.uid() or public.is_admin() or
       exists (select 1 from public.homework h where h.id = homework_id and h.teacher_id = auth.uid()));

drop policy if exists submissions_write on public.submissions;
create policy submissions_write on public.submissions for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

-- answer_events -------------------------------------------------------------
drop policy if exists answer_events_select on public.answer_events;
create policy answer_events_select on public.answer_events for select to authenticated
using (
  student_id = auth.uid() or public.is_my_student(student_id) or public.is_admin()
  -- 同校同学能看到彼此最近的得分动态（实时榜单/动态流要用），跨校看不到
  or (public.my_school() <> '' and exists (
        select 1 from public.profiles p
        where p.id = student_id and p.school = public.my_school() and p.status = 'active'))
);

drop policy if exists answer_events_insert on public.answer_events;
create policy answer_events_insert on public.answer_events for insert to authenticated
with check (student_id = auth.uid() or public.is_admin());

-- player_stats / player_daily ----------------------------------------------
-- 榜单要按「班级 / 同校同年级」两种口径看，所以同校同学之间互相可见积分
-- （仅限 school 相同的活跃学生，跨校数据彼此隔离）
drop policy if exists player_stats_select on public.player_stats;
create policy player_stats_select on public.player_stats for select to authenticated
using (
  student_id = auth.uid() or public.is_my_student(student_id) or public.is_admin()
  or public.shares_class_with(student_id)
  or (public.my_school() <> '' and exists (
        select 1 from public.profiles p where p.id = student_id and p.school = public.my_school()))
);

drop policy if exists player_daily_select on public.player_daily;
create policy player_daily_select on public.player_daily for select to authenticated
using (
  student_id = auth.uid() or public.is_my_student(student_id) or public.is_admin()
  or public.shares_class_with(student_id)
  or (public.my_school() <> '' and exists (
        select 1 from public.profiles p where p.id = student_id and p.school = public.my_school()))
);

drop policy if exists player_subject_daily_select on public.player_subject_daily;
create policy player_subject_daily_select on public.player_subject_daily for select to authenticated
using (
  student_id = auth.uid() or public.is_my_student(student_id) or public.is_admin()
  or public.shares_class_with(student_id)
  or (public.my_school() <> '' and exists (
        select 1 from public.profiles p where p.id = student_id and p.school = public.my_school()))
);

-- wrong_book ----------------------------------------------------------------
drop policy if exists wrong_book_select on public.wrong_book;
create policy wrong_book_select on public.wrong_book for select to authenticated
using (student_id = auth.uid() or public.is_my_student(student_id) or public.is_admin());

drop policy if exists wrong_book_write on public.wrong_book;
create policy wrong_book_write on public.wrong_book for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

-- asks ----------------------------------------------------------------------
drop policy if exists asks_select on public.asks;
create policy asks_select on public.asks for select to authenticated
using (
  student_id = auth.uid() or public.is_admin()
  or (teacher_id is not null and teacher_id = auth.uid())
  or (class_id is not null and public.teaches_class(class_id))
);

drop policy if exists asks_insert on public.asks;
create policy asks_insert on public.asks for insert to authenticated
with check (student_id = auth.uid() or public.is_admin());

drop policy if exists asks_update on public.asks;
create policy asks_update on public.asks for update to authenticated
using (student_id = auth.uid() or (teacher_id = auth.uid()) or
       (class_id is not null and public.teaches_class(class_id)) or public.is_admin())
with check (true);

drop policy if exists ask_replies_select on public.ask_replies;
create policy ask_replies_select on public.ask_replies for select to authenticated
using (exists (select 1 from public.asks a where a.id = ask_id
               and (a.student_id = auth.uid() or a.teacher_id = auth.uid()
                    or (a.class_id is not null and public.teaches_class(a.class_id))
                    or public.is_admin())));

drop policy if exists ask_replies_insert on public.ask_replies;
create policy ask_replies_insert on public.ask_replies for insert to authenticated
with check (author_id = auth.uid());

-- audit_logs ----------------------------------------------------------------
drop policy if exists audit_logs_admin on public.audit_logs;
create policy audit_logs_admin on public.audit_logs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 12. 存储桶（题图 / 提问配图）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pk-media', 'pk-media', true)
on conflict (id) do nothing;

drop policy if exists pk_media_read on storage.objects;
create policy pk_media_read on storage.objects for select
using (bucket_id = 'pk-media');

drop policy if exists pk_media_write on storage.objects;
create policy pk_media_write on storage.objects for insert to authenticated
with check (bucket_id = 'pk-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists pk_media_delete on storage.objects;
create policy pk_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'pk-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 13. 常用查询授权
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 14. 管理员操作函数（不部署 Edge Function 也能用的那一套）
--     每个函数都会先检查调用者是不是管理员，再把 EXECUTE 权限从 anon 收回，
--     所以普通用户即使知道函数名也调不动。
-- ---------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

create or replace function public.admin_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '需要管理员权限' using errcode = '42501';
  end if;
end $$;

-- 账号列表（能读到邮箱，因为函数以定义者身份访问 auth.users）
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, login_name text, display_name text, emoji text, role text,
  school text, grade_label text, status text, must_change_password boolean,
  created_at timestamptz, last_sign_in_at timestamptz
) language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.admin_guard();
  return query
    select p.id, u.email::text, p.login_name, p.display_name, p.emoji, p.role,
           p.school, p.grade_label, p.status, p.must_change_password,
           p.created_at, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     order by p.created_at asc;
end $$;

-- 重置某个账号的密码（学生忘密码就靠这个）
create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.admin_guard();
  if p_password is null or length(p_password) < 6 then
    raise exception '密码至少 6 位';
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = p_user_id;
  if not found then raise exception '账号不存在'; end if;

  update public.profiles set must_change_password = true where id = p_user_id;
  insert into public.audit_logs (actor_id, actor_name, action, target)
  values (auth.uid(),
          coalesce((select display_name from public.profiles where id = auth.uid()), 'admin'),
          'reset_password', p_user_id::text);
end $$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_name text;
begin
  perform public.admin_guard();
  if p_role not in ('student','teacher','admin') then raise exception '角色不合法'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception '不能取消自己的管理员权限';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception '账号不存在'; end if;
  select display_name into target_name from public.profiles where id = p_user_id;
  insert into public.audit_logs (actor_id, actor_name, action, target, detail)
  values (auth.uid(),
          coalesce((select display_name from public.profiles where id = auth.uid()), 'admin'),
          'set_role', coalesce(target_name, p_user_id::text), jsonb_build_object('role', p_role));
end $$;

create or replace function public.admin_set_status(p_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_name text;
begin
  perform public.admin_guard();
  if p_status not in ('active','disabled') then raise exception '状态不合法'; end if;
  if p_user_id = auth.uid() and p_status = 'disabled' then raise exception '不能停用自己'; end if;
  update public.profiles set status = p_status where id = p_user_id;
  if not found then raise exception '账号不存在'; end if;
  select display_name into target_name from public.profiles where id = p_user_id;
  insert into public.audit_logs (actor_id, actor_name, action, target, detail)
  values (auth.uid(),
          coalesce((select display_name from public.profiles where id = auth.uid()), 'admin'),
          'set_status', coalesce(target_name, p_user_id::text), jsonb_build_object('status', p_status));
end $$;

-- 删号：删 auth.users 会级联删掉档案、成员关系、答题记录等
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  target_name text;
begin
  perform public.admin_guard();
  if p_user_id = auth.uid() then raise exception '不能删除自己'; end if;
  select display_name into target_name from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
  insert into public.audit_logs (actor_id, actor_name, action, target)
  values (auth.uid(),
          coalesce((select display_name from public.profiles where id = auth.uid()), 'admin'),
          'delete_user', coalesce(target_name, p_user_id::text));
end $$;

-- 全站概览统计
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  out jsonb;
begin
  perform public.admin_guard();
  select jsonb_build_object(
    'users',       (select count(*) from public.profiles),
    'students',    (select count(*) from public.profiles where role = 'student'),
    'teachers',    (select count(*) from public.profiles where role = 'teacher'),
    'admins',      (select count(*) from public.profiles where role = 'admin'),
    'disabled',    (select count(*) from public.profiles where status = 'disabled'),
    'classes',     (select count(*) from public.classes where archived = false),
    'questions',   (select count(*) from public.questions where deleted = false),
    'homework',    (select count(*) from public.homework),
    'submissions', (select count(*) from public.submissions),
    'answers_7d',  (select count(*) from public.answer_events
                     where created_at >= now() - interval '7 days')
  ) into out;
  return out;
end $$;

-- 只有登录用户能调用，而且函数内部还会再验一次管理员身份
revoke all on function public.admin_guard()          from public, anon;
revoke all on function public.admin_list_users()     from public, anon;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_set_role(uuid, text)     from public, anon;
revoke all on function public.admin_set_status(uuid, text)   from public, anon;
revoke all on function public.admin_delete_user(uuid)        from public, anon;
revoke all on function public.admin_overview()       from public, anon;

grant execute on function public.admin_list_users()          to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_set_role(uuid, text)     to authenticated;
grant execute on function public.admin_set_status(uuid, text)   to authenticated;
grant execute on function public.admin_delete_user(uuid)        to authenticated;
grant execute on function public.admin_overview()            to authenticated;

-- ---------------------------------------------------------------------------
-- 15. 第一个管理员
--     用法：先在网站注册一个老师账号，然后把它的邮箱填到下方便执行。
--     执行完后重新登录，顶部会出现「后台管理」入口。
-- ---------------------------------------------------------------------------
-- update public.profiles p set role = 'admin'
--  from auth.users u
-- where u.id = p.id and lower(u.email) = lower('这里填你的老师邮箱或用户名@pk-academy.local');

-- 查看当前所有账号（仅管理员在控制台手动执行）：
-- select p.role, p.display_name, p.school, p.login_name, u.email, p.created_at
--   from public.profiles p join auth.users u on u.id = p.id order by p.created_at desc;
