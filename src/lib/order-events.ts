/**
 * Order event fan-out.
 *
 * This used to be an in-process `EventEmitter`. That works on a single local
 * dev server but silently fails in production: on Vercel each serverless
 * invocation is its own process, so a listener attached in one request never
 * sees an event published by another.
 *
 * Replaced with Supabase Realtime. The `orders`, `order_items` and
 * `table_sessions` tables are all in the `supabase_realtime` publication, so
 * clients receive row changes directly via Postgres Changes — no server
 * fan-out needed. `publishOrderEvent` additionally fires a lightweight
 * broadcast for events that are not a row change (e.g. a session ending).
 *
 * Both paths are best-effort: a failure here must never break a write.
 */

export type OrderEvent = {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_DELETED' | 'SESSION_ENDED'
  tenantId: string
  order: any
  timestamp: string
}

/** Broadcast topic a tenant's clients subscribe to. */
export function tenantTopic(tenantId: string): string {
  return `orders:${tenantId}`
}

/**
 * Publish an order event over Supabase Realtime's HTTP broadcast endpoint.
 *
 * Deliberately fire-and-forget: callers are in the middle of a request that
 * has already succeeded at the database level, so nothing here may throw or
 * block.
 */
export function publishOrderEvent(event: Omit<OrderEvent, 'timestamp'>): OrderEvent {
  const fullEvent: OrderEvent = { ...event, timestamp: new Date().toISOString() }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return fullEvent

  void fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: tenantTopic(event.tenantId),
          event: event.type,
          payload: fullEvent,
        },
      ],
    }),
  }).catch(() => {
    // Realtime is a latency optimisation, not a source of truth.
  })

  return fullEvent
}
