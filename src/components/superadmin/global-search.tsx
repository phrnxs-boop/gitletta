'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, Search, User, X } from 'lucide-react'
import { superAdminFetch } from '@/lib/superadmin'
import { cn } from '@/lib/utils'

type SearchResult = {
  restaurants: { id: string; name: string; slug: string; plan: string }[]
  users: { id: string; email: string; name: string | null; tenant_id: string | null }[]
}

/**
 * Global search across restaurants and people.
 *
 * The previous header had a search box that was not connected to anything.
 * This one queries the admin API, and is reachable with Cmd/Ctrl + K from
 * anywhere in the panel.
 */
export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setError(null)
      // Focus once the dialog is on screen.
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (!term) {
      setResults(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      const res = await superAdminFetch<SearchResult>(`search?q=${encodeURIComponent(term)}`)
      controller.abort()
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setResults(null)
        return
      }
      setError(null)
      setResults(res.data)
    }, 220)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, open])

  if (!open) return null

  const restaurants = results?.restaurants ?? []
  const users = results?.users ?? []
  const nothing = !loading && !error && query.trim() && !restaurants.length && !users.length

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        onClick={onClose}
        aria-label="Close search"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />
          ) : (
            <Search className="size-4 shrink-0 text-slate-400" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
            placeholder="Search restaurants, owners, email…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {error && (
            <p className="px-3 py-6 text-center text-[13px] text-rose-600">{error}</p>
          )}

          {nothing && (
            <p className="px-3 py-6 text-center text-[13px] text-slate-500">
              Nothing matched “{query.trim()}”.
            </p>
          )}

          {restaurants.length > 0 && (
            <div className="mb-1">
              <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Restaurants
              </p>
              {restaurants.map((r) => (
                <button
                  key={r.id}
                  onClick={() => go(`/superadmin/crm/${r.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <Building2 className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-slate-800">
                      {r.name}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">{r.slug}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600">
                    {r.plan}
                  </span>
                </button>
              ))}
            </div>
          )}

          {users.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                People
              </p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => go(u.tenant_id ? `/superadmin/crm/${u.tenant_id}` : '/superadmin/crm')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <User className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-slate-800">
                      {u.name || u.email}
                    </span>
                    <span className="block truncate text-[12px] text-slate-500">{u.email}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {!query.trim() && (
            <p className="px-3 py-6 text-center text-[13px] text-slate-400">
              Type to search across every restaurant on the platform.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11.5px] text-slate-500">
          <span>Search is limited to super admins.</span>
          <span className={cn('hidden sm:inline')}>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
