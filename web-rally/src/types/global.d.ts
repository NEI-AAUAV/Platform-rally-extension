/**
 * Global type declarations for the Rally extension
 */

/// <reference types="@testing-library/jest-dom" />

declare global {
  interface Window {
    clearRallyCache?: () => void;
  }
}

export { };
