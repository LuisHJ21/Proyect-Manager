# Incidentes y decisiones: especificación de diseño

**Fecha:** 2026-11-10
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-08-linea-base-y-cambios-design.md`

## 1. Propósito

1. Los problemas que ya ocurrieron quedan registrados, con responsable, prioridad y seguimiento hasta su cierre.
2. Quien vive el problema puede reportarlo. Normalmente es un colaborador.
3. Un riesgo que se materializa pasa a incidente sin volver a escribirlo.
4. Las decisiones del proyecto quedan registradas con su motivo, y se pueden consultar después.

### Criterios de éxito

1. Un colaborador reporta un incidente desde su proyecto o desde una tarea, y lo resuelve si es el responsable.
2. El PM ve todos los incidentes, los asigna, los prioriza, los cierra y ve en el panel los urgentes y los vencidos.
3. El PM pasa un riesgo a incidente con un clic.
4. El PM registra decisiones enlazadas a cambios o incidentes. Los colaboradores no las ven.

## 2. Incidentes

### Datos

- **`Incident`:** `id`, `projectId`, `number`, `title` (obligatorio), `description` (texto simple, por defecto vacío), `reportedById` (usuario, obligatorio), `ownerId` (usuario, opcional), `priority` (`LOW`, `MEDIUM`, `HIGH`; por defecto `MEDIUM`), `dueDate` (fecha, opcional), `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`; por defecto `OPEN`), `resolution` (texto, por defecto vacío), `taskId` (opcional), `riskId` (opcional), `resolvedAt`, `closedAt`, y fechas de creación y actualización.
- **Al borrar cosas relacionadas:**
  - el incidente se borra con su proyecto;
  - si se borra la tarea o el riesgo, el enlace queda vacío (`SetNull`);
  - si el responsable se borra, queda sin responsable (`SetNull`);
  - quien reportó no se puede borrar mientras tenga incidentes (`Restrict`, igual que los autores de comentarios).
- **Número:** correlativo por proyecto con un contador propio (`Project.lastIncidentNumber`). No se reutiliza aunque se borre un incidente. Se muestra como "INC-<n>".
- **Etiquetas:**
  - **Estados:** `OPEN` → "Abierto", `IN_PROGRESS` → "En curso", `RESOLVED` → "Resuelto", `CLOSED` → "Cerrado".
  - **Prioridades:** las mismas de las tareas: Baja, Media y Alta.
- **Vencido:** un incidente con fecha límite anterior a hoy y estado `OPEN` o `IN_PROGRESS`.

### Quién ve qué

- **PM:** todos los incidentes del proyecto.
- **Colaborador miembro:** los que reportó y los que tiene asignados. Cualquier otro responde 404, igual que si no existiera.
- **No miembro:** 404.

### Quién hace qué

| Acción | PM | Responsable (colaborador) | Quien reportó (colaborador) |
|---|---|---|---|
| Reportar (título, descripción, tarea) | Sí | Sí | Sí |
| Fijar responsable, prioridad, fecha límite o riesgo | Sí | No (403) | No (403) |
| Editar título y descripción | Sí | No (403) | No (403) |
| Pasar a `OPEN`, `IN_PROGRESS` o `RESOLVED` | Sí | Sí, si no está `CLOSED` | No (403) |
| Pasar a `CLOSED` o reabrir uno `CLOSED` | Sí | No (403) | No (403) |
| Borrar | Sí | No (403) | No (403) |

**Reglas de estado y campos:**

- **Al reportar:** un colaborador solo puede enviar `title`, `description` y `taskId`. Cualquier otro campo responde 403. El incidente queda `OPEN`, con prioridad `MEDIUM` y sin responsable.
- **Resolver:** pasar a `RESOLVED` exige una `resolution` con texto (400 en `resolution`) y guarda `resolvedAt`. Salir de `RESOLVED` deja `resolvedAt` en nulo.
- **Cerrar:** pasar a `CLOSED` guarda `closedAt`. Reabrir (de `CLOSED` a `OPEN` o `IN_PROGRESS`) deja `closedAt` y `resolvedAt` en nulo.
- **Validaciones:**
  - el responsable debe ser miembro del proyecto (400 en `ownerId`);
  - la tarea y el riesgo deben ser del proyecto (400 en `taskId` o en `riskId`).
- **Quitar a un miembro del proyecto:** sus incidentes como responsable quedan sin responsable. El aviso previo (`impact`) agrega `incidents`, que cuenta los abiertos o en curso donde es responsable.

### Pasar un riesgo a incidente

- `POST /api/projects/:id/risks/:riskId/incident` (solo PM) crea un incidente con:
  - el título igual al texto plano de la descripción del riesgo, recortado a 200 caracteres;
  - `riskId`;
  - el mismo responsable del riesgo;
  - prioridad `HIGH` si el puntaje del riesgo es 15 o más, y `MEDIUM` si no.
- El riesgo no cambia de estado.
- Los riesgos devuelven `incidents: [{ id, number, title, status }]` con sus incidentes enlazados.

## 3. Decisiones

- **`Decision`:** `id`, `projectId`, `number`, `title` (obligatorio), `rationale` (texto simple, por defecto vacío), `decidedBy` (texto libre, por defecto vacío), `decidedOn` (fecha, obligatoria; la interfaz propone hoy), `changeRequestId` (opcional), `incidentId` (opcional), y fechas de creación y actualización.
- **Al borrar cosas relacionadas:** la decisión se borra con su proyecto, y si se borra el cambio o el incidente, el enlace queda vacío (`SetNull`).
- **Número:** correlativo con contador propio (`Project.lastDecisionNumber`), sin reutilizar números. Se muestra "DEC-<n>".
- **Permisos:** solo el PM las ve y las administra. El colaborador recibe 403 y el no miembro, 404. El PM las edita y las borra en cualquier momento.
- **Validaciones:** el cambio y el incidente enlazados deben ser del proyecto (400 en `changeRequestId` o en `incidentId`).
- **Desde un incidente:** al cerrar un incidente, la ventana de cierre ofrece la casilla "Registrar como decisión". Si se marca, se crea una decisión con:
  - el título "Cierre de INC-<n>: <título>", recortado a 200 caracteres;
  - el motivo igual a la resolución;
  - `decidedBy` con el nombre del PM;
  - `decidedOn` con la fecha de hoy;
  - el `incidentId` del incidente.

## 4. API

- **Incidentes:**
  - `GET /api/projects/:id/incidents`: la lista visible para quien consulta, ordenada por número descendente. Acepta `?status=` (uno de los cuatro estados) y `?mine=1` (los que reportó o tiene asignados).
  - `POST /api/projects/:id/incidents` y `GET`, `PATCH` y `DELETE /api/projects/:id/incidents/:incidentId`.
- **Riesgos:** `POST /api/projects/:id/risks/:riskId/incident`.
- **Decisiones:** `GET` y `POST /api/projects/:id/decisions`, y `PATCH` y `DELETE /api/projects/:id/decisions/:decisionId`.
- **Cerrar un incidente con decisión:** `PATCH .../incidents/:incidentId` acepta `{ status: 'CLOSED', recordDecision: true }`. Solo el PM; crea la decisión en la misma transacción.
- **Forma de cada incidente:**

```
{
  id, number, title, description, priority, dueDate, status, resolution, resolvedAt, closedAt, createdAt,
  overdue,
  reportedBy: { id, name },
  owner: { id, name } | null,
  task: { id, title } | null,
  risk: { id, title } | null,
  can: { edit: boolean, changeStatus: boolean, close: boolean }
}
```

  - `risk.title` es el texto plano de la descripción del riesgo. Solo se envía al PM; para un colaborador vale `null`, porque los riesgos son del PM.
  - `can` indica lo que quien consulta puede hacer, para que la interfaz no repita las reglas.
- **Forma de cada decisión:** `{ id, number, title, rationale, decidedBy, decidedOn, changeRequest: { id, number, title } | null, incident: { id, number, title } | null, createdAt }`.
- **Detalle de tarea:** agrega `incidents: [{ id, number, title, status }]` con los que quien consulta puede ver.
- **Panel del PM:** "Requiere atención" agrega elementos `kind: 'incident'` para los incidentes `OPEN` o `IN_PROGRESS` de proyectos activos que son de prioridad `HIGH` o están vencidos, con `title`, `projectId`, `projectName`, `number`, `priority`, `dueDate` y `overdue`.

## 5. Interfaz

### Pestaña Incidentes (todos los miembros)

- Va después de "Anexos" y la ven todos.
- **Filtros:** estado (Todos, Abiertos, En curso, Resueltos, Cerrados) y la casilla "Míos". Para el colaborador, "Míos" está siempre aplicado y no se muestra.
- **Tabla:**
  - número, título y prioridad (con color y texto);
  - responsable ("Sin responsable" si no hay);
  - fecha límite, con "Vencido" en rojo y texto si corresponde;
  - estado.
- **"Reportar incidente":** abre una ventana con Título, Descripción y Tarea (opcional). El PM además ve Responsable, Prioridad y Fecha límite.
- **"Ver":** abre el detalle con todos los datos, los enlaces a la tarea y al riesgo (este solo para el PM), y las acciones que permite `can`:
  - **"Marcar en curso"**;
  - **"Resolver"**, que pide la resolución;
  - **"Editar"** (PM);
  - **"Cerrar"** (PM), con la casilla "Registrar como decisión";
  - **"Reabrir"** (PM);
  - **"Eliminar"** (PM).
- **Estado vacío:** "No hay incidentes" y el botón para reportar.

### Pestaña Control de cambios (solo PM)

- La pestaña "Cambios" pasa a llamarse "Control de cambios" y conserva la ruta `cambios`.
- Contiene dos tarjetas, una debajo de otra:
  - **"Solicitudes de cambio":** lo que ya existe, sin cambios.
  - **"Decisiones":** una tabla con número, título, fecha, quién decidió y los enlaces. Tiene "Añadir decisión", "Ver", "Editar" y "Eliminar".
- **Formulario de decisión:** Título, Motivo, Quién decidió, Fecha (por defecto hoy), Cambio relacionado (opcional, todos los cambios del proyecto) e Incidente relacionado (opcional).

### Otras pantallas

- **Detalle de tarea:** botón "Reportar incidente", que abre la ventana con la tarea ya elegida, y una sección "Incidentes" con los enlazados que quien consulta puede ver.
- **Detalle de riesgo** (ventana "Ver"): botón "Pasar a incidente" y una lista "Incidentes" con número, título y estado de los enlazados.
- **Panel:** "Requiere atención" muestra los incidentes con su número y "Prioridad alta" o "Vencido", con un enlace a la pestaña Incidentes.
- **Quitar miembro:** el aviso agrega "y será responsable de N incidente(s) menos".

### Móvil

Las tablas se desplazan dentro de su caja y los filtros pasan a otra línea.

## 6. Errores

- Los errores por campo se muestran bajo el campo, sin perder lo escrito.
- Una acción rechazada (403 o 400) muestra el motivo y recarga el incidente.
- Un incidente que dejó de estar visible (por ejemplo, porque cambió el responsable) responde 404. La interfaz cierra la ventana y recarga la lista.

## 7. Pruebas

- **API de incidentes:**
  - qué ve cada rol en la lista y en el detalle (404 para el colaborador ajeno);
  - un colaborador que reporta con campos del PM recibe 403;
  - transiciones permitidas y prohibidas por rol;
  - resolver sin resolución da 400, y se guardan y se limpian `resolvedAt` y `closedAt`;
  - numeración sin reutilizar números;
  - validaciones de responsable, tarea y riesgo de otro proyecto;
  - `?status=` y `?mine=1`;
  - `overdue`;
  - `can` por rol;
  - `risk` es `null` para el colaborador.
- **Riesgo a incidente:** título, responsable, prioridad según el puntaje, y `incidents` en el riesgo.
- **Cascadas:** borrar la tarea o el riesgo deja el enlace vacío; quitar a un miembro lo saca como responsable; `impact.incidents`.
- **Decisiones:** permisos, numeración, validaciones de enlaces, edición y borrado, y "Registrar como decisión" al cerrar.
- **Panel:** aparecen los de prioridad Alta abiertos y los vencidos; no aparecen los resueltos ni los de proyectos cerrados.
- **Interfaz:**
  - acciones según `can`;
  - marca de vencido con texto;
  - reporte desde una tarea con la tarea ya elegida;
  - filtros;
  - pasar un riesgo a incidente;
  - registro de decisiones y la casilla al cerrar.
- **Flujo completo:** Carlos reporta un incidente desde su tarea. El PM le asigna responsable, prioridad Alta y fecha. Carlos lo resuelve con una resolución. El PM lo cierra con "Registrar como decisión" y ve la decisión DEC-1 en Control de cambios.

## 8. Fuera de alcance

- Comentarios y adjuntos en incidentes.
- Notificaciones por correo.
- Incidentes en el calendario y en "Mis tareas".
- Decisiones visibles para los colaboradores.
- Edición del título y la descripción por quien reportó.
