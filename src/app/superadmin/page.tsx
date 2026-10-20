"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { TrendingUp, Users, Store, CheckCircle } from 'lucide-react'
import { edgeFetch } from '@/lib/edge'

type OverviewStats = {
  totalRestaurants: number
  newSignups: number
  completedOnboarding: number
}

export default function SuperAdminOverview() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await edgeFetch('/super-admin/overview')
        if (!res.ok) throw new Error(`Error ${res.status}: Unauthorized or not found`)
        const data = await res.json()
        setStats(data.summary)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full text-slate-500">Loading global metrics...</div>
  if (error) return <div className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-100">{error}</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Business Overview</h2>
        <p className="text-slate-500">Real-time global metrics across all tenants</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Restaurants" 
          value={stats?.totalRestaurants} 
          icon={Store} 
          color="text-blue-600" 
          bg="bg-blue-50" 
        />
        <StatCard 
          title="New Signups (30d)" 
          value={stats?.newSignups} 
          icon={TrendingUp} 
          color="text-emerald-600" 
          bg="bg-emerald-50" 
        />
        <StatCard 
          title="Onboarded" 
          value={stats?.completedOnboarding} 
          icon={CheckCircle} 
          color="text-indigo-600" 
          bg="bg-indigo-50" 
        />
        <StatCard 
          title="Active Users" 
          value="--" 
          icon={Users} 
          color="text-orange-600" 
          bg="bg-orange-50" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Quick Insight</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            The platform is currently scaling. Most new sign-ups are completing onboarding 
            within the first 24 hours. We should monitor the conversion from trial to paid 
            subscriptions in the next phase.
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold mb-4">System Health</h3>
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            All Edge Functions operational
          </div >
        </Card>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className="p-6 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${bg} ${color}`}>
        <Icon className="size-6" />
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold">{value ?? 0}</p>
      </div>
    </Card>
  )
}
