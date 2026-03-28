const connections = new Map<string, Set<ReadableStreamDefaultController>>()
const encoder = new TextEncoder()

export function registerConnection(
  key: string,
  controller: ReadableStreamDefaultController
) {
  if (!connections.has(key)) {
    connections.set(key, new Set())
  }
  connections.get(key)!.add(controller)
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
