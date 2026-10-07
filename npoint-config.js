/**
 * npoint-config.js
 * ------------------
 * npoint.io JSON 存储客户端 + 匿名用户ID管理
 * 暴露全局：
 *   window.db              —— npoint API 封装
 *   window.SUPABASE_AVAILABLE —— 始终 true
 *   window.YanyuUser       —— 匿名 UUID / 默认名工具
 */

// ===== npoint.io 配置 =====
const NPOINT_URL = 'https://api.npoint.io/f1edeff1ee57d57edcf5';

// 带超时和重试的fetch（服务器错误502/503自动重试）
function fetchRetry(url, options, timeout, retries) {
  timeout = timeout || 20000;
  retries = retries || 3;
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function exec() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      fetch(url, Object.assign({}, options, { signal: controller.signal }))
        .then(res => {
          clearTimeout(timer);
          // 服务器错误且还有重试次数
          if (res.status >= 500 && attempt < retries) {
            attempt++;
            setTimeout(exec, 800 * attempt);
          } else {
            resolve(res);
          }
        })
        .catch(err => {
          clearTimeout(timer);
          if (attempt < retries) {
            attempt++;
            setTimeout(exec, 800 * attempt);
          } else {
            reject(err);
          }
        });
    }
    exec();
  });
}

// ===== npoint API 封装 =====
window.db = {
  async read() {
    const res = await fetchRetry(NPOINT_URL, { method: 'GET' });
    if (!res.ok) throw new Error('读取失败: ' + res.status);
    return await res.json();
  },

  async write(data) {
    const res = await fetchRetry(NPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('写入失败: ' + res.status);
    return await res.json();
  },

  posts: {
    async select() {
      const data = await window.db.read();
      return data.posts || [];
    },
    async insert(post) {
      const data = await window.db.read();
      if (!data.posts) data.posts = [];
      post.id = post.id || 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // 防止重复插入（同步队列可能重发）
      if (data.posts.some(p => p.id === post.id)) {
        return { data: [post], error: null };
      }
      post.created_at = post.created_at || new Date().toISOString();
      post.comments = post.comments || [];
      data.posts.unshift(post);
      if (data.posts.length > 500) data.posts = data.posts.slice(0, 500);
      await window.db.write(data);
      return { data: [post], error: null };
    },
    async update(id, patch) {
      const data = await window.db.read();
      if (!data.posts) return;
      const idx = data.posts.findIndex(p => p.id === id);
      if (idx === -1) return;
      Object.assign(data.posts[idx], patch);
      await window.db.write(data);
    },
    async delete(id) {
      const data = await window.db.read();
      if (!data.posts) return;
      data.posts = data.posts.filter(p => p.id !== id);
      await window.db.write(data);
    },
  },

  activities: {
    async select() {
      const data = await window.db.read();
      return data.activities || [];
    },
    async insert(act) {
      const data = await window.db.read();
      if (!data.activities) data.activities = [];
      act.id = act.id || 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      act.created_at = act.created_at || new Date().toISOString();
      data.activities.unshift(act);
      if (data.activities.length > 200) data.activities = data.activities.slice(0, 200);
      await window.db.write(data);
      return { data: [act], error: null };
    },
  },

  rooms: {
    async select() {
      const data = await window.db.read();
      return data.rooms || [];
    },
    async insert(room) {
      const data = await window.db.read();
      if (!data.rooms) data.rooms = [];
      room.id = room.id || 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      room.created_at = room.created_at || new Date().toISOString();
      data.rooms.unshift(room);
      if (data.rooms.length > 200) data.rooms = data.rooms.slice(0, 200);
      await window.db.write(data);
      return { data: [room], error: null };
    },
    async delete(id) {
      const data = await window.db.read();
      if (!data.rooms) return;
      data.rooms = data.rooms.filter(r => r.id !== id);
      await window.db.write(data);
    },
  },

  follows: {
    async select() {
      const data = await window.db.read();
      return data.follows || [];
    },
    async toggle(followerId, followeeId) {
      const data = await window.db.read();
      if (!data.follows) data.follows = [];
      const idx = data.follows.findIndex(f => f.follower_id === followerId && f.followee_id === followeeId);
      if (idx >= 0) {
        data.follows.splice(idx, 1);
        await window.db.write(data);
        return false;
      } else {
        data.follows.push({ follower_id: followerId, followee_id: followeeId, created_at: new Date().toISOString() });
        await window.db.write(data);
        return true;
      }
    },
  },

  users: {
    async select() {
      const data = await window.db.read();
      return data.users || [];
    },
    async upsert(user) {
      const data = await window.db.read();
      if (!data.users) data.users = [];
      const idx = data.users.findIndex(u => u.id === user.id);
      // 去掉过长的 base64 头像（超过 20000 字符则截断），避免 npoint 限制
      const slim = Object.assign({}, user);
      if (slim.avatar_url && slim.avatar_url.length > 20000) {
        slim.avatar_url = slim.avatar_url.slice(0, 20000) + '...[truncated]';
      }
      if (idx >= 0) {
        data.users[idx] = slim;
      } else {
        data.users.push(slim);
      }
      await window.db.write(data);
      return slim;
    },
    async get(id) {
      const users = await window.db.users.select();
      return users.find(u => u.id === id) || null;
    },
  },

  notifications: {
    async select(userId) {
      const data = await window.db.read();
      const all = data.notifications || [];
      return userId ? all.filter(n => n.to_user_id === userId) : all;
    },
    async insert(notif) {
      const data = await window.db.read();
      if (!data.notifications) data.notifications = [];
      notif.id = notif.id || 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      notif.created_at = notif.created_at || new Date().toISOString();
      notif.read = false;
      data.notifications.unshift(notif);
      if (data.notifications.length > 500) data.notifications = data.notifications.slice(0, 500);
      await window.db.write(data);
    },
    async markRead(userId) {
      const data = await window.db.read();
      if (!data.notifications) return;
      data.notifications.forEach(n => {
        if (n.to_user_id === userId) n.read = true;
      });
      await window.db.write(data);
    },
  },
};

window.SUPABASE_AVAILABLE = true;
console.log('[颜娱] npoint.io 存储已初始化');

// ===== 匿名用户工具 =====
const YanyuUser = {
  KEY: 'yanyu_user_id',

  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  getId() {
    let id = localStorage.getItem(this.KEY);
    if (!id) {
      id = this.uuid();
      localStorage.setItem(this.KEY, id);
    }
    return id;
  },

  defaultName() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return '玩家' + num;
  },

  today() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  },
};

window.YanyuUser = YanyuUser;
