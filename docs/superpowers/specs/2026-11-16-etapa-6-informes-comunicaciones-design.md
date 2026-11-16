# Etapa 6: informes y comunicaciones (F11, F9, F10)

## Intención

El PM necesita informar a quien sigue el proyecto sin trabajar en él (dirección, cliente, patrocinador) y llevar registro de con quién se comunica y qué se acuerda en las reuniones. Hoy el perfil Observador solo ve tareas, hitos, entregables y lecciones; no tiene un resumen del estado. Los interesados tienen poder e interés pero no cómo se involucran. Las reuniones no dejan rastro y sus acuerdos se pierden si nadie los pasa a mano a tareas, decisiones o incidentes.

Orden de construcción: F11, F9, F10.

## Objetivos

- **F11.** El PM emite cada cierto tiempo un informe de estado congelado que el observador puede leer sin montos.
- **F9.** El PM registra el nivel de involucramiento actual y deseado de cada interesado y ve dónde hay brecha.
- **F10.** El PM mantiene un plan de comunicaciones y levanta actas de reunión cuyos acuerdos se convierten con un clic en tarea, decisión o incidente.

## No objetivos

- Envío de informes por correo o a personas fuera de la aplicación.
- Recordatorios automáticos de las filas del plan de comunicaciones.
- Calendario de reuniones, invitaciones o recurrencia.
- Editar un informe ya emitido.

## Antiobjetivos (sería un fracaso aunque funcione)

- Que un observador o colaborador reciba montos (presupuesto, costo real, PV, EV, AC, EAC, VAC, reservas) por cualquier ruta nueva.
- Que un colaborador reciba interesados, riesgos o informes de estado.
- Que un informe emitido cambie cuando cambian los datos del proyecto.

## Decisiones del responsable

1. El observador ve el informe emitido completo menos los montos: salud, avance, CPI y SPI, hitos, riesgos principales (descripción y nivel), incidentes y cambios contados, próximos pasos y comentario del PM.
2. El colaborador no recibe informes de estado.
3. El colaborador ve las actas de las reuniones a las que asistió, con notas y acuerdos, sin los interesados asistentes (se quitan en el servidor). El observador no ve actas.

## Enfoques considerados

- **Seguir los patrones existentes (elegido):** informe congelado como JSON igual que `ProjectClosure.report`, permisos por sección en `shared/src/access.ts`, conversión de acuerdos reutilizando `createDecision` y `createIncident`. Encaja con todo lo construido y con las pruebas de matriz de acceso y `closedGuard`.
- **Informe calculado al leer con fecha de corte:** descartado; no es una foto fiel (los datos pasados cambian, p. ej. un gasto con fecha anterior registrado después) y contradice el requisito de congelarlo.
- **Actas como comentarios del proyecto:** descartado; no permite asistentes ni convertir acuerdos.

## Permisos

Dos secciones nuevas en `SECTIONS`:

| Sección | PM | Colaborador | Observador |
|---|---|---|---|
| `reports` (informes de estado) | write | none | read |
| `meetings` (actas) | write | own (asistió) | none |

El plan de comunicaciones usa la sección existente `stakeholders` (solo PM). Las vistas de involucramiento también.

Todas las rutas de escritura nuevas quedan cubiertas por `closedGuard`, entran en `ROUTE_SECTION` de `accessMatrix.test.ts` y en la tabla de bitácora (`activity/table.ts`) o en `NOT_LOGGED`.

## F11. Informe de estado periódico

### Datos

- `Project.statusReportFrequency`: `NONE | WEEKLY | BIWEEKLY | MONTHLY`, por defecto `NONE`. Lo edita el PM en el formulario del proyecto. Etiquetas: «Sin frecuencia», «Semanal», «Quincenal», «Mensual».
- `StatusReport { id, projectId, number (secuencial por proyecto, se muestra «Informe 3»), periodStart, periodEnd (YYYY-MM-DD), report (JSON texto), comment (texto con formato), nextSteps (texto con formato), issuedAt, issuedById }`. RLS activado. Contador `Project.lastStatusReportNumber` (interno, `toProjectDto` lo quita).

### Período

- `periodStart`: el día siguiente al `periodEnd` del informe anterior; si no hay, la fecha de inicio del proyecto; si no tiene, la fecha de creación del proyecto.
- `periodEnd`: el día de emisión (hoy). Se pueden emitir dos informes el mismo día; el segundo tiene período de un día que empieza tras el anterior, así que si `periodStart > periodEnd` se usa `periodStart = periodEnd`.

### Contenido (`StatusReportSnapshot`, función pura `buildStatusReport(input, period, today)` en `server/src/domain/statusReport.ts`)

- `health`: `computeHealth` del proyecto (o `null`).
- `progress`: `weightedProgress` de las hojas; `overdueTasks`, `blockedTasks`, `doneTasks`, `totalTasks` (solo hojas). No hay fecha de terminación de tareas, así que no se cuentan «terminadas en el período».
- `performance`: `{ cpi, spi, eacMethod, pvCents, evCents, acCents, eacCents, vacCents }` de `computeEvm` a la fecha, o `null` sin línea base.
- `budget`: `{ plannedCents, actualCents, varianceCents, currency }` (gastos más mano de obra, como el cierre).
- `milestones`: `reached` (con estado alcanzado y fecha prevista dentro del período; el hito no guarda cuándo se alcanzó), `upcoming` (pendientes con fecha en los 30 días siguientes), `overdue` (pendientes con fecha pasada). Cada uno `{ name, dueDate }`.
- `risks`: los 5 riesgos abiertos (no `CLOSED`) de mayor `probability × impact`, `{ description (texto plano), score, high (score ≥ HIGH_RISK_SCORE), status }`, más `openCount`.
- `incidents`: `{ open, openedInPeriod, resolvedInPeriod }`.
- `changes`: `{ pending, approvedInPeriod, rejectedInPeriod, appliedInPeriod }` (por `decidedAt` y `appliedAt`).
- `incidents.openedInPeriod` usa `createdAt` y `resolvedInPeriod` usa `resolvedAt`. Las marcas de tiempo se pasan a fecha `YYYY-MM-DD` con la misma zona que usa `deps.today()` antes de comparar con el período.
- `comment` y `nextSteps` del PM no van dentro del JSON: son columnas propias, saneadas con `sanitizeRichText`.

### Montos para quien no es PM

Función `stripMoney(snapshot)`: elimina `budget` completo y de `performance` deja solo `cpi`, `spi` y `eacMethod`. Se aplica en el servidor en cada respuesta a un perfil que no sea PM. Prueba: el JSON de la respuesta del observador no contiene ninguna clave que termine en `Cents`.

### Rutas

- `GET /api/projects/:id/status-reports`: lista (número, período, emitido, emisor), más reciente primero. PM y observador.
- `GET /api/projects/:id/status-reports/draft`: borrador en vivo (solo PM, va a `PM_ONLY_READS`): período que tendría y contenido calculado ahora.
- `POST /api/projects/:id/status-reports { comment, nextSteps }`: emite (solo PM). Calcula y congela en una transacción, incrementa el número. 201.
- `GET /api/projects/:id/status-reports/:reportId`: un informe. PM y observador (sin montos).
- Sin edición ni borrado.

Al emitir se notifica a los observadores miembros del proyecto: nuevo `NOTIFICATION_KIND` `STATUS_REPORT_ISSUED`, título «Informe N».

### Aviso de que toca emitir

Con frecuencia distinta de `NONE` y proyecto activo, toca emitir cuando `hoy ≥ último periodEnd + 7/14/30 días` (o, sin informes, `hoy ≥ inicio del proyecto + 7/14/30`). Aparece en la lista de atención del panel del PM como `kind: 'report'` con «Toca emitir el informe de estado» y en la página de informes.

### Interfaz

- Pestaña «Informes» en el proyecto (PM y observador).
- PM: botón «Nuevo informe» que muestra el borrador, dos editores de texto (Comentario, Próximos pasos) y «Emitir»; confirmación antes de emitir, porque no se puede editar después.
- Lista de informes emitidos y vista de un informe imprimible (mismo patrón que la vista del cierre). La vista oculta las secciones sin datos (p. ej. rendimiento sin línea base o montos para el observador).
- El resumen del proyecto muestra al PM y al observador un enlace «Último informe: Informe N (fecha)» si existe.

## F9. Involucramiento de interesados

### Datos

- `Stakeholder.currentEngagement`, `desiredEngagement`: `UNAWARE | RESISTANT | NEUTRAL | SUPPORTIVE | LEADING` o `null` (sin evaluar). Etiquetas: «Desconocedor», «Reticente», «Neutral», «De apoyo», «Líder».
- `Stakeholder.expectations`: texto plano, límite `noteText`.

### Vistas (página Interesados, solo PM)

- **Cuadrícula poder/interés:** 3×3 con `influence` (filas) e `interest` (columnas), nombres de los interesados en cada celda. Rótulos de los cuadrantes extremos: «Gestionar de cerca» (alta/alta), «Mantener satisfecho» (alta influencia, bajo interés), «Mantener informado» (baja influencia, alto interés), «Monitorear» (baja/baja).
- **Matriz de involucramiento:** filas = interesados, columnas = los 5 niveles; «A» en el actual y «D» en el deseado. Se resaltan las filas con brecha (actual distinto del deseado y ambos evaluados). Contador «N interesados con brecha».
- El formulario del interesado agrega los tres campos.

## F10. Plan de comunicaciones y actas de reunión

### Plan de comunicaciones (sección `stakeholders`)

- `CommunicationItem { id, projectId, topic (qué, shortText), audience (a quién, shortText), frequency, channel (shortText), ownerId (miembro del proyecto, opcional, no observador), notes (noteText), position }`. RLS.
- `frequency`: `ONCE | DAILY | WEEKLY | BIWEEKLY | MONTHLY | PER_MILESTONE | AS_NEEDED` («Una vez», «Diaria», «Semanal», «Quincenal», «Mensual», «Por hito», «Cuando se necesite»).
- Rutas CRUD bajo `/api/projects/:id/communications` con el patrón de registros existente (`projectCrud`), solo PM.
- Interfaz: tabla en la página Interesados, bajo las vistas de involucramiento.

### Actas de reunión (sección `meetings`)

- `Meeting { id, projectId, title (shortText), date (YYYY-MM-DD), notes (texto con formato, saneado), createdById, createdAt, updatedAt }`. RLS.
- `MeetingAttendee { meetingId, userId? , stakeholderId? }`: exactamente uno de los dos; el usuario debe ser miembro del proyecto (o el PM) y el interesado del mismo proyecto. Únicos por reunión.
- `MeetingAgreement { id, meetingId, text (shortText), ownerId? (miembro, no observador), dueDate?, position, taskId?, decisionId?, incidentId? }`. Las tres referencias con `ON DELETE SET NULL`.

Rutas:

- `GET /api/projects/:id/meetings`: PM todas; colaborador solo aquellas donde es asistente.
- `GET /api/projects/:id/meetings/:meetingId`: igual regla; el colaborador que no asistió recibe 404.
- `POST`, `PATCH`, `DELETE` de reunión (solo PM). El cuerpo incluye asistentes (`userIds`, `stakeholderIds`) y acuerdos (lista completa; los que traen `id` se actualizan, los nuevos se crean, los ausentes se borran). Un acuerdo ya convertido no se puede borrar ni cambiar su texto (409 `agreement_converted`, «Este acuerdo ya se convirtió»).
- `POST /api/projects/:id/meetings/:meetingId/agreements/:agreementId/convert { kind: 'task' | 'decision' | 'incident' }` (solo PM). Crea en una transacción:
  - tarea: título = texto, responsable = `ownerId` si hay, `dueDate` = fecha del acuerdo, en la raíz de la EDT al final (`nextPosition`), con las mismas validaciones que crear una tarea (fecha dentro del proyecto: si no cabe, el error de esa validación y nada se crea) y la misma notificación de asignación;
  - decisión: con `createDecision`, título = texto, fecha = fecha de la reunión;
  - incidente: con `createIncident`, título = texto, responsable = `ownerId`, fecha límite = fecha del acuerdo, reportado por el PM.
  Guarda el id en el acuerdo. Si ya estaba convertido: 409 `agreement_converted`. Respuesta: el acuerdo con su vínculo.

Vista del colaborador (DTO filtrado en el servidor): sin asistentes interesados; en cada acuerdo, solo el vínculo a tarea (`taskId`); `decisionId` e `incidentId` se quitan, se deja `convertedTo: 'decision' | 'incident'` para que sepa que se convirtió. Las notas son texto libre: lo que el PM escriba en ellas lo verán los asistentes (la interfaz lo dice bajo el editor: «Los asistentes del equipo verán estas notas»).

Interfaz: pestaña «Reuniones» (PM y colaborador). Lista por fecha descendente; formulario con fecha, título, asistentes (dos selectores: equipo e interesados), notas y acuerdos editables; en cada acuerdo, botones «Crear tarea», «Registrar decisión», «Registrar incidente» y, una vez convertido, enlace al elemento creado.

## Validación

Todo en `shared/src/schemas.ts`: `statusReportSchema` (`comment`, `nextSteps` con `longText`), `stakeholder` ampliado, `communicationItemSchema`, `meetingSchema` (con asistentes y acuerdos), `convertAgreementSchema`. Mensajes en español.

## Pruebas que deben existir

- Dominio: `buildStatusReport` (período, hitos alcanzados en el período, 5 riesgos ordenados, conteos de incidentes y cambios en el período), `stripMoney`, cálculo de «toca emitir».
- Rutas: emitir congela (cambiar un gasto después no cambia el informe); el observador recibe el informe sin ninguna clave `*Cents`; el colaborador recibe 403 en informes; número secuencial; notificación a observadores.
- Interesados: el colaborador no recibe los campos nuevos (403 como hoy).
- Actas: el colaborador ve solo las suyas y sin interesados ni ids de decisión o incidente; convertir dos veces da 409; borrar la tarea creada deja el acuerdo sin vínculo; asistente que no es miembro da 400.
- `closedGuard`, matriz de acceso y RLS cubren las rutas y tablas nuevas.
- e2e: el PM emite un informe y el observador lo abre.

## Decisiones mías (revisables) y lo que queda al constructor

Mías: secciones nuevas `reports` y `meetings`; período desde el informe anterior hasta hoy; 5 riesgos principales; hitos próximos a 30 días; notificación solo a observadores; un acuerdo convertido no se borra ni cambia de texto; «hito alcanzado en el período» por fecha prevista, porque el hito no guarda cuándo se alcanzó.

Al constructor:
- Diseño visual de la cuadrícula y la matriz, siguiendo los componentes de `ui.tsx`.
- Bitácora: emitir informe, crear/editar/borrar reunión y convertir acuerdo se registran; el plan de comunicaciones también.
