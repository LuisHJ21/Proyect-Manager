# Bitácora de actividad (F3): especificación de diseño

**Fecha:** 2026-11-14
**Estado:** aprobada
**Origen:** función F3 de `docs/guia-implementacion-pmbok.md` (etapa 3: control y comunicación al abrir más información)

## 1. Propósito

Con los perfiles de acceso (C1 + F1), colaboradores y PM escriben en más partes del proyecto. El PM necesita saber quién hizo qué y cuándo, y para los datos que más se discuten, qué valor tenían antes y cuál después («¿quién movió la fecha de entrega?», «¿quién cerró este riesgo?»).

### Criterios de éxito

1. Toda escritura exitosa sobre un proyecto deja un registro con persona, fecha y hora, acción y elemento (con su nombre).
2. En los campos vigilados (sección 4.3) el registro guarda valor anterior y nuevo.
3. El PM ve la pestaña «Actividad» del proyecto, con filtros por persona y por tipo de elemento.
4. Colaborador y observador no ven la pestaña ni reciben la bitácora por la API.
5. Una ruta de escritura nueva sin su entrada en la tabla de actividad hace fallar una prueba.

### No objetivos

- Deshacer cambios desde la bitácora.
- Registrar lecturas, inicios de sesión o la administración de usuarios (no son de un proyecto).
- Notificar a nadie (eso es F2).
- Exportar la bitácora.

### Anti-objetivos

- Que la bitácora muestre a quien no es PM datos que su perfil oculta.
- Que registrar la actividad cambie la respuesta de una escritura que ya se guardó, o haga fallar la petición.

## 2. Situación actual

- No existe ningún registro de actividad.
- `registerClosedGuard` (`server/src/closedGuard.ts`) ya resuelve, para cada escritura, el patrón de la ruta (`routePatternOf`) y el proyecto (`projectIdOf`) de `/api/projects/:id/…`, `/api/tasks/:id/…`, `/api/attachments/:id/…` y `/api/local-uploads/:storedName`.
- Hay 63 rutas de escritura. Objetivos, hitos, interesados, riesgos y gastos comparten `registerProjectCrud`; el resto son rutas propias.
- La API corre en funciones sin servidor: nada puede quedar pendiente después de responder.

## 3. Enfoques considerados

1. **Tabla central (elegido por el responsable).** Un middleware lee el elemento antes de la escritura y después de ella, y compara los campos vigilados. Una tabla relaciona cada patrón de ruta con su tipo de elemento, su lectura y sus campos. No toca las rutas; una prueba de cobertura obliga a dar de alta cada ruta nueva. Costo: dos lecturas más por edición.
2. **Anotar en cada ruta.** Exacto y sin lecturas extra, pero obliga a tocar decenas de rutas y nada avisa si una ruta nueva olvida anotar.
3. **Interceptar Prisma.** No sabe quién hizo el cambio sin contexto asíncrono y registra escrituras internas (cascadas, tarea diaria). Descartado.

## 4. Diseño

### 4.1 Modelo

Migración nueva:

```prisma
model ActivityLog {
  id          String   @id @default(cuid())
  projectId   String
  userId      String
  action      String   // ver 4.4
  entity      String   // ver 4.3
  entityId    String?
  entityLabel String   @default("")
  changes     Json     @default("[]")   // [{ field, from, to }]
  createdAt   DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id])

  @@index([projectId, createdAt])
}
```

- `entityLabel` guarda el nombre del elemento al momento del cambio (título de la tarea, «INC-3 Caída del servidor», nombre de la persona miembro…). Así un borrado conserva qué se borró y un cambio de nombre posterior no reescribe la historia.
- `changes` guarda los valores ya legibles para personas e ids: un `ownerId` se guarda como nombre de la persona (`{ field: 'ownerId', from: 'Ana', to: 'Luis' }`). Los códigos de enumeración (`IN_PROGRESS`) se guardan como código y el cliente los traduce con `LABELS`. El dinero se guarda en centavos como número; las fechas, como texto `YYYY-MM-DD`.
- La guía proponía un campo `summary`; se sustituye por `action` + `entity` + `entityLabel` + `changes`, y el texto se arma en el cliente. (Decisión de Claude: permite filtrar y traducir sin analizar texto.)
- Al borrar el proyecto, su bitácora se borra con él.

### 4.2 Middleware

`registerActivityLog(app)` en `server/src/activityLog.ts`, registrado después de `registerClosedGuard` (solo registra lo que los guardias dejaron pasar).

1. Solo actúa en `POST`, `PATCH`, `PUT` y `DELETE` con sesión y con una entrada en la tabla para el patrón de la ruta. Reutiliza `routePatternOf` y `projectIdOf` (se exportan desde un módulo común en lugar de duplicarlos).
2. Antes de `next()`: en `PATCH`, `PUT` y `DELETE` lee el elemento con la función `load` de su entrada (estado «antes»).
3. Después de `next()`, solo si la respuesta es 2xx:
   - `POST` que crea: toma el `id` del JSON de la respuesta (en `POST /api/projects`, también el `projectId`) y lee el elemento para su nombre.
   - `PATCH` y `PUT`: vuelve a leer el elemento (estado «después») y compara los campos vigilados.
   - `DELETE`: usa el estado «antes».
   - Inserta el registro **antes** de devolver la respuesta (con `await`; nada queda en segundo plano).
4. Si la lectura o el insert fallan, se escribe el error en el log del servidor y la respuesta sale tal cual. (Decisión de Claude: la escritura del usuario ya se guardó; responder error lo induciría a repetirla.)
5. Una edición que no cambia ningún campo vigilado se registra igual, como «actualizó», con `changes` vacío. Además, `changes` lista sin valores los otros campos escalares que cambiaron (`{ field: 'description' }`), para que el PM sepa que se tocó la descripción sin guardar el texto. (Decisión de Claude.)

### 4.3 Tabla de actividad

`server/src/activity/table.ts`: `Record<patrón, ActivityEntry>` con `{ entity, action?, idParam, load(prisma, id), label(item), fields }`. Un mismo `load` y `fields` por tipo de elemento sirve para todas sus rutas.

| Tipo (`entity`) | Rutas | Campos vigilados (con valores) |
|---|---|---|
| `project` | `POST /api/projects`, `PATCH /api/projects/:id`, `PUT …/charter`, `POST …/charter/approve`, `POST …/closure`, `POST …/reopen`, `POST …/baselines` | `status`, `startDate`, `endDate`, `plannedBudgetCents` |
| `member` | `…/members` (alta, cambio, baja) | `projectRole` |
| `task` | `POST …/tasks`, `PATCH/DELETE /api/tasks/:id`, `PATCH …/progress`, `PUT …/assignees`, `…/dependencies` | `status`, `startDate`, `dueDate`, `progress`, `plannedCostCents`, `milestoneId` (como nombre del hito), `assignees` (lista de nombres) |
| `step` | `/api/tasks/:id/steps…` | `done`, `assigneeId` |
| `comment` | `POST /api/tasks/:id/comments` | — |
| `attachment` | `POST /api/attachments/:id/complete` (solo la primera vez), `DELETE /api/attachments/:id` | — |
| `objective` | `…/objectives…` | `status` |
| `milestone` | `…/milestones…` | `status`, `dueDate` |
| `stakeholder` | `…/stakeholders…` | — |
| `risk` | `…/risks…` | `status`, `ownerId`, `probability`, `impact` |
| `expense` | `…/expenses…` | `amountCents`, `date`, `category` |
| `raci` | `…/raci/activities…`, `PUT …/raci/cells` | — |
| `change` | `…/change-requests…`, `POST …/decision` | `status`, `scheduleImpactDays`, `costImpactCents` |
| `incident` | `…/incidents…`, `POST …/risks/:riskId/incident` | `status`, `ownerId`, `priority`, `dueDate` |
| `decision` | `…/decisions…` | `decidedOn` |
| `deliverable` | `…/deliverables…`, criterios, orden de criterios, revisiones | `status`, `dueDate`; en criterios, `met` |
| `lesson` | `…/lessons…` | `type`, `category` |

- Las rutas de un elemento hijo (criterio, paso, celda RACI, dependencia) registran el `entityLabel` del padre más el del hijo («Portal · Funciona en móvil»).
- **El acta** se registra como `project`: su `load` incluye el `Charter`, así que los campos del acta que cambian aparecen en «también cambió». (Decisión de Claude.)
- **Anexos:** pedir la subida (`POST …/attachments` de proyecto y de tarea) solo crea una fila pendiente que la limpieza diaria borra si no se completa, así que no se registra. Se registra `uploaded` al completar, y solo si el anexo estaba pendiente antes (completar es idempotente y no debe duplicar el registro). (Decisión de Claude.)
- **Incidente desde un riesgo:** se registra como `incident` `created`, con el id de la respuesta y la etiqueta «INC-n Título (desde el riesgo «…»)». La ruta no cambia el riesgo. Así aparece al filtrar por Incidentes. (Decisión de Claude.)
- **Rutas cuyo elemento va en el cuerpo de la petición.** Una entrada puede declarar `resolve(c, body, response)` en lugar de `idParam`; el middleware lee el cuerpo con `c.req.json()`, que Hono guarda para la ruta. (Decisión de Claude.)
  - `PUT …/raci/cells`: `entity: 'raci'`; la etiqueta es «Actividad · Persona o interesado»; `changes: [{ field: 'role', from, to }]`. La acción es `created` si no había rol, `deleted` si `role` es `null` y `updated` en otro caso.
  - `POST /api/tasks/:id/dependencies` y su `DELETE`: `entity: 'task'`, `created` o `deleted`, con la etiqueta «Tarea ← Predecesora».
  - `POST …/members`: el id sale de la respuesta y la etiqueta es el nombre de la persona.
  - `PUT …/deliverables/:did/criteria/order`: `deliverable` `updated`, con `changes: [{ field: 'criteriaOrder' }]`.
- **Filtro por tipo:** pasos, comentarios y anexos son tipos propios, no se agrupan bajo «Tarea». (Decisión de Claude.)
- Fuera de la tabla, a propósito (lista `NOT_LOGGED` con su motivo): `/api/auth/*`, `/api/setup`, `/api/users*` (no son de un proyecto), las solicitudes de subida de anexos y `PUT /api/local-uploads/:storedName` (el anexo se registra al completarse) y `DELETE /api/projects/:id` (su bitácora se borra con él).

### 4.4 Acciones

`action` es `created`, `updated` o `deleted` según el método, salvo que la entrada fije otra: `approved` (acta), `closed`, `reopened`, `baselined`, `decided` (cambio), `reviewed` (entregable), `commented`, `uploaded`. Las etiquetas en español van en `LABELS.activityAction` y `LABELS.activityEntity` de `shared`.

### 4.5 Permisos y API

- Nueva sección `activity` en `ACCESS` (`shared/src/access.ts`): PM `read`, Colaborador `none`, Observador `none`.
- `GET /api/projects/:id/activity?userId=&entity=&before=<cursor>`: 50 registros por página, del más reciente al más antiguo, con `nextCursor` cuando hay más. Responde 403 sin `can.read('activity')`. Cada registro incluye `user: { id, name }`.
- `GET /api/projects/:id/activity/filters`: personas y tipos con registros en el proyecto, para llenar los filtros.
- Como solo el PM ve la bitácora, puede contener costos y nombres de interesados sin romper la regla de datos ocultos.
- Un proyecto cerrado se puede consultar; no hay escrituras sobre la bitácora.

### 4.6 Interfaz

Pestaña «Actividad» en `ProjectLayout.tsx` (sección `activity`), al final, antes de «Cierre».

```
Actividad
[Persona: Todas ▾] [Tipo: Todos ▾]

Hoy
 10:42  Ana López   cambió la tarea «Diseño del portal»
                    Estado: En curso → Terminada · Avance: 80 % → 100 %
 09:15  Luis Pérez  creó el riesgo «Proveedor tarde»
13 nov 2026
 17:03  Ana López   actualizó el entregable «Portal» (también cambió: descripción)
 16:20  Luis Pérez  borró el gasto «Licencias»
                                   [Ver más]
```

- Agrupado por día con `shortDate`; hora local del navegador.
- Los ids de enumeración se muestran con `LABELS`; el dinero con el formato de moneda del proyecto; un valor vacío como «—».
- El nombre del elemento no es un enlace (el elemento puede no existir ya). (Decisión de Claude.)

## 5. Pruebas

- **Cobertura:** cada ruta de escritura de `listRoutes` está en la tabla o en `NOT_LOGGED`; falla si aparece una ruta sin clasificar.
- **Registro:** por cada tipo de elemento, crear, editar y borrar dejan un registro con acción, `entityLabel` y `changes` correctos; un campo vigilado guarda anterior y nuevo; un responsable se guarda como nombre; un borrado conserva el nombre; un campo no vigilado aparece sin valores.
- **No registra:** respuestas 4xx (validación, 403 del observador, 409 de proyecto cerrado) ni rutas de `NOT_LOGGED`.
- **Fallo del registro:** si el insert falla, la escritura responde igual que sin bitácora.
- **Permisos:** colaborador y observador reciben 403 en las dos rutas de actividad; la matriz de perfiles (`accessMatrix`) incluye la sección nueva.
- **Cliente:** la pestaña solo aparece para el PM; muestra cambios traducidos; los filtros y «Ver más» piden la página correcta.
- **e2e:** tras el tramo del colaborador, el PM ve en Actividad el cambio de estado que hizo el colaborador.

## 6. Queda a criterio de quien construye

- Nombres internos de funciones y la forma exacta de `ActivityEntry`.
- Cómo se comparan las listas (asignados): como conjunto ordenado de nombres.
- El texto exacto de cada frase en el cliente, siguiendo el boceto.
