import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', './packages/react/vitest.browser.config.ts'],
  },
})