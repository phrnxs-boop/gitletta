"use client"

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export function Header() {
  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-6">
      <div className="relative w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <Input 
          className="pl-9 bg-slate-50 border-none" 
          placeholder="Global search (restaurants, users...)" 
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">Super Admin</p>
          <p className="text-xs text-slate-500">System Owner</p>
        </div>
        <div className="size-8 rounded-full bg-slate-200" />
      </div>
    </header>
  )
}
