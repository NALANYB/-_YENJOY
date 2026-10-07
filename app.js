/**
 * app.js — 颜娱社区 (YENJOY) v13
 * 纯原生 JS，依赖 npoint-config.js
 * v13: 点赞评论系统 / 作者主页 / 关注系统 / 联机房间 / 消息通知 / 帧率限制 / 重力拖动
 */

'use strict';

// ============================================================
// 启动画面
// ============================================================
(function initSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  // 图片加载完成后开始播放动画
  const splashImg = splash.querySelector('.splash-img');
  function showApp() {
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 700);
  }
  if (splashImg && splashImg.complete && splashImg.naturalWidth > 0) {
    // 图片已缓存，直接播放
    setTimeout(showApp, 2600);
  } else if (splashImg) {
    splashImg.addEventListener('load', () => {
      setTimeout(showApp, 2600);
    });
    // 如果 3 秒后图片还没加载完也强制消失
    setTimeout(showApp, 3200);
  } else {
    setTimeout(showApp, 2600);
  }
})();

// ============================================================
// 全局状态
// ============================================================
const LS = {
  USER: 'yanyu_user',
  USERS_DB: 'yanyu_users_db',
  PROFILE: 'yanyu_profile',
  POSTS: 'yanyu_posts',
  ACTIVITIES: 'yanyu_activities',
  CLEAR_MONTH: 'yanyu_last_clear_month',
  FPS: 'yanyu_fps',
};

let currentUser = null;
let loginMode = 'login';
let communityTab = 'dynamic';
let pendingAttachment = null;
let activitySelectedSize = 'small';
let pendingActivityImage = null;
let profileEditReturnTo = 'mine';
let currentCommentPost = null;
let currentAuthor = null;
let pendingDeleteRoom = null;

const db = window.db;

// 调试：显示连接状态
(function showDbStatus() {
  setTimeout(() => {
    const status = document.createElement('div');
    status.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:4px;font-size:12px;text-align:center;color:#fff;' + (db ? 'background:#4caf50;' : 'background:#f44336;');
    status.textContent = db ? '云端已连接' : '云端未连接';
    document.body.appendChild(status);
  }, 500);
})();

// ============================================================
// 工具
// ============================================================
function $(id) { return document.getElementById(id); }

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getLocal(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function setLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) {
    console.error('存储失败:', key, e);
    return false;
  }
}

// 精简帖子用于本地缓存（去掉base64大图，只留文字，节省空间）
function slimPost(p) {
  const c = Object.assign({}, p);
  if (c.image_url && c.image_url.length > 2000) c.image_url = '';
  if (c.video_url && c.video_url.length > 2000) c.video_url = '';
  if (c.file_url && c.file_url.length > 2000) c.file_url = '';
  if (c.user_avatar && c.user_avatar.length > 2000) c.user_avatar = '';
  return c;
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '----';
  return phone.slice(0, 3) + '****' + phone.slice(7);
}

function isValidPhone(p) { return /^1\d{10}$/.test(p); }

// 文件转base64（图片自动压缩到最大800px，质量0.7）
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    // 非图片文件直接转base64
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    // 图片压缩
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// 帧率设置（默认120，仅记录偏好，不做强制限制）
// ============================================================
function setFps(fps) {
  localStorage.setItem(LS.FPS, String(fps));
  updateFpsUI();
  showToast('已设置为' + fps + '帧');
}

function updateFpsUI() {
  const fps = parseInt(localStorage.getItem(LS.FPS)) || 120;
  [60, 90, 120].forEach(f => {
    const el = document.querySelector('.fps-option[data-fps="' + f + '"]');
    if (el) el.classList.toggle('selected', f === fps);
  });
}

// ============================================================
// 登录 / 注册
// ============================================================
function setLoginMode(mode) {
  loginMode = mode;
  $('tabLogin').classList.toggle('active', mode === 'login');
  $('tabRegister').classList.toggle('active', mode === 'register');
  $('loginSubmitBtn').textContent = mode === 'login' ? '登录' : '注册';
  $('loginPassword2').style.display = mode === 'register' ? 'block' : 'none';
}

async function doAuth() {
  const phone = $('loginPhone').value.trim();
  const password = $('loginPassword').value;
  const password2 = $('loginPassword2').value;

  if (!isValidPhone(phone)) { showToast('请输入正确的11位手机号'); return; }
  if (!password || password.length < 6) { showToast('密码至少6位'); return; }
  if (loginMode === 'register' && password !== password2) { showToast('两次密码不一致'); return; }

  if (loginMode === 'login') {
    await handleLogin(phone, password);
  } else {
    await handleRegister(phone, password);
  }
}

async function handleLogin(phone, password) {
  const localUsers = getLocal(LS.USERS_DB) || [];
  const user = localUsers.find(u => u.phone === phone && u.password === password);
  if (!user) { showToast('用户不存在，请注册'); return; }
  await establishSession(user);
}

async function handleRegister(phone, password) {
  const localUsers = getLocal(LS.USERS_DB) || [];
  if (localUsers.find(u => u.phone === phone)) { showToast('该手机号已注册，请直接登录'); return; }

  const name = '玩家' + phone.slice(-4);
  const newUser = {
    id: YanyuUser.uuid(),
    phone, password, name,
    avatar_url: '', main_game: '', bio: '',
    medium_credits: 0, large_credits: 0, last_credit_claim: '',
    created_at: new Date().toISOString(),
  };

  localUsers.push(newUser);
  // 确保用户数据能保存成功，空间不足时清理帖子缓存重试
  let ok = setLocal(LS.USERS_DB, localUsers);
  if (!ok) {
    setLocal(LS.POSTS, []);
    setLocal('yanyu_pending_posts', []);
    ok = setLocal(LS.USERS_DB, localUsers);
  }
  if (!ok) { showToast('存储空间不足，注册失败，请清理应用数据'); return; }
  showToast('注册成功，正在登录');
  await establishSession(newUser);
}

async function establishSession(user) {
  currentUser = user;
  const { password, ...safe } = user;
  setLocal(LS.USER, safe);
  refreshHomeUser();
  refreshMineUser();
  updateMsgBadge();
  navStack = ['home'];
  showPage('home');
}

function logout() {
  localStorage.removeItem(LS.USER);
  currentUser = null;
  navStack = ['login'];
  showPage('login');
}

async function restoreSession() {
  const saved = getLocal(LS.USER);
  if (!saved) return false;
  currentUser = saved;
  // 从云端同步最新资料（非阻塞，静默失败）
  if (db) {
    try {
      const cloudUser = await db.users.get(saved.id);
      if (cloudUser) {
        // 合并：云端有更新则覆盖本地
        currentUser.name = cloudUser.name || currentUser.name;
        currentUser.main_game = cloudUser.main_game || currentUser.main_game;
        currentUser.bio = cloudUser.bio || currentUser.bio;
        // 头像优先用本地的（base64更大），云端只有截断版本
        if (!currentUser.avatar_url && cloudUser.avatar_url) {
          currentUser.avatar_url = cloudUser.avatar_url;
        }
        // 徽章同步
        if (cloudUser.badges && cloudUser.badges.length > 0) {
          currentUser.badges = cloudUser.badges;
        }
        setLocal(LS.USER, currentUser);
        console.log('[颜娱] 已从云端同步用户资料');
      }
    } catch (e) {
      console.warn('[颜娱] 云端同步失败，使用本地数据:', e.message);
    }
  }
  refreshHomeUser();
  refreshMineUser();
  updateMsgBadge();
  return true;
}

// ============================================================
// 头像渲染
// ============================================================
const BADGES = [
  { key: 'admin',         name: 'Admin',         src: 'assets/badges/badge-admin.png' },
  { key: 'administrator', name: 'Administrator', src: 'assets/badges/badge-administrator.png' },
  { key: 'animosity',     name: 'Animosity',     src: 'assets/badges/badge-animosity.png' },
  { key: 'developer',     name: 'Developer',     src: 'assets/badges/badge-developer.png' },
  { key: 'devhelper',     name: 'DevHelper',     src: 'assets/badges/badge-devhelper.png' },
  { key: 'gb27',          name: 'GB27',          src: 'assets/badges/badge-gb27.png' },
  { key: 'hos',           name: 'HoS',           src: 'assets/badges/badge-hos.png' },
  { key: 'human2',        name: 'Human 2',       src: 'assets/badges/badge-human2.png' },
  { key: 'human3',        name: 'Human 3',       src: 'assets/badges/badge-human3.png' },
  { key: 'remaster',      name: 'Remaster',      src: 'assets/badges/badge-remaster.png' },
];

function getUserBadge(user) {
  if (!user) return localStorage.getItem(LS_BADGE) || '';
  if (user.badge_key) return user.badge_key;
  return currentUser && currentUser.id === user.id
    ? (localStorage.getItem(LS_BADGE) || '')
    : '';
}

function renderAvatar(el, user) {
  // 清空父容器旧徽章，防止叠加
  const container = el.parentElement || el;
  container.querySelectorAll('.avatar-badge').forEach(b => b.remove());
  el.innerHTML = '';
  const img = document.createElement('img');
  if (user && user.avatar_url) {
    img.src = user.avatar_url;
  } else {
    img.src = '';
    img.style.cssText = 'display:none;';
    el.textContent = (user && user.name ? user.name.slice(0, 1) : '?');
  }
  el.appendChild(img);
  const badgeKey = getUserBadge(user);
  if (badgeKey) {
    const badgeDef = BADGES.find(b => b.key === badgeKey);
    if (badgeDef) {
      const badgeImg = document.createElement('img');
      badgeImg.src = badgeDef.src;
      badgeImg.className = 'avatar-badge';
      container.appendChild(badgeImg);
    }
  }
}

// 给帖子/评论头像追加徽章（不重复添加）
function appendPostBadge(av, badgeKey) {
  if (!badgeKey) return;
  const cls = av.classList.contains('comment-avatar') ? 'comment-avatar-badge' : 'post-avatar-badge';
  av.querySelectorAll('.' + cls).forEach(b => b.remove());
  const def = BADGES.find(b => b.key === badgeKey);
  if (!def) return;
  const img = document.createElement('img');
  img.src = def.src;
  img.className = cls;
  av.appendChild(img);
}

function refreshHomeUser() {
  if (!currentUser) return;
  $('homeUserName').textContent = currentUser.name || '玩家';
  $('homeUserPhone').textContent = '手机: ' + maskPhone(currentUser.phone);
  renderAvatar($('homeAvatar'), currentUser);
  refreshWelcomeBadge();
}

function refreshMineUser() {
  if (!currentUser) return;
  $('mineUserName').textContent = currentUser.name || '玩家';
  $('mineUserPhone').textContent = '手机: ' + maskPhone(currentUser.phone);
  renderAvatar($('mineAvatar'), currentUser);
}

// ============================================================
// 页面导航
// ============================================================
const PAGE_IDS = ['login', 'home', 'community', 'activity', 'mine', 'profile-edit', 'author', 'link', 'roomlist', 'messages', 'feedback', 'settings', 'about'];
let navStack = ['login'];
let currentPage = 'login';

const NAV_PAGES = ['home', 'mine', 'feedback'];

function showPage(name) {
  const prev = currentPage;
  PAGE_IDS.forEach(p => {
    const el = $('page-' + p);
    if (el) el.classList.toggle('active', p === name);
  });
  currentPage = name;
  if ($('bottomNav')) $('bottomNav').style.display = NAV_PAGES.includes(name) ? 'flex' : 'none';

  if ((prev === 'mine' && name === 'profile-edit') || (prev === 'profile-edit' && name === 'mine')) {
    triggerMineProfileAnim(prev, name);
  }
  if ((prev === 'community' && name === 'author') || (prev === 'author' && name === 'community')) {
    triggerMineProfileAnim(prev, name);
  }

  if (name === 'community') { syncPendingPosts(); loadPosts(); }
  if (name === 'activity') loadActivities();
  if (name === 'roomlist') loadRooms();
  if (name === 'profile-edit') { fillProfileForm(); renderProfileInfo(); }
  if (name === 'about') retriggerCreditsFade();
  if (name === 'settings') { updateThemeUI(localStorage.getItem(LS_THEME) || 'auto'); updateFpsUI(); }
  if (name === 'messages') loadMessages();
}

function triggerMineProfileAnim(from, to) {
  const fromCards = document.querySelectorAll('#page-' + from + ' .anim-card');
  const toCards = document.querySelectorAll('#page-' + to + ' .anim-card');
  fromCards.forEach(c => c.classList.remove('anim-out-up', 'anim-in-up'));
  toCards.forEach(c => c.classList.remove('anim-out-up', 'anim-in-up'));
  void document.body.offsetWidth;
  fromCards.forEach(c => c.classList.add('anim-out-up'));
  toCards.forEach(c => c.classList.add('anim-in-up'));
  setTimeout(() => {
    fromCards.forEach(c => c.classList.remove('anim-out-up', 'anim-in-up'));
    toCards.forEach(c => c.classList.remove('anim-out-up', 'anim-in-up'));
  }, 520);
}

function navigateTo(name) {
  navStack.push(name);
  showPage(name);
}

function goBack() {
  // 先关闭所有弹窗/面板
  const modals = ['createActivityModal', 'deleteConfirmModal', 'commentOverlay', 'createRoomModal', 'roomActionModal', 'deleteRoomModal', 'activityMenu'];
  for (const id of modals) {
    const el = $(id);
    if (el && (el.style.display === 'flex' || el.classList.contains('show'))) {
      el.style.display = 'none';
      el.classList.remove('show');
      return;
    }
  }
  // 再返回页面
  if (navStack.length > 1) {
    navStack.pop();
    showPage(navStack[navStack.length - 1]);
  } else {
    showPage('home');
    navStack = ['home'];
  }
}

function openProfileEdit(from) {
  profileEditReturnTo = from || 'mine';
  navigateTo('profile-edit');
}

// ============================================================
// 触摸滑动（仅主页响应）
// ============================================================
let touchStart = null;
function bindGestures() {
  const home = $('page-home');
  home.addEventListener('touchstart', (e) => {
    if (!$('page-home').classList.contains('active')) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  home.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (Math.max(absX, absY) < 50) return;
    if (absX > absY) {
      if (dx > 0) navigateTo('community');
      else showToast('意见箱暂未开发');
    } else {
      if (dy > 0) navigateTo('community');
    }
  }, { passive: true });
}

// ============================================================
// 每月 1 号自动清空帖子
// ============================================================
async function monthlyClearCheck() {
  if (!db) return;
  const cur = currentMonthKey();
  try {
    // 清空标记存在云端，所有设备共享，避免各自反复清空
    const data = await db.read();
    const cloudMonth = data.last_clear_month || '';
    const localMonth = localStorage.getItem(LS.CLEAR_MONTH) || '';
    // 云端和本地都确认过本月，才跳过
    if (cloudMonth === cur && localMonth === cur) return;

    if (cloudMonth !== cur) {
      // 新月份：只清空帖子，保留活动/房间/关注/通知
      data.posts = [];
      data.last_clear_month = cur;
      await db.write(data);
      console.log('[颜娱] 月度清空：仅帖子已清空，其他数据保留');
    }
    localStorage.setItem(LS.CLEAR_MONTH, cur);
  } catch (e) {
    console.warn('[颜娱] 月度检查失败:', e.message);
  }
}

// ============================================================
// 社区：帖子 + 点赞 + 评论
// ============================================================
let _cachedCloudPosts = null;
let _firstLoadDone = false;

async function loadPosts(silent) {
  await monthlyClearCheck();
  let posts = [];
  let cloudOk = false;
  if (db) {
    try {
      if (!_firstLoadDone && !silent) showToast('正在加载云端帖子...');
      posts = await db.posts.select();
      cloudOk = true;
      _cachedCloudPosts = posts;
      _firstLoadDone = true;
    } catch (e) {
      console.warn('[颜娱] 加载帖子失败:', e.message);
    }
  }
  if (cloudOk) {
    _cachedCloudPosts = posts;
  } else if (_cachedCloudPosts) {
    posts = _cachedCloudPosts;
  } else {
    posts = getLocal(LS.POSTS) || [];
  }

  // 合并本地未同步的帖子（自己发的但还没传到云端的），保证自己能看到
  if (cloudOk && currentUser) {
    const localPosts = getLocal(LS.POSTS) || [];
    const pending = getLocal('yanyu_pending_posts') || [];
    const cloudIds = new Set(posts.map(p => p.id));
    const unsynced = [...localPosts, ...pending].filter(p =>
      p.user_id === currentUser.id && !cloudIds.has(p.id)
    );
    // 去重
    const seen = new Set();
    const uniqueUnsynced = unsynced.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    if (uniqueUnsynced.length) {
      posts = [...uniqueUnsynced, ...posts];
    }
  }

  // 关注tab过滤
  if (communityTab === 'follow') {
    const follows = db ? await db.follows.select().catch(() => []) : [];
    const followIds = follows.filter(f => f.follower_id === currentUser?.id).map(f => f.followee_id);
    posts = posts.filter(p => followIds.includes(p.user_id));
  }

  // 静默刷新：数据没变就不重渲染，避免卡顿
  if (silent) {
    const ids = posts.map(p => p.id + (p.comments ? p.comments.length : 0)).join(',');
    if (ids === _lastPostIds) return;
    _lastPostIds = ids;
  } else {
    _lastPostIds = posts.map(p => p.id).join(',');
  }

  renderPosts(posts);
}

function renderPosts(posts) {
  const feed = $('communityFeed');
  feed.innerHTML = '';
  if (!posts.length) {
    const es = document.createElement('div');
    es.className = 'empty-state';
    es.textContent = communityTab === 'follow' ? '暂无关注的人发布帖子' : '暂无任何信息';
    feed.appendChild(es);
    return;
  }
  posts.forEach(p => feed.appendChild(createPostCard(p)));
}

function createPostCard(post) {
  const card = document.createElement('div');
  card.className = 'post-card';
  card.dataset.postId = post.id || '';
  card.dataset.userId = post.user_id || '';

  // 头部（点击头像/名字进入作者主页）
  const head = document.createElement('div');
  head.className = 'post-head';
  head.style.cursor = 'pointer';
  const av = document.createElement('div');
  av.className = 'post-avatar';
  if (post.user_avatar) {
    av.innerHTML = `<img src="${post.user_avatar}">`;
  } else {
    av.textContent = (post.user_name || '?').slice(0, 1);
  }
  const un = document.createElement('div');
  un.className = 'post-username';
  un.textContent = post.user_name || '玩家';
  // 当前用户发的帖子，徽章显示在用户名后面
  if (currentUser && post.user_id === currentUser.id) {
    const key = post.badge_key || localStorage.getItem(LS_BADGE) || '';
    const def = BADGES.find(b => b.key === key);
    if (def) {
      const img = document.createElement('img');
      img.src = def.src;
      img.className = 'post-badge-inline';
      un.appendChild(img);
    }
  }
  const tm = document.createElement('div');
  tm.className = 'post-time';
  tm.textContent = post.created_at ? new Date(post.created_at).toLocaleString('zh-CN') : '';
  head.appendChild(av); head.appendChild(un); head.appendChild(tm);
  head.addEventListener('click', () => openAuthorPage(post));
  card.appendChild(head);

  if (post.content) {
    const c = document.createElement('div');
    c.className = 'post-content';
    c.innerHTML = renderContent(post.content);
    card.appendChild(c);
  }
  if (post.image_url) {
    const img = document.createElement('img');
    img.className = 'post-img';
    img.src = post.image_url;
    card.appendChild(img);
  }
  if (post.video_url) {
    const video = document.createElement('video');
    video.className = 'post-video';
    video.src = post.video_url;
    video.controls = true;
    video.playsInline = true;
    card.appendChild(video);
  }
  if (post.file_url) {
    const a = document.createElement('a');
    a.className = 'post-file';
    a.href = post.file_url;
    a.download = post.file_name || 'map.gbmap';
    a.textContent = '附件：' + (post.file_name || '地图文件.gbmap');
    card.appendChild(a);
  }

  // 同步状态提示（仅本人帖子且未同步时显示）
  if (currentUser && post.user_id === currentUser.id && (post._sync_skipped || post._sync_failures >= 5)) {
    const tip = document.createElement('div');
    tip.className = 'post-sync-status';
    tip.textContent = '⚠ 仅本地可见，其他用户看不到';
    card.appendChild(tip);
  }

  // 评论栏
  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const commentDiv = document.createElement('div');
  commentDiv.className = 'post-action';
  commentDiv.innerHTML = `<span class="post-action-icon">💬</span><span class="comment-count">${post.comments ? post.comments.length : 0}</span>`;
  commentDiv.addEventListener('click', (e) => { e.stopPropagation(); openCommentPanel(post); });
  actions.appendChild(commentDiv);

  card.appendChild(actions);
  bindPostLongPress(card, post);
  return card;
}

// 评论面板
function openCommentPanel(post) {
  if (!currentUser) { showToast('请先登录'); return; }
  currentCommentPost = post;
  $('commentOverlay').style.display = 'flex';
  $('commentInput').value = '';
  renderComments(post);
}

function closeCommentPanel() {
  $('commentOverlay').style.display = 'none';
  currentCommentPost = null;
}

function renderComments(post) {
  const list = $('commentList');
  list.innerHTML = '';
  const comments = post.comments || [];
  if (!comments.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px 0;font-size:16px;">暂无评论，快来抢沙发</div>';
    return;
  }
  comments.forEach(c => list.appendChild(createCommentItem(c, post)));
}

function createCommentItem(comment, post) {
  const item = document.createElement('div');
  item.className = 'comment-item';

  const head = document.createElement('div');
  head.className = 'comment-head';
  const av = document.createElement('div');
  av.className = 'comment-avatar';
  av.textContent = (comment.user_name || '?').slice(0, 1);
  const name = document.createElement('span');
  name.className = 'comment-name';
  name.textContent = comment.user_name || '玩家';
  const time = document.createElement('span');
  time.className = 'comment-time';
  time.textContent = comment.created_at ? new Date(comment.created_at).toLocaleString('zh-CN') : '';
  head.appendChild(av); head.appendChild(name); head.appendChild(time);
  item.appendChild(head);

  const text = document.createElement('div');
  text.className = 'comment-text';
  text.innerHTML = renderContent(comment.content);
  item.appendChild(text);

  // 评论操作栏
  const actions = document.createElement('div');
  actions.className = 'comment-actions';
  const cLiked = currentUser && comment.likes && comment.likes.includes(currentUser.id);
  const likeBtn = document.createElement('span');
  likeBtn.className = 'comment-action' + (cLiked ? ' liked' : '');
  likeBtn.textContent = (cLiked ? '❤️ ' : '🤍 ') + (comment.likes ? comment.likes.length : 0) + ' 赞';
  likeBtn.addEventListener('click', () => toggleCommentLike(comment, post, likeBtn));
  const replyBtn = document.createElement('span');
  replyBtn.className = 'comment-action';
  replyBtn.textContent = '回复';
  replyBtn.addEventListener('click', () => {
    $('commentInput').placeholder = '回复 ' + (comment.user_name || '玩家') + '：';
    $('commentInput').dataset.replyTo = comment.id;
    $('commentInput').focus();
  });
  actions.appendChild(likeBtn);
  actions.appendChild(replyBtn);
  item.appendChild(actions);

  // 回复列表
  if (comment.replies && comment.replies.length) {
    const replyList = document.createElement('div');
    replyList.className = 'comment-reply-list';
    comment.replies.forEach(r => {
      const ri = document.createElement('div');
      ri.className = 'comment-reply-item';
      ri.innerHTML = `<span class="reply-name">${r.user_name || '玩家'}</span>：${renderContent(r.content)}`;
      replyList.appendChild(ri);
    });
    item.appendChild(replyList);
  }

  return item;
}

async function toggleCommentLike(comment, post, btn) {
  if (!currentUser || !db) return;
  const likes = comment.likes || [];
  const idx = likes.indexOf(currentUser.id);
  let newLikes;
  if (idx >= 0) {
    newLikes = likes.filter(id => id !== currentUser.id);
  } else {
    newLikes = [...likes, currentUser.id];
    if (comment.user_id !== currentUser.id) {
      try {
        await db.notifications.insert({
          to_user_id: comment.user_id,
          from_user_id: currentUser.id,
          from_user_name: currentUser.name,
          type: 'comment_like',
          content: currentUser.name + ' 赞了你的评论',
        });
      } catch (e) {}
    }
  }
  comment.likes = newLikes;
  // 更新post中的comment
  const comments = post.comments || [];
  const ci = comments.findIndex(c => c.id === comment.id);
  if (ci >= 0) comments[ci] = comment;
  try {
    await db.posts.update(post.id, { comments });
    const isLiked = newLikes.includes(currentUser.id);
    btn.className = 'comment-action' + (isLiked ? ' liked' : '');
    btn.textContent = (isLiked ? '❤️ ' : '🤍 ') + newLikes.length + ' 赞';
    updateMsgBadge();
  } catch (e) {
    showToast('操作失败');
  }
}

async function sendComment() {
  if (!currentUser || !currentCommentPost || !db) return;
  const input = $('commentInput');
  const content = input.value.trim();
  if (!content) return;

  const replyTo = input.dataset.replyTo;
  const comment = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    user_id: currentUser.id,
    user_name: currentUser.name,
    content: replyTo ? content : content,
    likes: [],
    replies: [],
    created_at: new Date().toISOString(),
  };

  const post = currentCommentPost;
  const comments = post.comments || [];

  if (replyTo) {
    // 回复某条评论
    const target = comments.find(c => c.id === replyTo);
    if (target) {
      if (!target.replies) target.replies = [];
      target.replies.push({
        id: 'r_' + Date.now(),
        user_id: currentUser.id,
        user_name: currentUser.name,
        content,
        created_at: new Date().toISOString(),
      });
      // 通知被回复者
      if (target.user_id !== currentUser.id) {
        try {
          await db.notifications.insert({
            to_user_id: target.user_id,
            from_user_id: currentUser.id,
            from_user_name: currentUser.name,
            type: 'reply',
            content: currentUser.name + ' 回复了你：' + content,
          });
        } catch (e) {}
      }
    }
  } else {
    comments.push(comment);
    // 通知帖子作者
    if (post.user_id !== currentUser.id) {
      try {
        await db.notifications.insert({
          to_user_id: post.user_id,
          from_user_id: currentUser.id,
          from_user_name: currentUser.name,
          type: 'comment',
          post_id: post.id,
          content: currentUser.name + ' 评论了你的帖子：' + content,
        });
      } catch (e) {}
    }
  }

  try {
    await db.posts.update(post.id, { comments });
    post.comments = comments;
    input.value = '';
    input.placeholder = '说点什么...';
    delete input.dataset.replyTo;
    renderComments(post);
    // 更新帖子卡片的评论数
    loadPosts();
    updateMsgBadge();
  } catch (e) {
    showToast('评论失败: ' + e.message);
  }
}

// ============================================================
// 作者主页 + 关注
// ============================================================
async function openAuthorPage(post) {
  const badgeKey = post.badge_key || (currentUser && currentUser.id === post.user_id ? (localStorage.getItem(LS_BADGE) || '') : '');
  currentAuthor = {
    id: post.user_id,
    name: post.user_name,
    avatar_url: post.user_avatar || '',
    badge_key: badgeKey,
  };
  $('authorName').textContent = post.user_name || '玩家';
  $('authorBio').textContent = '';
  renderAvatar($('authorAvatar'), currentAuthor);

  // 检查是否已关注
  let isFollowing = false;
  if (db && currentUser) {
    try {
      const follows = await db.follows.select();
      isFollowing = follows.some(f => f.follower_id === currentUser.id && f.followee_id === post.user_id);
    } catch (e) {}
  }
  const followBtn = $('authorFollowBtn');
  followBtn.textContent = isFollowing ? '已关注' : '关注';
  followBtn.classList.toggle('followed', isFollowing);

  // 加载作者的帖子
  const list = $('authorInfoList');
  const empty = $('authorInfoEmpty');
  list.innerHTML = '';
  let authorPosts = [];
  if (db) {
    try {
      const allPosts = await db.posts.select();
      authorPosts = allPosts.filter(p => p.user_id === post.user_id);
    } catch (e) {}
  }
  if (!authorPosts.length) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    authorPosts.forEach(p => {
      const card = document.createElement('div');
      card.className = 'post-card';
      const c = document.createElement('div');
      c.className = 'post-content';
      c.innerHTML = renderContent(p.content || '[附件帖子]');
      card.appendChild(c);
      if (p.image_url) { const img = document.createElement('img'); img.className = 'post-img'; img.src = p.image_url; card.appendChild(img); }
      if (p.video_url) { const v = document.createElement('video'); v.className = 'post-video'; v.src = p.video_url; v.controls = true; v.playsInline = true; card.appendChild(v); }
      list.appendChild(card);
    });
  }

  navigateTo('author');
}

async function toggleFollow() {
  if (!currentUser || !currentAuthor || !db) return;
  try {
    const isNowFollowing = await db.follows.toggle(currentUser.id, currentAuthor.id);
    const btn = $('authorFollowBtn');
    btn.textContent = isNowFollowing ? '已关注' : '关注';
    btn.classList.toggle('followed', isNowFollowing);
    showToast(isNowFollowing ? '关注成功' : '已取消关注');
  } catch (e) {
    showToast('操作失败: ' + e.message);
  }
}

// ============================================================
// 长按删除自己的帖子
// ============================================================
let pendingDeletePost = null;
let pendingDeleteCard = null;

function bindPostLongPress(card, post) {
  let timer = null;
  let startX = 0, startY = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const onStart = (x, y) => {
    startX = x; startY = y;
    clear();
    timer = setTimeout(() => { timer = null; onLongPress(post, card); }, 600);
  };
  const onMove = (x, y) => {
    if (!timer) return;
    if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) clear();
  };
  card.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('touchend', clear);
  card.addEventListener('touchcancel', clear);
}

function onLongPress(post, card) {
  if (!currentUser || post.user_id !== currentUser.id) {
    showToast('只能删除自己的帖子');
    return;
  }
  pendingDeletePost = post;
  pendingDeleteCard = card;
  $('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteConfirm() {
  $('deleteConfirmModal').style.display = 'none';
  pendingDeletePost = null;
  pendingDeleteCard = null;
}

async function confirmDeletePost() {
  const post = pendingDeletePost;
  const card = pendingDeleteCard;
  if (!post) { closeDeleteConfirm(); return; }
  if (db) {
    try { await db.posts.delete(post.id); } catch (e) { console.warn('删除失败:', e.message); }
  }
  const local = getLocal(LS.POSTS) || [];
  setLocal(LS.POSTS, local.filter(p => p.id !== post.id));
  if (card && card.parentNode) card.parentNode.removeChild(card);
  closeDeleteConfirm();
  showToast('删除成功');
  loadPosts();
}

function switchTab(tab) {
  communityTab = tab;
  document.querySelectorAll('.tab-bar .tab-item').forEach(el => el.classList.remove('active'));
  document.querySelector('.tab-bar .tab-item[data-tab="' + tab + '"]').classList.add('active');
  if (tab === 'hot') {
    showToast('热门暂未开发');
    return;
  }
  loadPosts();
}

// ============================================================
// 发帖栏
// ============================================================
const EMOJI_FILES = [
  'Acknowledge.png','Admin.png','Administrator.png','Angry.png','Animosity.png',
  'Beggar.png','Bleeding1.png','Bleeding2.png','Bleeding3.png','Blind.png',
  'Classic.png','Clown.png','Cold.png','Cool.png','Cringe.png','CryingLaugh.png',
  'Developer.png','DevHelper.png','Dumb.png','EliteArtist.png','Exhausted.png',
  'Gary.png','GB27.png','Gigachad.png','Godlike.png','GoreZone.png',
  'Happy.png','HoS.png','Hot.png','Human 1.png','Human 2.png',
  'Human 3.png','Insane.png','Invisible.png','Love.png','LowOnBlood.png',
  'Manly.png','Menace.png','Mindblown.png','Mutant.png','Mutant_0.png',
  'Mutated.png','Nerd.png','Nervous.png','Neutral.png','Noclip.png',
  'Oddity.png','OutOfBreath.png','Pain.png','Police.png','Profile.png',
  'RealityCrusher.png','Remaster.png','Rich.png','Robber.png','Sad.png',
  'Salute.png','Shadow.png','Stare.png','Suffocating.png','Suspicious.png',
  'Terrified.png','Trollface.png','Vomit.png','Wasted.png',
];

function initEmojiPicker() {
  const grid = $('emojiGrid');
  if (!grid) return;
  grid.innerHTML = '';
  EMOJI_FILES.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'emoji-item';
    btn.title = name.replace('.png','');
    const img = document.createElement('img');
    img.src = 'assets/emojis/' + name;
    img.alt = name.replace('.png','');
    img.loading = 'lazy';
    btn.appendChild(img);
    btn.addEventListener('click', () => { insertEmoji(name.replace('.png','')); closeEmojiPanel(); });
    grid.appendChild(btn);
  });
}

function openEmojiPanel() {
  $('emojiPanel').style.display = 'flex';
  $('attachmentMenu').style.display = 'none';
}
function closeEmojiPanel() {
  $('emojiPanel').style.display = 'none';
}
function insertEmoji(name) {
  const input = $('postInput');
  const start = input.selectionStart || input.value.length;
  const end = input.selectionEnd || input.value.length;
  const marker = '%%' + name + '%%';
  input.value = input.value.slice(0, start) + marker + input.value.slice(end);
  input.focus();
  input.selectionStart = input.selectionEnd = start + marker.length;
}
function renderContent(text) {
  if (!text) return '';
  return text.replace(/%%([^%]+)%%/g, (_, name) => {
    const src = 'assets/emojis/' + name.trim() + '.png';
    return '<img src="' + src + '" class="emoji-inline" alt="' + name + '">';
  });
}

function toggleAttachmentMenu() {
  const m = $('attachmentMenu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function pickImage() {
  $('attachmentMenu').style.display = 'none';
  $('hiddenImageInput').value = '';
  $('hiddenImageInput').click();
}

function pickFile() {
  $('attachmentMenu').style.display = 'none';
  $('hiddenFileInput').value = '';
  $('hiddenFileInput').click();
}

function pickVideo() {
  $('attachmentMenu').style.display = 'none';
  $('hiddenVideoInput').value = '';
  $('hiddenVideoInput').click();
}

function bindPickers() {
  $('hiddenImageInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    showToast('正在处理图片...');
    try {
      const b64 = await fileToBase64(f);
      pendingAttachment = { type: 'image', file: f, name: f.name, url: b64 };
      showPreview();
    } catch (err) {
      showToast('图片处理失败');
    }
  });
  $('hiddenFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.gbmap$/i.test(f.name)) {
      showToast('仅支持 .gbmap 文件');
      pendingAttachment = null;
      return;
    }
    showToast('正在处理文件...');
    try {
      const b64 = await fileToBase64(f);
      pendingAttachment = { type: 'file', file: f, name: f.name, url: b64 };
      showPreview();
    } catch (err) {
      showToast('文件处理失败');
    }
  });
  $('hiddenVideoInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      showToast('请选择视频文件');
      pendingAttachment = null;
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      showToast('视频超过 2MB，仅本地可见（其他用户看不到）');
    }
    showToast('正在处理视频...');
    try {
      const b64 = await fileToBase64(f);
      pendingAttachment = { type: 'video', file: f, name: f.name, url: b64 };
      showPreview();
    } catch (err) {
      showToast('视频处理失败');
    }
  });
}

// 云端帖子大小限制（约 500KB base64），超过则仅本地保存不同步
const MAX_CLOUD_POST_SIZE = 500 * 1024;

function estimatePostSize(post) {
  let size = 0;
  if (post.content) size += post.content.length * 2;
  if (post.image_url) size += post.image_url.length;
  if (post.video_url) size += post.video_url.length;
  if (post.file_url) size += post.file_url.length;
  if (post.user_avatar) size += post.user_avatar.length;
  return size;
}

function showPreview() {
  if (!pendingAttachment) { $('attachmentPreview').style.display = 'none'; return; }
  $('attachmentPreview').style.display = 'flex';
  $('previewItem').textContent = pendingAttachment.name;
}

function cancelAttachment() {
  pendingAttachment = null;
  $('attachmentPreview').style.display = 'none';
}

async function uploadToStorage(bucket, file, path) {
  return null; // npoint不支持文件存储
}

async function sendPost() {
  if (!currentUser) { showToast('请先登录'); return; }
  const input = $('postInput');
  const content = input.value.trim();
  if (!content && !pendingAttachment) { showToast('说点什么吧'); return; }

  let image_url = '', video_url = '', file_url = '', file_name = '';
  if (pendingAttachment) {
    if (pendingAttachment.type === 'image') {
      image_url = pendingAttachment.url;
    } else if (pendingAttachment.type === 'video') {
      video_url = pendingAttachment.url;
    } else {
      file_name = pendingAttachment.name;
      file_url = pendingAttachment.url;
    }
  }

  const post = {
    id: YanyuUser.uuid(),
    user_id: currentUser.id,
    user_name: currentUser.name,
    user_avatar: currentUser.avatar_url || '',
    content, image_url, video_url, file_url, file_name,
    comments: [],
    created_at: new Date().toISOString(),
  };

  // 本地缓存只存精简版（无大图），最多50条，避免撑满localStorage
  const local = getLocal(LS.POSTS) || [];
  local.unshift(slimPost(post));
  setLocal(LS.POSTS, local.slice(0, 50));

  if (db) {
    const postSize = estimatePostSize(post);
    if (postSize > MAX_CLOUD_POST_SIZE) {
      showToast('附件太大，仅本地保存（其他用户不可见）');
      post._sync_skipped = true;
      post._sync_reason = 'too_large';
    } else {
      try {
        await db.posts.insert(post);
        showToast('发帖成功');
      } catch (e) {
        // 加入待同步队列，联网后自动重发（最多重试 5 次）
        post._sync_failures = (post._sync_failures || 0) + 1;
        const queue = getLocal('yanyu_pending_posts') || [];
        queue.push(post);
        setLocal('yanyu_pending_posts', queue);
        showToast('发帖已保存，将在网络恢复后自动同步');
      }
    }
  } else {
    const queue = getLocal('yanyu_pending_posts') || [];
    post._sync_failures = 1;
    queue.push(post);
    setLocal('yanyu_pending_posts', queue);
    showToast('未连接云端，将在联网后自动同步');
  }

  input.value = '';
  cancelAttachment();
  loadPosts();
}

// 同步待发送的帖子（每次轮询时检查，最多重试 5 次）
const MAX_SYNC_RETRIES = 5;
async function syncPendingPosts() {
  const queue = getLocal('yanyu_pending_posts') || [];
  if (!queue.length || !db) return;
  const remaining = [];
  let synced = 0;
  let failed = 0;
  for (const post of queue) {
    const size = estimatePostSize(post);
    if (size > MAX_CLOUD_POST_SIZE) {
      failed++;
      continue; // 太大的直接跳过，不重试
    }
    try {
      await db.posts.insert(post);
      synced++;
    } catch (e) {
      post._sync_failures = (post._sync_failures || 0) + 1;
      if (post._sync_failures < MAX_SYNC_RETRIES) {
        remaining.push(post);
      } else {
        failed++;
        console.warn('[颜娱] 帖子同步失败已达上限，放弃:', post.id, e.message);
      }
    }
  }
  setLocal('yanyu_pending_posts', remaining);
  if (synced > 0) {
    showToast(synced + '条帖子已同步到云端');
    loadPosts();
  }
}

// 轮询刷新（30秒，减少卡顿）
let _pollTimer = null;
let _lastPostIds = '';
function subscribePosts() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if ($('page-community') && $('page-community').classList.contains('active')) {
      loadPosts(true);
    }
    syncPendingPosts();
    updateMsgBadge();
  }, 30000);
}

// ============================================================
// 活动
// ============================================================
function toggleActivityMenu() {
  const m = $('activityMenu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

async function loadActivities() {
  let acts = [];
  if (db) {
    try { acts = await db.activities.select(); } catch (e) { console.warn('加载活动失败:', e.message); }
  }
  if (!acts.length) acts = getLocal(LS.ACTIVITIES) || [];
  renderActivities(acts);
}

function renderActivities(acts) {
  const list = $('activityList');
  list.innerHTML = '';
  if (!acts.length) {
    const es = document.createElement('div');
    es.className = 'empty-state';
    es.textContent = '暂无任何活动';
    list.appendChild(es);
    return;
  }
  acts.forEach(a => {
    const card = document.createElement('div');
    card.className = 'activity-card size-' + (a.size || 'small');
    const title = document.createElement('div');
    title.className = 'activity-card-title';
    title.textContent = a.title;
    const meta = document.createElement('div');
    meta.className = 'activity-card-meta';
    meta.textContent = `${a.time}  ·  东道主：${a.user_name || '玩家'}`;
    const sizeTag = document.createElement('div');
    sizeTag.className = 'activity-card-size';
    sizeTag.textContent = a.size === 'large' ? '大方面' : a.size === 'medium' ? '中方面' : '小方面';
    card.appendChild(title); card.appendChild(meta); card.appendChild(sizeTag);
    if (a.image_url) {
      const img = document.createElement('img');
      img.src = a.image_url;
      card.appendChild(img);
    }
    list.appendChild(card);
  });
}

function openCreateActivityModal() {
  if (!currentUser) { showToast('请先登录'); return; }
  $('createActivityModal').style.display = 'flex';
  $('actTitle').value = '';
  $('actTime').value = '';
  pendingActivityImage = null;
  $('largeImageArea').style.display = 'none';
  $('largeImagePreview').style.display = 'none';
  selectSize('small');
  refreshCreditCounts();
}

function closeCreateActivityModal() {
  $('createActivityModal').style.display = 'none';
}

function selectSize(size) {
  activitySelectedSize = size;
  ['small', 'medium', 'large'].forEach(s => {
    document.querySelector(`.size-option[data-size="${s}"]`).classList.toggle('selected', s === size);
  });
  $('largeImageArea').style.display = size === 'large' ? 'block' : 'none';
}

function refreshCreditCounts() {
  $('mediumCount').textContent = currentUser ? (currentUser.medium_credits || 0) : 0;
  $('largeCount').textContent = currentUser ? (currentUser.large_credits || 0) : 0;
}

function claimMediumCredit(e) {
  if (e) e.stopPropagation();
  if (!currentUser) return;
  const today = YanyuUser.today();
  if (currentUser.last_credit_claim === today) {
    showToast('今天已领取过啦');
    return;
  }
  currentUser.medium_credits = (currentUser.medium_credits || 0) + 1;
  currentUser.last_credit_claim = today;
  persistUser();
  refreshCreditCounts();
  showToast('领取成功 +1 次');
}

function pickActivityImage() {
  $('activityImageInput').value = '';
  $('activityImageInput').click();
}

function bindActivityImagePicker() {
  $('activityImageInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const b64 = await fileToBase64(f);
      pendingActivityImage = b64;
      $('largeImageImg').src = b64;
      $('largeImagePreview').style.display = 'block';
    } catch (err) {
      showToast('图片处理失败');
    }
  });
}

function cancelLargeImage() {
  pendingActivityImage = null;
  $('largeImagePreview').style.display = 'none';
}

async function publishActivity() {
  if (!currentUser) { showToast('请先登录'); return; }
  const title = $('actTitle').value.trim();
  const time = $('actTime').value.trim();
  if (!title) { showToast('请填写活动名称'); return; }
  if (!time) { showToast('请填写活动时间'); return; }
  if (activitySelectedSize === 'large' && (currentUser.large_credits || 0) <= 0) {
    showToast('大方面次数不足'); return;
  }
  if (activitySelectedSize === 'medium' && (currentUser.medium_credits || 0) <= 0) {
    showToast('中方面次数不足，请先领取今日次数'); return;
  }

  let image_url = '';
  if (activitySelectedSize === 'large' && pendingActivityImage) {
    image_url = pendingActivityImage;
  }

  if (activitySelectedSize === 'medium') currentUser.medium_credits -= 1;
  if (activitySelectedSize === 'large') currentUser.large_credits -= 1;
  persistUser();

  const act = {
    id: YanyuUser.uuid(),
    user_id: currentUser.id,
    user_name: currentUser.name,
    title, time, size: activitySelectedSize, image_url,
    created_at: new Date().toISOString(),
  };

  const local = getLocal(LS.ACTIVITIES) || [];
  local.unshift(act);
  setLocal(LS.ACTIVITIES, local);

  if (db) {
    try { await db.activities.insert(act); } catch (e) { console.warn('活动写入失败:', e.message); }
  }

  closeCreateActivityModal();
  loadActivities();
  showToast('活动已发布');
}

// ============================================================
// 联机房间
// ============================================================
async function loadRooms() {
  let rooms = [];
  if (db) {
    try { rooms = await db.rooms.select(); } catch (e) { console.warn('加载房间失败:', e.message); }
  }
  renderRooms(rooms);
}

function renderRooms(rooms) {
  const list = $('roomList');
  list.innerHTML = '';
  if (!rooms.length) {
    const es = document.createElement('div');
    es.className = 'empty-state';
    es.textContent = '暂无任何房间';
    list.appendChild(es);
    return;
  }
  rooms.forEach(r => list.appendChild(createRoomCard(r)));
}

function createRoomCard(room) {
  const card = document.createElement('div');
  card.className = 'room-card';
  card.dataset.roomId = room.id;

  const head = document.createElement('div');
  head.className = 'room-head';
  const gameTag = document.createElement('span');
  gameTag.className = 'room-game-tag';
  gameTag.textContent = room.game || '游戏';
  head.appendChild(gameTag);
  if (room.server) {
    const serverTag = document.createElement('span');
    serverTag.className = 'room-server-tag';
    serverTag.textContent = room.server;
    head.appendChild(serverTag);
  }
  if (room.password) {
    const lockTag = document.createElement('span');
    lockTag.className = 'room-lock-tag';
    lockTag.textContent = '🔒';
    head.appendChild(lockTag);
  }
  card.appendChild(head);

  const name = document.createElement('div');
  name.className = 'room-name';
  name.textContent = room.name || '未命名房间';
  card.appendChild(name);

  if (room.announce) {
    const ann = document.createElement('div');
    ann.className = 'room-announce';
    ann.textContent = room.announce;
    card.appendChild(ann);
  }

  const meta = document.createElement('div');
  meta.className = 'room-meta';
  meta.innerHTML = `<span>房主：${room.user_name || '玩家'}</span><span>${room.created_at ? new Date(room.created_at).toLocaleDateString('zh-CN') : ''}</span>`;
  card.appendChild(meta);

  // 长按
  bindRoomLongPress(card, room);
  return card;
}

function bindRoomLongPress(card, room) {
  let timer = null;
  let startX = 0, startY = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const onStart = (x, y) => {
    startX = x; startY = y;
    clear();
    timer = setTimeout(() => { timer = null; onRoomLongPress(room); }, 600);
  };
  const onMove = (x, y) => {
    if (!timer) return;
    if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) clear();
  };
  card.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  card.addEventListener('touchend', clear);
}

function onRoomLongPress(room) {
  pendingDeleteRoom = room;
  // 显示操作弹窗
  const deleteBtn = $('roomDeleteBtn');
  if (currentUser && room.user_id === currentUser.id) {
    deleteBtn.style.display = 'block';
  } else {
    deleteBtn.style.display = 'none';
  }
  $('roomActionModal').style.display = 'flex';
}

function copyRoomAnnounce() {
  if (pendingDeleteRoom && pendingDeleteRoom.announce) {
    const ta = document.createElement('textarea');
    ta.value = pendingDeleteRoom.announce;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('公告已复制'); } catch (e) { showToast('复制失败'); }
    document.body.removeChild(ta);
  } else {
    showToast('该房间没有公告');
  }
  $('roomActionModal').style.display = 'none';
}

function showDeleteRoomConfirm() {
  $('roomActionModal').style.display = 'none';
  $('deleteRoomModal').style.display = 'flex';
}

async function confirmDeleteRoom() {
  if (!pendingDeleteRoom) return;
  if (db) {
    try { await db.rooms.delete(pendingDeleteRoom.id); } catch (e) { showToast('删除失败'); return; }
  }
  $('deleteRoomModal').style.display = 'none';
  pendingDeleteRoom = null;
  showToast('房间已删除');
  loadRooms();
}

function openCreateRoomModal() {
  if (!currentUser) { showToast('请先登录'); return; }
  $('createRoomModal').style.display = 'flex';
  $('roomGame').value = '';
  $('roomServer').value = '';
  $('roomName').value = '';
  $('roomPassword').value = '';
  $('roomAnnounce').value = '';
  $('publishRoomBtn').style.display = 'none';
}

function closeCreateRoomModal() {
  $('createRoomModal').style.display = 'none';
}

function checkRoomForm() {
  const game = $('roomGame').value.trim();
  const name = $('roomName').value.trim();
  $('publishRoomBtn').style.display = (game && name) ? 'block' : 'none';
}

async function publishRoom() {
  if (!currentUser) return;
  const game = $('roomGame').value.trim();
  const name = $('roomName').value.trim();
  if (!game || !name) { showToast('游戏名称和房间名称必填'); return; }

  const room = {
    id: 'r_' + Date.now(),
    user_id: currentUser.id,
    user_name: currentUser.name,
    game,
    server: $('roomServer').value,
    name,
    password: $('roomPassword').value.trim(),
    announce: $('roomAnnounce').value.trim(),
    created_at: new Date().toISOString(),
  };

  if (db) {
    try {
      await db.rooms.insert(room);
      showToast('创建成功');
      closeCreateRoomModal();
      loadRooms();
    } catch (e) {
      showToast('创建失败: ' + e.message);
    }
  }
}

// ============================================================
// 消息通知
// ============================================================
async function updateMsgBadge() {
  const badge = $('msgBadge');
  if (!badge) return;
  if (!currentUser || !db) {
    badge.style.display = 'none';
    return;
  }
  try {
    const notifs = await db.notifications.select(currentUser.id);
    const unread = notifs.filter(n => !n.read).length;
    if (unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread > 99 ? '99+' : unread;
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    badge.style.display = 'none';
  }
}

async function openMyMessages() {
  navigateTo('messages');
}

async function loadMessages() {
  const list = $('msgList');
  const empty = $('msgEmpty');
  list.innerHTML = '';
  if (!currentUser || !db) { empty.style.display = 'block'; return; }

  try {
    const notifs = await db.notifications.select(currentUser.id);
    if (!notifs.length) {
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      notifs.forEach(n => {
        const item = document.createElement('div');
        item.className = 'msg-item';
        const head = document.createElement('div');
        head.className = 'msg-item-head';
        const av = document.createElement('div');
        av.className = 'msg-item-avatar';
        av.textContent = (n.from_user_name || '?').slice(0, 1);
        const name = document.createElement('span');
        name.className = 'msg-item-name';
        name.textContent = n.from_user_name || '玩家';
        const time = document.createElement('span');
        time.className = 'msg-item-time';
        time.textContent = n.created_at ? new Date(n.created_at).toLocaleString('zh-CN') : '';
        head.appendChild(av); head.appendChild(name); head.appendChild(time);
        item.appendChild(head);
        const text = document.createElement('div');
        text.className = 'msg-item-text';
        text.innerHTML = n.content ? renderContent(n.content) : '';
        item.appendChild(text);
        list.appendChild(item);
      });
    }
    // 标记已读
    await db.notifications.markRead(currentUser.id);
    updateMsgBadge();
  } catch (e) {
    empty.style.display = 'block';
  }
}

// ============================================================
// 个人资料
// ============================================================
async function persistUser() {
  if (!currentUser) return;
  const { password, ...safe } = currentUser;
  setLocal(LS.USER, safe);
  // 同步到本地用户库
  const users = getLocal(LS.USERS_DB) || [];
  const idx = users.findIndex(u => u.id === currentUser.id);
  if (idx >= 0) users[idx] = currentUser;
  setLocal(LS.USERS_DB, users);
  // 同步到云端用户表
  if (db) {
    try {
      await db.users.upsert(safe);
      console.log('[颜娱] 用户资料已同步云端:', currentUser.id);
    } catch (e) {
      console.warn('[颜娱] 同步云端用户失败:', e.message);
    }
  }
  // 同步所有已发布帖子中的名称、头像和徽章（本地）
  const posts = getLocal(LS.POSTS) || [];
  const badgeKey = localStorage.getItem(LS_BADGE) || '';
  let postChanged = false;
  posts.forEach(p => {
    if (p.user_id === currentUser.id) {
      if (p.user_name !== currentUser.name || p.user_avatar !== currentUser.avatar_url || p.badge_key !== badgeKey) {
        p.user_name = currentUser.name;
        p.user_avatar = currentUser.avatar_url || '';
        p.badge_key = badgeKey;
        postChanged = true;
      }
    }
  });
  if (postChanged) setLocal(LS.POSTS, posts);
  // 同步到云端帖子
  if (db && postChanged) {
    try {
      const allPosts = await db.posts.select();
      let cloudChanged = false;
      const updatedPosts = allPosts.map(p => {
        if (p.user_id === currentUser.id && (p.user_name !== currentUser.name || p.user_avatar !== currentUser.avatar_url || p.badge_key !== badgeKey)) {
          cloudChanged = true;
          return { ...p, user_name: currentUser.name, user_avatar: currentUser.avatar_url || '', badge_key: badgeKey };
        }
        return p;
      });
      if (cloudChanged) {
        await Promise.all(updatedPosts.map(p => db.posts.update(p.id, { user_name: currentUser.name, user_avatar: currentUser.avatar_url || '', badge_key: badgeKey })));
      }
    } catch (e) { console.warn('[颜娱] 同步云端帖子名称/头像失败:', e.message); }
  }
  refreshHomeUser();
  refreshMineUser();
  refreshAllAvatars();
}

function fillProfileForm() {
  if (!currentUser) return;
  $('formName').value = currentUser.name || '';
  $('formMainGame').value = currentUser.main_game || '';
  $('formBio').value = currentUser.bio || '';
  const av = $('profileAvatar');
  av.innerHTML = '';
  if (currentUser.avatar_url) {
    av.innerHTML = `<img src="${currentUser.avatar_url}">`;
  }
}

function changeAvatar() {
  $('avatarInput').value = '';
  $('avatarInput').click();
}

function bindAvatarPicker() {
  $('avatarInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f || !currentUser) return;
    showToast('正在处理头像...');
    try {
      currentUser.avatar_url = await fileToBase64(f);
      await persistUser();
      fillProfileForm();
      showToast('头像已更新');
    } catch (err) {
      showToast('头像处理失败');
    }
  });
}

async function saveProfile() {
  if (!currentUser) return;
  const name = $('formName').value.trim();
  if (!name) { showToast('名字不能为空'); return; }
  currentUser.name = name;
  currentUser.main_game = $('formMainGame').value.trim();
  currentUser.bio = $('formBio').value.trim();
  await persistUser();
  // 同步更新作者主页（如果正在查看自己）
  if (currentAuthor && currentAuthor.id === currentUser.id) {
    refreshAuthorCard();
  }
  // 同步更新社区帖子列表
  if (document.getElementById('page-community').classList.contains('active')) {
    loadPosts();
  }
  showToast('已保存');
}

function renderProfileInfo() {
  const list = $('profileInfoList');
  const empty = $('profileInfoEmpty');
  list.innerHTML = '';
  if (!currentUser) return;

  const myPosts = (getLocal(LS.POSTS) || []).filter(p => p.user_id === currentUser.id);
  const myActs = (getLocal(LS.ACTIVITIES) || []).filter(a => a.user_id === currentUser.id);

  if (!myPosts.length && !myActs.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  myPosts.forEach(p => {
    const card = document.createElement('div');
    card.className = 'post-card';
    const c = document.createElement('div');
    c.className = 'post-content';
    c.innerHTML = renderContent(p.content || '[附件帖子]');
    card.appendChild(c);
    if (p.image_url) { const img = document.createElement('img'); img.className = 'post-img'; img.src = p.image_url; card.appendChild(img); }
    if (p.video_url) { const v = document.createElement('video'); v.className = 'post-video'; v.src = p.video_url; v.controls = true; v.playsInline = true; card.appendChild(v); }
    list.appendChild(card);
  });
  myActs.forEach(a => {
    const card = document.createElement('div');
    card.className = 'activity-card size-' + (a.size || 'small');
    const t = document.createElement('div'); t.className = 'activity-card-title'; t.textContent = a.title;
    const m = document.createElement('div'); m.className = 'activity-card-meta'; m.textContent = a.time;
    card.appendChild(t); card.appendChild(m);
    list.appendChild(card);
  });
}

// ============================================================
// 绑定所有按钮（每个独立绑定，一个失败不影响其他）
// ============================================================
function bind(id, event, handler) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (el) el.addEventListener(event, handler);
  else console.warn('元素不存在:', id);
}

function bindAllButtons() {
  // 登录/注册（最优先）
  bind('tabLogin', 'click', () => setLoginMode('login'));
  bind('tabRegister', 'click', () => setLoginMode('register'));
  bind('loginSubmitBtn', 'click', doAuth);

  // 发帖
  bind('postSendBtn', 'click', sendPost);
  bind('postPlusBtn', 'click', toggleAttachmentMenu);
  bind('previewCancelBtn', 'click', cancelAttachment);
  bind('attPickFile', 'click', pickFile);
  bind('attPickImage', 'click', pickImage);
  bind('attPickVideo', 'click', pickVideo);
  bind('attPickVoice', 'click', () => showToast('语音暂未开发'));

  // 活动
  bind('activityMenuBtn', 'click', toggleActivityMenu);
  bind('actSearchItem', 'click', () => { showToast('搜索活动暂未开发'); toggleActivityMenu(); });
  bind('actCreateItem', 'click', () => { toggleActivityMenu(); openCreateActivityModal(); });
  bind('closeActModalBtn', 'click', closeCreateActivityModal);
  bind('publishActBtn', 'click', publishActivity);
  bind('claimMediumBtn', 'click', claimMediumCredit);
  bind('addLargeImgBtn', 'click', pickActivityImage);
  bind('cancelLargeImgBtn', 'click', cancelLargeImage);
  bind('createActivityModal', 'click', (e) => {
    if (e.target === $('createActivityModal')) closeCreateActivityModal();
  });
  document.querySelectorAll('.size-option').forEach(opt => {
    opt.addEventListener('click', () => selectSize(opt.dataset.size));
  });

  // 删除确认
  bind('delCancelBtn', 'click', closeDeleteConfirm);
  bind('delConfirmBtn', 'click', confirmDeletePost);
  bind('deleteConfirmModal', 'click', (e) => {
    if (e.target === $('deleteConfirmModal')) closeDeleteConfirm();
  });

  // 个人资料
  bind('profileAvatar', 'click', changeAvatar);
  bind('saveProfileBtn', 'click', saveProfile);
  bind('profileBackBtn', 'click', () => { showPage('mine'); navStack = ['home', 'mine']; });
  bind('authorFollowBtn', 'click', toggleFollow);

  // 评论
  bind('commentCloseBtn', 'click', closeCommentPanel);
  bind('commentSendBtn', 'click', sendComment);
  bind('commentOverlay', 'click', (e) => {
    if (e.target === $('commentOverlay')) closeCommentPanel();
  });

  // 房间
  bind('closeRoomModalBtn', 'click', closeCreateRoomModal);
  bind('publishRoomBtn', 'click', publishRoom);
  bind('createRoomModal', 'click', (e) => {
    if (e.target === $('createRoomModal')) closeCreateRoomModal();
  });
  bind('roomGame', 'input', checkRoomForm);
  bind('roomName', 'input', checkRoomForm);
  bind('roomCopyAnnounce', 'click', copyRoomAnnounce);
  bind('roomDeleteBtn', 'click', showDeleteRoomConfirm);
  bind('roomActionCancel', 'click', () => { $('roomActionModal').style.display = 'none'; });
  bind('roomActionModal', 'click', (e) => {
    if (e.target === $('roomActionModal')) $('roomActionModal').style.display = 'none';
  });
  bind('delRoomCancelBtn', 'click', () => { $('deleteRoomModal').style.display = 'none'; });
  bind('delRoomConfirmBtn', 'click', confirmDeleteRoom);
  bind('deleteRoomModal', 'click', (e) => {
    if (e.target === $('deleteRoomModal')) $('deleteRoomModal').style.display = 'none';
  });

  // 底部导航
  document.querySelectorAll('.bn-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  // 退出登录
  bind('logoutBtn', 'click', () => { showToast('已退出登录'); setTimeout(logout, 600); });

  // 徽章选择器
  bind('badgePickerOverlay', 'click', (e) => { if (e.target === $('badgePickerOverlay')) closeBadgePicker(); });
  bind('badgeClearBtn', 'click', clearBadge);

  // 表情
  bind('emojiBtn', 'click', openEmojiPanel);
  bind('emojiPanelClose', 'click', closeEmojiPanel);
}

// ============================================================
// 主题管理
// ============================================================
const LS_THEME = 'yanyu_theme';
const LS_BADGE = 'yanyu_badge';

function getEffectiveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  const h = new Date().getHours();
  return (h >= 6 && h < 18) ? 'light' : 'dark';
}

function applyTheme(pref) {
  const effective = getEffectiveTheme(pref);
  document.body.classList.toggle('dark', effective === 'dark');
}

function updateThemeUI(pref) {
  const map = { light: 'themeLightCheck', dark: 'themeDarkCheck', auto: 'themeAutoCheck' };
  Object.values(map).forEach(id => { const el = $(id); if (el) el.textContent = ''; });
  const active = $(map[pref]);
  if (active) active.textContent = '✓';
}

function setTheme(pref) {
  localStorage.setItem(LS_THEME, pref);
  applyTheme(pref);
  updateThemeUI(pref);
  updateThemeBtnIcon(pref);
  showToast(pref === 'auto' ? '已切换为跟随系统' : (pref === 'dark' ? '已切换为深色模式' : '已切换为浅色模式'));
}

function initTheme() {
  const pref = localStorage.getItem(LS_THEME) || 'auto';
  applyTheme(pref);
  updateThemeUI(pref);
  updateThemeBtnIcon(pref);
  const btn = document.getElementById('globalThemeBtn');
  if (btn) btn.addEventListener('click', cycleTheme);
}

const THEME_CYCLE = ['light', 'dark', 'auto'];

function cycleTheme() {
  const cur = localStorage.getItem(LS_THEME) || 'auto';
  const idx = THEME_CYCLE.indexOf(cur);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  setTheme(next);
}

function updateThemeBtnIcon(pref) {
  const btn = document.getElementById('globalThemeBtn');
  if (!btn) return;
  if (pref === 'dark') btn.textContent = '🌙';
  else if (pref === 'light') btn.textContent = '☀️';
  else btn.textContent = '⚙️';
}

// ============================================================
// 徽章管理
// ============================================================
let _currentBadgePage = 'home';

function openBadgePicker(page) {
  _currentBadgePage = page || 'home';
  renderBadgePicker();
  $('badgePickerOverlay').style.display = 'flex';
}

function closeBadgePicker() {
  $('badgePickerOverlay').style.display = 'none';
}

function renderBadgePicker() {
  const grid = $('badgePickerGrid');
  const selected = localStorage.getItem(LS_BADGE) || '';
  grid.innerHTML = '';
  BADGES.forEach(b => {
    const item = document.createElement('div');
    item.className = 'badge-picker-item' + (b.key === selected ? ' selected' : '');
    item.innerHTML = `<img src="${b.src}" alt="${b.name}"><span class="badge-name">${b.name}</span>`;
    item.addEventListener('click', () => selectBadge(b.key));
    grid.appendChild(item);
  });
}

function selectBadge(key) {
  localStorage.setItem(LS_BADGE, key);
  closeBadgePicker();
  refreshAllAvatars();
  showToast('徽章已更换');
  // 重新渲染社区帖子，让已发布的帖子显示新徽章
  if (document.getElementById('page-community').classList.contains('active')) {
    loadPosts();
  }
}

function clearBadge() {
  localStorage.removeItem(LS_BADGE);
  closeBadgePicker();
  refreshAllAvatars();
  showToast('已清除徽章');
  // 重新渲染社区帖子，让已发布的帖子清除徽章
  if (document.getElementById('page-community').classList.contains('active')) {
    loadPosts();
  }
}

function refreshAllAvatars() {
  if (currentUser) {
    renderAvatar($('homeAvatar'), currentUser);
    renderAvatar($('mineAvatar'), currentUser);
    renderAvatar($('profileAvatar'), currentUser);
    refreshWelcomeBadge();
  }
}

function refreshWelcomeBadge() {
  const wrap = $('welcomeBadgeWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const key = localStorage.getItem(LS_BADGE) || '';
  if (!key) return;
  const def = BADGES.find(b => b.key === key);
  if (!def) return;
  const img = document.createElement('img');
  img.src = def.src;
  img.className = 'welcome-badge-img';
  wrap.appendChild(img);
}

function refreshAuthorCard() {
  if (!currentAuthor || !currentUser) return;
  currentAuthor.name = currentUser.name;
  currentAuthor.avatar_url = currentUser.avatar_url || '';
  currentAuthor.badge_key = localStorage.getItem(LS_BADGE) || '';
  $('authorName').textContent = currentUser.name || '玩家';
  renderAvatar($('authorAvatar'), currentAuthor);
  // 重新渲染作者帖子列表（数据已由 persistUser 同步更新）
  const list = $('authorInfoList');
  const empty = $('authorInfoEmpty');
  list.innerHTML = '';
  const posts = getLocal(LS.POSTS) || [];
  const myPosts = posts.filter(p => p.user_id === currentUser.id);
  if (!myPosts.length) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    myPosts.forEach(p => {
      const card = document.createElement('div');
      card.className = 'post-card';
      const c = document.createElement('div');
      c.className = 'post-content';
      c.innerHTML = renderContent(p.content || '[附件帖子]');
      card.appendChild(c);
      if (p.image_url) { const img = document.createElement('img'); img.className = 'post-img'; img.src = p.image_url; card.appendChild(img); }
      if (p.video_url) { const v = document.createElement('video'); v.className = 'post-video'; v.src = p.video_url; v.controls = true; v.playsInline = true; card.appendChild(v); }
      list.appendChild(card);
    });
  }
}

// ============================================================
// 制作人员名单：名字可拖动 + 重力
// ============================================================
const DRAGGABLE_NAMES = [
  'creditsMUYAN', 'creditsMUYANcn',
  'creditsNALAN', 'creditsNALANcn',
  'creditsLANJAO', 'creditsLANJAOcn',
  'creditsXIAOKUI', 'creditsXIAOKUIcn',
  'creditsECHO', 'creditsECHOcn',
];

const _gravityState = {};

function makeCreditsNamesDraggable() {
  DRAGGABLE_NAMES.forEach(id => {
    const el = $(id);
    if (!el) return;
    _gravityState[id] = { vx: 0, vy: 0, dragging: false, gravityEnabled: false };

    let startCX, startCY, startTX, startTY;

    function onStart(cx, cy) {
      _gravityState[id].dragging = true;
      _gravityState[id].vx = 0;
      _gravityState[id].vy = 0;
      startCX = cx; startCY = cy;
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform || '');
      startTX = m ? parseFloat(m[1]) : 0;
      startTY = m ? parseFloat(m[2]) : 0;
      el.style.zIndex = '60';
    }
    function onMove(cx, cy) {
      if (!_gravityState[id].dragging) return;
      const container = el.closest('.page-content');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const natLeft = eRect.left - cRect.left - startTX;
      const natTop = eRect.top - cRect.top - startTY;
      let tx = startTX + (cx - startCX);
      let ty = startTY + (cy - startCY);
      const maxX = Math.max(0, cRect.width - eRect.width);
      const maxY = Math.max(0, cRect.height - eRect.height);
      const actLeft = Math.max(0, Math.min(maxX, natLeft + tx));
      const actTop = Math.max(0, Math.min(maxY, natTop + ty));
      el.style.transform = `translate(${actLeft - natLeft}px, ${actTop - natTop}px)`;
      _gravityState[id].vx = cx - startCX;
      _gravityState[id].vy = cy - startCY;
    }
    function onEnd() {
      _gravityState[id].dragging = false;
      _gravityState[id].gravityEnabled = true;
      el.style.zIndex = '';
    }

    el.addEventListener('touchstart', e => { const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: true });
    el.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('mousedown', e => { e.preventDefault(); onStart(e.clientX, e.clientY); });
    document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    document.addEventListener('mouseup', onEnd);
  });

  startGravityLoop();
}

function startGravityLoop() {
  const gravity = 0.5;
  const friction = 0.98;
  const bounce = 0.5;

  function loop() {
    const aboutPage = $('page-about');
    if (!aboutPage || !aboutPage.classList.contains('active')) {
      requestAnimationFrame(loop);
      return;
    }
    const container = aboutPage.querySelector('.page-content');
    if (!container) { requestAnimationFrame(loop); return; }
    const cRect = container.getBoundingClientRect();

    DRAGGABLE_NAMES.forEach(id => {
      const el = $(id);
      if (!el || _gravityState[id].dragging || !_gravityState[id].gravityEnabled) return;
      const state = _gravityState[id];
      const eRect = el.getBoundingClientRect();
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform || '');
      let tx = m ? parseFloat(m[1]) : 0;
      let ty = m ? parseFloat(m[2]) : 0;

      state.vy += gravity;
      state.vx *= friction;
      state.vy *= friction;

      tx += state.vx * 0.1;
      ty += state.vy * 0.1;

      const natLeft = eRect.left - cRect.left - tx;
      const natTop = eRect.top - cRect.top - ty;
      const maxX = Math.max(0, cRect.width - eRect.width);
      const maxY = Math.max(0, cRect.height - eRect.height);

      if (natTop + ty > maxY) {
        ty = maxY - natTop;
        state.vy = -state.vy * bounce;
        if (Math.abs(state.vy) < 1) state.vy = 0;
      }
      if (natTop + ty < 0) {
        ty = -natTop;
        state.vy = -state.vy * bounce;
      }
      if (natLeft + tx > maxX) {
        tx = maxX - natLeft;
        state.vx = -state.vx * bounce;
      }
      if (natLeft + tx < 0) {
        tx = -natLeft;
        state.vx = -state.vx * bounce;
      }

      el.style.transform = `translate(${tx}px, ${ty}px)`;
    });

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function resetCreditsNames() {
  DRAGGABLE_NAMES.forEach(id => {
    const el = $(id);
    if (el) {
      el.style.transform = '';
      el.style.zIndex = '';
    }
    if (_gravityState[id]) {
      _gravityState[id].vx = 0;
      _gravityState[id].vy = 0;
    }
  });
}

function retriggerCreditsFade() {
  const el = $('creditsCard');
  if (!el) return;
  el.classList.remove('credits-fade');
  void el.offsetWidth;
  el.classList.add('credits-fade');
  resetCreditsNames();
}

// ============================================================
// 启动
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // 第一步：立即完成最关键的初始化（全是本地操作，不联网）
  try {
    initTheme();
    bindAllButtons();
    initEmojiPicker();

    restoreSession().then((hasSession) => {
      if (hasSession) {
        navStack = ['home'];
        showPage('home');
      } else {
        navStack = ['login'];
        showPage('login');
      }
    }).catch((e) => {
      console.error('恢复会话失败:', e);
      navStack = ['login'];
      showPage('login');
    });
  } catch (e) {
    console.error('核心初始化失败:', e);
    navStack = ['login'];
    showPage('login');
  }

  // 第二步：非关键功能延迟到页面渲染后，不阻塞登录界面
  setTimeout(() => {
    try {
      bindGestures();
      bindPickers();
      bindAvatarPicker();
      bindActivityImagePicker();
      makeCreditsNamesDraggable();
      subscribePosts();
    } catch (e) {
      console.error('延迟初始化失败:', e);
    }
  }, 100);
});
