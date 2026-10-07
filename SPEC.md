# 颜娱社区 (YENJOY) 应用开发规格书

## 项目路径
`/home/user/Doubao/chats/3307436908520706/yanyu-gb-assistant/`

## 文件结构
- `index.html` — 主HTML（所有页面结构）
- `style.css` — 全部样式
- `app.js` — 全部应用逻辑
- `supabase-config.js` — Supabase客户端初始化
- `schema.sql` — 数据库建表脚本
- `SETUP.md` — Supabase配置说明

## Supabase 现有凭据（保留，可在config中修改）
- URL: `https://zzksmhptybggchqbufzl.supabase.co`
- ANON_KEY: `sb_publishable_p6xnmohFku6XVP7GUh7tnQ_cUzyrwWA`
- SDK CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`

## 用户身份
- 匿名用户：首次打开生成UUID存入localStorage（key: `yanyu_user_id`）
- 默认用户名："玩家" + 4位随机数字（如"玩家0494"）
- 用户资料存在Supabase users表，可编辑姓名/主玩/简介/头像

## 数据库表结构

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (primary key) | 用户匿名ID |
| name | text | 用户名，默认"玩家XXXX" |
| avatar_url | text | 头像图片URL（Supabase Storage） |
| main_game | text | 主玩游戏 |
| bio | text | 简介 |
| medium_credits | int | 中方面发布次数，默认0 |
| large_credits | int | 大方面发布次数，默认0 |
| last_credit_claim | date | 上次领取中方面次数日期 |
| created_at | timestamptz | 创建时间 |

### posts 表（社区帖子）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (primary key, default gen_random_uuid()) | 帖子ID |
| user_id | uuid (references users.id) | 发布者ID |
| user_name | text | 发布者用户名（冗余，方便显示） |
| user_avatar | text | 发布者头像URL（冗余） |
| content | text | 帖子文本内容 |
| file_name | text | 附件文件名（.gbmap） |
| file_url | text | 附件公开URL |
| image_url | text | 帖子图片URL |
| created_at | timestamptz (default now()) | 发布时间 |

### activities 表（活动）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (primary key, default gen_random_uuid()) | 活动ID |
| user_id | uuid (references users.id) | 创建者ID |
| user_name | text | 创建者名（东道主） |
| title | text | 活动名称（必填） |
| time | text | 活动时间（必填，文本格式） |
| size | text | 画布大小: small / medium / large |
| image_url | text | 活动图片（仅large可有） |
| is_pinned | boolean | 是否置顶 |
| created_at | timestamptz | 创建时间 |

## Storage Buckets
- `avatars` — 用户头像（公开读）
- `post-images` — 帖子图片（公开读）
- `post-files` — .gbmap文件（公开读）
- `activity-images` — 活动图片（公开读）

## RLS策略
- 所有表：允许匿名 SELECT 和 INSERT（免费套餐简单配置）
- users表：额外允许 UPDATE（用户修改自己资料，用id匹配）
- Storage：所有bucket公开读，匿名可上传

## 页面与功能详细规格

### 1. 进入动画（总时长2.5秒，纯CSS+JS）
时间线：
- 0~0.5s：第一帧（黑底白字 "YENJOY 颜娱社区"）逐渐淡入
- 0.5~0.8s：0.3秒快速抽搐（画面左右抖动+闪烁，用CSS keyframes）
- 0.8s：瞬间切换为第二帧（白底黑字 "YENJOY 颜娱社区"）
- 0.8~2.2s："摄像机放大"效果——白色背景区域逐渐放大(scale 1→1.8)，文字逐渐缩小(scale 1→0.3)并淡出
- 2.2~2.5s：整体逐渐消失
- 2.5s：主界面出现
- logo用纯CSS/SVG绘制文字，不依赖外部图片

### 2. 主界面 (page-home)
- 顶部：YENJOY 大标题
- 用户卡片：头像（默认黑圆，可点击进资料页）、用户名、主玩
- 欢迎卡片："欢迎使用颜娱助手" + MUYAN
- 4个功能按钮（2x2网格）：加入GB频道、关于活动、联机助手、关注作者
  - 加入GB频道 → 打开QQ频道链接
  - 关于活动 → 进入活动页
  - 联机助手 → 显示"暂未开发"
  - 关注作者 → 显示"暂未开发"
- 底部导航：社区 | 我的 | 意见箱
- 滑动手势：
  - 向右滑 → 进入社区页
  - 向左滑 → 进入意见箱（显示"暂未开发"）
  - 向下滑/点击 → 进入社区页
- 用touchstart/touchend/touchmove实现滑动检测

### 3. 社区页 (page-community)
- 顶部标签栏：关注 | 动态（默认选中） | 热门
  - 点击"关注"或"热门" → 显示"暂未开发"toast
- 内容区：淡蓝色边框(2px solid #a0c4e8)，内部白色背景，圆角
- 空状态：居中大字"暂无任何信息"
- 有帖子：帖子列表，每条帖子卡片包含：
  - 用户头像（圆形，默认黑色圆）
  - 用户名
  - 发布时间
  - 文本内容
  - 图片（如有，显示缩略图）
  - .gbmap文件附件（如有，显示文件名+下载按钮）
- 底部发帖栏（固定底部）：
  - 文本输入框（圆角，placeholder"说点什么..."）
  - 发送按钮（箭头/纸飞机图标）
  - 加号按钮（点击弹出选项菜单：文件 | 图片 | 语音）
    - 图片 → input type=file accept=image/*（默认相册）
    - 文件 → input type=file accept=".gbmap"，JS校验后缀
    - 语音 → 显示"暂未开发"
  - 选中附件后显示预览（图片缩略图/文件名），可取消
  - 发送：文本或附件至少有一个，写入Supabase posts表，上传文件到Storage，实时刷新
- 实时订阅：supabase.channel监听posts表INSERT，新帖子自动prepend到列表

### 4. 活动页 (page-activity)
- 左上角：三个点按钮（•••），点击弹出菜单：搜索活动 | 创建活动
  - 搜索活动 → "暂未开发"
  - 创建活动 → 打开创建弹窗
- 标题："关于活动"
- 空状态：居中"暂无任何活动"
- 有活动：活动卡片列表，按size不同尺寸：
  - small（小方面）：小卡片，显示活动名+时间+东道主+立即参与按钮
  - medium（中方面）：中卡片
  - large（大方面）：大卡片，可带图片预览
- 立即参与按钮 → "暂未开发"
- 底部返回按钮 → 回主界面

### 创建活动弹窗
- 遮罩层+居中白色弹窗，圆角
- 活动名称输入框（必填，不填点发布时提示"请输入活动名称"）
- 活动时间输入框（必填，不填提示"请输入活动时间"）
- 选择发布画布大小（单选，三个选项横向排列）：
  - 小方面：灰色圆圈，选中变绿圆✓
  - 中方面：显示"拥有X次机会"，下方有"领取今日次数"按钮（每天1次，可积累，领取后medium_credits+1，记录last_credit_claim）
  - 大方面：显示"拥有X次机会"（默认0，仅管理员可赐予），选中后出现"可添加图片"区域+添加图片按钮
- 选中大方面且添加图片后：显示图片缩略图预览
- 发布按钮：名称和时间都填了，且对应size有次数（small无限制，medium需medium_credits>0，large需large_credits>0），点击后写入activities表，扣减次数，关闭弹窗，刷新列表
- 关闭按钮（X或点击遮罩）

### 5. 个人资料页 (page-profile)
- 所有"修改个人信息"/"个人资料"入口都跳转到此页
- 顶部返回按钮
- 标题："个人资料"
- 头像区域：黑色圆形（默认），点击→input type=file accept=image/*选择图片→上传到avatars bucket→更新头像
- 三个可编辑行（点击进入编辑，或直接inline input）：
  - 名字（text input）
  - 主玩（text input，placeholder"主玩游戏"）
  - 简介（textarea，placeholder"介绍一下自己"）
- 保存按钮：写入users表（upsert），更新本地缓存
- 下方区域标题："信息"（不是"我发布过的房间"）
  - 如果用户没有发布过帖子和活动：显示空状态"暂无发布信息"
  - 如果有：显示该用户发布的帖子列表和活动列表（tab切换或混合列表）

### 6. 意见箱页 (page-feedback)
- 简单页面，居中显示"暂未开发"

## UI设计要求
- 移动端优先，max-width: 480px居中，全屏自适应
- 主色调：淡蓝色(#a0c4e8 / #82b8e8) + 白色 + 深色文字(#1a3a5c)
- 圆角卡片，简洁现代
- 所有文字中文
- 页面切换用opacity过渡（0.3s）
- 按钮点击有:active缩放反馈
- 字体：system-ui

## 技术约束
- 纯原生HTML+CSS+JS，不使用任何框架
- Supabase SDK通过CDN引入
- 代码有中文注释，关键函数标明用途
- 文件上传大小限制提示（Supabase免费套餐单文件建议<5MB）
- 所有异步操作有loading状态和错误提示
- 离线/未配置Supabase时降级为本地模式（localStorage存储帖子），不崩溃

## 验收清单
1. 打开index.html看到2.5秒进入动画（淡入→抽搐→切换→放大缩小→淡出）
2. 主界面左右滑动切换页面，底部导航可点击
3. 社区页能发帖（文本+图片+.gbmap文件），存入Supabase并实时显示
4. 多设备/多标签页打开能实时看到对方帖子
5. .gbmap文件可上传和下载
6. 活动页能创建活动（名称+时间必填校验），三种画布大小单选，大方面可加图片
7. 中方面发布次数每天可领1次，可积累
8. 个人资料页可改头像、姓名、主玩、简介
9. 个人资料页下方"信息"区有发布记录时显示列表，无则空状态
10. 所有"暂未开发"功能有明确toast提示
11. schema.sql可直接在Supabase SQL编辑器执行
12. SETUP.md说明清晰，填入URL和KEY即可使用
