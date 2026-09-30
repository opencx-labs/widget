import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { playwright } from '@vitest/browser-playwright';

const browser = process.env.WIDGET_TEST_BROWSER ?? 'chromium';
if (browser !== 'chromium' && browser !== 'firefox' && browser !== 'webkit')
  throw new Error(`Unsupported WIDGET_TEST_BROWSER: ${browser}`);

/**
 * The specs that need a real browser.
 *
 * Reading the customer's page is a question jsdom cannot answer honestly:
 * `checkVisibility`, layout boxes, `elementFromPoint`, what a pointer
 * sequence actually opens. A reader that passes in jsdom and lies in Chrome
 * is worse than no reader, so anything that touches those runs here, against
 * the selected engine, and the rest stays on the fast jsdom project.
 */
export default defineConfig({
  // Vitest serves its own runner. Do not serve the optional developer app.
  appType: 'custom',
  plugins: [tsconfigPaths(), react()],
  // Pre-bundled up front: a mid-run re-optimize reloads the page under the
  // running test, which vitest reports as a flake.
  optimizeDeps: {
    // The optional development HTML imports a developer-owned app.dev.tsx.
    // Browser tests have their own entry points and do not load that example.
    entries: [],
    include: [
      '@shardsui/notation',
      'zod',
      'html-to-image',
      '@opencx/widget-core',
      '@json-render/react',
      '@json-render/react/schema',
      '@json-render/core',
      'lucide-react',
      'zod/v4',
      'zod/v3',
      'react/jsx-runtime',
      'clsx',
      'tailwind-merge',
    ],
  },
  test: {
    name: 'react-browser',
    include: ['src/**/*.browser.spec.{ts,tsx}'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser }],
    },
  },
});
