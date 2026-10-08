/**
 * The database speaks snake_case; the frontend speaks camelCase.
 * These two helpers are the single boundary between them.
 */

export function toCamel<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map((v) => toCamel(v)) as unknown as T
  if (input === null || typeof input !== 'object') return input as T
  if (input instanceof Date) return input as unknown as T

  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    out[camel] = value !== null && typeof value === 'object' ? toCamel(value) : value
  }
  return out as T
}

export function toSnake(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    const snake = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
    out[snake] = value
  }
  return out
}

/**
 * PostgREST returns embedded aggregate counts as either `[{count: n}]` or
 * `{count: n}` depending on version. Normalise to a plain number.
 */
export function embedCount(value: any): number {
  if (Array.isArray(value)) return Number(value[0]?.count ?? 0)
  return Number(value?.count ?? 0)
}
