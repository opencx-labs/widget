import reactPlugin from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * The widget module — `dist-embed/widget.js` plus its lazy chunks.
 *
 * `format: 'es'` is what makes the lazy boundaries real: an `iife` bundle
 * cannot code-split, so rollup inlined every `import()` (recharts and its d3
 * deps, the heaviest thing in the registry) into the initial payload. The
 * public URL customers embed stays `script.js` — see `vite.loader.config.ts`,
 * which builds the classic-script loader that pulls this module in.
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
        format: 'es',
        dir: 'dist-embed',
        entryFileNames: 'widget.js',
        chunkFileNames: '[name]-[hash].js',
      },
    },
  },
  server: {
    port: 3005,
  },
});
