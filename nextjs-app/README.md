# TestReady

Next.js 14 (App Router) + TypeScript + Tailwind, built from `../docs/engineering/engineering-doc.md` and `../docs/specs/`.

## Run locally

Requires Node.js 20+.

```bash
npm install
cp ../.env.example .env.local   # fill in values as features need them
npm run dev                     # http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

## Layout

- `src/app` — routes (placeholders for login, signup, children, pricing, legal pages are replaced in Stage 4)
- `src/styles/tokens.css` — design tokens from `../docs/design.md`; `tailwind.config.ts` maps only to these tokens
- `src/components/ui` — Button, Badge, Card (design-system primitives)
- `src/lib` — constants, shared zod schemas, `cn()` helper; feature folders are empty until their spec is built
- `supabase/migrations/0001_init.sql` — copy of `../docs/specs/supabase-schema.sql`
- `netlify/functions`, `kb`, `prompts`, `scripts`, `tests` — per EDD §11, populated in later stages

Rules: no raw hex values or arbitrary spacing in components; every colour, size, radius and duration comes from the design tokens.
