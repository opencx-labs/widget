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
    setupFiles: ['./vitest.setup.ts'],
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
  },
});
