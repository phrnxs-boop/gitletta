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
    /**
     * Listen at the document, and decide from the event's target.
     *
     * A single ref is not enough here. Views render both their mobile and their
     * desktop layout and hide one with CSS, so two scroll containers exist in
     * the DOM and the ref can only ever point at one of them — and the one it
     * lands on may well be the hidden pane, which cannot scroll and therefore
     * never reports a position. The collapse then silently never fires.
     *
     * Scroll events do not bubble, but they can be captured on the way down, so
     * one listener sees every scroll on the page. Anything with no box is a
     * hidden pane and is ignored.
     */
    let frame = 0

    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target || typeof target.scrollTop !== 'number') return

      const rect = target.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return // a hidden duplicate

      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const top = target.scrollTop
        // Hysteresis: only ever flip once the dead zone has been crossed.
        if (!collapsedRef.current && top > collapseAt) apply(true)
        else if (collapsedRef.current && top < expandAt) apply(false)
      })
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [collapseAt, expandAt, apply])

  return { scrollRef, collapsed }
}
