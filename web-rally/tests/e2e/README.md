# E2E Tests

This directory contains the End-to-End (E2E) tests for the Rally web frontend, built with Playwright.

For detailed documentation on the E2E architecture, mocking strategies, and how to contribute, see the main **[Frontend Testing Guide](../TESTING.md)**.

## Quick Commands

```bash
# Run all tests in headless mode
pnpm test:e2e

# Run in interactive UI mode for debugging
pnpm test:e2e --ui

# Run only tests matching a specific name
pnpm test:e2e --grep "Admin"
```