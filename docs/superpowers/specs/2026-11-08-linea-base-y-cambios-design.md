# Línea base, valor ganado y control de cambios: especificación de diseño

**Fecha:** 2026-11-08
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-07-editor-y-raci-design.md`

## 1. Propósito

1. El PM sabe si cada proyecto va bien en costo y plazo comparado con lo planeado, no solo cuánto lleva.
2. El plan se compara con una línea base congelada y con historial de versiones.
3. Los cambios del proyecto quedan registrados con su impacto y su decisión.

### Criterios de éxito

1. El PM pone un costo planeado a las tareas, fija la línea base y ve CPI, SPI y la proyección del costo final.
2. El PM ve qué tareas se atrasan contra la línea base y cuánto valor ganado aporta cada una.
3. Cada solicitud de cambio tiene impacto, estado y decisión, y una nueva versión de línea base puede citarla.
4. Nada de esto llega a los colaboradores.

## 2. Datos

### Costo planeado por tarea

- `Task.plannedCostCents` (BigInt, por defecto 0, no negativo, mismo tope que los montos actuales).
- Solo el PM lo ve y lo edita. El detalle y las listas de tareas no lo envían a un colaborador.
- El campo se llama "Costo planeado" y usa el mismo control de montos que el presupuesto.

### Gasto ligado a una tarea

- `Expense.taskId` es opcional. Si se borra la tarea, el gasto queda sin tarea (`SetNull`).
- La tarea debe ser del mismo proyecto. Si no lo es, el servidor responde 400 en `taskId`.

### Línea base

- **`Baseline`:** `id`, `projectId`, `version` (1, 2, 3…, por proyecto), `reason`, `bacCents`, `startDate` y `endDate` del proyecto en ese momento, `changeRequestId` opcional, `createdById`, `createdAt`. Se borra con su proyecto.
- **`BaselineTask`:** `id`, `baselineId`, `taskId` (texto, sin relación: la tarea puede borrarse después), `title`, `startDate`, `dueDate`, `plannedCostCents`. Se borra con su línea base.
- Al fijarla se copian las tareas con costo planeado mayor que 0. `bacCents` es la suma de sus costos.
- **Condiciones:**
  - debe haber al menos una tarea con costo; si no, 400 `baseline_empty`;
  - toda tarea con costo debe tener fecha de inicio y de fin; si no, 400 `baseline_missing_dates` con la lista de esas tareas (`details.tasks: [{ id, title }]`).
- **Versiones:** la versión 1 admite motivo vacío. Desde la 2 el motivo es obligatorio (400 en `reason`).
- **Cambio ligado:** opcional; debe ser una solicitud aprobada del mismo proyecto. Si no, 400 en `changeRequestId`.
- La versión vigente es la de número mayor. Las anteriores se conservan como historial.

### Registro de cambios

- **`ChangeRequest`:** `id`, `projectId`, `number` (correlativo por proyecto, se muestra "CR-1"), `title` (obligatorio), `description`, `requestedBy` (texto libre), `scopeImpact` (texto), `scheduleImpactDays` (entero, puede ser negativo, opcional), `costImpactCents` (BigInt, puede ser negativo, opcional), `status` (`PENDING`, `APPROVED`, `REJECTED`), `decisionNote`, `decidedAt`, `decidedById`, y fechas de creación y actualización. Se borra con su proyecto.
- **Decidir:** aprobar o rechazar pide una nota (obligatoria) y guarda fecha y PM.
- **Después de decidida:** editar, decidir de nuevo o borrar responde 409 `change_decided`.
- Borrar una solicitud pendiente está permitido. Una línea base no puede ligar una solicitud borrada, porque solo se ligan aprobadas.

### Fotos diarias

- **`EvmSnapshot`:** `projectId`, `date` (AAAA-MM-DD), `bacCents`, `pvCents`, `evCents`, `acCents`. Clave única `(projectId, date)`. Se borra con su proyecto.
- Cada vez que se consulta el desempeño de un proyecto con línea base se guarda o actualiza la foto del día.

## 3. Cálculos

Todos los montos van en centavos enteros. Los cálculos se hacen a la fecha de hoy y con la línea base vigente, en una función pura `computeEvm(input, today)`.

| Indicador | Regla |
|---|---|
| **Fracción planeada de una tarea** | Días transcurridos desde su inicio hasta hoy, ambos incluidos, entre los días de inicio a fin, ambos incluidos. 0 antes del inicio y 1 desde el fin. Una tarea de un día vale 1 desde ese día. |
| **PV** | Suma del costo base × fracción planeada, redondeada al centavo. |
| **EV** | Por cada tarea de la línea base que aún existe: costo base × avance actual / 100, redondeado. Una tarea borrada aporta 0. |
| **AC** | Suma de los gastos del proyecto con fecha hasta hoy. |
| **CPI** | EV / AC, con 2 decimales. Si AC es 0, `null`. |
| **SPI** | EV / PV, con 2 decimales. Si PV es 0, `null`. |
| **CV y SV** | CV = EV − AC. SV = EV − PV. |
| **EAC** | BAC / CPI, redondeado. Si CPI es `null` o 0, vale BAC. |
| **ETC y VAC** | ETC = máx(EAC − AC, 0). VAC = BAC − EAC. |
| **% completado** | EV / BAC × 100, redondeado. |
| **Reserva** | Presupuesto del proyecto − BAC. Si es negativa, se avisa que el BAC supera el presupuesto. |

**Por tarea**, para cada tarea de la línea base y cada tarea actual con costo fuera de ella:

- costo base, avance, EV y gasto ligado (suma de sus gastos, de cualquier fecha);
- **desvío de fin:** días entre el fin actual y el fin base. Positivo es atraso;
- **estado:** "Atrasada" si el desvío es mayor que 0, "A tiempo" si no, "Fuera de línea base" si no está en la base, y "Eliminada" si ya no existe.

**Tareas fuera de la línea base:** las tareas actuales con costo que no están en la base no suman a PV ni a EV. Se informan con su número.

**Colores** de CPI y SPI: verde desde 1, ámbar desde 0,9 y por debajo de 1, y rojo bajo 0,9. Sin valor, "—" sin color.

## 4. Salud del proyecto

La regla de salud actual no cambia, y se agrega una condición: si el proyecto tiene línea base y su CPI o su SPI es menor que 0,9, el proyecto queda al menos en **Requiere atención**. Si otra regla ya lo marca en riesgo, sigue en riesgo. El panel general y la lista de proyectos usan esta regla.

## 5. API (solo PM; colaborador 403, no miembro 404)

- `GET /api/projects/:id/performance`:

```
{
  baseline: null | { version, reason, bacCents, startDate, endDate, createdAt, createdBy: { id, name }, changeRequest: { id, number, title } | null },
  history: [{ version, reason, bacCents, createdAt, createdBy, changeRequest }],
  metrics: null | { pvCents, evCents, acCents, bacCents, cpi, spi, cvCents, svCents, eacCents, etcCents, vacCents, percentComplete, reserveCents },
  tasks: [{ taskId, title, baselineCostCents, progress, evCents, linkedCostCents, finishVarianceDays, state: 'LATE' | 'ON_TIME' | 'OUTSIDE' | 'DELETED' }],
  outsideBaseline: number,
  series: [{ date, pvCents, evCents | null, acCents | null }]
}
```

  - `series` da el PV de cada día entre el inicio y el fin de la línea base, más hoy si cae fuera. EV y AC vienen de las fotos guardadas y son `null` en los días sin foto.
  - `history` va de la versión más nueva a la más antigua.
  - Sin línea base, `baseline`, `metrics` y `series` vacíos o `null`, y `tasks` vacío.
- `POST /api/projects/:id/baselines` `{ reason?, changeRequestId? }` → 201 con la nueva versión.
- `GET/POST /api/projects/:id/change-requests`, `PATCH` y `DELETE /api/projects/:id/change-requests/:crId`.
- `POST /api/projects/:id/change-requests/:crId/decision` `{ status: 'APPROVED' | 'REJECTED', note }`.
- Las rutas de tareas aceptan `plannedCostCents` solo del PM y lo devuelven solo al PM.
- Las rutas de gastos aceptan y devuelven `taskId`.

## 6. Interfaz

### Pestaña Desempeño (solo PM)

- **Sin línea base:** explicación breve, número de tareas con costo, y el botón "Fijar línea base". Si faltan fechas, se lista qué tareas las necesitan con un enlace a cada una.
- **Con línea base:**
  - **Tarjetas:** CPI, SPI, EAC, VAC, % completado y reserva, cada una con su etiqueta en palabras (por ejemplo "CPI · eficiencia de costo"). CPI y SPI usan los colores de la sección 3 junto con texto: "Sobre el costo", "En costo", "Bajo el costo"; "Adelantado", "En plazo", "Atrasado".
  - **Curva S:** líneas de PV, EV y AC sobre el tiempo, con leyenda, y una marca en hoy. Los días sin foto no rompen la línea.
  - **Tabla por tarea:** como en la sección 3, ordenada por desvío de fin, el mayor primero.
  - **Aviso:** "N tareas con costo están fuera de la línea base", si hay.
  - **Línea base:** versión vigente con fecha, autor, motivo y cambio ligado; botón "Fijar nueva línea base" que abre una ventana con motivo y un selector de solicitudes aprobadas; historial plegable.

### Pestaña Cambios (solo PM)

- Tabla con número, título, impacto en plazo y costo, estado y fecha.
- "Añadir cambio" con todos los campos, y "Ver" con el detalle y la decisión.
- Las pendientes tienen "Editar", "Eliminar", "Aprobar" y "Rechazar". Las dos últimas abren una ventana que pide la nota.
- Las decididas solo tienen "Ver".

### Otras pantallas

- **Formulario de tarea:** campo "Costo planeado", solo para el PM.
- **Detalle de tarea:** costo planeado y gasto ligado, solo para el PM.
- **Gasto:** selector "Tarea (opcional)" con las tareas del proyecto. La tabla de gastos muestra la tarea.

### Móvil

Las tarjetas se apilan. La curva ocupa el ancho disponible. Las tablas se desplazan dentro de su caja.

## 7. Errores

- Los errores por campo se muestran bajo el campo, sin perder lo escrito.
- Fijar la línea base sin condiciones muestra el mensaje y la lista de tareas que faltan.
- Una decisión rechazada por 409 muestra el motivo y recarga el registro.

## 8. Pruebas

- **`computeEvm`:**
  - PV antes del inicio, en el inicio, a la mitad, en el fin y después;
  - una tarea de un solo día;
  - CPI y SPI `null`;
  - EAC sin CPI;
  - una tarea borrada;
  - tareas fuera de la línea base;
  - gastos con fecha futura que no cuentan;
  - redondeos.
- **Salud:** CPI o SPI bajo 0,9 da Requiere atención, y no rebaja un proyecto en riesgo.
- **API de línea base:**
  - permisos;
  - versión 1 sin motivo y versión 2 sin motivo;
  - tareas sin fechas;
  - ninguna tarea con costo;
  - cambio no aprobado o de otro proyecto;
  - historial;
  - las tareas posteriores no cambian la base.
- **API de desempeño:** la foto diaria es única por día y se actualiza; `series` y `metrics`.
- **API de cambios:**
  - número correlativo por proyecto;
  - decisión con nota obligatoria;
  - 409 al editar, decidir o borrar una decidida;
  - permisos.
- **Tareas y gastos:**
  - el colaborador no recibe `plannedCostCents` y no puede enviarlo;
  - un gasto con tarea de otro proyecto;
  - borrar la tarea deja el gasto sin tarea.
- **Interfaz:**
  - pestaña sin y con línea base;
  - colores con texto;
  - lista de tareas sin fechas;
  - nueva versión con motivo;
  - registro de cambios con decisión y bloqueo de decididas;
  - campo de costo solo para el PM;
  - selector de tarea en gastos.
- **Flujo completo:** el PM pone costos a dos tareas, fija la línea base, registra un gasto ligado, ve CPI y SPI, registra un cambio, lo aprueba y fija la versión 2 citándolo.

## 9. Fuera del alcance

- Valor ganado de cartera (varios proyectos juntos).
- Horas, tarifas y capacidad del equipo.
- Curva de EV exacta con el historial completo de avance.
- Exportar a PDF o a hoja de cálculo.
- Acceso de colaboradores a Desempeño y Cambios.
- Flujo de aprobación con varios aprobadores.
