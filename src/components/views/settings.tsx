'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/app/data-context'
import { BillingView } from '@/components/views/billing'
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

  if (!data) return null

  const currentPlan = data.tenant.plan || 'STARTER'

  const save = async () => {
    if (!dirty) return
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

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await edgeFetch('/api/reviews/sync', { method: 'POST', headers: { 'x-tenant-id': tenantId } })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Synced ${data.synced} review(s)`)
        await load()
      }
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      await edgeFetch('/api/reviews/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(settings),
      })
      toast.success('Review settings saved')
      await load()
    } catch {
      toast.error('Failed to save settings')
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

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—'
  const ratingDist = [5, 4, 3, 2, 1].map(n => ({ stars: n, count: reviews.filter(r => r.rating === n).length }))

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-2xl bg-secondary/30 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* Connection status card */}
      <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0">
              <svg className="w-7 h-7" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold flex items-center gap-2">
                Customer Reviews
                {connected && (
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                  </Badge>
                )}
                {demoMode && <Badge variant="secondary" className="bg-amber-500/15 text-amber-400">Demo</Badge>}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {connected
                  ? connection?.locationName || 'Customer Reviews linked'
                  : 'Connect your Customer Reviews to sync and manage reviews'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn('h-4 w-4 mr-1.5', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-destructive">
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => {}} className="bg-primary hover:bg-primary/90">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Start Collecting Reviews
              </Button>
            )}
          </div>
        </div>

        {connection?.lastSyncedAt && (
          <p className="text-xs text-muted-foreground mt-3">
            Last synced: {new Date(connection.lastSyncedAt).toLocaleString()}
            {connection.lastSyncError && <span className="text-destructive ml-2">· Error: {connection.lastSyncError}</span>}
          </p>
        )}
      </Card>

      {connected && connection?.needsLocation && (
        /* The owner has chosen Customer Reviews but has not said which of their
           locations this restaurant is. Nothing can be synced until they do. */
        <Card className="rounded-2xl bg-card border-border p-4 md:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold">Choose your business location</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pick the Customer Reviews that belongs to this restaurant. Only the
                profiles your customer account can manage are listed.
              </p>
            </div>
          </div>

          {locationError && (
            <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12.5px] leading-relaxed text-destructive">
              {locationError}
            </p>
          )}

          {locationsLoading ? (
            <div className="mt-4 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-xl bg-secondary/30 animate-pulse" />
              ))}
            </div>
          ) : locationGroups.length === 0 ? (
            <p className="mt-4 rounded-lg bg-secondary/50 px-3 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
              No business locations came back for this Customer account. A location has to be
              verified and your account has to be a manager of it, or Google will not list it.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {locationGroups.map(group => (
                <div key={group.accountName}>
                  <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.accountTitle || group.accountName}
                  </p>
                  <div className="space-y-1.5">
                    {group.locations.map((loc: any) => (
                      <button
                        key={loc.locationId}
                        onClick={() => handleSelectLocation(group.accountName, loc.locationId, loc.locationName)}
                        disabled={choosingLocation !== null}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/20 px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                      >
                        <Store className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{loc.locationName}</span>
                          {(loc.address || loc.storeCode) && (
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {[loc.address, loc.storeCode].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                        {choosingLocation === loc.locationId ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={loadLocations} disabled={locationsLoading}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', locationsLoading && 'animate-spin')} />
              Refresh locations
            </Button>
          </div>
        </Card>
      )}

      {connected && !connection?.needsLocation && (
        <>
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
                  <p className="text-xs text-muted-foreground mt-1">{reviews.length} reviews</p>
                </div>
                <Separator orientation="vertical" className="h-20" />
                <div className="flex-1 min-w-[180px] space-y-1">
                  {ratingDist.map(r => (
                    <div key={r.stars} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-8">{r.stars}★</span>
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${reviews.length ? (r.count / reviews.length) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Settings */}
          <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Review Settings</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium">Enable Customer Reviews</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Master toggle for the integration</p>
                </div>
                <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings(s => ({ ...s, enabled: v }))} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium">Auto-sync reviews</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatically fetch new reviews every {settings.syncIntervalMins} min</p>
                </div>
                <Switch checked={settings.autoSync} onCheckedChange={(v) => setSettings(s => ({ ...s, autoSync: v }))} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium">Show on public menu</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Display customer reviews on the customer-facing menu</p>
                </div>
                <Switch checked={settings.showPublic} onCheckedChange={(v) => setSettings(s => ({ ...s, showPublic: v }))} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium">Minimum rating to show</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Only display reviews with this rating or higher on the public menu</p>
                </div>
                <Select value={String(settings.minRatingFilter)} onValueChange={(v) => setSettings(s => ({ ...s, minRatingFilter: parseInt(v) }))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">All</SelectItem>
                    <SelectItem value="3">3+ ★</SelectItem>
                    <SelectItem value="4">4+ ★</SelectItem>
                    <SelectItem value="5">5 ★</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleSaveSettings}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Save Settings
              </Button>
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
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No reviews yet. Click "Sync Now" to fetch.</p>
              ) : reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-secondary/20 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                        {r.authorName?.[0] || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.authorName || 'Anonymous'}</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <Star key={n} className={cn('h-3 w-3', n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {r.createTime ? new Date(r.createTime).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    {r.flagged && <Badge variant="secondary" className="bg-red-500/15 text-red-400">Flagged</Badge>}
                  </div>
                  {r.comment && <p className="text-sm text-foreground/80 mb-2">{r.comment}</p>}
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
                            <Button variant="ghost" size="sm" onClick={() => { () => {} }}>Cancel</Button>
                            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => {}} disabled={false}>
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {false && (
        <Card className="rounded-2xl bg-card border-border p-4 md:p-4 md:p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <h3 className="font-semibold text-lg">Customer Reviews</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">Collect and display customer reviews with star ratings. Let your diners share their experiences and help others choose your restaurant.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button onClick={() => {}} className="bg-primary hover:bg-primary\/90">Start Collecting Reviews</Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Secure OAuth · Reviews are stored independently from customer sessions
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
