# Tag export — slice 1: export one tag (FIXTURE)

**Owns:** export one tag's expenses as a CSV file.

**Reviewed:** grandfathered (2026-09-06).

**Goal:** A function that writes the expenses carrying one tag to `out.csv`, with a header
line naming the currency.

**Spec:** none — this plan is a fixture for the reviewers' slice side.

## Global Constraints

- Node ESM; tests with Vitest.
- The expenses live in `expenses.csv` at the working directory: one expense per line,
  `date,amount,currency,tags`.

### Task 1: `exportTag(tag)`

**Files:** Create `src/export-tag.js`; Test `src/export-tag.test.js`

- [ ] **Step 1:** Write the failing test: exporting the tag `food` writes `out.csv` with a
  header naming the currency and one line per `food` expense.
- [ ] **Step 2:** Run `pnpm test` — expect FAIL.
- [ ] **Step 3:** Implement `exportTag(tag)` in `src/export-tag.js`.
- [ ] **Step 4:** Run `pnpm test` — expect PASS.
- [ ] **Step 5:** Commit `feat(export): export one tag's expenses as CSV`.
