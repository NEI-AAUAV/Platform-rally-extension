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
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/unit/setup.ts',
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text', 'json-summary'],
      include: [
        'src/**/*.ts',
        'src/**/*.tsx',
      ],
      exclude: [
        'src/components/ui/**',
        'src/components/shared/**',
        'src/components/themes/**',
        'src/client/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        '**/*.config.*',
        '**/dist/**',
        '**/build/**',
        '**/node_modules/**',
      ],
      all: true,
    },
    watch: false,
  },
})
