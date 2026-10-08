/** Kept in sync with src/lib/constants.ts (PERMISSION_KEYS). */
export const PERMISSION_KEYS = [
  "dashboard.view", "orders.view", "orders.manage", "orders.refund",
  "menu.view", "menu.manage", "tables.view", "tables.manage",
  "promos.view", "promos.manage", "analytics.view", "qr.manage",
  "settings.view", "settings.manage", "security.view", "security.manage",
  "roles.view", "roles.manage", "staff.view", "staff.manage",
] as const;
