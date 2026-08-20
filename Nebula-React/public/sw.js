// Nebula PWA Service Worker（生产环境注册）
// 策略：导航请求使用 network-first；成功后缓存当前页面和 app shell，失败时回退到已缓存页面。
const CACHE = 'nebula-shell-v2'
const SHELL_FALLBACKS = ['/', '/capture', '/timeline']

async function putCache(request, response) {
  if (!response || !response.ok) return response
  const cache = await caches.open(CACHE)
  await cache.put(request, response.clone())
  return response
}

async function cachedNavigation(request) {
  const direct = await caches.match(request)
  if (direct) return direct
  for (const fallback of SHELL_FALLBACKS) {
    const response = await caches.match(fallback)
    if (response) return response
  }
  return new Response('当前页面尚未缓存，请恢复网络后重试。', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await putCache(request, response)
          if (response.ok) await putCache('/', response)
          return response
        })
        .catch(() => cachedNavigation(request))
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => putCache(request, response))
      .catch(() => caches.match(request))
  )
})