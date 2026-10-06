import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ProductAutocomplete } from './product-autocomplete'
import type { ProductSuggestion } from '../lib/inputExperience'
import { searchProductSuggestions } from '../lib/productAutocomplete'
import type { WaitroseCatalogItem } from '../lib/waitroseCatalog'

type Props = {
  mealId: string
  mealTitle: string
  catalog: WaitroseCatalogItem[]
  disabled?: boolean
  catalogLoading?: boolean
  /** When true, search is always visible (Meal Builder primary interaction). */
  alwaysOpen?: boolean
  onAddProduct: (mealId: string, suggestion: ProductSuggestion, query: string) => void
}

const MIN_QUERY_CHARS = 2

function isMobileAddItemViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function stickyHeaderOffset(): number {
  const header = document.querySelector('[data-sticky-site-header]')
  return header instanceof HTMLElement ? Math.ceil(header.getBoundingClientRect().height) : 0
}

/**
 * Shopping Lists POPMAS autocomplete adapted for Shop Meal Builder.
 * Selecting a suggestion immediately adds the item — no separate Add button.
 */
export function MealAddItem({
  mealId,
  mealTitle,
  catalog,
  disabled = false,
  catalogLoading = false,
  alwaysOpen = true,
  onAddProduct,
}: Props) {
  const [open, setOpen] = useState(alwaysOpen)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null)
  const listId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const trimmedQuery = query.trim()
  const queryReady = trimmedQuery.length >= MIN_QUERY_CHARS

  const suggestions = useMemo(
    () => (queryReady ? searchProductSuggestions(trimmedQuery, catalog, 8) : []),
    [trimmedQuery, queryReady, catalog],
  )

  const showPanel = open && queryReady && suggestions.length > 0
  const showSearching = open && queryReady && catalogLoading && catalog.length === 0
  const showNoResults =
    open && queryReady && !catalogLoading && catalog.length > 0 && suggestions.length === 0
  const showCatalogUnavailable =
    open && queryReady && !catalogLoading && catalog.length === 0

  function updateSuggestionPanelHeight() {
    if (!isMobileAddItemViewport() || !inputRef.current) {
      setPanelMaxHeight(null)
      return
    }
    const vv = window.visualViewport
    const inputBottom = inputRef.current.getBoundingClientRect().bottom
    const usableBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    const available = Math.floor(usableBottom - inputBottom - 16)
    setPanelMaxHeight(Math.max(120, Math.min(available, 260)))
  }

  function positionAddItemInMobileViewport() {
    if (!isMobileAddItemViewport() || !rootRef.current) {
      setPanelMaxHeight(null)
      return
    }

    const el = rootRef.current
    const header = stickyHeaderOffset()
    const gap = 8
    el.style.scrollMarginTop = `${header + gap}px`
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' })

    const top = el.getBoundingClientRect().top
    const target = header + gap
    if (Math.abs(top - target) > 4) {
      window.scrollBy({ top: top - target, left: 0, behavior: 'auto' })
    }

    updateSuggestionPanelHeight()
  }

  useEffect(() => {
    if (alwaysOpen) setOpen(true)
  }, [alwaysOpen])

  useEffect(() => {
    if (!open) {
      if (!alwaysOpen) {
        setQuery('')
        setHighlight(-1)
      }
      setPanelMaxHeight(null)
      document.getElementById('meal-add-item-scroll-room')?.remove()
      return
    }

    let cancelled = false
    let spacer: HTMLDivElement | null = null

    if (isMobileAddItemViewport()) {
      document.getElementById('meal-add-item-scroll-room')?.remove()
      spacer = document.createElement('div')
      spacer.id = 'meal-add-item-scroll-room'
      spacer.setAttribute('aria-hidden', 'true')
      const vv = window.visualViewport
      const vh = vv?.height ?? window.innerHeight
      spacer.style.height = `${Math.max(Math.floor(vh - 100), 280)}px`
      spacer.style.pointerEvents = 'none'
      document.body.appendChild(spacer)
    }

    const focusAndPosition = () => {
      if (cancelled) return
      if (alwaysOpen) {
        // Don't steal focus on every meal open — only reposition when already focused.
        if (document.activeElement === inputRef.current) {
          positionAddItemInMobileViewport()
        }
        return
      }
      inputRef.current?.focus({ preventScroll: true })
      positionAddItemInMobileViewport()
    }

    const raf = window.requestAnimationFrame(focusAndPosition)
    const timeouts = [80, 220, 450, 700].map((ms) => window.setTimeout(focusAndPosition, ms))

    const onViewportChange = () => {
      if (!isMobileAddItemViewport()) {
        setPanelMaxHeight(null)
        return
      }
      if (spacer) {
        const vv = window.visualViewport
        const vh = vv?.height ?? window.innerHeight
        spacer.style.height = `${Math.max(Math.floor(vh - 100), 280)}px`
      }
      positionAddItemInMobileViewport()
    }

    const vv = window.visualViewport
    vv?.addEventListener('resize', onViewportChange)
    vv?.addEventListener('scroll', onViewportChange)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      timeouts.forEach((id) => window.clearTimeout(id))
      vv?.removeEventListener('resize', onViewportChange)
      vv?.removeEventListener('scroll', onViewportChange)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('orientationchange', onViewportChange)
      spacer?.remove()
      document.getElementById('meal-add-item-scroll-room')?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when open toggles
  }, [open, alwaysOpen])

  useEffect(() => {
    if (!open) return
    updateSuggestionPanelHeight()
  }, [open, query, suggestions.length])

  function clearQueryKeepFocus() {
    setQuery('')
    setHighlight(-1)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
      if (isMobileAddItemViewport()) positionAddItemInMobileViewport()
    })
  }

  function select(suggestion: ProductSuggestion) {
    // Preserve the resolved suggestion; parent stores selectedProductId + metadata.
    onAddProduct(mealId, suggestion, suggestion.title)
    clearQueryKeepFocus()
    if (!alwaysOpen) {
      setOpen(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      setHighlight(-1)
      if (!alwaysOpen) setOpen(false)
      return
    }
    if (!showPanel) {
      // Prevent Enter from submitting any parent form when no highlight.
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => {
        const next = i < 0 ? 0 : Math.min(i + 1, suggestions.length - 1)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlight >= 0) {
        const pick = suggestions[highlight]
        if (pick) select(pick)
      }
    }
  }

  if (!open && !alwaysOpen) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#ddd] bg-white px-4 py-3 md:px-5">
        <span className="text-[14px] leading-5 text-[#53565A]">Need anything else?</span>
        <button
          type="button"
          className="text-[14px] leading-5 text-[#333] underline decoration-solid underline-offset-[3px] disabled:opacity-50"
          disabled={disabled}
          aria-label={`Add item to ${mealTitle}`}
          onClick={() => setOpen(true)}
        >
          Add item
        </button>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      data-meal-add-item-focus
      className="border-b border-[#ddd] bg-white px-4 py-4 md:px-5"
    >
      <div className="mb-2 text-[14px] font-normal tracking-[2.8px] text-[#53565A]">
        ADD AN ITEM
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(-1)
          }}
          onFocus={() => {
            if (isMobileAddItemViewport()) positionAddItemInMobileViewport()
          }}
          onKeyDown={onKeyDown}
          placeholder="Search for an item"
          aria-label={`Search for an item to add to ${mealTitle}`}
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          className="w-full border border-[#a9a9a9] bg-[#fafafa] px-3 py-2.5 text-[16px] leading-6 text-[#333] placeholder:text-[#53565A] focus:outline focus:outline-2 focus:outline-[#154734] disabled:opacity-50"
        />
        <ProductAutocomplete
          query={trimmedQuery}
          suggestions={suggestions}
          highlightedIndex={highlight}
          open={showPanel}
          maxHeightPx={panelMaxHeight}
          onHighlight={setHighlight}
          onSelect={select}
          listId={listId}
        />
      </div>
      {showSearching ? (
        <p className="mt-2 text-[14px] leading-5 text-[#53565A]" role="status">
          Searching…
        </p>
      ) : null}
      {showNoResults ? (
        <p className="mt-2 text-[14px] leading-5 text-[#53565A]" role="status">
          No matching items found
        </p>
      ) : null}
      {showCatalogUnavailable ? (
        <p className="mt-2 text-[14px] leading-5 text-[#a6192e]" role="alert">
          Product search is unavailable. Check your connection and try again.
        </p>
      ) : null}
    </div>
  )
}
