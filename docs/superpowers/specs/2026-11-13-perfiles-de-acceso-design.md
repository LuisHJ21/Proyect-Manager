# Perfiles de acceso (C1 + F1): especificación de diseño

**Fecha:** 2026-11-13
**Estado:** aprobada en conversación; pendiente de revisión del documento
**Origen:** corrección C1, función F1 y parte de C13 de `docs/guia-implementacion-pmbok.md` (decisión 3 de la sección 3)
**Depende de:** `docs/superpowers/specs/2026-11-13-pm-ejecuta-tareas-design.md` (C2, ya fusionado)

## 1. Propósito

Hoy hay dos perfiles y el permiso es un sí/no («¿es PM?»). Eso deja dos huecos:

1. **C1:** el equipo trabaja con datos que no ve. Un colaborador puede ser responsable de un riesgo pero no verlo, y construye entregables cuyos criterios de aceptación no conoce.
2. **F1:** no hay forma de dar acceso puntual de solo lectura a alguien (un patrocinador, un cliente) sin darle lo mismo que al equipo.

Se añade el perfil **Observador** y se sustituye el sí/no por una tabla de capacidades por perfil y sección, que usan el servidor y el cliente.

### Criterios de éxito

1. Existen tres perfiles de cuenta: PM, Colaborador y Observador. El PM los crea y cambia desde Usuarios.
2. El colaborador ve los entregables con sus criterios e historial de revisiones (solo lectura) y los riesgos de los que es responsable, a los que puede cambiar el estado.
3. El observador ve solo los proyectos donde es miembro, y en ellos solo las secciones de la tabla de la sección 3. Ninguna escritura suya prospera en la API.
4. Los datos ocultos a un perfil no salen de la API para ese perfil. Una prueba de matriz perfil × ruta lo comprueba, igual que la prueba de cobertura de `closedGuard`.
5. Las pantallas muestran a cada perfil solo las pestañas, menús y botones que puede usar.

### No objetivos

- Permisos configurables por proyecto o por persona: la tabla es fija.
- Que cada PM vea solo sus proyectos (`Project.ownerId`): sigue fuera, como en C2.
- Informes de estado (F11): el observador los verá cuando existan; no se crean aquí.
- Cambiar lo que el colaborador ve hoy salvo lo de C1 (entregables y riesgos propios).

### Antiobjetivos (fallaría aunque funcione)

- Que un observador o colaborador reciba en alguna respuesta costos, presupuesto, desempeño, riesgos ajenos, interesados o control de cambios, aunque la pantalla no los muestre.
- Que una regla de permisos quede escrita solo en el cliente.
- Que cambiar el perfil de alguien borre trabajo sin avisar.

## 2. Situación actual

- `getProjectAccess` (`server/src/auth/access.ts`) devuelve `{ project, isPm }`; un no PM debe ser miembro o recibe 404. `requireProjectPm` lanza 403 a quien no es PM. Unas 15 rutas lo usan.
- `registerProjectCrud` (`server/src/routes/projectCrud.ts`) recibe `readAccess: 'member' | 'pm'`; las escrituras exigen PM. Lo usan objetivos, hitos (member), interesados, riesgos y gastos (pm) en `registers.ts`.
- Incidentes: `incidentAccess` (`server/src/domain/incidents.ts`) da al no PM ver los suyos (reportados o de los que es responsable) y cambiar el estado de los que es responsable. Es el modelo para los riesgos.
- Entregables, decisiones, cambios, RACI, desempeño, cierre: solo PM. Lecciones del proyecto: cualquier miembro lee y crea. `GET /api/lessons` (biblioteca global) devuelve las de todos los proyectos a cualquier usuario.
- Anexos: cualquier miembro lee y descarga; sube el PM o el asignado a la tarea.
- Cliente: `ProjectLayout.tsx` filtra pestañas con `pmOnly`; `AppLayout.tsx` tiene menús `PM_LINKS` y `COLLABORATOR_LINKS`; `HomeRedirect` manda al PM a `/panel` y al resto a `/mis-tareas`.
- `User.role` es texto en la base (no enum de Postgres): añadir un valor no requiere migración. `ROLE` está en `shared/src/enums.ts` con sus etiquetas en `LABELS.role`.
- `closedGuard` (`server/src/closedGuard.ts`, registrado en `server/src/app.ts`) rechaza escrituras en proyectos cerrados y tiene una prueba que recorre todas las rutas de escritura.

## 3. Tabla de capacidades

Niveles: **escribir** (incluye leer), **leer**, **propio** (solo los registros donde la persona es responsable, reportante o asignada, según la sección), **no**.

| Sección | PM | Colaborador | Observador |
|---|---|---|---|
| Proyecto y resumen (indicadores sin costos para no PM) | escribir | leer | leer |
| Acta, objetivos, hitos | escribir | leer | leer |
| Tareas, pasos, dependencias | escribir | leer; avance y pasos de sus tareas | leer |
| Comentarios de tareas | escribir | leer; comentar en sus tareas (como hoy) | no |
| Anexos | escribir | leer; subir a sus tareas; borrar los suyos | leer y descargar |
| Miembros (nombre, correo, rol en el proyecto) | escribir | leer | leer |
| Matriz RACI | escribir | no | no |
| Entregables, criterios y revisiones | escribir | **leer** (C1) | leer |
| Lecciones del proyecto | escribir | escribir (como hoy) | leer |
| Incidentes | escribir | propio (como hoy) | no |
| Decisiones | escribir | no | no |
| Riesgos | escribir | **propio: ver y cambiar estado** (C1) | no |
| Interesados | escribir | no | no |
| Presupuesto y gastos | escribir | no | no |
| Desempeño (valor ganado) | escribir | no | no |
| Control de cambios | escribir | no | no |
| Cierre e informe de cierre | escribir | no | no |

Fuera de los proyectos:

| Página | PM | Colaborador | Observador |
|---|---|---|---|
| Panel (`/panel`), Usuarios | sí | no | no |
| Mis tareas | sí | sí | no |
| Proyectos (lista) | todos | donde es miembro | donde es miembro |
| Calendario | todo | sus tareas e hitos de sus proyectos (como hoy) | tareas e hitos de sus proyectos |
| Biblioteca de lecciones (`/lecciones`, `GET /api/lessons`) | todas | todas (como hoy) | **solo las de sus proyectos** (C13) |

## 4. Diseño

### 4.1 Perfil Observador

- `ROLE = ['PM', 'COLLABORATOR', 'OBSERVER']` y `LABELS.role.OBSERVER = 'Observador'`. Sin migración.
- Usuarios (`client/src/pages/Users.tsx` y `EditUserModal.tsx`) ofrecen los tres perfiles.
- Un observador no puede ser asignado a tareas ni pasos (`assertAssignable` ya filtra `PM`/`COLLABORATOR`), ni ser responsable de un riesgo o incidente (las validaciones de `ownerId` añaden la condición de rol). Sí puede estar en la matriz RACI con cualquier letra.
- **Cambiar a alguien a Observador con trabajo abierto se rechaza.** `PATCH /api/users/:id` con `role: 'OBSERVER'` responde 409, código `observer_has_work`, mensaje «Tiene trabajo abierto: reasígnalo antes de cambiar su perfil a Observador», y `details` con los conteos en proyectos activos: tareas no terminadas asignadas, pasos no hechos asignados, riesgos no cerrados de los que es responsable, incidentes abiertos o en curso de los que es responsable. Con todo en cero, el cambio procede y no borra nada. La regla de «al menos un PM activo» se mantiene.

### 4.2 Capacidades en `shared`

- Nuevo `shared/src/access.ts` con el tipo `Section` (una clave por fila de la tabla de proyecto de la sección 3), `Level = 'write' | 'read' | 'own' | 'none'` y la tabla `ACCESS: Record<Role, Record<Section, Level>>`, copiada de la sección 3. Se exporta desde `shared/src/index.ts`.
- Funciones puras: `canRead(role, section)` (verdadero para `read`, `write` y `own`) y `canWrite(role, section)` (solo `write`). `own` se resuelve en la ruta, que filtra por la persona.
- Las excepciones finas que no caben en la tabla siguen en código y se nombran en la tabla con texto: avance y pasos del asignado, anexos del asignado, estado del riesgo o incidente propio.

### 4.3 Servidor

- `getProjectAccess(c, projectId)` devuelve `{ project, role, can }`, donde `can = { read(section), write(section), level(section) }` según el perfil del usuario. Mantiene: PM ve todo proyecto; los demás deben ser miembros o reciben 404. Se mantiene `isPm` derivado (`role === 'PM'`) mientras haya código que lo use; las rutas tocadas pasan a `can`.
- `requireProjectAccess(c, projectId, section, 'read' | 'write')` sustituye a `requireProjectPm`: 403 si el nivel no alcanza. `requireProjectPm` desaparece al final o queda como alias de `write` sobre la sección correspondiente.
- `registerProjectCrud` recibe `section: Section` en lugar de `readAccess`; GET exige leer, escrituras exigen escribir. Para `risks`, el nivel `own` filtra la lista por `ownerId` del usuario y permite un `PATCH` que solo cambie `status` (cualquier otro campo → 403, mensaje «Solo puedes cambiar el estado de los riesgos de los que eres responsable»), siguiendo `incidentAccess`. Se añade `riskAccess` en `server/src/domain/` con la misma forma que `incidentAccess` y su prueba.
- **Guardia de observador:** middleware global que rechaza con 403 (código `observer_read_only`, mensaje «Tu perfil es de solo lectura») toda petición `POST`, `PUT`, `PATCH` o `DELETE` de un usuario `OBSERVER`, salvo `POST /api/auth/logout` y `POST /api/auth/change-password`. Mismo patrón que `closedGuard`, con su prueba de cobertura que recorre todas las rutas de escritura registradas.
- Rutas que cambian su acceso según la tabla: entregables (`GET` lista y detalle, revisiones dentro del detalle) pasan a leer para colaborador y observador; comentarios de tareas: `GET /api/tasks/:id` no incluye `comments` para el observador; incidentes, decisiones, RACI y el resto de secciones «no» responden 403 al observador; `GET /api/lessons` filtra por proyectos donde el observador es miembro; `GET /api/calendar` del observador devuelve tareas e hitos de sus proyectos (no solo los asignados); `GET /api/me/tasks` responde lista vacía al observador (no 403, para no romper clientes).
- **Quién revisó un entregable:** para quien no es PM, el DTO de entregables omite `lastReview.stakeholderName` y, en cada revisión, `stakeholder` y `stakeholderName`. Se envían el resultado, la fecha y las notas. Una prueba comprueba que la respuesta al colaborador y al observador no contiene esos campos ni el nombre del interesado. En la pantalla, la revisión se muestra como «Aceptado el 10/11/2026» (o «Rechazado el …»), sin nombre.
- Los DTO no cambian salvo lo dicho: la regla de no enviar costos a quien no es PM sigue igual y se extiende al observador (en `toProjectDto`, `toTaskDto`, indicadores, etc., donde hoy se pasa `isPm`).

### 4.4 Cliente

- `useAuth` expone `role` además de `isPm`. Un hook `useProjectAccess()` (o similar) usa `ACCESS` de `shared` para decidir pestañas y botones.
- `ProjectLayout.tsx`: las pestañas se filtran con `canRead(role, section)` en lugar de `pmOnly`. Entregables y Riesgos aparecen al colaborador; Riesgos muestra solo los suyos y solo permite cambiar su estado.
- Menú del observador (`AppLayout.tsx`): Proyectos, Calendario y Lecciones. `HomeRedirect` lleva al observador a `/proyectos`. `/mis-tareas` redirige al observador a `/proyectos`.
- Para el observador se ocultan todos los controles de escritura: crear, editar, borrar, comentar, subir anexos, reportar incidentes, registrar lecciones. Se reutiliza el mecanismo de solo lectura que ya usa el proyecto cerrado donde exista.
- Detalle de tarea del observador: sin sección de comentarios.

### 4.5 Decisiones del constructor (tomadas por Claude al revisar el documento)

- **Comentarios:** el colaborador sigue comentando solo en las tareas que tiene asignadas, como hoy (`POST /api/tasks/:id/comments`). La matriz espera 403 para un colaborador no asignado.
- **Vínculo de incidente a riesgo:** no cambia; el DTO de incidentes sigue enviando el riesgo vinculado solo al PM, aunque el colaborador sea responsable de ese riesgo. Ampliarlo queda fuera de este bloque.

## 5. Alternativas consideradas

- **Tabla de capacidades compartida (elegida):** una sola fuente para servidor y cliente; la prueba de matriz se escribe sobre ella; añadir un perfil o sección es una fila.
- **Banderas por ruta (`isPm`, `isObserver`):** menos cambio inicial, pero las reglas quedan repartidas en más de 15 archivos y el cliente las duplica; descartada.
- **Al pasar a Observador, quitar su trabajo abierto:** descartada; borra trabajo en silencio. Se rechaza el cambio con el detalle (decisión 4 de la conversación).

## 6. Decisiones tomadas en la conversación

1. Amplitud del observador: la tabla de la sección 3 (anexos sí, comentarios no, incidentes y decisiones no, miembros sí, calendario de sus proyectos, biblioteca de lecciones solo de sus proyectos).
2. Riesgos del colaborador: solo los propios; solo cambia el estado.
3. Entregables del colaborador: todos los del proyecto, con criterios y revisiones, en lectura.
4. Observador: no asignable ni responsable; sí en RACI.
5. Cambio a Observador con trabajo abierto: se rechaza con el detalle.
6. Menú del observador: Proyectos, Calendario, Lecciones; inicio en Proyectos.
7. Enfoque: tabla de capacidades en `shared`.
8. Revisiones de entregables: colaborador y observador no ven quién revisó (el nombre es dato de interesados); ven resultado y fecha.

## 7. Pruebas

- `shared`: `canRead`/`canWrite` para cada celda de la tabla.
- Servidor:
  - Matriz perfil × ruta: para cada ruta de `/api/projects/:id/…` y `/api/tasks/:id/…`, un PM, un colaborador miembro y un observador miembro obtienen el código esperado según la tabla (200/201/403). Se construye a partir de la lista de rutas registradas, como la prueba de `closedGuard`, para que una ruta nueva sin clasificar haga fallar la prueba.
  - Guardia de observador: cobertura de todas las rutas de escritura; logout y cambio de contraseña permitidos.
  - Ningún dato oculto: respuestas de proyecto, tareas, indicadores y calendario del observador no contienen claves de costo (`plannedCostCents`, `plannedBudgetCents`, `amountCents`, etc.), igual que las pruebas actuales del colaborador.
  - Riesgos propios: el colaborador ve solo los suyos, cambia su estado, no puede cambiar otro campo ni ver o tocar los ajenos.
  - Entregables: el colaborador y el observador leen lista y detalle con criterios; no escriben.
  - Cambio a Observador: 409 con conteos cuando hay trabajo; procede cuando no.
  - Observador como responsable de riesgo o incidente: 400 con `fields.ownerId`.
  - `GET /api/lessons` del observador solo trae lecciones de sus proyectos.
- Cliente: pestañas por perfil; menú e inicio del observador; sin botones de escritura para el observador en tareas, anexos, lecciones; Riesgos del colaborador con solo sus riesgos y el cambio de estado; Usuarios ofrece el perfil Observador y muestra el error de trabajo abierto.
- e2e: el flujo principal sigue pasando; se añade un tramo corto donde el PM crea un observador, lo añade a un proyecto y el observador entra y ve el resumen sin botones de edición (si cabe sin alargar demasiado la prueba; si no, queda en pruebas de cliente).
