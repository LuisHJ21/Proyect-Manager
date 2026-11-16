# Etapa 8: pausa por prioridad, versiones del acta y biblioteca de lecciones

Fecha: 2026-11-16. Rama: `etapa-8`. Guía: `docs/guia-implementacion-pmbok.md`, sección 6, fase 6.

## Intención

El PM lleva varios proyectos a la vez con el mismo equipo. Cuando gerencia ordena dar prioridad a otro proyecto (nuevo o de la cartera), el proyecto en curso se detiene si comparte a las personas, o sigue si no. Al retomarlo, hoy el PM corre las fechas tarea por tarea y el desempeño muestra la pausa como atraso del equipo. Eso le genera desorden. Esta etapa resuelve ese problema y cierra dos pendientes pequeños de la guía: versiones y PDF del acta (F18) y la biblioteca global de lecciones configurable (C13).

## Alcance

Dentro:
1. Pausa y reanudación de un proyecto con impacto en personas compartidas y corrimiento del cronograma.
2. Carga semanal del panel desglosada por proyecto, sin contar proyectos en pausa.
3. Versiones congeladas del acta en cada aprobación y vista imprimible (F18).
4. Opción por proyecto «Compartir lecciones en la biblioteca» (C13).

Fuera (decisión del responsable, 2026-11-16):
- F14 Adquisiciones: no se necesita. Se marca como descartada en la guía.
- F17 Plantillas: los proyectos empiezan de cero.
- F17 Fases con puerta de aprobación: chocan con prioridades que cambian a menudo.
- F17 Backlog, iteraciones y gráfico de trabajo pendiente: el equipo no trabaja por iteraciones.

Antiobjetivos: que la pausa toque tareas terminadas o el inicio de tareas ya empezadas (`IN_PROGRESS`); que un corrimiento deje tareas fuera del proyecto sin avisar; que la opción de lecciones oculte a un miembro las lecciones de su propio proyecto; que la vista imprimible dependa de una librería de PDF en el servidor.

## Enfoques considerados

| Decisión | Elegido | Descartado y por qué |
|---|---|---|
| Unidad del corrimiento | Días corridos | Días hábiles: exige un calendario laboral que hoy no existe y cambiaría ruta crítica, desfases y pronósticos |
| Quién ve lecciones ajenas | Opción por proyecto, activada por defecto | Interruptor global: todo o nada y exige una configuración global que no existe |
| PDF del acta | Vista imprimible y «Guardar como PDF» del navegador, como cierre e informes | PDF en el servidor: librería pesada en una función sin servidor por poco control extra |

El responsable aprobó las tres recomendaciones.

## 1. Pausa y reanudación

### Pausar
- Solo el PM, en un proyecto en `PLANNING` o `EXECUTING` (sección `project`, escritura). Botón «Pausar proyecto» en el encabezado o el formulario del proyecto.
- Diálogo: motivo (texto obligatorio, ejemplo «Prioridad de gerencia») y, opcional, el proyecto que pasa a tener prioridad (lista de proyectos activos que el PM ve, sin el propio).
- Al elegir el proyecto prioritario, el diálogo muestra el impacto: los miembros que están en ambos proyectos y, por cada uno, las horas asignadas en las próximas 4 semanas en cada proyecto (misma regla de horas que la carga semanal del panel). Sin miembros compartidos muestra «No comparten personas: este proyecto puede seguir avanzando». Es solo información; el PM decide si pausa.
- Al confirmar: el proyecto pasa a `PAUSED` y se guarda un registro de pausa con la fecha (hoy, `YYYY-MM-DD`), el motivo, el proyecto prioritario, el estado anterior y quién pausó. Queda en la bitácora de actividad.

### Mientras está en pausa
- El proyecto sigue editable (no es un proyecto cerrado; `closedGuard` no cambia).
- Aviso en la barra de estado del proyecto: «En pausa desde el {fecha}: {motivo}», con el proyecto prioritario si lo hay.
- La tarea diaria no envía avisos de tareas por vencer o vencidas de proyectos en pausa, ni guarda fotos de valor ganado ni pronósticos de hitos de esos proyectos: la pausa no debe aparecer como atraso en las series.
- Sus tareas no cuentan en la carga semanal del panel (sección 2).

### Reanudar
- Solo el PM, en un proyecto `PAUSED`. Botón «Reanudar proyecto».
- Días propuestos = días corridos entre la fecha de pausa y hoy. El PM puede cambiarlos (entero de 0 a 365).
- Vista previa antes de guardar, recalculada al cambiar los días:
  - Tareas hoja (`leafWhere`) en `TODO` o `BLOCKED` con fechas: inicio y fin se mueven N días, aunque su inicio ya haya pasado (no empezaron; así las dependencias se conservan).
  - Tareas hoja en `IN_PROGRESS`: solo se mueve el fin.
  - Tareas `DONE`: no se tocan. Tareas sin fechas: no se tocan.
  - Hitos `PENDING`: su fecha se mueve N días. Hitos `REACHED`: no.
  - Fecha de fin del proyecto: se mueve N días si existe. La de inicio no.
  - Lista de lo que cambia (antes → después) y totales.
- Casilla «Crear una nueva línea base» marcada por defecto, visible solo si el proyecto ya tiene línea base. El motivo de la línea base es «Reanudación tras pausa: {motivo de la pausa}».
- Al confirmar, en una sola transacción: se aplican las fechas (incrementando `version` de cada tarea), el proyecto vuelve a su estado anterior a la pausa, el registro de pausa guarda fecha de reanudación, días aplicados y quién reanudó, y si se marcó se crea la línea base con `createBaseline`. Queda en la bitácora.
- Con N = 0 solo se reanuda; no se mueven fechas.
- Las tareas resumen (padres de la EDT) recalculan sus fechas como hoy lo hacen al cambiar sus hojas.
- Dependencias y desfases se conservan solos: todo lo pendiente se mueve lo mismo.

### Reglas del estado
- `PATCH /api/projects/:id` ya no acepta pasar a `PAUSED` ni salir de `PAUSED`: responde error de campo `status` «Usa Pausar o Reanudar proyecto». Crear un proyecto tampoco acepta `PAUSED`. El formulario del proyecto deja de ofrecer «En pausa» como opción directa.
- Un proyecto que ya estaba en `PAUSED` antes de esta etapa no tiene registro de pausa: «Reanudar» propone 0 días, vuelve a `EXECUTING` y crea el registro en ese momento (fecha de pausa desconocida, vacía). La migración no inventa registros.
- Cerrar o cancelar un proyecto en pausa sigue el flujo de cierre actual; el registro de pausa abierto queda sin reanudación.
- Historial de pausas del proyecto (fecha, motivo, prioritario, días aplicados) visible para el PM en el Resumen.

### Visibilidad
- Pausar, reanudar, la vista previa y el impacto: solo PM.
- El aviso «En pausa desde…» y el motivo: todos los miembros. El nombre del proyecto prioritario solo se muestra a quien es miembro de ese proyecto (para el resto, «otro proyecto»).

## 2. Carga del equipo por proyecto

- En el panel general, cada semana de cada persona muestra además el desglose por proyecto (nombre y horas). La suma y la marca «Sobrecargada» no cambian de regla.
- Las tareas de proyectos en `PAUSED` no cuentan en la carga ni en el desglose, y la capacidad semanal de las membresías en esos proyectos tampoco suma a la capacidad de la persona. El diálogo de impacto de la pausa usa la misma regla.
- El panel lo ve quien hoy lo ve; el desglose solo lista proyectos que ese usuario puede ver.

## 3. Versiones del acta (F18)

- Cada aprobación del acta guarda una `CharterVersion` con número correlativo por proyecto (1, 2, …), quién aprobó, cuándo y el contenido congelado en JSON: todos los campos del acta y el patrocinador, más los objetivos y los hitos del proyecto en ese momento (nombre, fecha, estado).
- La aprobación y la creación de la versión van en la misma transacción.
- Un acta ya aprobada antes de esta etapa no tiene versión; la primera aparece en la siguiente aprobación (sin relleno en la migración).
- En la pestaña Acta: «Versiones aprobadas» con número, fecha y aprobador; al abrir una se ve su contenido congelado de solo lectura.
- Botón «Imprimir / Guardar PDF» en el acta actual y en cada versión, con `window.print()` y `data-print-hide` como en Cierre e Informes de estado. La vista impresa lleva el nombre del proyecto, «Versión N · aprobada el {fecha} por {nombre}» o «Borrador sin aprobar» y los campos con su formato.
- Lee las versiones quien hoy lee el acta. Las versiones no se editan ni se borran.

## 4. Biblioteca de lecciones configurable (C13)

- Nuevo campo del proyecto `shareLessons`, por defecto activado. El PM lo cambia en el formulario del proyecto: «Compartir lecciones en la biblioteca».
- `GET /api/lessons`: un usuario ve las lecciones de los proyectos donde es miembro y, de los demás, solo las de proyectos con `shareLessons` activado. La regla del observador (solo sus proyectos) se mantiene. El PM ve todas las lecciones, porque puede abrir cualquier proyecto; para colaboradores la pertenencia es una fila de `ProjectMember`.
- La pestaña Lecciones del proyecto no cambia: sus miembros siempre las ven.
- Las lecciones de proyectos cerrados siguen la misma regla.

## Restricciones

- Reglas del proyecto en `CLAUDE.md`: pruebas primero, permisos en el servidor, `AppError` en español, validación solo en `shared/src/schemas.ts`, migración nueva, sin estado en memoria.
- Toda ruta nueva de escritura bajo `/api/projects/:id/…` queda en `closedGuard`, en la matriz de acceso y en la tabla de actividad.
- Pausar o reanudar un proyecto cerrado o cancelado responde el error de proyecto cerrado.
- Los informes congelados se guardan como JSON, como `ProjectClosure.report`.
- Migración con `ENABLE ROW LEVEL SECURITY` en cada tabla nueva.

## Lo que decide quien construye

- Nombres de rutas, modelos y componentes; si el impacto y la vista previa son rutas GET aparte o parte de la misma.
- Dónde se colocan los botones de pausar y reanudar.
- El diseño exacto de la vista imprimible y de la lista de versiones.
- Cómo se muestra el desglose por proyecto dentro de cada semana.
- Al terminar: actualizar la guía (F14 descartada; F17 sustituida por esta etapa; F18 y C13 hechas).
