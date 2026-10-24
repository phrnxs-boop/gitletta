/**
 * Where the browser keeps things, and how the old names are handled.
 *
 * The product was renamed, so the keys carry the new name — that is what a
 * visitor sees in the Cookie Policy and in their browser's storage viewer.
 *
 * The values did not move on their own, though: a rename that signs a staff
 * member out, forgets someone's theme, or empties a diner's cart is not a
 * rename, it is an outage. So every read looks in the new place first, then in
 * the old one, and moves the value across as it finds it. That happens once,
 * on the next visit that touches that key; after that the old name is gone.
 *
 * `remove` clears both, so a value removed in the new name cannot be brought
 * back by a stale one left under the old name.
 */

type Area = 'local' | 'session'

export const KEYS = {
  theme: { now: 'toastly-theme', was: 'tablo-theme', area: 'local' },
  menuTheme: { now: 'toastly-menu-theme', was: 'tablo-menu-theme', area: 'local' },
  onboarding: { now: 'toastly-onboarding', was: 'tablo-onboarding', area: 'local' },
  /** The diner's cart for one table session: the session token is the suffix. */
  cart: { now: 'toastly-cart-session-', was: 'public-cart-session-', area: 'local' },
  dinerSession: { now: 'toastly-diner-session', was: 'swixo-diner-session', area: 'session' },
  staffToken: { now: 'toastly-staff-token', was: 'swixo-staff-token', area: 'session' },
  lastOrderId: { now: 'toastly_last_order_id', was: 'swixo_last_order_id', area: 'session' },
  notificationsSeen: {
    now: 'toastly-notifications-seen',
    was: 'swixo-notifications-seen',
    area: 'local',
  },
} as const satisfies Record<string, { now: string; was: string; area: Area }>

export type KeyName = keyof typeof KEYS

/** The name in use. */
export function keyName(name: KeyName, suffix = ''): string {
  return KEYS[name].now + suffix
}

/** The name it had before the rename. */
export function legacyKeyName(name: KeyName, suffix = ''): string {
  return KEYS[name].was + suffix
}

function area(name: KeyName): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return KEYS[name].area === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    // Storage can be blocked outright — private modes, embedded webviews.
    return null
  }
}

/** Read a value, carrying it across from the old name the first time. */
export function readStored(name: KeyName, suffix = ''): string | null {
  const store = area(name)
  if (!store) return null
  try {
    const current = store.getItem(keyName(name, suffix))
    if (current !== null) return current

    const previous = store.getItem(legacyKeyName(name, suffix))
    if (previous === null) return null

    // Move it, so this only ever happens once for a given browser.
    store.setItem(keyName(name, suffix), previous)
    store.removeItem(legacyKeyName(name, suffix))
    return previous
  } catch {
    return null
  }
}

export function writeStored(name: KeyName, value: string, suffix = ''): void {
  const store = area(name)
  if (!store) return
  try {
    store.setItem(keyName(name, suffix), value)
    // The new name is the truth from here on.
    store.removeItem(legacyKeyName(name, suffix))
  } catch {
    /* storage blocked — the value simply does not persist */
  }
}

export function removeStored(name: KeyName, suffix = ''): void {
  const store = area(name)
  if (!store) return
  try {
    store.removeItem(keyName(name, suffix))
    store.removeItem(legacyKeyName(name, suffix))
  } catch {
    /* nothing to clear */
  }
}
