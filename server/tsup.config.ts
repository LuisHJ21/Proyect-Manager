import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/netlify.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  noExternal: ['@pm/shared'],
});
