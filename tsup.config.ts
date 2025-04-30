import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    // Generate declaration file
    dts: true,
    // Generate sourcemap file
    sourcemap: true,
  },
]);
