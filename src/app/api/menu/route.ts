import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { toCamel } from '@/lib/case'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'menu.view' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId

  const { data, error } = await supabaseAdmin()
    .from('menu_items')
    .select('*, category:categories(*)')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return json({ error: error.message }, 500)
  return json(toCamel(data ?? []))
}

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'menu.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const body = await req.json()

  if (!body.name?.trim() || !body.categoryId) {
    return json({ error: 'Name and category are required' }, 400)
  }

  const { data, error } = await supabaseAdmin()
    .from('menu_items')
    .insert({
      tenant_id: tenantId,
      category_id: body.categoryId,
      name: body.name.trim(),
      description: body.description ?? null,
      price: Number(body.price) || 0,
      image: body.image ?? null,
      available: body.available !== false,
      prep_time: Number(body.prepTime) || 15,
      calories: body.calories != null ? Number(body.calories) : null,
      tags: body.tags ?? null,
    })
    .select('*, category:categories(*)')
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
  if (body.description !== undefined) patch.description = body.description
  if (body.price !== undefined) patch.price = Number(body.price)
  if (body.image !== undefined) patch.image = body.image
  if (body.available !== undefined) patch.available = Boolean(body.available)
  if (body.tags !== undefined) patch.tags = body.tags
  if (body.categoryId !== undefined) patch.category_id = body.categoryId
  if (body.prepTime !== undefined) patch.prep_time = Number(body.prepTime)
  if (body.calories !== undefined) patch.calories = body.calories

  const { data, error } = await supabaseAdmin()
    .from('menu_items')
    .update(patch)
    .eq('id', body.id)
    .select('*, category:categories(*)')
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

  const { error } = await supabaseAdmin().from('menu_items').delete().eq('id', id)
  if (error) return json({ error: error.message }, 500)
  return json({ success: true })
}
