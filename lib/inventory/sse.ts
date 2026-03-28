const connections = new Map<string, Set<ReadableStreamDefaultController>>()
const encoder = new TextEncoder()

const MAX_CONNECTIONS_PER_KEY = 50
const MAX_TOTAL_CONNECTIONS = 500

function totalConnectionCount(): number {
  let count = 0
  for (const set of connections.values()) count += set.size
  return count
}

export function registerConnection(
  key: string,
  controller: ReadableStreamDefaultController
): boolean {
  if (totalConnectionCount() >= MAX_TOTAL_CONNECTIONS) {
    return false
  }
  if (!connections.has(key)) {
    connections.set(key, new Set())
  }
  const set = connections.get(key)!
  if (set.size >= MAX_CONNECTIONS_PER_KEY) {
    return false
  }
  set.add(controller)
  return true
}

export function removeConnection(
  key: string,
  controller: ReadableStreamDefaultController
) {
  const set = connections.get(key)
  if (set) {
    set.delete(controller)
    if (set.size === 0) connections.delete(key)
  }
}

export function pushSSE(
  teamId: string,
  event: { type: string; data: unknown }
) {
  const encoded = encoder.encode(
    `data: ${JSON.stringify(event)}\n\n`
  )
  for (const key of [teamId, "admin"]) {
    const set = connections.get(key)
    if (!set) continue
    for (const ctrl of set) {
      try {
        ctrl.enqueue(encoded)
      } catch {
        set.delete(ctrl)
      }
    }
  }
}
