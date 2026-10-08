import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { toCamel, embedCount } from '@/lib/case'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'tables.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const admin = supabaseAdmin()

  const { data: tables, error } = await admin
    .from('tables')
    .select('*, orders(count), reservations(count)')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  // Which tables currently have food on them?
  const { data: activeOrders } = await admin
    .from('orders')
    .select('table_id, status')
    .eq('tenant_id', tenantId)
    .in('status', ['PENDING', 'PREPARING', 'READY', 'SERVED'])

  const tableStatus: Record<string, string> = {}
  for (const o of activeOrders ?? []) {
    if (o.table_id) tableStatus[o.table_id] = o.status
  }

  return json(
    (tables ?? []).map((row: any) => {
      const { orders, reservations, ...rest } = row
      return {
        ...toCamel(rest),
        _count: {
          orders: embedCount(orders),
          reservations: embedCount(reservations),
        },
        currentStatus: tableStatus[row.id] || 'AVAILABLE',
      }
    }),
  )
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'tables.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const body = await req.json()
  if (!body.name?.trim()) return json({ error: 'Table name is required' }, 400)

  const { data, error } = await supabaseAdmin()
    .from('tables')
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      seats: Number(body.seats) || 4,
      area: body.area?.trim() || 'Main Hall',
      active: body.active !== false,
      // Unguessable: this token is the only thing protecting a table's session.
      qr_token: randomBytes(9).toString('hex'),
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return json({ error: 'A table with that name already exists' }, 409)
    }
    return json({ error: error.message }, 500)
  }
  return json(toCamel(data), 201)
}
