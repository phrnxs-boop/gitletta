"use client"

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { Search, ExternalLink, Mail } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'

type Restaurant = {
  id: string
  name: string
  slug: string
  email: string
  plan: string
  active: boolean
  created_at: string
}

export default function SuperAdminCRM() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadCRM() {
    try {
      const res = await edgeFetch(`/super-admin/crm?q=${encodeURIComponent(search)}`)
      if (!res.ok) throw new Error(`Error ${res.status}: Unauthorized`)
      const data = await res.json()
      setRestaurants(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCRM()
  }, [search])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Restaurant CRM</h2>
          <p className="text-slate-500">Manage all registered restaurant tenants</p>
        </div>
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input 
            className="pl-9" 
            placeholder="Search by name or email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restaurant</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  Loading restaurant directory...
                </TableCell>
              </TableRow>
            ) : restaurants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  No restaurants found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              restaurants.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-slate-500">{r.email}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.plan === 'pro' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {r.plan}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`flex items-center gap-1.5 text-xs ${r.active ? 'text-emerald-600' : 'text-rose-600'}`}>
                      <div className={`size-1.5 rounded-full ${r.active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="View Profile">
                      <ExternalLink className="size-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="Email Owner">
                      <Mail className="size-3" />
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
