# C11 — Ediciones simultáneas

Bloque de la etapa 3 de `docs/guia-implementacion-pmbok.md`.

## Intención

Hoy prevalece el último guardado: si dos personas editan el mismo registro, la segunda pisa sin aviso lo que guardó la primera. Con F2 y F4 el equipo participa más y el riesgo crece. C11 hace que guardar el acta, una tarea, un riesgo o un entregable falle con un aviso claro cuando otra persona guardó cambios mientras tanto, en vez de perderlos.

Quién choca en la práctica: dos PM (el perfil es global y todos ven todos los proyectos), el mismo PM en dos pestañas, y en riesgos el PM y el colaborador responsable, que cambia el estado.

## Objetivos

- Ningún guardado de la edición de esos cuatro registros pisa en silencio un cambio ajeno a los mismos campos.
- Quien recibe el rechazo entiende qué pasó y ve la versión actual.
- Sin choques falsos: el avance y los pasos de una tarea no chocan con la edición del PM, porque no tocan los mismos campos.

## Fuera de alcance

- Otros registros (interesados, incidentes, decisiones, lecciones, RACI, proyecto, solicitudes de cambio). Quedan para cuando haga falta.
- Edición en tiempo real, bloqueo del registro mientras alguien lo edita, fusión automática de cambios.
- Botón «Guardar de todos modos».

## Anti-objetivos

- Que el PM pierda lo que escribió en el acta (textos largos) sin poder copiarlo.
- Que el colaborador o el PM reciban rechazos por cambios que no tocan lo que están guardando.

## Enfoques considerados

1. **Comparar `updatedAt` tal cual.** Sin migración, pero el avance y los pasos de una tarea también cambian `updatedAt`: el PM recibiría choques falsos cada vez que el equipo actualiza el avance. Descartado.
2. **Número de versión de edición** (elegido). Columna nueva `version` en los cuatro modelos que solo sube cuando cambia algún campo del formulario de edición. El navegador manda la versión que abrió; si no coincide, 409.
3. **Comparar campo por campo.** El navegador manda los valores originales y solo choca si cambió un campo enviado. El más preciso, pero el más complejo para el volumen de uso. Descartado.

El responsable eligió la 2.

## Diseño

### Datos

- Migración nueva: `version Int @default(1)` en `Charter`, `Task`, `Risk` y `Deliverable`. Los registros existentes quedan en 1.
- Las respuestas que hoy devuelven esos registros incluyen `version` (acta, DTO de tarea, DTO de riesgo en sus dos vistas, detalle y lista de entregables). Es un número sin información sensible; puede ir también a colaboradores y observadores.

### Regla del servidor

Las rutas de edición exigen `version` (entero positivo) en el cuerpo, definido en los esquemas de `shared/src/schemas.ts`:

| Ruta | Esquema |
| --- | --- |
| `PUT /api/projects/:id/charter` | `charterSchema` |
| `POST /api/projects/:id/charter/approve` | nuevo `approveCharterSchema = { version }` |
| `PATCH /api/tasks/:id` | `updateTaskSchema` |
| `PATCH /api/projects/:id/risks/:itemId` (PM y colaborador en modo `own`; `version` se añade a las claves permitidas del colaborador) | `updateRiskSchema` |
| `PATCH /api/projects/:id/deliverables/:did` (incluye el cambio de estado desde los botones) | `updateDeliverableSchema` |

- Sin `version`: 400 de validación en el campo `version` con el mensaje «Recarga la página para editar este registro».
- Si la versión no coincide con la guardada: 409 `edit_conflict`, «Otra persona guardó cambios en este registro mientras editabas».
- La comprobación y la escritura son una sola operación atómica: actualizar con `where: { id, version }` e incrementar `version`. Si no actualiza ninguna fila, 409. No se lee y luego se escribe en dos pasos, ni se guarda nada en memoria.
- El orden de errores existente se mantiene: 404 y 403 de acceso, y 409 `project_closed` de `closedGuard`, van antes del choque. Los errores de validación de los demás campos también.
- Acta sin cambios de contenido (la ruta ya responde sin escribir): responde igual, sin comprobar la versión, porque no pisa nada.

**Qué sube la versión** (todo lo que escribe un campo que el formulario de edición muestra):

- Las cinco rutas de la tabla, al guardar.
- `PUT /api/tasks/:id/assignees`: los responsables están en el formulario de la tarea. Sube la versión, sin exigirla.
- Registrar una revisión de entregable (`deliverableReviews.ts`): cambia el estado. Sube la versión, sin exigirla.
- Quitar un miembro del proyecto (`members.ts`), que deja sin responsable sus riesgos: sube la versión de esos riesgos.

**Qué no la sube:** el avance y el estado de la tarea (`/progress`), los pasos, los comentarios, las dependencias, los adjuntos, los criterios del entregable. No están en los formularios de edición.

### Interfaz (opción A, elegida por el responsable)

Ante un 409 `edit_conflict`:

- **Tarea, riesgo y entregable:** se muestra «Otra persona guardó cambios en este registro. Cargamos la versión actual; vuelve a aplicar tus cambios.», se recargan los datos y el formulario se rellena con la versión actual. Lo escrito se pierde, a propósito: son campos cortos.
- **Cambio de estado del riesgo (colaborador) y del entregable (botones):** el mismo aviso y se recarga la lista o el detalle.
- **Acta:** se muestra el aviso, pero el borrador queda en pantalla para poder copiarlo, con un botón «Cargar la versión actual» que reemplaza el borrador. El botón de guardar queda deshabilitado hasta cargarla.
- Cada formulario manda la `version` del registro que abrió.

### Pruebas

- Servidor, por cada ruta de la tabla: guarda con la versión correcta y la sube en 1; responde 409 `edit_conflict` con una versión vieja sin cambiar nada; responde 400 sin versión.
- El avance y un paso de la tarea no cambian la versión, y luego el PM guarda sin choque.
- Responsables, revisión de entregable y quitar un miembro sí la suben.
- Proyecto cerrado: sigue respondiendo `project_closed` antes que el choque.
- Las pruebas existentes de esas rutas se actualizan para mandar `version`. Las de permisos (`accessMatrix`, lo que no ve el colaborador) siguen pasando.
- Cliente: cada formulario manda `version`; ante 409 muestra el aviso y recarga; en el acta el borrador sigue visible hasta pulsar «Cargar la versión actual».

## Decisiones mías para revisar

- **Aprobar el acta también exige la versión.** Si otro PM cambió el texto mientras tanto, no se aprueba un texto que no has visto.
- **`version` obligatoria.** Opcional dejaría que un formulario olvidado siga pisando en silencio.
- **Responsables, revisión y quitar miembro suben la versión sin exigirla.** Son acciones puntuales que no editan a partir de una copia vieja.
- **Sin paso nuevo en el flujo e2e.** El choque necesita dos sesiones a la vez; lo cubren las pruebas de servidor y de cliente.

## Lo que queda al constructor

- Cómo hace la escritura atómica con Prisma (`updateMany` con `count`, o `update` con `version` en el `where` y el error P2025 convertido en 409).
- Cómo pasa la versión el formulario genérico de registros (`RegisterTable`) solo para riesgos.
- Dónde vive el helper que traduce el 409 en el aviso del cliente.
