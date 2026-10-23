'use client'

import { create } from 'zustand'
import { canonicalPortionName, normalizePortionKey } from '@/lib/portions'

export type ViewKey =
  | 'dashboard' | 'orders' | 'analytics' | 'promos' | 'qr'
  | 'menu' | 'settings' | 'security' | 'roles' | 'billing'

export interface CartItem {
  menuItemId: string
  name: string
  /** Stable portion ID and display name for dishes sold per portion. */
  portionId?: string | null
  portion?: string | null
  price: number
  image?: string | null
  quantity: number
  notes?: string
}

/**
 * A cart line is one dish in one portion. Case-insensitive normalised key
 * ensures "Full" and "full" or matching portionId always merge into one line.
 */
const sameLine = (
  c: CartItem,
  menuItemId: string,
  portion?: string | null,
  portionId?: string | null,
) =>
  c.menuItemId === menuItemId &&
  normalizePortionKey(c.portion, c.portionId) === normalizePortionKey(portion, portionId)

interface AppState {
  // tenant context
  tenantId: string | null
  setTenantId: (id: string) => void

  // current view (for the single-page dashboard)
  view: ViewKey
  setView: (v: ViewKey) => void

  // settings sub-tab (so header dropdown can open Profile/Preferences directly)
  settingsTab: string
  setSettingsTab: (t: string) => void

  // POS cart
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, 'quantity'>, qty?: number) => void
  updateCartQty: (menuItemId: string, qty: number, portion?: string | null) => void
  removeFromCart: (menuItemId: string, portion?: string | null) => void
  setCartNotes: (menuItemId: string, notes: string, portion?: string | null) => void
  clearCart: () => void

  // POS order type & table
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'
  setOrderType: (t: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY') => void
  selectedTableId: string | null
  setSelectedTableId: (id: string | null) => void

  // promo
  promoCode: string
  setPromoCode: (c: string) => void

  // sidebar collapse (mobile)
  sidebarOpen: boolean
  setSidebarOpen: (b: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  tenantId: null,
  setTenantId: (id) => set({ tenantId: id }),

  view: 'dashboard',
  setView: (v) => set({ view: v }),

  settingsTab: 'profile',
  setSettingsTab: (t) => set({ settingsTab: t }),

  cart: [],
  addToCart: (item, qty = 1) =>
    set((s) => {
      const cleanPortion = item.portion ? canonicalPortionName(item.portion) : null
      const cleanPortionId = item.portionId || (cleanPortion ? normalizePortionKey(cleanPortion) : null)
      const existing = s.cart.find((c) => sameLine(c, item.menuItemId, cleanPortion, cleanPortionId))
      if (existing) {
        return {
          cart: s.cart.map((c) =>
            sameLine(c, item.menuItemId, cleanPortion, cleanPortionId)
              ? { ...c, price: item.price, portion: cleanPortion, portionId: cleanPortionId, quantity: c.quantity + qty }
              : c
          ),
        }
      }
      return {
        cart: [
          ...s.cart,
          { ...item, portion: cleanPortion, portionId: cleanPortionId, quantity: qty },
        ],
      }
    }),
  updateCartQty: (menuItemId, qty, portion) =>
    set((s) => ({
      cart: qty <= 0
        ? s.cart.filter((c) => !sameLine(c, menuItemId, portion))
        : s.cart.map((c) => (sameLine(c, menuItemId, portion) ? { ...c, quantity: qty } : c)),
    })),
  removeFromCart: (menuItemId, portion) => set((s) => ({ cart: s.cart.filter((c) => !sameLine(c, menuItemId, portion)) })),
  setCartNotes: (menuItemId, notes, portion) => set((s) => ({ cart: s.cart.map((c) => (sameLine(c, menuItemId, portion) ? { ...c, notes } : c)) })),
  clearCart: () => set({ cart: [] }),

  orderType: 'DINE_IN',
  setOrderType: (t) => set({ orderType: t }),
  selectedTableId: null,
  setSelectedTableId: (id) => set({ selectedTableId: id }),

  promoCode: '',
  setPromoCode: (c) => set({ promoCode: c }),

  sidebarOpen: false,
  setSidebarOpen: (b) => set({ sidebarOpen: b }),
}))
