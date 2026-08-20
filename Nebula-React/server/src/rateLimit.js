const buckets = new Map()

/**
 * 轻量级单进程限流：按 workspace + IP 计数，适用于当前单实例 Express。
 * 多实例部署时应替换为共享存储限流（如网关或 Redis），避免实例间计数不一致。
 */
export function workspaceRateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now()
    const key = `${req.workspaceId || 'unknown'}:${req.ip || req.socket?.remoteAddress || 'unknown'}`
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    buckets.set(key, bucket)

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey)
    }

    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      return res.status(429).json({ error: '请求过于频繁，请稍后重试', code: 'RATE_LIMITED', request_id: req.requestId })
    }
    next()
  }
}
