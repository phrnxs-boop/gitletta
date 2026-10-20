'use client'

import { useEffect, useState } from 'react'
import { Menu, Search } from 'lucide-react'
import { GlobalSearch } from './global-search'

export function Header({
  onOpenNav,
  identity,
}: {
  onOpenNav: () => void
  identity: { email: string; label: string }
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  // Cmd / Ctrl + K opens the palette from anywhere in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const initials = identity.email
    .split('@')[0]
    .replace(/[^a-zA-Z]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button
          onClick={onOpenNav}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        <button
          onClick={() => setSearchOpen(true)}
          className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-left transition hover:border-slate-300 hover:bg-white"
        >
          <Search className="size-4 shrink-0 text-slate-400 transition group-hover:text-slate-500" />
          <span className="flex-1 truncate text-[13.5px] text-slate-400">
            Search restaurants, owners…
          </span>
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400 sm:inline-flex">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium leading-tight text-slate-800">
              {identity.label}
            </p>
            <p className="text-[11.5px] leading-tight text-slate-500">{identity.email}</p>
          </div>
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[12.5px] font-semibold text-white shadow-sm">
            {initials || 'SA'}
          </span>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
