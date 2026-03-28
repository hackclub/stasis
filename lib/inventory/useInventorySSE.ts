"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface SSEEvent {
  type: string
  data: unknown
}

export function useInventorySSE(teamId: string | null) {
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!teamId) return

    const url = `/api/inventory/sse?teamId=${encodeURIComponent(teamId)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        setLastEvent(parsed)
      } catch {}
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000)
    }
  }, [teamId])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])

  return lastEvent
}
