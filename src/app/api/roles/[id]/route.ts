import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

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

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'roles.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const body = await req.json()
  const admin = supabaseAdmin()

  const data: any = {}
  if (body.name) data.name = body.name
  if (body.description !== undefined) data.description = body.description
  if (body.permissions !== undefined) data.permissions = serializePermissions(body.permissions)
  if (body.color) data.color = body.color

  const { data: role, error } = await admin.from('roles').update(data).eq('id', id).select().single()
  if (error) return json({ error: error.message }, 500)

  return json(toCamel(role))
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'roles.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const admin = supabaseAdmin()

  const { data: role, error: findError } = await admin
    .from('roles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (findError) return json({ error: findError.message }, 500)

  if (role?.is_system) return json({ error: 'System roles cannot be deleted' }, 400)

  const { error } = await admin.from('roles').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)

  return json({ success: true })
}
