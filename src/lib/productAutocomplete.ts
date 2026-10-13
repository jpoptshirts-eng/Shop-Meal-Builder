import { ALL_MOCK_SUGGESTIONS } from '../data/productSuggestions'
import type { ProductSuggestion } from './inputExperience'
import {
  getCachedProducts,
  searchCatalogue,
  type CatalogueProduct,
} from '../services/productCatalogue'
import { catalogProductImage, type WaitroseCatalogItem } from './waitroseCatalog'

const SOURCE_RANK: Record<ProductSuggestion['source'], number> = {
  favourite: 0,
  'previous-purchase': 1,
  catalogue: 2,
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function scoreMockSuggestion(suggestion: ProductSuggestion, query: string): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) return 0
  const hay = `${suggestion.title} ${suggestion.size}`.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length >= 4 ? 12 : 8
  }
  if (hay.startsWith(query.toLowerCase())) score += 20
  score -= SOURCE_RANK[suggestion.source] * 2
  return score
}

function catalogToSuggestion(hit: WaitroseCatalogItem): ProductSuggestion {
  const size =
    hit.size?.trim() ||
    (hit.name.match(/\([^)]+\)\s*$/)?.[0]?.replace(/[()]/g, '') ?? '') ||
    ''
  return {
    id: `catalog-${hit.id}`,
    title: hit.name.replace(/\s*\([^)]+\)\s*$/, '').trim() || hit.name,
    size,
    image: catalogProductImage(hit.imageUrl),
    price: hit.price,
    unitPrice: hit.unitPrice,
    source: 'catalogue',
  }
}

function waitroseItemFromCatalogueProduct(product: CatalogueProduct): WaitroseCatalogItem {
  const size = product.size.trim()
  return {
    id: product.id,
    name: size ? `${product.name} (${size})` : product.name,
    price: Math.max(0, product.numericPrice),
    unitPrice: product.formattedPPU.trim() || size || '—',
    imageUrl: product.imageUrl.trim(),
    productUrl: '',
    productType: product.productType.trim() || undefined,
    grouping: product.grouping.trim() || undefined,
    popmasType: product.type.trim() || undefined,
    offers: product.offers.trim() || undefined,
    size: size || undefined,
    displayPrice: product.price || undefined,
  }
}

/**
 * Map WaitroseCatalogItem rows back toward catalogue search fields.
 * Used when the UI already holds WaitroseCatalogItem[] in memory.
 */
function toSearchableCatalogueShape(products: WaitroseCatalogItem[]): CatalogueProduct[] {
  return products.map((p) => {
    const size =
      p.size?.trim() ||
      (p.name.match(/\([^)]+\)\s*$/)?.[0]?.replace(/[()]/g, '') ?? '') ||
      ''
    const name = p.name.replace(/\s*\([^)]+\)\s*$/, '').trim() || p.name
    return {
      id: p.id,
      order: null,
      imageUrl: p.imageUrl,
      name,
      size,
      price: p.displayPrice ?? (p.price > 0 ? `£${p.price.toFixed(2)}` : ''),
      numericPrice: p.price,
      formattedPPU: p.unitPrice === '—' ? '' : p.unitPrice,
      score: null,
      recommendedQuantity: null,
      category: '',
      otherCategory1: '',
      otherCategory2: '',
      productType: p.productType ?? '',
      productTypeRecCount: null,
      offers: p.offers ?? '',
      grouping: p.grouping ?? '',
      type: p.popmasType ?? '',
      model: '',
      sourceFile: 'in-memory',
      itemId: undefined,
    }
  })
}

/** Enrich a suggestion with live catalogue name, price, and image when available. */
export function enrichSuggestionFromCatalog(
  suggestion: ProductSuggestion,
  catalogProducts: WaitroseCatalogItem[],
  query = '',
): ProductSuggestion {
  if (catalogProducts.length === 0) return suggestion

  if (suggestion.id.startsWith('catalog-')) {
    const catalogKey = suggestion.id.slice('catalog-'.length)
    const hit = catalogProducts.find((p) => p.id === catalogKey)
    return hit ? catalogToSuggestion(hit) : suggestion
  }

  const q = query.trim() || `${suggestion.title} ${suggestion.size}`
  const hits = searchCatalogue(q, 6, toSearchableCatalogueShape(catalogProducts))
  const first = hits[0]
  if (!first) return suggestion
  return {
    ...catalogToSuggestion(waitroseItemFromCatalogueProduct(first)),
    id: suggestion.id,
    source: suggestion.source,
  }
}

function resolveSearchPool(catalogProducts: WaitroseCatalogItem[]): CatalogueProduct[] {
  const cached = getCachedProducts()
  if (cached.length > 0) return cached
  if (catalogProducts.length > 0) return toSearchableCatalogueShape(catalogProducts)
  return []
}

/**
 * Autosuggest against the CSV-backed Waitrose catalogue.
 * Prefers name matches over category matches; returns up to `limit` results.
 */
export function searchProductSuggestions(
  query: string,
  catalogProducts: WaitroseCatalogItem[] = [],
  limit = 8,
): ProductSuggestion[] {
  const q = query.trim()
  if (q.length < 1) return []

  const pool = resolveSearchPool(catalogProducts)
  if (pool.length > 0) {
    const hits = searchCatalogue(q, limit, pool)
    if (hits.length > 0) {
      return hits.map((hit) => catalogToSuggestion(waitroseItemFromCatalogueProduct(hit)))
    }
  }

  // Fallback to local mock suggestions only when the catalogue has no hits yet.
  return ALL_MOCK_SUGGESTIONS.map((s) => ({
    suggestion: s,
    score: scoreMockSuggestion(s, q),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.suggestion)
}

export function searchAmbiguousOptions(
  term: string,
  catalogProducts: WaitroseCatalogItem[] = [],
): ProductSuggestion[] {
  return searchProductSuggestions(term, catalogProducts, 3)
}
