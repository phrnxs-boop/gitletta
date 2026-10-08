'use client'

import { useRef, useState, useEffect } from 'react'

/**
 * useScrollCollapse — reusable hook for the "header collapses on scroll" effect.
 *
 * Attach `scrollRef` to the scrollable content container. When the user scrolls
 * down past `threshold` px, `collapsed` becomes true and the header should shrink
 * to give the content cards more room. Scrolling back to top expands the header.
 *
 * Handles late-mounted containers (e.g. when data loads asynchronously and the
 * component initially returns null) by using a MutationObserver to detect when
 * the scroll container appears in the DOM.
 */
export function useScrollCollapse(threshold = 40) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let el: HTMLDivElement | null = null
    let observer: MutationObserver | null = null
    let interval: ReturnType<typeof setInterval> | null = null

    const attach = () => {
      if (el) return // already attached
      el = scrollRef.current
      if (!el) return

      let ticking = false
      const onScroll = () => {
        if (ticking) return
        ticking = true
        requestAnimationFrame(() => {
          setCollapsed(el!.scrollTop > threshold)
          ticking = false
        })
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      setCollapsed(el.scrollTop > threshold) // initial state

      // store cleanup on the element itself
      ;(el as any).__cleanupScroll = () => el!.removeEventListener('scroll', onScroll)

      if (observer) observer.disconnect()
      if (interval) clearInterval(interval)
    }

    // try immediately
    attach()

    // if not ready, poll (covers late mount from async data)
    if (!scrollRef.current) {
      interval = setInterval(attach, 50)
      // also observe DOM mutations as a fallback
      observer = new MutationObserver(attach)
      observer.observe(document.body, { childList: true, subtree: true })
      // stop after 10s
      setTimeout(() => {
        if (interval) clearInterval(interval)
        if (observer) observer.disconnect()
      }, 10000)
    }

    return () => {
      if (interval) clearInterval(interval)
      if (observer) observer.disconnect()
      if (el && (el as any).__cleanupScroll) {
        ;(el as any).__cleanupScroll()
        delete (el as any).__cleanupScroll
      }
    }
  }, [threshold])

  return { scrollRef, collapsed }
}
