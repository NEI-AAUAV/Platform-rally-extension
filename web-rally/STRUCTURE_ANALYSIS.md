# Code Structure Analysis

**Status**: ✅ All issues have been resolved

## Issues Found (RESOLVED)

### 1. Duplicate/Legacy Playwright Configuration ✅ RESOLVED

**Issue**: Two Playwright config files with different approaches
- `playwright.config.ts` (root) - ✅ Active: Uses native `page.route()` mocking
- `tests/e2e/playwright.config.ts` - ❌ Legacy: Uses MSW (not used)

**Impact**: Confusion, unused code

**Resolution**: ✅ Removed `tests/e2e/playwright.config.ts`

---

### 2. Legacy MSW Setup Files ✅ RESOLVED

**Issue**: MSW setup files exist but are not used
- `tests/e2e/global-setup.ts` - MSW server setup (legacy)
- `tests/e2e/global-teardown.ts` - MSW server teardown (legacy)

**Impact**: Dead code, maintenance burden

**Resolution**: ✅ Removed both files

---

### 3. ActivityForm Naming Conflict ✅ RESOLVED

**Issue**: Two different components with the same name
- `src/components/ActivityForm.tsx` - Admin form (create/edit activities)
- `src/components/forms/ActivityForm.tsx` - Evaluation form (staff evaluation)

**Usage**:
- Admin: `import ActivityForm from '@/components/ActivityForm'`
- Staff: `import ActivityForm from '@/components/forms/ActivityForm'`

**Impact**: Confusing imports, potential naming conflicts

**Resolution**: ✅ Renamed for clarity:
- `ActivityForm.tsx` → `ActivityCreateForm.tsx` (admin form)
- `forms/ActivityForm.tsx` → `forms/ActivityEvaluationForm.tsx` (evaluation form)
- Updated all imports accordingly

---

### 4. Postos Page Structure Inconsistency ✅ RESOLVED

**Issue**: Inconsistent page structure
- `src/pages/postos.tsx` - Page component (standalone file)
- `src/pages/postos/` - Components directory
- Other pages: `src/pages/{name}/index.tsx` + `components/`

**Impact**: Inconsistent patterns, harder to navigate

**Resolution**: ✅ Moved `postos.tsx` → `postos/index.tsx` for consistency

---

### 5. Unused MSW Handlers ✅ RESOLVED

**Issue**: `tests/mocks/handlers.ts` contains MSW handlers but we use Playwright route mocking

**Impact**: Dead code, confusion

**Resolution**: ✅ Documented as legacy/unused with deprecation notice

---

## Current Structure (Valid)

### ✅ Router Structure
- `src/router/index.tsx` - Router provider (needed)
- `src/router/routes.tsx` - Route definitions (needed)
Both are correctly used.

### ✅ Utils Structure
- `src/lib/utils.ts` - Generic utilities (shadcn `cn` function)
- `src/utils/` - Domain-specific utilities (timezone, timeFormat)
Correct separation of concerns.

### ✅ Services Structure
- `src/services/client.ts` - HTTP client with token refresh (used)
- `src/services/NEIService.ts` - NEI API service (uses client.ts)
Both are needed and correctly used.

### ✅ Component Organization
- `src/components/ui/` - Generic UI components (shadcn)
- `src/components/shared/` - Shared domain components
- `src/components/themes/` - Theme-specific components
- `src/components/forms/` - Form components
Well-organized structure.

---

## Recommendations Priority

1. **High**: Remove legacy Playwright/MSW files
2. **Medium**: Resolve ActivityForm naming conflict
3. **Low**: Standardize postos page structure (if desired)

