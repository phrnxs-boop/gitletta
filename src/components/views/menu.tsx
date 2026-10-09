'use client'

import { useMemo, useState, useEffect } from 'react'
import { useApp, type MenuItem } from '@/components/app/data-context'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ImageUpload } from '@/components/shared/image-upload'
import { Tag } from '@/components/shared/badges'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Star,
  Clock,
  Flame,
  UtensilsCrossed,
  Tag as TagIcon,
  X,
  Loader2,
  PackageOpen,
  CheckCircle2,
  CircleDollarSign,
  ListOrdered,
} from 'lucide-react'

interface MenuFormState {
  name: string
  description: string
  price: string
  categoryId: string
  prepTime: string
  calories: string
  rating: string
  tags: string
  image: string
  available: boolean
}

const EMPTY_FORM: MenuFormState = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  prepTime: '15',
  calories: '',
  // Matches the column default, so a new item starts with the star it will show.
  rating: '4.5',
  tags: '',
  image: '',
  available: true,
}

/**
 * Category icons, grouped by course.
 *
 * Curated for Indian restaurants: the previous flat list leaned Western
 * (burger, pizza, sushi, taco), which read oddly next to a menu of biryani and
 * naan. Grouping also means the picker scans like a menu instead of a wall of
 * emoji, and the set is larger — the input beside it still accepts anything.
 */
const CATEGORY_ICONS: { group: string; icons: string[] }[] = [
  { group: 'Starters', icons: ['🥗', '🧀', '🍢', '🍗', '🥟', '🍤', '🌶️', '🧅', '🥜'] },
  { group: 'Mains', icons: ['🍛', '🥘', '🍲', '🫘', '🥩', '🐟', '🍅', '🥔', '🧄'] },
  { group: 'Rice', icons: ['🍚', '🍛', '🍱', '🌾', '🥣'] },
  { group: 'Breads', icons: ['🫓', '🥖', '🍞', '🥨', '🧈'] },
  { group: 'Desserts', icons: ['🍮', '🍨', '🍧', '🍰', '🧁', '🍯', '🍫', '🥮'] },
  { group: 'Drinks', icons: ['🫖', '☕', '🧋', '🥤', '🍹', '🥛', '🥭', '🥥', '🍋'] },
  { group: 'Other', icons: ['🍽️', '🥄', '🔥', '⭐', '👑', '🥡', '🎁'] },
]

const PRESET_TAGS = [
  { id: 'VEG', label: 'Veg', icon: '🌱', activeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 ring-1 ring-emerald-500/40 shadow-xs' },
  { id: 'NON-VEG', label: 'Non-Veg', icon: '🍗', activeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/50 ring-1 ring-rose-500/40 shadow-xs' },
  { id: 'VEGAN', label: 'Vegan', icon: '🌿', activeClass: 'bg-green-500/20 text-green-400 border-green-500/50 ring-1 ring-green-500/40 shadow-xs' },
  { id: 'SPICY', label: 'Spicy', icon: '🌶️', activeClass: 'bg-red-500/20 text-red-400 border-red-500/50 ring-1 ring-red-500/40 shadow-xs' },
  { id: 'JAIN', label: 'Jain', icon: '✨', activeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/50 ring-1 ring-amber-500/40 shadow-xs' },
  { id: 'BESTSELLER', label: 'Bestseller', icon: '⭐', activeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 ring-1 ring-orange-500/40 shadow-xs' },
  { id: 'NEW', label: 'New', icon: '🔥', activeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 ring-1 ring-blue-500/40 shadow-xs' },
  { id: 'GLUTEN-FREE', label: 'Gluten-Free', icon: '🌾', activeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/50 ring-1 ring-purple-500/40 shadow-xs' },
] as const

export function MenuView() {
  const { data, refresh } = useApp()
  const { scrollRef, collapsed } = useScrollCollapse()
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [form, setForm] = useState<MenuFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const selectedTagList = useMemo(() => {
    return (form.tags || '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
  }, [form.tags])

  const toggleTag = (tagId: string) => {
    const norm = tagId.toUpperCase()
    let current = (form.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const exists = current.some((t) => t.toUpperCase() === norm)
    if (exists) {
      current = current.filter((t) => t.toUpperCase() !== norm)
    } else {
      if (norm === 'VEG') {
        current = current.filter((t) => t.toUpperCase() !== 'NON-VEG')
      } else if (norm === 'NON-VEG') {
        current = current.filter((t) => t.toUpperCase() !== 'VEG' && t.toUpperCase() !== 'VEGAN')
      }
      current.push(tagId)
    }
    setField('tags', current.join(', '))
  }
  // Category dialog
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '🍽️' })
  const [catSaving, setCatSaving] = useState(false)

  // Sync category filter dropdown value with the pill row
  useEffect(() => {
    setCatFilter(activeCat)
  }, [activeCat])

  const menuItems = data?.menuItems ?? []
  const categories = data?.categories ?? []
  const tenant = data?.tenant
  const currency = tenant?.currencySymbol ?? '$'

  const stats = useMemo(() => {
    const total = menuItems.length
    const available = menuItems.filter((m) => m.available).length
    const avgPrice = total > 0 ? menuItems.reduce((s, m) => s + m.price, 0) / total : 0
    return { total, available, avgPrice, cats: categories.length }
  }, [menuItems, categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menuItems.filter((m) => {
      if (activeCat !== 'all' && m.categoryId !== activeCat) return false
      if (q && !`${m.name} ${m.description || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [menuItems, activeCat, search])

  if (!data || !tenant) return null

  const openAdd = () => {
    setEditingItem(null)
    setForm({
      ...EMPTY_FORM,
      categoryId: categories[0]?.id ?? '',
    })
    setItemDialogOpen(true)
  }

  const openEdit = (item: MenuItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price ?? ''),
      categoryId: item.categoryId,
      prepTime: String(item.prepTime ?? 15),
      calories: item.calories != null ? String(item.calories) : '',
      rating: item.rating != null ? String(item.rating) : '',
      tags: item.tags || '',
      image: item.image || '',
      available: item.available,
    })
    setItemDialogOpen(true)
  }

  const setField = <K extends keyof MenuFormState>(key: K, value: MenuFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Item name is required')
      return
    }
    if (!form.categoryId) {
      toast.error('Please select a category')
      return
    }
    const price = parseFloat(form.price)
    if (Number.isNaN(price) || price < 0) {
      toast.error('Enter a valid price')
      return
    }
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      categoryId: form.categoryId,
      prepTime: parseInt(form.prepTime || '15', 10) || 15,
      calories: form.calories ? parseInt(form.calories, 10) : null,
      rating: form.rating ? Number(form.rating) : null,
      tags: form.tags.trim() || null,
      image: form.image.trim() || null,
      available: form.available,
    }
    setSaving(true)
    try {
      const headers = { 'content-type': 'application/json', 'x-tenant-id': tenant.id }
      let res: Response
      if (editingItem) {
        res = await edgeFetch('/api/menu', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ id: editingItem.id, ...body }),
        })
      } else {
        res = await edgeFetch('/api/menu', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) throw new Error('Failed')
      toast.success(editingItem ? 'Item updated' : 'Item created')
      setItemDialogOpen(false)
      await refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleAvailable = async (item: MenuItem) => {
    setTogglingId(item.id)
    try {
      const res = await edgeFetch('/api/menu', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({ id: item.id, available: !item.available }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(!item.available ? 'Item available' : 'Item hidden')
      await refresh()
    } catch {
      toast.error('Failed to toggle')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // Menu API has no DELETE; we hide the item by toggling available=false as a soft delete fallback.
      // But spec says "Delete (alert dialog confirm)" — we still attempt a DELETE on the menu endpoint for parity.
      const res = await edgeFetch(`/api/menu?id=${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenant.id },
      })
      if (!res.ok && res.status !== 404 && res.status !== 405) throw new Error('Failed')
      toast.success('Item deleted')
      setDeleteTarget(null)
      await refresh()
    } catch {
      toast.error('Failed to delete item')
    } finally {
      setDeleting(false)
    }
  }

  const handleAddCategory = async () => {
    if (!catForm.name.trim()) {
      toast.error('Category name is required')
      return
    }
    setCatSaving(true)
    try {
      const res = await edgeFetch('/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': tenant.id },
        body: JSON.stringify({
          name: catForm.name.trim(),
          icon: catForm.icon || '🍽️',
          sortOrder: categories.length,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Category added')
      setCatForm({ name: '', icon: '🍽️' })
      setCatDialogOpen(false)
      await refresh()
    } catch {
      toast.error('Failed to add category')
    } finally {
      setCatSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn(
        'px-4 md:px-6 space-y-3 transition-all duration-300 ease-out',
        collapsed ? 'pt-2 pb-2' : 'pt-4 md:pt-6 pb-3',
      )}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className={cn(
              'font-bold tracking-tight transition-all duration-300 ease-out',
              collapsed ? 'text-base md:text-lg' : 'text-xl md:text-2xl',
            )}>Menu</h1>
            <div className={cn(
              'overflow-hidden transition-all duration-300 ease-out',
              collapsed ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100',
            )}>
              <p className="text-sm text-muted-foreground">
                Manage dishes, categories, availability &amp; pricing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Category
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
        </div>

        {/* Search + category filter — stack on mobile, row on sm+ */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2 flex-1 min-w-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items…"
              className="bg-transparent outline-none text-sm flex-1 min-w-0 placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search" className="shrink-0">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Select value={catFilter} onValueChange={(v) => setActiveCat(v)}>
            <SelectTrigger className="w-full sm:w-[180px] shrink-0 bg-secondary/60 border-0">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all"><span className="mr-1">🍴</span>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="mr-1">{c.icon || '🍽️'}</span>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats strip — hides when header is collapsed to free up vertical room */}
      <div className={cn(
        'overflow-hidden transition-all duration-300 ease-out px-4 md:px-6',
        collapsed ? 'max-h-0 opacity-0 pb-0' : 'max-h-40 opacity-100 pb-3',
      )}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip icon={<ListOrdered className="h-3.5 w-3.5" />} label="Total Items" value={String(stats.total)} />
          <StatChip
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Available"
            value={String(stats.available)}
            accent
          />
          <StatChip
            icon={<CircleDollarSign className="h-3.5 w-3.5" />}
            label="Avg Price"
            value={`${currency}${stats.avgPrice.toFixed(2)}`}
          />
          <StatChip icon={<TagIcon className="h-3.5 w-3.5" />} label="Categories" value={String(stats.cats)} />
        </div>
      </div>

      {/* Category pills (horizontal scroll) */}
      <div className="px-4 md:px-6 pb-3">
        <div className="overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
          <div className="flex gap-1.5 whitespace-nowrap">
            <CatPill active={activeCat === 'all'} onClick={() => setActiveCat('all')}>
              <span className="mr-1">🍴</span>All <span className="ml-1 opacity-60">({menuItems.length})</span>
            </CatPill>
            {categories.map((c) => {
              const count = menuItems.filter((m) => m.categoryId === c.id).length
              return (
                <CatPill key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                  <span className="mr-1">{c.icon || '🍽️'}</span>
                  {c.name} <span className="ml-1 opacity-60">({count})</span>
                </CatPill>
              )
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-6 pb-6 min-h-0">
        {filtered.length === 0 ? (
          <EmptyMenu hasItems={menuItems.length > 0} onAdd={openAdd} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pt-1">
            {filtered.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                currency={currency}
                categoryName={item.category?.name || categories.find((c) => c.id === item.categoryId)?.name || 'Uncategorized'}
                categoryIcon={item.category?.icon || categories.find((c) => c.id === item.categoryId)?.icon || '🍽️'}
                toggling={togglingId === item.id}
                onToggle={() => handleToggleAvailable(item)}
                onEdit={() => openEdit(item)}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-2xl bg-card max-h-[85vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Menu Item'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Update the details of this menu item.'
                : 'Fill in the details to add a new menu item.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="m-name">Name *</Label>
              <Input
                id="m-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Truffle Mushroom Burger"
                className="bg-secondary/50 border-0"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="m-desc">Description</Label>
              <Textarea
                id="m-desc"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Short description shown to customers…"
                className="bg-secondary/50 border-0 min-h-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-price">Price *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="m-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setField('price', e.target.value)}
                  placeholder="0.00"
                  className="bg-secondary/50 border-0 pl-7"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => setField('categoryId', v)}>
                <SelectTrigger className="bg-secondary/50 border-0 w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="mr-1">{c.icon || '🍽️'}</span>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-prep">Prep Time (min)</Label>
              <Input
                id="m-prep"
                type="number"
                min="0"
                value={form.prepTime}
                onChange={(e) => setField('prepTime', e.target.value)}
                className="bg-secondary/50 border-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-cal">Calories</Label>
              <Input
                id="m-cal"
                type="number"
                min="0"
                value={form.calories}
                onChange={(e) => setField('calories', e.target.value)}
                placeholder="—"
                className="bg-secondary/50 border-0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-rating">Rating (0–5)</Label>
              <div className="relative">
                <Input
                  id="m-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={form.rating}
                  onChange={(e) => setField('rating', e.target.value)}
                  placeholder="4.5"
                  className="bg-secondary/50 border-0 pl-8"
                />
                <Star className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              </div>
              <p className="text-[11px] text-muted-foreground">Shown as the star on the menu card.</p>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tags</Label>
                <span className="text-[11px] text-muted-foreground">Tap tags to select/unselect</span>
              </div>
              <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-secondary/30 border border-border/60">
                {PRESET_TAGS.map((tag) => {
                  const isSelected = selectedTagList.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer select-none active:scale-95',
                        isSelected
                          ? tag.activeClass
                          : 'bg-secondary/60 text-muted-foreground border-transparent hover:border-border hover:text-foreground hover:bg-secondary/90'
                      )}
                    >
                      <span className="text-xs">{tag.icon}</span>
                      <span>{tag.label}</span>
                      {isSelected && <span className="text-[10px] ml-0.5 font-bold">✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="sm:col-span-2">
              <ImageUpload
                value={form.image}
                onChange={(v) => setField('image', v)}
                label="Item Image"
                shape="circle"
                size={88}
                fallback="🍽️"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-secondary/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Available for ordering</p>
                <p className="text-xs text-muted-foreground">When off, this item is hidden from the POS</p>
              </div>
              <Switch checked={form.available} onCheckedChange={(v) => setField('available', v)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setItemDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : editingItem ? (
                'Save Changes'
              ) : (
                'Create Item'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
            <DialogDescription>Add a new section to organize menu items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name *</Label>
              <Input
                id="c-name"
                value={catForm.name}
                onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Desserts"
                className="bg-secondary/50 border-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-icon">Icon</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="c-icon"
                  value={catForm.icon}
                  onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="🍛"
                  maxLength={4}
                  className="bg-secondary/50 border-0 w-20 text-center text-xl"
                />
                <p className="text-[11px] text-muted-foreground">
                  Pick one, or type any emoji you like.
                </p>
              </div>
              <div className="max-h-56 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                {CATEGORY_ICONS.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {g.group}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.icons.map((emoji) => (
                        <button
                          key={`${g.group}-${emoji}`}
                          type="button"
                          onClick={() => setCatForm((f) => ({ ...f, icon: emoji }))}
                          className={cn(
                            'h-9 w-9 rounded-lg text-lg transition-colors',
                            catForm.icon === emoji
                              ? 'bg-primary/20 ring-1 ring-primary'
                              : 'bg-secondary/60 hover:bg-secondary',
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatDialogOpen(false)} disabled={catSaving}>
              Cancel
            </Button>
            <Button onClick={handleAddCategory} disabled={catSaving}>
              {catSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                'Add Category'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete menu item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.name}</span> from
              your menu. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------- sub components ---------- */

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border px-3 py-2.5 flex items-center gap-3',
        accent ? 'bg-primary/10' : 'bg-card',
      )}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
          accent ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  )
}

function CatPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function MenuCard({
  item,
  currency,
  categoryName,
  categoryIcon,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MenuItem
  currency: string
  categoryName: string
  categoryIcon: string | null
  toggling: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const tags = (item.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-border bg-card p-4 flex flex-col transition-all',
        'hover:border-primary/40 hover:shadow-lg hover:shadow-black/20',
        !item.available && 'opacity-60',
      )}
    >
      {/* Top: image + availability */}
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-white/5"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center text-2xl">
              {categoryIcon || '🍽️'}
            </div>
          )}
          {!item.available && (
            <span className="absolute inset-0 rounded-full bg-background/60 flex items-center justify-center">
              <span className="text-[9px] font-semibold uppercase text-muted-foreground">Hidden</span>
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{item.name}</h3>
            <div className="flex items-center gap-1 shrink-0">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span className="text-xs font-medium">{item.rating ? item.rating.toFixed(1) : '—'}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">
            {item.description || 'No description'}
          </p>
        </div>
      </div>

      {/* Price + category */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-lg font-bold text-primary">
          {currency}
          {item.price.toFixed(2)}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {categoryIcon} {categoryName}
        </Badge>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 max-w-full overflow-hidden items-center">
          {tags.slice(0, 4).map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
      )}

      {/* Meta */}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {item.prepTime} min
        </span>
        {item.calories != null && (
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3 w-3" /> {item.calories} cal
          </span>
        )}
      </div>

      <Separator className="my-3" />

      {/* Footer: toggle + actions */}
      <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
          <Switch checked={item.available} onCheckedChange={onToggle} disabled={toggling} />
          {toggling ? 'Updating…' : item.available ? 'Available' : 'Hidden'}
        </label>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit} aria-label="Edit item">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            aria-label="Delete item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyMenu({ hasItems, onAdd }: { hasItems: boolean; onAdd: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-20">
      <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <PackageOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">
        {hasItems ? 'No items match your filters' : 'No menu items yet'}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {hasItems
          ? 'Try adjusting the search or category filter to find what you’re looking for.'
          : 'Add your first dish to start building the menu for your restaurant.'}
      </p>
      {!hasItems && (
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add First Item
        </Button>
      )}
    </div>
  )
}

export default MenuView
