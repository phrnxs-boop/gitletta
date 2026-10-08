'use client'

import { ArrowRight, ArrowUpRight, Check, QrCode, BarChart3, Users, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

function startOnboarding() {
  window.location.href = '/?view=login&mode=register'
}

function goToLogin() {
  window.location.href = '/?view=login'
}

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function PrimaryCta({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <Button
      size="lg"
      onClick={onClick ?? startOnboarding}
      className={cn(
        'h-11 rounded-xl px-6 text-sm font-semibold',
        'bg-primary text-primary-foreground transition-premium',
        'hover:bg-[#ea580c] hover:-translate-y-px',
        className,
      )}
    >
      {children}
    </Button>
  )
}

function GhostCta({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <Button
      variant="outline"
      size="lg"
      onClick={onClick ?? goToLogin}
      className="h-11 rounded-xl border-white/12 bg-transparent px-6 text-sm font-semibold text-foreground transition-premium hover:bg-white/5"
    >
      {children}
    </Button>
  )
}

/** Small caps label above a section heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{children}</p>
  )
}

/** A real screenshot in a browser chrome. */
function BrowserFrame({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-white/10 bg-[#0d1017] shadow-2xl shadow-black/50', className)}>
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <img src={src} alt={alt} width={1600} height={800} loading={priority ? 'eager' : 'lazy'} className="block w-full" />
    </div>
  )
}

function PhoneFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#0d1017] p-1.5 shadow-2xl shadow-black/60', className)}>
      <img src={src} alt={alt} width={780} height={1688} loading="lazy" className="block w-full rounded-[1.35rem]" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Nav                                                                        */
/* -------------------------------------------------------------------------- */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            S
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Swixo</span>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#product" className="transition-colors hover:text-foreground">Product</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={goToLogin} className="hidden px-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
            Sign in
          </button>
          <PrimaryCta className="h-9 px-4 text-[13px]">
            Get started
            <ArrowUpRight className="ml-1 size-3.5" />
          </PrimaryCta>
        </div>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-32 h-[420px]">
        <div className="absolute left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/[0.13] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-20 sm:px-8 sm:pt-28 sm:pb-28">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-[2.1rem] font-semibold leading-[1.1] tracking-tight sm:text-[3.25rem]">
            Run your whole restaurant from one screen.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-muted-foreground">
            Point-of-sale, QR table ordering, a live kitchen board and GST-ready
            billing. Set up in minutes, no hardware.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta>
              Create your restaurant
              <ArrowRight className="ml-1.5 size-4" />
            </PrimaryCta>
            <GhostCta>See a demo</GhostCta>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <BrowserFrame
            src="/screenshots/dashboard.webp"
            alt="Swixo point-of-sale dashboard with a live menu grid and active orders"
            priority
          />
          <PhoneFrame
            src="/screenshots/mobile-menu.webp"
            alt="The diner-facing menu on a phone"
            className="absolute -bottom-10 -left-2 hidden w-[150px] sm:block lg:-left-12 lg:w-[172px]"
          />
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Features                                                                   */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: QrCode,
    title: 'QR table ordering',
    body: 'Diners scan, browse and order from their own phone. No app to install, no account to make.',
  },
  {
    icon: BarChart3,
    title: 'Live order board',
    body: 'Every ticket from prep to served, moving the moment the kitchen does.',
  },
  {
    icon: Users,
    title: 'Roles & permissions',
    body: 'Waiters, cashiers and kitchen each see only what their role allows — enforced server-side.',
  },
]

function Features() {
  return (
    <section id="product" className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-lg">
          <Eyebrow>The product</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything the floor needs, nothing it doesn&apos;t
          </h2>
        </div>

        <div className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-10">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <f.icon className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Showcase — two real screens, nothing else                                  */
/* -------------------------------------------------------------------------- */

function Showcase() {
  return (
    <section className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-lg">
          <Eyebrow>Straight from the product</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Real screens, not mockups
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Captured from the build you get, with a real restaurant loaded into it.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-5 lg:gap-10">
          <div className="lg:col-span-3">
            <BrowserFrame src="/screenshots/orders.webp" alt="Live order board" />
            <p className="mt-4 text-sm text-muted-foreground">
              The order board — every table, updating as tickets move.
            </p>
          </div>
          <div className="lg:col-span-2">
            <BrowserFrame src="/screenshots/analytics.webp" alt="Revenue analytics" />
            <p className="mt-4 text-sm text-muted-foreground">
              Revenue, average order value and top sellers, from real orders.
            </p>
          </div>
        </div>

        {/* The diner's side */}
        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
              And the diner just scans
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              No download, no signup, no waiter hovering. Totals are recomputed on the
              server with your own tax and service charge, so a tampered request can
              never change what a diner pays.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                'Prices, tax and totals computed server-side',
                'Allergies and spice level travel with the order',
                'A session ends with the meal — only a fresh scan reopens it',
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center gap-6">
            <PhoneFrame src="/screenshots/mobile-menu.webp" alt="Diner menu" className="w-[160px] sm:w-[190px]" />
            <PhoneFrame src="/screenshots/mobile-cart.webp" alt="Diner cart" className="mt-12 w-[160px] sm:w-[190px]" />
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Pricing                                                                    */
/* -------------------------------------------------------------------------- */

const PLANS = [
  {
    name: 'Starter',
    price: '₹999',
    period: '/mo',
    desc: 'One location, getting started',
    features: ['Up to 50 menu items', 'QR table ordering', 'Staff dashboard', 'Basic analytics'],
    popular: false,
  },
  {
    name: 'Pro',
    price: '₹2,499',
    period: '/mo',
    desc: 'Busy restaurants that need everything',
    features: ['Unlimited menu items', 'AI menu extraction', 'Unlimited staff & roles', 'Advanced analytics', 'Priority support'],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'Multi-location chains',
    features: ['Everything in Pro', 'Unlimited locations', 'API access', 'Onboarding & SLA'],
    popular: false,
  },
]

function Pricing() {
  return (
    <section id="pricing" className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-lg">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Simple, per-restaurant pricing
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'flex flex-col rounded-2xl border p-7',
                plan.popular ? 'border-primary/40 bg-primary/[0.04]' : 'border-white/[0.08] bg-white/[0.015]',
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                {plan.popular && (
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                    Most popular
                  </span>
                )}
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{plan.desc}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              <PrimaryCta className={cn('mt-8 w-full', !plan.popular && 'bg-white/10 text-foreground hover:bg-white/15 hover:text-foreground')}>
                {plan.price === 'Custom' ? 'Contact us' : 'Start free'}
              </PrimaryCta>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                        */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: 'Do my customers need to download an app?',
    a: 'No. They scan the QR code on the table and the menu opens in their phone browser. No app, no account.',
  },
  {
    q: 'What happens when a table session ends?',
    a: 'The session is closed for good. Refreshing, pressing back or reopening a copied link will not bring the menu back — only scanning the table QR code again starts a new one.',
  },
  {
    q: 'Does it handle GST and service charge?',
    a: 'Yes. Set your tax rate, service charge, GSTIN and FSSAI once in settings, and every bill is calculated and printed from them.',
  },
  {
    q: 'Can I control what each staff member sees?',
    a: 'Yes. Roles decide which modules a staff member can open, and that is enforced at the API — not just hidden in the interface.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most restaurants are taking orders within a few minutes: add your menu, print the QR codes, done.',
  },
]

function Faq() {
  return (
    <section id="faq" className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-white/[0.08]">
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Final CTA + footer                                                         */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-28">
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Start taking orders today
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          Free to try. No card required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta>
            Create your restaurant
            <ArrowRight className="ml-1.5 size-4" />
          </PrimaryCta>
          <GhostCta>Sign in</GhostCta>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-9 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            S
          </div>
          <span className="text-sm text-muted-foreground">Swixo</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <a href="#product" className="transition-colors hover:text-foreground">Product</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Smartphone className="size-3.5" />
            No app needed
          </span>
        </div>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
