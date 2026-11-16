# Etapa 7, bloque A: entrega y calidad (F12, F13)

## Intención

El PM necesita demostrar que lo que se entrega responde a lo que se pidió y que tiene la calidad acordada. Hoy existen entregables con criterios de aceptación, tareas ligadas (EDT) y revisiones de aceptación, pero nada dice de qué necesidad sale cada entregable, y la calidad no se mide salvo por la aceptación final. Este bloque agrega requisitos con trazabilidad y métricas de calidad, y ordena los defectos y no conformidades dentro de los incidentes.

La etapa 7 se parte en dos bloques; este es el primero. F15 (riesgos completos y supuestos) y F16 (medición ampliada) van en el bloque B.

## Objetivos

- **F12.** Registrar requisitos, ligarlos a entregables y ver la matriz de trazabilidad requisito → entregable → tareas → criterios. Las solicitudes de cambio citan los requisitos afectados.
- **F13.** Definir métricas de calidad con meta y mediciones, y distinguir defectos y no conformidades dentro de los incidentes, con vínculo al entregable. Al rechazar un entregable se puede registrar la no conformidad.

## No objetivos

- Calcular el estado «cumplido» del requisito automáticamente (solo se sugiere).
- Jerarquía de requisitos (padre e hijo) o versiones de un requisito.
- Gráficos de control estadístico; el historial de mediciones se muestra como lista y una línea simple.

## Antiobjetivos

- Que un colaborador u observador reciba el interesado de origen de un requisito.
- Que cambiar el tipo de un incidente cambie quién lo ve o lo edita (siguen las reglas de incidentes).

## Decisiones del responsable

1. Dos bloques: este (F12 y F13) primero.
2. Requisitos, matriz y métricas se ven como los entregables: todos los miembros leen, solo el PM edita. El interesado de origen se quita en el servidor para quien no es PM.
3. Las no conformidades siguen las reglas de incidentes existentes.

## Enfoques considerados

- **Registros propios con relaciones y tipo nuevo en incidentes (elegido):** `Requirement` con número por proyecto como entregables e incidentes; tablas de unión requisito–entregable y cambio–requisito; `Incident.kind` y `Incident.deliverableId`. Reutiliza permisos, avisos y bitácora.
- **No conformidades como registro separado:** descartado; duplicaría responsables, estados, avisos y la lista de incidentes.
- **Trazabilidad como texto en el entregable:** descartado; no permite la matriz ni los huecos.

## Permisos

Nuevas secciones en `shared/src/access.ts`:

| Sección | PM | Colaborador | Observador |
|---|---|---|---|
| `requirements` | write | read | read |
| `quality` (métricas) | write | read | read |

Rutas nuevas de escritura en `closedGuard`, matriz de acceso y bitácora, como siempre.

## F12. Requisitos y trazabilidad

### Datos

- `Requirement { id, projectId, number (REQ-N, contador `Project.lastRequirementNumber`), description (texto con formato, saneado), priority (`LOW | MEDIUM | HIGH`, por defecto `MEDIUM`), status (`PROPOSED | APPROVED | MET | REJECTED`, por defecto `PROPOSED`), stakeholderId? (interesado del proyecto, `SET NULL`), acceptance (noteText, criterio de aceptación del requisito), version (C11), createdAt, updatedAt }`. Etiquetas de estado: «Propuesto», «Aprobado», «Cumplido», «Rechazado».
- `RequirementDeliverable { requirementId, deliverableId }` (ambos en cascada), único por par.
- `ChangeRequestRequirement { changeRequestId, requirementId }` (ambos en cascada), único por par.
- RLS en las tablas nuevas.

### Rutas

- CRUD `/api/projects/:id/requirements` con `deliverableIds` en crear y editar (la lista completa reemplaza los vínculos). Cada entregable debe ser del proyecto («El entregable no pertenece a este proyecto»); el interesado también («El interesado no pertenece a este proyecto»). Edición versionada (409 si otro guardó antes).
- DTO: `{ id, number, description, priority, status, acceptance, version, deliverables: { id, number, name, status }[], stakeholder: { id, name } | null (solo PM), suggestMet: boolean }`. `suggestMet` = estado `APPROVED`, al menos un entregable y todos `ACCEPTED`.
- `GET /api/projects/:id/traceability` (sección `requirements`): `{ requirements: [{ id, number, description (texto plano), status, priority, deliverables: [{ id, number, name, status, tasks: { done, total }, criteria: { met, total } }] }], orphanDeliverables: { id, number, name }[] }` (entregables sin requisito). Las tareas cuentan hojas de la EDT ligadas al entregable.
- Solicitudes de cambio: crear y editar aceptan `requirementIds` (del proyecto). El DTO del cambio incluye `requirements: { id, number }[]`. El colaborador que propone un cambio puede citar requisitos (los ve).

### Interfaz

- Pestaña «Requisitos» (todos los que leen la sección): tabla con REQ-N, descripción, prioridad, estado, entregables; formulario del PM con selector múltiple de entregables e interesado de origen. Si `suggestMet`, aviso «Todos sus entregables están aceptados» con botón «Marcar cumplido».
- Debajo, «Matriz de trazabilidad»: una fila por requisito y entregable, con tareas terminadas y criterios cumplidos; requisitos sin entregable marcados «Sin entregable»; lista «Entregables sin requisito».
- Formulario de solicitud de cambio: selector «Requisitos afectados»; la solicitud muestra sus REQ-N.

## F13. Calidad

### Métricas

- `QualityMetric { id, projectId, name (shortText), unit (shortText, p. ej. «%», «defectos»), target (número decimal), direction (`HIGHER_BETTER | LOWER_BETTER`), deliverableId? (opcional, `SET NULL`), createdAt, updatedAt }`.
- `QualityMeasurement { id, metricId (cascada), date (YYYY-MM-DD, no futura: «No se registran mediciones futuras»), value (decimal), note (noteText), createdById }`.
- Estado de una métrica: último valor por fecha (empate por creación); `met` = `value ≥ target` si `HIGHER_BETTER`, `value ≤ target` si `LOWER_BETTER`; sin mediciones, `null`.
- Rutas: CRUD `/api/projects/:id/quality-metrics` (sección `quality`); `POST /api/projects/:id/quality-metrics/:metricId/measurements` y `DELETE …/measurements/:measurementId` (solo PM). El DTO de la métrica trae `latest: { date, value } | null`, `met: boolean | null` y `measurements` (más reciente primero).
- Interfaz: sección «Calidad» en la pestaña Entregables (debajo de la lista): tabla de métricas con meta, último valor y «Cumple» / «No cumple» / «Sin medir»; el PM añade métricas y registra mediciones; el detalle muestra el historial.
- El panel del PM y el informe de estado no cambian en este bloque.

### Defectos y no conformidades

- `Incident.kind`: `INCIDENT | DEFECT | NONCONFORMITY` (por defecto `INCIDENT`). Etiquetas «Incidente», «Defecto», «No conformidad».
- `Incident.deliverableId?` (entregable del proyecto, `SET NULL`; «El entregable no pertenece a este proyecto»).
- El tipo y el entregable los fija el PM (como prioridad y responsable); quien reporta crea un `INCIDENT` sin entregable.
- Lista de incidentes: columna y filtro por tipo; el entregable aparece en el detalle. El entregable muestra sus incidentes ligados en su detalle (para quien puede ver incidentes; el colaborador solo los suyos, como hoy).
- Al registrar una revisión con resultado `REJECTED`, el cuerpo acepta `nonconformity: { title } | undefined`. Si viene, en la misma transacción se crea un incidente `NONCONFORMITY` ligado al entregable, prioridad `HIGH`, reportado por el PM, con la nota de la revisión como descripción. La respuesta de la revisión incluye `nonconformity: { id, number } | null`. En la interfaz: casilla «Registrar no conformidad» (marcada por defecto al rechazar) con título prellenado «No conformidad: <nombre del entregable>».

## Validación

Todo en `shared/src/schemas.ts`: `createRequirementSchema`/`updateRequirementSchema` (con `version` en la edición), `requirementIds` en los esquemas de cambio, `createQualityMetricSchema`/`updateQualityMetricSchema`, `measurementSchema`, `kind` y `deliverableId` en los campos del PM del incidente, `nonconformity` en `deliverableReviewSchema` (solo válido con `REJECTED`: «Solo se registra una no conformidad al rechazar»).

## Pruebas que deben existir

- Requisitos: numeración; vínculos solo con entregables del proyecto; el colaborador y el observador leen sin `stakeholder` y reciben 403 al escribir; `suggestMet`; matriz con conteos y entregables sin requisito; un cambio cita requisitos y el colaborador puede citarlos al proponer.
- Calidad: `met` en ambos sentidos y sin mediciones; medición futura rechazada; último valor por fecha; lectura de todos, escritura del PM.
- Incidentes: el PM fija tipo y entregable; si el colaborador que reporta los envía, se ignoran, como hoy pasa con la prioridad; rechazar con `nonconformity` crea el incidente ligado y aceptar con `nonconformity` da 400.
- `closedGuard`, matriz de acceso, bitácora y RLS cubren lo nuevo.
- e2e: el PM crea un requisito ligado a un entregable y lo ve en la matriz.

## Decisiones mías (revisables)

- Estados del requisito y «cumplido» marcado a mano con sugerencia.
- Métricas en la pestaña Entregables y no en una pestaña nueva.
- La no conformidad desde la revisión es opcional y marcada por defecto.
- El colaborador puede citar requisitos al proponer un cambio.
- Un reportante no fija tipo: se comporta como hoy con los campos del PM.
