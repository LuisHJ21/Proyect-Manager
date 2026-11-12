# Gestor de proyectos PMBOK 7

Aplicación web para que un Project Manager gestione sus proyectos según PMBOK 7. Interfaz y documentación en español.

## Estado actual del trabajo

Hay una migración en curso. Antes de tocar código, lee en este orden:

1. `docs/superpowers/specs/2026-11-12-migracion-netlify-supabase-design.md` (qué se decide y por qué).
2. `docs/superpowers/plans/2026-11-12-migracion-netlify-supabase.md` (14 tareas; marca cada casilla al terminarla).
3. `docs/guia-implementacion-pmbok.md` (hoja de ruta completa: correcciones C1…C13 y funciones F1…F18 que vienen después).

Destino de la migración: Netlify (interfaz estática y Netlify Functions), API con Hono (sustituye a Fastify), PostgreSQL y Storage de Supabase, inicio de sesión propio.

## Estructura

- `client/`: React 19, Vite, Tailwind 4, React Router 7, TanStack Query. Pruebas con Vitest y Testing Library.
- `server/`: API, Prisma. Reglas de negocio puras en `server/src/domain/`, rutas en `server/src/routes/`, pruebas en `server/tests/`.
- `shared/`: esquemas Zod, enumeraciones, etiquetas (`LABELS`), fechas y dinero. Lo usan cliente y servidor.
- `e2e/`: flujo completo con Playwright (usa Microsoft Edge).
- `docs/superpowers/specs` y `docs/superpowers/plans`: una especificación y un plan por cada bloque de trabajo.

## Comandos

```bash
npm install            # instala los tres paquetes
npm run dev            # API e interfaz en desarrollo
npm test               # shared, server y client
npm test -w server     # solo un paquete
npx vitest run tests/auth.test.ts   # un archivo (desde server/ o client/)
npm run build          # compila cliente y servidor
npm run test:e2e       # requiere npm run build antes
```

Desde la Task 5 del plan las pruebas del servidor necesitan PostgreSQL: `docker compose up -d` y la variable `TEST_DATABASE_URL` (ver `.env.example`).

## Reglas del proyecto

- Pruebas primero: escribe la prueba, mírala fallar, implementa, mírala pasar. No des una tarea por terminada sin ejecutar las pruebas que el plan indica.
- Todos los permisos se validan en el servidor. La API nunca envía a un colaborador costos, presupuesto, riesgos ni interesados; hay pruebas que lo comprueban y deben seguir pasando.
- Errores de la API: `{ error: { code, message, fields?, details? } }`, con `AppError` de `server/src/errors.ts` y mensajes en español.
- Validación con los esquemas de `shared/src/schemas.ts`; no dupliques reglas en el cliente o en las rutas.
- Dinero en centavos enteros (`BigInt` en la base, `number` en la API). Fechas de planificación como texto `YYYY-MM-DD`.
- Los textos con formato se limpian en el servidor con `sanitizeRichText`.
- Un proyecto cerrado es de solo lectura: toda ruta de escritura nueva debe quedar cubierta por `closedGuard` y su prueba de cobertura.
- Nunca edites una migración de Prisma ya aplicada; crea una nueva.
- No guardes estado en memoria entre peticiones: la API corre en funciones sin servidor.
- Secretos solo en `.env` (ignorado por git) y en las variables de Netlify. La clave de servicio de Supabase no debe aparecer en `client/`.
- Commits pequeños, uno por tarea, con prefijos `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` y mensaje en español.
- Trabaja en una rama por bloque (la migración usa `migracion-netlify-supabase`), no en `main`.

## Cómo continuar

Abre el plan, busca la primera tarea con casillas sin marcar y ejecútala completa. Si una decisión no está en la especificación ni en el plan, pregunta antes de inventarla. La Task 14 (crear cuentas, variables y desplegar) la hace el responsable; guíalo paso a paso.
