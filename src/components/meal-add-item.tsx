import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ProductAutocomplete } from './product-autocomplete'
import type { ProductSuggestion } from '../lib/inputExperience'
import { searchProductSuggestions } from '../lib/productAutocomplete'
import type { WaitroseCatalogItem } from '../lib/waitroseCatalog'
import { getShopListLinesFromUserInput } from '../lib/parseShopList'

type Props = {
  mealId: string
  mealTitle: string
  catalog: WaitroseCatalogItem[]
  disabled?: boolean
  catalogLoading?: boolean
  extracting?: boolean
  /** When true, search is always visible (Meal Builder primary interaction). */
  alwaysOpen?: boolean
  onAddProduct: (mealId: string, suggestion: ProductSuggestion, query: string) => void
  /** OCR / image extraction for photo uploads — returns ingredient lines for this meal. */
  onExtractLinesFromFile: (file: File) => Promise<string[]>
  /** Confirm reviewed lines into the current meal (matched like manual autosuggest adds). */
  onAddLines: (mealId: string, lines: string[]) => void
}

const MIN_QUERY_CHARS = 2

function isMobileAddItemViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

function stickyHeaderOffset(): number {
  const header = document.querySelector('[data-sticky-site-header]')
  return header instanceof HTMLElement ? Math.ceil(header.getBoundingClientRect().height) : 0
}

function IconUploadImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="13" height="11.5" stroke="#333" strokeWidth="1" />
      <circle cx="4.8" cy="5.3" r="1.15" stroke="#333" strokeWidth="1" />
      <path
        d="M2.5 12.7L5.9 9.1 8.05 11.2 11 7.85 13.5 12.7"
        stroke="#333"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconTakePhoto() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.2 3.25h1.05l.55-1h2.4l.55 1H10.8c.94 0 1.7.76 1.7 1.7v6.1c0 .94-.76 1.7-1.7 1.7H5.2c-.94 0-1.7-.76-1.7-1.7v-6.1c0-.94.76-1.7 1.7-1.7Z"
        stroke="#333"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.1" r="2.15" stroke="#333" strokeWidth="1" />
    </svg>
  )
}

function IconBrowseFiles() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.25h3.2l1.1 1.2H13.5v6.3c0 .66-.54 1.2-1.2 1.2H3.7c-.66 0-1.2-.54-1.2-1.2V4.25Z"
        stroke="#333"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function isTextListFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/csv' ||
    file.type === 'text/csv' ||
    name.endsWith('.txt') ||
    name.endsWith('.csv') ||
    name.endsWith('.tsv')
  )
}

/**
 * Shopping Lists POPMAS autocomplete adapted for Shop Meal Builder.
 * Selecting a suggestion immediately adds the item — no separate Add button.
 * Secondary path: add from photo / list with review before confirming into this meal.
 */
export function MealAddItem({
  mealId,
  mealTitle,
  catalog,
  disabled = false,
  catalogLoading = false,
  extracting = false,
  alwaysOpen = true,
  onAddProduct,
  onExtractLinesFromFile,
  onAddLines,
}: Props) {
  const [open, setOpen] = useState(alwaysOpen)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)
  const [panelMaxHeight, setPanelMaxHeight] = useState<number | null>(null)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [localExtracting, setLocalExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [reviewLines, setReviewLines] = useState<string[] | null>(null)
  const [reviewSelected, setReviewSelected] = useState<boolean[]>([])
  const listId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploadMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const browseInputRef = useRef<HTMLInputElement | null>(null)

  const busy = disabled || extracting || localExtracting
  const trimmedQuery = query.trim()
  const queryReady = trimmedQuery.length >= MIN_QUERY_CHARS

  const suggestions = useMemo(
    () => (queryReady ? searchProductSuggestions(trimmedQuery, catalog, 8) : []),
    [trimmedQuery, queryReady, catalog],
  )

  const showPanel = open && queryReady && suggestions.length > 0 && !reviewLines
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

  useEffect(() => {
    if (!uploadMenuOpen) return
    function onDocPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target
      if (!(target instanceof Node)) return
      if (uploadMenuButtonRef.current?.contains(target)) return
      const menu = document.querySelector('[data-meal-upload-menu]')
      if (menu?.contains(target)) return
      setUploadMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('touchstart', onDocPointerDown)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('touchstart', onDocPointerDown)
    }
  }, [uploadMenuOpen])

  function clearQueryKeepFocus() {
    setQuery('')
    setHighlight(-1)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
      if (isMobileAddItemViewport()) positionAddItemInMobileViewport()
    })
  }

  function select(suggestion: ProductSuggestion) {
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
      setUploadMenuOpen(false)
      if (!alwaysOpen) setOpen(false)
      return
    }
    if (!showPanel) {
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

  function openUploadSource(kind: 'camera' | 'photo' | 'browse') {
    setUploadMenuOpen(false)
    window.setTimeout(() => {
      const input =
        kind === 'camera'
          ? cameraInputRef.current
          : kind === 'photo'
            ? photoInputRef.current
            : browseInputRef.current
      try {
        input?.click()
      } catch {
        browseInputRef.current?.click()
      }
    }, 0)
  }

  async function processUploadedFile(file?: File) {
    if (!file) return
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (browseInputRef.current) browseInputRef.current.value = ''
    setUploadMenuOpen(false)
    setExtractError('')
    setLocalExtracting(true)
    try {
      let lines: string[] = []
      if (isTextListFile(file)) {
        const text = await file.text()
        lines = getShopListLinesFromUserInput(text)
      } else {
        lines = await onExtractLinesFromFile(file)
      }
      const cleaned = lines.map((l) => l.trim()).filter((l) => l.length > 0)
      if (cleaned.length === 0) {
        setExtractError(
          "We couldn't read enough from this file. Try another image or list, or search above.",
        )
        return
      }
      setReviewLines(cleaned)
      setReviewSelected(cleaned.map(() => true))
    } catch (err) {
      setExtractError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "We couldn't read enough from this file. Try another image or list, or search above.",
      )
    } finally {
      setLocalExtracting(false)
    }
  }

  function cancelReview() {
    setReviewLines(null)
    setReviewSelected([])
    setExtractError('')
  }

  function confirmReview() {
    if (!reviewLines) return
    const confirmed = reviewLines
      .filter((_, i) => reviewSelected[i])
      .map((line) => line.trim())
      .filter(Boolean)
    if (confirmed.length === 0) {
      setExtractError('Select at least one item to add to this meal.')
      return
    }
    onAddLines(mealId, confirmed)
    cancelReview()
    clearQueryKeepFocus()
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
          disabled={busy || Boolean(reviewLines)}
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

      {!reviewLines ? (
        <div className="relative mt-3">
          <button
            ref={uploadMenuButtonRef}
            type="button"
            data-meal-upload-menu-trigger
            className="text-[14px] leading-5 text-[#333] underline decoration-solid underline-offset-[3px] disabled:opacity-50"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={uploadMenuOpen}
            onClick={() => setUploadMenuOpen((v) => !v)}
          >
            + Add from photo or list
          </button>

          {uploadMenuOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/30 sm:hidden"
                aria-hidden="true"
                onClick={() => {
                  setUploadMenuOpen(false)
                  uploadMenuButtonRef.current?.focus()
                }}
              />
              <div
                data-meal-upload-menu
                role="menu"
                aria-label="Add from photo or list"
                className="fixed inset-x-0 bottom-0 z-50 border border-[#ddd] border-b-0 bg-white px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0px_-2px_8px_rgba(0,0,0,0.12)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[260px] sm:border-b sm:px-0 sm:pb-1 sm:pt-1 sm:shadow-[0px_2px_8px_rgba(0,0,0,0.12)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-[16px] leading-6 text-[#333] hover:bg-[#f5f5f5] focus:bg-[#f5f5f5] focus:outline-none"
                  onClick={() => openUploadSource('camera')}
                >
                  <span className="inline-flex shrink-0" aria-hidden="true">
                    <IconTakePhoto />
                  </span>
                  <span>{isMobileAddItemViewport() ? 'Take photo' : 'Take a photo'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-[16px] leading-6 text-[#333] hover:bg-[#f5f5f5] focus:bg-[#f5f5f5] focus:outline-none"
                  onClick={() => openUploadSource('photo')}
                >
                  <span className="inline-flex shrink-0" aria-hidden="true">
                    <IconUploadImage />
                  </span>
                  <span>{isMobileAddItemViewport() ? 'Choose photo' : 'Upload a photo'}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-[16px] leading-6 text-[#333] hover:bg-[#f5f5f5] focus:bg-[#f5f5f5] focus:outline-none"
                  onClick={() => openUploadSource('browse')}
                >
                  <span className="inline-flex shrink-0" aria-hidden="true">
                    <IconBrowseFiles />
                  </span>
                  <span>{isMobileAddItemViewport() ? 'Browse files' : 'Upload a list'}</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void processUploadedFile(e.target.files?.[0])}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,image/*"
        className="hidden"
        onChange={(e) => void processUploadedFile(e.target.files?.[0])}
      />
      <input
        ref={browseInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,image/*,text/plain,text/csv,.txt,.csv,.tsv"
        className="hidden"
        onChange={(e) => void processUploadedFile(e.target.files?.[0])}
      />

      {busy && !reviewLines ? (
        <p className="mt-2 text-[14px] leading-5 text-[#53565A]" role="status">
          {localExtracting || extracting ? 'Reading your list…' : null}
        </p>
      ) : null}

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
      {extractError ? (
        <p className="mt-2 text-[14px] leading-5 text-[#a6192e]" role="alert">
          {extractError}
        </p>
      ) : null}

      {reviewLines ? (
        <div className="mt-4 border border-[#ddd] bg-[#fafafa] p-3">
          <p className="text-[14px] font-normal leading-5 text-[#333]">
            Review items for {mealTitle}
          </p>
          <p className="mt-1 text-[14px] leading-5 text-[#53565A]">
            Confirm the items to add to this meal. Uncheck anything you do not want.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {reviewLines.map((line, index) => (
              <li key={`${line}-${index}`} className="flex items-start gap-3">
                <input
                  id={`meal-review-line-${index}`}
                  type="checkbox"
                  checked={Boolean(reviewSelected[index])}
                  onChange={() =>
                    setReviewSelected((prev) =>
                      prev.map((v, i) => (i === index ? !v : v)),
                    )
                  }
                  className="mt-1 size-4 shrink-0 accent-[#333]"
                />
                <input
                  type="text"
                  value={line}
                  aria-label={`Item ${index + 1}`}
                  onChange={(e) => {
                    const next = e.target.value
                    setReviewLines((prev) =>
                      prev ? prev.map((l, i) => (i === index ? next : l)) : prev,
                    )
                  }}
                  className="min-w-0 flex-1 border border-[#a9a9a9] bg-white px-2 py-1.5 text-[16px] leading-6 text-[#333] focus:outline focus:outline-2 focus:outline-[#154734]"
                />
                <button
                  type="button"
                  className="shrink-0 pt-1 text-[14px] leading-5 text-[#53565A] underline"
                  onClick={() => {
                    setReviewLines((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
                    setReviewSelected((prev) => prev.filter((_, i) => i !== index))
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="border border-[#333] bg-white px-5 py-2 text-[16px] text-[#333]"
              onClick={cancelReview}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bg-[#53565A] px-5 py-2 text-[16px] text-white disabled:bg-[#eeeeee] disabled:text-[#a9a9a9]"
              disabled={!reviewSelected.some(Boolean)}
              onClick={confirmReview}
            >
              Add to meal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
