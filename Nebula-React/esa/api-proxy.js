// ============================================================
// ESA 边缘函数（Pages entry）—— /api/* 同源反向代理到函数计算 FC 3.0
// ------------------------------------------------------------
// 路由逻辑（ESA Pages 官方）：
//   1. 请求先匹配静态资源（./dist），命中直接返回（不进本函数）
//   2. 未命中（如 /api/*、SPA 刷新路径）进入本函数
//   3. /api/*  → 转发到 FC_BASE_URL 指向的 FC HTTP 触发器公网地址
//      其余    → 回退静态资源（env.ASSETS，SPA 路由刷新兜底）
//
// 需要在 ESA Pages 项目设置中配置环境变量：
//   FC_BASE_URL = https://<function-name>.<region>.fcapp.run
// （FC HTTP 触发器地址，authType=anonymous，路径原样透传到函数内 Express）
// ============================================================

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // 非 API 请求：回退静态资源（SPA history 路由刷新）
    if (!url.pathname.startsWith('/api/')) {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return env.ASSETS.fetch(request)
      }
      return new Response('Not Found', { status: 404 })
    }

    const base = String((env && env.FC_BASE_URL) || '').replace(/\/+$/, '')
    if (!base) {
      return jsonResponse(
        { error: '边缘函数未配置 FC_BASE_URL 环境变量', code: 'FC_BASE_URL_MISSING' },
        503,
      )
    }

    // 同路径透传：保留 method / headers / body；附加代理标记便于后端识别
    const target = base + url.pathname + url.search
    const headers = new Headers(request.headers)
    headers.set('x-forwarded-proto', 'https')
    headers.set('x-edge-proxy', 'esa-pages')
    const proxied = new Request(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    })
    try {
      return await fetch(proxied)
    } catch (err) {
      return jsonResponse(
        { error: 'API 网关转发失败，请稍后重试', code: 'EDGE_PROXY_FAILED' },
        502,
      )
    }
  },
}
