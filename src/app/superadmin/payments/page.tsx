"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { TrendingUp, AlertCircle, Download } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'

type PaymentMetric = {
  mrr: number
  failedTransactions: number
  planDistribution: Record<string, number>
}

type FailedPayment = {
  id: string
  amount: number
  currency: string
  status: string
  created_at: string
  tenants: { name: string }
}

export default function SuperAdminPayments() {
  const [metrics, setMetrics] = useState<PaymentMetric | null>(null)
  const [failures, setFailures] = useState<FailedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPayments() {
      try {
        const res = await edgeFetch('/super-admin/payments')
        if (!res.ok) throw new Error(`Error ${res.status}: Unauthorized`)
        const data = await res.json()
        setMetrics(data.metrics)
        setFailures(data.recentFailures)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadPayments()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500">Loading financial data...</div>
  if (error) return <div className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-100">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Revenue & Payments</h2>
          <p className="text-slate-500">Subscription MRR and transaction health</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => window.open('/super-admin/reports', '_blank')}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="size-5 text-emerald-600" />
            <span className="text-sm font-medium text-slate-500">Est. MRR</span>
          </div>
          <p className="text-3xl font-bold">₹{metrics?.mrr?.toLocaleString() || 0}</p>
          <p className="text-xs text-slate-400 mt-1">Normalized monthly revenue</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="size-5 text-rose-600" />
            <span className="text-sm font-medium text-slate-500">Failed Payments (30d)</span>
          </div>
          <p className="text-3xl font-bold">{metrics?.failedTransactions || 0}</p>
          <p className="text-xs text-slate-400 mt-1">Require follow-up</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">P</div>
            <span className="text-sm font-medium text-slate-500">Plan Distribution</span>
          </div>
          <div className="space-y-2 mt-2">
            {Object.entries(metrics?.planDistribution || {}).map(([plan, count]) => (
              <div key={plan} className="flex justify-between text-sm">
                <span className="capitalize text-slate-600">{plan}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6 border-b">
          <h3 className="font-semibold">Recent Failed Transactions</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restaurant</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                  No failed payments in the last 30 days.
                </TableCell>
              </TableRow>
            ) : (
              failures.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.tenants?.name}</TableCell>
                  <TableCell>₹{f.amount}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {new Date(f.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-600">
                      {f.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-indigo-600">
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
