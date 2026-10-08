import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { json } from '@/lib/tenant'
import { guard } from '@/lib/session'
import { toCamel } from '@/lib/case'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'qr.manage' })
  if (!g.ok) return g.response
  const tenantId = g.session.tenantId
  const url = new URL(req.url)
  const tableId = url.searchParams.get('tableId')
  const all = url.searchParams.get('all') === 'true'

  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = forwardedHost || req.headers.get('host') || url.host
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const proto = forwardedProto || (url.protocol ? url.protocol.replace(':', '') : 'http')
  const defaultOrigin = host ? `${proto}://${host}` : url.origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || defaultOrigin

  const admin = supabaseAdmin()

  if (all) {
    const { data: tables, error } = await admin
      .from('tables')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
    if (error) return json({ error: error.message }, 500)

    const result = await Promise.all(
      (tables ?? []).map(async (t: any) => {
        // The QR encodes the table's token via the public-menu view; the
        // frontend activates a session by POSTing this token.
        const targetUrl = `${baseUrl}/?view=public-menu&table=${t.qr_token}`
        const qr = await QRCode.toDataURL(targetUrl, {
          margin: 1,
          width: 400,
          color: { dark: '#161922', light: '#ffffff' },
        })
        return { ...toCamel(t), qrUrl: targetUrl, qrData: qr }
      }),
    )
    return json(result)
  }

  if (!tableId) return json({ error: 'tableId or all=true required' }, 400)

  const { data: table, error } = await admin
    .from('tables')
    .select('*')
    .eq('id', tableId)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!table) return json({ error: 'Table not found' }, 404)

  const targetUrl = `${baseUrl}/?view=public-menu&table=${table.qr_token}`
  const qr = await QRCode.toDataURL(targetUrl, {
    margin: 1,
    width: 512,
    color: { dark: '#161922', light: '#ffffff' },
  })
  return json({ table: toCamel(table), qrUrl: targetUrl, qrData: qr })
}
