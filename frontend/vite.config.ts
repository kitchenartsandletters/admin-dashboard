import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = (await import('node:path')).dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': (await import('node:path')).resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react-markdown', 'remark-gfm'],
  },
  ssr: {
    noExternal: ['react-markdown', 'remark-gfm'], // 🔧 Ensures they are bundled in SSR/prod
  },
});