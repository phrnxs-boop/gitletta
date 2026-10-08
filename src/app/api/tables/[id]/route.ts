import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { toCamel } from '@/lib/case'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'tables.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const body = await req.json()

  const patch: Record<string, any> = {}
  if (body.name !== undefined) patch.name = body.name.trim()
  if (body.seats !== undefined) patch.seats = Number(body.seats) || 4
  if (body.area !== undefined) patch.area = body.area.trim()
  if (body.active !== undefined) patch.active = Boolean(body.active)
  if (body.regenerateToken) patch.qr_token = randomBytes(9).toString('hex')

  const { data, error } = await supabaseAdmin()
    .from('tables')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json(toCamel(data))
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'tables.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const { error } = await supabaseAdmin().from('tables').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
