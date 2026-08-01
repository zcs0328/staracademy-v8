// 星际学堂 V10.3 Service Worker
// 版本号（更新时递增）
const CACHE_VERSION = 'v10.3.1';
const STATIC_CACHE = 'staracademy-static-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'staracademy-dynamic-' + CACHE_VERSION;

// 核心资源（首次安装即缓存）
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.svg'
];

// ==================== 安装：预缓存核心资源 ====================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Pre-cache failed:', err))
  );
});

// ==================== 激活：清理旧缓存 ====================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('staracademy-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ==================== 请求拦截：缓存策略 ====================
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  // 跳过 Chrome 扩展和 WebRTC 请求
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // GitHub API 请求：网络优先（确保数据最新）
  if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功则缓存一份
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // 离线时尝试缓存
          return caches.match(request);
        })
    );
    return;
  }

  // 本站静态资源：缓存优先，快速响应
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // 后台更新缓存（stale-while-revalidate）
            fetch(request).then((response) => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
              }
            }).catch(() => {});
            return cachedResponse;
          }
          // 无缓存则网络请求
          return fetch(request)
            .then((response) => {
              if (!response || response.status !== 200) return response;
              const clone = response.clone();
              caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
              return response;
            })
            .catch(() => {
              // 离线时返回首页
              if (request.destination === 'document') {
                return caches.match('/index.html');
              }
            });
        })
    );
    return;
  }

  // 第三方资源：网络优先，失败用缓存
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ==================== 消息通信 ====================
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// ==================== 推送通知（预留） ====================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || '该学习啦！今日目标还未完成～',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: '开始学习' },
      { action: 'close', title: '稍后提醒' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '星际学堂 V10.3', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(clientList => {
          if (clientList.length > 0) {
            return clientList[0].focus();
          }
          return clients.openWindow('/');
        })
    );
  }
});

// ==================== 后台同步（预留） ====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(
      // 预留：离线时学习进度同步
      clients.matchAll()
        .then(clientList => {
          clientList.forEach(client => client.postMessage({ type: 'SYNC_REQUEST' }));
        })
    );
  }
});
