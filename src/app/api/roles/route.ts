import { json, PERMISSION_KEYS, PERMISSION_GROUPS } from '@/lib/tenant'
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

/** Serialize permissions exactly as before: comma-separated string. */
function serializePermissions(permissions: unknown): string {
  return Array.isArray(permissions) ? permissions.join(',') : String(permissions ?? '')
}

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'roles.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const admin = supabaseAdmin()

  const [rolesRes, usersRes] = await Promise.all([
    admin.from('roles').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('*, roleRef:roles(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
  ])

  if (rolesRes.error) return json({ error: rolesRes.error.message }, 500)
  if (usersRes.error) return json({ error: usersRes.error.message }, 500)

  return json({
    roles: toCamel(rolesRes.data ?? []),
    users: toCamel(usersRes.data ?? []),
    permissionKeys: PERMISSION_KEYS,
    permissionGroups: PERMISSION_GROUPS,
  })
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'roles.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()
  const admin = supabaseAdmin()

  const { data: role, error } = await admin
    .from('roles')
    .insert({
      tenant_id: tenantId,
      name: body.name,
      description: body.description,
      permissions: serializePermissions(body.permissions),
      color: body.color || '#ff7e6b',
    })
    .select()
    .single()

  if (error) return json({ error: error.message }, 500)

  return json(toCamel(role), 201)
}
