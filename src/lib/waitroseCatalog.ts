import {
  loadProductCatalogue,
  type CatalogueProduct,
} from '../services/productCatalogue'

export type WaitroseCatalogItem = {
  id: string
  name: string
  price: number
  unitPrice: string
  imageUrl: string
  productUrl: string
  productType?: string
  /** POPMAS Range (e.g. 'Organic', 'Essentials', 'No 1 Range'). */
  range?: string
  /** POPMAS Grouping (optional metadata for future refinement). */
  grouping?: string
  /** POPMAS Type (optional metadata for future refinement). */
  popmasType?: string
  /** Optional normalized organic flag supplied by prototype/catalog data. */
  organic?: boolean
  /** Active promotional copy from Offers (e.g. "Was £2.00 Now £1.50", "Save Third"). */
  offers?: string
  /** Raw size string from the CSV Size column. */
  size?: string
  /** Display price string as in the CSV (e.g. "£2.45"). */
  displayPrice?: string
}

export type WaitroseCatalogPayload = {
  source: string
  fetchedAt: string
  count: number
  products: WaitroseCatalogItem[]
}

export type BuildShopCatalogPayload = {
  primary: WaitroseCatalogPayload
  fallback: WaitroseCatalogPayload | null
}

export type EssentialFromCatalog = {
  id: string
  name: string
  price: number
  unitPrice: string
  qty: number
  selected: boolean
  image: string
}

/** Resolve a product imageUrl into a displayable thumbnail value. */
export function catalogProductImage(imageUrl: string | null | undefined): string {
  const url = imageUrl?.trim() ?? ''
  return url.startsWith('http') ? url : '🛒'
}

export function catalogueProductToWaitroseItem(product: CatalogueProduct): WaitroseCatalogItem {
  const size = product.size.trim()
  const displayName = size ? `${product.name} (${size})` : product.name
  const unit = product.formattedPPU.trim()
  const offers = product.offers.trim() || undefined
  return {
    id: product.id,
    name: displayName,
    price: Math.max(0, product.numericPrice),
    unitPrice: unit || size || '—',
    imageUrl: product.imageUrl.trim(),
    productUrl: '',
    productType: product.productType.trim() || undefined,
    grouping: product.grouping.trim() || undefined,
    popmasType: product.type.trim() || undefined,
    offers,
    size: size || undefined,
    displayPrice: product.price || undefined,
  }
}

/**
 * Load the Waitrose product catalogue from static CSV files under /public/data/products.
 * Cached in memory by the productCatalogue service after the first successful load.
 */
export async function loadWaitroseGroceriesCatalog(): Promise<WaitroseCatalogPayload> {
  const products = await loadProductCatalogue()
  return {
    source: 'csv:/data/products',
    fetchedAt: new Date().toISOString(),
    count: products.length,
    products: products.map(catalogueProductToWaitroseItem),
  }
}

/**
 * Build-shop / meal-builder retrieval: CSV catalogue is the sole product source.
 */
export async function loadCatalogForBuildShop(): Promise<BuildShopCatalogPayload> {
  const primary = await loadWaitroseGroceriesCatalog()
  return { primary, fallback: null }
}

/** Map catalog rows into essentials. Large lists are capped only by maxItems. */
export function mapWaitroseCatalogToEssentials(
  products: WaitroseCatalogItem[],
  maxItems = 4000,
): EssentialFromCatalog[] {
  return products.slice(0, maxItems).map((p, i) => ({
    id: String(p.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || `row-${i}`,
    name: p.name,
    price: Math.max(0, p.price),
    unitPrice: p.unitPrice?.trim() || '—',
    qty: 1,
    selected: true,
    image: catalogProductImage(p.imageUrl),
  }))
}
