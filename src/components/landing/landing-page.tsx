'use client'

import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Sparkles,
  ClipboardList,
  QrCode,
  Smartphone,
  Utensils,
  Zap,
  ChefHat,
  Star,
  BarChart3,
  Upload,
  Check,
  Plus,
  ScanLine,
  CreditCard,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function startOnboarding() {
  window.location.href = '/?view=login&mode=register'
}

function goToLogin() {
  window.location.href = '/?view=login'
}

/** Coral gradient button used across the page */
function PrimaryCta({
  children,
  className,
  onClick,
  size = 'lg',
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  size?: 'lg' | 'default'
}) {
  return (
    <Button
      size={size}
      onClick={onClick ?? startOnboarding}
      className={cn(
        'h-12 sm:h-13 rounded-xl px-7 text-[15px] font-semibold',
        'bg-gradient-to-br from-[#ff8a78] via-[#f97316] to-[#ea580c]',
        'text-white shadow-glow-primary transition-premium',
        'hover:shadow-[0_8px_32px_rgba(255,126,107,0.4)] hover:-translate-y-0.5',
        'hover:from-[#ff9886] hover:via-[#ff8a78] hover:to-[#ff7460]',
        className,
      )}
    >
      {children}
    </Button>
  )
}

/** Outline CTA on dark */
function OutlineCta({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={onClick ?? startOnboarding}
      className={cn(
        'h-12 sm:h-13 rounded-xl px-7 text-[15px] font-semibold',
        'border-white/15 bg-white/5 text-foreground backdrop-blur-sm',
        'hover:bg-white/10 hover:border-white/25 transition-premium',
        className,
      )}
    >
      {children}
    </Button>
  )
}

/** Section heading block */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'mb-4 inline-flex items-center gap-1.5 rounded-full',
        'border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary',
      )}
    >
      {children}
    </Badge>
  )
}


/* -------------------------------------------------------------------------- */
/*  Real product screenshots, in device frames                                 */
/* -------------------------------------------------------------------------- */

function BrowserFrame({
  src, alt, className, priority,
}: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-white/12 bg-[#0d1017] shadow-2xl shadow-black/60',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 hidden truncate rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/40 sm:block">
          restrofi.in
        </span>
      </div>
      <img
        src={src}
        alt={alt}
        width={1600}
        height={800}
        loading={priority ? 'eager' : 'lazy'}
        className="block w-full"
      />
    </div>
  )
}

function PhoneFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.8rem] border border-white/15 bg-[#0d1017] p-1.5 shadow-2xl shadow-black/70',
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={780}
        height={1688}
        loading="lazy"
        className="block w-full rounded-[1.4rem]"
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 1 — Hero                                                           */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient coral glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[640px] -translate-x-1/2 rounded-full bg-[#f97316]/25 blur-[120px]" />
        <div className="absolute top-24 -left-32 h-[360px] w-[360px] rounded-full bg-[#f97316]/12 blur-[110px]" />
        <div className="absolute top-40 -right-32 h-[360px] w-[360px] rounded-full bg-[#c084fc]/10 blur-[120px]" />
      </div>

      {/* Subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-5 pt-14 pb-24 sm:px-8 sm:pt-20 sm:pb-32">
        {/* Copy — centred, so the product shot below can run full width and stay legible */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Now with AI menu extraction
          </div>

          <h1 className="text-balance text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            Turn your restaurant menu into a{' '}
            <span className="text-gradient-primary">digital ordering</span>{' '}
            experience in minutes.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
            Point-of-sale, QR table ordering, a live kitchen board, staff roles and
            GST-ready billing — one platform for the whole floor.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta>
              Create Your Restaurant
              <ArrowRight className="size-4" />
            </PrimaryCta>
            <OutlineCta>Start Free</OutlineCta>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-primary" />
              No credit card required
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              Setup in 5 minutes
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              AI-powered
            </span>
          </div>
        </div>

        {/* The real product, not a mockup */}
        <div className="relative mx-auto mt-14 max-w-6xl sm:mt-18">
          <BrowserFrame
            src="/screenshots/dashboard.webp"
            alt="Swixo point-of-sale dashboard showing a live menu grid and active orders"
            priority
          />
          <PhoneFrame
            src="/screenshots/mobile-menu.webp"
            alt="The diner-facing menu on a phone, opened by scanning a table QR code"
            className="absolute -bottom-8 left-3 w-[104px] sm:-bottom-12 sm:left-6 sm:w-[136px] lg:-bottom-10 lg:-left-10 lg:w-[164px]"
          />
        </div>
      </div>
    </section>
  )
}

const FLOW_STEPS = [
  {
    icon: Camera,
    title: 'Upload Menu',
    desc: 'Snap a photo or upload a PDF of your menu',
    color: 'from-amber-400/20 to-amber-600/10',
    iconColor: 'text-amber-400',
  },
  {
    icon: Sparkles,
    title: 'AI Extracts Items',
    desc: 'Smart detection of names, prices, categories',
    color: 'from-primary/25 to-primary/5',
    iconColor: 'text-primary',
  },
  {
    icon: ClipboardList,
    title: 'Menu Ready',
    desc: 'Editable structured menu with descriptions',
    color: 'from-emerald-400/20 to-emerald-600/10',
    iconColor: 'text-emerald-400',
  },
  {
    icon: QrCode,
    title: 'Generate QR',
    desc: 'Per-table QR codes ready for customers',
    color: 'from-purple-400/20 to-purple-600/10',
    iconColor: 'text-purple-400',
  },
]

function AiFlow() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <SectionLabel>
          <Sparkles className="size-3" />
          How it works
        </SectionLabel>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          From paper menu to live store in{' '}
          <span className="text-gradient-primary">4 simple steps</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
          No more manual data entry. Upload once and Swixo handles the rest —
          from extraction to QR codes.
        </p>
      </div>

      {/* Steps */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {FLOW_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div key={step.title} className="relative">
              <Card
                className={cn(
                  'card-premium group relative h-full overflow-hidden rounded-2xl border border-white/10 p-5',
                  'transition-premium hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow-primary',
                )}
              >
                {/* Step number */}
                <span className="absolute right-4 top-4 text-3xl font-bold text-white/5 transition-premium group-hover:text-primary/15">
                  0{i + 1}
                </span>

                <div
                  className={cn(
                    'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
                    'bg-gradient-to-br',
                    step.color,
                  )}
                >
                  <Icon className={cn('size-6', step.iconColor)} />
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </Card>

              {/* Connector arrow (desktop only) */}
              {i < FLOW_STEPS.length - 1 && (
                <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-card text-primary shadow-elevated">
                    <ArrowRight className="size-3.5" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 3 — Benefits                                                       */
/* -------------------------------------------------------------------------- */

const BENEFITS = [
  {
    icon: Smartphone,
    title: 'QR Ordering',
    desc: 'Customers scan, browse, and order from their phone',
  },
  {
    icon: Utensils,
    title: 'Digital Menu',
    desc: 'Beautiful, always-up-to-date digital menu',
  },
  {
    icon: Zap,
    title: 'Real-Time Orders',
    desc: 'Instant order flow to your kitchen',
  },
  {
    icon: ChefHat,
    title: 'Kitchen Dashboard',
    desc: 'Track every order from prep to served',
  },
  {
    icon: Star,
    title: 'Google Reviews',
    desc: 'Sync and respond to Google reviews',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    desc: 'Revenue insights, top items, trends',
  },
]

function Benefits() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <SectionLabel>
          <Utensils className="size-3" />
          Everything you need
        </SectionLabel>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          One platform for your entire{' '}
          <span className="text-gradient-primary">restaurant operation</span>
        </h2>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((b) => {
          const Icon = b.icon
          return (
            <Card
              key={b.title}
              className={cn(
                'card-premium group rounded-2xl border border-white/10 p-6',
                'transition-premium hover:-translate-y-1 hover:border-primary/30 hover:shadow-glow-primary',
              )}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 transition-premium group-hover:bg-primary/25 group-hover:shadow-glow-primary">
                <Icon className="size-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {b.desc}
              </p>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 4 — AI Menu Creation                                               */
/* -------------------------------------------------------------------------- */

function AiMenuCreation() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[120px]"
      />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>
            <Sparkles className="size-3" />
            AI differentiator
          </SectionLabel>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            AI-powered menu creation that{' '}
            <span className="text-gradient-primary">saves hours</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
            Snap a photo of your menu. Our AI detects categories, prices,
            descriptions, veg/non-veg, variants &amp; add-ons — automatically.
          </p>
        </div>

        <Card className="mt-12 overflow-hidden rounded-3xl border border-white/10 bg-card/60 backdrop-blur-sm">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2 lg:gap-8">
            {/* Upload zone */}
            <div className="flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                <Badge className="border border-primary/30 bg-primary/10 text-xs font-medium text-primary">
                  Step 1
                </Badge>
                <h3 className="text-base font-semibold">Upload a photo of your menu</h3>
              </div>

              <div
                className={cn(
                  'group relative flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-secondary/40 p-8 text-center',
                  'transition-premium hover:border-primary/40 hover:bg-primary/5',
                )}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 transition-premium group-hover:scale-105 group-hover:bg-primary/25">
                  <Upload className="size-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Drop your menu image here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PNG, JPG or PDF · up to 10MB
                  </p>
                </div>
                <Button
                  size="sm"
                  className="mt-2 h-9 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  <Camera className="size-4" />
                  Take a photo
                </Button>
              </div>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Or drag &amp; drop multiple pages at once
              </p>
            </div>

            {/* AI extraction result */}
            <div className="flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-400">
                  <Sparkles className="size-3" />
                  Step 2
                </Badge>
                <h3 className="text-base font-semibold">
                  AI extracts items automatically
                </h3>
              </div>

              <div className="flex-1 space-y-3 rounded-2xl border border-white/10 bg-secondary/40 p-4">
                {/* Category label */}
                <div className="flex items-center gap-2">
                  <span className="text-base">🍜</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mains
                  </span>
                  <div className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
                    <Check className="size-3" />
                    8 items
                  </div>
                </div>

                {/* Extracted items */}
                {[
                  { n: 'Paneer Tikka', p: '₹289', v: true, d: 'Char-grilled paneer, mint chutney' },
                  { n: 'Dal Makhani', p: '₹265', v: false, d: 'Black lentils, simmered overnight' },
                  { n: 'Hyderabadi Biryani', p: '₹340', v: false, d: 'Dum-cooked basmati, saffron, raita' },
                ].map((it) => (
                  <div
                    key={it.n}
                    className="rounded-xl border border-white/10 bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              it.v ? 'bg-emerald-400' : 'bg-red-400',
                            )}
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {it.n}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {it.d}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-primary">
                        {it.p}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Detection summary */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['Categories', 'Prices', 'Descriptions', 'Veg/Non-veg', 'Variants', 'Add-ons'].map(
                    (t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                      >
                        <Check className="size-2.5" />
                        {t}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Highlight bar */}
          <div className="flex flex-col items-center gap-4 border-t border-white/5 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-6 py-5 sm:flex-row sm:justify-between sm:px-8">
            <p className="flex items-center gap-2 text-center text-sm text-foreground sm:text-left">
              <Sparkles className="size-4 text-primary" />
              <span>
                AI detects{' '}
                <span className="font-semibold text-primary">
                  categories, prices, descriptions, veg/non-veg, variants &amp; add-ons
                </span>
              </span>
            </p>
            <Button
              size="sm"
              onClick={startOnboarding}
              className="h-10 shrink-0 rounded-xl bg-gradient-to-br from-[#ff8a78] to-[#ea580c] px-5 text-sm font-semibold text-white shadow-glow-primary transition-premium hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(255,126,107,0.45)]"
            >
              Try AI Menu Import
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    </section>
  )
}


/* -------------------------------------------------------------------------- */
/*  Section — The product, screen by screen                                    */
/* -------------------------------------------------------------------------- */

const SCREENS = [
  {
    src: '/screenshots/orders.webp',
    title: 'Live order board',
    body: 'Every table and every ticket in one column, updating as the kitchen moves it along.',
  },
  {
    src: '/screenshots/menu.webp',
    title: 'Menu management',
    body: 'Categories, pricing, availability, tags, ratings and photos — edited in place.',
  },
  {
    src: '/screenshots/qr.webp',
    title: 'QR table ordering',
    body: 'A printable code for every table. Diners scan it and order from their own phone.',
  },
  {
    src: '/screenshots/analytics.webp',
    title: 'Revenue analytics',
    body: 'Today, this week, top sellers and average order value — computed from real orders.',
  },
]

function ProductScreens() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <SectionLabel>
          <Sparkles className="size-3.5" />
          Straight from the product
        </SectionLabel>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Every screen, actually running
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          These are real screenshots of Swixo — the same build you get, with a real
          restaurant loaded into it. Nothing here is a mockup.
        </p>
      </div>

      <div className="mt-14 grid gap-8 sm:gap-10 lg:grid-cols-2">
        {SCREENS.map((sc, i) => (
          <div key={sc.title} className="group">
            <BrowserFrame
              src={sc.src}
              alt={sc.title}
              priority={i < 2}
              className="transition-premium group-hover:-translate-y-1 group-hover:border-primary/30"
            />
            <h3 className="mt-5 text-base font-semibold">{sc.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{sc.body}</p>
          </div>
        ))}
      </div>

      {/* Roles + settings, the less photogenic but decisive parts */}
      <div className="mt-8 grid gap-8 sm:gap-10 lg:grid-cols-2">
        <div>
          <BrowserFrame src="/screenshots/roles.webp" alt="Roles and permissions" />
          <h3 className="mt-5 text-base font-semibold">Roles &amp; staff</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Waiters, cashiers and kitchen each see only what their role allows — enforced
            at the API, not just hidden in the UI.
          </p>
        </div>
        <div>
          <BrowserFrame src="/screenshots/settings.webp" alt="Restaurant settings" />
          <h3 className="mt-5 text-base font-semibold">GST-ready settings</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Tax rate, service charge, GSTIN and FSSAI live here, and flow straight onto
            every bill.
          </p>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section — The diner's side                                                 */
/* -------------------------------------------------------------------------- */

function DinerExperience() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f97316]/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20">
          <div>
            <SectionLabel>
              <Smartphone className="size-3.5" />
              No app, no signup
            </SectionLabel>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your diner scans, browses and orders
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              No download, no account, no waiter hovering. The cart totals up with your
              own tax and service charge, and the order lands on the kitchen board the
              moment they tap.
            </p>

            <ul className="mt-7 space-y-3 text-sm">
              {[
                'Prices and totals are recomputed on the server — a tampered request can never change what a diner pays.',
                'A session ends when the table is done. Refreshing, back-button or a copied link will not reopen it — only a fresh scan.',
                'Allergies and spice level travel with the order as a note to the kitchen.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="leading-relaxed text-muted-foreground">{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <PrimaryCta>
                Get your QR codes
                <ArrowRight className="size-4" />
              </PrimaryCta>
            </div>
          </div>

          <div className="flex justify-center gap-5 sm:gap-8">
            <PhoneFrame
              src="/screenshots/mobile-menu.webp"
              alt="Diner menu on a phone"
              className="w-[168px] sm:w-[200px]"
            />
            <PhoneFrame
              src="/screenshots/mobile-cart.webp"
              alt="Diner cart with totals and kitchen notes"
              className="mt-14 w-[168px] sm:w-[200px]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

const PLANS = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    desc: 'For single-location restaurants getting started',
    features: [
      'Up to 50 menu items',
      'QR table ordering',
      '1 staff dashboard',
      'Basic analytics',
      'Email support',
    ],
    popular: false,
  },
  {
    name: 'Pro',
    price: '$89',
    period: '/mo',
    desc: 'For busy restaurants that need everything',
    features: [
      'Unlimited menu items',
      'AI menu extraction',
      '5 staff dashboards',
      'Advanced analytics',
      'Google Reviews sync',
      'Priority support',
      'Custom branding',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For multi-location chains & franchises',
    features: [
      'Everything in Pro',
      'Unlimited locations',
      'Unlimited staff',
      'API access',
      'Dedicated manager',
      'SLA & onboarding',
    ],
    popular: false,
  },
]

function Pricing() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <SectionLabel>
          <CreditCard className="size-3" />
          Pricing
        </SectionLabel>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Simple pricing that{' '}
          <span className="text-gradient-primary">scales with you</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
          Start free. Upgrade when you grow. Cancel anytime.
        </p>
      </div>

      <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card
            key={p.name}
            className={cn(
              'relative flex flex-col rounded-3xl p-6 transition-premium sm:p-8',
              p.popular
                ? 'border-2 border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow-primary lg:-translate-y-3 lg:scale-[1.02]'
                : 'border border-white/10 bg-card hover:-translate-y-1 hover:border-white/20',
            )}
          >
            {p.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-[#ea580c] px-4 py-1 text-xs font-semibold text-white shadow-glow-primary">
                <Sparkles className="size-3" />
                Popular
              </Badge>
            )}

            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>

            <div className="mt-5 flex items-baseline gap-1">
              <span
                className={cn(
                  'text-4xl font-bold tracking-tight',
                  p.popular && 'text-gradient-primary',
                )}
              >
                {p.price}
              </span>
              <span className="text-sm text-muted-foreground">{p.period}</span>
            </div>

            <Button
              onClick={startOnboarding}
              variant={p.popular ? 'default' : 'outline'}
              className={cn(
                'mt-6 h-11 rounded-xl text-sm font-semibold transition-premium',
                p.popular
                  ? 'bg-gradient-to-br from-[#ff8a78] to-[#ea580c] text-white shadow-glow-primary hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(255,126,107,0.45)]'
                  : 'border-white/15 bg-white/5 text-foreground hover:bg-white/10',
              )}
            >
              {p.price === 'Custom' ? 'Contact Sales' : 'Start Free'}
              <ArrowRight className="size-4" />
            </Button>

            <Separator className="my-6 bg-white/5" />

            <ul className="space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="size-3 text-primary" />
                  </span>
                  <span className="text-foreground/90">{f}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 8 — FAQ                                                            */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'How does AI menu extraction work?',
    a: 'Upload a photo or PDF of your menu. Our AI model analyses the layout, recognises item names, prices, descriptions, categories, and even detects veg/non-veg indicators, variants, and add-ons. You then review and edit the extracted menu in our dashboard before publishing.',
  },
  {
    q: 'Do I need to install any hardware?',
    a: 'No. Swixo runs entirely in the browser. Customers scan a QR code with their phone camera — no app download needed. You can print the QR codes yourself or order premium table stands from us.',
  },
  {
    q: 'Can I use my own payment gateway?',
    a: 'Yes. Pro and Enterprise plans support Stripe, Razorpay, Square, and direct bank-transfer integrations. You can also accept cash and card at the counter — Swixo tracks every payment method.',
  },
  {
    q: 'Is my restaurant data secure?',
    a: 'Absolutely. All data is encrypted in transit (TLS 1.3) and at rest. Each tenant is fully isolated — your menu, orders, customers, and Google Reviews are never shared with other restaurants. We are GDPR and SOC 2 compliant.',
  },
  {
    q: 'Can customers order without downloading an app?',
    a: 'Yes — that is the entire point. Customers scan the QR code, the menu opens instantly in their phone browser, they add items to cart, and place the order. No app store, no download, no friction.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most restaurants are live in under 5 minutes. Upload your menu, let AI extract the items, generate QR codes, and you are ready to accept orders. If you have a large menu, plan for 15-20 minutes of review time.',
  },
]

function Faq() {
  return (
    <section className="relative mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="text-center">
        <SectionLabel>
          <ShieldCheck className="size-3" />
          FAQ
        </SectionLabel>
        <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Questions, <span className="text-gradient-primary">answered</span>
        </h2>
      </div>

      <Card className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`item-${i}`}
              className={cn(
                'border-white/5 px-5 sm:px-6',
                i !== FAQS.length - 1 && 'border-b',
              )}
            >
              <AccordionTrigger className="py-5 text-left text-[15px] font-semibold hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 9 — Final CTA                                                      */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Ready to digitize your{' '}
          <span className="text-gradient-primary">restaurant?</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-balance text-sm text-muted-foreground sm:text-base">
          Join thousands of restaurants already using Swixo to serve more
          customers, faster.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={startOnboarding}
            className="h-14 rounded-2xl bg-gradient-to-br from-[#ff8a78] via-[#f97316] to-[#ea580c] px-10 text-base font-semibold text-white shadow-glow-primary transition-premium hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,126,107,0.5)]"
          >
            Create Your Restaurant
            <ArrowRight className="size-5" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Start Free — No credit card required
          </p>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section 10 — Footer                                                        */
/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-background">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-start">
          {/* Brand */}
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#ea580c] text-sm font-bold text-white shadow-glow-primary">
                S
              </div>
              <span className="text-base font-semibold">Swixo</span>
            </div>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              The all-in-one digital ordering platform for modern restaurants.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <a href="#" className="transition-premium hover:text-primary">Features</a>
            <a href="#" className="transition-premium hover:text-primary">Pricing</a>
            <a href="#" className="transition-premium hover:text-primary">FAQ</a>
            <a href="#" className="transition-premium hover:text-primary">Privacy</a>
            <a href="#" className="transition-premium hover:text-primary">Terms</a>
          </nav>
        </div>

        <Separator className="my-6 bg-white/5" />

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Swixo. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */
/*  Root component                                                             */
/* -------------------------------------------------------------------------- */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky top nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#ea580c] text-sm font-bold text-white shadow-glow-primary">
              S
            </div>
            <span className="text-base font-semibold">Swixo</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-premium hover:text-foreground">How it works</a>
            <a href="#benefits" className="transition-premium hover:text-foreground">Features</a>
            <a href="#pricing" className="transition-premium hover:text-foreground">Pricing</a>
            <a href="#faq" className="transition-premium hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToLogin}
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Button>
            <Button
              size="sm"
              onClick={startOnboarding}
              className="h-9 rounded-lg bg-gradient-to-br from-[#ff8a78] to-[#ea580c] px-4 text-sm font-semibold text-white shadow-glow-primary transition-premium hover:-translate-y-0.5"
            >
              Get Started
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main>
        <Hero />

        <div id="how">
          <AiFlow />
        </div>

        <div id="benefits">
          <Benefits />
        </div>

        <AiMenuCreation />

        <ProductScreens />

        <DinerExperience />


        <div id="pricing">
          <Pricing />
        </div>

        <div id="faq">
          <Faq />
        </div>

        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
