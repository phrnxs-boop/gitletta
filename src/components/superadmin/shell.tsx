'use client'

import { ReactNode, useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

/**
 * The admin shell.
 *
 * Holds the mobile navigation state so the header's menu button and the
 * sidebar's drawer are the same piece of state, which is what a responsive
 * layout needs and what the previous version did not have at all.
 */
export function AdminShell({
  identity,
  children,
}: {
  identity: { email: string; label: string }
  children: ReactNode
}) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar navOpen={navOpen} onClose={() => setNavOpen(false)} identity={identity} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setNavOpen(true)} identity={identity} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
