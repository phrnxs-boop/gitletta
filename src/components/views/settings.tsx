'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useApp } from '@/components/app/data-context'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { ImageUpload } from '@/components/shared/image-upload'
import { PhoneInput } from '@/components/shared/phone-input'
import { applyTheme } from '@/lib/theme'
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
  Settings, Store, SlidersHorizontal, CreditCard, AlertTriangle, Save, Building2, MapPin, Phone, Mail, Globe, Clock, Trash2, Check, Sparkles, User, Palette, Bell, Lock, KeyRound, Smartphone, Moon, Sun, Languages, ShieldCheck, ChevronDown, FileText, Star, ExternalLink, RefreshCw, MessageSquare, Send, Instagram, Facebook, Youtube,
} from 'lucide-react'
import { toast } from 'sonner'

const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
]

const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: '$29',
    period: '/mo',
    color: '#9aa3b2',
    features: ['1 location', 'Up to 5 staff', 'Basic analytics', 'Email support'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: '$89',
    period: '/mo',
    color: '#f97316',
    features: ['3 locations', 'Unlimited staff', 'Advanced analytics', 'Priority support', 'QR ordering', 'Kitchen display'],
    popular: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    color: '#c084fc',
    features: ['Unlimited locations', 'SSO & SAML', 'Dedicated manager', '99.9% SLA', 'Custom integrations'],
  },
]

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Calcutta',
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
  const [tenantForm, setTenantForm] = useState({
    name: '',
    tagline: '',
    email: '',
    phone: '',
    address: '',
    currency: 'USD',
    currencySymbol: '$',
    logo: '',
    gstin: '',
    fssai: '',
    instagram: '',
    facebook: '',
    youtube: '',
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
      currency: t.currency || 'USD',
      currencySymbol: t.currencySymbol || '$',
      logo: t.logo || '',
      gstin: data.settings.gstin || '',
      fssai: data.settings.fssai || '',
      instagram: data.settings.instagram || '',
      facebook: data.settings.facebook || '',
      youtube: data.settings.youtube || '',
    })
    setTaxRate(t.taxRate ?? 0)
    setServiceCharge(t.serviceCharge ?? 0)
    setOpeningHours(data.settings.opening_hours || 'Mon–Fri 9:00 AM – 10:00 PM')
    setTimezone(data.settings.timezone || 'UTC')
    const toggles: Record<string, boolean> = {}
    for (const t of OPS_TOGGLES) {
      toggles[t.key] = data.settings[t.key] === 'true'
    }
    setOpToggles(toggles)
    // profile
    const u = data.currentUser
    setProfileForm({ name: u.name || '', email: u.email || '', phone: '', avatar: u.avatar || '' })
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
    if (tenantForm.currency !== (t.currency || 'USD')) return true
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
    if (timezone !== (data.settings.timezone || 'UTC')) return true
    for (const t of OPS_TOGGLES) {
      if (opToggles[t.key] !== (data.settings[t.key] === 'true')) return true
    }
    return false
  }, [data, tenantForm, taxRate, serviceCharge, openingHours, timezone, opToggles])

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
          ...Object.fromEntries(Object.entries(opToggles).map(([k, v]) => [k, String(v)])),
        },
      }
      const res = await edgeFetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Settings saved')
      await refresh()
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    const t = data.tenant
    setTenantForm({
      name: t.name || '',
      tagline: t.tagline || '',
      email: t.email || '',
      phone: t.phone || '',
      address: t.address || '',
      currency: t.currency || 'USD',
      currencySymbol: t.currencySymbol || '$',
      logo: t.logo || '',
      gstin: data.settings.gstin || '',
      fssai: data.settings.fssai || '',
      instagram: data.settings.instagram || '',
      facebook: data.settings.facebook || '',
      youtube: data.settings.youtube || '',
    })
    setTaxRate(t.taxRate ?? 0)
    setServiceCharge(t.serviceCharge ?? 0)
    setOpeningHours(data.settings.opening_hours || 'Mon–Fri 9:00 AM – 10:00 PM')
    setTimezone(data.settings.timezone || 'UTC')
    const toggles: Record<string, boolean> = {}
    for (const t of OPS_TOGGLES) {
      toggles[t.key] = data.settings[t.key] === 'true'
    }
    setOpToggles(toggles)
  }

  const onCurrencyChange = (code: string) => {
    const c = CURRENCIES.find((x) => x.code === code)
    if (c) {
      setTenantForm((f) => ({ ...f, currency: c.code, currencySymbol: c.symbol }))
    }
  }

  const confirmDelete = () => {
    if (deleteConfirm !== tenantForm.name) {
      toast.error(`Type "${tenantForm.name}" to confirm`)
      return
    }
    setDeleteOpen(false)
    setDeleteConfirm('')
    toast.info('Contact support to delete', {
      description: 'Email support@jaegar.resto to permanently delete this restaurant.',
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn(
        'px-4 md:px-6 flex items-center justify-between gap-3 flex-wrap transition-all duration-300 ease-out',
        collapsed ? 'pt-2 pb-2' : 'pt-4 md:pt-6 pb-3',
      )}>
        <div>
          <h2 className={cn(
            'font-bold tracking-tight flex items-center gap-2 transition-all duration-300 ease-out',
            collapsed ? 'text-base md:text-lg' : 'text-xl md:text-2xl',
          )}>
            <Settings className={cn('text-primary transition-all duration-300 ease-out', collapsed ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5 md:h-6 md:w-6')} />
            Settings
          </h2>
          <div className={cn(
            'overflow-hidden transition-all duration-300 ease-out',
            collapsed ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100',
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 pb-3 md:pb-6 min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <TabsList className="flex w-full md:w-auto overflow-x-auto scrollbar-thin justify-start gap-1 bg-background/95 backdrop-blur-sm border border-border self-start sticky top-0 z-10">
            <TabsTrigger value="profile" className="flex-none whitespace-nowrap px-3"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
            <TabsTrigger value="preferences" className="flex-none whitespace-nowrap px-3"><Palette className="h-3.5 w-3.5" /> Preferences</TabsTrigger>
            <TabsTrigger value="restaurant" className="flex-none whitespace-nowrap px-3"><Store className="h-3.5 w-3.5" /> Restaurant</TabsTrigger>
            <TabsTrigger value="operations" className="flex-none whitespace-nowrap px-3"><SlidersHorizontal className="h-3.5 w-3.5" /> Operations</TabsTrigger>
            <TabsTrigger value="billing" className="flex-none whitespace-nowrap px-3"><CreditCard className="h-3.5 w-3.5" /> Billing</TabsTrigger>
            <TabsTrigger value="reviews" className="flex-none whitespace-nowrap px-3"><Star className="h-3.5 w-3.5" /> Google Reviews</TabsTrigger>
            <TabsTrigger value="danger" className="flex-none whitespace-nowrap px-3 data-[state=active]:text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Danger Zone</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex-1 mt-3 min-h-0">
            <div className="max-w-3xl space-y-4">
              {/* User summary card */}
              <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
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
                  <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => toast.success('Profile updated')}><Save className="h-3.5 w-3.5" /> Save Profile</Button>
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
                  <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => {
                    if (!pwdForm.current || !pwdForm.next) { toast.error('Fill all fields'); return }
                    if (pwdForm.next !== pwdForm.confirm) { toast.error('Passwords do not match'); return }
                    if (pwdForm.next.length < 8) { toast.error('Password must be 8+ characters'); return }
                    setPwdForm({ current: '', next: '', confirm: '' })
                    setOpenSection(null)
                    toast.success('Password updated')
                  }}><KeyRound className="h-3.5 w-3.5" /> Update Password</Button>
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
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hi">हिन्दी (Hindi)</SelectItem>
                        <SelectItem value="bn">বাংলা (Bengali)</SelectItem>
                        <SelectItem value="ta">தமிழ் (Tamil)</SelectItem>
                        <SelectItem value="te">తెలుగు (Telugu)</SelectItem>
                        <SelectItem value="mr">मराठी (Marathi)</SelectItem>
                        <SelectItem value="gu">ગુજરાતી (Gujarati)</SelectItem>
                        <SelectItem value="kn">ಕನ್ನಡ (Kannada)</SelectItem>
                        <SelectItem value="ml">മലയാളം (Malayalam)</SelectItem>
                        <SelectItem value="pa">ਪੰਜਾਬੀ (Punjabi)</SelectItem>
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

              <div className="flex justify-end">
                <Button className="bg-primary hover:bg-primary/90" onClick={() => toast.success('Preferences saved')}>
                  <Save className="h-4 w-4" /> Save Preferences
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="restaurant" className="flex-1 mt-3 min-h-0">
              <Card className="rounded-2xl bg-card border-border p-5 md:p-6 max-w-3xl">
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
                    <span className="text-[11px] text-muted-foreground">— appears on invoices & receipts</span>
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
                <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <SlidersHorizontal className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Operations & Finance</h3>
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

                <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
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
              <div className="max-w-4xl space-y-4">
                <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${PLANS.find((p) => p.id === currentPlan)?.color || '#f97316'}1a` }}
                      >
                        <CreditCard className="h-5 w-5" style={{ color: PLANS.find((p) => p.id === currentPlan)?.color || '#f97316' }} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Plan</p>
                        <p className="text-xl font-bold">{PLANS.find((p) => p.id === currentPlan)?.name ?? currentPlan}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Active
                    </Badge>
                  </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {PLANS.map((plan) => {
                    const isCurrent = plan.id === currentPlan
                    return (
                      <Card
                        key={plan.id}
                        className={cn(
                          'rounded-2xl p-5 relative flex flex-col',
                          isCurrent ? 'border-2 bg-card' : 'border border-border bg-card'
                        )}
                        style={isCurrent ? { borderColor: plan.color } : undefined}
                      >
                        {plan.popular && !isCurrent && (
                          <Badge className="absolute -top-2.5 left-5 bg-primary text-primary-foreground">
                            <Sparkles className="h-3 w-3" /> Popular
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge
                            className="absolute -top-2.5 left-5"
                            style={{ backgroundColor: plan.color, color: '#fff' }}
                          >
                            <Check className="h-3 w-3" /> Current
                          </Badge>
                        )}
                        <div className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: plan.color }} />
                            <h3 className="font-semibold">{plan.name}</h3>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold">{plan.price}</span>
                            <span className="text-sm text-muted-foreground">{plan.period}</span>
                          </div>
                        </div>
                        <ul className="space-y-2 text-sm flex-1">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2">
                              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: plan.color }} />
                              <span className="text-muted-foreground">{f}</span>
                            </li>
                          ))}
                        </ul>
                        <Separator className="my-4" />
                        <Button
                          variant={isCurrent ? 'secondary' : 'default'}
                          disabled={isCurrent}
                          onClick={() => toast.success(`Upgrade to ${plan.name}`, { description: 'Our team will reach out to finalize your upgrade.' })}
                          className={isCurrent ? '' : 'bg-primary hover:bg-primary/90'}
                        >
                          {isCurrent ? 'Current Plan' : `Upgrade to ${plan.name}`}
                        </Button>
                      </Card>
                    )
                  })}
                </div>

                <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
                  <h3 className="font-semibold mb-4">Usage This Month</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <UsageStat label="Staff Members" value={data.users.length} limit={currentPlan === 'STARTER' ? 5 : 50} />
                    <UsageStat label="Menu Items" value={data.menuItems.length} limit={currentPlan === 'STARTER' ? 50 : 500} />
                    <UsageStat label="Tables" value={data.tables.length} limit={currentPlan === 'STARTER' ? 10 : 100} />
                  </div>
                </Card>
              </div>
          </TabsContent>

          <TabsContent value="reviews" className="flex-1 mt-3 min-h-0">
            <GoogleReviewsTab tenantId={data?.tenant?.id ?? ''} />
          </TabsContent>

          <TabsContent value="danger" className="flex-1 mt-3 min-h-0">
              <div className="max-w-3xl space-y-4">
                <Card className="rounded-2xl bg-card border-destructive/40 p-5 md:p-6">
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

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  )
}

function UsageStat({ label, value, limit }: { label: string; value: number; limit: number }) {
  const pct = Math.min(100, Math.round((value / limit) * 100))
  const over = value >= limit
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">
        {value}
        <span className="text-sm text-muted-foreground font-normal"> / {limit}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-xs mt-1.5', over ? 'text-destructive' : 'text-muted-foreground')}>
        {over ? 'Limit reached — upgrade plan' : `${pct}% used`}
      </p>
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
          <span className="block text-xs text-muted-foreground truncate">{desc}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-4 md:pb-5 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </Card>
  )
}

// ─── Google Reviews Tab ──────────────────────────────────────────────────
function GoogleReviewsTab({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [connection, setConnection] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [settings, setSettings] = useState({
    enabled: true,
    autoSync: true,
    syncIntervalMins: 60,
    showPublic: true,
    minRatingFilter: 0,
  })

  const headers = useMemo(() => ({ 'x-tenant-id': tenantId, 'content-type': 'application/json' }), [tenantId])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const res = await edgeFetch('/api/google-reviews/settings', { headers: { 'x-tenant-id': tenantId } })
      const data = await res.json()
      setConnected(data.connected)
      setConnection(data.connection)
      setReviews(data.reviews || [])
      if (data.connection) {
        setSettings({
          enabled: data.connection.enabled,
          autoSync: data.connection.autoSync,
          syncIntervalMins: data.connection.syncIntervalMins,
          showPublic: data.connection.showPublic,
          minRatingFilter: data.connection.minRatingFilter,
        })
      }
    } catch {
      toast.error('Failed to load Google Reviews')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { load() }, [load])

  const handleConnect = async () => {
    try {
      const res = await edgeFetch('/api/google-reviews/connect', { headers: { 'x-tenant-id': tenantId } })
      const data = await res.json()
      if (data.demoMode) {
        setDemoMode(true)
        setConnected(true)
        toast.success('Demo mode activated', { description: 'Sample Google reviews loaded for testing.' })
        await load()
      } else if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch {
      toast.error('Failed to connect')
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Business Profile? This removes all synced reviews. Historical orders are NOT affected.')) return
    try {
      await edgeFetch('/api/google-reviews/connect', { method: 'DELETE', headers: { 'x-tenant-id': tenantId } })
      setConnected(false)
      setReviews([])
      setConnection(null)
      toast.success('Google Business Profile disconnected')
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await edgeFetch('/api/google-reviews/sync', { method: 'POST', headers: { 'x-tenant-id': tenantId } })
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
      await edgeFetch('/api/google-reviews/settings', {
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
      const res = await edgeFetch('/api/google-reviews/respond', {
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
      <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0">
              <svg className="w-7 h-7" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold flex items-center gap-2">
                Google Business Profile
                {connected && (
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                  </Badge>
                )}
                {demoMode && <Badge variant="secondary" className="bg-amber-500/15 text-amber-400">Demo</Badge>}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {connected
                  ? connection?.locationName || 'Google Business Profile linked'
                  : 'Connect your Google Business Profile to sync and manage reviews'}
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
              <Button size="sm" onClick={handleConnect} className="bg-primary hover:bg-primary/90">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Connect Google
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

      {connected && (
        <>
          {/* Rating overview */}
          <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
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
          <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Review Settings</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium">Enable Google Reviews</p>
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
                  <p className="text-xs text-muted-foreground mt-0.5">Display Google reviews on the customer-facing menu</p>
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
          <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
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
                      <p className="text-xs text-foreground/80">{r.reply}</p>
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
        </>
      )}

      {!connected && (
        <Card className="rounded-2xl bg-card border-border p-5 md:p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <h3 className="font-semibold text-lg">Connect Google Business Profile</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Sync your Google reviews, view ratings, respond to customers, and showcase reviews on your digital menu. Requires a Google Business Profile.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button onClick={handleConnect} className="bg-primary hover:bg-primary/90">
                <ExternalLink className="h-4 w-4 mr-1.5" /> Connect Google Business Profile
              </Button>
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
