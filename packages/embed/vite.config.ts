import reactPlugin from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Preserve the v4 embed contract: copying script.js is sufficient, including
 * on hosts whose CORS/CSP policy does not permit a separate module request.
 * React package consumers can still split their own application bundles.
 */
export default defineConfig({
  plugins: [reactPlugin(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 10 * 1024,
    emptyOutDir: true,
    // 'hidden' keeps the map on disk for error-tracker upload but omits the
    // sourceMappingURL comment — an 8MB map carrying the ENTIRE TypeScript
    // source (sourcesContent) must not be CDN-served next to the public embed.
    sourcemap: 'hidden',
    rollupOptions: {
      input: 'src/index.tsx',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        dir: 'dist-embed',
        entryFileNames: 'script.js',
      },
    },
  },
});
