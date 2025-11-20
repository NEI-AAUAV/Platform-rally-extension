import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    globals: true,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/',
      'tests/e2e/',
      'src/client/',
      '**/*.d.ts',
      '**/*.config.*',
      '**/vite-env.d.ts',
      '.pnpm-store/**',
      '**/.pnpm-store/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/client/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/vite-env.d.ts',
      ],
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
})
