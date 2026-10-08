'use client'

/**
 * Swixo — 5-step onboarding wizard
 * Task ID: OB-1
 *
 * Steps:
 *  1. Create Restaurant (details + logo)
 *  2. Create Menu with AI (import via VLM or skip/manual)
 *  3. Customize (theme, currency, tax, ordering toggles)
 *  4. Generate QR (table count + grid preview)
 *  5. Go Live (success + confetti + action buttons)
 *
 * State is autosaved to `localStorage["tablo-onboarding"]` on every change
 * and restored on mount. Back navigation never loses data because all steps
 * share the single `onboardingData` object.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Store,
  Sparkles,
  Pencil,
  Trash2,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Loader2,
  Wand2,
  Utensils,
  Settings2,
  QrCode,
  Rocket,
  PartyPopper,
  ShoppingBag,
  LayoutDashboard,
  Download,
  Printer,
  Leaf,
  Drumstick,
  ShieldAlert,
  ImageIcon,
  ScanLine,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ImageUpload } from '@/components/shared/image-upload'
import { PhoneInput } from '@/components/shared/phone-input'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Confidence = 'low' | 'high'

interface ExtractedVariant {
  name: string
  price: number
}
interface ExtractedAddOn {
  name: string
  price: number
}

interface MenuItemDraft {
  id: string
  name: string
  description: string | null
  price: number
  veg: boolean | null
  confidence: Confidence
  variants: ExtractedVariant[]
  addOns: ExtractedAddOn[]
  tags: string[]
}

interface CategoryDraft {
  id: string
  name: string
  icon: string
  items: MenuItemDraft[]
}

interface RestaurantDraft {
  name: string
  logo: string
  phone: string
  email: string
  address: string
  cuisine: string
  gstin: string
  fssai: string
}

interface CustomizeDraft {
  theme: string
  currency: string
  currencySymbol: string
  taxRate: number
  serviceCharge: number
  onlineOrdering: boolean
  tableQrOrdering: boolean
  kitchenDisplay: boolean
  autoAccept: boolean
}

interface QrDraft {
  tableCount: number
  generated: boolean
}

interface OnboardingData {
  step: number
  restaurant: RestaurantDraft
  menu: { categories: CategoryDraft[] }
  customize: CustomizeDraft
  qr: QrDraft
}

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'tablo-onboarding'
const TOTAL_STEPS = 5

const STEP_META: { title: string; subtitle: string }[] = [
  { title: 'Create Restaurant', subtitle: 'Tell us about your place' },
  { title: 'Build Your Menu', subtitle: 'Import with AI or add manually' },
  { title: 'Customize', subtitle: 'Theme, currency & ordering' },
  { title: 'Generate QR Codes', subtitle: 'For dine-in tables' },
  { title: 'Go Live', subtitle: 'You are all set' },
]

const CUISINES = [
  'Indian',
  'Chinese',
  'Italian',
  'Mexican',
  'Japanese',
  'Thai',
  'Continental',
  'Multi-cuisine',
  'Other',
]

const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
]

const MENU_THEMES = ['Dark', 'Light', 'Warm', 'Minimal']

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function defaultData(): OnboardingData {
  return {
    step: 1,
    restaurant: {
      name: '',
      logo: '',
      phone: '',
      email: '',
      address: '',
      cuisine: '',
      gstin: '',
      fssai: '',
    },
    menu: { categories: [] },
    customize: {
      theme: 'Dark',
      currency: 'INR',
      currencySymbol: '₹',
      taxRate: 5,
      serviceCharge: 0,
      onlineOrdering: true,
      tableQrOrdering: true,
      kitchenDisplay: false,
      autoAccept: false,
    },
    qr: {
      tableCount: 10,
      generated: false,
    },
  }
}

/** Merge persisted data over the default so new fields always exist. */
function hydrate(stored: Partial<OnboardingData> | null): OnboardingData {
  const base = defaultData()
  if (!stored) return base
  return {
    step: typeof stored.step === 'number' ? stored.step : 1,
    restaurant: { ...base.restaurant, ...(stored.restaurant || {}) },
    menu: {
      categories: Array.isArray(stored.menu?.categories)
        ? (stored.menu!.categories.map((c) => ({
            id: c.id || uid(),
            name: c.name || 'Untitled',
            icon: c.icon || '🍽️',
            items: Array.isArray(c.items)
              ? c.items.map((i) => ({
                  id: i.id || uid(),
                  name: i.name || '',
                  description: i.description ?? null,
                  price: typeof i.price === 'number' ? i.price : 0,
                  veg: i.veg ?? null,
                  confidence: i.confidence === 'low' ? 'low' : 'high',
                  variants: Array.isArray(i.variants) ? i.variants : [],
                  addOns: Array.isArray(i.addOns) ? i.addOns : [],
                  tags: Array.isArray(i.tags) ? i.tags : [],
                }))
              : [],
          })))
        : [],
    },
    customize: { ...base.customize, ...(stored.customize || {}) },
    qr: { ...base.qr, ...(stored.qr || {}) },
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function categoryIconFor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('dessert') || n.includes('sweet')) return '🍰'
  if (n.includes('drink') || n.includes('beverage') || n.includes('beverages')) return '🍹'
  if (n.includes('pizza')) return '🍕'
  if (n.includes('burger')) return '🍔'
  if (n.includes('sushi')) return '🍣'
  if (n.includes('curry') || n.includes('main')) return '🍛'
  if (n.includes('pasta') || n.includes('noodle')) return '🍝'
  if (n.includes('salad') || n.includes('starter') || n.includes('appet')) return '🥗'
  if (n.includes('soup')) return '🍜'
  if (n.includes('rice')) return '🍚'
  if (n.includes('bread') || n.includes('bakery')) return '🍞'
  if (n.includes('mexican') || n.includes('taco')) return '🌮'
  if (n.includes('dumpling')) return '🥟'
  if (n.includes('grill') || n.includes('bbq')) return '🍢'
  if (n.includes('cold')) return '🧊'
  return '🍽️'
}

/* ================================================================== */
/* Root component                                                      */
/* ================================================================== */

export function OnboardingFlow() {
  const [data, setData] = useState<OnboardingData>(() => {
    if (typeof window === 'undefined') return defaultData()
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return hydrate(raw ? (JSON.parse(raw) as Partial<OnboardingData>) : null)
    } catch {
      return defaultData()
    }
  })

  // autosave on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* quota / private mode — ignore */
    }
  }, [data])

  const step = data.step
  const progress = Math.round((step / TOTAL_STEPS) * 100)

  const setRestaurant = useCallback((patch: Partial<RestaurantDraft>) => {
    setData((prev) => ({
      ...prev,
      restaurant: { ...prev.restaurant, ...patch },
    }))
  }, [])

  const setCustomize = useCallback((patch: Partial<CustomizeDraft>) => {
    setData((prev) => ({
      ...prev,
      customize: { ...prev.customize, ...patch },
    }))
  }, [])

  const setQr = useCallback((patch: Partial<QrDraft>) => {
    setData((prev) => ({ ...prev, qr: { ...prev.qr, ...patch } }))
  }, [])

  const setMenu = useCallback(
    (updater: (prev: { categories: CategoryDraft[] }) => { categories: CategoryDraft[] }) => {
      setData((prev) => ({ ...prev, menu: updater(prev.menu) }))
    },
    [],
  )

  const goNext = useCallback(() => {
    setData((prev) => ({ ...prev, step: Math.min(TOTAL_STEPS, prev.step + 1) }))
  }, [])

  const goBack = useCallback(() => {
    setData((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }))
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ambient gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(60rem 40rem at 15% -10%, rgba(255,126,107,0.10), transparent 60%), radial-gradient(50rem 35rem at 100% 0%, rgba(192,132,252,0.06), transparent 55%)',
        }}
      />

      {/* progress header */}
      <ProgressHeader step={step} progress={progress} />

      {/* main */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              {step === 1 && (
                <StepRestaurant
                  restaurant={data.restaurant}
                  setRestaurant={setRestaurant}
                  onNext={goNext}
                />
              )}
              {step === 2 && (
                <StepMenu
                  menu={data.menu}
                  setMenu={setMenu}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 3 && (
                <StepCustomize
                  customize={data.customize}
                  setCustomize={setCustomize}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 4 && (
                <StepQr
                  restaurant={data.restaurant}
                  qr={data.qr}
                  setQr={setQr}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
              {step === 5 && (
                <StepGoLive
                  restaurant={data.restaurant}
                  data={data}
                  onRestart={() => setData(defaultData())}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* footer hint */}
      <footer className="px-4 py-4 text-center text-[11px] text-muted-foreground/70">
        Swixo Onboarding · auto-saved locally
      </footer>
    </div>
  )
}

/* ================================================================== */
/* Progress header                                                     */
/* ================================================================== */

function ProgressHeader({ step, progress }: { step: number; progress: number }) {
  const meta = STEP_META[step - 1] ?? STEP_META[0]
  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative grid place-items-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/30">
              <Store className="w-4 h-4 text-primary" />
              <span className="absolute -inset-0.5 rounded-lg pulse-ring opacity-50" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none mb-1">Swixo Onboarding</p>
              <h2 className="text-sm sm:text-base font-semibold truncate">
                {meta.title}{' '}
                <span className="text-muted-foreground font-normal">· {meta.subtitle}</span>
              </h2>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            Step {step} / {TOTAL_STEPS}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Progress value={progress} className="h-2" />
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{progress}%</span>
        </div>

        {/* step dots */}
        <div className="hidden sm:flex items-center gap-1.5 mt-3">
          {STEP_META.map((s, i) => {
            const n = i + 1
            const done = n < step
            const active = n === step
            return (
              <div key={n} className="flex-1 group">
                <div
                  className={cn(
                    'h-1 rounded-full transition-premium',
                    done && 'bg-primary/60',
                    active && 'bg-primary shadow-glow-primary',
                    !done && !active && 'bg-border',
                  )}
                />
                <p
                  className={cn(
                    'mt-1.5 text-[10px] truncate transition-premium',
                    active ? 'text-primary font-medium' : 'text-muted-foreground',
                  )}
                >
                  {s.title}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </header>
  )
}

/* ================================================================== */
/* Card shell                                                          */
/* ================================================================== */

interface StepCardProps {
  children: React.ReactNode
  footer?: React.ReactNode
}

function StepCard({ children, footer }: StepCardProps) {
  return (
    <Card className="card-premium shadow-elevated border-border overflow-hidden">
      <div className="p-5 sm:p-6">{children}</div>
      {footer && (
        <>
          <Separator className="bg-border" />
          <div className="p-4 sm:px-6 bg-secondary/30 flex items-center justify-between gap-3">
            {footer}
          </div>
        </>
      )}
    </Card>
  )
}

/* ================================================================== */
/* Step 1 — Restaurant                                                 */
/* ================================================================== */

interface StepRestaurantProps {
  restaurant: RestaurantDraft
  setRestaurant: (patch: Partial<RestaurantDraft>) => void
  onNext: () => void
}

function StepRestaurant({ restaurant, setRestaurant, onNext }: StepRestaurantProps) {
  const nameValid = restaurant.name.trim().length > 1

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameValid) {
      toast.error('Restaurant name is required')
      return
    }
    onNext()
  }

  return (
    <form onSubmit={handleSubmit}>
      <StepCard
        footer={
          <>
            <span className="text-xs text-muted-foreground">Fields marked * are required</span>
            <Button type="submit" disabled={!nameValid} className="gap-2">
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        }
      >
        <StepHeading
          icon={<Store className="w-5 h-5" />}
          eyebrow="Step 1"
          title="Create your restaurant"
          desc="Set up the basics — you can edit any of this later from Settings."
        />

        <div className="space-y-5 mt-6">
          <ImageUpload
            label="Logo"
            value={restaurant.logo}
            onChange={(v) => setRestaurant({ logo: v })}
            shape="circle"
            size={80}
            fallback="🍴"
            accept="image/png,image/jpeg,image/webp"
          />

          <Field label="Restaurant Name" required>
            <Input
              value={restaurant.name}
              onChange={(e) => setRestaurant({ name: e.target.value })}
              placeholder="e.g. Jaegar Resto"
              autoFocus
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone">
              <PhoneInput
                value={restaurant.phone}
                onChange={(v) => setRestaurant({ phone: v })}
                placeholder="98765 43210"
              />
            </Field>
            <Field label="Email">
              <Input
                value={restaurant.email}
                onChange={(e) => setRestaurant({ email: e.target.value })}
                placeholder="hello@jaegar.com"
                inputMode="email"
                type="email"
              />
            </Field>
          </div>

          <Field label="Address">
            <Textarea
              value={restaurant.address}
              onChange={(e) => setRestaurant({ address: e.target.value })}
              placeholder="123 Market Street, San Francisco, CA"
              rows={2}
            />
          </Field>

          <Field label="Cuisine Type">
            <Select
              value={restaurant.cuisine}
              onValueChange={(v) => setRestaurant({ cuisine: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a cuisine" />
              </SelectTrigger>
              <SelectContent>
                {CUISINES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Separator className="bg-border my-1" />
          <p className="text-xs text-muted-foreground">
            Compliance details (optional) — required by some regions to print on receipts.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="GST Number" hint="Uppercase · max 15 chars">
              <Input
                value={restaurant.gstin}
                onChange={(e) =>
                  setRestaurant({ gstin: e.target.value.toUpperCase().slice(0, 15) })
                }
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="uppercase tracking-wider"
              />
            </Field>
            <Field label="FSSAI License No." hint="Max 14 chars">
              <Input
                value={restaurant.fssai}
                onChange={(e) => setRestaurant({ fssai: e.target.value.slice(0, 14) })}
                placeholder="10020065000123"
                maxLength={14}
                className="tracking-wider"
              />
            </Field>
          </div>
        </div>
      </StepCard>
    </form>
  )
}

/* ================================================================== */
/* Step 2 — Menu (AI / manual)                                         */
/* ================================================================== */

type MenuPhase = 'choose' | 'ai' | 'processing' | 'review'

interface StepMenuProps {
  menu: { categories: CategoryDraft[] }
  setMenu: (updater: (prev: { categories: CategoryDraft[] }) => { categories: CategoryDraft[] }) => void
  onNext: () => void
  onBack: () => void
}

function StepMenu({ menu, setMenu, onNext, onBack }: StepMenuProps) {
  // Resume directly to review if we already have extracted categories.
  const [phase, setPhase] = useState<MenuPhase>(
    menu.categories.length > 0 ? 'review' : 'choose',
  )

  const handleBack = () => {
    if (phase === 'choose') {
      onBack()
    } else if (phase === 'ai' || phase === 'review') {
      setPhase('choose')
    }
  }

  return (
    <StepCard
      footer={
        <>
          <Button type="button" variant="ghost" onClick={handleBack} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
          {phase === 'choose' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMenu(() => ({ categories: [] }))
                toast.success('Manual mode — you can add items later from the Menu view')
                onNext()
              }}
              className="gap-2"
            >
              Skip for now
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {phase === 'review' && (
            <Button type="button" onClick={onNext} className="gap-2">
              Create My Menu
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {(phase === 'ai' || phase === 'processing') && (
            <Button
              type="button"
              variant="ghost"
              disabled={phase === 'processing'}
              onClick={() => setPhase('choose')}
            >
              Cancel
            </Button>
          )}
        </>
      }
    >
      <StepHeading
        icon={<Utensils className="w-5 h-5" />}
        eyebrow="Step 2"
        title="Build your menu"
        desc="Import an existing menu with AI vision, or start from scratch."
      />

      <div className="mt-6">
        <AnimatePresence mode="wait">
          {phase === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="grid sm:grid-cols-2 gap-4"
            >
              <MenuOptionCard
                highlighted
                icon={<Sparkles className="w-6 h-6" />}
                title="Import Menu with AI"
                desc="Upload photos or PDFs of your menu — our AI reads items, prices & categories automatically."
                cta="Start AI import"
                onClick={() => setPhase('ai')}
              />
              <MenuOptionCard
                icon={<Pencil className="w-6 h-6" />}
                title="Create Menu Manually"
                desc="Start with an empty menu and add items one by one from the dashboard."
                cta="Skip to dashboard"
                onClick={() => {
                  setMenu(() => ({ categories: [] }))
                  toast.success('You can add items later from the Menu view')
                  onNext()
                }}
              />
            </motion.div>
          )}

          {phase === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <MenuAiUploader
                onProcessing={() => setPhase('processing')}
                onExtracted={(categories) => {
                  setMenu(() => ({ categories }))
                  setPhase('review')
                  const count = categories.reduce((n, c) => n + c.items.length, 0)
                  toast.success(`Extracted ${count} items across ${categories.length} categories`)
                }}
                onCancel={() => setPhase('choose')}
              />
            </motion.div>
          )}

          {phase === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ProcessingState />
            </motion.div>
          )}

          {phase === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <MenuReview menu={menu} setMenu={setMenu} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StepCard>
  )
}

function MenuOptionCard({
  icon,
  title,
  desc,
  cta,
  onClick,
  highlighted,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
  onClick: () => void
  highlighted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative text-left rounded-2xl p-5 border transition-premium overflow-hidden focus-ring',
        highlighted
          ? 'border-primary/60 bg-primary/[0.06] shadow-glow-primary'
          : 'border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50',
      )}
    >
      {highlighted && (
        <span className="absolute top-3 right-3">
          <Badge className="bg-primary/15 text-primary border-primary/30">
            <Sparkles className="w-3 h-3 mr-1" /> Recommended
          </Badge>
        </span>
      )}
      <div
        className={cn(
          'w-12 h-12 rounded-xl grid place-items-center mb-3 transition-premium',
          highlighted
            ? 'bg-primary/15 text-primary'
            : 'bg-secondary text-muted-foreground group-hover:text-primary',
        )}
      >
        {icon}
      </div>
      <h3 className="font-semibold text-base mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{desc}</p>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium transition-premium',
          highlighted ? 'text-primary' : 'text-foreground group-hover:text-primary',
        )}
      >
        {cta}
        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* AI uploader                                                         */
/* ------------------------------------------------------------------ */

function MenuAiUploader({
  onProcessing,
  onExtracted,
  onCancel,
}: {
  onProcessing: () => void
  onExtracted: (categories: CategoryDraft[]) => void
  onCancel: () => void
}) {
  const [images, setImages] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(
        (f) =>
          f.type.startsWith('image/') ||
          f.type === 'application/pdf' ||
          f.name.toLowerCase().endsWith('.pdf'),
      )
      if (list.length === 0) {
        toast.error('Only images and PDFs are supported')
        return
      }
      if (images.length + list.length > 10) {
        toast.error('Maximum 10 files allowed')
        return
      }
      try {
        const dataUrls = await Promise.all(list.map(fileToDataUrl))
        setImages((prev) => [...prev, ...dataUrls])
      } catch {
        toast.error('Could not read one of the files')
      }
    },
    [images.length],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }

  const extract = async () => {
    if (images.length === 0) {
      toast.error('Upload at least one menu image first')
      return
    }
    onProcessing()
    try {
      const res = await edgeFetch('/api/ai-extract-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `Extraction failed (${res.status})`)
      }
      const json = (await res.json()) as {
        categories: Array<{
          name: string
          icon: string
          items: Array<{
            name: string
            description: string | null
            price: number
            veg: boolean | null
            confidence: Confidence
            variants: ExtractedVariant[]
            addOns: ExtractedAddOn[]
            tags: string[]
          }>
        }>
      }

      const categories: CategoryDraft[] = (json.categories || []).map((c) => ({
        id: uid(),
        name: c.name || 'Uncategorized',
        icon: c.icon || categoryIconFor(c.name || ''),
        items: (c.items || [])
          .filter((i) => i.name)
          .map((i) => ({
            id: uid(),
            name: i.name,
            description: i.description ?? null,
            price:
              typeof i.price === 'number'
                ? i.price
                : parseFloat(String(i.price || 0)) || 0,
            veg: i.veg ?? null,
            confidence: i.confidence === 'low' ? 'low' : 'high',
            variants: Array.isArray(i.variants) ? i.variants : [],
            addOns: Array.isArray(i.addOns) ? i.addOns : [],
            tags: Array.isArray(i.tags) ? i.tags : [],
          })),
      }))

      if (categories.length === 0) {
        throw new Error('No menu items found in the images')
      }
      onExtracted(categories)
    } catch (e: any) {
      toast.error('AI extraction failed', { description: e?.message })
      onCancel()
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-premium',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-border bg-secondary/20 hover:border-primary/40 hover:bg-secondary/30',
        )}
      >
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/15 text-primary grid place-items-center mb-3">
          <ScanLine className="w-7 h-7" />
        </div>
        <p className="font-medium">Drop menu photos or PDFs here</p>
        <p className="text-xs text-muted-foreground mt-1">
          Click to browse · up to 10 files · JPG, PNG, WEBP, PDF
        </p>
      </div>

      {images.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              {images.length} file{images.length === 1 ? '' : 's'} ready
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setImages([])}
            >
              Clear all
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
            {images.map((src, i) => (
              <div
                key={i}
                className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-secondary group"
              >
                {src.startsWith('data:application/pdf') ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileImage className="w-7 h-7 text-primary/80" />
                    <span className="text-[10px] text-muted-foreground truncate w-full">
                      PDF {i + 1}
                    </span>
                  </div>
                ) : (
                  <img
                    src={src}
                    alt={`Menu page ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(i)
                  }}
                  className="absolute top-1 right-1 bg-background/90 backdrop-blur rounded-full p-1 text-muted-foreground hover:text-destructive transition-colors shadow"
                  aria-label="Remove file"
                >
                  <X className="w-3 h-3" />
                </button>
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] px-2 py-1">
                  Page {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={extract}
        disabled={images.length === 0}
        className="w-full gap-2 shadow-glow-primary"
        size="lg"
      >
        <Wand2 className="w-4 h-4" />
        Extract Menu with AI
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Nothing is published yet — you will review every item before it goes live.
      </p>
    </div>
  )
}

function ProcessingState() {
  return (
    <div className="py-10 flex flex-col items-center text-center">
      <div className="relative w-20 h-20 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-3 rounded-full bg-primary/10 grid place-items-center pulse-ring">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
      </div>
      <h3 className="font-semibold text-lg mb-1">AI is reading your menu…</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Scanning pages, identifying dishes, prices, categories and dietary tags. This usually
        takes 10–20 seconds.
      </p>
      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analyzing images…
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Menu review (editable)                                              */
/* ------------------------------------------------------------------ */

function MenuReview({
  menu,
  setMenu,
}: {
  menu: { categories: CategoryDraft[] }
  setMenu: (
    updater: (prev: { categories: CategoryDraft[] }) => { categories: CategoryDraft[] },
  ) => void
}) {
  const totalItems = menu.categories.reduce((n, c) => n + c.items.length, 0)
  const lowConf = menu.categories.reduce(
    (n, c) => n + c.items.filter((i) => i.confidence === 'low').length,
    0,
  )

  const addCategory = () => {
    const name = `Category ${menu.categories.length + 1}`
    setMenu((prev) => ({
      categories: [
        ...prev.categories,
        { id: uid(), name, icon: categoryIconFor(name), items: [] },
      ],
    }))
    toast.success('Category added')
  }

  const removeCategory = (catId: string) => {
    setMenu((prev) => ({ categories: prev.categories.filter((c) => c.id !== catId) }))
    toast.success('Category removed')
  }

  const renameCategory = (catId: string, name: string) => {
    setMenu((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === catId ? { ...c, name, icon: categoryIconFor(name) } : c,
      ),
    }))
  }

  const addItem = (catId: string) => {
    setMenu((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: [
                ...c.items,
                {
                  id: uid(),
                  name: '',
                  description: null,
                  price: 0,
                  veg: null,
                  confidence: 'high',
                  variants: [],
                  addOns: [],
                  tags: [],
                },
              ],
            }
          : c,
      ),
    }))
  }

  const updateItem = (catId: string, itemId: string, patch: Partial<MenuItemDraft>) => {
    setMenu((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
          : c,
      ),
    }))
  }

  const removeItem = (catId: string, itemId: string) => {
    setMenu((prev) => ({
      categories: prev.categories.map((c) =>
        c.id === catId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
      ),
    }))
  }

  if (totalItems === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-4">
          No items yet. Add a category and start building your menu.
        </p>
        <Button type="button" onClick={addCategory} className="gap-2">
          <Plus className="w-4 h-4" /> Add Category
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <Utensils className="w-3 h-3" /> {menu.categories.length} categories
        </Badge>
        <Badge variant="secondary">{totalItems} items</Badge>
        {lowConf > 0 && (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1.5">
            <ShieldAlert className="w-3 h-3" /> {lowConf} need verify
          </Badge>
        )}
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto scrollbar-thin pr-1 -mr-1">
        {menu.categories.map((cat) => (
          <CategoryReviewCard
            key={cat.id}
            category={cat}
            onRename={(name) => renameCategory(cat.id, name)}
            onRemove={() => removeCategory(cat.id)}
            onAddItem={() => addItem(cat.id)}
            onUpdateItem={(itemId, patch) => updateItem(cat.id, itemId, patch)}
            onRemoveItem={(itemId) => removeItem(cat.id, itemId)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addCategory}
        className="w-full gap-2 border-dashed"
      >
        <Plus className="w-4 h-4" /> Add Category
      </Button>
    </div>
  )
}

function CategoryReviewCard({
  category,
  onRename,
  onRemove,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: {
  category: CategoryDraft
  onRename: (name: string) => void
  onRemove: () => void
  onAddItem: () => void
  onUpdateItem: (itemId: string, patch: Partial<MenuItemDraft>) => void
  onRemoveItem: (itemId: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(category.name)

  const enterRename = () => {
    // sync the local buffer with the (possibly externally updated) name
    setName(category.name)
    setRenaming(true)
  }

  return (
    <Card className="border-border bg-secondary/20 overflow-hidden">
      <div className="flex items-center gap-2.5 p-3 border-b border-border bg-secondary/30">
        <span className="text-lg leading-none">{category.icon}</span>
        {renaming ? (
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              onRename(name.trim() || 'Untitled')
              setRenaming(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onRename(name.trim() || 'Untitled')
                setRenaming(false)
              }
              if (e.key === 'Escape') {
                setName(category.name)
                setRenaming(false)
              }
            }}
            className="h-8 max-w-xs"
          />
        ) : (
          <button
            type="button"
            onClick={enterRename}
            className="font-medium text-sm hover:text-primary transition-premium flex items-center gap-1.5 group"
          >
            {category.name}
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
          </button>
        )}
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {category.items.length} items
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Delete category"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-2.5">
        {category.items.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 text-center">
            No items in this category yet.
          </p>
        )}
        {category.items.map((item) => (
          <ItemReviewRow
            key={item.id}
            item={item}
            onUpdate={(patch) => onUpdateItem(item.id, patch)}
            onRemove={() => onRemoveItem(item.id)}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAddItem}
          className="w-full gap-1.5 text-muted-foreground hover:text-primary"
        >
          <Plus className="w-3.5 h-3.5" /> Add item
        </Button>
      </div>
    </Card>
  )
}

function ItemReviewRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: MenuItemDraft
  onUpdate: (patch: Partial<MenuItemDraft>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(!item.name)

  const vegBadge = useMemo(() => {
    if (item.veg === true)
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
          <Leaf className="w-3 h-3" /> Veg
        </span>
      )
    if (item.veg === false)
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 text-[11px] font-medium">
          <Drumstick className="w-3 h-3" /> Non-veg
        </span>
      )
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Unknown
      </span>
    )
  }, [item.veg])

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background/40 p-3 transition-premium',
        item.confidence === 'low' && 'ring-1 ring-amber-500/20',
      )}
    >
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <Input
              value={item.name}
              placeholder="Item name"
              autoFocus
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-8"
            />
            <div className="relative">
              <Input
                value={Number.isNaN(item.price) ? '' : item.price}
                placeholder="0.00"
                type="number"
                min={0}
                step="0.01"
                onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
                className="h-8 pr-7"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                $
              </span>
            </div>
          </div>
          <Textarea
            value={item.description || ''}
            placeholder="Short description (optional)"
            rows={2}
            onChange={(e) => onUpdate({ description: e.target.value || null })}
            className="text-xs"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                <Switch
                  checked={item.veg === true}
                  onCheckedChange={(checked) =>
                    onUpdate({ veg: checked ? true : item.veg === true ? false : null })
                  }
                />
                <span className="text-muted-foreground">Veg</span>
              </label>
              {item.variants.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.variants.length} variants
                </Badge>
              )}
              {item.addOns.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {item.addOns.length} add-ons
                </Badge>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5"
              onClick={() => {
                if (!item.name.trim()) {
                  toast.error('Item name cannot be empty')
                  return
                }
                setEditing(false)
              }}
            >
              <Check className="w-3.5 h-3.5" /> Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{item.name || 'Untitled'}</span>
              {vegBadge}
              {item.confidence === 'low' && (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] gap-1">
                  <ShieldAlert className="w-3 h-3" /> Verify
                </Badge>
              )}
              {item.tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
            {item.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-sm font-semibold text-primary">
                ${Number.isNaN(item.price) ? '0.00' : item.price.toFixed(2)}
              </span>
              {item.variants.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {item.variants.length} size option{item.variants.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => setEditing(true)}
              aria-label="Edit item"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* Step 3 — Customize                                                  */
/* ================================================================== */

interface StepCustomizeProps {
  customize: CustomizeDraft
  setCustomize: (patch: Partial<CustomizeDraft>) => void
  onNext: () => void
  onBack: () => void
}

function StepCustomize({ customize, setCustomize, onNext, onBack }: StepCustomizeProps) {
  const onCurrency = (code: string) => {
    const c = CURRENCIES.find((x) => x.code === code)
    if (c) setCustomize({ currency: c.code, currencySymbol: c.symbol })
  }

  return (
    <StepCard
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onBack} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <Button type="button" onClick={onNext} className="gap-2">
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <StepHeading
        icon={<Settings2 className="w-5 h-5" />}
        eyebrow="Step 3"
        title="Customize the experience"
        desc="Pick how your menu looks and how customers can order."
      />

      <div className="space-y-5 mt-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Menu Theme">
            <Select value={customize.theme} onValueChange={(v) => setCustomize({ theme: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MENU_THEMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={customize.currency} onValueChange={onCurrency}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.symbol} · {c.label} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tax Rate (%)" hint="Applied on subtotal">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={customize.taxRate}
              onChange={(e) => setCustomize({ taxRate: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Service Charge (%)" hint="Optional, on subtotal">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={customize.serviceCharge}
              onChange={(e) => setCustomize({ serviceCharge: parseFloat(e.target.value) || 0 })}
            />
          </Field>
        </div>

        <Separator className="bg-border my-1" />
        <p className="text-xs text-muted-foreground">Ordering settings</p>

        <div className="space-y-3">
          <ToggleRow
            title="Online Ordering"
            desc="Accept pickup & delivery orders through your menu"
            checked={customize.onlineOrdering}
            onChange={(v) => setCustomize({ onlineOrdering: v })}
          />
          <ToggleRow
            title="Table QR Ordering"
            desc="Let diners scan a QR code to order at the table"
            checked={customize.tableQrOrdering}
            onChange={(v) => setCustomize({ tableQrOrdering: v })}
          />
          <ToggleRow
            title="Kitchen Display"
            desc="Send orders directly to a kitchen display screen"
            checked={customize.kitchenDisplay}
            onChange={(v) => setCustomize({ kitchenDisplay: v })}
          />
          <ToggleRow
            title="Auto-Accept Orders"
            desc="Skip manual confirmation for new orders"
            checked={customize.autoAccept}
            onChange={(v) => setCustomize({ autoAccept: v })}
          />
        </div>
      </div>
    </StepCard>
  )
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/20 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  )
}

/* ================================================================== */
/* Step 4 — Generate QR                                                */
/* ================================================================== */

interface StepQrProps {
  restaurant: RestaurantDraft
  qr: QrDraft
  setQr: (patch: Partial<QrDraft>) => void
  onNext: () => void
  onBack: () => void
}

function StepQr({ restaurant, qr, setQr, onNext, onBack }: StepQrProps) {
  const count = Math.max(1, Math.min(60, qr.tableCount || 1))
  const tables = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        n: i + 1,
        name: `Table ${i + 1}`,
        token: `${restaurant.name?.slice(0, 8).toUpperCase() || 'TABLO'}-T${i + 1}`,
      })),
    [count, restaurant.name],
  )

  const generate = () => {
    setQr({ tableCount: count, generated: true })
    toast.success(`Generated ${count} QR code${count === 1 ? '' : 's'}`)
  }

  return (
    <StepCard
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onBack} className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>
          <Button type="button" onClick={onNext} className="gap-2">
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        </>
      }
    >
      <StepHeading
        icon={<QrCode className="w-5 h-5" />}
        eyebrow="Step 4"
        title="Generate QR codes"
        desc="Create a unique QR code for each dine-in table."
      />

      <div className="mt-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Number of tables" className="flex-1">
            <Input
              type="number"
              min={1}
              max={60}
              value={qr.tableCount}
              onChange={(e) => setQr({ tableCount: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </Field>
          <Button type="button" onClick={generate} className="gap-2 sm:w-auto w-full">
            <QrCode className="w-4 h-4" />
            {qr.generated ? 'Regenerate QR Codes' : 'Generate QR Codes'}
          </Button>
        </div>

        {qr.generated && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1.5">
                <Check className="w-3 h-3" /> {count} codes ready
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 h-7"
                onClick={() =>
                  toast.success('QR codes downloaded', { description: `${count} files` })
                }
              >
                <Download className="w-3.5 h-3.5" /> Download All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 h-7"
                onClick={() => toast.success('Sent to print dialog')}
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[44vh] overflow-y-auto scrollbar-thin p-1 -m-1">
              {tables.map((t) => (
                <QrPlaceholder
                  key={t.n}
                  tableName={t.name}
                  token={t.token}
                  restaurantName={restaurant.name}
                />
              ))}
            </div>
          </motion.div>
        )}

        {!qr.generated && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <QrCode className="w-7 h-7 mx-auto mb-2 opacity-50" />
            Click “Generate QR Codes” to preview your table codes.
          </div>
        )}
      </div>
    </StepCard>
  )
}

function QrPlaceholder({
  tableName,
  token,
  restaurantName,
}: {
  tableName: string
  token: string
  restaurantName: string
}) {
  return (
    <div className="rounded-xl bg-white p-2.5 shadow-premium text-center">
      <div className="aspect-square rounded-md bg-[repeating-conic-gradient(#000_0_25%,#fff_0_50%)] bg-[length:6px_6px] mb-2 grid place-items-center">
        <div className="bg-white p-1 rounded">
          <QrCode className="w-5 h-5 text-black" />
        </div>
      </div>
      <p className="text-[11px] font-semibold text-black truncate">{tableName}</p>
      <p className="text-[9px] text-black/60 truncate">{restaurantName || 'Swixo'}</p>
      <p className="text-[8px] text-black/40 truncate font-mono">{token}</p>
    </div>
  )
}

/* ================================================================== */
/* Step 5 — Go Live                                                    */
/* ================================================================== */

function StepGoLive({
  restaurant,
  data,
  onRestart,
}: {
  restaurant: RestaurantDraft
  data?: OnboardingData
  onRestart: () => void
}) {
  const [saving, setSaving] = useState(false)

  // Auto-save when reaching Step 5
  useEffect(() => {
    if (!data) return
    const saveSetup = async () => {
      try {
        const flattenedItems = data.menu.categories.flatMap((cat) =>
          cat.items.map((item) => ({
            ...item,
            categoryId: cat.id,
            category: cat.name,
          })),
        )

        await edgeFetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant: {
              name: data.restaurant.name,
              tagline: data.restaurant.cuisine ? `${data.restaurant.cuisine} Restaurant` : undefined,
              phone: data.restaurant.phone,
              email: data.restaurant.email,
              address: data.restaurant.address,
              currency: data.customize.currency,
              currencySymbol: data.customize.currencySymbol,
              taxRate: data.customize.taxRate,
              serviceCharge: data.customize.serviceCharge,
              logo: data.restaurant.logo,
            },
            categories: data.menu.categories.map((c) => ({ id: c.id, name: c.name })),
            menuItems: flattenedItems,
            tables: data.qr.tableCount || 8,
          }),
        })
      } catch (err) {
        console.error('Auto-save onboarding error:', err)
      }
    }
    saveSetup()
  }, [data])

  const handleOpenDashboard = async () => {
    setSaving(true)
    try {
      if (data) {
        const flattenedItems = data.menu.categories.flatMap((cat) =>
          cat.items.map((item) => ({
            ...item,
            categoryId: cat.id,
            category: cat.name,
          })),
        )

        const res = await edgeFetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant: {
              name: data.restaurant.name,
              tagline: data.restaurant.cuisine ? `${data.restaurant.cuisine} Restaurant` : undefined,
              phone: data.restaurant.phone,
              email: data.restaurant.email,
              address: data.restaurant.address,
              currency: data.customize.currency,
              currencySymbol: data.customize.currencySymbol,
              taxRate: data.customize.taxRate,
              serviceCharge: data.customize.serviceCharge,
              logo: data.restaurant.logo,
            },
            categories: data.menu.categories.map((c) => ({ id: c.id, name: c.name })),
            menuItems: flattenedItems,
            tables: data.qr.tableCount || 8,
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to save setup')
        }
      }

      localStorage.removeItem('tablo-onboarding')
      toast.success('Opening dashboard…')
      setTimeout(() => {
        window.location.href = '/?view=dashboard'
      }, 500)
    } catch (e: any) {
      toast.error(e.message || 'Failed to save setup')
      setSaving(false)
    }
  }

  const confetti = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.8,
        emoji: ['🎉', '🎊', '✨', '🎈', '🌟', '🍾'][i % 6],
        size: 14 + Math.random() * 14,
      })),
    [],
  )

  return (
    <StepCard>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {confetti.map((c) => (
          <span
            key={c.id}
            className="absolute -top-6 select-none"
            style={{
              left: `${c.left}%`,
              fontSize: c.size,
              animation: `ob-confetti-fall ${c.duration}s linear ${c.delay}s infinite`,
            }}
          >
            {c.emoji}
          </span>
        ))}
        <style>{`
          @keyframes ob-confetti-fall {
            0%   { transform: translateY(-2rem) rotate(0deg); opacity: 0; }
            8%   { opacity: 1; }
            100% { transform: translateY(110vh) rotate(540deg); opacity: 0.2; }
          }
        `}</style>
      </div>

      <div className="relative text-center py-6">
        <div className="relative mx-auto w-20 h-20 mb-5">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
          <div className="relative w-20 h-20 rounded-full bg-primary/15 border border-primary/30 grid place-items-center pulse-ring">
            <PartyPopper className="w-10 h-10 text-primary" />
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold mb-2">
          Your digital restaurant is <span className="text-gradient-primary">live</span> 🎉
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {restaurant.name || 'Your restaurant'} is all set up. Customers can now scan, browse,
          and order — and you can manage everything from the dashboard.
        </p>

        <div className="mt-7 grid sm:grid-cols-3 gap-2.5 max-w-lg mx-auto">
          <Button
            type="button"
            variant="outline"
            className="gap-2 h-auto py-3 flex-col"
            onClick={() => {
              toast.success('Opening customer menu…')
              setTimeout(() => {
                window.location.href = '/?view=public-menu'
              }, 500)
            }}
          >
            <ShoppingBag className="w-5 h-5 mb-1 text-primary" />
            <span className="text-xs">View Customer Menu</span>
          </Button>
          <Button
            type="button"
            disabled={saving}
            className="gap-2 h-auto py-3 flex-col shadow-glow-primary"
            onClick={handleOpenDashboard}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 mb-1 animate-spin" />
            ) : (
              <LayoutDashboard className="w-5 h-5 mb-1" />
            )}
            <span className="text-xs">{saving ? 'Saving…' : 'Open Dashboard'}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 h-auto py-3 flex-col"
            onClick={() => toast.success('QR codes downloaded')}
          >
            <Download className="w-5 h-5 mb-1 text-primary" />
            <span className="text-xs">Download QR</span>
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Rocket className="w-3.5 h-3.5 text-primary" />
          <span>Welcome aboard Swixo.</span>
          <button
            type="button"
            onClick={onRestart}
            className="underline underline-offset-2 hover:text-primary transition-premium"
          >
            Restart onboarding
          </button>
        </div>
      </div>
    </StepCard>
  )
}

/* ================================================================== */
/* Shared field components                                             */
/* ================================================================== */

function StepHeading({
  icon,
  eyebrow,
  title,
  desc,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 text-primary grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-0.5">
          {eyebrow}
        </p>
        <h2 className="text-xl sm:text-2xl font-bold leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {label}
        {required && <span className="text-primary">*</span>}
        {hint && <span className="text-muted-foreground/70 font-normal">· {hint}</span>}
      </Label>
      {children}
    </div>
  )
}
