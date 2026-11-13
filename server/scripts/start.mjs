// Arranque local del servidor compilado: aplica las migraciones y levanta la API con la interfaz.
// Toma DATABASE_URL y DIRECT_URL del entorno. En Netlify no se usa.
await import('./migrate.mjs');
await import('../dist/index.js');
