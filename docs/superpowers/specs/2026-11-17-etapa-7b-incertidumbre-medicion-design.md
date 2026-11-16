# Etapa 7, bloque B: incertidumbre y medición (F15, F16)

## Intención

El PM necesita gestionar los riesgos con más profundidad (qué los dispara, cuándo revisarlos, cuánto queda después de responder, cómo evolucionaron), llevar los supuestos como registro vivo y medir con más finura: saber qué rendimiento de costo falta (TCPI), ver si los hitos se van corriendo antes de que lleguen, ajustar a cada proyecto qué se considera «en riesgo» y sacar los datos a una hoja de cálculo.

## Decisiones del responsable

1. La tendencia de hitos guarda historial: el pronóstico se fija cada día y se ve cómo se movió cada hito.
2. El responsable pidió avanzar sin más preguntas; el resto son decisiones mías, marcadas abajo.

## Objetivos

- **F15.** Riesgos con disparador, próxima revisión, costo de contingencia, probabilidad e impacto residuales e historial de evaluaciones; matriz 5×5; registro de supuestos con conversión a riesgo o incidente.
- **F16.** TCPI en valor ganado; tendencia de hitos con historial diario; umbrales de salud por proyecto; exportación a CSV de tareas, riesgos, gastos, incidentes y lecciones.

## No objetivos

- Simulación de Monte Carlo o análisis cuantitativo de riesgos.
- Exportar a Excel nativo o PDF.
- Recordatorios automáticos de revisión de riesgos (solo se marca «Revisión vencida»).

## Antiobjetivos

- Que un colaborador u observador reciba el costo de contingencia de un riesgo o cualquier monto en un CSV.
- Que cambiar un umbral cambie la salud de otro proyecto.
- Que el CSV exporte algo que la persona no ve en pantalla.

## Enfoques considerados

- **Ampliar lo existente (elegido):** campos nuevos en `Risk` más `RiskAssessment`; `Assumption` como registro de la sección `planning`; `MilestoneForecast` guardado por la tarea diaria, igual que `EvmSnapshot`; umbrales como columnas del proyecto pasados a `computeHealth`; CSV generado en el navegador a partir de las listas que la API ya filtra por perfil.
- **CSV en el servidor:** descartado; duplicaría en cada exportación las reglas de visibilidad de cada lista. Generarlo con los datos que el navegador ya recibió garantiza que nadie exporte más de lo que ve.
- **Pronóstico calculado al leer, sin historial:** descartado por la decisión 1.

## F15. Riesgos completos

### Datos

- `Risk.trigger` (noteText, por defecto `''`), `Risk.nextReviewDate` (YYYY-MM-DD o null), `Risk.contingencyCostCents` (BigInt o null), `Risk.residualProbability` y `Risk.residualImpact` (1 a 5 o null; si viene uno debe venir el otro: «Indica probabilidad e impacto residuales juntos»).
- `RiskAssessment { id, riskId (cascada), probability, impact, residualProbability?, residualImpact?, assessedAt, assessedById (Restrict) }`. Se crea al crear el riesgo y cada vez que cambia alguno de esos cuatro valores.

### Reglas y visibilidad

- Mismas reglas de riesgos: el colaborador ve los suyos y solo cambia su estado.
- `contingencyCostCents` solo va al PM. El historial (`assessments`) va a quien ve el riesgo.
- DTO: `residualScore` (residual probabilidad × impacto o null) y `reviewOverdue` (`nextReviewDate < hoy` y el riesgo no está cerrado).

### Interfaz

- Formulario del riesgo: campos nuevos (el costo de contingencia solo para el PM).
- Detalle: disparador, próxima revisión con «Revisión vencida», residual e historial (fecha, quién, P×I y residual).
- «Matriz de riesgos» en la pestaña Riesgos: 5×5, probabilidad (filas 5→1) por impacto (columnas 1→5), con los riesgos abiertos en su celda (código o descripción corta) y un selector «Inicial / Residual». Celdas coloreadas por puntaje (≥ umbral de riesgo alto del proyecto: rojo; 8 a umbral − 1: ámbar; resto: verde).

## F15. Supuestos

- `Assumption { id, projectId, number (SUP-N, contador `Project.lastAssumptionNumber`), description (texto con formato), ownerId? (miembro, no observador), validateBy? (YYYY-MM-DD), status (`PENDING | VALID | FALSE`, «Por validar», «Válido», «Falso»), riskId? e incidentId? (SET NULL), version, createdAt, updatedAt }`.
- Sección `planning`: todos los miembros leen; el PM edita.
- `POST /api/projects/:id/assumptions/:assumptionId/convert { kind: 'risk' | 'incident' }` (PM): solo si el estado es `FALSE` («Solo se convierte un supuesto falso»); una vez («Este supuesto ya se convirtió»). Riesgo: descripción = la del supuesto, tipo `THREAT`, probabilidad 3, impacto 3, respuesta `MITIGATE`, responsable = el del supuesto. Incidente: título = texto plano truncado a 200, descripción = la del supuesto, responsable = el del supuesto, reportado por el PM. Transacción con reclamo como en las actas.
- El texto «Supuestos» del acta no se toca (es parte del acta aprobada). La página de supuestos lo muestra arriba como «Supuestos del acta» si tiene contenido.
- Interfaz: en la pestaña Acta, debajo del acta, «Registro de supuestos» con la tabla, «Vencido» si `validateBy < hoy` y sigue por validar, y los botones de conversión para un supuesto falso.

## F16. Medición

### TCPI

- `computeEvm` agrega `tcpi = (BAC − EV) / (BAC − AC)` redondeado a 2 decimales; `null` si `BAC − AC ≤ 0`. Aparece en Desempeño junto a CPI y SPI (solo PM) con la lectura «Necesitas rendir X por cada unidad gastada».
- El informe de estado no cambia.

### Tendencia de hitos

- Pronóstico de un hito pendiente (`forecastDate`): la fecha de fin más tardía de sus hojas sin terminar (tareas con `milestoneId`, solo hojas); una hoja vencida cuenta como hoy. Sin hojas pendientes, la fecha prevista del hito. Un hito alcanzado no tiene pronóstico.
- `MilestoneForecast { milestoneId (cascada), date, forecastDate }`, único por hito y día. La tarea diaria lo guarda para los hitos pendientes de proyectos activos (actualiza si ya existe ese día).
- `GET /api/projects/:id/milestone-trend` (sección `planning`): por hito pendiente o alcanzado `{ id, name, dueDate, status, forecastDate (hoy, en vivo) | null, slipDays (forecast − due) | null, history: { date, forecastDate }[] }`.
- Interfaz: en la pestaña Resumen, «Tendencia de hitos»: tabla con prevista, pronosticada y desvío («+5 días» en rojo, «0 días», «−2 días»), y un gráfico de líneas sencillo (SVG propio, sin librería) del pronóstico de cada hito a lo largo del tiempo con la línea de la fecha prevista.

### Umbrales de salud por proyecto

- `Project.healthOverdueTasks` (por defecto 3), `healthBudgetPercent` (90), `healthIndexMin` (entero en centésimas, 90 = 0,90), `highRiskScore` (15). Validación: tareas 1–50, porcentaje 50–100, índice 50–100, puntaje 1–25.
- `computeHealth(input, today, thresholds?)`, `isHighRisk(risk, score?)`, y todos los usos de `HIGH_RISK_SCORE` (indicadores, panel, informe de estado, paso de riesgo a incidente) leen el umbral del proyecto. Sin valor, los de hoy.
- El PM los edita en el formulario del proyecto («Umbrales de salud»). Los demás no los reciben (son configuración del PM).

### Exportación a CSV

- Botón «Exportar CSV» en las listas de tareas, riesgos, gastos, incidentes y lecciones. El archivo se arma en el navegador con las filas que la página ya cargó (respeta lo que la persona ve); separador `;`, BOM UTF-8 para Excel, nombre `<proyecto>-<lista>-<fecha>.csv`.
- Columnas de dinero (costo planeado, monto, costo de contingencia) solo si la fila las trae (es decir, solo el PM).
- Utilidad pura `toCsv(columns, rows)` en el cliente con su prueba (comillas, punto y coma, saltos de línea).

## Validación

En `shared/src/schemas.ts`: campos nuevos del riesgo, `assumption` (crear, editar con versión, convertir), umbrales del proyecto.

## Pruebas que deben existir

- Riesgos: historial al crear y al cambiar P/I/residual (no al cambiar el estado); residual a medias da 400; el colaborador no recibe `contingencyCostCents`; `reviewOverdue`.
- Supuestos: numeración; convertir solo si es falso y una vez; conversión simultánea crea uno; el observador lee.
- TCPI: valor y `null`.
- Pronóstico: hoja vencida cuenta como hoy; sin hojas pendientes; la tarea diaria guarda y no duplica; la ruta devuelve historial.
- Umbrales: con `healthOverdueTasks = 1` una tarea vencida pone el proyecto en riesgo; `highRiskScore` cambia los riesgos altos del panel y la prioridad al pasar a incidente; el colaborador no recibe los umbrales.
- CSV: `toCsv` y que el botón descarga con las columnas visibles.
- `closedGuard`, matriz de acceso, bitácora y RLS cubren lo nuevo.

## Decisiones mías (revisables)

- El texto de supuestos del acta queda tal cual; el registro es aparte.
- CSV en el navegador, separador `;`.
- Los supuestos se ven como el acta (todos leen).
- Riesgo creado desde un supuesto con P 3 × I 3 y respuesta Mitigar.
- Una hoja vencida pronostica hoy; colores de la matriz por umbral del proyecto.
- Los umbrales no se envían a quien no es PM.
