import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { toCamel, embedCount } from '@/lib/case'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'menu.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const { data, error } = await supabaseAdmin()
    .from('categories')
    .select('*, menu_items(count)')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  const categories = (data ?? []).map((row: any) => {
    const { menu_items, ...rest } = row
    // The views read `_count.menuItems`, so keep that exact shape.
    return { ...toCamel(rest), _count: { menuItems: embedCount(menu_items) } }
  })

  return json(categories)
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'menu.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()

  if (!body.name?.trim()) return json({ error: 'Category name is required' }, 400)

  const { data, error } = await supabaseAdmin()
    .from('categories')
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      icon: body.icon ?? null,
      sort_order: Number(body.sortOrder) || 0,
    })
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json(toCamel(data), 201)
}

export async function PATCH(req: Request) {
  const g = await guard(req, { permission: 'menu.manage' })
  if (!g.ok) return g.response
  const body = await req.json()
  if (!body.id) return json({ error: 'id is required' }, 400)

  const patch: Record<string, any> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.icon !== undefined) patch.icon = body.icon
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder)

  const { data, error } = await supabaseAdmin()
    .from('categories')
    .update(patch)
    .eq('id', body.id)
    .select('*')
    .single()

  if (error) return json({ error: error.message }, 500)
  return json(toCamel(data))
}

export async function DELETE(req: Request) {
  const g = await guard(req, { permission: 'menu.manage' })
  if (!g.ok) return g.response
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return json({ error: 'id is required' }, 400)

  const { error } = await supabaseAdmin().from('categories').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
