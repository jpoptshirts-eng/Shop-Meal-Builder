import {
  findMealRecipeForLine,
  MEAL_RECIPES,
  type MealRecipe,
  type RecipeIngredient,
} from '../data/mealRecipes'
import {
  findWaitroseRecipeReference,
  type WaitroseRecipeReference,
} from '../data/waitroseRecipeReferences'

export type ResolvedMealIngredients = {
  status: 'resolved'
  mealName: string
  recipe: MealRecipe
  ingredients: RecipeIngredient[]
  /** Waitrose recipe page when resolved from the recipe-reference registry. */
  sourceUrl?: string
}

export type UnresolvedMealIngredients = {
  status: 'unresolved'
  mealName: string
  reason: 'no-recipe'
}

export type MealIngredientResolution = ResolvedMealIngredients | UnresolvedMealIngredients

function normalizeMealKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u2019\u2018']/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function waitroseRefToMealRecipe(ref: WaitroseRecipeReference): MealRecipe {
  return {
    id: ref.id,
    chipLabel: ref.chipLabel,
    fullName: ref.canonicalName,
    cuisine: ref.cuisine,
    ingredients: ref.ingredients,
    methodUrl: ref.sourceUrl,
  }
}

function toResolved(
  recipe: MealRecipe,
  sourceUrl?: string,
): ResolvedMealIngredients {
  return {
    status: 'resolved',
    mealName: recipe.fullName,
    recipe,
    ingredients: recipe.ingredients,
    sourceUrl: sourceUrl ?? recipe.methodUrl,
  }
}

/** Extra broad-intent → known recipe aliases when fuzzy title matching is weak. */
const MEAL_INTENT_ALIASES: Array<{ patterns: RegExp[]; resolveAs: string }> = [
  {
    patterns: [
      /^sunday\s+roast$/,
      /^roast\s+dinner$/,
      /^sunday\s+dinner$/,
      /^sunday\s+lunch$/,
      /^roast\s+chicken\s+(dinner|sunday\s+dinner)$/,
    ],
    resolveAs: 'Sunday Roast',
  },
  {
    patterns: [/^fish\s*(and|&|n)?\s*chips$/, /^fish\s+with\s+chips$/],
    resolveAs: 'Fish & Chips',
  },
  {
    patterns: [/^spag(\s*bol|\s*bolognese)?$/, /^spaghetti\s+bolognese$/],
    resolveAs: 'Spaghetti Bolognese',
  },
  {
    patterns: [/^tacos?$/, /^chicken\s+tacos?$/],
    resolveAs: 'Chicken Tacos',
  },
  {
    patterns: [/^stir[\s-]?fry$/, /^veg(etable)?\s+stir[\s-]?fry$/],
    resolveAs: 'Vegetable Stir Fry',
  },
  {
    patterns: [/^lasagne$/, /^lasagna$/],
    resolveAs: 'Lasagne',
  },
]

function resolveViaIntentAlias(key: string): MealIngredientResolution | null {
  for (const entry of MEAL_INTENT_ALIASES) {
    if (!entry.patterns.some((re) => re.test(key))) continue
    const waitrose = findWaitroseRecipeReference(entry.resolveAs)
    if (waitrose && waitrose.ingredients.length > 0) {
      return toResolved(waitroseRefToMealRecipe(waitrose), waitrose.sourceUrl)
    }
    const recipe = findMealRecipeForLine(entry.resolveAs)
    if (recipe && recipe.ingredients.length > 0) return toResolved(recipe)
  }
  return null
}

/**
 * Meal title → Waitrose recipe reference → canonical ingredient requirements.
 * POPMAS must not be queried until this returns a resolved ingredient list.
 *
 * Tiered fallback: exact Waitrose ref → curated template → intent alias → fuzzy.
 */
export function resolveMealIngredients(mealName: string): MealIngredientResolution {
  const trimmed = mealName.trim()
  if (!trimmed) {
    return { status: 'unresolved', mealName: '', reason: 'no-recipe' }
  }

  const key = normalizeMealKey(trimmed)

  // 1) Preferred: Waitrose recipe-reference registry (exact + alias)
  const waitrose = findWaitroseRecipeReference(trimmed)
  if (waitrose && waitrose.ingredients.length > 0) {
    return toResolved(waitroseRefToMealRecipe(waitrose), waitrose.sourceUrl)
  }

  // 2) Existing curated meal recipe templates
  const fromExact = findMealRecipeForLine(trimmed)
  if (fromExact && fromExact.ingredients.length > 0) {
    return toResolved(fromExact)
  }

  // 3) Known meal-intent aliases (Sunday roast, spag bol, tacos, …)
  const fromIntent = resolveViaIntentAlias(key)
  if (fromIntent) return fromIntent

  // 4) Fuzzy match against Waitrose refs (already done inside findWaitroseRecipeReference)
  //    and local templates
  for (const recipe of MEAL_RECIPES) {
    const chip = normalizeMealKey(recipe.chipLabel)
    const full = normalizeMealKey(recipe.fullName)
    if (key === chip || key === full) return toResolved(recipe)
    if (key.length >= 6 && (chip.includes(key) || full.includes(key) || key.includes(chip) || key.includes(full))) {
      if (recipe.ingredients.length > 0) return toResolved(recipe)
    }
  }

  return { status: 'unresolved', mealName: trimmed, reason: 'no-recipe' }
}

/** Explicit recipe-first API name. */
export function resolveMealRecipe(mealName: string): MealIngredientResolution {
  return resolveMealIngredients(mealName)
}

export const UNRESOLVED_MEAL_MESSAGE =
  "We couldn't identify enough ingredients for this meal yet. Try adding a little more detail."

/** Minimum catalog-matched ingredients required before a meal may be persisted. */
export const MIN_VIABLE_MAPPED_INGREDIENTS = 2

export function formatIngredientNeedLabel(ingredientName: string): string {
  return ingredientName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
