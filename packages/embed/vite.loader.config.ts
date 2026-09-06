import { defineConfig } from 'vite';
import { version } from './package.json';

/**
 * The public embed entry — `dist-embed/script.js`. A classic (non-module)
 * script, because that is the tag every customer already has on their page; it
 * injects the code-split `widget.js` module built by `vite.config.ts`.
 *
 * Runs AFTER the widget build, so `emptyOutDir` is off: emptying here would
 * delete the module and its chunks.
 */
export default defineConfig({
  define: {
    __WIDGET_VERSION__: JSON.stringify(version),
  },
  build: {
    emptyOutDir: false,
    sourcemap: 'hidden',
    rollupOptions: {
      input: 'src/loader.ts',
      output: {
        format: 'iife',
        dir: 'dist-embed',
        entryFileNames: 'script.js',
        extend: true,
      },
    },
  },
});
