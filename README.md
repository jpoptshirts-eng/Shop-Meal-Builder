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

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` for the POPMAS product catalogue (same as sibling Waitrose prototypes).

## Core journey

1. Create or open a folder
2. **+ Create meal** → name the meal
3. Enter the empty Meal Builder
4. Search → autosuggest (from 2 characters) → select
5. Item is added immediately and autosaved
6. Repeat; shop selected items to trolley when ready

## Foundations reused

- Waitrose chrome, folders, meal cards, swap, quantity, trolley from Shop Single Meal
- Product autosuggest from Shopping Lists (via `meal-add-item.tsx` / `product-autocomplete.tsx` / `productAutocomplete.ts`)
