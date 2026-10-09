'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * useScrollCollapse — the "header shrinks as you scroll" effect.
 *
 * Attach `scrollRef` to the scrollable content container. Past the collapse
 * threshold the header contracts to give content more room; returning near the
 * top expands it again.
 *
 * Two details that matter, both of which the first version got wrong:
 *
 *  - Hysteresis. Collapsing at one threshold and expanding at the same one
 *    makes the state chatter whenever the scroll position sits on the boundary.
 *    Each toggle changes the header's height, which shifts the content, which
 *    re-triggers the check — the flicker feeds itself. Collapsing at 48px and
 *    expanding only below 12px leaves a dead zone between them.
 *
 *  - No state write unless the value actually changed. The previous version
 *    called setState on every animation frame with an identical value; React
 *    bails out of the re-render, but it still queues work on every scroll frame.
 */
export function useScrollCollapse(collapseAt = 48, expandAt = 12) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Latest value, so the scroll handler never needs re-creating.
  const collapsedRef = useRef(false)
  const apply = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return
    collapsedRef.current = next
    setCollapsed(next)
  }, [])

  useEffect(() => {
    let el: HTMLDivElement | null = null
    let observer: MutationObserver | null = null
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    let frame = 0

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const top = el?.scrollTop ?? 0
        // Hysteresis: only ever flip once the dead zone has been crossed.
        if (!collapsedRef.current && top > collapseAt) apply(true)
        else if (collapsedRef.current && top < expandAt) apply(false)
      })
    }

    const attach = () => {
      if (el) return
      el = scrollRef.current
      if (!el) return
      el.addEventListener('scroll', onScroll, { passive: true })
      apply(el.scrollTop > collapseAt)
      if (observer) { observer.disconnect(); observer = null }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
    }

    attach()

    // The container may not exist yet when data is still loading. A
    // MutationObserver is cheap and event-driven, so it replaces the old 50ms
    // polling loop; it gives up after a few seconds either way.
    if (!scrollRef.current) {
      observer = new MutationObserver(attach)
      observer.observe(document.body, { childList: true, subtree: true })
      settleTimer = setTimeout(() => {
        if (observer) { observer.disconnect(); observer = null }
        settleTimer = null
      }, 5000)
    }

    return () => {
      if (frame) cancelAnimationFrame(frame)
      if (observer) observer.disconnect()
      if (settleTimer) clearTimeout(settleTimer)
      if (el) el.removeEventListener('scroll', onScroll)
    }
  }, [collapseAt, expandAt, apply])

  return { scrollRef, collapsed }
}
