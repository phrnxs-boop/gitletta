"use client"

import { Link } from 'next/link'
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  CreditCard, 
  Settings, 
  LogOut 
} from 'lucide-react'
import { useAuth } from '@/lib/auth' // Assuming existing auth hook
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  { name: 'Overview', href: '/superadmin', icon: LayoutDashboard },
  { name: 'Restaurant CRM', href: '/superadmin/crm', icon: Users },
  { name: 'Analytics', href: '/superadmin/analytics', icon: BarChart3 },
  { name: 'Payments', href: '/superadmin/payments', icon: CreditCard },
  { name: 'Settings', href: '/superadmin/settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-white flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold tracking-tight">Swixo Admin</h1>
        <p className="text-xs text-slate-500">Global Control Panel</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {NAV_ITEMS.map((item) => (
          <Link 
            key={item.href} 
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <item.icon className="size-4" />
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Button variant="ghost" className="w-full justify-start gap-3 text-slate-600">
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>
    </aside>
  )
}
