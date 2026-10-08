import { NextRequest } from 'next/server'
import { guard } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orders/stream — Server-Sent Events compatibility endpoint.
 *
 * Live order updates no longer flow through this route. The old implementation
 * subscribed to an in-process EventEmitter, which cannot work on serverless
 * (each invocation is its own process) and cannot be bridged to Supabase
 * Realtime, which is websocket-based.
 *
 * Live updates now flow through Supabase Realtime Postgres Changes on the
 * `orders` (and `order_items` / `table_sessions`) tables — the browser
 * subscribes directly to those row changes over the Realtime websocket. This
 * endpoint is kept for backwards compatibility only: it opens a valid SSE
 * stream, immediately announces `ready`, and then emits periodic heartbeat
 * comments so any client still using it stays connected without erroring.
 * No Realtime websocket is opened on the server.
 */
export async function GET(req: NextRequest) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial handshake
      controller.enqueue(
        encoder.encode(
          `event: ready\ndata: ${JSON.stringify({ status: 'ready', tenantId })}\n\n`
        )
      )

      // 2. Heartbeat — keeps the connection open through proxies/browsers.
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          clearInterval(pingInterval)
        }
      }, 15000)

      req.signal.addEventListener('abort', () => {
        clearInterval(pingInterval)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
