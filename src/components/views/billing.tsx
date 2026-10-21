'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Receipt,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { edgeFetch } from '@/lib/edge'
import { useApp } from '@/components/app/data-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PlanLimits = { locations: number | null; staff: number | null; menuItems: number | null }

type Plan = {
  id: string
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  trialDays: number
  features: string[]
  limits: PlanLimits
  razorpayPlanId: string | null
}

type SubscriptionState = {
  planId: string
  planName: string
  status: string
  isPaid: boolean
  isTrial: boolean
  isRestricted: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  limits: PlanLimits
  features: string[]
  priceMonthly: number
  currency: string
}

type Payment = {
  id: string
  amount: number
  currency: string
  status: string
  plan_id: string
  billing_period: string
  created_at: string
  razorpay_payment_id: string | null
  failure_reason: string | null
}

type PayState = 'idle' | 'starting' | 'paying' | 'verifying' | 'success' | 'failed'

/** The rupee sign where the currency is rupees, the code otherwise. */
function money(currency: string, amount: number): string {
  const n = Number(amount ?? 0).toLocaleString('en-IN')
  return currency === 'INR' ? `₹${n}` : `${currency} ${n}`
}

const STATUS_LABEL: Record<string, string> = {
  trial: 'Free trial',
  active: 'Active',
  expired: 'Trial expired',
  cancelled: 'Cancelled',
  past_due: 'Payment failed',
  pending: 'Pending',
  paused: 'Paused',
  none: 'No subscription',
}

/** Load Razorpay's checkout script once. */
function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.Razorpay) return resolve();
    const existing = document.querySelector('script[data-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load the payment window.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpay = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the payment window.'))
    document.body.appendChild(script)
  })
}

export function BillingView() {
  const { data, refresh } = useApp()
  const [plans, setPlans] = useState<Plan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [restaurant, setRestaurant] = useState<{ name: string | null; email: string | null }>({
    name: null,
    email: null,
  })
  const [razorpayConfigured, setRazorpayConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [payState, setPayState] = useState<PayState>('idle')
  const [payingPlan, setPayingPlan] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Hoisted so the memo's dependency is the id and not the whole data object.
  const tenantId = data?.tenant?.id ?? ''
  const headers = { 'content-type': 'application/json', 'x-tenant-id': tenantId }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await edgeFetch('/api/subscriptions', { headers: { 'x-tenant-id': tenantId } })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body?.error || 'Could not load your billing details')
        return
      }
      setPlans(body.plans ?? [])
      setPayments(body.payments ?? [])
      setRestaurant(body.restaurant ?? { name: null, email: null })
      setRazorpayConfigured(body.razorpayConfigured !== false)
    } catch {
      toast.error('Could not load your billing details')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  const subscription: SubscriptionState | undefined = data?.subscription

  /**
   * Start a purchase.
   *
   * The browser never decides that a payment worked. It opens Razorpay's
   * checkout, Razorpay hands back a signature, and the server checks that
   * signature against its own secret before anything changes.
   */
  const startPurchase = async (planId: string) => {
    setPayingPlan(planId)
    setPayError(null)
    setPayState('starting')

    try {
      const res = await edgeFetch('/api/subscriptions/upgrade', {
        method: 'POST',
        headers,
        body: JSON.stringify({ planId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setPayError(body?.error || 'Could not start the payment.')
        setPayState('failed')
        return
      }

      // A restaurant that already has a subscription changes the plan on it
      // rather than paying again.
      if (body.upgraded) {
        toast.success(`You are now on ${planId === 'pro' ? 'Pro' : 'Starter'}`)
        setPayState('success')
        await refresh()
        await load()
        return
      }

      await loadRazorpay()
      setPayState('paying')

      const rzp = new (window as any).Razorpay({
        key: body.keyId,
        subscription_id: body.razorpaySubscriptionId,
        order_id: body.razorpayOrderId,
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        name: 'Swixo',
        description: `${body.planName} plan — monthly`,
        prefill: {
          name: restaurant.name ?? undefined,
          email: restaurant.email ?? undefined,
        },
        notes: { planId: body.planId },
        theme: { color: '#f97316' },
        modal: {
          ondismiss: () => {
            setPayState('idle')
            setPayingPlan(null)
          },
        },
        handler: async (response: any) => {
          setPayState('verifying')
          const verify = await edgeFetch('/api/subscriptions/verify', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              razorpaySubscriptionId: body.razorpaySubscriptionId,
            }),
          })
          const verified = await verify.json().catch(() => ({}))
          if (!verify.ok) {
            setPayError(verified?.error || 'The payment could not be confirmed.')
            setPayState('failed')
            return
          }
          setPayState('success')
          toast.success('Payment received — your plan is active.')
          await refresh()
          await load()
        },
      })
      rzp.open()
    } catch (e: any) {
      setPayError(e?.message || 'Could not start the payment.')
      setPayState('failed')
    } finally {
      setPayingPlan(null)
    }
  }

  const cancel = async () => {
    if (!confirm('Cancel your subscription? You keep everything you have paid for until the end of the period.')) return
    setCancelling(true)
    try {
      const res = await edgeFetch('/api/subscriptions/cancel', { method: 'POST', headers })
      const body = await res.json()
      if (!res.ok) {
        toast.error(body?.error || 'Could not cancel the subscription')
        return
      }
      toast.success('Your subscription will end at the close of the period.')
      await refresh()
      await load()
    } catch {
      toast.error('Could not cancel the subscription')
    } finally {
      setCancelling(false)
    }
  }

  if (loading && !subscription) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-secondary/30 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ---- the plan in force ---- */}
      <Card className="rounded-2xl bg-card border-border p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">Your plan</h2>
              {subscription && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px]',
                    subscription.isPaid
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : subscription.isTrial
                        ? 'bg-blue-500/15 text-blue-600'
                        : 'bg-amber-500/15 text-amber-600',
                  )}
                >
                  {STATUS_LABEL[subscription.status] ?? subscription.status}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {subscription
                ? `${subscription.planName} · ${money(subscription.currency, subscription.priceMonthly)}/month`
                : 'No plan yet'}
            </p>
          </div>

          {subscription?.isPaid && !subscription.cancelAtPeriodEnd && (
            <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Cancel subscription
            </Button>
          )}
        </div>

        {/* The trial */}
        {subscription?.isTrial && (
          <div className="mt-4 rounded-xl border border-blue-200/70 bg-blue-50/60 p-3.5">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <div className="text-[13px] leading-relaxed text-blue-900">
                <p className="font-semibold">
                  {subscription.trialDaysRemaining} day
                  {subscription.trialDaysRemaining === 1 ? '' : 's'} left in your free trial
                </p>
                <p className="mt-0.5 text-blue-800/90">
                  Started {subscription.trialStartedAt ? new Date(subscription.trialStartedAt).toLocaleDateString('en-IN') : '—'} ·
                  ends {subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString('en-IN') : '—'}.
                  You keep everything you have built. When the trial ends, the paid features stop until you
                  subscribe.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* The trial has run out */}
        {subscription?.isRestricted && (
          <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-[13px] leading-relaxed text-amber-900">
                <p className="font-semibold">Your free trial has ended</p>
                <p className="mt-0.5 text-amber-800/90">
                  Nothing has been deleted — your menu, orders and settings are all still here. The paid
                  features are switched off until you pick a plan below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* The renewal */}
        {subscription?.isPaid && (
          <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Next payment:</span>{' '}
              {subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')
                : '—'}
            </p>
            {subscription.cancelAtPeriodEnd && (
              <p className="text-amber-700">
                <span className="font-medium">Cancelling</span> — access ends at the close of the period.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ---- the payment in progress ---- */}
      {payState !== 'idle' && (
        <Card
          className={cn(
            'rounded-2xl border p-4 md:p-5',
            payState === 'success'
              ? 'border-emerald-200 bg-emerald-50/60'
              : payState === 'failed'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-border bg-card',
          )}
        >
          <div className="flex items-start gap-3">
            {payState === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            ) : payState === 'failed' ? (
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            ) : (
              <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {payState === 'starting' && 'Starting the payment…'}
                {payState === 'paying' && 'Waiting for Razorpay…'}
                {payState === 'verifying' && 'Confirming your payment…'}
                {payState === 'success' && 'Your plan is active'}
                {payState === 'failed' && 'The payment did not go through'}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {payState === 'verifying' &&
                  'Checking the payment signature with the server. Nothing is activated until it matches.'}
                {payState === 'success' &&
                  'The payment was verified and your plan is active. Your next payment is due in a month.'}
                {payState === 'failed' &&
                  (payError ?? 'The payment could not be confirmed.')}
              </p>
              {payState === 'failed' && payingPlan && (
                <Button
                  size="sm"
                  className="mt-2.5 bg-primary hover:bg-primary/90"
                  onClick={() => startPurchase(payingPlan)}
                >
                  Try again
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ---- the plans ---- */}
      <div>
        <h3 className="mb-2.5 text-sm font-semibold">
          {subscription?.isRestricted ? 'Choose a plan' : 'Plans'}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent = subscription?.planId === plan.id
            const isTrialPlan = subscription?.isTrial && plan.id === 'pro'
            return (
              <Card
                key={plan.id}
                className={cn(
                  'rounded-2xl border p-4 md:p-5 flex flex-col',
                  isCurrent
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold">{plan.name}</h4>
                      {isCurrent && (
                        <Badge className="bg-primary/15 text-[10px] text-primary">Current</Badge>
                      )}
                      {plan.id === 'pro' && !isCurrent && (
                        <Badge className="bg-amber-500/15 text-[10px] text-amber-600">Popular</Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{plan.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold leading-none">
                      {money(plan.currency, plan.priceMonthly)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">per month</p>
                  </div>
                </div>

                <ul className="mt-3.5 space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isTrialPlan}
                    >
                      {isTrialPlan ? 'Included in your trial' : 'Your current plan'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/90"
                      disabled={payState === 'paying' || payState === 'verifying' || payState === 'starting'}
                      onClick={() => startPurchase(plan.id)}
                    >
                      {payState === 'starting' && payingPlan === plan.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {plan.id === 'pro' ? 'Upgrade to Pro' : 'Upgrade to Starter'}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>

        {!razorpayConfigured && (
          <p className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
            Payments are not set up on the server yet. The platform owner has to add the Razorpay keys
            before anyone can subscribe.
          </p>
        )}
      </div>

      {/* ---- the payment history ---- */}
      {payments.length > 0 && (
        <Card className="rounded-2xl bg-card border-border p-4 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Payment history</h3>
            <Badge variant="secondary" className="text-[10px]">{payments.length}</Badge>
          </div>
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {money(p.currency, Number(p.amount))} · {p.plan_id}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('en-IN')} · {p.billing_period}
                    {p.failure_reason ? ` · ${p.failure_reason}` : ''}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    'shrink-0 text-[10px]',
                    p.status === 'succeeded'
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-red-500/15 text-red-600',
                  )}
                >
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <CreditCard className="mt-0.5 size-3.5 shrink-0" />
        Payments are handled by Razorpay on their own secure checkout. This page never sees your card
        details, and a plan is only activated after the server has checked the payment signature.
      </p>
    </div>
  )
}
