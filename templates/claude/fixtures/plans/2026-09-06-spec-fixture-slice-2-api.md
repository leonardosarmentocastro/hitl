# Expense tags — slice 2: API (FIXTURE)

**Owns:** accepting `tags` on create/update and filtering the month list by `tag`.

**Goal:** The API reads and writes tags.

**Spec:** `.claude/fixtures/spec-fixture-design.md`

## Global Constraints

- One file per resolver; one test file per endpoint.

### Task 1: Accept tags on create

**Files:** Modify `apps/api/src/expenses/create.ts`; Test `apps/api/src/expenses/__tests__/create.test.ts`

- [ ] **Step 1: Write the test** — POST an expense with `tags: ["casa"]`; assert status 201.
- [ ] **Step 2: Run it** — expected: PASS (the route already returns 201 for a valid body).
- [ ] **Step 3: Implement** — add `tags` to the Zod schema and the insert.
- [ ] **Step 4: Commit.**
