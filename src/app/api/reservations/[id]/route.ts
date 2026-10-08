import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

type Params = { params: Promise<{ id: string }> }

function mapTable(t: any) {
  if (!t) return null
  const table = Array.isArray(t) ? t[0] : t
  if (!table) return null
  return {
    id: table.id,
    tenantId: table.tenant_id,
    name: table.name,
    seats: table.seats,
    area: table.area,
    qrToken: table.qr_token,
    active: table.active,
    createdAt: table.created_at,
  }
}

function mapReservation(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tableId: r.table_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    partySize: r.party_size,
    date: r.date,
    time: r.time,
    status: r.status,
    occasion: r.occasion,
    notes: r.notes,
    createdAt: r.created_at,
    table: mapTable(r.table),
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const body = await req.json()
  const data: any = {}
  if (body.status !== undefined) data.status = body.status
  if (body.tableId !== undefined) data.table_id = body.tableId
  const { data: reservation, error } = await supabaseAdmin()
    .from('reservations')
    .update(data)
    .eq('id', id)
    .select('*, table:tables(*)')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json(mapReservation(reservation))
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const { id } = await params
  const { error } = await supabaseAdmin().from('reservations').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
