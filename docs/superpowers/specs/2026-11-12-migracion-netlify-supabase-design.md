# Migración a Netlify, Hono y Supabase: especificación de diseño

**Fecha:** 2026-11-12
**Estado:** aprobada por el responsable en conversación; pendiente de revisión del texto
**Origen:** sección 4 de `docs/guia-implementacion-pmbok.md`

## 1. Propósito

La aplicación deja de ejecutarse en un equipo de la red local y pasa a internet: interfaz y API en Netlify, base de datos y anexos en Supabase. La API deja de usar Fastify y pasa a Hono. El comportamiento funcional no cambia.

### Decisiones del responsable

- Alojamiento: **Netlify** (interfaz estática y Netlify Functions). No se usa Vercel.
- API: **propia, con Hono**. No se usa Fastify.
- Inicio de sesión: **se conserva el actual** (cuentas propias, argon2id, sesión por cookie). No se usa Supabase Auth.
- Datos: **se empieza limpio**. No se migra `data/app.db`.

### Criterios de éxito

1. `npm test` pasa completo con la API en Hono y la base en PostgreSQL, sin cambiar las aserciones de las pruebas existentes salvo donde esta especificación cambia el comportamiento (anexos, configuración inicial, limitador).
2. Un despliegue en Netlify permite: configuración inicial con código, crear un proyecto, subir y descargar un anexo de 20 MB, y ver "hoy" según la hora de Lima.
3. Ninguna tabla de Supabase es accesible por su API pública.
4. `npm run dev` funciona en local sin conexión a Supabase ni a Netlify.
5. En `package.json` no queda ninguna dependencia de Fastify.

## 2. Arquitectura

| Pieza | Antes | Después |
|---|---|---|
| Interfaz | Fastify sirve `client/dist` | Sitio estático de Netlify (`client/dist`) |
| API | Fastify en un proceso Node permanente | Aplicación Hono dentro de una Netlify Function (`/api/*`) |
| Base de datos | SQLite en `data/app.db` | PostgreSQL de Supabase, con Prisma |
| Anexos | Disco en `data/uploads` | Bucket privado de Supabase Storage |
| Migraciones | Al arrancar | En el comando de compilación del despliegue |
| Tareas diarias | No había | Función programada de Netlify |

- `buildApp(opciones)` devuelve la aplicación Hono y es el único lugar donde se arma. Todo lo que depende del entorno entra por opciones: cliente Prisma, almacén de archivos, reloj, zona horaria, cookies seguras, código de configuración y forma de obtener la IP.
- Las reglas de negocio de `server/src/domain/` y los esquemas de `shared/` no cambian.
- Cada módulo de rutas conserva su archivo, sus direcciones, sus códigos de estado y su formato de error.
- En local la misma aplicación se sirve con `@hono/node-server`, que también entrega la interfaz compilada.

## 3. Base de datos

- Prisma con `provider = "postgresql"` y `binaryTargets = ["native", "rhel-openssl-3.0.x"]`.
- `DATABASE_URL`: pooler de Supabase en modo transacción (puerto 6543, con `?pgbouncer=true&connection_limit=1`). La usa la API.
- `DIRECT_URL`: pooler en modo sesión (puerto 5432). La usan las migraciones.
- Las migraciones de SQLite se eliminan (quedan en el historial de git) y se genera una migración inicial única.
- **RLS:** todas las tablas del esquema `public` tienen seguridad por filas activada y ninguna política. Prisma se conecta como propietario y no se ve afectado; la API pública de Supabase no puede leer ni escribir nada. Una prueba falla si aparece una tabla sin RLS.

## 4. Anexos

Una Netlify Function no acepta cuerpos de más de 6 MB (unos 4,5 MB si son binarios), así que el archivo no pasa por la API.

1. **Solicitar subida:** el cliente envía nombre, tipo y tamaño. La API valida permiso, tipo permitido y tamaño (máximo 25 MB), crea el anexo como pendiente y devuelve una dirección de subida firmada.
2. **Subir:** el navegador envía el archivo directamente a esa dirección.
3. **Confirmar:** el cliente avisa a la API, que comprueba que el archivo existe y su tamaño real. Si supera el límite, lo borra y responde 413. Si es correcto, el anexo queda visible.

- Un anexo pendiente no aparece en listas ni se puede elegir como evidencia de un entregable.
- La descarga comprueba el permiso como hoy y redirige a una dirección firmada válida 60 segundos, siempre como descarga.
- El bucket es privado, con límite de 25 MB por archivo configurado también en Supabase.
- Los anexos pendientes de más de 24 horas se borran en la tarea diaria.
- Borrar un anexo, una tarea o un proyecto borra sus archivos del bucket.

## 5. Fecha y zona horaria

Las funciones de Netlify trabajan en UTC. "Hoy" se calcula con la zona de la variable `APP_TIMEZONE` (valor de producción: `America/Lima`). Sin la variable se usa la zona del sistema, como hasta ahora. Toda regla del servidor que dependa de la fecha usa ese cálculo.

## 6. Seguridad

- **Cookie de sesión:** `secure` en producción, además de `httpOnly` y `SameSite=Lax`.
- **IP del cliente:** se toma de la información de conexión que entrega Netlify.
- **Cabeceras:** `secureHeaders` de Hono en la API; para la interfaz, cabeceras en `netlify.toml` (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).
- **Configuración inicial:** con la aplicación en internet, cualquiera podría crear el primer Project Manager antes que el dueño. Si existe `SETUP_TOKEN`, `POST /api/setup` exige ese código y la pantalla lo pide. En producción la variable es obligatoria.
- **Intentos de inicio de sesión:** se guardan en la base de datos, porque la memoria no se comparte entre invocaciones. Regla: 5 fallos del mismo correo e IP dentro de 15 minutos bloquean 15 minutos. Los fallos anteriores a esa ventana no cuentan.
- **Secretos:** solo en variables de entorno de Netlify. La clave de servicio de Supabase nunca se envía al navegador.

## 7. Tarea diaria

Una función programada de Netlify (`0 10 * * *`, 05:00 en Lima) ejecuta `runDailyJobs`. No es una dirección pública de la API. Hace:

1. Borra sesiones vencidas.
2. Borra registros de intentos de inicio de sesión sin bloqueo vigente y con ventana vencida.
3. Borra anexos pendientes de más de 24 horas y sus archivos.
4. Guarda la foto de valor ganado del día de cada proyecto activo con línea base.

Debe terminar dentro del límite de 30 segundos de las funciones programadas.

## 8. Variables de entorno

| Variable | Uso | Producción |
|---|---|---|
| `DATABASE_URL` | Conexión de la API | Obligatoria |
| `DIRECT_URL` | Migraciones | Obligatoria |
| `SUPABASE_URL` | Storage | Obligatoria |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage | Obligatoria |
| `SUPABASE_BUCKET` | Nombre del bucket | `anexos` |
| `APP_TIMEZONE` | Zona para "hoy" | `America/Lima` |
| `SETUP_TOKEN` | Código de configuración inicial | Obligatoria |
| `TEST_DATABASE_URL` | PostgreSQL local para pruebas | No se usa |

## 9. Desarrollo y pruebas

- La conversión a Hono se hace primero y sobre SQLite, para que las pruebas actuales la validen sin cambiar nada más.
- Después, PostgreSQL local con `docker compose up -d`. Quien no use Docker puede instalar PostgreSQL 16 y apuntar `TEST_DATABASE_URL` a él.
- Las pruebas del servidor crean una base plantilla con las migraciones y una base nueva por archivo de prueba a partir de ella.
- En local y en pruebas los anexos van a disco con el mismo flujo de tres pasos.

## 10. Fuera de alcance

- Importar los datos de SQLite.
- Supabase Auth, segundo factor y correo.
- Perfil Observador y PM que ejecuta tareas (siguiente bloque de la guía).
- Corregir que `GET /performance` escriba la foto de valor ganado (C6).
- Notificaciones (F2).

## 11. Riesgos y puntos a verificar al desplegar

- El empaquetado del motor de Prisma en Netlify Functions falla con frecuencia en monorepos; se comprueba en el primer despliegue de vista previa (Task 14) y la configuración de `netlify.toml` se ajusta ahí.
- Tiempo máximo de ejecución de las funciones del plan contratado frente al arranque en frío con Prisma y argon2.
- Los proyectos gratuitos de Supabase pueden pausarse por inactividad y sus copias de seguridad dependen del plan; revisar antes de cargar datos reales.
