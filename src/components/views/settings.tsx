'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/app/data-context'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { ImageUpload } from '@/components/shared/image-upload'
import { PhoneInput } from '@/components/shared/phone-input'
import { applyTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase/client'
import {
  MENU_THEMES,
  normaliseMenuTheme,
  type MenuTheme,
} from '@/lib/menu-theme'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Settings, Store, SlidersHorizontal, CreditCard, AlertTriangle, Save, Building2, MapPin, Phone, Mail, Globe, Clock, Trash2, Check, Sparkles, User, Palette, Bell, Lock, KeyRound, Smartphone, Moon, Sun, Languages, ShieldCheck, ChevronDown, FileText, Star, ExternalLink, RefreshCw, MessageSquare, Send, Loader2, ChevronRight, Instagram, Facebook, Youtube,
  CheckCircle2, XCircle, Receipt, Clock as ClockIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { LANGUAGES } from '@/lib/i18n'

const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
]


/**
 * Timezone options, India first.
 *
 * Two things this list must keep doing:
 *  - 'Asia/Calcutta' is a deprecated alias of 'Asia/Kolkata' that older rows may
 *    still hold, so it stays selectable rather than silently unselectable.
 *  - 'UTC' must remain, because it is the fallback for a restaurant that has
 *    never saved a timezone. A Radix Select whose value matches no item renders
 *    its placeholder, so omitting the default made the field look empty — which
 *    reads as "my setting was lost" even when nothing had been saved yet.
 */
const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Calcutta',
  'Asia/Colombo',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
]

const OPS_TOGGLES = [
  { key: 'notification_email', label: 'Email Notifications', desc: 'Receive order & reservation emails' },
  { key: 'kitchen_display', label: 'Kitchen Display System', desc: 'Show orders on kitchen screens' },
  { key: 'table_qr_ordering', label: 'Table QR Ordering', desc: 'Allow customers to order via QR' },
  { key: 'min_delivery_order', label: 'Min Delivery Order', desc: 'Require minimum for delivery' },
]

export function SettingsView() {
  const { data, refresh } = useApp()
  const { settingsTab, setSettingsTab } = useStore()
  const { scrollRef, collapsed } = useScrollCollapse()
  const [activeTab, setActiveTab] = useState(settingsTab || 'profile')

  // sync with store whenever settingsTab changes (e.g. from header dropdown)
  useEffect(() => {
    if (settingsTab) setActiveTab(settingsTab)
  }, [settingsTab])

  // Tenant form state
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const [tenantForm, setTenantForm] = useState({
    name: '',
    tagline: '',
    email: '',
    phone: '',
    address: '',
    currency: 'INR',
    currencySymbol: '₹',
    logo: '',
    gstin: '',
    fssai: '',
    instagram: '',
    facebook: '',
    youtube: '',
    /** The customer menu's theme. The owner's app theme is a different thing. */
    menuTheme: 'light' as MenuTheme,
  })

  // Operations form state
  const [taxRate, setTaxRate] = useState(0)
  const [serviceCharge, setServiceCharge] = useState(0)
  const [openingHours, setOpeningHours] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [opToggles, setOpToggles] = useState<Record<string, boolean>>({})

  // Danger zone
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // Profile (current user) state
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', avatar: '' })
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' })

  // Preferences state
  const [prefs, setPrefs] = useState({
    theme: 'dark',
    language: 'en',
    emailAlerts: true,
    pushAlerts: true,
    soundAlerts: false,
    dailyDigest: true,
    defaultOrderType: 'DINE_IN',
    compactMode: false,
  })

  // expanded section (for Profile/Preferences cards)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  // Internal reviews state. Diners rate their visit when their table session
  // ends; the reviews land in our own customer_reviews table and the owner
  // reads and replies to them here. There is nothing to connect or sync.
  const [reviews, setReviews] = useState<any[]>([])
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number
    totalReviews: number
    distribution: { stars: number; count: number }[]
    feedbackCount: number
  }>({ averageRating: 0, totalReviews: 0, distribution: [], feedbackCount: 0 })
  const [reviewsEnabled, setReviewsEnabled] = useState(true)
  const [reviewsEnabledSaving, setReviewsEnabledSaving] = useState(false)
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  // Billing state
  const [plans, setPlans] = useState<Array<{
    id: string
    name: string
    description: string | null
    priceMonthly: number
    currency: string
    trialDays: number
    features: string[]
    limits: { locations: number | null; staff: number | null; menuItems: number | null }
    popular: boolean
    razorpayPlanId: string | null
  }>>([])
  const [payments, setPayments] = useState<Array<{
    id: string
    amount: number
    currency: string
    status: string
    plan_id: string
    billing_period: string
    created_at: string
    razorpay_payment_id: string | null
    failure_reason: string | null
  }>>([])
  const [restaurant, setRestaurant] = useState<{ name: string | null; email: string | null }>({ name: null, email: null })
  const [razorpayConfigured, setRazorpayConfigured] = useState(true)
  const [billingLoading, setBillingLoading] = useState(true)
  const [payState, setPayState] = useState<'idle' | 'starting' | 'paying' | 'verifying' | 'success' | 'failed'>('idle')
  const [payingPlan, setPayingPlan] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Initialize from data
  useEffect(() => {
    if (!data) return
    const t = data.tenant
    setTenantForm({
      name: t.name || '',
      tagline: t.tagline || '',
      email: t.email || '',
      phone: t.phone || '',
      address: t.address || '',
      currency: t.currency || 'INR',
      currencySymbol: t.currencySymbol || '$',
      logo: t.logo || '',
      gstin: data.settings.gstin || '',
      fssai: data.settings.fssai || '',
      instagram: data.settings.instagram || '',
      facebook: data.settings.facebook || '',
      youtube: data.settings.youtube || '',
      menuTheme: normaliseMenuTheme(data.settings.menu_theme),
    })
    setTaxRate(t.taxRate ?? 0)
    setServiceCharge(t.serviceCharge ?? 0)
    setOpeningHours(data.settings.opening_hours || 'Mon–Fri 9:00 AM – 10:00 PM')
    setTimezone(data.settings.timezone || 'Asia/Kolkata')
    const toggles: Record<string, boolean> = {}
    for (const t of OPS_TOGGLES) {
      toggles[t.key] = data.settings[t.key] === 'true'
    }
    setOpToggles(toggles)
    // Review collection is on unless the owner has explicitly turned it off.
    setReviewsEnabled(data.settings.reviews_enabled !== 'false')
    // profile
    const u = data.currentUser
    setProfileForm({ name: u.name || '', email: u.email || '', phone: u.phone || '', avatar: u.avatar || '' })
    // prefs
    setPrefs({
      theme: data.settings.pref_theme || 'dark',
      language: data.settings.pref_language || 'en',
      emailAlerts: data.settings.pref_email_alerts !== 'false',
      pushAlerts: data.settings.pref_push_alerts !== 'false',
      soundAlerts: data.settings.pref_sound_alerts === 'true',
      dailyDigest: data.settings.pref_daily_digest !== 'false',
      defaultOrderType: data.settings.pref_default_order_type || 'DINE_IN',
      compactMode: data.settings.pref_compact_mode === 'true',
    })
  }, [data])

  const headers = useMemo(() => ({
    'x-tenant-id': data?.tenant.id ?? '',
    'content-type': 'application/json',
  }), [data?.tenant.id])

  // Dirty detection
  const dirty = useMemo(() => {
    if (!data) return false
    const t = data.tenant
    if (tenantForm.name !== (t.name || '')) return true
    if (tenantForm.tagline !== (t.tagline || '')) return true
    if (tenantForm.email !== (t.email || '')) return true
    if (tenantForm.phone !== (t.phone || '')) return true
    if (tenantForm.address !== (t.address || '')) return true
    if (tenantForm.currency !== (t.currency || 'INR')) return true
    if (tenantForm.currencySymbol !== (t.currencySymbol || '$')) return true
    if (tenantForm.logo !== (t.logo || '')) return true
    if (tenantForm.gstin !== (data.settings.gstin || '')) return true
    if (tenantForm.fssai !== (data.settings.fssai || '')) return true
    if (tenantForm.instagram !== (data.settings.instagram || '')) return true
    if (tenantForm.facebook !== (data.settings.facebook || '')) return true
    if (tenantForm.youtube !== (data.settings.youtube || '')) return true
    if (taxRate !== (t.taxRate ?? 0)) return true
    if (serviceCharge !== (t.serviceCharge ?? 0)) return true
    if (openingHours !== (data.settings.opening_hours || 'Mon–Fri 9:00 AM – 10:00 PM')) return true
    if (timezone !== (data.settings.timezone || 'Asia/Kolkata')) return true
    for (const t of OPS_TOGGLES) {
      if (opToggles[t.key] !== (data.settings[t.key] === 'true')) return true
    }
    // Preferences are part of the same save, so they must be able to raise it.
    // Each comparison mirrors the default used when loading them above.
    if (prefs.theme !== (data.settings.pref_theme || 'dark')) return true
    if (prefs.language !== (data.settings.pref_language || 'en')) return true
    if (prefs.emailAlerts !== (data.settings.pref_email_alerts !== 'false')) return true
    if (prefs.pushAlerts !== (data.settings.pref_push_alerts !== 'false')) return true
    if (prefs.soundAlerts !== (data.settings.pref_sound_alerts === 'true')) return true
    if (prefs.dailyDigest !== (data.settings.pref_daily_digest !== 'false')) return true
    if (prefs.defaultOrderType !== (data.settings.pref_default_order_type || 'DINE_IN')) return true
    if (prefs.compactMode !== (data.settings.pref_compact_mode === 'true')) return true
    return false
  }, [data, tenantForm, taxRate, serviceCharge, openingHours, timezone, opToggles, prefs])

  const tenantId = data?.tenant?.id ?? ''

  const save = async () => {
    if (!dirty || !data?.tenant) return
    setSaving(true)
    try {
      const t = data.tenant
      const body: any = {
        tenant: {
          name: tenantForm.name,
          tagline: tenantForm.tagline,
          email: tenantForm.email,
          phone: tenantForm.phone,
          address: tenantForm.address,
          currency: tenantForm.currency,
          currencySymbol: tenantForm.currencySymbol,
          logo: tenantForm.logo,
          taxRate,
          serviceCharge,
        },
        settings: {
          opening_hours: openingHours,
          timezone,
          gstin: tenantForm.gstin,
          fssai: tenantForm.fssai,
          instagram: tenantForm.instagram,
          facebook: tenantForm.facebook,
          youtube: tenantForm.youtube,
          // The customer menu's theme. It is not the owner's app theme.
          menu_theme: tenantForm.menuTheme,
          // These were read on load but never written, so every preference
          // reset to its default on reload no matter what was chosen.
          pref_theme: prefs.theme,
          pref_language: prefs.language,
          pref_email_alerts: String(prefs.emailAlerts),
          pref_push_alerts: String(prefs.pushAlerts),
          pref_sound_alerts: String(prefs.soundAlerts),
          pref_daily_digest: String(prefs.dailyDigest),
          pref_default_order_type: prefs.defaultOrderType,
          pref_compact_mode: String(prefs.compactMode),
          ...Object.fromEntries(Object.entries(opToggles).map(([k, v]) => [k, String(v)])),
        },
      }
      const res = await edgeFetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success("Customer reviews collection paused", { description: "Customer reviews submission has been stopped." })
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  const load = async () => {
    if (!tenantId) return
    setReviewsLoading(true)
    try {
      const res = await edgeFetch('/api/reviews', { headers: { 'x-tenant-id': tenantId } })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        setReviews(data.reviews || [])
        setReviewStats(data.stats || { averageRating: 0, totalReviews: 0, distribution: [], feedbackCount: 0 })
      }
    } catch {
      toast.error('Failed to load reviews')
    } finally {
      setReviewsLoading(false)
    }
  }

  // Reviews load with the page — there is no connection step to wait for.
  useEffect(() => {
    if (tenantId) {
      load()
    }
  }, [tenantId])

  // Billing load
  const loadBilling = useCallback(async () => {
    setBillingLoading(true)
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
      setBillingLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadBilling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBilling])

  // Billing helpers
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

  function money(currency: string, amount: number): string {
    const n = Number(amount ?? 0).toLocaleString('en-IN')
    return currency === 'INR' ? `₹${n}` : `${currency} ${n}`
  }

  /** Load Razorpay's checkout script once. */
  function loadRazorpay(): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = window as any
      if (w.Razorpay) return resolve()
      const existing = document.querySelector('script[data-razorpay]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Could not load the payment window.')))
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.dataset.razorpay = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load the payment window.'))
      document.body.appendChild(script)
    })
  }

  /** Start a purchase. */
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
        await loadBilling()
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
          await loadBilling()
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
      await loadBilling()
    } catch {
      toast.error('Could not cancel the subscription')
    } finally {
      setCancelling(false)
    }
  }

  // The one review setting that exists: whether the session-end page asks
  // the diner for a rating at all. Saved to the tenant's settings and
  // enforced server-side when a review is submitted.
  const toggleReviewsEnabled = async (v: boolean) => {
    setReviewsEnabled(v)
    setReviewsEnabledSaving(true)
    try {
      const res = await edgeFetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ settings: { reviews_enabled: String(v) } }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.error) throw new Error(data?.error || 'Failed to save')
      toast.success(v ? 'Review collection turned on' : 'Review collection turned off')
    } catch (e: any) {
      setReviewsEnabled(!v)
      toast.error(e?.message || 'Failed to save settings')
    } finally {
      setReviewsEnabledSaving(false)
    }
  }

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return
    setReplyingTo(reviewId)
    try {
      const res = await edgeFetch('/api/reviews/respond', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reviewId, reply: replyText.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Reply posted')
        setReplyText('')
        await load()
      }
    } catch {
      toast.error('Failed to post reply')
    } finally {
      setReplyingTo(null)
    }
  }



  // The rating overview is the server's own aggregate over every review the
  // restaurant has, not just the newest page of them.
  const avgRating = reviewStats.totalReviews > 0 ? reviewStats.averageRating.toFixed(1) : '—'
  const ratingDist = reviewStats.distribution.length
    ? reviewStats.distribution
    : [5, 4, 3, 2, 1].map(n => ({ stars: n, count: 0 }))

  if (!data) return null

  // Discard changes
  const discard = () => {
    if (!data) return
    const t = data.tenant
    setTenantForm({
      name: t.name || '',
      tagline: t.tagline || '',
      email: t.email || '',
      phone: t.phone || '',
      address: t.address || '',
      currency: t.currency || 'INR',
      currencySymbol: t.currencySymbol || '$',
      logo: t.logo || '',
      gstin: data.settings.gstin || '',
      fssai: data.settings.fssai || '',
      instagram: data.settings.instagram || '',
      facebook: data.settings.facebook || '',
      youtube: data.settings.youtube || '',
      menuTheme: normaliseMenuTheme(data.settings.menu_theme),
    })
    setTaxRate(t.taxRate ?? 0)
    setServiceCharge(t.serviceCharge ?? 0)
    setOpeningHours(data.settings.opening_hours || 'Mon–Fri 9:00 AM – 10:00 PM')
    setTimezone(data.settings.timezone || 'Asia/Kolkata')
    const toggles: Record<string, boolean> = {}
    for (const t of OPS_TOGGLES) {
      toggles[t.key] = data.settings[t.key] === 'true'
    }
    setOpToggles(toggles)
    const u = data.currentUser
    setProfileForm({ name: u.name || '', email: u.email || '', phone: u.phone || '', avatar: u.avatar || '' })
    setPrefs({
      theme: data.settings.pref_theme || 'dark',
      language: data.settings.pref_language || 'en',
      emailAlerts: data.settings.pref_email_alerts !== 'false',
      pushAlerts: data.settings.pref_push_alerts !== 'false',
      soundAlerts: data.settings.pref_sound_alerts === 'true',
      dailyDigest: data.settings.pref_daily_digest !== 'false',
      defaultOrderType: data.settings.pref_default_order_type || 'DINE_IN',
      compactMode: data.settings.pref_compact_mode === 'true',
    })
  }

  const onCurrencyChange = (code: string) => {
    const c = CURRENCIES.find(x => x.code === code)
    setTenantForm(f => ({ ...f, currency: code, currencySymbol: c?.symbol || code }))
  }

  // Profile save
  const saveProfile = async () => {
    if (!data?.tenant) return
    setSavingProfile(true)
    try {
      const res = await edgeFetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          tenant: {
            name: profileForm.name,
            email: profileForm.email,
            phone: profileForm.phone,
            avatar: profileForm.avatar,
          },
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Profile updated')
      await refresh()
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  // Password change
  const changePassword = async () => {
    if (pwdForm.next !== pwdForm.confirm) {
      toast.error('Passwords do not match')
      return
    }
    setChangingPassword(true)
    try {
      const res = await edgeFetch('/api/auth/password', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ current: pwdForm.current, next: pwdForm.next }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      toast.success('Password updated')
      setPwdForm({ current: '', next: '', confirm: '' })
    } catch (e: any) {
      toast.error(e.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // Delete restaurant
  const confirmDelete = async () => {
    if (!data?.tenant) return
    try {
      const res = await edgeFetch('/api/settings', {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Restaurant deleted')
      setDeleteOpen(false)
      setDeleteConfirm('')
    } catch {
      toast.error('Failed to delete restaurant')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn(
        'px-3.5 md:px-6 flex items-center justify-between gap-3 flex-wrap transition-all duration-200 ease-out',
      )}>
        <div>
          <h2 className={cn(
            'font-bold tracking-tight flex items-center gap-2 transition-all duration-200 ease-out',
          )}>
            <Settings className={cn('text-primary transition-all duration-200 ease-out', 'h-5 w-5 md:h-6 md:w-6')} />
            Settings
          </h2>
          <div className={cn(
            'overflow-hidden transition-all duration-200 ease-out',
          )}>
            <p className="text-sm text-muted-foreground mt-0.5">Configure your restaurant profile & operations</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" onClick={discard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || saving} className="bg-primary hover:bg-primary/90">
            {saving ? <><span className="animate-spin mr-1">⏳</span> Saving…</> : <><Save className="h-4 w-4" /> Save Changes</>}
          </Button>
        </div>
      </div>

      {/* Tabs — the wrapper is the scroll container; TabsList sticks to the top */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3.5 md:px-6 pb-3 md:pb-6 min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <TabsList className="flex w-full md:w-auto overflow-x-auto scrollbar-thin justify-start gap-1 h-11 sm:h-9 bg-background/95 backdrop-blur-sm border border-border self-start sticky top-0 z-10">
            <TabsTrigger value="profile" className="flex-none whitespace-nowrap px-3"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
            <TabsTrigger value="preferences" className="flex-none whitespace-nowrap px-3"><Palette className="h-3.5 w-3.5" /> Preferences</TabsTrigger>
            <TabsTrigger value="restaurant" className="flex-none whitespace-nowrap px-3"><Store className="h-3.5 w-3.5" /> Restaurant</TabsTrigger>
            <TabsTrigger value="operations" className="flex-none whitespace-nowrap px-3"><SlidersHorizontal className="h-3.5 w-3.5" /> Operations</TabsTrigger>
            <TabsTrigger value="billing" className="flex-none whitespace-nowrap px-3"><CreditCard className="h-3.5 w-3.5" /> Billing</TabsTrigger>
            <TabsTrigger value="reviews" className="flex-none whitespace-nowrap px-3"><Star className="h-3.5 w-3.5" /> Customer Reviews</TabsTrigger>
            <TabsTrigger value="danger" className="flex-none whitespace-nowrap px-3 data-[state=active]:text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Danger Zone</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex-1 mt-3 min-h-0">
            <div className="max-w-3xl space-y-4">
              {/* User summary card */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-bold shrink-0">
                    {profileForm.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{profileForm.name || 'User'}</h3>
                    <p className="text-sm text-muted-foreground truncate">{profileForm.email}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="bg-primary/15 text-primary">{data.currentUser.role}</Badge>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Expandable sections — Profile buttons that open details */}
              <ExpandCard
                icon={<User className="h-5 w-5 text-primary" />}
                title="Personal Information"
                desc="Update your name, email, and contact details"
                open={openSection === 'personal'}
                onToggle={() => setOpenSection(openSection === 'personal' ? null : 'personal')}
              >
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <Field label="Full Name" icon={<User className="h-3.5 w-3.5" />}>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary/50 border-border" />
                  </Field>
                  <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                    <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))} className="bg-secondary/50 border-border" />
                  </Field>
                  <Field label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>
                    <PhoneInput
                      value={profileForm.phone}
                      onChange={(v) => setProfileForm(f => ({ ...f, phone: v }))}
                      placeholder="98765 43210"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <ImageUpload
                      value={profileForm.avatar}
                      onChange={(v) => setProfileForm(f => ({ ...f, avatar: v }))}
                      label="Profile Avatar"
                      shape="circle"
                      size={72}
                      fallback={profileForm.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '👤'}
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90"
                    disabled={savingProfile}
                    onClick={saveProfile}
                  >
                    {savingProfile ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Profile
                  </Button>
                </div>
              </ExpandCard>

              <ExpandCard
                icon={<KeyRound className="h-5 w-5 text-primary" />}
                title="Change Password"
                desc="Update your account password"
                open={openSection === 'password'}
                onToggle={() => setOpenSection(openSection === 'password' ? null : 'password')}
              >
                <div className="grid sm:grid-cols-2 gap-4 pt-2">
                  <div className="sm:col-span-2">
                    <Field label="Current Password" icon={<Lock className="h-3.5 w-3.5" />}>
                      <Input type="password" value={pwdForm.current} onChange={(e) => setPwdForm(f => ({ ...f, current: e.target.value }))} placeholder="••••••••" className="bg-secondary/50 border-border" />
                    </Field>
                  </div>
                  <Field label="New Password" icon={<Lock className="h-3.5 w-3.5" />}>
                    <Input type="password" value={pwdForm.next} onChange={(e) => setPwdForm(f => ({ ...f, next: e.target.value }))} placeholder="••••••••" className="bg-secondary/50 border-border" />
                  </Field>
                  <Field label="Confirm Password" icon={<Lock className="h-3.5 w-3.5" />}>
                    <Input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm(f => ({ ...f, confirm: e.target.value }))} placeholder="••••••••" className="bg-secondary/50 border-border" />
                  </Field>
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90"
                    disabled={changingPassword}
                    onClick={changePassword}
                  >
                    {changingPassword ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Update Password
                  </Button>
                </div>
              </ExpandCard>

            </div>
          </TabsContent>

          <TabsContent value="preferences" className="flex-1 mt-3 min-h-0">
            <div className="max-w-3xl space-y-4">
              <ExpandCard
                icon={<Palette className="h-5 w-5 text-primary" />}
                title="Appearance"
                desc="Customize how the app looks"
                open={openSection === 'appearance'}
                onToggle={() => setOpenSection(openSection === 'appearance' ? null : 'appearance')}
              >
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {prefs.theme === 'dark' ? <Moon className="h-4 w-4 text-primary shrink-0" /> : <Sun className="h-4 w-4 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Theme</p>
                        <p className="text-xs text-muted-foreground">Dark mode is recommended for POS screens</p>
                      </div>
                    </div>
                    <Select value={prefs.theme} onValueChange={(v) => {
                      setPrefs(p => ({ ...p, theme: v }))
                      applyTheme(v as 'dark' | 'light' | 'system')
                      toast.success(`Theme changed to ${v}`, { description: 'Applied instantly' })
                    }}>
                      <SelectTrigger className="bg-secondary/50 border-border w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">🌙 Dark</SelectItem>
                        <SelectItem value="light">☀️ Light</SelectItem>
                        <SelectItem value="system">💻 System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-3">
                      <Languages className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Language</p>
                        <p className="text-xs text-muted-foreground">Display language for the interface</p>
                      </div>
                    </div>
                    <Select value={prefs.language} onValueChange={(v) => setPrefs(p => ({ ...p, language: v }))}>
                      <SelectTrigger className="bg-secondary/50 border-border w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Compact Mode</p>
                        <p className="text-xs text-muted-foreground">Denser layout to fit more on screen</p>
                      </div>
                    </div>
                    <Switch checked={prefs.compactMode} onCheckedChange={(v) => setPrefs(p => ({ ...p, compactMode: v }))} />
                  </div>
                </div>
              </ExpandCard>

              <ExpandCard
                icon={<Bell className="h-5 w-5 text-primary" />}
                title="Notifications"
                desc="Manage how you receive alerts"
                open={openSection === 'notifications'}
                onToggle={() => setOpenSection(openSection === 'notifications' ? null : 'notifications')}
              >
                <div className="space-y-2 pt-2">
                  {[
                    { key: 'emailAlerts' as const, label: 'Email Alerts', desc: 'New orders & reservations via email', icon: Mail },
                    { key: 'pushAlerts' as const, label: 'Push Notifications', desc: 'Real-time browser push alerts', icon: Bell },
                    { key: 'soundAlerts' as const, label: 'Sound Alerts', desc: 'Play sound when new order arrives', icon: Bell },
                    { key: 'dailyDigest' as const, label: 'Daily Digest', desc: 'Daily summary email at 9 AM', icon: Mail },
                  ].map((n) => {
                    const Icon = n.icon
                    return (
                      <div key={n.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{n.label}</p>
                            <p className="text-xs text-muted-foreground">{n.desc}</p>
                          </div>
                        </div>
                        <Switch checked={prefs[n.key]} onCheckedChange={(v) => setPrefs(p => ({ ...p, [n.key]: v }))} />
                      </div>
                    )
                  })}
                </div>
              </ExpandCard>

              <ExpandCard
                icon={<SlidersHorizontal className="h-5 w-5 text-primary" />}
                title="POS Preferences"
                desc="Default behavior for the point of sale"
                open={openSection === 'pos'}
                onToggle={() => setOpenSection(openSection === 'pos' ? null : 'pos')}
              >
                <div className="space-y-3 pt-2">
                  <Field label="Default Order Type" icon={<CreditCard className="h-3.5 w-3.5" />}>
                    <Select value={prefs.defaultOrderType} onValueChange={(v) => setPrefs(p => ({ ...p, defaultOrderType: v }))}>
                      <SelectTrigger className="bg-secondary/50 border-border w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DINE_IN">🍽️ Dine In</SelectItem>
                        <SelectItem value="TAKEAWAY">🥡 Takeaway</SelectItem>
                        <SelectItem value="DELIVERY">🛵 Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </ExpandCard>

              {/* No second save button here. Preferences are saved by the
                  same "Save Changes" action as everything else on this page;
                  this used to be a separate button that only showed a toast
                  and wrote nothing. */}
            </div>
          </TabsContent>

          <TabsContent value="restaurant" className="flex-1 mt-3 min-h-0">
              <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6 max-w-3xl">
                <div className="flex items-center gap-2 mb-5">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Restaurant Profile</h3>
                </div>

                {/* Logo upload */}
                <div className="mb-6">
                  <ImageUpload
                    value={tenantForm.logo}
                    onChange={(v) => setTenantForm((f) => ({ ...f, logo: v }))}
                    label="Restaurant Logo"
                    shape="circle"
                    size={80}
                    fallback={<Store className="h-8 w-8 text-muted-foreground" />}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5 ml-1">Square images work best. Upload a PNG, JPG, or WebP file.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Restaurant Name" icon={<Building2 className="h-3.5 w-3.5" />}>
                    <Input
                      value={tenantForm.name}
                      onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Jaegar Resto"
                      className="bg-secondary/50 border-border"
                    />
                  </Field>
                  <Field label="Tagline" icon={<Sparkles className="h-3.5 w-3.5" />}>
                    <Input
                      value={tenantForm.tagline}
                      onChange={(e) => setTenantForm((f) => ({ ...f, tagline: e.target.value }))}
                      placeholder="Best sushi in town"
                      className="bg-secondary/50 border-border"
                    />
                  </Field>
                  <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                    <Input
                      type="email"
                      value={tenantForm.email}
                      onChange={(e) => setTenantForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="hello@jaegar.resto"
                      className="bg-secondary/50 border-border"
                    />
                  </Field>
                  <Field label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>
                    <PhoneInput
                      value={tenantForm.phone}
                      onChange={(v) => setTenantForm((f) => ({ ...f, phone: v }))}
                      placeholder="98765 43210"
                    />
                  </Field>
                  <Field
                    label="Menu Theme"
                    icon={<Palette className="h-3.5 w-3.5" />}
                    hint="what your customers see"
                  >
                    <Select
                      value={tenantForm.menuTheme}
                      onValueChange={(v) =>
                        setTenantForm((f) => ({ ...f, menuTheme: normaliseMenuTheme(v) }))
                      }
                    >
                      <SelectTrigger className="bg-secondary/50 border-border w-full">
                        <SelectValue placeholder="Select a theme" />
                      </SelectTrigger>
                      <SelectContent>
                        {MENU_THEMES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Currency" icon={<CreditCard className="h-3.5 w-3.5" />}>
                    <Select value={tenantForm.currency} onValueChange={onCurrencyChange}>
                      <SelectTrigger className="bg-secondary/50 border-border w-full">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.code} ({c.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Currency Symbol" icon={<CreditCard className="h-3.5 w-3.5" />}>
                    <Input
                      value={tenantForm.currencySymbol}
                      onChange={(e) => setTenantForm((f) => ({ ...f, currencySymbol: e.target.value }))}
                      maxLength={3}
                      className="bg-secondary/50 border-border"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Address" icon={<MapPin className="h-3.5 w-3.5" />}>
                      <Textarea
                        value={tenantForm.address}
                        onChange={(e) => setTenantForm((f) => ({ ...f, address: e.target.value }))}
                        rows={2}
                        placeholder="123 Main Street, Suite 100, New York, NY 10001"
                        className="bg-secondary/50 border-border resize-none"
                      />
                    </Field>
                  </div>
                </div>

                {/* Compliance & Tax IDs */}
                <div className="mt-6 pt-5 border-t border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Compliance &amp; Tax IDs</h4>
                    <span className="text-[11px] text-muted-foreground">— appears on invoices &amp; receipts</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="GST Number (GSTIN)" icon={<FileText className="h-3.5 w-3.5" />}>
                      <Input
                        value={tenantForm.gstin}
                        onChange={(e) => setTenantForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                        placeholder="22AAAAA0000A1Z5"
                        maxLength={15}
                        className="bg-secondary/50 border-border uppercase font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">15-digit GSTIN. Used for tax invoices.</p>
                    </Field>
                    <Field label="FSSAI License No." icon={<FileText className="h-3.5 w-3.5" />}>
                      <Input
                        value={tenantForm.fssai}
                        onChange={(e) => setTenantForm((f) => ({ ...f, fssai: e.target.value }))}
                        placeholder="10020065000123"
                        maxLength={14}
                        className="bg-secondary/50 border-border font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">14-digit FSSAI food license number.</p>
                    </Field>
                  </div>
                </div>

                {/* Social Media Links */}
                <div className="mt-6 pt-5 border-t border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <Instagram className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">Social Media</h4>
                    <span className="text-[11px] text-muted-foreground">— shown on the customer menu page</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Field label="Instagram" icon={<Instagram className="h-3.5 w-3.5" />}>
                      <Input
                        value={tenantForm.instagram}
                        onChange={(e) => setTenantForm((f) => ({ ...f, instagram: e.target.value }))}
                        placeholder="https://instagram.com/yourrestaurant"
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                    <Field label="Facebook" icon={<Facebook className="h-3.5 w-3.5" />}>
                      <Input
                        value={tenantForm.facebook}
                        onChange={(e) => setTenantForm((f) => ({ ...f, facebook: e.target.value }))}
                        placeholder="https://facebook.com/yourrestaurant"
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                    <Field label="YouTube" icon={<Youtube className="h-3.5 w-3.5" />}>
                      <Input
                        value={tenantForm.youtube}
                        onChange={(e) => setTenantForm((f) => ({ ...f, youtube: e.target.value }))}
                        placeholder="https://youtube.com/@yourrestaurant"
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                  </div>
                </div>
              </Card>
          </TabsContent>

          <TabsContent value="operations" className="flex-1 mt-3 min-h-0">
              <div className="max-w-3xl space-y-4">
                <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Operations &amp; Finance</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Tax Rate (%)" icon={<CreditCard className="h-3.5 w-3.5" />}>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                    <Field label="Service Charge (%)" icon={<CreditCard className="h-3.5 w-3.5" />}>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={serviceCharge}
                        onChange={(e) => setServiceCharge(parseFloat(e.target.value) || 0)}
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                    <Field label="Opening Hours" icon={<Clock className="h-3.5 w-3.5" />}>
                      <Input
                        value={openingHours}
                        onChange={(e) => setOpeningHours(e.target.value)}
                        placeholder="Mon–Fri 9:00 AM – 10:00 PM"
                        className="bg-secondary/50 border-border"
                      />
                    </Field>
                    <Field label="Timezone" icon={<Globe className="h-3.5 w-3.5" />}>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="bg-secondary/50 border-border w-full">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </Card>

                <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Feature Toggles</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {OPS_TOGGLES.map((t) => (
                      <div
                        key={t.key}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{t.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                        </div>
                        <Switch
                          checked={!!opToggles[t.key]}
                          onCheckedChange={(v) => setOpToggles((prev) => ({ ...prev, [t.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
          </TabsContent>

          <TabsContent value="billing" className="flex-1 mt-3 min-h-0">
            <div className="max-w-4xl space-y-4 md:space-y-6">
              {/* ---- loading ---- */}
              {billingLoading && !data?.subscription && (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-40 rounded-2xl bg-secondary/30 animate-pulse" />
                  ))}
                </div>
              )}

              {/* ---- the plan in force ---- */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold tracking-tight">Your plan</h2>
                      {data?.subscription && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            data.subscription.isPaid
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : data.subscription.isTrial
                                ? 'bg-blue-500/15 text-blue-600'
                                : 'bg-amber-500/15 text-amber-600',
                          )}
                        >
                          {STATUS_LABEL[data.subscription.status] ?? data.subscription.status}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data?.subscription
                        ? `${data.subscription.planName} · ${money(data.subscription.currency, data.subscription.priceMonthly)}/month`
                        : 'No plan yet'}
                    </p>
                  </div>

                  {data?.subscription?.isPaid && !data.subscription.cancelAtPeriodEnd && (
                    <Button variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
                      {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                      Cancel subscription
                    </Button>
                  )}
                </div>

                {/* The trial */}
                {data?.subscription?.isTrial && (
                  <div className="mt-4 rounded-xl border border-blue-200/70 bg-blue-50/60 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <ClockIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
                      <div className="text-[13px] leading-relaxed text-blue-900">
                        <p className="font-semibold">
                          {data.subscription.trialDaysRemaining} day
                          {data.subscription.trialDaysRemaining === 1 ? '' : 's'} left in your free trial
                        </p>
                        <p className="mt-0.5 text-blue-800/90">
                          Started {data.subscription.trialStartedAt ? new Date(data.subscription.trialStartedAt).toLocaleDateString('en-IN') : '—'} ·{' '}
                          ends {data.subscription.trialEndsAt ? new Date(data.subscription.trialEndsAt).toLocaleDateString('en-IN') : '—'}.
                          You keep everything you have built. When the trial ends, the paid features stop until you
                          subscribe.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* The trial has run out */}
                {data?.subscription?.isRestricted && (
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
                {data?.subscription?.isPaid && (
                  <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-2">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Next payment:</span>{' '}
                      {data.subscription.currentPeriodEnd
                        ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-IN')
                        : '—'}
                    </p>
                    {data.subscription.cancelAtPeriodEnd && (
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
                        {payState === 'failed' && (payError ?? 'The payment could not be confirmed.')}
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
                  {data?.subscription?.isRestricted ? 'Choose a plan' : 'Plans'}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {plans.map((plan) => {
                    const isCurrent = data?.subscription?.planId === plan.id
                    const isTrialPlan = data?.subscription?.isTrial && plan.id === 'pro'
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
                              {plan.popular && !isCurrent && (
                                <Badge className="bg-amber-500/15 text-[10px] text-amber-600">Popular</Badge>
                              )}
                            </div>
                            {plan.description && (
                              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{plan.description}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-bold leading-none">{money(plan.currency, plan.priceMonthly)}</p>
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

              {/* ---- Usage This Month ---- */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-6">
                <h3 className="font-semibold mb-4">Usage This Month</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <UsageStat
                    label="Staff Members"
                    value={data.users.length}
                    limit={data.subscription?.limits?.staff ?? null}
                  />
                  <UsageStat
                    label="Menu Items"
                    value={data.menuItems.length}
                    limit={data.subscription?.limits?.menuItems ?? null}
                  />
                  <UsageStat
                    label="Locations"
                    value={1}
                    limit={data.subscription?.limits?.locations ?? null}
                  />
                </div>
              </Card>

              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <CreditCard className="mt-0.5 size-3.5 shrink-0" />
                Payments are handled by Razorpay on their own secure checkout. This page never sees your card
                details, and a plan is only activated after the server has checked the payment signature.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="flex-1 mt-3 min-h-0">
            <div className="max-w-4xl space-y-4">
              {/* Header card — reviews come from our own diners, nothing to connect */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0">
                      <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">Customer Reviews</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Diners rate their visit when their table session ends — the reviews land here.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/30 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {reviewsEnabled ? 'Collecting' : 'Paused'}
                    </span>
                    <Switch
                      checked={reviewsEnabled}
                      disabled={reviewsEnabledSaving}
                      onCheckedChange={toggleReviewsEnabled}
                    />
                  </div>
                </div>
                {!reviewsEnabled && (
                  <p className="text-xs text-muted-foreground mt-3">
                    While paused, the session-end page shows no review form and new reviews are declined.
                  </p>
                )}
              </Card>

              {/* Rating overview */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-gradient-primary">{avgRating}</p>
                      <div className="flex items-center gap-0.5 mt-1 justify-center">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} className={cn('h-3.5 w-3.5', n <= Math.round(parseFloat(avgRating)) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{reviewStats.totalReviews} reviews</p>
                    </div>
                    <Separator orientation="vertical" className="h-20" />
                    <div className="flex-1 min-w-[180px] space-y-1">
                      {ratingDist.map(r => (
                        <div key={r.stars} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-8">{r.stars}★</span>
                          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${reviewStats.totalReviews ? (r.count / reviewStats.totalReviews) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-6 text-right">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Reviews list */}
              <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Recent Reviews</h3>
                    <Badge variant="secondary">{reviews.length}</Badge>
                  </div>
                </div>
                <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                  {reviewsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 rounded-xl bg-secondary/30 animate-pulse" />
                      ))}
                    </div>
                  ) : reviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No reviews yet. When a diner rates their visit at the end of a table session, the review appears here.
                    </p>
                  ) : reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border bg-secondary/20 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                            {r.authorName?.[0] || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {r.authorName || 'Anonymous'}
                              {r.tableName && (
                                <span className="font-normal text-muted-foreground"> · {r.tableName}{r.tableArea ? ` (${r.tableArea})` : ''}</span>
                              )}
                            </p>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map(n => (
                                <Star key={n} className={cn('h-3 w-3', n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                              ))}
                              <span className="text-[10px] text-muted-foreground ml-1">
                                {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-foreground/80 mb-2">{r.comment}</p>}
                      {r.tags && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {String(r.tags).split(',').map((t: string) => t.trim()).filter(Boolean).map((t: string) => (
                            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">{t}</span>
                          ))}
                        </div>
                      )}
                      {r.reply && (
                        <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 mt-2">
                          <p className="text-[10px] font-semibold text-primary mb-0.5">OWNER REPLY</p>
                          {replyingTo === r.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Edit your reply…"
                                rows={2}
                                className="bg-background/60 border-border text-sm resize-none"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText('') }}>Cancel</Button>
                                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => handleReply(r.id)} disabled={!replyText.trim()}>
                                  <Send className="h-3 w-3 mr-1" /> Update Reply
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{r.reply}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 mt-1 text-[11.5px] text-primary"
                                onClick={() => { setReplyingTo(r.id); setReplyText(r.reply || '') }}
                              >
                                Edit reply
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      {!r.reply && (
                        <div className="mt-2">
                          {replyingTo === r.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Write a reply…"
                                rows={2}
                                className="bg-secondary/50 border-border text-sm resize-none"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText('') }}>Cancel</Button>
                                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => handleReply(r.id)} disabled={!replyText.trim()}>
                                  <Send className="h-3 w-3 mr-1" /> Post Reply
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => { setReplyingTo(r.id); setReplyText('') }}>
                              <MessageSquare className="h-3.5 w-3.5 mr-1" /> Reply
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="danger" className="flex-1 mt-3 min-h-0">
              <div className="max-w-3xl space-y-4">
                <Card className="rounded-2xl bg-card border-destructive/40 p-4 md:p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <h3 className="font-semibold text-destructive">Danger Zone</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    These actions are permanent. Proceed with extreme caution.
                  </p>

                  <div className="space-y-3">
                    {/* Delete */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <p className="text-sm font-medium">Delete Restaurant</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Permanently remove <strong className="text-foreground">{tenantForm.name || 'this restaurant'}</strong> and all related data. This cannot be undone.
                        </p>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} className="w-full sm:w-auto">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile sticky save bar */}
      <div className="md:hidden shrink-0 sticky bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur p-3 flex items-center gap-2">
        {dirty && (
          <Button variant="ghost" onClick={discard} disabled={saving} className="flex-1">
            Discard
          </Button>
        )}
        <Button onClick={save} disabled={!dirty || saving} className="bg-primary hover:bg-primary/90 flex-1">
          {saving ? <><span className="animate-spin mr-1">⏳</span> Saving…</> : <><Save className="h-4 w-4" /> Save Changes</>}
        </Button>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card border-destructive/40 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete {tenantForm.name || 'restaurant'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all data including orders, menu items, reservations, and staff accounts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{tenantForm.name}</span> to confirm
            </Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={tenantForm.name}
              className="bg-secondary/50 border-border"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteConfirm !== tenantForm.name}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete Restaurant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string
  icon?: React.ReactNode
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
        {hint && <span className="text-muted-foreground/70 font-normal">· {hint}</span>}
      </Label>
      {children}
    </div>
  )
}

function UsageStat({ label, value, limit }: { label: string; value: number; limit: number | null }) {
  // A null limit means the plan does not cap this — Pro has unlimited staff
  // and unlimited menu items — and dividing by it would be nonsense.
  const unlimited = limit === null || limit === undefined
  const pct = unlimited ? 0 : Math.min(100, Math.round((value / limit) * 100))
  const over = !unlimited && value >= limit
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">
        {value}
        <span className="text-sm text-muted-foreground font-normal">
          {unlimited ? ' · unlimited' : ` / ${limit}`}
        </span>
      </p>
      {!unlimited && (
        <>
          <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={cn('text-xs mt-1.5', over ? 'text-destructive' : 'text-muted-foreground')}>
            {over ? 'Limit reached — upgrade plan' : `${pct}% used`}
          </p>
        </>
      )}
    </div>
  )
}

function ExpandCard({ icon, title, desc, open, onToggle, children }: {
  icon: React.ReactNode
  title: string
  desc: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card className={cn('rounded-2xl bg-card border-border overflow-hidden transition-all', open && 'border-primary/30')}>
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full p-4 md:p-5 text-left hover:bg-secondary/30 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 shrink-0">
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{title}</span>
          <span className="block text-xs text-muted-foreground truncate mt-0.5">{desc}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-200 opacity-100' : 'max-h-0 opacity-0')}>
        <div className="px-4 md:px-5 pb-4 md:pb-5 pt-0 border-t border-border">
          {children}
        </div>
      </div>
    </Card>
  )
}
