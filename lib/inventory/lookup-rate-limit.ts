const LOOKUP_WINDOW_MS = 5 * 60 * 1000
const LOOKUP_LIMIT = 60

const lookupBuckets = new Map<string, { count: number; resetAt: number }>()

export function checkInventoryLookupRateLimit(actorId: string) {
  const now = Date.now()
  const bucket = lookupBuckets.get(actorId)

  if (!bucket || bucket.resetAt <= now) {
    lookupBuckets.set(actorId, { count: 1, resetAt: now + LOOKUP_WINDOW_MS })
    return { ok: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= LOOKUP_LIMIT) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}
