/**
 * Entrada de las funciones de Netlify. tsup la compila a `dist/netlify.js` con `@pm/shared` incluido:
 * el empaquetador de Netlify deja los paquetes del monorepo como dependencias externas y no puede
 * cargar su código TypeScript.
 */
export { createProductionApp, createProductionDeps } from './production';
export { runDailyJobs } from './jobs/daily';
