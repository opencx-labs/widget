import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import tsconfigPaths from 'vite-tsconfig-paths';
import { externalizeDeps } from 'vite-plugin-externalize-deps';
import { name } from './package.json';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    dts({
      insertTypesEntry: true,
      // WidgetProvider reads the package version at runtime. Keep the JSON in
      // the declaration program so composite-style file checks do not report
      // the import as outside the d.ts build.
      include: ['src', 'package.json'],
    }),
    externalizeDeps(),
  ],
  build: {
    outDir: 'dist',
    lib: {
      name,
      formats: ['cjs', 'es'],
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
      },
    },
    sourcemap: true,
  },
  clearScreen: false,
});
