# Etapa 4: números fiables (C6, C7, C8, C9 y C10)

Etapa 4 de `docs/guia-implementacion-pmbok.md`. Este documento cubre las cinco correcciones de la etapa. Habrá un plan y una rama, `etapa-4`, con un commit por cada corrección.

## Intención

El panel, la pestaña Desempeño, la salud del proyecto y los informes muestran números que hoy pueden engañar al PM:

- El avance trata igual una tarea de un día y una de seis meses.
- El costo estimado al terminar sale igual al presupuesto justo cuando hay gasto y ningún avance.
- Un cambio aprobado no ajusta ni el plazo ni el presupuesto.
- Un hito puede tener una fecha fuera del proyecto.
- Los textos no tienen límite.

La etapa no añade funciones nuevas: deja fiable lo que ya se muestra.

## Objetivos

- El avance del proyecto refleja el peso de cada tarea.
- El valor ganado no da un pronóstico optimista cuando el CPI es 0 y separa el gasto que la línea base no explica.
- Abrir Desempeño no escribe en la base de datos.
- Un cambio aprobado se aplica al plazo, al presupuesto y, si el PM quiere, a una nueva línea base, y queda constancia.
- La fecha de un hito siempre cae dentro del proyecto.
- Ningún texto supera un largo razonable.

## Fuera de alcance

- Ponderar por esfuerzo estimado. Llega con F6.
- TCPI, umbrales de salud configurables y tendencia de hitos. Son de F16.
- Marcar un hito como alcanzado de forma automática. Solo se sugiere.
- Aplicar a medias un cambio o deshacer su aplicación.

## Anti-objetivos

- Que aplicar un cambio mueva el plazo o el presupuesto sin que el PM vea y confirme los números.
- Que un colaborador u observador reciba costos, presupuesto o impactos de cambios.
- Que los proyectos existentes queden con datos inválidos tras la etapa. Los textos largos ya guardados se conservan; los límites solo se aplican al guardar.

## Enfoques considerados para C8

1. **Botón «Aplicar» con valores propuestos y editables** (elegido por el responsable). La ventana trae la nueva fecha de fin y el nuevo presupuesto calculados con los impactos; el PM los ajusta, decide si fija una nueva línea base y confirma.
2. **Aplicar al aprobar.** Es más rápido, pero no deja ajustar los números, y una aprobación por error mueve plazo y presupuesto. Descartado.
3. **Solo marcar «Aplicado» a mano.** El ajuste se sigue haciendo de memoria, que es justo lo que C8 quiere evitar. Descartado.

El resto de la etapa no tenía alternativas que cambiaran el resultado; las decisiones van en el diseño.

## Diseño

### C10. Límites de longitud

Se añaden límites con `.max()` en `shared/src/schemas.ts`, en los esquemas de creación y de edición:

| Campo | Máximo | Mensaje |
| --- | --- | --- |
| Títulos y nombres de una línea (proyecto, hito, tarea, paso, riesgo, incidente, decisión, solicitud de cambio, interesado, objetivo del acta) | 200 | «Máximo 200 caracteres» |
| Descripciones y textos largos (descripción de proyecto, tarea, entregable, incidente, decisión, cambio, plan de respuesta, notas de decisión, campos de texto del acta) | 20 000 | «Máximo 20 000 caracteres» |
| Comentarios | 5 000 | «Máximo 5 000 caracteres» |

- Los límites que ya existen (entregables, criterios y lecciones) no cambian.
- En los textos con formato el límite se mide sobre lo que manda el navegador, antes de `sanitizeRichText`.
- El cliente no repite los límites: el error de campo de la API ya se muestra en cada formulario.
- No hace falta migración, porque las columnas son `text`.

### C9. Hitos

- Crear o editar un hito con una fecha fuera de las fechas del proyecto responde 400 en `dueDate` con `outsideProjectMessage(project)`. Es la misma regla que usan las tareas con `isWithinProject`. Se hace con la opción `validate` del registro de hitos en `registers.ts`.
- Si el proyecto no tiene fechas, el hito no se limita.
- Cambiar las fechas del proyecto no rechaza hitos que queden fuera, igual que hoy pasa con las tareas.
- **Sugerencia de «Alcanzado»:** un hito pendiente lleva `readyToReach: true` cuando cumple estas tres condiciones:
  - tiene al menos una tarea o un entregable;
  - todas sus tareas están en «Hecha»;
  - todos sus entregables están en «Aceptado».
- La lista de hitos muestra entonces «Listo para marcar como alcanzado» junto al hito. El PM lo marca como siempre; nada cambia solo.
- La regla vive en una función pura de `server/src/domain/`.

### C7. Avance ponderado

`averageProgress` pasa a ser `weightedProgress(tasks)` en `server/src/domain/indicators.ts`. Cada tarea aporta `progress`, `plannedCostCents`, `startDate` y `dueDate`. El peso se elige para todo el proyecto, no tarea por tarea, porque costo y duración no se pueden mezclar:

1. **Por costo planeado**, si todas las tareas tienen costo mayor que cero.
2. **Por duración** en días si no, contando el inicio y el fin. Una tarea sin una de las dos fechas pesa 1 día.
3. Sin tareas, el avance es 0.

El resultado se redondea a entero.

Se usa en los tres lugares que hoy llaman a `averageProgress`:

- los indicadores del resumen (`computeIndicators`);
- `summarizeProject`, que alimenta el panel, la salud y las estadísticas de la lista de proyectos.

Las consultas de esos lugares añaden los campos que faltan: costo y fechas de cada tarea.

El número que se envía es el mismo para todos los perfiles. Los costos nunca salen hacia el colaborador; solo sale el avance ya ponderado.

### C6. Valor ganado

- **GET sin escrituras:** `GET /api/projects/:id/performance` deja de llamar a `saveEvmSnapshot`. La foto diaria ya la guarda la tarea diaria (`server/src/jobs/daily.ts`), que no cambia. El punto de hoy en la serie se arma con las métricas calculadas al momento, no con la foto: así la curva muestra hoy aunque la tarea diaria no haya corrido aún.
- **EAC cuando el CPI no sirve:** en `computeEvm`, el costo estimado al terminar (EAC) se calcula según el caso, y se envía `eacMethod` para que la interfaz sepa cuál se usó.

| Caso | EAC | `eacMethod` |
| --- | --- | --- |
| CPI mayor que 0 | BAC / CPI | `'CPI'` |
| CPI igual a 0 (hay gasto y ningún valor ganado) | AC + (BAC − EV) | `'ATYPICAL'` |
| Sin gasto (CPI nulo) | BAC | `'BUDGET'` |

  Con `'ATYPICAL'`, Desempeño muestra junto al EAC: «Estimación: aún no hay avance que permita proyectar el costo». ETC y VAC siguen derivándose del EAC.
- **Gasto fuera de la línea base:** se añade `outsideBaselineCostCents`, que suma los gastos hasta hoy sin tarea o ligados a una tarea que no está en la línea base vigente.
  - El costo real (AC) los sigue incluyendo, porque es dinero gastado.
  - Desempeño muestra la cifra en una línea propia bajo el costo real: «De este costo real, X no está ligado a tareas de la línea base». La línea solo aparece si la cifra es mayor que 0.
  - La pestaña ya es solo para PM, así que la cifra no llega a otros perfiles.

### C8. Aplicar cambios aprobados

- **Estado nuevo:** `'APPLIED'` en `CHANGE_STATUS`, con su etiqueta «Aplicado» en `LABELS`.
- **Campos nuevos:** una migración añade `appliedAt DateTime?` y `appliedById String?` a `ChangeRequest`. El usuario es una relación con `onDelete: SetNull`.
- **Ruta nueva:** `POST /api/projects/:id/change-requests/:crId/apply`. Es solo para PM y queda cubierta por `closedGuard`. El cuerpo se valida con `applyChangeSchema`:
  - `endDate?: 'YYYY-MM-DD' | null`
  - `plannedBudgetCents?: number`, con los mismos límites que el presupuesto del proyecto
  - `baseline: boolean`
  - `reason?: string`
- **Reglas de la ruta:**
  - Si la solicitud no está aprobada, responde 409 `change_not_approved` con «Solo se aplica un cambio aprobado». Esto incluye una ya aplicada.
  - Los campos que vienen actualizan el proyecto con las mismas validaciones que la edición del proyecto (por ejemplo, la fecha de fin no puede quedar antes del inicio).
  - Con `baseline: true` se fija una nueva línea base que cita la solicitud. El motivo por defecto es «CR-<número> <título>». Se reutiliza la lógica de `POST /baselines`, extraída a una función que reciben ambas rutas. Si la línea base no se puede fijar, por ejemplo porque no hay tareas con costo, responde el mismo error que esa ruta y no se aplica nada.
  - Todo ocurre en una sola transacción: proyecto, línea base, y la solicitud pasa a `APPLIED` con `appliedAt` y `appliedById`.
  - La bitácora de actividad lo registra por su middleware, como cualquier escritura.
- **Lo que ve el colaborador:** sus propuestas pueden mostrar el estado «Aplicado». La lista del colaborador sigue sin impactos ni las claves ocultas que ya prueba `changeProposals.test.ts`, y `appliedAt` y `appliedById` se suman a esas claves ocultas.
- **Interfaz** (`client/src/pages/project/ChangeRequests.tsx`): una solicitud aprobada muestra el botón «Aplicar». La ventana contiene:
  - Nueva fecha de fin: la actual más `scheduleImpactDays`. Si el proyecto no tiene fecha de fin, o el impacto está vacío, se deja la actual.
  - Nuevo presupuesto: el actual más `costImpactCents`, o el actual si está vacío.
  - La casilla «Fijar nueva línea base citando este cambio», marcada si el proyecto ya tiene una línea base.
  - El motivo, con el valor por defecto.

  Solo se envían los campos que cambiaron respecto al proyecto. Al confirmar se recargan la solicitud, el proyecto y Desempeño.
- **Panel:** la lista «Requiere atención» añade el tipo `change`, uno por cada solicitud aprobada sin aplicar de un proyecto activo, con «CR-<número> <título>», el proyecto y un enlace a sus cambios. Va después de los entregables y antes de los riesgos. El panel ya es solo para PM.

### Pruebas

- **C10:** en `shared`, un caso por grupo de límite (200, 20 000 y 5 000), con un texto del largo exacto que pasa y uno de un carácter más que falla con el mensaje. En el servidor, una ruta por grupo responde 400 en el campo.
- **C9:**
  - Hito fuera del proyecto: 400 al crear y al editar.
  - Proyecto sin fechas: se acepta.
  - Función pura de `readyToReach` con sus casos: sin vínculos, tarea pendiente, entregable rechazado, todo cumplido y hito ya alcanzado.
- **C7:**
  - `weightedProgress` por costo, por duración, con una tarea sin fechas y con una tarea sin costo, que hace pasar todo el proyecto a duración.
  - Una prueba de ruta confirma que los indicadores y el panel usan el avance ponderado.
  - Las pruebas de lo que no ve el colaborador siguen pasando.
- **C6:**
  - `computeEvm` en los tres casos de EAC.
  - `outsideBaselineCostCents` con un gasto sin tarea, un gasto de una tarea fuera de la línea base y un gasto futuro, que no cuenta.
  - El GET de Desempeño no crea fotos y su serie trae el punto de hoy.
- **C8:**
  - Aplicar con fecha y presupuesto actualiza el proyecto.
  - Con `baseline: true` crea la línea base que cita la solicitud.
  - Si la línea base falla, no cambia nada.
  - Una solicitud pendiente, rechazada o ya aplicada responde 409.
  - Un colaborador recibe 403.
  - Un proyecto cerrado responde `project_closed`, y la prueba de cobertura de `closedGuard` incluye la ruta.
  - El panel lista las aprobadas sin aplicar.
  - En el cliente, la ventana propone los valores y envía solo lo que cambió.
- **e2e:** el flujo existente sigue pasando. No se agrega paso nuevo.

## Decisiones mías para revisar

- **El avance se pondera por costo solo si todas las tareas lo tienen;** si no, por duración. Mezclar costo en unas tareas y duración en otras daría pesos que no se comparan.
- **El avance ponderado se envía también al colaborador.** No revela costos, pero en un proyecto de dos tareas permitiría deducir cuál de las dos cuesta más. Lo considero aceptable; la alternativa sería ponderar siempre por duración y perder la regla de costo que pide la guía.
- **El gasto fuera de la línea base sigue contando en el costo real** y solo se muestra aparte. El dinero ya se gastó; sacarlo del CPI escondería un sobrecosto.
- **Si no hay gasto, el EAC se queda en el presupuesto (BAC).** No se usa AC + (BAC − EV) en ese caso, porque daría un pronóstico menor que el presupuesto sin haber gastado nada.
- **Aplicar un cambio sin modificar ningún campo es válido.** El PM puede aplicar un cambio que no mueve plazo ni presupuesto, y la solicitud queda «Aplicado».
- **Una solicitud aplicada no se puede deshacer.** Corregir un error es una nueva solicitud de cambio, como pide el control de cambios.

## Lo que queda al constructor

- Dónde se extrae la lógica compartida de fijar la línea base.
- Cómo llega `readyToReach` a la lista de hitos: en el DTO del registro de hitos o en una consulta aparte.
- El texto exacto del enlace del panel y su icono.
