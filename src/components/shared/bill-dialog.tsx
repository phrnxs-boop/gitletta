'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Download, Printer, X, Loader2, Store, Phone, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface BillData {
  restaurant: {
    name: string
    tagline: string | null
    logo: string | null
    address: string | null
    phone: string | null
    email: string | null
    currency: string
    currencySymbol: string
    gstin: string | null
    fssai: string | null
  }
  billNumber: string
  orderNumber: number
  invoiceDate: string
  completedAt: string | null
  table: { name: string; seats: number; area: string } | null
  orderType: string
  customerName: string | null
  customerPhone: string | null
  servedBy: string | null
  items: { name: string; portion?: string | null; quantity: number; unitPrice: number; total: number; notes: string | null }[]
  subtotal: number
  discount: number
  promoCode: string | null
  taxableAmount: number
  taxBreakup: { rate: number; cgstRate: number; sgstRate: number; cgstAmount: number; sgstAmount: number; totalTax: number }
  serviceCharge: number
  grandTotal: number
  paymentMethod: string | null
  paymentStatus: string
  orderStatus: string
  terms: string[]
}

/** Escape a value for the print document — these are real HTML documents, and a
 *  dish name or a customer name is user input. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The bill as a standalone document for printing and "Save as PDF".
 *
 * The dialog is styled with Tailwind, but a stylesheet does not travel into a
 * `window.open` document — only the markup does. The previous version copied the
 * dialog's DOM into a fresh window whose CSS used class names the markup never
 * carried (`.header`, `.meta-row`, `.totals`), so `flex justify-between` had no
 * rule behind it and every label printed straight into its value: "Bill
 * NoBILL-000085", "TableTable 2", "Subtotal₹515.00". This builds the page from
 * the bill data with its own CSS instead, so alignment is structural.
 */
function buildPrintHtml(bill: BillData): string {
  const money = (n: number) => `${esc(bill.restaurant.currencySymbol)}${n.toFixed(2)}`
  const orderTypeLabel =
    bill.orderType === 'DINE_IN' ? 'Dine In' : bill.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'

  const meta: [string, string][] = [
    ['Bill No', bill.billNumber],
    ['Order No', `#${bill.orderNumber}`],
    ['Date', new Date(bill.invoiceDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
  ]
  if (bill.table) meta.push(['Table', bill.table.area ? `${bill.table.name} · ${bill.table.area}` : bill.table.name])
  meta.push(['Type', orderTypeLabel])
  if (bill.customerName) meta.push(['Customer', bill.customerName])
  if (bill.customerPhone) meta.push(['Phone', bill.customerPhone])
  if (bill.servedBy) meta.push(['Served by', bill.servedBy])

  const itemsHtml = bill.items
    .map(
      (it) => `
        <tr>
          <td class="item">${esc(it.name)}${it.portion ? ` <span style="font-size:10px;color:#6b7280;font-weight:600">(${esc(it.portion)})</span>` : ''}${it.notes ? `<div class="note">↳ ${esc(it.notes)}</div>` : ''}</td>
          <td class="qty">${it.quantity}</td>
          <td class="num">${money(it.unitPrice)}</td>
          <td class="num strong">${money(it.total)}</td>
        </tr>`,
    )
    .join('')

  const totalRows: string[] = [
    `<div class="row"><span>Subtotal</span><span class="num val">${money(bill.subtotal)}</span></div>`,
  ]
  if (bill.discount > 0) {
    totalRows.push(
      `<div class="row accent"><span>Discount${bill.promoCode ? ` (${esc(bill.promoCode)})` : ''}</span><span class="num val">−${money(bill.discount)}</span></div>`,
    )
  }
  totalRows.push(
    `<div class="row"><span>Taxable amount</span><span class="num val">${money(bill.taxableAmount)}</span></div>`,
  )
  if (bill.taxBreakup.totalTax > 0) {
    totalRows.push(
      `<div class="row muted"><span>CGST (${bill.taxBreakup.cgstRate}%)</span><span class="num val">${money(bill.taxBreakup.cgstAmount)}</span></div>`,
      `<div class="row muted"><span>SGST (${bill.taxBreakup.sgstRate}%)</span><span class="num val">${money(bill.taxBreakup.sgstAmount)}</span></div>`,
    )
  }
  if (bill.serviceCharge > 0) {
    totalRows.push(
      `<div class="row"><span>Service charge</span><span class="num val">${money(bill.serviceCharge)}</span></div>`,
    )
  }

  const contact = [bill.restaurant.phone, bill.restaurant.email].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')
  const ids = [
    bill.restaurant.gstin ? `<span>GSTIN ${esc(bill.restaurant.gstin)}</span>` : '',
    bill.restaurant.fssai ? `<span>FSSAI ${esc(bill.restaurant.fssai)}</span>` : '',
  ].join('')
  const paid = bill.paymentStatus === 'PAID'

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Bill ${esc(bill.billNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f3f4f6;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { max-width: 720px; margin: 24px auto; background: #fff; padding: 36px 40px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  .head { text-align: center; }
  .logo { display: block; width: 52px; height: 52px; border-radius: 14px; object-fit: cover; margin: 0 auto 10px; }
  .monogram { width: 52px; height: 52px; border-radius: 14px; background: #f97316; color: #fff; font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
  .brand { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .tagline, .addr, .contact { margin: 4px 0 0; font-size: 12px; color: #6b7280; }
  .ids { margin-top: 10px; font-size: 10px; color: #6b7280; letter-spacing: .02em; }
  .ids span { display: inline-block; border: 1px solid #e5e7eb; border-radius: 6px; padding: 3px 8px; margin: 0 3px; background: #fafafa; }
  .rule { border: 0; border-top: 1px dashed #d1d5db; margin: 18px 0; }
  .meta { font-size: 12px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; }
  .row > span:first-child { color: #6b7280; }
  .num { font-variant-numeric: tabular-nums; }
  .meta .val { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 0 0 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; text-align: left; }
  td { padding: 9px 0; border-bottom: 1px dotted #e5e7eb; font-size: 12px; vertical-align: top; }
  th.num, td.num { text-align: right; }
  th.qty, td.qty { text-align: center; }
  td.item { padding-right: 12px; word-break: break-word; }
  td.strong { font-weight: 600; }
  .note { margin-top: 2px; font-size: 10px; font-style: italic; color: #9ca3af; }
  .totals { width: 100%; max-width: 320px; margin: 14px 0 0 auto; font-size: 12px; }
  .totals .val { text-align: right; font-weight: 500; }
  .totals .muted > span { color: #9ca3af; }
  .totals .accent > span { color: #ea580c; }
  .grand { margin-top: 8px; padding-top: 9px; border-top: 1px solid #111827; font-size: 15px; font-weight: 700; }
  .grand > span:first-child { color: #111827; }
  .pay { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; font-size: 12px; }
  .pay .label { color: #6b7280; }
  .pay .status { font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .pay .paid { color: #15803d; }
  .pay .unpaid { color: #b91c1c; }
  .foot { margin-top: 18px; text-align: center; font-size: 10px; line-height: 1.6; color: #9ca3af; }
  @page { size: A4; margin: 14mm; }
  @media print {
    body { background: #fff; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
  }
</style></head><body>
  <div class="sheet">
    <div class="head">
      ${bill.restaurant.logo
        ? `<img class="logo" src="${esc(bill.restaurant.logo)}" alt="">`
        : `<div class="monogram">${esc((bill.restaurant.name || 'R').trim().charAt(0).toUpperCase())}</div>`}
      <h1 class="brand">${esc(bill.restaurant.name)}</h1>
      ${bill.restaurant.tagline ? `<p class="tagline">${esc(bill.restaurant.tagline)}</p>` : ''}
      ${bill.restaurant.address ? `<p class="addr">${esc(bill.restaurant.address)}</p>` : ''}
      ${contact ? `<p class="contact">${contact}</p>` : ''}
      ${ids ? `<div class="ids">${ids}</div>` : ''}
    </div>

    <hr class="rule">

    <div class="meta">
      ${meta.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span class="val">${esc(v)}</span></div>`).join('')}
    </div>

    <hr class="rule">

    <table>
      <colgroup><col><col style="width:52px"><col style="width:88px"><col style="width:96px"></colgroup>
      <thead>
        <tr><th>Item</th><th class="qty">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="totals">
      ${totalRows.join('')}
      <div class="row grand"><span>Grand Total</span><span class="num">${money(bill.grandTotal)}</span></div>
    </div>

    <div class="pay">
      <span class="label">Payment</span>
      <span class="status ${paid ? 'paid' : 'unpaid'}">${esc(bill.paymentStatus)}${bill.paymentMethod ? ` · ${esc(bill.paymentMethod)}` : ''}</span>
    </div>

    <hr class="rule">
    <div class="foot">${bill.terms.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
  </div>
</body></html>`
}

export function BillDialog({
  orderId,
  open,
  onOpenChange,
  sessionToken,
}: {
  orderId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /**
   * Diner path only. Owners and staff authenticate with their session cookie /
   * bearer token; a diner has neither, so they pass their table-session token
   * and the API pins the lookup to that session.
   */
  sessionToken?: string | null
}) {
  const [bill, setBill] = useState<BillData | null>(null)
  const [loading, setLoading] = useState(false)

  const loadBill = async (id: string) => {
    setLoading(true)
    setBill(null)
    try {
      const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''
      const res = await edgeFetch(`/api/bill/${id}${qs}`)
      const data = await res.json()
      if (data.restaurant) {
        setBill(data)
      }
    } catch {
      toast.error('Failed to load bill')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && orderId) {
      loadBill(orderId)
    }
  }, [open, orderId, sessionToken])

  const handlePrint = () => {
    if (!bill) return
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) { toast.error('Please allow popups to print'); return }
    w.document.open()
    w.document.write(buildPrintHtml(bill))
    w.document.close()
    w.focus()
    // The window is left open rather than closed after printing: closing it can
    // tear down the print dialog before the browser has finished with it.
    setTimeout(() => { w.print() }, 350)
  }

  const handleDownloadPDF = () => {
    handlePrint()
    toast.success('Choose "Save as PDF" in the print dialog')
  }

  const fmtDate = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin bg-white text-[#1a1d29] p-0">
        <DialogTitle className="sr-only">Bill / Invoice</DialogTitle>
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2.5">
          <span className="text-sm font-bold">Bill / Invoice</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={!bill || loading} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!bill || loading} className="h-8 text-xs">
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
          </div>
        )}

        {bill && (
          <div className="px-5 py-4">
            {/* Header */}
            <div className="text-center mb-4">
              {bill.restaurant.logo ? (
                <img src={bill.restaurant.logo} alt="" className="w-14 h-14 rounded-xl object-cover mx-auto mb-2" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#f97316] flex items-center justify-center mx-auto mb-2">
                  <Store className="h-7 w-7 text-white" />
                </div>
              )}
              <h1 className="text-lg font-bold">{bill.restaurant.name}</h1>
              {bill.restaurant.tagline && <p className="text-xs text-gray-500 mt-0.5">{bill.restaurant.tagline}</p>}
              {bill.restaurant.address && <p className="text-[10px] text-gray-500 mt-1">{bill.restaurant.address}</p>}
              <div className="flex items-center justify-center gap-3 mt-1 text-[10px] text-gray-500">
                {bill.restaurant.phone && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{bill.restaurant.phone}</span>}
                {bill.restaurant.email && <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{bill.restaurant.email}</span>}
              </div>
            </div>

            {/* GSTIN / FSSAI */}
            <div className="text-center text-[10px] text-gray-600 mb-3">
              {bill.restaurant.gstin && <span className="inline-block bg-gray-100 px-2 py-0.5 rounded mr-1">GSTIN: {bill.restaurant.gstin}</span>}
              {bill.restaurant.fssai && <span className="inline-block bg-gray-100 px-2 py-0.5 rounded">FSSAI: {bill.restaurant.fssai}</span>}
            </div>

            {/* A GST invoice is not valid without these, so a missing one is said
                out loud here rather than left as a silent gap the owner never
                notices. Deliberately not part of the printed document, and not
                shown to a diner viewing their own bill — it is an operator hint,
                not something a customer should read. */}
            {!sessionToken && (!bill.restaurant.gstin || !bill.restaurant.fssai) && (
              <div className="text-[10px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-3">
                {!bill.restaurant.gstin && !bill.restaurant.fssai
                  ? 'GSTIN and FSSAI are not set for this restaurant.'
                  : `${!bill.restaurant.gstin ? 'GSTIN' : 'FSSAI'} is not set for this restaurant.`}{' '}
                Add {!bill.restaurant.gstin && !bill.restaurant.fssai ? 'them' : 'it'} under{' '}
                <span className="font-medium">Settings → Restaurant Profile</span> so {!bill.restaurant.gstin && !bill.restaurant.fssai ? 'they appear' : 'it appears'} on bills.
              </div>
            )}

            <div className="border-t border-dashed border-gray-300 my-3" />

            {/* Bill meta */}
            <div className="text-xs space-y-1 mb-3">
              <div className="flex justify-between"><span className="text-gray-500">Bill No</span><span className="font-medium">{bill.billNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order No</span><span>#{bill.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{fmtDate(bill.invoiceDate)}</span></div>
              {bill.table && <div className="flex justify-between"><span className="text-gray-500">Table</span><span>{bill.table.name} ({bill.table.area})</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{bill.orderType === 'DINE_IN' ? 'Dine In' : bill.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}</span></div>
              {bill.customerName && <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{bill.customerName}</span></div>}
              {bill.servedBy && <div className="flex justify-between"><span className="text-gray-500">Served by</span><span>{bill.servedBy}</span></div>}
            </div>

            <div className="border-t border-dashed border-gray-300 my-3" />

            {/* Items */}
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase border-b border-gray-200">
                  <th className="text-left py-1.5">Item</th>
                  <th className="text-center py-1.5">Qty</th>
                  <th className="text-right py-1.5">Price</th>
                  <th className="text-right py-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((it, i) => (
                  <tr key={i} className="border-b border-dotted border-gray-100">
                    <td className="py-1.5">
                      <span>{it.name}</span>
                      {it.portion && (
                        <span className="ml-1 text-[10px] text-gray-500 font-medium">({it.portion})</span>
                      )}
                      {it.notes && <p className="text-[9px] text-gray-400 italic">↳ {it.notes}</p>}
                    </td>
                    <td className="text-center py-1.5">{it.quantity}</td>
                    <td className="text-right py-1.5">{bill.restaurant.currencySymbol}{it.unitPrice.toFixed(2)}</td>
                    <td className="text-right py-1.5 font-medium">{bill.restaurant.currencySymbol}{it.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-gray-300 my-3" />

            {/* Totals */}
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{bill.restaurant.currencySymbol}{bill.subtotal.toFixed(2)}</span></div>
              {bill.discount > 0 && (
                <div className="flex justify-between text-[#f97316]"><span>Discount {bill.promoCode ? `(${bill.promoCode})` : ''}</span><span>-{bill.restaurant.currencySymbol}{bill.discount.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Taxable Amount</span><span>{bill.restaurant.currencySymbol}{bill.taxableAmount.toFixed(2)}</span></div>
              {/* GST breakup */}
              {bill.taxBreakup.totalTax > 0 && (
                <>
                  <div className="flex justify-between text-[11px] text-gray-400"><span>CGST ({bill.taxBreakup.cgstRate}%)</span><span>{bill.restaurant.currencySymbol}{bill.taxBreakup.cgstAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between text-[11px] text-gray-400"><span>SGST ({bill.taxBreakup.sgstRate}%)</span><span>{bill.restaurant.currencySymbol}{bill.taxBreakup.sgstAmount.toFixed(2)}</span></div>
                </>
              )}
              {bill.serviceCharge > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Service Charge</span><span>{bill.restaurant.currencySymbol}{bill.serviceCharge.toFixed(2)}</span></div>
              )}
            </div>

            <div className="border-t border-gray-400 mt-2 pt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">Grand Total</span>
                <span className="font-bold text-lg text-[#f97316]">{bill.restaurant.currencySymbol}{bill.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment status */}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-500">Payment:</span>
              <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                bill.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                {bill.paymentStatus}
                {bill.paymentMethod ? ` · ${bill.paymentMethod}` : ''}
              </span>
            </div>

            {/* Footer */}
            <div className="border-t border-dashed border-gray-300 my-3" />
            <div className="text-center text-[10px] text-gray-400">
              {bill.terms.map((t, i) => <p key={i} className="mt-1">{t}</p>)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
