import Papa from 'papaparse'

/** Normalised product from the Waitrose CSV catalogue files. */
export type CatalogueProduct = {
  id: string
  order: number | null
  imageUrl: string
  name: string
  size: string
  price: string
  numericPrice: number
  formattedPPU: string
  score: number | null
  recommendedQuantity: number | null
  category: string
  otherCategory1: string
  otherCategory2: string
  productType: string
  productTypeRecCount: number | null
  offers: string
  grouping: string
  type: string
  model: string
  sourceFile: string
  /** Present when the CSV row included item_id. */
  itemId?: string
}

export type CatalogueStatus = 'idle' | 'loading' | 'loaded' | 'error'

export type CatalogueState = {
  status: CatalogueStatus
  products: CatalogueProduct[]
  error: string | null
  loadedFiles: string[]
  failedFiles: string[]
}

const CSV_FILES = [
  'QS_POP222.csv',
  'QS_POP230.csv',
  'QS_POP256.csv',
  'QS_POP351.csv',
  'QS_POP400.csv',
  'QS_POP529.csv',
  'Table-POP038.csv',
  'Table-POP072.csv',
  'Table-POP074.csv',
] as const

const CSV_BASE = '/data/products'

let cataloguePromise: Promise<CatalogueProduct[]> | null = null
let cachedProducts: CatalogueProduct[] | null = null
let lastState: CatalogueState = {
  status: 'idle',
  products: [],
  error: null,
  loadedFiles: [],
  failedFiles: [],
}

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key]
    if (direct != null && String(direct).trim() !== '') return String(direct).trim()
    const lower = key.toLowerCase()
    for (const [rk, rv] of Object.entries(row)) {
      if (rk.toLowerCase() === lower && rv != null && String(rv).trim() !== '') {
        return String(rv).trim()
      }
    }
  }
  return ''
}

function parseNumericPrice(raw: string): number {
  if (!raw) return 0
  const s = raw.replace(/,/g, '').replace(/\s/g, '').trim()
  if (s.startsWith('£')) return Number.parseFloat(s.slice(1)) || 0
  if (s.endsWith('p')) return (Number.parseFloat(s.slice(0, -1)) || 0) / 100
  return Number.parseFloat(s) || 0
}

function parseOptionalNumber(raw: string): number | null {
  if (!raw) return null
  const n = Number.parseFloat(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function completenessScore(product: CatalogueProduct): number {
  let score = 0
  if (product.itemId) score += 40
  if (product.imageUrl.startsWith('http')) score += 15
  if (product.name) score += 10
  if (product.size) score += 5
  if (product.price) score += 5
  if (product.formattedPPU) score += 5
  if (product.offers) score += 5
  if (product.category) score += 3
  if (product.productType) score += 3
  if (product.otherCategory1) score += 2
  if (product.otherCategory2) score += 2
  if (product.score != null) score += 2
  return score
}

function dedupeKey(product: CatalogueProduct): string {
  if (product.itemId) return `id:${product.itemId}`
  if (product.imageUrl.startsWith('http')) return `img:${product.imageUrl.toLowerCase()}`
  const name = product.name.toLowerCase().replace(/\s+/g, ' ').trim()
  const size = product.size.toLowerCase().replace(/\s+/g, ' ').trim()
  return `name:${name}|${size}`
}

function mapRow(
  row: Record<string, unknown>,
  sourceFile: string,
  rowIndex: number,
): CatalogueProduct | null {
  const name = cell(row, 'Name')
  if (!name) return null

  const itemId = cell(row, 'item_id', 'itemId', 'Item_id')
  const imageUrl = cell(row, 'imageUrl', 'ImageUrl', 'image_url')
  const orderRaw = cell(row, 'Order', 'Order_num', 'order_num', 'order')
  const size = cell(row, 'Size')
  const price = cell(row, 'Price')
  const formattedPPU = cell(row, 'Formatted PPU', 'Formatted_PPU', 'formattedPPU')
  const scoreRaw = cell(row, 'score', 'Score')
  const qtyRaw = cell(row, 'Recommended Quantity', 'Recommended_Quantity')
  const category = cell(row, 'Category')
  const otherCategory1 = cell(row, 'Other Category 1', 'Other_Category_1')
  const otherCategory2 = cell(row, 'Other Category 2', 'Other_Category_2')
  const productType = cell(row, 'Product Type', 'Product_Type')
  const productTypeRecCountRaw = cell(row, 'Product Type Rec Count', 'Product_Type_Rec_Count')
  const offers = cell(row, 'Offers')
  const grouping = cell(row, 'Grouping')
  const type = cell(row, 'Type')
  const model = cell(row, 'Model')

  const id = itemId
    ? itemId
    : imageUrl.startsWith('http')
      ? `img:${imageUrl}`
      : `${sourceFile}#${rowIndex}`

  return {
    id,
    order: parseOptionalNumber(orderRaw),
    imageUrl,
    name,
    size,
    price,
    numericPrice: parseNumericPrice(price),
    formattedPPU,
    score: parseOptionalNumber(scoreRaw),
    recommendedQuantity: parseOptionalNumber(qtyRaw),
    category,
    otherCategory1,
    otherCategory2,
    productType,
    productTypeRecCount: parseOptionalNumber(productTypeRecCountRaw),
    offers,
    grouping,
    type,
    model,
    sourceFile,
    itemId: itemId || undefined,
  }
}

function deduplicate(products: CatalogueProduct[]): CatalogueProduct[] {
  const byKey = new Map<string, CatalogueProduct>()
  for (const product of products) {
    const key = dedupeKey(product)
    const existing = byKey.get(key)
    if (!existing || completenessScore(product) > completenessScore(existing)) {
      byKey.set(key, product)
    }
  }
  // Secondary pass: same name+size under different keys (item_id vs imageUrl).
  const byNameSize = new Map<string, CatalogueProduct>()
  for (const product of byKey.values()) {
    const ns = `${product.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${product.size
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()}`
    const existing = byNameSize.get(ns)
    if (!existing || completenessScore(product) > completenessScore(existing)) {
      byNameSize.set(ns, product)
    }
  }
  return Array.from(byNameSize.values())
}

async function loadOneCsv(fileName: string): Promise<{
  products: CatalogueProduct[]
  failed: boolean
}> {
  const url = `${CSV_BASE}/${encodeURIComponent(fileName)}`
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`[productCatalogue] Failed to load ${fileName}: HTTP ${response.status}`)
      return { products: [], failed: true }
    }
    const text = await response.text()
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
    })
    if (parsed.errors.length > 0) {
      console.warn(`[productCatalogue] Parse warnings for ${fileName}:`, parsed.errors.slice(0, 3))
    }
    const products: CatalogueProduct[] = []
    parsed.data.forEach((row, index) => {
      try {
        const mapped = mapRow(row, fileName, index)
        if (mapped) products.push(mapped)
      } catch (err) {
        console.warn(`[productCatalogue] Skipping malformed row in ${fileName}#${index}`, err)
      }
    })
    return { products, failed: false }
  } catch (err) {
    console.warn(`[productCatalogue] Failed to load ${fileName}`, err)
    return { products: [], failed: true }
  }
}

async function loadAllCsvFiles(): Promise<CatalogueProduct[]> {
  lastState = {
    status: 'loading',
    products: cachedProducts ?? [],
    error: null,
    loadedFiles: [],
    failedFiles: [],
  }

  const loadedFiles: string[] = []
  const failedFiles: string[] = []
  const all: CatalogueProduct[] = []

  const results = await Promise.all(CSV_FILES.map((file) => loadOneCsv(file)))
  results.forEach((result, i) => {
    const file = CSV_FILES[i]
    if (result.failed) failedFiles.push(file)
    else loadedFiles.push(file)
    all.push(...result.products)
  })

  const products = deduplicate(all)

  if (products.length === 0) {
    const error =
      failedFiles.length === CSV_FILES.length
        ? 'Could not load any product CSV files.'
        : 'Product catalogue is empty after loading CSV files.'
    lastState = {
      status: 'error',
      products: [],
      error,
      loadedFiles,
      failedFiles,
    }
    throw new Error(error)
  }

  lastState = {
    status: 'loaded',
    products,
    error: failedFiles.length > 0 ? `Some CSV files failed: ${failedFiles.join(', ')}` : null,
    loadedFiles,
    failedFiles,
  }
  cachedProducts = products
  return products
}

/** Load and cache the combined product catalogue (once per session). */
export function loadProductCatalogue(): Promise<CatalogueProduct[]> {
  if (cachedProducts) return Promise.resolve(cachedProducts)
  if (!cataloguePromise) {
    cataloguePromise = loadAllCsvFiles().catch((err) => {
      cataloguePromise = null
      throw err
    })
  }
  return cataloguePromise
}

export function getCatalogueState(): CatalogueState {
  return lastState
}

export function getCachedProducts(): CatalogueProduct[] {
  return cachedProducts ?? []
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

const STAPLE_INTENT: Record<string, { prefer: string[]; exclude: string[] }> = {
  milk: {
    prefer: ['semi skimmed', 'skimmed', 'whole milk', 'fresh milk', 'oat milk', 'soya', 'almond'],
    exclude: ['choc', 'chocolate', 'cookie', 'biscuit', 'digestive', 'conditioner', 'shampoo', 'soap', 'cream', 'pancake'],
  },
  eggs: {
    prefer: ['free range', 'large eggs', 'medium eggs', 'essential'],
    exclude: ['mini eggs', 'chocolate', 'picnic', 'scotch', 'noodle', 'pasta', 'mayonnaise'],
  },
  egg: {
    prefer: ['free range', 'large eggs', 'medium eggs', 'essential'],
    exclude: ['mini eggs', 'chocolate', 'picnic', 'scotch', 'noodle', 'pasta', 'mayonnaise'],
  },
}

function rankProduct(query: string, product: CatalogueProduct): number {
  const q = normalize(query)
  if (!q) return 0

  const name = normalize(product.name)
  const nameTokens = new Set(name.split(' ').filter(Boolean))
  const productType = normalize(product.productType)
  const category = normalize(product.category)
  const other1 = normalize(product.otherCategory1)
  const other2 = normalize(product.otherCategory2)
  const haySecondary = `${productType} ${category} ${other1} ${other2}`

  let score = 0

  if (name === q) score = 1000
  else if (name.startsWith(q)) score = 800
  else if (nameTokens.has(q) || name.split(' ').some((t) => t === q)) score = 720
  else if (name.includes(q)) score = 600
  else if (productType.includes(q)) score = 400
  else if (category.includes(q)) score = 300
  else if (other1.includes(q) || other2.includes(q)) score = 200
  else {
    // Token overlap on name (highest weight) then secondary fields.
    const tokens = q.split(' ').filter((t) => t.length > 1)
    if (tokens.length === 0) return 0
    let tokenHits = 0
    for (const token of tokens) {
      if (nameTokens.has(token) || name.includes(token)) tokenHits += 3
      else if (productType.includes(token)) tokenHits += 1
      else if (category.includes(token) || other1.includes(token) || other2.includes(token)) {
        tokenHits += 1
      }
    }
    if (tokenHits === 0) return 0
    score = 100 + tokenHits * 20
  }

  const firstToken = q.split(' ')[0] ?? ''
  const intent = STAPLE_INTENT[firstToken]
  if (intent) {
    for (const bad of intent.exclude) {
      if (name.includes(bad)) {
        score -= 350
        break
      }
    }
    for (const good of intent.prefer) {
      if (name.includes(good) || haySecondary.includes(good)) {
        score += 80
        break
      }
    }
  }

  // Secondary ranking from CSV score / order (higher CSV score = better).
  if (product.score != null) score += Math.min(50, product.score * 40)
  if (product.order != null && product.order > 0) score += Math.max(0, 20 - Math.min(product.order, 20))

  return score
}

/** Search the in-memory catalogue. Safe while loading (returns []). */
export function searchCatalogue(
  query: string,
  limit = 8,
  products: CatalogueProduct[] = cachedProducts ?? [],
): CatalogueProduct[] {
  const q = query.trim()
  if (!q || products.length === 0) return []

  const scored = products
    .map((product) => ({ product, score: rankProduct(q, product) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map((entry) => entry.product)
}

export function findProductById(
  id: string,
  products: CatalogueProduct[] = cachedProducts ?? [],
): CatalogueProduct | undefined {
  return products.find((p) => p.id === id)
}

/** Reset cache — used by tests. */
export function resetProductCatalogueCache(): void {
  cataloguePromise = null
  cachedProducts = null
  lastState = {
    status: 'idle',
    products: [],
    error: null,
    loadedFiles: [],
    failedFiles: [],
  }
}
