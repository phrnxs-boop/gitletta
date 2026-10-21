'use client'

import { AlertTriangle, Clock, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from './data-context'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/**
 * The trial, and the plan, said where the owner is standing.
 *
 * The trial running is worth showing — how many days are left is not
 * something an owner should have to go looking for. The trial being over is
 * worth showing too, because the paid features have stopped.
 *
 * It is a banner and not a full screen, because the restaurant still has to
 * be able to take orders while it decides. Nothing here is deleted when a
 * trial ends.
 */
export function TrialBanner() {
  const { data } = useApp()
  const setView = useStore((s) => s.setView)
  const [dismissed, setDismissed] = useState(false)

  const subscription = data?.subscription
  if (!subscription || dismissed) return null

  if (subscription.isRestricted) {
    return (
      <div className="flex items-center gap-2.5 border-b border-amber-200/70 bg-amber-50 px-3.5 md:px-6 py-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-amber-900">
          <span className="font-semibold">Your free trial has ended.</span> Everything you have built
          is still here — pick a plan to switch the paid features back on.
        </p>
        <button
          onClick={() => setView('billing')}
          className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-amber-700"
        >
          See plans
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-amber-700/70 transition hover:bg-amber-100 hover:text-amber-900"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  // The trial is running. It is only worth a line when the end is close.
  const days = subscription.trialDaysRemaining
  if (!subscription.isTrial || days === null || days > 7) return null

  return (
    <div className="flex items-center gap-2.5 border-b border-blue-200/70 bg-blue-50 px-3.5 md:px-6 py-2">
      <Clock className="size-4 shrink-0 text-blue-600" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-blue-900">
        <span className="font-semibold">
          {days} day{days === 1 ? '' : 's'} left
        </span>{' '}
        in your free trial.
      </p>
      <button
        onClick={() => setView('billing')}
        className={cn(
          'shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition',
          'bg-blue-600 text-white hover:bg-blue-700',
        )}
      >
        Upgrade
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 text-blue-700/70 transition hover:bg-blue-100 hover:text-blue-900"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
