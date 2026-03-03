# E2E Test Migration to Playwright CLI

## Overview

This document describes the migration of E2E tests from Playwright Node.js scripts to Playwright CLI shell scripts.

## Migration Summary

| Original Test | New CLI Test | Type | Status |
|--------------|--------------|------|--------|
| `smoke.production.mjs` | `api-smoke-test.sh` | API | ✅ Migrated |
| `session-delete.production.mjs` | `session-delete-test.sh` | API | ✅ Migrated |
| `scroll-lock.production.mjs` | `scroll-lock-test.sh` | UI | ✅ Migrated |
| `bottom-growth.production.mjs` | `bottom-growth-test.sh` | UI | ✅ Migrated |
| Chart rendering matrix | `chart-rendering-test.sh` | UI | ✅ Added |
| Chart dark contrast check | `chart-dark-theme-contrast-test.sh` | UI | ✅ Added |
| `mobile-keyboard.production.mjs` | `mobile-test.sh` | UI (Mobile) | ✅ Migrated |
| `mobile-safe-area.production.mjs` | `mobile-safe-area-test.sh` | UI (Mobile) | ✅ Migrated |
| `mobile-sheet-scrolllock.production.mjs` | `mobile-sheet-scrolllock-test.sh` | UI (Mobile) | ✅ Migrated |

## New Test Commands

```bash
# Run all CLI tests against localhost
npm run test:cli

# Run only API tests (no browser needed)
npm run test:cli:api

# Run only UI tests
npm run test:cli:ui

# Run only mobile tests
npm run test:cli:mobile

# Run against production
bash test/e2e/cli/run-all-tests.sh https://your-production-url.com

# Run specific test
bash test/e2e/cli/api-smoke-test.sh http://localhost:8787
```

## Benefits of Playwright CLI

| Aspect | Before (Node.js) | After (CLI) |
|--------|-----------------|-------------|
| **Token usage** | High (full accessibility tree) | Low (concise output) |
| **Dependencies** | Requires `playwright` package | Uses global `playwright-cli` |
| **CI/CD** | Node.js runtime needed | Shell only |
| **Debugging** | Console logs | Screenshots + snapshots |
| **Skill integration** | None | Claude Code skill available |

## File Structure

```
test/e2e/
├── cli/                          # New CLI tests
│   ├── run-all-tests.sh          # Main test runner
│   ├── api-smoke-test.sh         # API smoke test
│   ├── session-delete-test.sh    # Session deletion test
│   ├── smoke-test.sh             # UI smoke test
│   ├── scroll-lock-test.sh       # Scroll lock test
│   ├── bottom-growth-test.sh     # Bottom growth test
│   ├── chart-rendering-test.sh   # Chart engine rendering matrix
│   ├── chart-dark-theme-contrast-test.sh  # Dark theme token assertions
│   ├── mobile-test.sh            # Mobile keyboard test
│   ├── mobile-safe-area-test.sh  # Mobile safe area test
│   └── mobile-sheet-scrolllock-test.sh
└── *.mjs                         # Original tests (kept for reference)
```

## How CLI Tests Work

1. **Open browser**: `playwright-cli open <url>`
2. **Get snapshot**: `playwright-cli snapshot --filename=snap.yaml`
3. **Find element refs**: Parse snapshot YAML for `ref=eXX`
4. **Interact**: `playwright-cli click eXX`, `playwright-cli fill eXX "text"`
5. **Evaluate JS**: `playwright-cli eval "(() => { ... })()"`
6. **Screenshot**: `playwright-cli screenshot --filename=name.png`
7. **Close**: `playwright-cli close`

## Example: Simple Test Flow

```bash
# Open and navigate
playwright-cli open http://localhost:8787
sleep 3

# Get element reference from snapshot
playwright-cli snapshot
# Output shows: textbox "Type a message..." [ref=e101]

# Fill and submit
playwright-cli fill e101 "Hello World"
playwright-cli click e92  # Send button

# Verify with JS evaluation
playwright-cli eval "(() => document.querySelector('textarea').value)()"

# Cleanup
playwright-cli close
```

## Notes

- Original `.mjs` tests are kept for backward compatibility
- CLI tests generate screenshots and snapshots in the working directory
- Use `playwright-cli kill-all` to clean up any stuck browser processes
