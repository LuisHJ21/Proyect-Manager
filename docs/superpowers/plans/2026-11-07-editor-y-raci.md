# Editor con formato y matriz RACI: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los textos largos del proyecto (acta, descripción del proyecto, objetivos y riesgos) se escriben y se ven con formato básico, y cada proyecto tiene una matriz RACI en la pestaña Interesados.

**Architecture:** Las utilidades de texto con formato puras (`toPlainText`, `plainToHtml`, `isBlankRichText`) viven en `@pm/shared`. El servidor limpia el HTML con `sanitize-html` antes de validar y guardar, y la interfaz vuelve a limpiarlo con DOMPurify al mostrarlo. El editor es un componente Tiptap que se integra en `FormField` igual que un `textarea`. La RACI añade dos tablas Prisma, una ruta `raci.ts` solo para el PM y un componente `RaciMatrix` bajo el registro de interesados.

**Tech Stack:** Fastify 5, Prisma 6 con SQLite, Zod, sanitize-html 2, React 19, TanStack Query 5, Tiptap 3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`), DOMPurify 3, Tailwind 4, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-editor-y-raci-design.md`

## Global Constraints

- Toda la interfaz y los mensajes de error están en español.
- HTML permitido: `p`, `br`, `strong`, `em`, `h3`, `ul`, `ol`, `li`, sin atributos. Todo lo demás se elimina, incluidos `script`, `style`, `onclick`, enlaces e imágenes.
- Campos con formato: acta (`justification`, `scopeIncluded`, `scopeExcluded`, `boundaries`, `assumptions`, `constraints`, `successCriteria`), `Project.description`, `Objective.description`, `Risk.description` y `Risk.responsePlan`. `sponsor`, `metric`, `target` y los demás campos siguen siendo texto simple.
- Un texto guardado sin etiquetas es texto plano antiguo: se escapa y cada línea no vacía pasa a ser un párrafo.
- Un campo con formato sin texto visible cuenta como vacío. El servidor lo guarda como `''`.
- La matriz RACI es solo para el PM: un colaborador del proyecto recibe 403 y quien no es miembro recibe 404.
- Roles RACI: `R`, `A`, `C`, `I`. Avisos: `missing_a` → "Falta A", `multiple_a` → "Más de una A", `missing_r` → "Falta R". Sin avisos, "Completa".
- Leyenda: "R: hace el trabajo", "A: rinde cuentas y aprueba", "C: se le consulta", "I: se le informa".
- Botones de la barra (etiqueta accesible exacta): "Negrita", "Cursiva", "Título de sección", "Lista con viñetas", "Lista numerada", "Deshacer", "Rehacer".
- Las versiones de las dependencias nuevas se fijan con `^` a la mayor indicada: `sanitize-html@^2`, `@types/sanitize-html@^2`, `@tiptap/react@^3`, `@tiptap/starter-kit@^3`, `@tiptap/pm@^3`, `dompurify@^3`.
- Las migraciones nuevas no tocan datos existentes. El README recomienda copiar `data/` antes de actualizar.

## Review Focus

1. **Texto antiguo al abrir el editor:** un acta guardada como texto plano con saltos de línea se abre en el editor con un párrafo por línea, y abrirla sin tocar nada no la marca como modificada ni la devuelve a Borrador. Prueba en la Tarea 4 ("abrir un acta antigua no la marca como modificada") y en la Tarea 2 ("guardar el mismo texto antiguo convertido a HTML no reabre el acta").
2. **Caracteres especiales en texto plano:** `a < b & c` sin etiquetas se muestra literal, no como HTML roto. Pruebas en la Tarea 1 (`plainToHtml` y `toPlainText`) y en la Tarea 3 (`RichTextView`).
3. **Etiquetas o confirmaciones con HTML:** un riesgo con descripción `<p><strong>Retraso</strong></p>` aparece como "Retraso" en "Editar …", "Eliminar …" y en el diálogo de confirmación, nunca con etiquetas. Prueba en la Tarea 5.
4. **Celda RACI de un interesado eliminado o de un miembro quitado mientras la matriz está abierta:** el `PUT` responde 400 en `partyId`, la celda vuelve a su valor y se ve el motivo. Prueba de servidor en la Tarea 7 y de interfaz en la Tarea 8 (reversión ante error).
5. **Nombres largos de participantes o actividades en móvil:** la matriz se desplaza dentro de su caja y la columna de actividades queda fija. Prueba en la Tarea 8 (clases `overflow-x-auto` y `sticky`) y revisión manual a 375 px en la Tarea 9.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/richText.ts` (nuevo) | Etiquetas permitidas, `hasHtmlTags`, `plainToHtml`, `toPlainText`, `isBlankRichText`, `CHARTER_RICH_FIELDS` |
| `shared/src/raci.ts` (nuevo) | `RACI_ROLE`, `RaciRole`, `RaciWarning`, esquemas Zod de actividades y celdas |
| `server/src/richText.ts` (nuevo) | `sanitizeRichText`, `sanitizeFields` |
| `server/src/domain/raci.ts` (nuevo) | `raciWarnings` |
| `server/src/routes/raci.ts` (nuevo) | Rutas RACI |
| `server/src/routes/{charter,projects,projectCrud,registers,members,dashboard}.ts` | Limpieza al guardar, cascadas e impacto |
| `client/src/components/richText/RichTextEditor.tsx` (nuevo) | Editor Tiptap con barra |
| `client/src/components/richText/RichTextView.tsx` (nuevo) | Vista con formato y vista recortada |
| `client/src/components/raci/RaciMatrix.tsx` (nuevo) | Matriz, celdas, leyenda, avisos |
| `client/src/components/raci/ActivityForm.tsx` (nuevo) | Modal para crear y editar una actividad |
| `client/src/pages/project/{Charter,Summary,Registers}.tsx`, `client/src/components/{RegisterTable,project/ProjectForm,project/PlanningPanels,project/MembersPanel}.tsx` | Uso del editor y de las vistas |

---

### Task 1: Utilidades compartidas de texto con formato

**Files:**
- Create: `shared/src/richText.ts`
- Modify: `shared/src/index.ts` (exporta `./richText`)
- Test: `shared/tests/richText.test.ts`

**Interfaces:**
- Produces:
  - `RICH_TEXT_TAGS: readonly ['p', 'br', 'strong', 'em', 'h3', 'ul', 'ol', 'li']`
  - `hasHtmlTags(text: string): boolean`: verdadero si contiene algo con forma de etiqueta `/<\/?[a-z][a-z0-9]*\b[^>]*>/i`.
  - `plainToHtml(text: string): string`: escapa `& < > " '` y envuelve cada línea no vacía en `<p>…</p>`. Devuelve `''` si no queda ninguna.
  - `toPlainText(html: string): string`: texto visible en una sola línea. Sin etiquetas, solo colapsa espacios. Con etiquetas, cambia `<br>` y los cierres de `p`, `h3` y `li` por un espacio, quita las etiquetas, decodifica `&amp; &lt; &gt; &quot; &#39; &nbsp;`, colapsa espacios y recorta.
  - `isBlankRichText(html: string): boolean` = `toPlainText(html) === ''`
  - `CHARTER_RICH_FIELDS`: los siete campos de `CHARTER_TEXT_FIELDS` sin `sponsor`, como `readonly` tupla.

- [ ] **Step 1: Write the failing tests** en `shared/tests/richText.test.ts`:

```ts
it('toPlainText conserva el texto visible de las etiquetas permitidas', () => {
  expect(toPlainText('<h3>Título</h3><p><strong>Uno</strong> y <em>dos</em></p><ul><li>a</li><li>b</li></ul>')).toBe('Título Uno y dos a b');
});
it('toPlainText decodifica entidades', () => {
  expect(toPlainText('<p>a &lt; b &amp; c&nbsp;d</p>')).toBe('a < b & c d');
});
it('toPlainText deja intacto el texto plano salvo los espacios', () => {
  expect(toPlainText('a < b &amp;\n  c')).toBe('a < b &amp; c');
});
it.each(['', '<p></p>', '<p> </p>', '<p><br></p>', '<ul><li></li></ul>'])('isBlankRichText(%j) es verdadero', (html) => {
  expect(isBlankRichText(html)).toBe(true);
});
it('isBlankRichText es falso con texto', () => expect(isBlankRichText('<p>x</p>')).toBe(false));
it('plainToHtml escapa y crea un párrafo por línea no vacía', () => {
  expect(plainToHtml('a < b & "c"\n\nsegunda')).toBe('<p>a &lt; b &amp; &quot;c&quot;</p><p>segunda</p>');
  expect(plainToHtml('  \n ')).toBe('');
});
it('hasHtmlTags distingue texto plano de HTML', () => {
  expect(hasHtmlTags('a < b')).toBe(false);
  expect(hasHtmlTags('<p>a</p>')).toBe(true);
});
it('CHARTER_RICH_FIELDS no incluye al patrocinador', () => {
  expect(CHARTER_RICH_FIELDS).toHaveLength(7);
  expect(CHARTER_RICH_FIELDS).not.toContain('sponsor');
});
```

- [ ] **Step 2: Run** `npm test -w shared -- richText` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `shared/src/richText.ts` con las firmas de arriba y expórtalo en `shared/src/index.ts`. `CHARTER_RICH_FIELDS` se declara en `richText.ts` importando nada de `schemas.ts` (lista literal), para evitar ciclos.
- [ ] **Step 4: Run** `npm test -w shared` → PASS (todas).
- [ ] **Step 5: Commit** `feat: agrega utilidades compartidas de texto con formato`.

---

### Task 2: El servidor limpia el texto con formato

**Files:**
- Create: `server/src/richText.ts`
- Modify: `server/package.json` (dependencia `sanitize-html@^2`, dev `@types/sanitize-html@^2`), `server/src/routes/charter.ts`, `server/src/routes/projects.ts`, `server/src/routes/projectCrud.ts`, `server/src/routes/registers.ts`, `server/src/domain/dashboard.ts`
- Test: `server/tests/richText.test.ts` (nuevo), `server/tests/charter.test.ts`, `server/tests/registers.test.ts`, `server/tests/projects.test.ts`, `server/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `RICH_TEXT_TAGS`, `hasHtmlTags`, `plainToHtml`, `isBlankRichText`, `toPlainText`, `CHARTER_RICH_FIELDS` (Tarea 1).
- Produces:
  - `sanitizeRichText(input: string): string`: sin etiquetas → `plainToHtml(input)`. Con etiquetas → `sanitizeHtml(input, { allowedTags: [...RICH_TEXT_TAGS], allowedAttributes: {}, disallowedTagsMode: 'discard', nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'] })`. Si el resultado `isBlankRichText`, devuelve `''`.
  - `sanitizeFields<T>(body: T, fields: readonly string[]): T`: copia de `body`. Cada campo listado que sea `string` pasa por `sanitizeRichText`. Lo que no es objeto se devuelve igual, para que Zod dé su error.
  - `ProjectCrudOptions.richTextFields?: readonly string[]`: `registerProjectCrud` aplica `sanitizeFields` al cuerpo antes de `parse` en `POST` y `PATCH`.

- [ ] **Step 1: Write the failing unit tests** en `server/tests/richText.test.ts`:

```ts
it('conserva las etiquetas permitidas', () => {
  const html = '<h3>T</h3><p><strong>a</strong><em>b</em><br></p><ul><li>x</li></ul><ol><li>y</li></ol>';
  expect(sanitizeRichText(html)).toBe(html);
});
it('elimina script, style, atributos, enlaces e imágenes', () => {
  expect(sanitizeRichText('<p onclick="x()" class="c">Hola<script>alert(1)</script><style>p{}</style></p>')).toBe('<p>Hola</p>');
  expect(sanitizeRichText('<p><a href="javascript:alert(1)">ver</a><img src=x onerror=alert(1)></p>')).toBe('<p>ver</p>');
});
it('convierte el texto plano en párrafos escapados', () => {
  expect(sanitizeRichText('uno < dos\ntres')).toBe('<p>uno &lt; dos</p><p>tres</p>');
});
it.each(['<p></p>', '<p> </p>', '<p><br></p>', '   '])('guarda %j como vacío', (input) => {
  expect(sanitizeRichText(input)).toBe('');
});
```

- [ ] **Step 2: Write the failing API tests:**
  - `charter.test.ts` › "guarda el acta ya limpia": `PUT` con `justification: '<p>Hola<script>x</script></p>'` → la respuesta y la base tienen `'<p>Hola</p>'`; `sponsor: '<b>Ana</b>'` se guarda tal cual (texto simple).
  - `charter.test.ts` › "no aprueba campos con formato vacíos": `justification: '<p><br></p>'`, `scopeIncluded: '<p> </p>'`, `successCriteria: '<p>Ok</p>'` → `approve` responde 400 con `fields.justification` y `fields.scopeIncluded`.
  - `charter.test.ts` › "guardar sin cambios reales no reabre el acta": acta aprobada con `justification: '<p>Uno</p>'`; `PUT` con `'<p>Uno</p><script></script>'` → sigue `APPROVED`.
  - `charter.test.ts` › "guardar el mismo texto antiguo convertido a HTML no reabre el acta": en la base, `justification: 'Uno\nDos'` y el acta aprobada; `PUT` con `'<p>Uno</p><p>Dos</p>'` → sigue `APPROVED`.
  - `registers.test.ts` › "objetivos y riesgos con descripción vacía con formato responden 400": `POST objectives {description: '<p></p>'}` → 400 `fields.description`; lo mismo con `risks` y `'<p><br></p>'`. `PATCH` de un riesgo con `description: '<p> </p>'` → 400.
  - `registers.test.ts` › "objetivos y riesgos se guardan limpios": `responsePlan: '<ul><li onclick="x">a</li></ul>'` → `'<ul><li>a</li></ul>'`.
  - `projects.test.ts` › "la descripción del proyecto se guarda limpia" en `POST` y `PATCH`.
  - `dashboard.test.ts` › "el título de un riesgo en Requiere atención es texto plano": riesgo alto con `description: '<p><strong>Caída</strong> del servidor</p>'` → `attention[].title === 'Caída del servidor'`.
- [ ] **Step 3: Run** `npm test -w server -- richText charter registers projects dashboard` → FAIL.
- [ ] **Step 4: Install** `npm install sanitize-html@^2 -w server` y `npm install -D @types/sanitize-html@^2 -w server`.
- [ ] **Step 5: Implement**:
  - `server/src/richText.ts` con las dos funciones.
  - `charter.ts` `PUT`: `input = charterSchema.parse(sanitizeFields(req.body, CHARTER_RICH_FIELDS))`. `changed` compara cada campo de `CHARTER_RICH_FIELDS` con `sanitizeRichText(current[field])` y `sponsor` directamente. `approve`: un campo obligatorio falta si `isBlankRichText(current[field])`.
  - `projects.ts` `POST` y `PATCH`: `parse(sanitizeFields(req.body, ['description']))`.
  - `projectCrud.ts`: opción `richTextFields`. `registers.ts`: objetivos `['description']`, riesgos `['description', 'responsePlan']`.
  - `domain/dashboard.ts`: `title: toPlainText(r.description)`.
- [ ] **Step 6: Run** `npm test -w server` → PASS (toda la suite).
- [ ] **Step 7: Commit** `feat: el servidor limpia los textos con formato`.

---

### Task 3: Editor y vistas con formato en la interfaz

**Files:**
- Create: `client/src/components/richText/RichTextEditor.tsx`, `client/src/components/richText/RichTextView.tsx`
- Modify: `client/package.json` (dependencias `@tiptap/react@^3`, `@tiptap/starter-kit@^3`, `@tiptap/pm@^3`, `dompurify@^3`), `client/tests/setup.ts`, `client/tests/helpers.tsx`
- Test: `client/tests/richText.test.tsx`

**Interfaces:**
- Consumes: `RICH_TEXT_TAGS`, `hasHtmlTags`, `plainToHtml`, `isBlankRichText`, `toPlainText` (Tarea 1).
- Produces:
  - `RichTextEditor(props: { value: string; onChange: (html: string) => void; label: string; id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; minHeight?: 'sm' | 'md' })`: acepta las props que inyecta `FormField`. El área editable tiene `role="textbox"`, `aria-multiline="true"`, `aria-label={label}` y el `id`, `aria-invalid` y `aria-describedby` recibidos.
  - `toEditorHtml(value: string): string` = `hasHtmlTags(value) ? value : plainToHtml(value)`, exportada desde `RichTextEditor.tsx`.
  - `RichTextView({ html, empty }: { html: string; empty?: string })`: limpia con `DOMPurify.sanitize(toEditorHtml(html), { ALLOWED_TAGS: [...RICH_TEXT_TAGS], ALLOWED_ATTR: [] })` y lo pinta con estilos para `h3`, `ul`, `ol`, `strong` y `em`. Si `isBlankRichText(html)`, muestra `empty` (por defecto `'—'`).
  - `RichTextClamp({ html }: { html: string })`: `toPlainText(html)` en un `span` con `line-clamp-2` y `title` con el texto completo.
  - Ayuda de pruebas en `client/tests/helpers.tsx`: `setRichText(label: string, html: string): Promise<void>` busca `screen.getByRole('textbox', { name: label })`, toma su `.editor` (Tiptap lo deja en el DOM del editor) y llama a `editor.commands.setContent(html, { emitUpdate: true })` dentro de `act`.

- [ ] **Step 1: Write the failing tests** en `client/tests/richText.test.tsx`, montando `RichTextEditor` en un componente con estado:
  - "muestra los siete botones con aria-pressed": cada nombre de la barra existe. "Negrita", "Cursiva", "Título de sección", "Lista con viñetas" y "Lista numerada" tienen `aria-pressed="false"`. "Deshacer" y "Rehacer" no tienen `aria-pressed`.
  - "Negrita activa el formato": enfoca el área, pulsa "Negrita" → `aria-pressed="true"`.
  - "Ctrl+B activa la negrita": `fireEvent.keyDown(textbox, { key: 'b', ctrlKey: true })` → "Negrita" `aria-pressed="true"`.
  - "abre el texto antiguo en párrafos": `value="Uno\nDos"` → el área contiene dos `p` con "Uno" y "Dos", y `onChange` no se llamó.
  - "emite HTML y un campo vacío como ''": `setRichText('Campo', '<p><strong>Hola</strong></p>')` → último `onChange` con `'<p><strong>Hola</strong></p>'`. Luego `setRichText('Campo', '<p></p>')` → `''`.
  - "RichTextView limpia lo peligroso": `html='<p onclick="x">a</p><script>alert(1)</script><img src=x>'` → hay un `p` con "a" y sin atributo `onclick`; no hay `script` ni `img`.
  - "RichTextView muestra el texto antiguo literal": `html='a < b\nc'` → dos párrafos, el primero con "a < b".
  - "RichTextView muestra el texto vacío": `html='<p><br></p>'` → "—".
  - "RichTextClamp muestra el texto plano": `html='<p><strong>Uno</strong></p><p>Dos</p>'` → "Uno Dos" y la clase `line-clamp-2`.
- [ ] **Step 2: Run** `npm test -w client -- richText` → FAIL.
- [ ] **Step 3: Install** `npm install @tiptap/react@^3 @tiptap/starter-kit@^3 @tiptap/pm@^3 dompurify@^3 -w client`.
- [ ] **Step 4: Implement** `RichTextEditor`:
  - Usa `useEditor` con `StarterKit.configure({ heading: { levels: [3] }, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, link: false, underline: false })`, `content: toEditorHtml(value)` y `editorProps.attributes` con el rol y los atributos ARIA de arriba, más las clases del área (`inputClass` sin altura fija, `min-h-24` o `min-h-36` según `minHeight`, estilos de `h3`, `ul`, `ol`).
  - `onUpdate` emite `isBlankRichText(html) ? '' : html` y guarda el valor en una ref `lastEmitted`.
  - Un `useEffect` sobre `value` llama a `setContent(toEditorHtml(value), { emitUpdate: false })` solo si `value !== lastEmitted.current`. Así un guardado no mueve el cursor y un valor externo nuevo sí se carga.
  - Barra encima del área con `role="toolbar"` y `aria-label={`Formato de ${label}`}`. Cada botón es un icono de lucide (`Bold`, `Italic`, `Heading3`, `List`, `ListOrdered`, `Undo2`, `Redo2`) con `aria-label`, `type="button"`, `onMouseDown={e => e.preventDefault()}` para no perder el foco y 36 × 36 px. Los botones de formato llevan `aria-pressed={editor.isActive(...)}`.
  - Para que los botones se redibujen con la selección, el estado activo se lee con `useEditorState`.
  - `RichTextView` y `RichTextClamp`, como se describe arriba.
  - Si ProseMirror falla en jsdom por APIs de geometría, añade en `client/tests/setup.ts` stubs que solo se definen si faltan: `Range.prototype.getBoundingClientRect`, `Range.prototype.getClientRects` y `document.elementFromPoint`.
- [ ] **Step 5: Run** `npm test -w client -- richText` → PASS. Luego `npm test -w client` → PASS.
- [ ] **Step 6: Commit** `feat: agrega el editor con formato y su vista`.

---

### Task 4: Acta y descripción del proyecto con formato

**Files:**
- Modify: `client/src/pages/project/Charter.tsx`, `client/src/components/project/ProjectForm.tsx`, `client/src/pages/project/Summary.tsx`
- Test: `client/tests/charter.test.tsx`, `client/tests/projectLayout.test.tsx` (o el archivo que hoy prueba el Resumen)

**Interfaces:**
- Consumes: `RichTextEditor`, `RichTextView`, `setRichText` (Tarea 3), `CHARTER_RICH_FIELDS` (Tarea 1).

- [ ] **Step 1: Update and add failing tests** en `charter.test.tsx`:
  - Las pruebas que hoy escriben en "Justificación" pasan a `await setRichText('Justificación', '<p>Mi justificación</p>')`. La aserción `toHaveValue` cambia a `expect(screen.getByRole('textbox', { name: 'Justificación' })).toHaveTextContent('Mi justificación')`.
  - "editar un acta aprobada advierte que volverá a Borrador" sigue escribiendo en "Patrocinador" (sigue siendo `input`).
  - Nueva: "el acta con formato se ve con formato en solo lectura": colaborador; `justification: '<p><strong>Porque sí</strong></p><ul><li>Uno</li></ul>'` → `getByText('Porque sí').tagName === 'STRONG'` y un `li` con "Uno".
  - Nueva: "abrir un acta antigua no la marca como modificada": PM, acta aprobada con `justification: 'Línea 1\nLínea 2'` → no aparece "volverá a Borrador", el botón "Guardar" está desactivado y el área tiene dos párrafos.
  - Nueva: "el PM edita el acta con barra de formato": hay `toolbar` "Formato de Justificación".
  - En el archivo del Resumen: "la descripción del proyecto se ve con formato": `description: '<p><em>Sitio</em> nuevo</p>'` → `getByText('Sitio').tagName === 'EM'`. Proyecto sin descripción → "Sin descripción.".
  - Prueba del formulario de proyecto (en el archivo que ya lo cubre): `setRichText('Descripción', '<p>Hola</p>')` y guardar → el cuerpo enviado tiene `description: '<p>Hola</p>'`.
- [ ] **Step 2: Run** `npm test -w client -- charter projectLayout` → FAIL.
- [ ] **Step 3: Implement:**
  - `Charter.tsx`: `FIELDS` conserva el orden y las etiquetas. `sponsor` sigue con `input`; los demás usan `<RichTextEditor label={field.label} value={draft[name]} onChange={…} minHeight={rows >= 4 ? 'md' : 'sm'} />` dentro de `FormField`. `CharterReadOnly` usa `RichTextView` para los campos con formato y texto simple para el patrocinador.
  - `ProjectForm.tsx`: `RichTextEditor label="Descripción"` en lugar del `textarea`.
  - `Summary.tsx`: `<RichTextView html={project.description} empty="Sin descripción." />`.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: acta y descripción del proyecto con formato`.

---

### Task 5: Objetivos y riesgos con formato

**Files:**
- Modify: `client/src/components/RegisterTable.tsx`, `client/src/components/project/PlanningPanels.tsx`, `client/src/pages/project/Registers.tsx`
- Test: `client/tests/risks.test.tsx`, `client/tests/objectives.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `RichTextEditor`, `RichTextView`, `RichTextClamp`, `setRichText` (Tarea 3), `toPlainText` (Tarea 1).
- Produces:
  - `FieldDef.type` admite `'richtext'`: se pinta `RichTextEditor` con `label={field.label}`.
  - `Props.detail?: { title: (item: T) => string; render: (item: T) => ReactNode }`: si existe, cada fila tiene el botón "Ver" con `aria-label={`Ver ${itemLabel(item)}`}`, visible también sin `canEdit`, que abre un `Modal` con `title(item)` y `render(item)`.

- [ ] **Step 1: Update and add failing tests:**
  - `risks.test.tsx`: la prueba que escribía en "Descripción" pasa a `setRichText('Descripción', '<p>Ahorro</p>')` y espera `description: '<p>Ahorro</p>'` en el cuerpo enviado.
  - `risks.test.tsx` › "la tabla muestra el riesgo en texto plano recortado": `description: '<p><strong>Retraso</strong> del proveedor</p>'` → la celda muestra "Retraso del proveedor" y no hay `strong` en la tabla.
  - `risks.test.tsx` › "las acciones y la confirmación usan texto plano": existen los botones "Editar Retraso del proveedor" y "Eliminar Retraso del proveedor". Al pulsar Eliminar, el diálogo dice «Retraso del proveedor».
  - `risks.test.tsx` › "Ver riesgo muestra descripción y plan con formato": pulsa "Ver Retraso del proveedor" → diálogo "Detalle del riesgo" con `strong` "Retraso" y el plan `<ul><li>Llamar</li></ul>` como lista. Sin plan, "Sin plan de respuesta.".
  - `objectives.test.tsx` › "el colaborador ve el detalle de un objetivo con formato": colaborador en el Resumen (donde vive `ObjectivesPanel`), objetivo `'<p><em>Lanzar</em></p>'`. La tabla muestra "Lanzar", no hay "Editar", y "Ver Lanzar" abre "Detalle del objetivo" con `em`, la métrica y la meta.
- [ ] **Step 2: Run** `npm test -w client -- risks objectives` → FAIL.
- [ ] **Step 3: Implement:**
  - `RegisterTable.tsx`: tipo `'richtext'` y prop `detail`. La columna de acciones se muestra si `canEdit || detail`.
  - `PlanningPanels.tsx`: el campo `description` pasa a `'richtext'`. La columna usa `RichTextClamp`. `itemLabel={(item) => toPlainText(item.description)}`. `detail`: título "Detalle del objetivo", y en el cuerpo `RichTextView`, más Métrica, Meta y Estado.
  - `Registers.tsx` `RisksPage`: `description` y `responsePlan` pasan a `'richtext'`. La columna "Riesgo" usa `RichTextClamp`. `itemLabel` usa `toPlainText`. `detail`: título "Detalle del riesgo", con Descripción (`RichTextView`), Plan de respuesta (`RichTextView` con `empty="Sin plan de respuesta."`), tipo, puntaje, respuesta, responsable y estado.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: objetivos y riesgos con formato`.

---

### Task 6: Datos RACI, actividades y lectura de la matriz

**Files:**
- Modify: `server/prisma/schema.prisma`, `shared/src/index.ts`, `server/src/app.ts`
- Create: migración `server/prisma/migrations/<timestamp>_add_raci/`, `shared/src/raci.ts`, `server/src/domain/raci.ts`, `server/src/routes/raci.ts`
- Test: `server/tests/domain/raci.test.ts`, `server/tests/raci.test.ts`

**Interfaces:**
- Produces (shared):
  - `RACI_ROLE = ['R', 'A', 'C', 'I'] as const`, `type RaciRole`.
  - `type RaciWarning = 'missing_a' | 'multiple_a' | 'missing_r'`.
  - `raciActivitySchema = z.object({ title: required('Escribe la actividad'), description: z.string().default('') })`.
  - `updateRaciActivitySchema`: los mismos campos, opcionales.
  - `raciCellSchema = z.object({ activityId: required('Selecciona una actividad'), kind: z.enum(['member', 'stakeholder']), partyId: required('Selecciona un participante'), role: z.enum(RACI_ROLE, { message: 'Usa R, A, C o I' }).nullable() })`.
  - Si `required` no se exporta desde `schemas.ts`, expórtalo para reutilizarlo.
- Produces (server):
  - Prisma `RaciActivity { id, projectId, title, description @default(""), createdAt, updatedAt, project (onDelete: Cascade), cells RaciCell[], @@index([projectId]) }`.
  - Prisma `RaciCell { id, activityId, stakeholderId String?, userId String?, role String, createdAt, updatedAt, activity (Cascade), stakeholder Stakeholder? (Cascade), user User? (Cascade), @@unique([activityId, userId]), @@unique([activityId, stakeholderId]), @@index([stakeholderId]), @@index([userId]) }`. Agrega las relaciones inversas en `Project`, `Stakeholder` y `User`.
  - `raciWarnings(roles: string[]): RaciWarning[]`, en ese orden: `missing_a` si no hay `A`, `multiple_a` si hay más de una, `missing_r` si no hay `R`.
  - `raciRoutes(app)`. La forma de la respuesta de `GET /api/projects/:id/raci` está en la spec. `members` sale de `ProjectMember` (`id` = `userId`, `name` del usuario) y `stakeholders` del registro; ambos en orden alfabético por nombre. `activities` va en orden de creación.

- [ ] **Step 1: Write the failing tests:**
  - `server/tests/domain/raci.test.ts`:

```ts
it.each([
  [[], ['missing_a', 'missing_r']],
  [['R'], ['missing_a']],
  [['A'], ['missing_r']],
  [['A', 'A', 'R'], ['multiple_a']],
  [['A', 'A'], ['multiple_a', 'missing_r']],
  [['A', 'R', 'C', 'I'], []],
])('raciWarnings(%j) = %j', (roles, expected) => {
  expect(raciWarnings(roles)).toEqual(expected);
});
```

  - `server/tests/raci.test.ts`, con PM, Ana (miembro, colaboradora) y un proyecto:
    - "colaborador 403 y no miembro 404" en `GET`, `POST` de actividades y `PUT` de celdas.
    - "crea, edita y elimina actividades en orden de creación": `POST {title:'Diseño'}` → 201 con `description: ''`. `POST {title:'Pruebas'}`. `PATCH` de la primera a `'Diseño final'`. `GET` → títulos `['Diseño final', 'Pruebas']`, ambas con `warnings: ['missing_a', 'missing_r']`. `DELETE` → 200 y queda una.
    - "un título vacío responde 400 en title".
    - "una actividad de otro proyecto responde 404" en `PATCH` y `DELETE`.
    - "GET agrupa miembros e interesados en orden alfabético": miembros Zoe y Ana, e interesados Mario y Beto → `members.map(name) = ['Ana','Zoe']`, `stakeholders.map(name) = ['Beto','Mario']`, `cells = []`.
    - "borrar el proyecto borra sus actividades": el recuento de `raciActivity` vuelve a 0.
- [ ] **Step 2: Run** `npm test -w server -- raci` → FAIL.
- [ ] **Step 3: Implement** el esquema Prisma y genera la migración con `npx prisma migrate dev --name add_raci` desde `server/` (con el `DATABASE_URL` de desarrollo que usaron las migraciones anteriores). Revisa que el SQL solo crea tablas e índices.
- [ ] **Step 4: Implement** `shared/src/raci.ts`, `server/src/domain/raci.ts` y, en `server/src/routes/raci.ts`, `GET` y las tres rutas de actividades con `requireProjectPm`. Registra `raciRoutes` en `app.ts` después de `registerRoutes`.
- [ ] **Step 5: Run** `npm test -w shared && npm test -w server` → PASS.
- [ ] **Step 6: Commit** `feat: actividades RACI y lectura de la matriz`.

---

### Task 7: Celdas RACI, cascadas e impacto

**Files:**
- Modify: `server/src/routes/raci.ts`, `server/src/routes/members.ts`
- Test: `server/tests/raci.test.ts`, `server/tests/projects.test.ts` (o el archivo que prueba `impact`)

**Interfaces:**
- Consumes: `raciCellSchema`, el modelo `RaciCell` y `raciWarnings` (Tarea 6).
- Produces: `PUT /api/projects/:id/raci/cells` → `{ ok: true }`. `GET .../members/:userId/impact` → `{ tasks, risks, raciCells }`.

- [ ] **Step 1: Write the failing tests** en `raci.test.ts`:
  - "asignar A y R deja la fila Completa": `PUT {activityId, kind:'member', partyId: ana.id, role:'A'}` y `PUT {…, kind:'stakeholder', partyId: mario.id, role:'R'}` → `GET` con `warnings: []` y dos `cells` con `{activityId, kind, partyId, role}`.
  - "cambiar R por A no duplica la celda": dos `PUT` al mismo participante → `prisma.raciCell.count() === 1` con `role 'A'`.
  - "role null vacía la celda": el recuento vuelve a 0. Vaciar una celda inexistente responde 200.
  - "participante ajeno responde 400 en partyId": un usuario que no es miembro, un interesado de otro proyecto y un `kind:'member'` con id de interesado.
  - "rol inválido responde 400 en role": `role: 'X'`.
  - "actividad de otro proyecto responde 404".
  - "eliminar la actividad borra sus celdas"; "eliminar el interesado borra sus celdas" (vía `DELETE /stakeholders/:id`).
  - "quitar a un miembro borra sus celdas solo en ese proyecto": Ana es miembro de dos proyectos con celdas en ambos; tras quitarla del primero, queda 1 celda, la del segundo.
  - "impact informa raciCells": Ana con 2 celdas → `impact.raciCells === 2`.
- [ ] **Step 2: Run** `npm test -w server -- raci` → FAIL.
- [ ] **Step 3: Implement:**
  - `PUT /cells`: `requireProjectPm`, `parse`, y la actividad con `findFirst({ id, projectId })` (si no existe, `notFound`). Valida el participante: `member` → `projectMember` del proyecto; `stakeholder` → `stakeholder` con ese `projectId`. Si no, `fieldError('partyId', 'El participante no pertenece al proyecto')`.
  - Con `role === null` → `deleteMany`. Si no, `upsert` por la clave única `activityId_userId` o `activityId_stakeholderId`.
  - `members.ts`: en la transacción de `DELETE`, `prisma.raciCell.deleteMany({ where: { userId, activity: { projectId } } })`. `impact` suma `raciCells` con el mismo filtro.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: celdas RACI y su limpieza al quitar participantes`.

---

### Task 8: Matriz RACI en la interfaz

**Files:**
- Create: `client/src/components/raci/RaciMatrix.tsx`, `client/src/components/raci/ActivityForm.tsx`
- Modify: `client/src/api/types.ts`, `client/src/pages/project/Registers.tsx` (`StakeholdersPage`), `client/src/components/project/MembersPanel.tsx`
- Test: `client/tests/raci.test.tsx`

**Interfaces:**
- Consumes: la API de las Tareas 6 y 7.
- Produces:
  - `type RaciMatrixData = { activities: { id: string; title: string; description: string; warnings: RaciWarning[] }[]; members: { id: string; name: string }[]; stakeholders: { id: string; name: string }[]; cells: { activityId: string; kind: 'member' | 'stakeholder'; partyId: string; role: RaciRole }[] }` en `api/types.ts`.
  - `raciKey = (projectId: string) => ['project', projectId, 'raci']`.
  - `RaciMatrix({ projectId }: { projectId: string })`.

- [ ] **Step 1: Write the failing tests** en `client/tests/raci.test.tsx` con `mockApi` en `/proyectos/p1/interesados`:
  - "muestra la matriz con columnas agrupadas y leyenda": encabezados "Equipo" e "Interesados"; columnas Ana y Zoe, luego Beto; la leyenda con las cuatro frases exactas.
  - "muestra los avisos por fila": actividad sin celdas → "Falta A" y "Falta R". Con dos A y una R → "Más de una A". Con una A y una R → "Completa".
  - "cambiar una celda envía PUT y desactiva la celda mientras tanto": el select `Diseño — Ana` cambia a `A` → `calls` contiene `PUT /api/projects/p1/raci/cells` con `{activityId:'a1', kind:'member', partyId:'u-ana', role:'A'}`. Mientras la promesa no se resuelve, el select está desactivado.
  - "vaciar una celda envía role null".
  - "si falla, la celda vuelve a su valor y muestra el motivo": `PUT` → `apiError(400, 'validation_error', { message: 'El participante no pertenece al proyecto', fields: { partyId: 'El participante no pertenece al proyecto' } })`. El select vuelve a `R` y el motivo aparece (toast o texto en la fila).
  - "estado vacío sin actividades": "Aún no hay actividades" y el botón "Añadir actividad".
  - "estado vacío sin participantes": con actividades y sin miembros ni interesados → "Añade miembros en el Resumen o interesados en el registro de arriba".
  - "crear una actividad": "Añadir actividad" → Modal con "Actividad" y "Descripción" → `POST /raci/activities` con `{title, description}`. Un 400 en `title` se muestra bajo el campo.
  - "editar y eliminar una actividad": botones `Editar Diseño` y `Eliminar Diseño`, con confirmación «Diseño».
  - "la caja se desplaza y la primera columna es fija": la tabla está dentro de un elemento con `overflow-x-auto` y las celdas de actividad tienen `sticky`.
  - "quitar miembro avisa de sus celdas RACI" (en el Resumen, con `GET .../members/:userId/impact` simulado): el aviso dice "… y de 2 celda(s) RACI." cuando `impact` trae `raciCells: 2`.
- [ ] **Step 2: Run** `npm test -w client -- raci` → FAIL.
- [ ] **Step 3: Implement:**
  - `RaciMatrix`: `useQuery(raciKey)`. Tabla con dos filas de encabezado: la primera con "Actividad", "Equipo" (`colSpan` = miembros) e "Interesados" (`colSpan` = interesados), y la segunda con los nombres. Cada fila tiene título, descripción en `text-xs`, avisos y botones de editar y eliminar.
  - Cada celda es un `select` con `aria-label={`${activity.title} — ${party.name}`}` y estas opciones: `''` → "—", `R` → "R · Hace", `A` → "A · Aprueba", `C` → "C · Consultado", `I` → "I · Informado". El color va por valor: R `bg-ok-bg text-ok-fg`, A `bg-warn-bg text-warn-fg`, C `bg-info-bg text-info-fg`, I `bg-raised text-ink-nav` y vacío sin fondo.
  - Estado local `pending: Record<cellKey, RaciRole | null>`. Al cambiar, se guarda el valor optimista, el select se desactiva y se envía el `PUT`. Si sale bien, se invalida `raciKey`. Si falla, se quita el valor optimista y se muestra `toast.error(errorMessage(error))`. El valor mostrado es `pending[key] ?? celdaDelServidor`.
  - Los avisos usan `Badge`: `warning` con `TriangleAlert` para los avisos y `success` con `CircleCheck` para "Completa".
  - La caja de la tabla es `overflow-x-auto`. La primera columna es `sticky left-0 z-10 bg-surface` y tiene `min-w-48`.
  - `ActivityForm`: Modal "Añadir actividad" o "Editar actividad" con `FormField` "Actividad" (`input`) y "Descripción" (`textarea`, texto simple), y errores con `applyFieldErrors`.
  - `StakeholdersPage`: debajo del `RegisterTable`, `<RaciMatrix projectId={project.id} />` en un `Card` titulado "Matriz RACI". `onChanged` del registro invalida `raciKey`.
  - `MembersPanel`: el tipo de `impact` incluye `raciCells` y el aviso añade `y de ${raciCells} celda(s) RACI`. Al quitar un miembro se invalida `raciKey`.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: matriz RACI en la pestaña Interesados`.

---

### Task 9: Flujo completo, README y verificación final

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `README.md`

- [ ] **Step 1: Update the e2e flow:**
  - Acta: en "Justificación", `click()` y luego `pm.keyboard.type('Modernizar el sitio')`. En "Alcance incluido", pulsa "Lista con viñetas" de la barra "Formato de Alcance incluido" y escribe `Sitio público`, `Enter`, `Blog`. "Criterios de éxito" se rellena con `fill`. Después de aprobar, en el acta (solo lectura en el colaborador o al recargar) hay un `li` con "Blog". Comprueba esto en el paso donde un colaborador ya abre el proyecto, o recarga la página como PM y comprueba `getByRole('textbox', { name: 'Alcance incluido' }).locator('li')` con dos elementos.
  - RACI: en "Interesados", "Añadir actividad" → "Aprobar diseño" → Guardar. Selects `Aprobar diseño — Beatriz` → `A` y `Aprobar diseño — Carlos` → `R`, y luego `expect(getByText('Completa')).toBeVisible()`.
- [ ] **Step 2: Run** `npm run test:e2e` → PASS.
- [ ] **Step 3: Update `README.md`:** menciona el editor con formato (campos y etiquetas admitidas), la matriz RACI en Interesados (solo PM), y que hay que copiar `data/` antes de actualizar porque se añade una migración.
- [ ] **Step 4: Verify everything:** `npm test`, `npm run build` y `npm run test:e2e`, todos en verde. Abre la app en Edge a 375 px y revisa la barra del editor en el acta y la matriz con nombres largos (desplazamiento horizontal y primera columna fija).
- [ ] **Step 5: Commit** `test: flujo completo con acta con formato y RACI; docs: README`.
