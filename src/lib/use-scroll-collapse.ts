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
  // The pane that actually scrolled, so a collapse can be compensated for.
  const activeRef = useRef<HTMLElement | null>(null)
  // Set while the collapse is being compensated for; see apply().
  const pinningRef = useRef(false)
  /**
   * How far the content shifts when this chrome collapses.
   *
   * The correction can only absorb a shift smaller than the scroll position, so
   * the collapse has to wait until there is enough scroll behind it — and the
   * amount to wait for is this. It is not the scroller's own top offset: that
   * counts the whole chrome, while only part of it collapses. Measured instead
   * of guessed, on the first collapse, and reused after that.
   */
  const shiftRef = useRef(0)

  const apply = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return

    // Collapsing the chrome above a scroller moves everything in it: the
    // scroller's top edge rises by the chrome's height, and the content, being
    // anchored to that edge, rises with it. That is the jump a phone sees. The
    // shift can be cancelled by adjusting the scroll position by the same
    // amount, measured rather than assumed, so it works whatever collapsed.
    const pane = activeRef.current

    collapsedRef.current = next
    setCollapsed(next)

    if (!pane) return

    /**
     * Hold the content still while the chrome moves.
     *
     * The chrome above the scroller animates its height over ~200ms, so its
     * effect arrives gradually — measuring once after a frame captures almost
     * none of it. Tracking the scroller's top edge for the length of the
     * transition and cancelling the movement keeps the content under the
     * reader's eye pinned.
     *
     * The correction is written as an absolute position, not an accumulation of
     * per-frame deltas: adding deltas lets any missed or double-counted frame
     * compound, and it ran away badly when tried that way.
     *
     * Pinning moves the scroller, so its own scroll events are ignored while
     * this is running — otherwise the correction re-enters the handler that
     * triggered it.
     */
    const anchor = pane.getBoundingClientRect().top - pane.scrollTop
    const startTop = pane.getBoundingClientRect().top
    pinningRef.current = true
    // Run until the layout has actually stopped moving rather than for a fixed
    // time: a timer can stop mid-transition and leave the correction short,
    // which is exactly what a 400ms cap did.
    let stable = 0
    let previousTop = pane.getBoundingClientRect().top
    const deadline = performance.now() + 1200
    const pin = () => {
      const top = pane.getBoundingClientRect().top
      const wanted = top - anchor
      if (Math.abs(wanted - pane.scrollTop) > 0.5) pane.scrollTop = wanted
      stable = Math.abs(top - previousTop) < 0.5 ? stable + 1 : 0
      previousTop = top
      if (stable < 4 && performance.now() < deadline) {
        requestAnimationFrame(pin)
      } else {
        pinningRef.current = false
        shiftRef.current = Math.abs(top - startTop)
      }
    }
    requestAnimationFrame(pin)
  }, [])

  useEffect(() => {
    /**
     * One listener at the document, deciding from the event's target.
     *
     * A single ref is not enough: views render both their mobile and desktop
     * layout and hide one with CSS, so two scroll containers exist and the ref
     * can only hold one — often the hidden one, which has no box and cannot
     * scroll. Scroll events do not bubble but can be captured on the way down,
     * so one listener sees them all.
     */
    let frame = 0

    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target || typeof target.scrollTop !== 'number') return

      const rect = target.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return // a hidden duplicate

      // Only a pane that scrolls vertically. A sideways swipe on a filter strip
      // fires scroll events too, and reacting to those collapsed the header
      // mid-swipe.
      if (target.scrollHeight <= target.clientHeight + 4) return

      // Our own correction, not the reader.
      if (pinningRef.current) return

      activeRef.current = target

      // The correction above can only absorb a shift smaller than the current
      // scroll position, because scrollTop cannot go below zero.
      //
      // The pane's own top offset is a good measure of the chrome above it —
      // that offset *is* the chrome's height while nothing is collapsed — so the
      // collapse waits until the reader has scrolled at least that far. Without
      // this the correction clamps and the content lurches: measured at 83px on
      // desktop, which collapses earliest.
      // Wait for as much scroll as the last collapse needed, with a sensible
      // floor before anything has been measured.
      // 260 covers the tallest chrome in the app before anything has been
      // measured, so the first collapse is already seamless rather than only
      // the ones after it. Later toggles use this view's own measurement.
      const roomNeeded = Math.max(collapseAt, shiftRef.current || 260)

      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const top = target.scrollTop
        // Hysteresis: only ever flip once the dead zone has been crossed.
        if (!collapsedRef.current && top > roomNeeded) apply(true)
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
