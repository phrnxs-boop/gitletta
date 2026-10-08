import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Liveness/readiness probe for uptime monitors and the platform.
 *
 * Deliberately public and deliberately terse — it reports whether the app can
 * reach its database, and nothing about tenants or configuration.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()

  let database: 'ok' | 'unreachable' = 'unreachable'
  try {
    const { error } = await supabaseAdmin()
      .from('tenants')
      .select('id', { count: 'exact', head: true })
    if (!error) database = 'ok'
  } catch {
    /* leave as unreachable */
  }

  const healthy = database === 'ok'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
