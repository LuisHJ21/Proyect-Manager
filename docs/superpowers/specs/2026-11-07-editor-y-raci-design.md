# Editor con formato y matriz RACI: especificación de diseño

**Fecha:** 2026-11-07
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-07-rediseno-panel-admin-design.md`

## 1. Propósito

1. Los textos largos del proyecto se escriben con formato básico en lugar de texto plano.
2. Cada proyecto tiene una matriz RACI que indica, para cada actividad importante, quién la hace, quién rinde cuentas, a quién se consulta y a quién se informa.

### Criterios de éxito

1. El PM escribe el acta, la descripción del proyecto, los objetivos y los riesgos con negritas, títulos y listas, y ese formato se ve igual al leerlos.
2. El PM arma la matriz RACI de un proyecto con sus actividades, sus miembros y sus interesados, y ve qué filas están incompletas.
3. Ningún texto guardado puede ejecutar código en el navegador de quien lo lee.

## 2. Editor con formato

### Campos

| Pantalla | Campos |
|---|---|
| Acta | Justificación, alcance incluido, alcance excluido, límites, supuestos, restricciones y criterios de éxito |
| Proyecto | Descripción |
| Objetivos | Descripción |
| Riesgos | Descripción y plan de respuesta |

El patrocinador, la métrica y la meta de un objetivo, y los demás campos cortos siguen siendo texto simple.

### Barra

Negrita, cursiva, título de sección, lista con viñetas, lista numerada, deshacer y rehacer.

- Cada botón tiene etiqueta accesible e indica con `aria-pressed` si su formato está activo.
- Funcionan los atajos Ctrl+B, Ctrl+I, Ctrl+Z y Ctrl+Y.
- El editor sigue la paleta oscura, crece con su contenido y muestra los errores por campo igual que los demás.

Se implementa con Tiptap (`@tiptap/react`, `@tiptap/starter-kit`), limitado a esas funciones.

### Formato guardado

- **HTML permitido:** `p`, `br`, `strong`, `em`, `h3`, `ul`, `ol` y `li`, sin atributos.
- **Servidor:** limpia el HTML al guardar con `sanitize-html` y esa lista. Todo lo demás se elimina, incluidos `script`, `style`, atributos como `onclick`, enlaces e imágenes.
- **Interfaz:** vuelve a limpiar con DOMPurify y la misma lista antes de mostrar.
- **Textos sin etiquetas:** los guardados antes de este cambio se tratan como texto plano. Se escapan, y cada línea pasa a ser un párrafo al mostrarlos o al abrirlos en el editor.

### Texto vacío

Un campo cuyo texto visible, sin etiquetas ni espacios, está vacío cuenta como vacío. Esto aplica a:

- los campos obligatorios para aprobar el acta;
- la validación de "Describe el objetivo" y "Describe el riesgo";
- la regla de que el acta vuelve a *Borrador* al cambiar: se comparan los HTML ya limpios.

### Vistas

- **Con formato:** acta (edición y solo lectura), descripción del proyecto en el Resumen, y detalle de un objetivo o un riesgo.
- **Sin formato, recortado a dos líneas:** tablas de Objetivos y Riesgos, y "Requiere atención" en el panel.

La función compartida `toPlainText(html)` devuelve el texto visible. El servidor la usa para el título de un riesgo en el panel.

## 3. Matriz RACI

### Ubicación y permisos

- Está en la pestaña **Interesados** de cada proyecto, debajo del registro de interesados, que no cambia.
- Solo el PM la ve y la edita. Un colaborador recibe 403, igual que en el registro de interesados.

### Actividades (filas)

- Cada actividad tiene título (obligatorio) y descripción opcional en texto simple.
- Se muestran en orden de creación. No se reordenan.
- El PM las crea, edita y elimina. Eliminar una actividad borra sus celdas.

### Participantes (columnas)

- **Equipo:** los miembros del proyecto.
- **Interesados:** los del registro del proyecto.
- Cada grupo tiene su encabezado, con los nombres ordenados alfabéticamente.

### Celdas

- Cada celda vale vacío, `R`, `A`, `C` o `I`. Hay una sola letra por celda.
- Se elige con un selector accesible. La letra se muestra escrita y además con color.
- **Significados**, visibles en una leyenda:
  - R: hace el trabajo.
  - A: rinde cuentas y aprueba.
  - C: se le consulta.
  - I: se le informa.

### Avisos por fila

Una fila muestra estos avisos con icono y texto, sin impedir guardar:

- **"Falta A"** si no tiene ninguna `A`.
- **"Más de una A"** si tiene más de una.
- **"Falta R"** si no tiene ninguna `R`.

Una fila sin avisos muestra "Completa".

### Al eliminar participantes

- Eliminar un interesado borra sus celdas.
- Quitar a un miembro del proyecto borra sus celdas en ese proyecto. El aviso previo de quitar miembro incluye cuántas celdas RACI tiene.

### Estados vacíos

- **Sin actividades:** invitación a crear la primera.
- **Sin participantes:** mensaje que indica añadir miembros en Resumen o interesados arriba.

### Móvil

La matriz se desplaza horizontalmente dentro de su caja, con la columna de actividades fija.

## 4. Datos y API

### Tablas nuevas

- **`RaciActivity`:** `id`, `projectId`, `title`, `description` (por defecto vacío), y fechas de creación y actualización. Se borra con su proyecto.
- **`RaciCell`:** `id`, `activityId`, `stakeholderId` opcional, `userId` opcional, `role` (`R`, `A`, `C`, `I`), y fechas. Se borra con su actividad, su interesado o su usuario.

Cada celda tiene exactamente uno de `stakeholderId` o `userId`. El servidor garantiza una sola celda por actividad y participante.

### Rutas (solo PM)

- `GET /api/projects/:id/raci` devuelve:

```
{
  activities: [{ id, title, description, warnings: ('missing_a' | 'multiple_a' | 'missing_r')[] }],
  members: [{ id, name }],
  stakeholders: [{ id, name }],
  cells: [{ activityId, kind: 'member' | 'stakeholder', partyId, role }]
}
```

- `POST /api/projects/:id/raci/activities` `{ title, description? }`.
- `PATCH /api/projects/:id/raci/activities/:activityId` `{ title?, description? }`.
- `DELETE /api/projects/:id/raci/activities/:activityId`.
- `PUT /api/projects/:id/raci/cells` `{ activityId, kind, partyId, role: 'R' | 'A' | 'C' | 'I' | null }`. Un `null` vacía la celda.

**Errores:**
- Actividad de otro proyecto: 404.
- Participante que no es miembro ni interesado del proyecto: 400 con error en `partyId`.
- Rol inválido: 400 con error en `role`.

**Avisos:** se calculan con la función pura `raciWarnings(roles: string[])`.

### Cambios en rutas existentes

- Las rutas que guardan los campos de la sección 2 limpian el HTML antes de validar y guardar.
- Quitar a un miembro del proyecto borra sus celdas RACI en ese proyecto, y `GET .../members/:userId/impact` añade `raciCells`.
- El panel usa `toPlainText` para el título de los riesgos.

## 5. Errores

- Los errores de los campos con formato se muestran bajo el editor, sin perder lo escrito.
- Si falla un cambio de celda, la celda vuelve a su valor anterior y se muestra el motivo.
- Un cambio de celda en curso desactiva esa celda hasta terminar, para evitar envíos dobles.

## 6. Pruebas

- **`sanitizeRichText` y `toPlainText`:**
  - Conservan las etiquetas permitidas.
  - Eliminan `script`, `style`, `onclick`, `javascript:`, enlaces, imágenes y atributos.
  - Escapan y dividen en párrafos el texto sin etiquetas.
  - Tratan como vacío `<p></p>`, `<p> </p>` y `<p><br></p>`.
- **API del editor:**
  - Lo que se guarda ya viene limpio.
  - El acta con campos vacíos con formato no se aprueba.
  - Guardar el acta sin cambios reales no la devuelve a Borrador.
  - Objetivos y riesgos con descripción vacía con formato responden 400.
- **`raciWarnings`:** cada aviso y su combinación, y la fila completa.
- **API RACI:**
  - 403 para colaboradores y 404 para no miembros.
  - Actividad de otro proyecto.
  - Participante ajeno.
  - Rol inválido.
  - Una sola celda por participante: cambiar `R` por `A` no duplica.
  - Vaciar una celda.
  - Borrados en cascada al eliminar una actividad, un interesado o un miembro.
  - `impact` informa `raciCells`.
- **Interfaz:**
  - Editor: barra y `aria-pressed`, atajos, texto antiguo, vista de solo lectura y vista recortada en tablas.
  - Matriz: avisos, cambio y vaciado de celdas, reversión ante error, doble envío, estados vacíos y columnas agrupadas.
- **Flujo completo:** el PM escribe el acta con una lista, crea una actividad RACI y asigna `A` y `R`.

## 7. Fuera del alcance

- Enlaces, tablas, imágenes y colores en el editor.
- Formato en otros textos: interesados, tareas, pasos y comentarios.
- RACI con filas de tareas o hitos, reordenar actividades y exportar la matriz.
- Acceso de colaboradores a la matriz.
