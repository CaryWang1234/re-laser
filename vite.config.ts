import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    watch: { ignored: ['**/.checks/**'] },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
