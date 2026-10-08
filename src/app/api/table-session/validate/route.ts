import { validateTableSession } from '@/lib/table-session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'

// ---- Row -> legacy camelCase mappers ----

function mapCategory(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

function mapMenuItem(row: any) {
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  return {
    id: row.id,
    tenantId: row.tenant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    available: row.available,
    prepTime: row.prep_time,
    tags: row.tags,
    calories: row.calories,
    sortOrder: row.sort_order,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: category ? mapCategory(category) : null,
  }
}

function mapSetting(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  }
}

/**
 * GET /api/table-session/validate?tenantId=&tableId=&sessionToken=
 *
 * Backend source-of-truth session check. Returns 200 + session info if ACTIVE,
 * or 401/403 if invalid/ended. The customer menu uses this on load + refresh
 * to decide whether to show the menu or the "session ended" locked screen.
 *
 * Also returns the menu data if valid, so the customer gets everything in one
 * authenticated call (no unauthenticated /api/public-menu needed).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenantId')
  const tableId = url.searchParams.get('tableId')
  const sessionToken = url.searchParams.get('sessionToken')

  const result = await validateTableSession({ tenantId, tableId, sessionToken })
  if (!result.ok) {
    return json({ error: result.error, sessionStatus: 'INVALID' }, result.status)
  }

  const { tenant, table } = result.data
  const admin = supabaseAdmin()

  // Fetch menu data + social settings — only accessible with a valid active session
  const [{ data: categories }, { data: menuItems }, { data: socialSettings }] = await Promise.all([
    admin.from('categories').select('*').eq('tenant_id', tenant.id).order('sort_order', { ascending: true }),
    admin
      .from('menu_items')
      .select('*, category:categories(*)')
      .eq('tenant_id', tenant.id)
      .eq('available', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    admin
      .from('settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('key', ['instagram', 'facebook', 'youtube']),
  ])

  const social: Record<string, string> = {}
  for (const s of socialSettings || []) social[s.key] = s.value

  return json({
    sessionStatus: 'ACTIVE',
    session: result.data.session,
    tenant,
    table,
    social,
    categories: (categories || []).map(mapCategory),
    menuItems: (menuItems || []).map(mapMenuItem),
  })
}
