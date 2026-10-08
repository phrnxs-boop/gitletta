'use client'

import { useState, useEffect, useRef } from 'react'
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
  items: { name: string; quantity: number; unitPrice: number; total: number; notes: string | null }[]
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
  const printRef = useRef<HTMLDivElement>(null)

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
    const printContent = printRef.current?.innerHTML
    if (!printContent) return
    const w = window.open('', '_blank', 'width=400,height=600')
    if (!w) { toast.error('Please allow popups to print'); return }
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>${bill.billNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Courier New', monospace; }
        body { padding: 16px; color: #1a1d29; background: #fff; width: 320px; }
        .header { text-align: center; margin-bottom: 12px; }
        .header h1 { font-size: 18px; font-weight: bold; }
        .header p { font-size: 11px; color: #555; margin-top: 2px; }
        .header .info { font-size: 10px; color: #777; margin-top: 4px; }
        .divider { border-top: 1px dashed #ccc; margin: 8px 0; }
        .meta { font-size: 11px; margin-bottom: 8px; }
        .meta-row { display: flex; justify-content: space-between; }
        .meta-row span:first-child { color: #777; }
        table { width: 100%; font-size: 11px; border-collapse: collapse; }
        th { text-align: left; padding: 4px 0; border-bottom: 1px solid #ddd; font-size: 10px; color: #777; }
        th:last-child, td:last-child { text-align: right; }
        th:nth-child(2), td:nth-child(2) { text-align: center; }
        td { padding: 3px 0; border-bottom: 1px dotted #eee; }
        .totals { font-size: 11px; margin-top: 8px; }
        .total-row { display: flex; justify-content: space-between; padding: 2px 0; }
        .total-row.bold { font-weight: bold; font-size: 13px; border-top: 1px solid #333; padding-top: 6px; margin-top: 4px; }
        .total-row span:first-child { color: #555; }
        .total-row.bold span:first-child { color: #000; }
        .footer { text-align: center; margin-top: 12px; font-size: 10px; color: #777; }
        .footer p { margin-top: 2px; }
      </style></head><body>${printContent}</body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  const handleDownloadPDF = () => {
    handlePrint()
    toast.success('PDF download started — use "Save as PDF" in the print dialog')
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
          <div ref={printRef} className="px-5 py-4">
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
                      {it.name}
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
