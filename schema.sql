-- ============================================================
-- 颜娱社区 (YENJOY) Supabase 数据库初始化脚本
-- 可直接在 Supabase SQL Editor 中一键执行
-- ============================================================

-- 启用 pgcrypto 扩展（用于 gen_random_uuid() 函数）
create extension if not exists "pgcrypto";


-- ============================================================
-- 1. users 表（用户资料）
-- ============================================================
create table if not exists public.users (
  id uuid primary key,                              -- 用户ID（注册时前端生成的UUID）
  phone text unique,                                -- 手机号（登录账号，唯一）
  password text,                                    -- 登录密码
  name text default '玩家0000',                      -- 用户名/昵称，默认"玩家XXXX"
  avatar_url text,                                  -- 头像图片URL（Supabase Storage）
  main_game text,                                   -- 主玩游戏
  bio text,                                         -- 个人简介
  medium_credits int default 0,                     -- 中方面发布次数
  large_credits int default 0,                      -- 大方面发布次数
  last_credit_claim date,                            -- 上次领取中方面次数日期
  created_at timestamptz default now()              -- 账户创建时间
);

comment on table public.users is '用户资料表（含手机号+密码登录）';
comment on column public.users.id is '用户UUID，注册时前端生成';
comment on column public.users.phone is '手机号登录账号，唯一';
comment on column public.users.medium_credits is '中方面活动发布剩余次数';
comment on column public.users.large_credits is '大方面活动发布剩余次数（仅管理员可赐予）';

-- 已存在的旧表（v3 无 phone/password）在线补充字段与唯一索引
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists password text;
create unique index if not exists users_phone_key on public.users (phone) where phone is not null;


-- ============================================================
-- 2. posts 表（社区帖子）
-- ============================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),    -- 帖子ID，自动生成
  user_id uuid references public.users(id),         -- 发布者ID
  user_name text,                                   -- 发布者用户名（冗余，方便显示）
  user_avatar text,                                 -- 发布者头像URL（冗余）
  content text,                                     -- 帖子文本内容
  file_name text,                                   -- 附件文件名（.gbmap）
  file_url text,                                    -- 附件公开URL
  image_url text,                                   -- 帖子图片URL
  created_at timestamptz default now()              -- 发布时间
);

comment on table public.posts is '社区帖子表';
comment on column public.posts.user_name is '冗余字段，避免每次查帖子都JOIN users表';
comment on column public.posts.user_avatar is '冗余字段，头像快照';


-- ============================================================
-- 3. activities 表（活动）
-- ============================================================
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),    -- 活动ID，自动生成
  user_id uuid references public.users(id),         -- 创建者ID
  user_name text,                                   -- 创建者名（东道主）
  title text not null,                              -- 活动名称（必填）
  time text not null,                               -- 活动时间（必填，文本格式）
  size text check (size in ('small','medium','large')),  -- 画布大小
  image_url text,                                   -- 活动图片（仅large可有）
  is_pinned boolean default false,                  -- 是否置顶
  created_at timestamptz default now()              -- 创建时间
);

comment on table public.activities is '活动表';
comment on column public.activities.size is '画布大小：small=小方面 / medium=中方面 / large=大方面';
comment on column public.activities.is_pinned is '是否置顶（管理员操作）';


-- ============================================================
-- 4. 启用 RLS（行级安全）
-- ============================================================
alter table public.users enable row level security;
alter table public.posts enable row level security;
alter table public.activities enable row level security;


-- ============================================================
-- 5. RLS 策略 — users 表
-- ============================================================
-- 允许匿名读取所有用户资料
create policy "users_select_anon" on public.users
  for select using (true);

-- 允许匿名插入用户（首次打开应用时注册）
create policy "users_insert_anon" on public.users
  for insert with check (true);

-- 允许匿名更新用户资料（修改自己的资料）
create policy "users_update_anon" on public.users
  for update using (true) with check (true);


-- ============================================================
-- 6. RLS 策略 — posts 表
-- ============================================================
-- 允许匿名读取所有帖子
create policy "posts_select_anon" on public.posts
  for select using (true);

-- 允许匿名发布帖子
create policy "posts_insert_anon" on public.posts
  for insert with check (true);

-- 允许匿名删除帖子（每月1号自动清空功能需要）
create policy "posts_delete_anon" on public.posts
  for delete using (true);


-- ============================================================
-- 7. RLS 策略 — activities 表
-- ============================================================
-- 允许匿名读取所有活动
create policy "activities_select_anon" on public.activities
  for select using (true);

-- 允许匿名创建活动
create policy "activities_insert_anon" on public.activities
  for insert with check (true);


-- ============================================================
-- 8. 创建 Storage Buckets（文件存储桶）
-- ============================================================
-- 注意：bucket 名称与下方策略一一对应
-- 若 insert 因权限失败，可在 Storage 面板手动创建同名 bucket

insert into storage.buckets (id, name, public) values
  ('avatars',         'avatars',         true),
  ('post-images',     'post-images',     true),
  ('post-files',      'post-files',      true),
  ('activity-images', 'activity-images', true)
on conflict (id) do nothing;


-- ============================================================
-- 9. Storage 策略 — 每个 bucket 允许匿名上传 + 公开读取
-- ============================================================

-- ---- avatars bucket ----
create policy "avatars_select" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert with check (bucket_id = 'avatars');

-- ---- post-images bucket ----
create policy "post-images_select" on storage.objects
  for select using (bucket_id = 'post-images');

create policy "post-images_insert" on storage.objects
  for insert with check (bucket_id = 'post-images');

-- ---- post-files bucket ----
create policy "post-files_select" on storage.objects
  for select using (bucket_id = 'post-files');

create policy "post-files_insert" on storage.objects
  for insert with check (bucket_id = 'post-files');

-- ---- activity-images bucket ----
create policy "activity-images_select" on storage.objects
  for select using (bucket_id = 'activity-images');

create policy "activity-images_insert" on storage.objects
  for insert with check (bucket_id = 'activity-images');


-- ============================================================
-- 10. 索引（优化查询性能）
-- ============================================================
-- posts 按时间倒序查询，created_at 加索引
create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- activities 按创建时间和置顶状态排序
create index if not exists activities_created_at_idx on public.activities (created_at desc);
create index if not exists activities_is_pinned_idx on public.activities (is_pinned desc);

-- users 按创建时间
create index if not exists users_created_at_idx on public.users (created_at desc);


-- ============================================================
-- 完成
-- ============================================================
-- 执行完毕后，请前往 Database → Replication 开启 posts 表的 Realtime 复制
-- 详见 SETUP.md 中的"开启 Realtime"章节
