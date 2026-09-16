import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { widgetIdentity } from './scripts/widget-identity.mjs';

export default defineConfig({
  // widgetIdentity first: its /api/widget-identity must win over the Worker's /api/*.
  plugins: [widgetIdentity(), react(), tailwindcss(), cloudflare()],
});
