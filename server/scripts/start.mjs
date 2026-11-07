// Arranque de producción: migra la base de datos y levanta el servidor compilado.
await import('./migrate.mjs');
await import('../dist/index.js');
