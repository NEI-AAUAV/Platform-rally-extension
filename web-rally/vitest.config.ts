import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    exclude: [
      'tests/e2e/**',
      'tests/e2e-fullstack/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    globals: true,
    environment: 'jsdom',
    // jsdom defaults to the opaque "about:blank" origin, where localStorage is
    // unavailable. Pin a concrete origin so storage-backed hooks/tests work.
    environmentOptions: {
      jsdom: { url: 'http://localhost' },
    },
    setupFiles: './tests/unit/setup.ts',
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text', 'json-summary'],
      // Vitest defaults this to false, which means a single failing test makes
      // the whole coverage/ directory disappear — including the lcov.info that
      // sonar-project.properties points at. Coverage is most worth looking at
      // on a red build, not least.
      reportOnFailure: true,
      // Set just under the measured baseline so this acts as a ratchet against
      // regression rather than a blocker. Raise these as coverage climbs; the
      // backend has enforced floors and the frontend had none.
      thresholds: {
        statements: 86,
        branches: 79,
        functions: 84,
        lines: 88,
      },
      include: [
        'src/**/*.ts',
        'src/**/*.tsx',
      ],
      exclude: [
        'src/components/ui/**',
        // Not all of components/shared/ is presentational chrome: access/
        // holds PermissionGuard (an authorization control), navigation/ and
        // checkpoint/ hold real logic. Only layout/ is excluded, so the rest
        // is measured rather than assumed covered.
        'src/components/shared/layout/**',
        'src/components/themes/**',
        'src/client/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/sw.ts',
        // A handful of tests still live beside their source; they must not
        // count themselves toward the denominator.
        'src/**/*.test.{ts,tsx}',
        '**/*.config.*',
        '**/dist/**',
        '**/build/**',
        '**/node_modules/**',
      ],
    },
    watch: false,
  },
})
