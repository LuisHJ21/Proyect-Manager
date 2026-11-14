import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/netlify.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  // sanitize-html es CommonJS y carga htmlparser2, que solo existe como módulo ES. Eso exige un Node
  // que permita require() de módulos ES, y el de Netlify Functions no lo permite. Al incluirlos aquí,
  // esbuild resuelve esa carga al compilar.
  noExternal: ['@pm/shared', 'sanitize-html', 'htmlparser2', 'domhandler', 'domutils', 'dom-serializer', 'domelementtype', 'entities'],
  // El código CommonJS incluido usa require() para módulos de Node; en un módulo ES hay que crearlo.
  banner: { js: "import { createRequire as __pmCreateRequire } from 'node:module';\nconst require = __pmCreateRequire(import.meta.url);" },
});
