# Shop Meal Builder

Waitrose research prototype for a customer-controlled meal builder.

## Proposition

Customers create and name a meal first, then deliberately build it by searching for and selecting individual items. Each selection is immediately added and autosaved.

This is **not** AI meal generation. It is distinct from:

- **Shop by Meals** — system-led meal interpretation
- **Shop Single Meal** — list-led meal creation from a typed list

## Local development

```bash
npm install
npm run dev
```

Runs on [http://localhost:5182](http://localhost:5182).

No environment variables are required. The Waitrose product catalogue is loaded from CSV files in `public/data/products/`. Folders, meals, and items persist in browser localStorage.

## Core journey

1. Create or open a folder
2. Create a meal (inline name + Create meal)
3. Enter the empty Meal Builder
4. Search → autosuggest → select
5. Item is added immediately and autosaved
6. Repeat; shop selected items to trolley when ready

## Data architecture

- **Products:** static CSVs under `/public/data/products` → `src/services/productCatalogue.ts`
- **Folders / meals / items:** browser `localStorage` → `src/services/mealStorage.ts`
