import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

/** Recursively convert snake_case DB keys to camelCase response keys. */
function toCamel(v: any): any {
  if (Array.isArray(v)) return v.map(toCamel)
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      const key = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
      out[key] = toCamel(val)
    }
    return out
  }
  return v
}

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'security.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const admin = supabaseAdmin()

  // Users (profiles) for this tenant — sessions are scoped to these users.
  const { data: users, error: usersError } = await admin
    .from('profiles')
    .select('id, name, email, two_factor_enabled, last_login, active')
    .eq('tenant_id', tenantId)

  if (usersError) return json({ error: usersError.message }, 500)

  const userIds = (users ?? []).map((u: any) => u.id)

  let sessions: any[] = []
  if (userIds.length > 0) {
    const { data, error: sessionsError } = await admin
      .from('user_sessions')
      .select('*, user:profiles(id, name, email)')
      .in('user_id', userIds)
      .order('last_active', { ascending: false })
    if (sessionsError) return json({ error: sessionsError.message }, 500)
    sessions = data ?? []
  }

  const { data: logs, error: logsError } = await admin
    .from('security_logs')
    .select('*, user:profiles(id, name, email)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (logsError) return json({ error: logsError.message }, 500)

  return json({
    sessions: toCamel(sessions),
    logs: toCamel(logs ?? []),
    users: toCamel(users ?? []),
  })
}

export async function DELETE(req: Request) {
  const g = await guard(req, { permission: 'security.manage' })
  if (!g.ok) return g.response
  const body = await req.json()
  const admin = supabaseAdmin()

  if (body.sessionId) {
    const { error } = await admin.from('user_sessions').delete().eq('id', body.sessionId)
    if (error) return json({ error: error.message }, 500)
    return json({ success: true })
  }
  return json({ error: 'sessionId required' }, 400)
}

export async function PATCH(req: Request) {
  const g = await guard(req, { permission: 'security.manage' })
  if (!g.ok) return g.response
  const body = await req.json()
  const admin = supabaseAdmin()

  if (body.action === 'revoke_all') {
    const tenantId = g.session.tenantId
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenantId)
    if (profilesError) return json({ error: profilesError.message }, 500)

    const ids = (profiles ?? []).map((p: any) => p.id)
    if (ids.length > 0) {
      const { error } = await admin.from('user_sessions').delete().in('user_id', ids)
      if (error) return json({ error: error.message }, 500)
    }
    return json({ success: true })
  }
  if (body.userId && body.twoFactorEnabled !== undefined) {
    const { error } = await admin
      .from('profiles')
      .update({ two_factor_enabled: body.twoFactorEnabled })
      .eq('id', body.userId)
    if (error) return json({ error: error.message }, 500)
    return json({ success: true })
  }
  return json({ error: 'invalid action' }, 400)
}
