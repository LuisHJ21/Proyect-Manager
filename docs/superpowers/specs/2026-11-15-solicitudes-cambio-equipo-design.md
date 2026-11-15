# F4. Solicitudes de cambio desde el equipo

Guía: `docs/guia-implementacion-pmbok.md`, F4 (Trabajo del proyecto), etapa 3.

## Para qué

Hoy solo el PM registra cambios, y lo que el equipo detecta llega por fuera de la aplicación o no llega. En PMBOK 7 cualquier interesado puede pedir un cambio, y el control integrado decide. F4 deja que un colaborador proponga un cambio desde el proyecto. El PM analiza los impactos y decide, y quien lo propuso se entera de la decisión.

## Objetivos

- Un colaborador miembro del proyecto propone un cambio con título y descripción.
- La propuesta es una solicitud de cambio normal, en estado pendiente, con el solicitante ligado a su usuario.
- El colaborador ve solo sus propuestas, con su estado y la nota de decisión del PM.
- Aviso «propuesta de cambio» a los PM y aviso «cambio decidido» a quien la propuso (completa F2).

## Fuera de alcance

- Que el colaborador edite, retire o comente su propuesta.
- Que el colaborador vea las solicitudes de otros o cualquier impacto.
- Cambios al flujo del PM: crear, editar y decidir siguen igual. Lo único que cambia es borrar (ver Permisos).
- El observador sigue sin acceso a los cambios.

## Anti-objetivos

- Que un colaborador reciba, por cualquier ruta, impactos de alcance, plazo o costo. El costo está prohibido por las reglas del proyecto. El alcance y el plazo son el análisis del PM.
- Que un colaborador pueda fijar impactos o decidir mediante una petición hecha a mano.

## Enfoques

1. **Usar las solicitudes de cambio existentes (elegido).** Se añade el solicitante como usuario y el nivel de acceso `own` para el colaborador, igual que en los incidentes. El PM las ve en su pestaña de siempre. Las líneas base, las decisiones y el cierre no cambian.
2. **Bandeja aparte de propuestas.** Se descartó: duplica estados y numeración, y el aviso de decisión tendría que cruzar dos listas.

El responsable eligió el 1 y la opción A de visibilidad: solo sus propuestas, sin impactos.

## Diseño

### Datos

- `ChangeRequest.requestedById String?` es una relación con `User` (`onDelete: SetNull`) y lleva índice. Requiere una migración nueva.
- Al proponer, `requestedBy` (texto) se rellena con el nombre del usuario, así la pestaña del PM lo muestra sin más cambios. El PM puede seguir editando el texto.
- Solo el servidor fija `requestedById`, al proponer. No está en `changeRequestSchema` ni en `updateChangeRequestSchema`, y el PM no lo puede cambiar. Las solicitudes que crea el PM y las existentes quedan con `null`.
- El DTO del PM añade `proposedBy: { id, name } | null` para distinguir una propuesta del equipo de una solicitud que escribió el PM. El texto `requestedBy` sigue siendo el «Solicitado por» formal y el PM puede cambiarlo. El aviso de decisión siempre va a `proposedBy`. *(Decisión de Claude: la persona que propuso es quien espera la respuesta, aunque el PM anote otro solicitante formal.)*
- La numeración usa el mismo contador del proyecto.

### Permisos

- En `shared/src/access.ts`, `COLLABORATOR.changes` pasa de `'none'` a `'own'`, con el comentario «propone; ve las suyas, sin impactos».
- `GET /api/projects/:id/change-requests`:
  - El PM recibe todas, como hoy.
  - El colaborador recibe solo las que tienen `requestedById` igual a su usuario, en un DTO reducido: `id, number, title, description, status, decisionNote, decidedAt, decidedBy {id, name}, createdAt`. No incluye `scopeImpact`, `scheduleImpactDays`, `costImpactCents`, `requestedBy`, `requestedById` ni `updatedAt`.
- `POST /api/projects/:id/change-requests`:
  - El colaborador solo puede enviar `title` y `description`, con un nuevo `proposeChangeSchema` en shared, como `reportIncidentSchema`.
  - Cualquier otra clave responde 403: «Solo el Project Manager puede fijar impactos o solicitante».
  - Se guardan `requestedById` = usuario y `requestedBy` = su nombre.
  - Responde 201 con el DTO reducido.
- El PM crea como hoy, con `changeRequestSchema`. No se le fija `requestedById`, salvo que una propuesta venga de él mismo como colaborador, lo que no ocurre porque su perfil es PM.
- `PATCH`, `DELETE` y `POST …/decision` siguen pidiendo `write`, así que el colaborador recibe 403.
- El PM no puede borrar una propuesta del equipo (con `requestedById` no nulo). Responde 409 `change_proposed`: «Una propuesta del equipo no se borra: recházala con una nota». Así queda registrada y quien la propuso recibe el aviso. Las solicitudes que escribió el PM se siguen pudiendo borrar mientras estén pendientes. *(Decisión del responsable.)*
- Proyecto cerrado: el `POST` ya está cubierto por `closedGuard` y la bitácora ya registra la ruta. Hay que comprobar que la prueba de cobertura sigue pasando. La bitácora ya guarda quién hace cada petición, así que en una propuesta aparece el colaborador. No se añade el solicitante a las entradas posteriores. *(Decisión de Claude.)*
- Las pruebas de fuga existentes, que comprueban que el colaborador no recibe costos, deben seguir pasando. Se añade una prueba de que la lista y la respuesta del `POST` del colaborador no llevan ninguno de los tres impactos.

### Avisos (extiende F2)

- Tipos nuevos en `NOTIFICATION_KIND`:
  - `CHANGE_PROPOSED`: se envía al proponer, a todos los usuarios activos con perfil PM, sin el actor. El título es `CR-${number} ${title}`, el mismo código que muestra la interfaz. `actorName` es el nombre de quien propone.
  - `CHANGE_DECIDED`: se envía al decidir, solo a `requestedById` si existe y está activo, sin el actor. El título también es `CR-${number} ${title}`. El aviso guarda si se aprobó o rechazó en un campo nuevo `Notification.detail String @default("")`, con `APPROVED` o `REJECTED`, para que el texto diga «aprobaron» o «rechazaron».
- Textos:
  - «${actorName} propuso el cambio «${title}»».
  - «Aprobaron tu cambio «${title}»» o «Rechazaron tu cambio «${title}»».
- Enlace: los dos llevan a `/proyectos/:p/cambios`. Las solicitudes no tienen página propia.
- `notify` nunca tumba la petición, igual que en F2.

### Interfaz

- La pestaña «Control de cambios» aparece para el colaborador, porque `canRead` deja de ser `none`.
- El colaborador ve:
  - Un botón «Proponer cambio» que abre un formulario con título y descripción.
  - La lista de sus propuestas: número, título, estado y, si ya se decidió, la nota y quién decidió.
  - No ve el formulario del PM, ni los impactos, ni botones de editar, borrar o decidir.
  - En un proyecto cerrado no ve el botón.
- El PM ve «Propuesta por {nombre}» en las propuestas del equipo, y en ellas no aparece el botón de borrar. El resto de su pantalla no cambia.

## Lo que queda al constructor

- Si la vista del colaborador es un componente aparte dentro de `ChangeRequests.tsx` o un archivo nuevo.
- Cómo se nombran los helpers de la ruta.
- Si `detail` se rellena en otros avisos: por ahora queda vacío en todos los demás.
