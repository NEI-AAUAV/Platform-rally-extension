# Rally Web Frontend

This directory contains the React and TypeScript frontend for the Rally extension, built with Vite.

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Run Development Server
```bash
pnpm run dev
```
The application will be available at `http://localhost:3003`.

### 3. Run Tests
```bash
# Run unit tests
pnpm test

# Run End-to-End tests
pnpm test:e2e
```

## Documentation

This README provides the basic commands to get started. For more detailed information, see the following guides:

-   **[Build & Deployment Guide](./BUILD.md):** For detailed instructions on building the application, local development, and CI/CD workflows.
-   **[API Guide](./API.md):** For documentation on data fetching hooks, authentication, and API interaction.
-   **[Testing Guide](./tests/TESTING.md):** For a comprehensive overview of our frontend testing strategy.

## Tech Stack

-   **Framework:** React 18
-   **Language:** TypeScript
-   **Build Tool:** Vite
-   **Styling:** Tailwind CSS
-   **State Management:** Zustand
-   **Server State:** TanStack Query
-   **Testing:** Vitest & Playwright