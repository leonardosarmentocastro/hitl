# Expense tags — slice 1: schema (FIXTURE)

**Owns:** the `tags` column on expenses.

**Goal:** Add a `tags text[]` column with a migration.

**Spec:** `.claude/fixtures/spec-fixture-design.md`

## Global Constraints

- Drizzle migration; no consumer in this slice.

### Task 1: Migration

**Files:** Modify `apps/api/src/db/schema.ts`; Create `apps/api/drizzle/00xx_tags.sql`

- [ ] **Step 1:** Add `tags: text("tags").array().notNull().default([])` to the expenses table.
- [ ] **Step 2:** Run `pnpm db:generate`, then `pnpm db:migrate`.
- [ ] **Step 3:** Commit.
