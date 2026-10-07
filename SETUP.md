# 颜娱社区 (YENJOY) Supabase 配置说明

本文档将指导你从零开始，完成颜娱社区应用的后端数据库配置。全程使用 **Supabase** 作为后端服务（数据库 + 文件存储 + 实时同步），**全程免费套餐即可运行**。

---

## 目录

1. [项目简介](#1-项目简介)
2. [注册 Supabase 并创建项目](#2-注册-supabase-并创建项目)
3. [执行数据库建表脚本（schema.sql）](#3-执行数据库建表脚本schemasql)
4. [配置 Storage 文件存储桶](#4-配置-storage-文件存储桶)
5. [获取 URL 和 ANON_KEY](#5-获取-url-和-anon_key)
6. [开启 Realtime 实时同步（关键！）](#6-开启-realtime-实时同步关键)
7. [免费套餐限制说明](#7-免费套餐限制说明)
8. [打包成手机 App（可选）](#8-打包成手机-app可选)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 项目简介

颜娱社区是一个纯前端 HTML5 应用，后端使用 Supabase 提供：

- **PostgreSQL 数据库**：存储用户资料、社区帖子、活动信息
- **Storage 文件存储**：存储用户头像、帖子图片、.gbmap 地图文件、活动图片
- **Realtime 实时推送**：新帖子发布时，所有在线用户的社区页面自动更新

应用使用**匿名访问模式**，不需要注册登录，首次打开自动生成一个匿名用户 ID。

---

## 2. 注册 Supabase 并创建项目

### 2.1 注册账号

1. 打开浏览器，访问 **[https://supabase.com](https://supabase.com)**
2. 点击右上角 **"Start your project"**
3. 可以用 GitHub 账号直接登录（推荐），也可以用邮箱注册

### 2.2 创建新项目

1. 登录后进入 Dashboard，点击 **"New Project"**
2. 选择你的组织（Organization），默认会有一个个人组织
3. 填写项目信息：
   - **Name**：`yanyu-community`（或你喜欢的名字）
   - **Database Password**：设置一个数据库密码，**请务必保存好**（虽然本项目用不到，但后面可能需要）
   - **Region**：选择离你最近的区域，推荐 **Southeast Asia (Singapore)** 或 **Northeast Asia (Tokyo)**，国内访问速度较快
4. 点击 **"Create new project"**
5. 等待项目初始化完成（约 1~2 分钟），期间会自动创建数据库

> **注意**：如果你已有项目（URL 为 `https://zzksmhptybggchqbufzl.supabase.co`），直接跳到第 3 步即可。

---

## 3. 执行数据库建表脚本（schema.sql）

这是最重要的一步，会自动创建所有数据表、安全策略和存储桶。

### 3.1 打开 SQL Editor

1. 进入你的 Supabase 项目
2. 左侧菜单栏点击 **"SQL Editor"**（数据库图标旁边的那个）
3. 点击 **"New query"** 新建一个查询

### 3.2 粘贴并执行脚本

1. 用文本编辑器打开本目录下的 **`schema.sql`** 文件
2. **全选复制**文件中的所有内容（Ctrl+A → Ctrl+C）
3. 粘贴到 Supabase SQL Editor 的编辑框中（Ctrl+V）
4. 点击右下角的绿色 **"Run"** 按钮（或按 Ctrl+Enter）
5. 等待执行完成，底部显示 **"Success. No rows returned"** 就说明成功了

> **如果报错怎么办？**
> - 如果提示 "policy already exists" 或 "bucket already exists"，说明你之前执行过，不影响使用
> - 如果是其他错误，请把错误信息复制下来，对照本文档第 9 节排查
> - 实在不行，可以先在 Table Editor 里手动删掉所有表，再重新执行脚本

### 3.3 验证表是否创建成功

1. 左侧菜单点击 **"Table Editor"**
2. 应该能看到三张表：`users`、`posts`、`activities`
3. 点进去看看字段是否和上面一致

---

## 4. 配置 Storage 文件存储桶

`schema.sql` 脚本已经自动创建了 4 个存储桶（Storage Bucket）。如果脚本执行成功，这一步可以跳过。

### 4.1 验证存储桶是否创建成功

1. 左侧菜单点击 **"Storage"**
2. 应该能看到 4 个 bucket：
   - `avatars` — 用户头像
   - `post-images` — 帖子图片
   - `post-files` — .gbmap 地图文件
   - `activity-images` — 活动图片

### 4.2 如果存储桶没创建成功（手动创建）

如果 `schema.sql` 执行时 Storage 部分报错了，可以手动创建：

1. 进入 **Storage** 页面
2. 点击 **"New bucket"**
3. 勾选 **"Public bucket"**（公开读取）
4. Name 填入：`avatars`，点击保存
5. 重复以上步骤，依次创建 `post-images`、`post-files`、`activity-images`
6. 全部创建完后，每个 bucket 都要是 **Public** 状态（右侧有个绿色的 Public 标签）

> **为什么要 Public？** 因为应用是匿名访问，没有登录系统，公开读取才能让所有用户看到图片和下载文件。

---

## 5. 获取 URL 和 ANON_KEY

配置完数据库后，你需要把这两个值填到应用的 `supabase-config.js` 文件中。

### 5.1 获取位置

1. 点击左侧菜单最底部的 **"Project Settings"**（齿轮图标）
2. 点击 **"API"**
3. 你会看到以下信息：

```
Project URL:
https://xxxxxxxx.supabase.co          ← 复制这个

Project API keys:
anon / public:
sb_publishable_xxxxxxxxxxxxxxxx       ← 复制这个（anon key，不是 service_role！）
```

### 5.2 填入应用配置

打开项目目录下的 `supabase-config.js`，把这两个值填进去：

```javascript
const SUPABASE_URL = "https://你的项目地址.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_你的anon_key";
```

> **重要提醒**：
> - 一定要用 **anon / public** 这个 key，**绝对不要用 service_role key**！
> - service_role key 拥有数据库的全部权限，泄露了别人就能删你的数据库
> - anon key 是公开的，放在前端代码里是安全的，因为 RLS（行级安全）已经限制了数据访问范围

---

## 6. 开启 Realtime 实时同步（关键！）

这是**最容易被漏掉、但最重要**的一步。如果不开这个，社区页面就不能实时看到新帖子，必须手动刷新才行。

### 6.1 开启 Replication

1. 左侧菜单点击 **"Database"**
2. 然后点击 **"Replication"**（在 Database 子菜单里）
3. 你会看到一个名为 **"supabase_realtime"** 的发布（Publication）
4. 点击右侧的 **"Source"** 或 **"0 tables"** 链接（不同版本界面可能略有不同）
5. 在弹出的列表中，找到 **`posts`** 表，把它的开关打开
6. 确保 **`posts`** 表旁边显示为已添加（Added）状态

### 6.2 验证

开启后，`supabase_realtime` 旁边应该显示类似 **"1 table"** 或你添加的表数量。

> **为什么只开 posts 表？**
> - 社区帖子需要实时推送，所以必须开 posts 表的 Realtime
> - users 表和 activities 表不需要实时推送（活动页刷新时才加载新数据）
> - 如果以后需要活动也实时更新，可以在这里把 activities 表也加上

---

## 7. 免费套餐限制说明

Supabase 免费套餐（Free Tier）的限制如下，颜娱社区这种小型应用完全够用：

| 项目 | 免费额度 | 说明 |
|------|----------|------|
| 数据库空间 | 500 MB | 存帖子文字和用户数据，能用很久 |
| 文件存储 | 1 GB | 头像、帖子图片、.gbmap 文件共用 |
| 月流量 | 2 GB | 图片和文件下载流量 |
| 并发连接 | 60 | 同时在线用户数，社区小圈子完全够 |
| 项目数量 | 2 个 | 个人用足够了 |

### 实际使用建议

- **单文件不要超过 5MB**：尤其是 .gbmap 文件和帖子图片，上传前尽量压缩
- **图片建议压缩**：手机拍的照片可能有 5~10MB，上传前用微信/截图压缩到 1~2MB 比较合适
- **不活跃的项目会暂停**：免费套餐项目连续 7 天没有活动会自动暂停，回来打开 Dashboard 点一下就能恢复

---

## 8. 打包成手机 App（可选）

如果你想把这个网页应用打包成 Android APK 安装到手机上，可以用以下方法：

### 方法一：Capacitor（推荐，专业级）

1. 安装 Node.js（如果没装过）
2. 在项目目录下执行：
   ```bash
   npm init -y
   npm install @capacitor/core @capacitor/cli
   npx cap init
   npx cap add android
   npx cap sync
   npx cap open android
   ```
3. 在 Android Studio 中 Build → Build APK

### 方法二：WebView 包装器（最简单）

- 手机上直接用 Chrome 打开网页，然后"添加到主屏幕"，体验和 App 几乎一样
- 或者用在线工具（如 Median.co、AppsGeyser）把网址打包成 APK，几分钟搞定

### 方法三：PWA（渐进式网页应用）

- 给网页加一个 manifest.json 和 Service Worker
- 用户用 Chrome 打开时可以"安装"到手机桌面，有图标、全屏运行

> 本项目目前是纯 HTML 文件，直接双击打开 `index.html` 就能在浏览器里用。

---

## 9. 常见问题排查

### Q1：页面打开后帖子加载不出来，一直转圈？

**检查清单：**
1. 打开浏览器开发者工具（F12）→ Console 标签，看有没有红色报错
2. 确认 `supabase-config.js` 里的 URL 和 ANON_KEY 填对了
3. 确认 `schema.sql` 执行成功了（Table Editor 里能看到 posts 表）
4. 确认 RLS 策略创建了（SQL Editor 里执行 `select * from pg_policies where tablename = 'posts';` 应该有结果）

### Q2：发帖提示上传失败？

**检查清单：**
1. 确认 Storage 里 `post-images`、`post-files` 这两个 bucket 存在，且是 Public 的
2. 检查文件大小，不要超过 5MB
3. Console 里看具体报错信息，常见的是权限问题

### Q3：发了帖子，但别的手机/标签页看不到？

**这是 Realtime 没开！**
1. 回到本文档第 6 节，确认 `posts` 表已经加入了 `supabase_realtime` 发布
2. 刷新一下页面再试
3. 如果还是不行，等几秒钟（Realtime 有几秒延迟是正常的）

### Q4：执行 schema.sql 时报 "permission denied for table buckets"？

这是因为 SQL 里直接操作了 storage.buckets 系统表，普通角色权限不够。**解决方法：**
1. 按照第 4.2 节的方法，手动在 Storage 面板创建 4 个 bucket
2. 然后再去 SQL Editor 执行脚本中除了 "创建 Storage Buckets" 那一段以外的部分
3. 或者直接全部手动创建表和策略也可以

### Q5：用户头像上传后不显示？

1. 确认 `avatars` bucket 是 Public 的
2. 确认上传后拿到的 URL 是完整的（以 `https://` 开头）
3. 右键头像 → 检查元素，看 img 标签的 src 是否正确
4. 直接复制 URL 在新标签页打开，看能不能看到图片

### Q6：想重置数据库重来？

1. 进入 Supabase Dashboard → Database → Tables
2. 依次删除 `activities`、`posts`、`users` 三张表（注意顺序，先删有外键引用的）
3. Storage 里删掉所有 bucket
4. 重新执行一遍 `schema.sql`

### Q7：免费套餐项目被暂停了怎么办？

1. 打开 Supabase Dashboard
2. 被暂停的项目会有一个黄色提示条，点击 **"Restore"** 按钮即可
3. 恢复后所有数据都还在

---

## 完成清单

配置完成后，你应该做到了以下几点：

- [ ] 注册了 Supabase 账号并创建了项目
- [ ] 执行了 `schema.sql`，三张表都在
- [ ] Storage 里有 4 个 Public bucket
- [ ] 拿到了 Project URL 和 anon Key，填进了 `supabase-config.js`
- [ ] Database → Replication 里开启了 posts 表的实时同步
- [ ] 打开 `index.html`，社区页能加载帖子、能发帖
- [ ] 两个手机/两个标签页发帖能互相实时看到

全部打勾，就大功告成了！
