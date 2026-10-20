"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { UserMinus, Clock, Mail } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'

type Tenant = {
  id: string
  name: string
  email: string
  plan: string
  subscription_status: string
  trial_ends_at: string
  active: boolean
}

export default function SuperAdminRetention() {
  const [expiring, setExpiring] = useState<Tenant[]>([])
  const [inactive, setInactive] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRetention() {
      try {
        const res = await edgeFetch('/super-admin/retention')
        if (!res.ok) throw new Error(`Error ${res.status}: Unauthorized`)
        const data = await res.json()
        setExpiring(data.expiringTrials)
        setInactive(data.inactiveTenants)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadRetention()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500">Loading retention data...</div>
  if (error) return <div className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-100">{error}</div>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Customer Retention</h2>
        <p className="text-slate-500">Identify churn risks and conversion prospects</p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="p-6 border-b flex items-center gap-2">
            <Clock className="size-5 text-amber-600" />
            <h3 className="font-semibold">Expiring Trials (Next 7 Days)</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Trial Ends</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expiring.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                    No trials expiring soon.
                  </TableCell>
                </TableRow>
              ) : (
                expiring.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-slate-500">{t.email}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(t.trial_ends_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-indigo-600 gap-2">
                        <Mail className="size-3" />
                        Contact
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <div className="p-6 border-b flex items-center gap-2">
            <UserMinus className="size-5 text-rose-600" />
            <h3 className="font-semibold">Inactive Restaurants (14d+ Silence)</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inactive.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                    No inactive restaurants detected.
                  </TableCell>
                </TableRow>
              ) : (
                inactive.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-slate-500">{t.email}</TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {t.subscription_status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-indigo-600 gap-2">
                        <Mail className="size-3" />
                        Re-engage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
