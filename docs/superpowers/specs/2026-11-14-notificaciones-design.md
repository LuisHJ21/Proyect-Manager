# F2. Notificaciones dentro de la aplicación

Bloque de la etapa 3 de `docs/guia-implementacion-pmbok.md` (dominio PMBOK 7: Trabajo del proyecto).

## Intención

Que cada persona se entere, sin que nadie se lo diga, de lo que le toca: una tarea o un incidente que le asignaron, un comentario en su tarea y una tarea que vence mañana o venció ayer. Hoy solo lo descubre si entra a buscarlo. El aviso llega por una campana en la barra lateral y lleva directo al elemento.

## Objetivos

- Avisos dentro de la aplicación para cinco eventos (tabla de abajo).
- Campana con el número de avisos sin leer, lista de avisos y «Marcar todo como leído».
- Ningún aviso revela datos que su destinatario no puede ver.

## Fuera de alcance

- Correo (exige un servidor SMTP; queda para después).
- «Cambio decidido»: hoy solo el PM registra y decide cambios y el solicitante es texto libre, así que no hay a quién avisar. Lo añade F4, cuando un miembro pueda proponer un cambio; el aviso irá a quien lo propuso.
- «Entregable en revisión»: solo el PM pasa un entregable a revisión, y el aviso le llegaría a él mismo. El responsable decidió quitar el evento.
- Preferencias por persona (silenciar tipos de aviso) y avisos en tiempo real (WebSocket).

## Anti-objetivos

- Un aviso que muestre a un colaborador costos, presupuesto, riesgos, interesados o cambios.
- Avisarle a alguien de lo que hizo él mismo.
- Una avalancha: un aviso repetido cada día por la misma tarea vencida.
- Que un fallo al crear un aviso haga fallar la acción del usuario.

## Enfoques considerados

- **A. Aviso explícito en cada ruta (elegido por el responsable).** Una función `notify()` se llama desde las rutas que hacen cada cambio y desde la tarea diaria. Cada regla de destinatarios queda junto al cambio que la provoca. Cuesta tocar varias rutas y acordarse de avisar en rutas futuras.
- **B. Derivar los avisos de la bitácora (F3).** Un solo lugar, pero la bitácora guarda responsables por nombre, no por usuario, y mezclaría dos funciones con reglas distintas: un fallo en una afectaría a la otra.

## Eventos y destinatarios

| Tipo (`kind`) | Cuándo | Quién lo recibe | Texto |
|---|---|---|---|
| `TASK_ASSIGNED` | Se crea una tarea con responsables o se añaden responsables a una existente | Cada responsable nuevo | «Te asignaron la tarea «Diseño»» |
| `TASK_COMMENTED` | Alguien comenta en una tarea | Los responsables de la tarea | «Beatriz comentó en tu tarea «Diseño»» |
| `TASK_DUE_SOON` | Tarea diaria: la fecha de fin es mañana y la tarea no está hecha | Los responsables | «La tarea «Diseño» vence mañana» |
| `TASK_OVERDUE` | Tarea diaria: la fecha de fin fue ayer y la tarea no está hecha | Los responsables | «La tarea «Diseño» venció ayer» |
| `INCIDENT_ASSIGNED` | Se crea un incidente con responsable o cambia su responsable, también al crearlo desde un riesgo | El responsable nuevo | «Te asignaron el incidente «INC-3 Caída»» |

Reglas comunes:

- Nunca se avisa a quien hizo el cambio (`actorId`). Las tareas diarias no tienen actor.
- Solo se avisa a usuarios activos.
- Los avisos de vencimiento se calculan con `deps.today()` y solo para proyectos que no están cerrados.
- Vencimientos sin avalancha: solo «mañana» y «ayer», no «vencida hace N días». Además una clave única por destinatario (`TASK_DUE_SOON:<taskId>:<dueDate>`) impide repetirlo si la tarea diaria corre dos veces; si la fecha cambia, la tarea vuelve a avisar. Si un día no corre la tarea diaria, ese aviso se pierde (aceptable).
- El texto solo lleva el título del elemento, el nombre del proyecto y, para comentarios, el nombre de quien comentó. Nunca el cuerpo del comentario.

## Modelo

```prisma
model Notification {
  id        String    @id @default(cuid())
  userId    String
  projectId String
  kind      String
  entityId  String
  title     String    // etiqueta del elemento al crear el aviso: «Diseño», «INC-3 Caída»
  actorName String    @default("") // quien comentó; vacío en los demás
  dedupeKey String?   // solo vencimientos
  readAt    DateTime?
  createdAt DateTime  @default(now())
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([userId, dedupeKey])
  @@index([userId, createdAt])
}
```

- Migración nueva con `ENABLE ROW LEVEL SECURITY` (lo exige `rls.test.ts`).
- `NOTIFICATION_KIND` en `shared/src/enums.ts`.
- La frase completa se arma en el cliente a partir de `kind`, `title` y `actorName`, igual que la bitácora.

## Servidor

- `server/src/notifications.ts`: `notify(prisma, { kind, projectId, entityId, title, actorId?, actorName?, userIds, dedupeKey? })`. Quita al actor y a los usuarios inactivos y crea las filas con `createMany({ skipDuplicates: true })`. Si falla, escribe en `console.error` y no lanza: la acción del usuario ya se hizo.
- Se llama después de escribir, en estas rutas: crear y editar tarea (responsables nuevos = después − antes), crear comentario, crear y editar incidente, y crear incidente desde un riesgo.
- `runDailyJobs` suma dos pasos: los avisos de vencimiento y el borrado de avisos con más de 90 días. Devuelve sus cuentas (`dueSoon`, `overdue`, `oldNotifications`).

### API (`server/src/routes/notifications.ts`)

Todas exigen sesión y solo tocan los avisos del usuario.

- `GET /api/notifications?before=<id>`: 30 por página, del más reciente al más antiguo, `{ items, nextCursor }`. Cada elemento lleva `{ id, kind, projectId, projectName, entityId, title, actorName, readAt, createdAt }`.
- `GET /api/notifications/unread-count`: `{ count }`.
- `POST /api/notifications/:id/read`: marca uno; 404 si no es del usuario.
- `POST /api/notifications/read-all`: marca todos.

Visibilidad: la lista y la cuenta solo incluyen avisos de proyectos a los que el usuario aún tiene acceso (miembro, o PM). Si lo quitan del proyecto, sus avisos de ese proyecto desaparecen de la vista sin borrarse.

Las rutas de escritura no son de proyecto: no las cubre `closedGuard`, y se añaden a `NOT_LOGGED` de la bitácora (lo exige su prueba de cobertura). El observador no recibe avisos, porque no se le puede asignar nada ni puede comentar, y su guardia de solo lectura se queda como está.

## Cliente

- `AppLayout.tsx`: campana en la barra lateral (y en la barra móvil) para PM y colaborador, con un globo con el número sin leer si es mayor que 0 («9+» desde 10). La cuenta se pide cada 60 segundos y al volver a la pestaña. El observador no ve la campana.
- Al pulsar la campana se abre un panel con la lista:

```
Avisos                       Marcar todo como leído
● Te asignaron la tarea «Diseño»
  Portal web · hace 5 min
  La tarea «Pruebas» vence mañana
  Portal web · ayer
                 Ver más
```

  - Sin leer: punto y texto en negrita. Al abrir un aviso se marca como leído y se navega: tareas a `/proyectos/:id/tareas/:taskId`, incidentes a `/proyectos/:id/incidentes`.
  - Si el elemento se borró, la página de destino muestra su estado de «no existe» habitual.
  - Vacío: «No tienes avisos».
- Las frases viven en `client/src/lib/notifications.ts` (`describeNotification`).

## Pruebas

- Servidor: una prueba por evento (quién recibe, quién no, el actor no). Además el destinatario inactivo, los vencimientos con la clave única (dos corridas, un aviso), el proyecto cerrado sin vencimientos y el borrado a los 90 días. En la API: un usuario no ve ni marca avisos ajenos, la visibilidad tras quitarlo del proyecto, la paginación y que un fallo de `notify` no cambia la respuesta de la ruta.
- Cliente: campana con la cuenta, «9+», la lista, marcar uno al abrirlo y «Marcar todo como leído», y el observador sin campana.
- e2e: en el flujo principal, el colaborador ve en la campana la tarea que le asignó el PM.

## Decisiones tomadas por Claude (el responsable puede corregirlas)

- Vencimientos solo «mañana» y «ayer», una vez por fecha de fin.
- Avisos con más de 90 días se borran en la tarea diaria.
- La campana se actualiza cada minuto y al volver a la pestaña (sin tiempo real).
- El enlace a un incidente lleva a la lista de incidentes, porque no hay página de detalle.
- Un aviso de un elemento borrado no se borra: al abrirlo se ve el «no existe».
- Visibilidad por acceso actual al proyecto, calculada al leer.
