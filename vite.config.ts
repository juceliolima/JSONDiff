import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona em https://<usuario>.github.io/<repo>/ sem depender do nome exato do repositório
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
