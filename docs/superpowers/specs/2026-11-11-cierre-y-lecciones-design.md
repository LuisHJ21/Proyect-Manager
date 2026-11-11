# Cierre del proyecto y lecciones aprendidas: especificación de diseño

**Fecha:** 2026-11-11
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-11-entregables-y-aceptacion-design.md`

## 1. Propósito

1. Cerrar un proyecto de forma ordenada, siguiendo el proceso de cierre de PMBOK:
   - comprobar qué queda abierto;
   - justificarlo si se cierra igualmente;
   - dejar un informe final que compare lo planificado con lo real.
2. Un proyecto cerrado o cancelado queda en solo lectura, para que su historia no cambie. El PM puede reabrirlo, y queda constancia.
3. Registrar lecciones aprendidas que el equipo pueda consultar en proyectos futuros.

### Criterios de éxito

1. El PM ve los pendientes antes de cerrar. Si hay alguno, solo puede cerrar escribiendo un motivo.
2. Tras cerrar, ninguna escritura sobre el proyecto prospera en la API, salvo las excepciones de la sección 4, y la interfaz oculta los controles de edición.
3. El informe de cierre queda congelado tal como estaba al cerrar y se puede imprimir.
4. Cualquier miembro registra lecciones, también con el proyecto cerrado. Cualquier usuario activo las encuentra en la página global "Lecciones aprendidas".

### Decisiones tomadas

- **Pendientes:** se avisa y se pide un motivo; no se bloquea el cierre.
- **Proyecto cerrado:** solo lectura y reabrible.
- **Lecciones:** las registra todo el equipo y se consultan en una vista global.
- **Vista global:** un colaborador ve las lecciones de todos los proyectos, pero solo el texto de la lección, su categoría, tipo, autor y el nombre del proyecto.
- **Cómo se impone el solo lectura:** con un guardia central en el servidor y una prueba que cubre todas las rutas de escritura.

## 2. Datos

- **`ProjectClosure`**, un registro por cada cierre:
  - Campos:
    - `id`, `projectId`;
    - `finalStatus` (`CLOSED` o `CANCELLED`);
    - `summary` (texto enriquecido saneado, por defecto vacío);
    - `pendingReason` (texto, por defecto vacío);
    - `report` (JSON con la foto del informe al cerrar);
    - `closedAt`, `closedById` (usuario, `Restrict`);
    - `reopenedAt?`, `reopenedById?` (usuario, `Restrict`);
    - `reopenReason` (por defecto vacío).
  - Se borra con su proyecto.
  - El cierre vigente es el último sin `reopenedAt`.
- **`Lesson`:**
  - Campos:
    - `id`, `projectId`, `authorId` (usuario, `Restrict`);
    - `type` (`WORKED_WELL` o `TO_IMPROVE`);
    - `category` (`SCOPE`, `SCHEDULE`, `COST`, `QUALITY`, `TEAM`, `COMMUNICATION`, `RISK`, `STAKEHOLDERS`, `PROCUREMENT` u `OTHER`);
    - `situation` (obligatorio, máximo 2000 caracteres);
    - `recommendation` (por defecto vacío, máximo 2000 caracteres);
    - fechas de creación y actualización.
  - Se borra con su proyecto.
- **Etiquetas:**
  - **Tipo:** `WORKED_WELL` → "Funcionó bien", `TO_IMPROVE` → "A mejorar".
  - **Categoría:** Alcance, Cronograma, Costos, Calidad, Equipo, Comunicación, Riesgos, Interesados, Proveedores, Otro.
- **Proyecto cerrado:** un proyecto con `status` `CLOSED` o `CANCELLED`. El estado sigue viviendo en `Project.status`, y `ProjectClosure` guarda el historial.
- **Índices:** `ProjectClosure(projectId)`, `Lesson(projectId)` y `Lesson(category)`.

## 3. Cierre y reapertura

### Pendientes

La función pura `closurePendings(input)` devuelve una lista de `{ kind, count }`, solo con los tipos que tienen al menos uno:

| `kind` | Qué cuenta | Etiqueta |
|---|---|---|
| `deliverables` | entregables no `ACCEPTED` | "Entregables sin aceptar" |
| `incidents` | incidentes `OPEN` o `IN_PROGRESS` | "Incidentes abiertos" |
| `risks` | riesgos `OPEN` o `TREATING` | "Riesgos abiertos" |
| `tasks` | tareas no `DONE` | "Tareas sin terminar" |
| `objectives` | objetivos `PENDING` | "Objetivos sin evaluar" |
| `charter` | acta inexistente o no `APPROVED` | "Acta sin aprobar" |

### Informe de cierre

La función pura `buildClosureReport(input, closingDate)` devuelve:

- **`dates`:** `plannedStart` y `plannedEnd` (del proyecto, pueden ser null), `actualStart` (la `startDate` más temprana de sus tareas, o null), `actualEnd` (= `closingDate`) y `endVarianceDays` (`actualEnd − plannedEnd`, null sin `plannedEnd`).
- **`budget`:** `plannedCents`, `actualCents` (suma de gastos), `varianceCents` (plan − real; negativo significa sobrecosto) y `currency`.
- **`performance`:** `{ cpi, spi, eacCents, vacCents }`, calculado con el cálculo de valor ganado existente a la fecha de cierre. Es null si no hay línea base.
- **`objectives`:** `{ met, notMet, pending }`.
- **`deliverables`:** cantidad por estado, `{ PENDING, IN_REVIEW, ACCEPTED, REJECTED }`.
- **`changes`:** `{ approved, rejected, pending }`.
- **`incidents`:** `{ total, open }`. **`risks`:** `{ total, open }`.
- **`pendings`:** la lista de `closurePendings`.

El dinero va en números enteros de centavos, convertidos con `Number()`; nunca como BigInt en el JSON.

### Reglas

- **Cerrar** solo es posible con el proyecto abierto (si no, 409) y solo lo hace el PM:
  - `finalStatus` es obligatorio;
  - si `pendings` no está vacía, `pendingReason` debe tener texto (400 en `pendingReason`).
- **Al cerrar, en una transacción:**
  - se calcula el informe con `closingDate = hoy`;
  - se crea el `ProjectClosure` con la foto;
  - `Project.status` pasa a `finalStatus`.
- **Reabrir** solo es posible con el proyecto cerrado (si no, 409) y solo lo hace el PM:
  - `reason` es obligatoria (400 en `reason`);
  - se rellenan `reopenedAt`, `reopenedById` y `reopenReason` del cierre vigente;
  - `Project.status` pasa a `EXECUTING`.
- **`PATCH /api/projects/:id`** con `status` `CLOSED` o `CANCELLED` responde 400 en `status`: "Para cerrar el proyecto usa la pestaña Cierre". Crear un proyecto con esos estados también responde 400.
- **Proyectos ya cerrados antes de esta versión:** quedan cerrados, sin registro de cierre. La pestaña Cierre muestra el informe calculado en ese momento, con la nota "Cerrado antes del registro de cierres", y permite reabrir. Al reabrir uno de estos se crea un registro de cierre con `report` igual a la foto calculada en el momento, y con la reapertura ya rellenada.

## 4. API

### Guardia de solo lectura

- Es un `preHandler` global, en `server/src/closedGuard.ts`, para POST, PATCH, PUT y DELETE.
- Se ejecuta después de la autenticación. Una petición anónima recibe su 401 de siempre.
- **Cómo encuentra el proyecto:**
  - `/api/projects/:id` y cualquier ruta que empiece así → `id`;
  - `/api/tasks/:id…` → el `projectId` de la tarea;
  - `/api/attachments/:id` → el `projectId` del anexo;
  - cualquier otra ruta no es de un proyecto y pasa sin comprobación.
- **Excepciones permitidas con el proyecto cerrado:**
  - `DELETE /api/projects/:id`;
  - cualquier ruta bajo `/api/projects/:id/lessons`;
  - `POST /api/projects/:id/reopen`.
- **Respuestas:**
  - si el proyecto o la tarea no existe, la petición pasa y la ruta responde su 404;
  - si el proyecto está cerrado, responde 409 `{ code: 'project_closed', message: 'El proyecto está cerrado. Reábrelo para hacer cambios.' }`.
- **Valor ganado:** `GET …/performance` no crea fotos diarias de valor ganado si el proyecto está cerrado.

### Cierre (solo el PM; colaborador 403, no miembro 404)

- **`GET /api/projects/:id/closure`** devuelve:
  - `status`: `'open'` o `'closed'`;
  - `report`: en vivo si está abierto; la foto guardada si está cerrado; en vivo si se cerró antes de esta versión;
  - `current`: el cierre vigente con `finalStatus`, `summary`, `pendingReason`, `closedAt` y `closedBy`, o null;
  - `legacy`: true si está cerrado sin registro;
  - `history`: todos los cierres, del más reciente al más antiguo, con `closedAt`, `closedBy`, `finalStatus`, `pendingReason`, `reopenedAt`, `reopenedBy` y `reopenReason`.
- **`POST /api/projects/:id/closure`:** recibe `{ finalStatus, summary?, pendingReason? }` y devuelve lo mismo que el GET.
- **`POST /api/projects/:id/reopen`:** recibe `{ reason }` y devuelve lo mismo que el GET.
- **Detalle y lista de proyectos:** añaden `closedAt`, la fecha del cierre vigente o null.

### Lecciones

- **Por proyecto:**
  - `GET /api/projects/:id/lessons`: cualquier miembro y el PM. Las lecciones van de la más reciente a la más antigua.
  - `POST /api/projects/:id/lessons`: cualquier miembro y el PM, con el proyecto abierto o cerrado.
  - `PATCH` y `DELETE /api/projects/:id/lessons/:lessonId`: el autor o el PM. Cualquier otro miembro recibe 403 y quien no es miembro, 404.
- **Global:** `GET /api/lessons`, para cualquier usuario autenticado.
  - Filtros opcionales:
    - `q` busca, sin distinguir mayúsculas, en `situation` y `recommendation`;
    - `category`;
    - `type`;
    - `projectId`.
  - Un valor no válido o repetido responde 400.
  - Responde con un máximo de 200 lecciones, de la más reciente a la más antigua.
- **Forma de cada lección:** `{ id, type, category, situation, recommendation, author: { id, name }, project: { id, name }, createdAt, updatedAt, canEdit }`.
  - `canEdit` es true si quien consulta es el autor o el PM.

## 5. Interfaz

- **Proyecto cerrado** (`ProjectLayout`):
  - Debajo del encabezado aparece el aviso "Proyecto cerrado el <fecha> · solo lectura", o "Proyecto cancelado el <fecha> · solo lectura".
  - El PM ve además el botón "Reabrir", que abre la ventana "Reabrir proyecto" con el campo "Motivo" obligatorio.
  - `useProject()` expone `readOnly`. Con `readOnly` se ocultan:
    - "Nueva tarea";
    - "Reportar incidente";
    - "Añadir…" y "Editar"/"Eliminar" de los registros;
    - la edición del acta y su aprobación;
    - la edición de la matriz RACI;
    - los botones de cambios, decisiones, línea base y entregables;
    - "Adjuntar archivo";
    - en el detalle de tarea: avance, pasos, dependencias, asignaciones y comentarios;
    - la gestión de miembros;
    - "Editar proyecto".
  - Si algún control se escapa, el 409 del servidor muestra su mensaje.
- **Formulario del proyecto:** el selector de estado solo ofrece Planificación, En ejecución y En pausa.
- **Pestaña "Cierre"** (ruta `cierre`, solo PM, la última):
  - **Proyecto abierto:**
    - tarjeta "Pendientes", con cada `kind`, su etiqueta, la cantidad y un enlace a su pestaña; si no hay ninguno, "Sin pendientes";
    - el informe, con la etiqueta "Vista previa";
    - el botón "Cerrar proyecto", que abre la ventana del mismo nombre con: "Estado final" (Cerrado o Cancelado), "Resumen de cierre" (`RichTextEditor`) y "Motivo de los pendientes". Este último solo aparece si hay pendientes, y con él vacío el botón "Cerrar proyecto" queda desactivado.
  - **Proyecto cerrado:**
    - el informe congelado;
    - el resumen y el motivo;
    - el botón "Imprimir informe", que llama a `window.print()`. Los estilos `@media print` ocultan la navegación, las pestañas y los botones.
  - **Secciones del informe:**
    - Fechas: plan, real y desviación en días;
    - Presupuesto: plan, real y desviación, en rojo si es negativa;
    - Desempeño: CPI, SPI, EAC y VAC, o "Sin línea base";
    - Objetivos;
    - Entregables;
    - Cambios;
    - Incidentes y riesgos.
  - **"Historial de cierre":** cada cierre y cada reapertura, con fecha, persona y motivo.
- **Pestaña "Lecciones"** (ruta `lecciones`, para todos, después de "Incidentes"):
  - Tarjetas con:
    - etiqueta de tipo: "Funcionó bien" en verde, "A mejorar" en ámbar;
    - categoría, situación, recomendación, autor y fecha;
    - "Editar" y "Eliminar" si `canEdit`.
  - Filtros "Tipo" y "Categoría", y el botón "Añadir lección", también con el proyecto cerrado.
  - Vacía, muestra "Aún no hay lecciones aprendidas."
- **Página "Lecciones aprendidas"** (`/lecciones`, en la navegación principal, para todos):
  - Búsqueda (300 ms de espera tras teclear) y filtros de categoría, tipo y proyecto.
  - Tarjetas con el nombre del proyecto, que enlaza a `/proyectos/<id>/lecciones`. Si no hay acceso, la ruta responde como hoy.
  - Solo lectura.
- **README:** sección "Cierre y lecciones aprendidas".

## 6. Pruebas

- **Dominio:**
  - `closurePendings`: cada `kind`, y la lista vacía;
  - `buildClosureReport`:
    - fechas con y sin plan;
    - sobrecosto negativo;
    - sin línea base, `performance` es null;
    - objetivos y entregables por estado.
- **Servidor:**
  - **Cobertura del guardia:** se recorren las rutas registradas en Fastify. Cada POST, PATCH, PUT o DELETE que empiece por `/api/projects/:id`, `/api/tasks/:id` o `/api/attachments/:id` responde 409 `project_closed` con un proyecto cerrado, salvo las excepciones.
  - **Excepciones:** permitidas con el proyecto cerrado.
  - **404:** un id inexistente responde 404, no 409.
  - **Cierre:**
    - sin pendientes, el cierre funciona;
    - con pendientes y sin motivo → 400;
    - con motivo → 200;
    - si ya está cerrado → 409;
    - la foto no cambia aunque cambien los datos después;
    - reabrir con motivo, su historial, y 409 si el proyecto está abierto;
    - el PATCH con `status: CLOSED` → 400;
    - un proyecto cerrado antes de esta versión (sin registro) muestra `legacy` y se puede reabrir.
  - **Lecciones:**
    - un miembro crea con el proyecto cerrado;
    - otro miembro no puede editar (403) y el PM sí;
    - un no miembro recibe 404;
    - filtros globales y `q`;
    - un parámetro repetido → 400;
    - la forma global no incluye datos del proyecto más allá de `{ id, name }`.
  - **Valor ganado:** no se crea una foto de valor ganado con el proyecto cerrado.
  - **Contadores:** `closedAt` está en el detalle del proyecto.
- **Interfaz (RTL):**
  - aviso y controles ocultos con el proyecto cerrado (Nueva tarea, Añadir en registros, Adjuntar archivo);
  - "Reabrir" con motivo obligatorio;
  - pestaña Cierre: pendientes con enlaces, motivo obligatorio, "Vista previa", informe congelado e "Imprimir informe";
  - el selector de estado sin Cerrado ni Cancelado;
  - lecciones: crear, editar solo con `canEdit`, filtros;
  - página global: búsqueda y enlace al proyecto.
- **e2e:** se amplía el flujo actual.
  1. El PM abre "Cierre", ve los pendientes y cierra con un motivo.
  2. Comprueba que "Nueva tarea" ya no aparece.
  3. Carlos añade una lección en "Lecciones".
  4. El PM la encuentra en "Lecciones aprendidas" buscando una palabra.
  5. El PM reabre el proyecto con un motivo.

## 7. Fuera de alcance

- Exportar el informe a PDF desde el servidor; la impresión del navegador cubre "Guardar como PDF".
- Encuestas de satisfacción.
- Liberación formal de recursos.
- Cierre de contratos.
- Notificaciones.
- Plantillas de cierre configurables.
- Votar lecciones.
- Adjuntar archivos a una lección.
