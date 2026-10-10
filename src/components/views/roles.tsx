'use client'

import { useMemo, useState, useEffect } from 'react'
import { useApp, type Role, type User } from '@/components/app/data-context'
import { PERMISSION_GROUPS } from '@/lib/constants'
import { edgeFetch } from '@/lib/edge'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Shield, ShieldCheck, ShieldPlus, Users, Plus, Lock, Check, ChevronDown, ChevronRight, Save, Trash2, MoreVertical, Crown, KeyRound, UserPlus, Power, AlertTriangle,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

const PRESET_COLORS = ['#f97316', '#4ade80', '#60a5fa', '#fbbf24', '#c084fc', '#f472b6', '#22d3ee', '#a78bfa']

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

function parsePerms(permString: string | null | undefined): string[] {
  if (!permString) return []
  return permString.split(',').map((p) => p.trim()).filter(Boolean)
}

export function RolesView() {
  const { data, refresh } = useApp()
  const { scrollRef, collapsed } = useScrollCollapse()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [staffCreateOpen, setStaffCreateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'roles' | 'staff'>('roles')

  const roles = data?.roles ?? []
  const users = data?.users ?? []
  const staff = data?.staff ?? []

  // Derive the effective selected role (falls back to first role when none selected / missing).
  const selectedRole = useMemo(() => {
    if (roles.length === 0) return null
    return roles.find((r) => r.id === selectedId) ?? roles[0]
  }, [roles, selectedId])

  const memberCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const u of users) {
      const rid = u.roleId || ''
      if (rid) map[rid] = (map[rid] || 0) + 1
    }
    for (const s of staff) {
      const rid = s.roleId || ''
      if (rid) map[rid] = (map[rid] || 0) + 1
    }
    return map
  }, [users, staff])

  // Combine dashboard users and staff members assigned to the selected role
  const roleMembers = useMemo(() => {
    if (!selectedRole) return []
    const userMembers = users
      .filter((u) => u.roleId === selectedRole.id)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        type: 'user' as const,
      }))
    const staffMembers = staff
      .filter((s) => s.roleId === selectedRole.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        email: `ID: ${s.employeeId}`,
        type: 'staff' as const,
      }))
    return [...userMembers, ...staffMembers]
  }, [selectedRole, users, staff])

  const systemCount = roles.filter((r) => r.isSystem).length
  const customCount = roles.length - systemCount

  const headers = {
    'x-tenant-id': data?.tenant.id ?? '',
    'content-type': 'application/json',
  }

  if (!data) return null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn(
        'px-3.5 md:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 transition-all duration-200 ease-out',
        collapsed ? 'pt-1.5 pb-1.5' : 'pt-3 md:pt-6 pb-2.5',
      )}>
        <div>
          <h2 className={cn(
            'font-bold tracking-tight flex items-center gap-2 transition-all duration-200 ease-out',
            collapsed ? 'text-base md:text-lg' : 'text-lg md:text-2xl',
          )}>
            <Shield className={cn('text-primary transition-all duration-200 ease-out', collapsed ? 'h-4 w-4 md:h-5 md:w-5' : 'h-5 w-5 md:h-6 md:w-6')} />
            Role Access
          </h2>
          <div className={cn(
            'overflow-hidden transition-all duration-200 ease-out',
            collapsed ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100',
          )}>
            <p className="text-sm text-muted-foreground mt-0.5">Manage staff roles and granular permissions</p>
          </div>
        </div>
        {/* Tabs and the action button stack on phones. Side by side they cannot
            both fit at 390px — the tab labels are nowrap, so the row overran the
            viewport and the button was clipped rather than wrapped. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {/* Tab toggle: Roles & Permissions vs Staff Accounts.
              flex-1 on phones so the pair shares the row with the button rather
              than wrapping its labels onto two lines. */}
          <div className="inline-flex flex-1 sm:flex-none rounded-xl bg-secondary/50 border border-border p-0.5">
            <button
              onClick={() => setActiveTab('roles')}
              className={cn(
                'flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-premium',
                activeTab === 'roles' ? 'bg-primary text-white shadow-glow-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Shield className="h-3.5 w-3.5 shrink-0" /> Roles & Permissions
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={cn(
                'flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-premium',
                activeTab === 'staff' ? 'bg-primary text-white shadow-glow-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="h-3.5 w-3.5 shrink-0" /> Staff Accounts
            </button>
          </div>
          {activeTab === 'roles' ? (
            <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary/90 shrink-0 whitespace-nowrap w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Create Role
            </Button>
          ) : (
            <Button onClick={() => setStaffCreateOpen(true)} className="bg-primary hover:bg-primary/90 shrink-0 whitespace-nowrap w-full sm:w-auto">
              <UserPlus className="h-4 w-4" />
              Add Staff
            </Button>
          )}
        </div>
      </div>

      {/* Top stats — collapse away to free up vertical room when scrolled */}
      <div className={cn(
        'overflow-hidden transition-all duration-200 ease-out px-3.5 md:px-6 grid grid-cols-2 md:grid-cols-4 gap-3',
        // The expanded height has to clear the tallest layout this grid takes.
        // It is one row from md up (four columns, ~128px), but two rows on a
        // phone (two columns, ~192px) — and a single max-h-32 cut the second row
        // in half, which read as the role chips sitting on top of the cards.
        collapsed ? 'max-h-0 opacity-0 pb-0' : 'max-h-[13rem] md:max-h-32 opacity-100 pb-3',
      )}>
        <StatCard icon={<Shield className="h-4 w-4" />} label="Total Roles" value={roles.length} tint="#f97316" />
        <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="System Roles" value={systemCount} tint="#4ade80" />
        <StatCard icon={<ShieldPlus className="h-4 w-4" />} label="Custom Roles" value={customCount} tint="#60a5fa" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Total Staff" value={staff.length > 0 ? staff.length : users.length} tint="#fbbf24" />
      </div>

      {/* Two-column layout (desktop) + horizontal pills (mobile) */}
      {activeTab === 'roles' && (
      <div className="flex-1 min-h-0 overflow-hidden px-3.5 md:px-6 pb-4 md:pb-6">
        {/* Mobile: horizontal scrollable role pills + detail below */}
        <div className="lg:hidden flex flex-col gap-3 h-full min-h-0">
          {/* Scrolls on its own, so a long role list never widens the page. */}
          <div className="shrink-0 -mx-3.5 px-3.5 overflow-x-auto overscroll-x-contain scrollbar-thin">
            <div className="flex gap-2 py-1 w-max min-w-full">
              {roles.map((role) => {
                const active = role.id === (selectedRole?.id ?? null)
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedId(role.id)}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all min-h-[40px]',
                      active
                        ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/30'
                        : 'border-border bg-secondary/40 text-foreground hover:bg-secondary',
                    )}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="font-medium whitespace-nowrap">{role.name}</span>
                    {role.isSystem && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">({memberCounts[role.id] || 0})</span>
                  </button>
                )
              })}
              <button
                onClick={() => setCreateOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors min-h-[40px]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">New</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {selectedRole ? (
              <RoleDetail
                role={selectedRole}
                members={roleMembers}
                allRoles={roles}
                headers={headers}
                refresh={refresh}
                scrollRef={scrollRef}
              />
            ) : (
              <Card className="rounded-2xl bg-card border-border h-full flex items-center justify-center">
                <div className="text-center">
                  <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">Select a role to view details</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Desktop: sidebar list + detail */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-4 h-full">
          {/* Left: role list */}
          <Card className="lg:col-span-1 rounded-2xl bg-card border-border p-3 flex flex-col gap-2 overflow-hidden">
            <div className="flex items-center justify-between px-1 pb-1">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Roles</h3>
              <span className="text-xs text-muted-foreground">{roles.length} total</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin -mx-1 px-1">
              <div className="space-y-1.5 pr-1">
                {roles.map((role) => (
                  <RoleListItem
                    key={role.id}
                    role={role}
                    memberCount={memberCounts[role.id] || 0}
                    active={role.id === (selectedRole?.id ?? null)}
                    onClick={() => setSelectedId(role.id)}
                  />
                ))}
                <button
                  onClick={() => setCreateOpen(true)}
                  className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 py-2.5 text-sm transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create Role
                </button>
              </div>
            </div>
          </Card>

          {/* Right: detail */}
          <div className="lg:col-span-2 min-h-0">
            {selectedRole ? (
              <RoleDetail
                role={selectedRole}
                members={roleMembers}
                allRoles={roles}
                headers={headers}
                refresh={refresh}
                scrollRef={scrollRef}
              />
            ) : (
              <Card className="rounded-2xl bg-card border-border h-full flex items-center justify-center">
                <div className="text-center">
                  <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">Select a role to view details</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Staff Accounts tab */}
      {activeTab === 'staff' && (
        <StaffAccountsSection headers={headers} roles={roles} tenantId={data.tenant.id} refresh={refresh} createOpen={staffCreateOpen} setCreateOpen={setStaffCreateOpen} />
      )}

      {/* Create dialog */}
      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        headers={headers}
        onCreated={(newRole) => {
          setSelectedId(newRole.id)
          refresh()
        }}
      />
    </div>
  )
}

function StatCard({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: number; tint: string }) {
  return (
    <Card className="rounded-2xl bg-card border-border p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </div>
    </Card>
  )
}

function RoleListItem({ role, memberCount, active, onClick }: { role: Role; memberCount: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-3 transition-all',
        active
          ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/30'
          : 'border-border bg-secondary/40 hover:bg-secondary hover:border-border'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 w-3 h-3 rounded-full shrink-0 ring-2 ring-background"
          style={{ backgroundColor: role.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{role.name}</p>
            {role.isSystem && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-secondary/80">
                <Lock className="h-2.5 w-2.5" />
                SYSTEM
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {role.description || 'No description'}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

type RoleMember = {
  id: string
  name: string
  email: string
  type?: 'user' | 'staff'
}

function RoleDetail({
  role,
  members,
  allRoles,
  headers,
  refresh,
  scrollRef,
}: {
  role: Role
  members: RoleMember[]
  allRoles: Role[]
  headers: Record<string, string>
  refresh: () => Promise<void>
  scrollRef?: React.RefObject<HTMLDivElement | null>
}) {
  const [permState, setPermState] = useState<string[]>(() => parsePerms(role.permissions))
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description || '')
  const [color, setColor] = useState(role.color)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // Re-sync when role changes
  useEffect(() => {
    setPermState(parsePerms(role.permissions))
    setName(role.name)
    setDescription(role.description || '')
    setColor(role.color)
  }, [role.id, role.permissions, role.name, role.description, role.color])

  const isSystem = role.isSystem
  const dirty = useMemo(() => {
    const original = parsePerms(role.permissions)
    const samePerms = original.length === permState.length && original.every((p) => permState.includes(p))
    return !samePerms || name !== role.name || description !== (role.description || '') || color !== role.color
  }, [permState, name, description, color, role])

  const togglePerm = (key: string) => {
    if (isSystem) return
    setPermState((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))
  }

  const toggleGroup = (groupPerms: readonly string[], on: boolean) => {
    if (isSystem) return
    setPermState((prev) => {
      if (on) return Array.from(new Set([...prev, ...groupPerms]))
      return prev.filter((p) => !groupPerms.includes(p))
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await edgeFetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, description, permissions: permState, color }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Role updated')
      await refresh()
    } catch {
      toast.error('Failed to update role')
    } finally {
      setSaving(false)
    }
  }

  const removeRole = async () => {
    if (deleteConfirm !== role.name) {
      toast.error(`Type "${role.name}" to confirm`)
      return
    }
    setSaving(true)
    try {
      const res = await edgeFetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('Role deleted')
      setDeleteOpen(false)
      setDeleteConfirm('')
      await refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete role')
    } finally {
      setSaving(false)
    }
  }

  const assignRole = async (member: RoleMember, newRoleId: string) => {
    try {
      if (member.type === 'staff') {
        await edgeFetch(`/api/staff/manage/${member.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ roleId: newRoleId }),
        })
      }
      toast.success(`${member.name}'s role updated`, { description: `Now assigned as ${allRoles.find((r) => r.id === newRoleId)?.name ?? 'new role'}` })
      await refresh()
    } catch {
      toast.error('Failed to update role')
    }
  }

  return (
    <Card className="rounded-2xl bg-card border-border h-full flex flex-col overflow-hidden">
      {/* Role header */}
      <div className="p-4 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className="mt-1 w-4 h-4 rounded-full shrink-0 ring-2 ring-background"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg leading-tight truncate">{role.name}</h3>
              {isSystem && (
                <Badge variant="secondary" className="text-[10px] h-5 bg-secondary/80">
                  <Lock className="h-3 w-3" />
                  System Role
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{description || 'No description provided'}</p>
          </div>
        </div>
        {!isSystem && (
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-5">
          {/* Role meta */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Role Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSystem}
                className="bg-secondary/50 border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={isSystem}
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all disabled:opacity-40',
                      color === c ? 'ring-foreground scale-110' : 'ring-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {color === c && <Check className="h-3.5 w-3.5 text-white mx-auto" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSystem}
              rows={2}
              className="bg-secondary/50 border-border resize-none"
              placeholder="What can this role do?"
            />
          </div>

          {isSystem && (
            <div className="flex items-start gap-2 rounded-xl bg-secondary/50 border border-border p-3 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
              <span>System role — permissions are recommended defaults and cannot be modified.</span>
            </div>
          )}

          {/* Permission matrix */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Permissions Matrix</h4>
              <span className="text-xs text-muted-foreground">{permState.length} enabled</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => {
                const enabledCount = group.perms.filter((p) => permState.includes(p)).length
                const allOn = enabledCount === group.perms.length
                return (
                  <Collapsible key={group.label} defaultOpen className="rounded-xl border border-border bg-secondary/30">
                    <div className="flex items-center justify-between p-3">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-sm font-medium flex-1">
                          {allOn ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {group.label}
                          <span className="text-xs text-muted-foreground">({enabledCount}/{group.perms.length})</span>
                        </button>
                      </CollapsibleTrigger>
                      {!isSystem && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.perms, !allOn)}
                          className="text-xs text-primary hover:underline"
                        >
                          {allOn ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-1 border-t border-border/50 pt-3">
                        {group.perms.map((perm) => (
                          <label
                            key={perm}
                            className={cn(
                              'flex items-center gap-2.5 text-sm rounded-md px-2 py-2 min-h-[40px]',
                              isSystem ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-secondary/60'
                            )}
                          >
                            <Checkbox
                              checked={permState.includes(perm)}
                              onCheckedChange={() => togglePerm(perm)}
                              disabled={isSystem}
                            />
                            <span className="font-mono text-xs break-all">{perm}</span>
                          </label>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Members
                <span className="text-xs text-muted-foreground font-normal">({members.length})</span>
              </h4>
            </div>
            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 md:p-6 text-center">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No staff assigned to this role yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-2.5">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="bg-secondary text-xs font-medium" style={{ color: role.color }}>
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {/* Static: a member is the account that registered the
                        restaurant, and the Owner role is exclusive to it. The
                        dropdown this replaces never sent a request for members,
                        so it only claimed the role had changed. */}
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="truncate">{role.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      {!isSystem && (
        <div className="border-t border-border p-3 flex items-center justify-between gap-2 bg-card/60">
          <p className="text-xs text-muted-foreground">
            {dirty ? 'You have unsaved changes' : 'All changes saved'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => {
                setPermState(parsePerms(role.permissions))
                setName(role.name)
                setDescription(role.description || '')
                setColor(role.color)
              }}
            >
              Discard
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={save} className="bg-primary hover:bg-primary/90">
              {saving ? <><span className="animate-spin mr-1">⏳</span> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save Changes</>}
            </Button>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete role
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the <strong className="text-foreground">{role.name}</strong> role. Staff assigned to it will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{role.name}</span> to confirm
            </Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={role.name}
              className="bg-secondary/50 border-border"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={removeRole} disabled={saving || deleteConfirm !== role.name}>
              {saving ? 'Deleting…' : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CreateRoleDialog({
  open,
  onOpenChange,
  headers,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  headers: Record<string, string>
  onCreated: (role: Role) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [perms, setPerms] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName('')
    setDescription('')
    setColor(PRESET_COLORS[0])
    setPerms([])
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }
    setSaving(true)
    try {
      const res = await edgeFetch('/api/roles', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), description: description.trim(), permissions: perms, color }),
      })
      if (!res.ok) throw new Error('Failed')
      const role: Role = await res.json()
      toast.success('Role created')
      reset()
      onOpenChange(false)
      onCreated(role)
    } catch {
      toast.error('Failed to create role')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldPlus className="h-4 w-4 text-primary" />
            Create New Role
          </DialogTitle>
          <DialogDescription>Define a new staff role with custom permissions.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shift Manager"
              className="bg-secondary/50 border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this role do?"
              className="bg-secondary/50 border-border resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all',
                    color === c ? 'ring-foreground scale-110' : 'ring-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="h-3.5 w-3.5 text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <span className="text-xs text-muted-foreground">{perms.length} selected</span>
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-2 pr-1">
              {PERMISSION_GROUPS.map((group) => {
                const enabledCount = group.perms.filter((p) => perms.includes(p)).length
                const allOn = enabledCount === group.perms.length
                return (
                  <Collapsible key={group.label} className="rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center justify-between p-2.5">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-sm font-medium flex-1">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          {group.label}
                          <span className="text-xs text-muted-foreground">({enabledCount}/{group.perms.length})</span>
                        </button>
                      </CollapsibleTrigger>
                      <button
                        type="button"
                        onClick={() => {
                          if (allOn) setPerms((prev) => prev.filter((p) => !(group.perms as readonly string[]).includes(p)))
                          else setPerms((prev) => Array.from(new Set([...prev, ...group.perms])))
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        {allOn ? 'Clear' : 'All'}
                      </button>
                    </div>
                    <CollapsibleContent>
                      <div className="px-2.5 pb-2.5 space-y-1 border-t border-border/50 pt-2">
                        {group.perms.map((perm) => (
                          <label key={perm} className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-secondary/60 rounded-md px-2 py-2 min-h-[40px]">
                            <Checkbox
                              checked={perms.includes(perm)}
                              onCheckedChange={() => {
                                setPerms((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]))
                              }}
                            />
                            <span className="font-mono text-xs break-all">{perm}</span>
                          </label>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim()} className="bg-primary hover:bg-primary/90">
            {saving ? 'Creating…' : <><Plus className="h-3.5 w-3.5" /> Create Role</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Staff Accounts Section ───────────────────────────────────────────────
function StaffAccountsSection({ headers, roles, tenantId, refresh, createOpen, setCreateOpen }: {
  headers: Record<string, string>
  roles: Role[]
  tenantId: string
  refresh: () => Promise<void>
  createOpen: boolean
  setCreateOpen: (v: boolean) => void
}) {
  const { data } = useApp()
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [resetStaff, setResetStaff] = useState<any | null>(null)
  const [newPin, setNewPin] = useState('')
  const [deleteStaff, setDeleteStaff] = useState<any | null>(null)

  // Form state for new staff
  const [form, setForm] = useState({ name: '', employeeId: '', roleId: '', pin: '' })

  const load = async () => {
    setLoading(true)
    try {
      const res = await edgeFetch('/api/staff/manage', { headers })
      const data = await res.json()
      setStaff(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load staff')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.employeeId.trim() || !form.pin) {
      toast.error('Name, employee ID, and PIN are required')
      return
    }
    try {
      const res = await edgeFetch('/api/staff/manage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          employeeId: form.employeeId.trim(),
          roleId: form.roleId || null,
          pin: form.pin,
          active: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`Staff account created for ${form.name}`)
      setForm({ name: '', employeeId: '', roleId: '', pin: '' })
      setCreateOpen(false)
      await load()
      await refresh()
    } catch {
      toast.error('Failed to create staff account')
    }
  }

  const handleToggleActive = async (s: any) => {
    try {
      await edgeFetch(`/api/staff/manage/${s.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ active: !s.active }),
      })
      toast.success(`${s.name} ${s.active ? 'deactivated' : 'activated'}`)
      await load()
      await refresh()
    } catch {
      toast.error('Failed to update staff')
    }
  }

  const handleChangeRole = async (s: any, roleId: string) => {
    try {
      await edgeFetch(`/api/staff/manage/${s.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ roleId: roleId || null }),
      })
      toast.success(`${s.name}'s role updated`)
      await load()
      await refresh()
    } catch {
      toast.error('Failed to update role')
    }
  }

  const handleResetPin = async () => {
    if (!resetStaff || !newPin) return
    if (!/^\d{4}$/.test(newPin)) { toast.error('PIN must be 4 digits'); return }
    try {
      const res = await edgeFetch(`/api/staff/manage/${resetStaff.id}/reset-pin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pin: newPin }),
      })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success(`PIN reset for ${resetStaff.name}`)
      setResetStaff(null)
      setNewPin('')
      await load()
      await refresh()
    } catch {
      toast.error('Failed to reset PIN')
    }
  }

  const handleDelete = async () => {
    if (!deleteStaff) return
    try {
      await edgeFetch(`/api/staff/manage/${deleteStaff.id}`, { method: 'DELETE', headers })
      toast.success(`${deleteStaff.name} deleted`)
      setDeleteStaff(null)
      await load()
      await refresh()
    } catch {
      toast.error('Failed to delete staff')
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3.5 md:px-6 pb-4 md:pb-6">
      <div className="max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Staff Accounts
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create PIN-based accounts for staff to access the POS via the staff login screen
            </p>
          </div>
        </div>

        {/* Staff list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary/30 animate-pulse" />)}
          </div>
        ) : staff.length === 0 ? (
          <Card className="rounded-2xl bg-card border-border p-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium">No staff accounts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create staff accounts so they can log in with a PIN</p>
            <Button onClick={() => setCreateOpen(true)} className="mt-4 bg-primary hover:bg-primary/90">
              <UserPlus className="h-4 w-4 mr-1.5" /> Add First Staff Member
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {staff.map((s) => (
              <Card key={s.id} className={cn('rounded-2xl bg-card border-border p-4', !s.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ backgroundColor: `${s.roleColor}20`, color: s.roleColor }}>
                      {s.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {s.lockedUntil && new Date(s.lockedUntil) > new Date() && (
                          <Lock className="h-3 w-3 text-amber-500" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">ID: {s.employeeId}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" style={{ backgroundColor: `${s.roleColor}15`, color: s.roleColor }}>
                    {s.roleName}
                  </Badge>
                </div>

                {/* Status + last login */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-3">
                  <span className={cn('inline-flex items-center gap-1', s.active ? 'text-emerald-400' : 'text-red-400')}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.active ? '#4ade80' : '#ef4444' }} />
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                  {s.lastLogin && <span>Last login: {new Date(s.lastLogin).toLocaleDateString()}</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {/* Role selector */}
                  <Select value={s.roleId || ''} onValueChange={(v) => handleChangeRole(s, v)}>
                    <SelectTrigger className="h-8 text-xs bg-secondary/50 border-border flex-1">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.filter(r => !(r.isSystem && r.name === 'Owner')).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => { setResetStaff(s); setNewPin('') }}>
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleToggleActive(s)}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteStaff(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Lockout warning */}
                {s.failedAttempts > 0 && s.failedAttempts < 5 && (
                  <p className="text-[10px] text-amber-500 mt-2">{s.failedAttempts}/5 failed attempts</p>
                )}
                {s.lockedUntil && new Date(s.lockedUntil) > new Date() && (
                  <p className="text-[10px] text-red-400 mt-2">Locked until {new Date(s.lockedUntil).toLocaleTimeString()}</p>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Info banner */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Staff login screen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Staff can log in at <code className="bg-secondary px-1.5 py-0.5 rounded text-primary">/?view=staff-login&tenant={data?.tenant?.slug || data?.tenant?.id || ''}</code> using their employee ID and 4-digit PIN.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.open(`/?view=staff-login&tenant=${data?.tenant?.slug || data?.tenant?.id || ''}`, '_blank')}
            className="text-xs h-8 shrink-0 bg-background/60 hover:bg-background"
          >
            Open Staff Login ↗
          </Button>
        </div>
      </div>

      {/* Create staff dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Add Staff Account</DialogTitle>
            <DialogDescription>Create a PIN-based login for a staff member</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Raj Kumar" className="bg-secondary/50 border-border" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Employee ID / Username *</Label>
              <Input value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                placeholder="e.g. raj001" className="bg-secondary/50 border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.roleId} onValueChange={v => setForm(f => ({ ...f, roleId: v }))}>
                <SelectTrigger className="bg-secondary/50 border-border"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.filter(r => !(r.isSystem && r.name === 'Owner')).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">4-Digit PIN *</Label>
              <Input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder="••••" maxLength={4} inputMode="numeric" className="bg-secondary/50 border-border text-center text-2xl tracking-[0.5em]" />
              <p className="text-[11px] text-muted-foreground">PIN is hashed and stored securely. Never shared in plaintext.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-primary hover:bg-primary/90">
              <UserPlus className="h-4 w-4 mr-1.5" /> Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN dialog */}
      <Dialog open={!!resetStaff} onOpenChange={(o) => !o && setResetStaff(null)}>
        <DialogContent className="sm:max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle>Reset PIN — {resetStaff?.name}</DialogTitle>
            <DialogDescription>Enter a new 4-digit PIN for this staff member</DialogDescription>
          </DialogHeader>
          <Input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••" maxLength={4} inputMode="numeric" className="bg-secondary/50 border-border text-center text-2xl tracking-[0.5em]" autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetStaff(null)}>Cancel</Button>
            <Button onClick={handleResetPin} disabled={newPin.length !== 4} className="bg-primary hover:bg-primary/90">
              <KeyRound className="h-4 w-4 mr-1.5" /> Reset PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteStaff} onOpenChange={(o) => !o && setDeleteStaff(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete {deleteStaff?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the staff account and all related sessions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
