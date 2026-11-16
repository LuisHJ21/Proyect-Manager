# Etapa 5: planificación completa (F6, F7 y F8)

Resto de la etapa 5 de `docs/guia-implementacion-pmbok.md`. F5 (EDT) ya está hecha. Este documento cubre las tres funciones que faltan, en una rama (`etapa-5-planificacion`) y un plan con tres bloques en este orden: F8, F6 y F7.

## Intención

Con la EDT, el PM descompone el trabajo, pero aún no puede:

- Planificar el esfuerzo del equipo ni ver si alguien está sobrecargado. Hoy el panel cuenta tareas, no horas.
- Saber qué tareas mueven la fecha de fin. No hay ruta crítica, y las dependencias son siempre «fin a inicio», sin desfase.
- Separar el presupuesto en reservas y categorías. La «reserva» es solo presupuesto menos costo planeado.

## Objetivos

- **F8:** el PM fija una reserva de contingencia, una reserva de gestión y un presupuesto por categoría de gasto, y ve lo planeado frente a lo real en cada categoría y cuánto de la contingencia se proyecta usar.
- **F6:**
  - El PM estima horas por tarea y fija la tarifa y la capacidad semanal de cada miembro.
  - El equipo registra sus horas.
  - Las horas por la tarifa entran al costo real.
  - El panel compara horas asignadas con capacidad por semana.
- **F7:**
  - Las dependencias tienen tipo (FS, SS, FF, SF) y desfase en días.
  - El sistema calcula la holgura de cada tarea y la ruta crítica, y el cronograma la resalta.
  - Al mover una fecha, el PM puede reprogramar las sucesoras, siempre viendo antes el cambio y confirmándolo.

## Fuera de alcance

- Calendario laboral (fines de semana, festivos). Todo sigue en días naturales, como hoy.
- Nivelación automática de recursos.
- Aprobación de horas por el PM; las horas registradas cuentan al guardarse.
- Tarifas por fecha (historial de tarifas): cada registro guarda la tarifa vigente al crearse.
- Presupuesto por categoría a nivel de tarea.

## Anti-objetivos

- **Costo doble:** el mismo trabajo del equipo no debe sumar dos veces, como horas y como gasto de «Mano de obra».
- **Tarifas a la vista:** un colaborador u observador no ve tarifas, costo de horas ni reservas.
- **Cambios sin confirmar:** reprogramar no mueve ninguna fecha sin que el PM vea el cambio y lo confirme.
- **Fechas de la EDT:** ninguna función nueva escribe fechas, horas ni dependencias en una tarea con subtareas.

## Enfoques considerados

### F6: el costo de las horas (elegido por el responsable: A)

1. **A, horas por tarifa al costo real.** Las horas suman al costo real automáticamente y se muestran aparte como «Mano de obra del equipo». La categoría de gasto «Mano de obra» queda para trabajo externo, con un aviso. **Elegida.**
2. **B, las horas solo miden esfuerzo.** El CPI no reflejaría las horas trabajadas. Descartado.
3. **C, cada registro genera un gasto.** Llena los gastos de registros pequeños y obliga a mantener dos cosas en sincronía. Descartado.

### F7: días naturales o laborables

Se usan días naturales, igual que el resto del sistema (`diffDays`, línea base, valor ganado). Los días laborables necesitarían configurar el calendario del proyecto. Es una decisión mía para revisar.

### Plan y revisión

Una especificación y un plan con tres bloques, y una revisión final de toda la rama. Es la misma forma que la etapa 4.

## Diseño

### F8. Reservas y presupuesto por categoría

**Datos:**

- Migración en `Project`: `contingencyReserveCents BigInt @default(0)` y `managementReserveCents BigInt @default(0)`.
- Modelo nuevo `BudgetCategory { projectId, category, plannedCents BigInt }`, único por proyecto y categoría. La categoría usa `EXPENSE_CATEGORY`.

**Reglas:**

- Las reservas se editan en el formulario del proyecto, solo el PM, con los mismos límites que el presupuesto.
- `PUT /api/projects/:id/budget-categories` recibe `{ items: [{ category, plannedCents }] }` y reemplaza todas las filas.
  - Es solo para PM y queda cubierto por `closedGuard`.
  - Se valida con un esquema de shared.
  - Una categoría repetida da 400.
- Las reservas y el presupuesto por categoría no deben superar el presupuesto. Si la suma (costo planeado de la línea base o de las hojas + contingencia + gestión) pasa del presupuesto, no se rechaza: se muestra el aviso «La línea base y las reservas superan el presupuesto del proyecto».

**Cálculos (`computeEvm` y Presupuesto):**

- `reserveCents` se reemplaza por:
  - `contingencyCents`;
  - `managementCents`;
  - `unallocatedCents = presupuesto − BAC − contingencia − gestión`;
  - `contingencyUseCents = max(0, EAC − BAC)`, que es el sobrecosto proyectado que consumiría la contingencia.
- Si `contingencyUseCents > contingencyCents`, Desempeño avisa «El sobrecosto proyectado supera la reserva de contingencia».

**Interfaz:**

- La pestaña Presupuesto suma una tabla por categoría: planeado, real y diferencia.
  - El real sale de los gastos de cada categoría.
  - «Mano de obra del equipo» (F6) aparece como fila propia, sin planeado.
  - Al pie, contingencia, gestión y «Sin asignar».
- El PM edita lo planeado por categoría en una ventana.
- La tarjeta «Reserva» de Desempeño pasa a «Contingencia», con el uso proyectado.

### F6. Esfuerzo, horas y capacidad

**Datos:**

- `Task.estimatedHours Decimal? @db.Decimal(7,2)`: horas estimadas de una hoja; en una padre se resume como suma.
- `ProjectMember.hourlyRateCents BigInt @default(0)` y `weeklyCapacityHours Int @default(40)`.
- Modelo nuevo `TimeEntry { id, taskId, userId, date (YYYY-MM-DD), hours Decimal(5,2), note, rateCents BigInt, createdAt }`.
  - `rateCents` es la tarifa del miembro al crear el registro y no cambia después.
  - Borrar la tarea borra sus horas en cascada. Borrar la cuenta del usuario no está permitido mientras tenga horas (`Restrict`, como ya pasa con los miembros).

**Reglas:**

- **Estimar horas:** `estimatedHours` entra en `updateTaskSchema` y `createTaskSchema` (de 0 a 9 999, con dos decimales). En una padre da 400 «Se calcula con sus subtareas».
- **Tarifa y capacidad:** se editan en `PATCH /api/projects/:id/members/:userId`, solo el PM. La tarifa no viaja nunca hacia un colaborador u observador; la capacidad sí, porque la necesita su vista de carga.
- **Registrar horas:**
  - `POST /api/tasks/:id/time-entries { date, hours, note? }`.
  - Lo usan el PM y los responsables de la tarea.
  - Las horas van de 0,25 a 24 por registro.
  - La fecha no puede estar en el futuro; si lo está, 400 «No se registran horas futuras».
  - En una padre, 409 `task_is_summary`.
  - En un proyecto cerrado, `project_closed`.
- **Editar o borrar:** `PATCH` y `DELETE /api/tasks/:id/time-entries/:entryId`, para quien registró la entrada o el PM. La edición no cambia `rateCents`.
- **Ver:** `GET /api/tasks/:id/time-entries` lista las entradas.
  - El PM las ve todas, con `rateCents` y costo.
  - El colaborador ve todas las de la tarea, pero sin tarifa ni costo.
  - El observador no ve ninguna (403).

**Costo real:**

- El costo de mano de obra del equipo es `Σ hours × rateCents` de las entradas con `date <= hoy`, redondeado al centavo.
- Se suma al costo real donde hoy solo se suman gastos: valor ganado (AC), `outsideBaselineCostCents` (las horas de tareas fuera de la línea base), presupuesto gastado de los indicadores, salud del proyecto, panel («sobre presupuesto») y costo real del informe de cierre.
- El costo ligado a una tarea (`linkedCostCents` en Desempeño y «Gasto ligado» en el detalle) suma también sus horas.
- **Aviso contra el costo doble:** al crear o editar un gasto de categoría «Mano de obra», el formulario muestra «Usa esta categoría para trabajo externo. Las horas del equipo ya suman su costo desde la tarifa de cada miembro.»

**Avance:** `weightedProgress` usa primero las horas estimadas si todas las hojas las tienen; si no, el costo; si no, la duración. Es lo que la guía anticipó en C7.

**Carga del equipo:**

- **Horas asignadas por semana:** se calculan para cada miembro y cada semana (de lunes a domingo).
  - Las horas estimadas de cada hoja no terminada se reparten por igual entre sus responsables y en línea recta entre su inicio y su fin, en días naturales.
  - Una hoja sin fechas o sin horas estimadas no suma.
- **Panel:** la carga muestra, para la semana actual y las 3 siguientes, horas asignadas frente a capacidad. La capacidad de una persona es la suma de su `weeklyCapacityHours` en cada proyecto activo.
  - Una semana pasa a «Sobrecargada» cuando las horas asignadas superan la capacidad.
  - El recuento de tareas abiertas y vencidas se mantiene.

**Interfaz:**

- **Formulario de tarea:** campo «Horas estimadas»; en una padre, de solo lectura con el resumen.
- **Detalle de tarea:**
  - Sección «Horas» con la lista de entradas (fecha, persona, horas, nota) y el total frente a lo estimado.
  - Formulario «Registrar horas» para el PM y los responsables.
  - Botones para editar y borrar las propias entradas.
  - El PM ve además el costo.
- **Miembros (Resumen):** el PM ve y edita la tarifa por hora y la capacidad semanal de cada miembro.
- **Mis tareas:** cada tarea muestra «Registrar horas».

### F7. Ruta crítica y tipos de dependencia

**Datos:** migración en `TaskDependency`: `type String @default("FS")` (FS, SS, FF, SF) y `lagDays Int @default(0)`, con desfase de −365 a 365. Las dependencias existentes quedan como FS con desfase 0.

**Reglas:**

- `POST /api/tasks/:id/dependencies` acepta `type` y `lagDays`. Se añade `PATCH /api/tasks/:id/dependencies/:predecessorId { type?, lagDays? }`, solo para PM, cubierta por `closedGuard`.
- **Bloqueo de avance:** solo una predecesora FS sin terminar impide avanzar la sucesora (`checkProgressChange`).
  - Una SS sin empezar (estado «Por hacer») impide pasar la sucesora a «En curso».
  - FF y SF no bloquean el avance.
- **Advertencia de fechas:** `starts_before_predecessor_due` pasa a `date_conflict` («Las fechas no respetan una dependencia»). Aparece cuando las fechas guardadas violan alguna restricción, con S = inicio y F = fin:
  - FS: S sucesora ≥ F predecesora + 1 + desfase.
  - SS: S sucesora ≥ S predecesora + desfase.
  - FF: F sucesora ≥ F predecesora + desfase.
  - SF: F sucesora ≥ S predecesora + desfase.

**Cálculo (función pura `criticalPath(tasks, dependencies)` en `server/src/domain/criticalPath.ts`):**

- Entra solo en hojas con inicio y fin. La duración es `fin − inicio + 1` días.
- **Pasada hacia adelante:**
  - Inicio temprano = el mayor entre su inicio planeado y lo que exige cada predecesora según el tipo y el desfase.
  - Fin temprano = inicio temprano + duración − 1.
- **Pasada hacia atrás:**
  - El fin tardío de las tareas finales es el fin del proyecto o, si no tiene, el mayor fin temprano.
  - Se propaga con las mismas restricciones invertidas.
- **Holgura total** = inicio tardío − inicio temprano, en días.
- **Crítica:** una tarea es crítica si su holgura es ≤ 0.
- Las tareas sin fechas, o ligadas a una sin fechas, se ignoran en el cálculo y se informan como `unscheduled`.
- Devuelve, por tarea, `{ earlyStart, earlyFinish, lateStart, lateFinish, totalFloat, critical }`, la lista crítica en orden y las tareas sin calcular. Si hay ciclos (no debería, se rechazan al crearlos), lanza un error interno.

**Ruta:** `GET /api/projects/:id/schedule` devuelve el cálculo, con la misma lectura que tareas para todos los perfiles, porque no hay costos.

**Reprogramar sucesoras:**

- `POST /api/tasks/:id/reschedule { apply: boolean }`, solo para PM.
- Con `apply: false` devuelve una propuesta: la lista de sucesoras (directas e indirectas) cuyas fechas violan alguna dependencia, cada una con sus fechas actuales y las nuevas. Cada sucesora se mueve lo mínimo para cumplir y conserva su duración. Solo se mueve hacia adelante, nunca antes.
- Con `apply: true` vuelve a calcular y guarda en una transacción, subiendo la `version` de cada tarea movida (C11).
- Si alguna fecha nueva cae fuera del proyecto, responde 409 `reschedule_outside` con «La reprogramación deja tareas fuera del proyecto: <títulos>» y no guarda nada.

**Interfaz:**

- **Cronograma:** las barras críticas se resaltan con un borde de color de riesgo y la leyenda «Ruta crítica». Cada barra muestra la holgura en su tooltip.
- **Detalle de tarea:** junto a cada predecesora, el tipo y el desfase («FS +2 d») y un botón para cambiarlos. También se muestran la holgura y «Crítica» si lo es.
- **Botón «Reprogramar sucesoras»:** aparece en el detalle si hay sucesoras en conflicto. Abre una ventana con la tabla de cambios y el botón «Aplicar».
- **Después de guardar fechas:** si el guardado de una tarea deja sucesoras en conflicto, aparece el aviso «Hay sucesoras que ya no respetan sus dependencias» con el botón «Reprogramar sucesoras».

### Pruebas

- **F8:**
  - Reservas en el formulario (solo PM), PUT de categorías (repetida 400, colaborador 403, proyecto cerrado 409).
  - `computeEvm` con `unallocatedCents` y `contingencyUseCents`, y los avisos.
  - La tabla por categoría.
  - El colaborador no recibe reservas en `GET /api/projects/:id`.
- **F6:**
  - Entradas: responsable sí, otro colaborador 403, observador 403, fecha futura 400, padre 409, editar o borrar ajenas 403.
  - `rateCents` se congela al crear.
  - El colaborador no recibe tarifa ni costo (lista de horas y miembros).
  - AC, indicadores, salud, panel, cierre y `outsideBaselineCostCents` suman las horas hasta hoy.
  - Avance por horas estimadas.
  - Reparto semanal de la carga, con tarea de varios responsables, tarea que cruza semanas y tarea terminada fuera.
  - Aviso del gasto «Mano de obra».
- **F7:**
  - `criticalPath` con cadena FS, SS con desfase, FF, SF, desfase negativo, dos ramas (una con holgura), tareas sin fechas y fin del proyecto como límite.
  - Bloqueo de avance por tipo.
  - `date_conflict` por cada tipo.
  - Reprogramar: propuesta, aplicar, cadena indirecta, nunca hacia atrás, fuera del proyecto 409 sin cambios, versión subida.
  - PATCH de dependencia cubierto por `closedGuard`.
  - El cronograma resalta las críticas.
- **Generales:** la matriz de acceso, la bitácora y las pruebas de lo que no ve el colaborador cubren todas las rutas nuevas, y el flujo completo sigue pasando.

## Decisiones mías para revisar

- **Días naturales** en la ruta crítica, igual que el resto.
- **La tarifa se congela** en cada registro de horas. Cambiar la tarifa no reescribe el costo pasado.
- **Las horas cuentan al guardarse**, sin aprobación del PM.
- **La capacidad semanal es por proyecto** y el panel la suma entre proyectos activos. Por defecto, 40 h.
- **Horas estimadas primero** en el avance ponderado: si todas las hojas las tienen, pesan por horas; si no, por costo; si no, por duración.
- **La contingencia se «consume» con el sobrecosto proyectado** (EAC − BAC), en vez de con movimientos manuales.
- **Las reservas por encima del presupuesto avisan, no bloquean.**
- **El colaborador ve las horas de todos** en la tarea (sin costo), para coordinar.
- **Reprogramar solo mueve hacia adelante** y conserva la duración.
- **Orden de los bloques F8, F6, F7:** de menor a mayor riesgo. F6 toca todos los cálculos de costo, y F7 añade el cálculo más complejo.

## Lo que queda al constructor

- Dónde se calcula el costo de mano de obra para reutilizarlo en todos los cálculos. Se espera una función de carga junto a `loadEvmInput`.
- La forma exacta de la tabla de carga semanal en el panel.
- El estilo del borde de ruta crítica.
