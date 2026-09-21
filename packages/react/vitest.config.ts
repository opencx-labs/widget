import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    typecheck: {
      enabled: true,
    },
    printConsoleTrace: true,
    environment: 'jsdom',
    // The browser-mode project owns these (vitest.browser.config.ts).
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.browser.spec.*'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
  },
});
