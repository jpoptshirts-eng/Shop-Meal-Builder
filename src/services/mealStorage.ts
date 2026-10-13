/**
 * Browser localStorage persistence for Shop Meal Builder folders, meals, and items.
 * Keeps React components free of direct localStorage access for prototype state.
 */

export const MEAL_STORAGE_KEY = 'shop-meal-builder-folders'

/** Minimal shapes mirrored from App — keep storage layer decoupled from UI components. */
export type StoredIngredient = {
  id: string
  name: string
  needText: string
  price: number
  unitPrice: string
  qty: number
  selected: boolean
  image: string
  productType?: string
  matched?: boolean
  fallbackReason?: 'no-popmas-match'
  originalText?: string
  ingredientIntent?: string
  normalisedInput?: string
  canonicalIntent?: string
  selectedProductId?: string
  selectedProductCategoryId?: string
  selectedProductSubcategoryId?: string
}

export type StoredMealGroup = {
  id: string
  title: string
  cuisine?: string
  chipLabel?: string
  methodUrl?: string
  serves: string
  removed: boolean
  expanded: boolean
  ingredients: StoredIngredient[]
  calories?: string
  tags?: string[]
  preparationTime?: string
  cookTime?: string
  tips?: string
  rating?: number
  ratingCount?: number
  servings?: number
  allergenStatus?: 'none' | 'update'
}

export type StoredEssential = {
  id: string
  name: string
  price: number
  unitPrice: string
  qty: number
  selected: boolean
  image: string
  productType?: string
  originalText?: string
  normalisedInput?: string
  canonicalIntent?: string
  ingredientIntent?: string
  selectedProductId?: string
  selectedProductCategoryId?: string
  selectedProductSubcategoryId?: string
  manuallySelected?: boolean
}

export type StoredFolder = {
  id: string
  name: string
  mealGroups: StoredMealGroup[]
  essentials: StoredEssential[]
  generated: boolean
  hasLeftAndReturned?: boolean
}

function isFolder(entry: unknown): entry is StoredFolder {
  return (
    Boolean(entry) &&
    typeof entry === 'object' &&
    typeof (entry as StoredFolder).id === 'string' &&
    typeof (entry as StoredFolder).name === 'string' &&
    Array.isArray((entry as StoredFolder).mealGroups)
  )
}

function normaliseFolder(entry: StoredFolder): StoredFolder {
  return {
    ...entry,
    mealGroups: entry.mealGroups.map((meal) => ({
      ...meal,
      ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
    })),
    essentials: Array.isArray(entry.essentials) ? entry.essentials : [],
    generated: Boolean(entry.generated),
  }
}

export function getFolders(): StoredFolder[] {
  try {
    const raw = localStorage.getItem(MEAL_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFolder).map(normaliseFolder)
  } catch {
    return []
  }
}

export function saveFolders(folders: StoredFolder[]): void {
  localStorage.setItem(MEAL_STORAGE_KEY, JSON.stringify(folders))
}

export function createFolder(name: string, partial?: Partial<StoredFolder>): StoredFolder {
  const folder: StoredFolder = {
    id: partial?.id ?? `list-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    mealGroups: partial?.mealGroups ?? [],
    essentials: partial?.essentials ?? [],
    generated: partial?.generated ?? true,
    hasLeftAndReturned: partial?.hasLeftAndReturned,
  }
  const folders = [...getFolders(), folder]
  saveFolders(folders)
  return folder
}

export function updateFolder(id: string, patch: Partial<StoredFolder>): StoredFolder | null {
  const folders = getFolders()
  const index = folders.findIndex((f) => f.id === id)
  if (index < 0) return null
  const next = { ...folders[index], ...patch, id }
  folders[index] = normaliseFolder(next)
  saveFolders(folders)
  return folders[index]
}

export function deleteFolder(id: string): boolean {
  const folders = getFolders()
  const next = folders.filter((f) => f.id !== id)
  if (next.length === folders.length) return false
  saveFolders(next)
  return true
}

export function getMeals(folderId: string): StoredMealGroup[] {
  return getFolders().find((f) => f.id === folderId)?.mealGroups ?? []
}

export function createMeal(folderId: string, meal: StoredMealGroup): StoredMealGroup | null {
  const folders = getFolders()
  const index = folders.findIndex((f) => f.id === folderId)
  if (index < 0) return null
  folders[index] = {
    ...folders[index],
    mealGroups: [...folders[index].mealGroups, meal],
  }
  saveFolders(folders)
  return meal
}

export function updateMeal(
  folderId: string,
  mealId: string,
  patch: Partial<StoredMealGroup>,
): StoredMealGroup | null {
  const folders = getFolders()
  const folderIndex = folders.findIndex((f) => f.id === folderId)
  if (folderIndex < 0) return null
  const meals = folders[folderIndex].mealGroups
  const mealIndex = meals.findIndex((m) => m.id === mealId)
  if (mealIndex < 0) return null
  const nextMeal = { ...meals[mealIndex], ...patch, id: mealId }
  const nextMeals = [...meals]
  nextMeals[mealIndex] = nextMeal
  folders[folderIndex] = { ...folders[folderIndex], mealGroups: nextMeals }
  saveFolders(folders)
  return nextMeal
}

export function deleteMeal(folderId: string, mealId: string): boolean {
  const folders = getFolders()
  const folderIndex = folders.findIndex((f) => f.id === folderId)
  if (folderIndex < 0) return false
  const meals = folders[folderIndex].mealGroups
  const nextMeals = meals.filter((m) => m.id !== mealId)
  if (nextMeals.length === meals.length) return false
  folders[folderIndex] = { ...folders[folderIndex], mealGroups: nextMeals }
  saveFolders(folders)
  return true
}

export function addMealItem(
  folderId: string,
  mealId: string,
  item: StoredIngredient,
): StoredIngredient | null {
  const meal = getMeals(folderId).find((m) => m.id === mealId)
  if (!meal) return null
  return updateMeal(folderId, mealId, {
    ingredients: [...meal.ingredients, item],
  })
    ? item
    : null
}

export function updateMealItem(
  folderId: string,
  mealId: string,
  itemId: string,
  patch: Partial<StoredIngredient>,
): StoredIngredient | null {
  const meal = getMeals(folderId).find((m) => m.id === mealId)
  if (!meal) return null
  const ingredients = meal.ingredients.map((item) =>
    item.id === itemId ? { ...item, ...patch, id: itemId } : item,
  )
  const updated = ingredients.find((i) => i.id === itemId) ?? null
  if (!updated) return null
  updateMeal(folderId, mealId, { ingredients })
  return updated
}

export function removeMealItem(folderId: string, mealId: string, itemId: string): boolean {
  const meal = getMeals(folderId).find((m) => m.id === mealId)
  if (!meal) return false
  const ingredients = meal.ingredients.filter((i) => i.id !== itemId)
  if (ingredients.length === meal.ingredients.length) return false
  updateMeal(folderId, mealId, { ingredients })
  return true
}

export function saveNotes(
  folderId: string,
  mealId: string,
  notes: { preparationTime?: string; cookTime?: string; tips?: string },
): StoredMealGroup | null {
  return updateMeal(folderId, mealId, notes)
}

/** Clear Shop Meal Builder prototype storage keys (reset flow). */
export function clearMealBuilderStorage(): void {
  try {
    localStorage.removeItem('wtr-autosave-banner-dismissed')
    localStorage.removeItem(MEAL_STORAGE_KEY)
    localStorage.removeItem('shop-meal-builder-state')
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('shop-meal-builder-')) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    /* ignore */
  }
}
