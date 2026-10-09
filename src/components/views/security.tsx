'use client'

import { useMemo, useState } from 'react'
import { useApp, type Session, type SecurityLog } from '@/components/app/data-context'
import { cn } from '@/lib/utils'
import { useScrollCollapse } from '@/lib/use-scroll-collapse'
import { edgeFetch } from '@/lib/edge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Shield, ShieldAlert, Activity, Monitor, Smartphone, Tablet, LogOut, MapPin, Clock, AlertTriangle, X,
} from 'lucide-react'
import { toast } from 'sonner'

function timeAgo(date: string | Date): string {
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

function deviceIcon(device: string | null) {
  if (!device) return <Monitor className="h-4 w-4" />
  const d = device.toLowerCase()
  if (d.includes('phone') || d.includes('mobile') || d.includes('iphone') || d.includes('android')) return <Smartphone className="h-4 w-4" />
  if (d.includes('tablet') || d.includes('ipad')) return <Tablet className="h-4 w-4" />
  return <Monitor className="h-4 w-4" />
}

const LOG_COLORS: Record<string, string> = {
  LOGIN: '#4ade80',
  LOGIN_FAILED: '#ef4444',
  SETTINGS_CHANGE: '#60a5fa',
  ROLE_CHANGE: '#c084fc',
  PASSWORD_CHANGE: '#fbbf24',
  PROMO_CREATED: '#ff7e6b',
  LOGOUT: '#9aa3b2',
  SESSION_REVOKED: '#f97316',
}

const LOG_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGIN_FAILED: 'Failed Login',
  SETTINGS_CHANGE: 'Settings Change',
  ROLE_CHANGE: 'Role Change',
  PASSWORD_CHANGE: 'Password Change',
  PROMO_CREATED: 'Promo Created',
  LOGOUT: 'Logout',
  SESSION_REVOKED: 'Session Revoked',
}

export function SecurityView() {
  const { data, refresh } = useApp()
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const { scrollRef, collapsed } = useScrollCollapse()

  const sessions = data?.sessions ?? []
  const logs = data?.securityLogs ?? []
  const users = data?.users ?? []

  const failedLoginCount = logs.filter((l) => l.action === 'LOGIN_FAILED').length

  const headers = {
    'x-tenant-id': data?.tenant.id ?? '',
    'content-type': 'application/json',
  }

  const revokeSession = async (sessionId: string) => {
    setRevoking(sessionId)
    try {
      const res = await edgeFetch('/api/security', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Session revoked')
      await refresh()
    } catch {
      toast.error('Failed to revoke session')
    } finally {
      setRevoking(null)
    }
  }

  const revokeAllSessions = async () => {
    setRevokeAllOpen(false)
    setRevoking('all')
    try {
      const res = await edgeFetch('/api/security', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'revoke_all' }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('All sessions revoked')
      await refresh()
    } catch {
      toast.error('Failed to revoke sessions')
    } finally {
      setRevoking(null)
    }
  }

  if (!data) return null

  // (scrollRef + collapsed come from useScrollCollapse above)

  return (
    <div className="h-full flex flex-col">
      {/* Header — collapses on scroll to give content cards more room */}
      <div
        className={cn(
          'shrink-0 px-3.5 md:px-6 flex items-center justify-between gap-3 flex-wrap transition-all duration-200 ease-out',
          collapsed ? 'pt-1.5 pb-1.5' : 'pt-3 md:pt-6 pb-2.5',
        )}
      >
        <div className="min-w-0">
          <h2
            className={cn(
              'font-bold tracking-tight flex items-center gap-2 transition-all duration-200 ease-out',
              collapsed ? 'text-base md:text-lg' : 'text-lg md:text-2xl',
            )}
          >
            <Shield className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            Security
          </h2>
          <p
            className={cn(
              'text-sm text-muted-foreground transition-all duration-200 ease-out',
              collapsed
                ? 'max-h-0 opacity-0 overflow-hidden mt-0'
                : 'max-h-8 opacity-100 mt-0.5',
            )}
          >
            Sessions, two-factor authentication & activity audit
          </p>
        </div>
        <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setRevokeAllOpen(true)}>
          <LogOut className="h-4 w-4" />
          Revoke All Sessions
        </Button>
      </div>

      {/* Top stats — collapse away when header is collapsed */}
      <div
        className={cn(
          'shrink-0 px-3.5 md:px-6 grid grid-cols-2 md:grid-cols-4 gap-3 transition-all duration-200 ease-out',
          collapsed
            ? 'max-h-0 pb-0 opacity-0 overflow-hidden'
            : 'max-h-48 pb-3 opacity-100',
        )}
      >
        <StatCard icon={<Monitor className="h-4 w-4" />} label="Active Sessions" value={sessions.length} tint="#ff7e6b" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Security Events" value={logs.length} tint="#60a5fa" />
        <StatCard icon={<ShieldAlert className="h-4 w-4" />} label="Failed Logins" value={failedLoginCount} tint="#ef4444" />
      </div>

      {/* Main scroll area: two-column grid + activity log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3.5 md:px-6 pb-4 md:pb-6 space-y-4">
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Sessions */}
          <Card className="rounded-2xl bg-card border-border flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">Active Sessions</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Devices currently signed in</p>
              </div>
              <Badge variant="secondary" className="bg-secondary/70 shrink-0">{sessions.length}</Badge>
            </div>
            <div className="lg:max-h-[440px] overflow-y-auto scrollbar-thin">
              <div className="p-3 space-y-2">
                {sessions.length === 0 ? (
                  <div className="text-center py-12">
                    <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">No active sessions</p>
                  </div>
                ) : (
                  sessions.map((s) => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      revoking={revoking === s.id}
                      onRevoke={() => revokeSession(s.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </Card>

        </div>

        {/* Recent activity */}
        <Card className="rounded-2xl bg-card border-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">Recent Activity Log</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Audit trail of security events</p>
            </div>
            <Badge variant="secondary" className="bg-secondary/70 shrink-0">{logs.length} events</Badge>
          </div>
          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            <div className="p-4">
              {logs.length === 0 ? (
                <div className="text-center py-10">
                  <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                </div>
              ) : (
                <div className="relative pl-4">
                  {/* timeline rail */}
                  <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <LogItem key={log.id} log={log} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Revoke all confirm */}
      <AlertDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Revoke all sessions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will sign out every user across all devices, including the current session. Users will need to log in again. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={revokeAllSessions}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {revoking === 'all' ? 'Revoking…' : 'Revoke All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ icon, label, value, tint = '#ff7e6b', sub }: { icon: React.ReactNode; label: string; value: number; tint?: string; sub?: string }) {
  return (
    <Card className="rounded-2xl bg-card border-border p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {label}{sub ? <span className="opacity-70"> · {sub}</span> : null}
          </p>
        </div>
      </div>
    </Card>
  )
}

function SessionItem({ session, revoking, onRevoke }: { session: Session; revoking: boolean; onRevoke: () => void }) {
  const u = session.user
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          {deviceIcon(session.device)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{u?.name ?? 'Unknown user'}</p>
            {session.current && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/15 text-emerald-400">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Current
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">
            {session.browser || 'Unknown browser'} · {session.device || 'Unknown device'}
          </p>
          <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
            {session.location && (
              <span className="inline-flex items-center gap-1 min-w-0 break-words">
                <MapPin className="h-3 w-3 shrink-0" />
                {session.location}
              </span>
            )}
            {session.ip && (
              <span className="font-mono">{session.ip}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(session.lastActive)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={session.current || revoking}
          onClick={onRevoke}
          className={cn(
            'text-xs h-7 shrink-0',
            session.current
              ? 'text-muted-foreground cursor-not-allowed'
              : 'text-destructive hover:bg-destructive/10 hover:text-destructive'
          )}
        >
          {revoking ? 'Revoking…' : session.current ? 'Active' : <><X className="h-3 w-3" /> Revoke</>}
        </Button>
      </div>
    </div>
  )
}

function LogItem({ log }: { log: SecurityLog }) {
  const color = LOG_COLORS[log.action] || '#9aa3b2'
  const label = LOG_LABELS[log.action] || log.action
  return (
    <div className="relative">
      {/* dot */}
      <span
        className="absolute -left-3.5 top-1.5 w-3 h-3 rounded-full ring-2 ring-card"
        style={{ backgroundColor: color }}
      />
      <div className="rounded-xl border border-border bg-secondary/30 p-3 ml-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="text-[10px] h-5"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {label}
          </Badge>
          <span className="text-sm font-medium">{log.user?.name ?? 'System'}</span>
          <span className="text-[11px] text-muted-foreground ml-auto">{timeAgo(log.createdAt)}</span>
        </div>
        {(log.meta || log.ip) && (
          <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 text-xs text-muted-foreground flex-wrap">
            {log.meta && <span className="break-words min-w-0">{log.meta}</span>}
            {log.ip && <span className="font-mono break-all">{log.ip}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
