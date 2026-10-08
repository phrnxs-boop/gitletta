'use client'

import { create } from 'zustand'

export type ViewKey =
  | 'dashboard' | 'orders' | 'analytics' | 'promos' | 'qr'
  | 'menu' | 'settings' | 'security' | 'roles'

export interface CartItem {
  menuItemId: string
  name: string
  price: number
  image?: string | null
  quantity: number
  notes?: string
}

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
  updateCartQty: (menuItemId: string, qty: number) => void
  removeFromCart: (menuItemId: string) => void
  setCartNotes: (menuItemId: string, notes: string) => void
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
      const existing = s.cart.find((c) => c.menuItemId === item.menuItemId)
      if (existing) {
        return {
          cart: s.cart.map((c) =>
            c.menuItemId === item.menuItemId ? { ...c, quantity: c.quantity + qty } : c
          ),
        }
      }
      return { cart: [...s.cart, { ...item, quantity: qty }] }
    }),
  updateCartQty: (menuItemId, qty) =>
    set((s) => ({
      cart: qty <= 0 ? s.cart.filter((c) => c.menuItemId !== menuItemId) : s.cart.map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: qty } : c)),
    })),
  removeFromCart: (menuItemId) => set((s) => ({ cart: s.cart.filter((c) => c.menuItemId !== menuItemId) })),
  setCartNotes: (menuItemId, notes) => set((s) => ({ cart: s.cart.map((c) => (c.menuItemId === menuItemId ? { ...c, notes } : c)) })),
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
