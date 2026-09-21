import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { playwright } from '@vitest/browser-playwright';

/**
 * The specs that need a real browser.
 *
 * Reading the customer's page is a question jsdom cannot answer honestly:
 * `checkVisibility`, layout boxes, `elementFromPoint`, what a pointer
 * sequence actually opens. A reader that passes in jsdom and lies in Chrome
 * is worse than no reader, so anything that touches those runs here, against
 * Chromium, and the rest stays on the fast jsdom project.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // Pre-bundled up front: a mid-run re-optimize reloads the page under the
  // running test, which vitest reports as a flake.
  optimizeDeps: {
    include: ['@shardsui/notation', 'zod'],
  },
  test: {
    name: 'react-browser',
    include: ['src/**/*.browser.spec.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
