# Gestor de proyectos PMBOK 7

Aplicación web para gestionar proyectos según PMBOK 7. Se publica en Netlify, con la base de datos y los anexos en Supabase. Incluye panel general, calendario, acta de constitución, tareas con varios asignados y dependencias, anexos, interesados, riesgos, presupuesto e indicadores.

## Roles

- **Project Manager:** entra al panel general, ve todos los proyectos y gestiona proyectos, tareas y usuarios. No recibe tareas asignadas.
- **Colaborador:** entra a **Mis tareas** y ve solo los proyectos de los que es miembro. Actualiza el estado y el avance de las tareas que tiene asignadas.

Ambos roles tienen un calendario con las actividades por fecha límite. El Project Manager ve todas las de los proyectos activos, y el colaborador, las suyas y los hitos de sus proyectos.

## Textos con formato y matriz RACI

- **Textos con formato:** el acta, la descripción del proyecto, los objetivos y los riesgos se escriben con negrita, cursiva, títulos de sección y listas. Al guardar se elimina cualquier otro formato, como enlaces, imágenes o código. Los textos escritos antes de este cambio se muestran tal cual, con un párrafo por línea.
- **Matriz RACI:** en la pestaña **Interesados** de cada proyecto, el Project Manager define actividades y, para cada miembro del equipo o interesado, si hace el trabajo (R), rinde cuentas (A), se le consulta (C) o se le informa (I). Cada fila avisa si le falta una A, si tiene más de una o si le falta una R. Los colaboradores no ven la matriz.

## Línea base, valor ganado y cambios

Solo el Project Manager ve estas secciones.

- **Costo planeado:** cada tarea puede tener un costo planeado, y cada gasto puede ligarse a una tarea.
- **Línea base:** en la pestaña **Desempeño**, "Fijar línea base" guarda una foto de las tareas con costo y sus fechas. Se puede volver a fijar con un motivo, y cada versión queda en el historial.
- **Indicadores:**
  - **CPI** (eficiencia de costo): valor ganado entre costo real. Menos de 1 significa que se gasta más de lo que se avanza.
  - **SPI** (eficiencia de plazo): valor ganado entre valor planeado. Menos de 1 significa atraso.
  - **EAC** (costo final estimado): lo que costará el proyecto si sigue igual.
  - **VAC** (variación al terminar): presupuesto planeado menos EAC. Negativo significa sobrecosto.
- **Salud:** con línea base, un CPI o SPI bajo 0,9 marca el proyecto como "Atención".
- **Cambios:** la pestaña **Cambios** registra cada solicitud con su impacto en alcance, plazo y costo, y su decisión con una nota. Una nueva línea base puede citar un cambio aprobado.

## Incidentes y decisiones

- **Incidentes:** cualquier miembro del proyecto reporta un problema desde la pestaña **Incidentes** o desde una tarea. El colaborador ve los que reportó y los que tiene asignados. Si es el responsable, puede marcarlos en curso y resolverlos con una resolución. El Project Manager ve todos, asigna responsable, prioridad y fecha límite, y los cierra o reabre.
- **Riesgo a incidente:** en el detalle de un riesgo, "Pasar a incidente" crea el incidente con el título, el responsable y la prioridad del riesgo.
- **Panel:** los incidentes de prioridad alta abiertos y los vencidos aparecen en "Requiere atención".
- **Decisiones:** en la pestaña **Control de cambios**, el Project Manager registra qué se decidió, quién y por qué, con enlaces a cambios e incidentes. Al cerrar un incidente puede registrarlo como decisión. Los colaboradores no ven las decisiones.

## Entregables y aceptación

Esta función es solo para el Project Manager; los colaboradores no ven la pestaña.

- **Entregables:** en la pestaña **Entregables** se registra cada producto que hay que entregar (ENT-1, ENT-2…). Cada uno puede tener hito, fecha comprometida y una lista de criterios de aceptación.
- **Revisión:** un entregable pasa de "Pendiente" a "En revisión". Desde ahí se acepta o se rechaza en nombre de un interesado del registro.
  - Para aceptar, todos los criterios tienen que estar marcados.
  - Para rechazar hay que escribir el motivo.
  - Como evidencia se puede elegir un archivo de **Anexos**, por ejemplo el acta firmada. Conviene subirlo antes.
- **Historial:** cada revisión queda guardada con la fecha, el interesado, la nota, el anexo y cómo estaban los criterios en ese momento.
  - Si después se borra el interesado o el anexo, el historial conserva su nombre (el anexo aparece como "Anexo eliminado" con el nombre que tenía).
  - Un entregable aceptado se puede reabrir; el historial no se pierde.
  - Mientras está aceptado, sus criterios no se pueden cambiar.
- **Panel:** los entregables vencidos (pasada la fecha comprometida y sin aceptar) aparecen en "Requiere atención".

## Cierre y lecciones aprendidas

- **Cerrar un proyecto:** el Project Manager lo hace desde la pestaña **Cierre**.
  - La pestaña muestra qué queda abierto: entregables sin aceptar, incidentes y riesgos abiertos, tareas sin terminar, objetivos sin evaluar y el acta sin aprobar.
  - Se puede cerrar igualmente, pero si hay pendientes hay que escribir el motivo.
  - El estado final puede ser "Cerrado" o "Cancelado"; el formulario del proyecto ya no ofrece esos estados.
- **Informe de cierre:** compara lo planificado con lo real en fechas, presupuesto, valor ganado (si hay línea base), objetivos, entregables, cambios, incidentes y riesgos.
  - Con el proyecto abierto se ve como vista previa.
  - Al cerrar queda congelado tal como estaba y se puede imprimir o guardar como PDF con "Imprimir informe".
- **Solo lectura:** un proyecto cerrado o cancelado no admite cambios. Se puede consultar todo, borrar el proyecto y añadir lecciones aprendidas.
  - El Project Manager puede reabrirlo con un motivo, y cada cierre y reapertura queda en el "Historial de cierre".
  - Los proyectos que ya estaban cerrados antes de esta versión siguen cerrados. Su informe se calcula al consultarlo y se pueden reabrir.
- **Lecciones aprendidas:** cualquier miembro las registra en la pestaña **Lecciones** del proyecto, en cualquier momento, también con el proyecto cerrado.
  - Cada lección tiene tipo ("Funcionó bien" o "A mejorar"), categoría, situación y recomendación.
  - Su autor y el Project Manager pueden editarla o borrarla.
  - La página **Lecciones** de la navegación principal reúne las de todos los proyectos, con búsqueda y filtros, para cualquier usuario.

## Cómo está montada

- **Interfaz:** archivos estáticos publicados por Netlify.
- **API:** una función de Netlify (`netlify/functions/api.mts`) atiende todas las direcciones `/api/*`.
- **Base de datos:** PostgreSQL de Supabase.
- **Anexos:** un bucket privado de Supabase Storage. El navegador sube y descarga cada archivo con una dirección firmada que dura poco; la clave de servicio de Supabase solo la conoce la API.
- **Tarea diaria:** otra función (`netlify/functions/daily.mts`) se ejecuta cada día a las 10:00 UTC (5:00 en Lima). Borra sesiones vencidas, intentos de inicio de sesión antiguos y anexos que nunca terminaron de subirse, y guarda la foto diaria de valor ganado de los proyectos activos con línea base.

## Requisitos

- Node.js 24
- Docker Desktop, para la base de datos local de desarrollo y pruebas
- Una cuenta de Netlify y otra de Supabase, para publicar

## Variables de entorno

Copia `.env.example` como `.env` en la raíz del proyecto y completa los valores. El archivo `.env` no se sube a git. En Netlify, las mismas variables se cargan en **Site configuration → Environment variables**.

| Variable | Para qué sirve | En producción |
|---|---|---|
| `DATABASE_URL` | Conexión de la API | Pooler de Supabase en modo transacción (puerto 6543), con `?pgbouncer=true&connection_limit=1` al final |
| `DIRECT_URL` | Conexión de las migraciones | Pooler de Supabase en modo sesión (puerto 5432) |
| `SUPABASE_URL` | Dirección del proyecto de Supabase | Obligatoria |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio para Storage | Obligatoria. Nunca la pongas en la interfaz ni la compartas |
| `SUPABASE_BUCKET` | Nombre del bucket de anexos | `anexos` (valor por omisión) |
| `APP_TIMEZONE` | Zona horaria para calcular "hoy" | `America/Lima` (valor por omisión) |
| `SETUP_TOKEN` | Código que pide la configuración inicial | Obligatoria |
| `TEST_DATABASE_URL` | PostgreSQL local para las pruebas | No se usa |

Si falta una variable obligatoria, la API no arranca y el registro de la función dice cuál es.

## Desarrollo local

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Arranca PostgreSQL en Docker (escucha en el puerto 5433):

   ```bash
   docker compose up -d
   ```

3. Crea el archivo `.env` a partir de `.env.example`. Los valores de ejemplo ya apuntan a la base de Docker.

4. Arranca la API y la interfaz:

   ```bash
   npm run dev
   ```

   La consola indica la dirección de la interfaz (normalmente `http://localhost:5173`). La API usa el puerto 3080, aplica las migraciones al arrancar y guarda los anexos en la carpeta `data/`.

Pruebas:

```bash
npm test
```

Las pruebas del servidor crean sus propias bases en el PostgreSQL de Docker usando `TEST_DATABASE_URL`.

La prueba de extremo a extremo usa Microsoft Edge, crea desde cero la base `pm_e2e` y necesita compilar antes:

```bash
npm run build
```

```bash
npm run test:e2e
```

## Preparar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com). Elige una región cercana, por ejemplo São Paulo, y guarda la contraseña de la base en un lugar seguro.
2. En **Storage**, crea un bucket llamado `anexos`:
   - Déjalo **privado** (sin acceso público).
   - Pon un límite de 25 MB por archivo.
3. En **Connect** (o **Project Settings → Database**), copia las cadenas de conexión del pooler:
   - **Modo transacción** (puerto 6543) para `DATABASE_URL`. Añade `?pgbouncer=true&connection_limit=1` al final.
   - **Modo sesión** (puerto 5432) para `DIRECT_URL`.
4. En **Project Settings → API**, copia la dirección del proyecto (`SUPABASE_URL`) y la clave `service_role` (`SUPABASE_SERVICE_ROLE_KEY`).

Todas las tablas tienen activada la seguridad por filas (RLS) sin políticas: solo la API, que entra con la conexión de la base, puede leerlas.

## Publicar en Netlify

1. En Netlify, crea un sitio nuevo desde el repositorio de GitHub. La configuración de compilación ya está en `netlify.toml`; deja la carpeta base vacía (la raíz del repositorio).
2. Carga las variables de la tabla anterior.
3. Genera el código de configuración inicial y guárdalo como `SETUP_TOKEN`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

4. Despliega. Cada despliegue compila la interfaz y aplica las migraciones pendientes a la base de Supabase antes de publicar.

Conviene publicar primero una vista previa (por ejemplo desde una rama) y comprobarla antes de pasar a producción.

## Primer ingreso

1. Abre la dirección del sitio y crea tu cuenta de Project Manager. La aplicación pide el **código de configuración**: es el valor de `SETUP_TOKEN`. Sin él nadie más puede crear la primera cuenta.
2. En **Usuarios**, crea las cuentas de tus colaboradores con una contraseña temporal y compártela con cada persona. Deberán cambiarla al entrar.
3. Crea un proyecto y añade a tus colaboradores al equipo desde la pestaña **Resumen**. Solo verán los proyectos de los que son miembros.
4. Crea tareas y asígnalas a los colaboradores del proyecto.

## Olvidé mi contraseña

Si el Project Manager olvida su contraseña, en un equipo con este repositorio pon en `.env` la `DATABASE_URL` de producción y ejecuta:

```bash
npm run reset-password -- tu-correo@ejemplo.com
```

La consola muestra una contraseña temporal. Al entrar con ella, la aplicación pide cambiarla. Sin correo, el comando lista los Project Managers registrados. Al terminar, vuelve a dejar en `.env` la base local.

Un colaborador también puede pedirle al Project Manager que le restablezca la contraseña desde **Usuarios**.

## Respaldos

- **Base de datos:** Supabase guarda copias de seguridad según el plan contratado; en el plan gratuito son limitadas. Para tener una copia propia, descarga un volcado con la cadena de `DIRECT_URL` (la imagen de Docker debe ser de la misma versión de PostgreSQL que tu proyecto de Supabase, o más nueva):

  ```bash
  docker run --rm postgres:17 pg_dump "<DIRECT_URL>" > respaldo.sql
  ```

  Guarda el archivo fuera del repositorio; contiene todos los datos.
- **Anexos:** los archivos del bucket `anexos` se descargan desde **Storage** en el panel de Supabase.

Los respaldos propios no son automáticos: lo que no copies se pierde si se borra el proyecto de Supabase.

## Limitaciones

- **Pausa por inactividad:** los proyectos gratuitos de Supabase se pausan si pasan días sin uso. Mientras esté pausado, la aplicación no responde; se reactiva desde el panel de Supabase.
- **Tamaño de anexos:** 25 MB por archivo.
