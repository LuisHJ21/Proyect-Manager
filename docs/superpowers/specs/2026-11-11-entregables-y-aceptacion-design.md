# Entregables y aceptación: especificación de diseño

**Fecha:** 2026-11-11
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-10-incidentes-y-decisiones-design.md`

## 1. Propósito

1. El PM registra qué se entrega en el proyecto y con qué criterios se considera aceptable.
2. La aceptación o el rechazo queda registrado con evidencia: quién lo aceptó, cuándo, con qué nota y qué documento lo respalda. Es la "validación del alcance" de PMBOK.
3. Los rechazos y las reaperturas quedan en un historial que no se pierde. Más adelante, el cierre del proyecto podrá apoyarse en él.

### Criterios de éxito

1. El PM crea un entregable con criterios, lo envía a revisión y lo acepta en nombre de un interesado, enlazando el acta de Anexos.
2. Sin todos los criterios cumplidos no se puede aceptar. Rechazar exige un motivo.
3. El PM ve de un vistazo qué entregables están pendientes, en revisión, aceptados, rechazados o vencidos, y los vencidos aparecen en el panel.
4. Los colaboradores no ven nada de esta función.

### Decisiones tomadas

- La aceptación la registra el PM en nombre de un interesado del registro. Los interesados no son usuarios de la app.
- La función es solo para el PM, igual que las decisiones.
- Los criterios son una lista que se marca uno a uno.
- La evidencia es un anexo existente del proyecto, opcional, junto con una nota.
- Se usa un modelo propio (`Deliverable`) y no se reutilizan los hitos: un hito es una fecha y un entregable es un producto.

## 2. Datos

- **`Deliverable`:**
  - Campos: `id`, `projectId`, `number`, `name` (obligatorio, máximo 200 caracteres), `description` (texto enriquecido saneado, por defecto vacío), `milestoneId` (opcional), `dueDate` (fecha `YYYY-MM-DD`, opcional), `status`, y fechas de creación y actualización.
  - Al borrar el proyecto, se borra.
  - Al borrar el hito, el enlace queda vacío (`SetNull`).
- **`DeliverableCriterion`:**
  - Campos: `id`, `deliverableId`, `text` (obligatorio, máximo 300 caracteres), `met` (booleano, por defecto falso), `position` (entero) y fechas.
  - Se borra con su entregable.
- **`DeliverableReview`:**
  - Campos: `id`, `deliverableId`, `outcome` (`ACCEPTED` o `REJECTED`), `stakeholderId` (opcional; si se borra el interesado queda vacío, `SetNull`), `stakeholderName` (copia del nombre al revisar, por defecto vacío), `reviewedOn` (fecha `YYYY-MM-DD`), `note` (texto, por defecto vacío), `attachmentId` (opcional; si se borra el anexo queda vacío, `SetNull`), `attachmentName` (copia del nombre original del anexo al revisar, por defecto vacío), `criteria` (copia en JSON: lista de `{ text, met }` en el orden de ese momento), `reviewedById` (usuario PM; `Restrict`) y `createdAt`.
  - Se borra con su entregable.
- **Número:** correlativo por proyecto con un contador propio (`Project.lastDeliverableNumber`). No se reutiliza aunque se borre un entregable, se muestra como "ENT-<n>" y el contador no se envía al cliente.
- **Estados:** `PENDING` → "Pendiente", `IN_REVIEW` → "En revisión", `ACCEPTED` → "Aceptado", `REJECTED` → "Rechazado". Por defecto, `PENDING`.
- **Vencido:** tiene `dueDate` anterior a hoy y no está `ACCEPTED`.
- **Índices:** `Deliverable(projectId)`, `DeliverableCriterion(deliverableId)` y `DeliverableReview(deliverableId)`.

## 3. Flujo de estados

| Desde | Hacia | Cómo |
|---|---|---|
| Pendiente | En revisión | PATCH `status: IN_REVIEW` |
| En revisión | Pendiente | PATCH `status: PENDING` |
| En revisión | Aceptado | POST de revisión `ACCEPTED` |
| En revisión | Rechazado | POST de revisión `REJECTED` |
| Rechazado | Pendiente o En revisión | PATCH |
| Aceptado | Pendiente (reabrir) | PATCH `status: PENDING` |

- Cualquier otra transición por PATCH responde 409. Enviar `ACCEPTED` o `REJECTED` por PATCH responde 400 en `status`, porque eso solo se hace con una revisión.
- Al reabrir no se toca el historial. Los criterios conservan su marca y se pueden volver a editar.

### Reglas

- **Aceptar:** el entregable tiene al menos un criterio y todos están cumplidos. Lo calcula la función pura `canAccept(criteria)`, que se usa en el servidor y en la interfaz.
- **Rechazar:** `note` es obligatoria (sin espacios vacíos).
- **Entregable aceptado:** sus criterios no se pueden añadir, editar, marcar, borrar ni reordenar (409). Sus campos (nombre, descripción, hito, fecha) sí se pueden editar.
- Al aceptar, en la revisión se guarda la copia del nombre del interesado y de los criterios.

## 4. API

Todas las rutas son solo para el PM. Para un colaborador miembro responden 403 y para alguien que no es miembro, 404, como en decisiones. La base es `/api/projects/:id/deliverables`.

- **`GET /`:** acepta `?status=` opcional. Un valor no válido o repetido responde 400. Devuelve los entregables ordenados por número, cada uno con `id`, `number`, `name`, `status`, `dueDate`, `overdue`, `milestone` (`{ id, name }` o null), `criteriaMet`, `criteriaTotal` y `lastReview` (`{ outcome, reviewedOn, stakeholderName }` o null).
- **`GET /:did`:** lo mismo, más `description`, `criteria` (ordenados por `position`) y `reviews` (de la más reciente a la más antigua). Cada revisión lleva `stakeholder` (`{ id, name }` o null), `stakeholderName`, `attachment` (`{ id, originalName }` o null), `attachmentName` y `criteria`.
- **`POST /`:** recibe `{ name, description?, milestoneId?, dueDate?, criteria?: string[] }` y responde 201.
  - Los textos de criterio vacíos se descartan.
  - Un hito de otro proyecto responde 400 en `milestoneId`.
- **`PATCH /:did`:** recibe `{ name?, description?, milestoneId?, dueDate?, status? }`, con las reglas de la sección 3.
- **`DELETE /:did`:** responde 200.
- **`POST /:did/criteria`:** recibe `{ text }` y añade el criterio al final.
- **`PATCH /:did/criteria/:cid`:** recibe `{ text?, met? }`.
- **`DELETE /:did/criteria/:cid`.**
- **`PUT /:did/criteria/order`:** recibe `{ ids: string[] }`, que debe contener exactamente los ids actuales; si no, responde 400.
- **Las cuatro rutas de criterios:**
  - responden 409 si el entregable está aceptado;
  - responden 404 si el criterio no es de ese entregable;
  - devuelven el detalle actualizado del entregable.
- **`POST /:did/reviews`:** recibe `{ outcome, stakeholderId?, reviewedOn, note?, attachmentId? }`.
  - Si el estado no es `IN_REVIEW`, responde 409.
  - Si aceptar no cumple `canAccept`, responde 400 en `criteria`.
  - Si se rechaza sin nota, responde 400 en `note`.
  - Un interesado o un anexo de otro proyecto responde 400 en el campo correspondiente.
  - En una transacción: crea la revisión con sus copias y cambia el estado a `ACCEPTED` o `REJECTED`. Devuelve el detalle.
- Los errores siguen el formato actual `{ error: { code, message, fields } }`.

### Panel del PM

- Hay un elemento de atención `deliverable` por cada entregable vencido, con el texto "ENT-n · <nombre> está vencido".
- El orden es tareas → incidentes → entregables → riesgos, dentro del límite actual de 8 elementos.
- `DashboardInput.deliverables` es opcional.
- La salud del proyecto no cambia.

## 5. Interfaz

- **Pestaña "Entregables"** (ruta `entregables`, `pmOnly`), después de "Control de cambios". Si un colaborador entra a la ruta directamente, ve lo mismo que en otras pestañas solo para el PM.
- **Tabla:**
  - Columnas: ENT-n, nombre, hito, fecha comprometida (con la etiqueta "Vencido"), criterios "3/5", estado (con etiqueta de color) y el botón "Ver ENT-n".
  - Tiene filtro "Estado" y el botón "Añadir entregable".
  - Vacía, muestra "Aún no hay entregables."
  - El contenedor lleva `relative overflow-x-auto`.
- **Formulario** (ventana "Añadir entregable" o "Editar ENT-n"): nombre, descripción (`RichTextEditor`), hito (lista de hitos, opcional), fecha comprometida y, solo al crear, "Criterios de aceptación" con campos que se pueden añadir y quitar.
- **Detalle** (ventana "ENT-n · nombre"):
  - Descripción (`RichTextView`), hito y fecha.
  - **Criterios:**
    - casilla por criterio (al marcarla se guarda en el momento), botón para editar el texto en línea, "Subir", "Bajar", "Eliminar" y "Añadir criterio";
    - si el entregable está aceptado, todo esto es de solo lectura.
  - **Botones según el estado:**
    - Pendiente: "Enviar a revisión".
    - En revisión: "Volver a pendiente", "Aceptar" y "Rechazar".
    - Rechazado: "Volver a pendiente" y "Enviar a revisión".
    - Aceptado: "Reabrir".
    - "Editar" y "Eliminar" aparecen siempre.
  - **"Aceptar":** si no se cumple `canAccept`, está desactivado y debajo se lee "Marca todos los criterios para poder aceptar".
  - **Historial "Revisiones":** fecha, resultado, interesado (o la copia del nombre, o "—"), nota, anexo descargable (o "Anexo eliminado" si `attachmentName` tiene texto y `attachment` es null) y los criterios de ese momento.
  - **Errores:** un 409 o 404 muestra un aviso con el mensaje y recarga los datos.
- **Ventana de revisión** ("Aceptar ENT-n" o "Rechazar ENT-n"):
  - Campos: "Interesado" (lista del registro, opcional), "Fecha" (hoy por defecto), "Nota" (obligatoria al rechazar; el botón queda desactivado mientras esté vacía) y "Anexo" (lista de Anexos del proyecto, opcional).
  - Los errores de campo se muestran junto al campo.
- **Panel:** elemento con el icono `PackageCheck` que enlaza a `entregables`.
- **Aviso al borrar:** el aviso de borrado de hitos e interesados no cambia.
- **README:** sección "Entregables y aceptación".

## 6. Pruebas

- **Dominio:**
  - `canAccept`: lista vacía, uno sin cumplir, todos cumplidos;
  - regla de vencido: sin fecha, fecha pasada, aceptado con fecha pasada;
  - transiciones permitidas.
- **Servidor:**
  - permisos: el colaborador recibe 403 y el ajeno 404 en todas las rutas;
  - numeración que no reutiliza números;
  - el contador no se envía;
  - crear con criterios y descartar los vacíos;
  - cada transición válida e inválida;
  - cada regla de revisión: no en revisión, criterios, nota, interesado y anexo de otro proyecto;
  - copias en el historial;
  - criterios bloqueados con el entregable aceptado;
  - reordenar con ids incorrectos;
  - qué pasa al borrar un hito, un interesado o un anexo;
  - el filtro `?status=` válido, inválido y repetido;
  - el elemento del panel y su orden.
- **Interfaz (RTL):**
  - el colaborador no ve la pestaña;
  - la lista y el filtro;
  - el contenedor de la tabla;
  - crear con criterios;
  - marcar un criterio;
  - "Aceptar" desactivado con su explicación;
  - aceptar con interesado y anexo;
  - rechazar con nota obligatoria;
  - reabrir;
  - historial con "Anexo eliminado";
  - el elemento del panel.
- **e2e:** se amplía el flujo actual. El PM crea ENT-1 con dos criterios, lo envía a revisión, lo rechaza con una nota, marca los criterios, lo vuelve a enviar y lo acepta con un interesado y un anexo. Al final, el historial muestra las dos revisiones.

## 7. Fuera de alcance

- Que los colaboradores vean o entreguen.
- Que los interesados acepten desde la app.
- Subir archivos directamente al entregable.
- Enlazar entregables con tareas.
- Notificaciones.
- Informe de cierre: viene en la siguiente función, cierre y lecciones aprendidas.
