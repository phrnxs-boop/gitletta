"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Activity, Zap, BarChart3 } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'

type UsageMetrics = {
  activeTenants_24h: number
  topFeatures: { feature_id: string; count: number }[]
}

export default function SuperAdminAnalytics() {
  const [data, setData] = useState<{metrics: UsageMetrics; orderTrend: Record<string, number>} | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await edgeFetch('/super-admin/analytics')
        if (!res.ok) throw new Error(`Error ${res.status}: Unauthorized`)
        const result = await res.json()
        setData(result)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadAnalytics()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500">Loading usage data...</div>
  if (error) return <div className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-100">{error}</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Usage Analytics</h2>
        <p className="text-slate-500">Engagement and feature adoption across the platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <Activity className="size-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Active Tenants (24h)</p>
            <p className="text-2xl font-bold">{data?.metrics.activeTenants_24h || 0}</p>
          </div>
        </Card>
        <Card className="p-6 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <Zap className="size-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Platform Stability</p>
            <p className="text-2xl font-bold">99.9%</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-6 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="size-4" />
              Top Features (30d)
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature ID</TableHead>
                <TableHead className="text-right">Hits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.metrics.topFeatures.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-10 text-slate-500">
                    No usage data yet.
                  </TableCell>
                </TableRow>
              ) : (
                data?.metrics.topFeatures.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{f.feature_id}</TableCell>
                    <TableCell className="text-right font-bold">{f.count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Order Volume Trend (7d)</h3>
          <div className="space-y-3">
            {Object.entries(data?.orderTrend || {}).sort().map(([date, count]: [string, number]) => (
              <div key={date} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{date}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-32">
                    <div 
                      className="h-full bg-indigo-500" 
                      style={{ width: `${Math.min(100, (count as number) * 5)}%` }} 
                    />
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              </div>
            ))}
            {Object.keys(data?.orderTrend || {}).length === 0 && (
              <p className="text-center py-10 text-slate-500 text-sm">No order data available for this period.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
