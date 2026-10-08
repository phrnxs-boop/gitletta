import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'

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

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'orders.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  let query = supabaseAdmin()
    .from('reservations')
    .select('*, table:tables(*)')
    .eq('tenant_id', tenantId)
  if (date) query = query.eq('date', date)
  const { data, error } = await query
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) return json({ error: error.message }, 500)
  return json((data ?? []).map(mapReservation))
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'orders.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()
  const { data, error } = await supabaseAdmin()
    .from('reservations')
    .insert({
      tenant_id: tenantId,
      table_id: body.tableId || null,
      name: body.name,
      phone: body.phone,
      email: body.email,
      party_size: body.partySize,
      date: body.date,
      time: body.time,
      occasion: body.occasion,
      notes: body.notes,
      status: body.status || 'PENDING',
    })
    .select('*, table:tables(*)')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json(mapReservation(data), 201)
}
