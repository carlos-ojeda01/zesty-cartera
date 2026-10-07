import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo funciones puras: la librería financiera y el conversor del MCP. Sin
    // React Native ni red.
    include: ['src/lib/finance/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
