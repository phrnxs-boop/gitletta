'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/components/app/data-context'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table2,
  Download,
  Printer,
  Link as LinkIcon,
  LayoutGrid,
  List,
  Users,
  Sparkles,
  Inbox,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  QrCode,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface QrTableItem {
  id: string
  name: string
  seats: number
  area: string
  qrToken: string
  active: boolean
  currentStatus?: string
  qrUrl: string
  qrData: string
}

const TABLE_STATUS_META: Record<string, { label: string; color: string }> = {
  OCCUPIED: { label: 'Occupied', color: '#ef4444' },
  RESERVED: { label: 'Reserved', color: '#fbbf24' },
  AVAILABLE: { label: 'Available', color: '#4ade80' },
  CLEANING: { label: 'Cleaning', color: '#60a5fa' },
}

function statusMeta(status?: string) {
  if (!status) return { label: 'Available', color: '#4ade80' }
  const norm = status.toUpperCase().replace(' ', '_')
  return TABLE_STATUS_META[norm] || { label: status, color: '#9aa3b2' }
}

export function QrView() {
  const { data, refresh } = useApp()
  const [items, setItems] = useState<QrTableItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>('grid')
  const { scrollRef, collapsed } = useScrollCollapse()

  // Modal dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', area: 'Main Hall', seats: 4 })
  const [editTable, setEditTable] = useState<QrTableItem | null>(null)
  const [editForm, setEditForm] = useState({ name: '', area: '', seats: 4, active: true })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const tenant = data?.tenant
  const tables = data?.tables ?? []
  const tenantId = tenant?.id ?? ''

  // fetch all QR codes for tenant
  const loadQr = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const res = await edgeFetch('/api/qr?all=true', {
        headers: { 'x-tenant-id': tenantId },
      })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setItems(Array.isArray(json) ? json : [])
    } catch {
      toast.error('Failed to load QR codes')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadQr()
  }, [loadQr, tables])

  const handleOpenCreate = () => {
    setCreateForm({
      name: `Table ${items.length + 1}`,
      area: 'Main Hall',
      seats: 4,
    })
    setCreateOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name.trim()) return
    setSaving(true)
    try {
      const res = await edgeFetch('/api/tables', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          area: createForm.area.trim() || 'Main Hall',
          seats: Number(createForm.seats) || 4,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create table QR')
      }
      toast.success(`QR code created for ${createForm.name}`)
      setCreateOpen(false)
      await loadQr()
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create table QR')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenEdit = (it: QrTableItem) => {
    setEditTable(it)
    setEditForm({
      name: it.name,
      area: it.area || 'Main Hall',
      seats: it.seats || 4,
      active: it.active !== false,
    })
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTable || !editForm.name.trim()) return
    setSaving(true)
    try {
      const res = await edgeFetch(`/api/tables/${editTable.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          area: editForm.area.trim() || 'Main Hall',
          seats: Number(editForm.seats) || 4,
          active: editForm.active,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update table QR')
      }
      toast.success(`Updated ${editForm.name}`)
      setEditTable(null)
      await loadQr()
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update table QR')
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerateToken = async () => {
    if (!editTable) return
    setSaving(true)
    try {
      const res = await edgeFetch(`/api/tables/${editTable.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          regenerateToken: true,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Regenerated QR code link for ${editTable.name}`)
      setEditTable(null)
      await loadQr()
      await refresh()
    } catch {
      toast.error('Failed to regenerate QR token')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTable = async () => {
    if (!editTable) return
    if (!window.confirm(`Delete ${editTable.name} and remove its QR code?`)) return
    setDeleting(true)
    try {
      const res = await edgeFetch(`/api/tables/${editTable.id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId },
      })
      if (!res.ok) throw new Error()
      toast.success(`Deleted ${editTable.name}`)
      setEditTable(null)
      await loadQr()
      await refresh()
    } catch {
      toast.error('Failed to delete table')
    } finally {
      setDeleting(false)
    }
  }

  if (!data || !tenant) return null

  const handleDownloadAll = () => {
    if (items.length === 0) {
      toast.error('No QR codes to download')
      return
    }
    toast.success('Preparing downloads…')
    items.forEach((it, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = it.qrData
        a.download = `table-${it.name.replace(/\s+/g, '-').toLowerCase()}.png`
        a.click()
      }, i * 350)
    })
    setTimeout(() => toast.success(`${items.length} QR codes downloaded`), items.length * 350 + 200)
  }

  const handleCopyLink = async (url: string) => {
    try {
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
      await navigator.clipboard.writeText(fullUrl)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleDownloadPng = (it: QrTableItem) => {
    const a = document.createElement('a')
    a.href = it.qrData
    a.download = `table-${it.name.replace(/\s+/g, '-').toLowerCase()}.png`
    a.click()
    toast.success(`Downloaded QR for ${it.name}`)
  }

  const handlePrint = (it: QrTableItem) => {
    const win = window.open('', '_blank', 'width=480,height=640')
    if (!win) {
      toast.error('Pop-up blocked — please allow pop-ups to print')
      return
    }
    win.document.write(`
      <html>
        <head>
          <title>${it.name} — QR Code</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              margin: 0; padding: 32px; text-align: center;
              color: #161922; background: #fff;
            }
            .card {
              display: inline-block; padding: 24px 32px;
              border: 2px dashed #16192222; border-radius: 20px;
            }
            h1 { font-size: 24px; margin: 0 0 4px; font-weight: 800; letter-spacing: -0.02em; }
            .meta { color: #6b7280; font-size: 14px; margin-bottom: 16px; }
            img { width: 320px; height: 320px; }
            .hint { margin-top: 16px; font-size: 13px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${it.name}</h1>
            <div class="meta">${it.area} · ${it.seats} seats</div>
            <img src="${it.qrData}" alt="QR for ${it.name}" />
            <div class="hint">Scan to open the menu & place an order</div>
          </div>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
    toast.success(`Printing ${it.name}…`)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header (collapsible on scroll) */}
      <header
        className={cn(
          'px-4 md:px-6 border-b border-border transition-all duration-300 ease-out',
          collapsed ? 'pt-2 pb-2' : 'pt-4 md:pt-6 pb-4',
        )}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className={cn(
                  'font-bold tracking-tight transition-all duration-300 ease-out truncate',
                  collapsed ? 'text-base md:text-lg' : 'text-xl md:text-2xl',
                )}
              >
                QR Codes
              </h1>
              {!loading && (
                <Badge variant="secondary" className="font-semibold">
                  {items.length} {items.length === 1 ? 'table' : 'tables'}
                </Badge>
              )}
            </div>
            <p
              className={cn(
                'text-sm text-muted-foreground transition-all duration-300 ease-out',
                collapsed ? 'max-h-0 opacity-0 overflow-hidden mt-0' : 'max-h-8 opacity-100 mt-0.5',
              )}
            >
              Generate scan-to-order QR codes for each table/room.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOpenCreate}
              className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-glow-primary"
            >
              <Plus className="h-4 w-4" />
              Create New QR
            </Button>
            <Button onClick={handleDownloadAll} variant="outline" className="gap-2" disabled={loading || items.length === 0}>
              <Download className="h-4 w-4" />
              Download All
            </Button>
          </div>
        </div>

        {/* Collapsible info banner. Session state deliberately does NOT appear
            here: this page exists to print QR codes, and sessions now expire on
            their own in the database (migration 0008), so there is nothing for
            an operator to watch or clear. */}
        <div
          className={cn(
            'transition-all duration-300 ease-out',
            collapsed ? 'max-h-0 opacity-0 overflow-hidden mt-0' : 'max-h-[600px] opacity-100',
          )}
        >
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Scan to order — contactless &amp; instant
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Customers scan a table&apos;s QR code to open the digital menu and place orders directly from their phone. Each table has a unique, tokenized URL.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content with tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 md:px-6 pt-3 shrink-0 flex items-center justify-between">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="grid" className="gap-1.5 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />
              By Table
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5 text-xs">
              <List className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Click on a card to print or download
          </span>
        </div>

        {/* Grid tab */}
        <TabsContent value="grid" className="flex-1 overflow-hidden mt-0">
          <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-thin p-4 md:px-6 pt-3 pb-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <QrCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState onAdd={handleOpenCreate} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((it) => (
                <QrCard
                  key={it.id}
                  item={it}
                  onDownload={() => handleDownloadPng(it)}
                  onPrint={() => handlePrint(it)}
                  onCopy={() => handleCopyLink(it.qrUrl)}
                  onEdit={() => handleOpenEdit(it)}
                />
              ))}
            </div>
          )}
          </div>
        </TabsContent>

        {/* List tab */}
        <TabsContent value="list" className="flex-1 overflow-hidden mt-0">
          <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-thin p-4 md:p-6 pt-3 pb-8">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState onAdd={handleOpenCreate} />
          ) : (
            <OverviewList
              items={items}
              onCopy={handleCopyLink}
              onDownload={handleDownloadPng}
              onEdit={handleOpenEdit}
            />
          )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Table QR Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5 text-primary" />
              Create New Table QR
            </DialogTitle>
            <DialogDescription>
              Add a new table to generate a scan-to-order QR code.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-name" className="text-xs font-medium">Table Name *</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Table 9, Terrace A"
                className="bg-secondary/50 border-border"
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-area" className="text-xs font-medium">Area / Section</Label>
                <Input
                  id="create-area"
                  value={createForm.area}
                  onChange={(e) => setCreateForm({ ...createForm, area: e.target.value })}
                  placeholder="e.g. Main Hall"
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-seats" className="text-xs font-medium">Capacity (Seats)</Label>
                <Input
                  id="create-seats"
                  type="number"
                  min={1}
                  max={50}
                  value={createForm.seats}
                  onChange={(e) => setCreateForm({ ...createForm, seats: Number(e.target.value) || 4 })}
                  className="bg-secondary/50 border-border"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-5 pt-3 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !createForm.name.trim()} className="bg-primary text-white">
                {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</> : 'Generate QR Code'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Table QR Dialog */}
      <Dialog open={!!editTable} onOpenChange={(open) => !open && setEditTable(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Pencil className="h-5 w-5 text-primary" />
              Edit {editTable?.name}
            </DialogTitle>
            <DialogDescription>
              Update table configuration, status, or regenerate the QR link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-medium">Table Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g. Table 1"
                className="bg-secondary/50 border-border"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-area" className="text-xs font-medium">Area / Section</Label>
                <Input
                  id="edit-area"
                  value={editForm.area}
                  onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                  placeholder="e.g. Main Hall"
                  className="bg-secondary/50 border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-seats" className="text-xs font-medium">Capacity (Seats)</Label>
                <Input
                  id="edit-seats"
                  type="number"
                  min={1}
                  max={50}
                  value={editForm.seats}
                  onChange={(e) => setEditForm({ ...editForm, seats: Number(e.target.value) || 4 })}
                  className="bg-secondary/50 border-border"
                />
              </div>
            </div>

            {/* Active status */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30">
              <div>
                <p className="text-xs font-medium text-foreground">Table Status</p>
                <p className="text-[11px] text-muted-foreground">Available for customers to order</p>
              </div>
              <Switch
                checked={editForm.active}
                onCheckedChange={(checked) => setEditForm({ ...editForm, active: checked })}
              />
            </div>

            {/* Regenerate Token Option */}
            <div className="p-3 rounded-xl border border-border bg-secondary/30 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-foreground">Regenerate QR Token</p>
                <p className="text-[11px] text-muted-foreground">Changes the digital link if old QR is compromised</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRegenerateToken}
                disabled={saving}
                className="h-8 text-xs shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Regenerate
              </Button>
            </div>

            {/* Footer with Delete and Save */}
            <div className="flex items-center justify-between pt-3 border-t border-border mt-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDeleteTable}
                disabled={deleting}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {deleting ? 'Deleting…' : 'Delete Table'}
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditTable(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editForm.name.trim()} className="bg-primary text-white">
                  {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- QR card ----------
function QrCard({
  item,
  onDownload,
  onPrint,
  onCopy,
  onEdit,
}: {
  item: QrTableItem
  onDownload: () => void
  onPrint: () => void
  onCopy: () => void
  onEdit: () => void
}) {
  const meta = statusMeta(item.currentStatus)
  return (
    <article className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-black/10">
      {/* QR on white */}
      <div className="flex justify-center">
        <a
          href={item.qrUrl.startsWith('http') ? item.qrUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${item.qrUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open customer menu for ${item.name} in new tab`}
          className="group relative bg-white p-3 rounded-xl shadow-sm hover:shadow-md transition-all block cursor-pointer"
        >
          <img
            src={item.qrData}
            alt={`QR code for ${item.name}`}
            className="w-40 h-40 object-contain group-hover:opacity-95 transition-opacity"
          />
          <span className="absolute bottom-1.5 inset-x-2 text-center text-[10px] font-medium text-muted-foreground/0 group-hover:text-primary transition-colors bg-white/95 rounded py-0.5 shadow-xs">
            Open Menu ↗
          </span>
        </a>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-base leading-tight truncate">{item.name}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{item.area || 'Main Hall'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg"
            onClick={onEdit}
            title="Edit Table QR"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Seats */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{item.seats} {item.seats === 1 ? 'seat' : 'seats'}</span>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-1.5 mt-auto pt-2 border-t border-border/60">
        <Button size="sm" variant="default" className="h-8 gap-1 text-[11px] px-1 bg-primary text-white" onClick={onDownload}>
          <Download className="h-3.5 w-3.5 mr-0.5" /> PNG
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] px-1" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5 mr-0.5" /> Print
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] px-1" onClick={onCopy}>
          <LinkIcon className="h-3.5 w-3.5 mr-0.5" /> Copy
        </Button>
      </div>
    </article>
  )
}

// ---------- overview list ----------
function OverviewList({
  items,
  onCopy,
  onDownload,
  onEdit,
}: {
  items: QrTableItem[]
  onCopy: (url: string) => void
  onDownload: (it: QrTableItem) => void
  onEdit: (it: QrTableItem) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[680px]">
          {/* table header */}
          <div className="grid grid-cols-[1.5rem_1fr_0.8fr_0.7fr_1.4fr_auto] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border bg-secondary/30">
            <span></span>
            <span>Table</span>
            <span>Area</span>
            <span>Seats</span>
            <span>QR URL</span>
            <span className="text-right">Actions</span>
          </div>
          {/* rows */}
          {items.map((it) => {
            const meta = statusMeta(it.currentStatus)
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1.5rem_1fr_0.8fr_0.7fr_1.4fr_auto] gap-3 px-4 py-3 items-center border-b border-border/50 hover:bg-secondary/20 transition-colors text-sm"
              >
                <img
                  src={it.qrData}
                  alt=""
                  className="w-6 h-6 rounded bg-white p-0.5 object-contain"
                />
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{it.name}</span>
                  <span
                    className="hidden sm:inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium"
                    style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs truncate">{it.area || '—'}</span>
                <span className="text-muted-foreground text-xs">{it.seats}</span>
                <span className="text-muted-foreground text-xs font-mono truncate">{it.qrUrl || '—'}</span>
                <div className="flex items-center justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(it)} aria-label={`Edit ${it.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDownload(it)} aria-label={`Download ${it.name} PNG`}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onCopy(it.qrUrl)} aria-label={`Copy ${it.name} link`}>
                    <LinkIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------- skeleton ----------
function QrCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex justify-center">
        <Skeleton className="w-40 h-40 rounded-xl bg-white/10" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-7 w-full rounded-md" />
      <div className="grid grid-cols-3 gap-1.5">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    </div>
  )
}

// ---------- empty state ----------
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary/70 flex items-center justify-center mb-4">
        <Inbox className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold">No QR codes created yet</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">Create your first table QR code to enable scan-to-order.</p>
      <Button
        size="sm"
        className="mt-4 gap-1.5 bg-primary text-white shadow-glow-primary"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
        Create New QR
      </Button>
    </div>
  )
}
