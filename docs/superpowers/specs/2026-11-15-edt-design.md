# F5. EDT (estructura de desglose del trabajo)

Primer bloque de la etapa 5 de `docs/guia-implementacion-pmbok.md`. Después vendrán F6, F7 y F8, cada una con su especificación, sobre lo que deje esta.

## Intención

Hoy las tareas de un proyecto forman una lista plana. El PM no puede descomponer el trabajo en niveles («1 Diseño → 1.1 Maquetas → 1.1.2 Revisión») ni ver el costo, las fechas y el avance de cada rama. PMBOK pone la EDT en la base de la planificación y de la entrega. Además, F6 (horas), F7 (ruta crítica) y F12 (trazabilidad) necesitan esta jerarquía.

F5 añade la jerarquía de tareas con su código EDT, hace que las tareas padre resuman a sus hijas y permite ligar el trabajo a un entregable.

## Objetivos

- El PM arma un árbol de tareas de hasta 4 niveles y ve el código EDT de cada una (1, 1.1, 1.1.2).
- Una tarea padre muestra las fechas, el costo y el avance que resultan de sus hijas, sin que el PM los escriba.
- Ningún cálculo cuenta dos veces: valor ganado, línea base, avance, tareas vencidas, carga del equipo, calendario, tablero y cierre usan solo las tareas sin hijas.
- Una tarea se puede ligar a un entregable, y el entregable muestra el trabajo ligado.

## Fuera de alcance

- Ruta crítica, tipos de dependencia y reprogramación. Son de F7.
- Horas y capacidad. Son de F6.
- Arrastrar y soltar para mover ramas. Basta con elegir la tarea padre y con subir o bajar.
- Plantillas de EDT copiadas de otro proyecto. Son de F17.
- Diccionario de la EDT como documento aparte.

## Anti-objetivos

- Que un número de la padre mezcle trabajo propio con el resumen de sus hijas.
- Que convertir una tarea en padre borre en silencio sus responsables, costo, pasos, gastos o dependencias.
- Que un colaborador vea costos de una rama. El costo resumido es un costo y sigue oculto como los demás.

## Enfoques considerados

1. **Padre solo como resumen** (elegido por el responsable). Una tarea con hijas no tiene trabajo propio. Si al ponerle su primera hija tiene responsables, costo, pasos, gastos o dependencias, la app lo rechaza y dice qué mover primero.
2. **Padre con trabajo propio más el resumen.** Es flexible, pero el costo y el avance quedan mitad propios y mitad resumidos, y es fácil que no cuadren. Descartado.
3. **Estructura EDT aparte (paquetes de trabajo) de la que cuelgan tareas.** Es lo más fiel a PMBOK, pero duplica pantallas y se aparta de `Task.parentId`, que pide la guía. Descartado.

## Diseño

### Datos

Una migración nueva añade a `Task`:

- `parentId String?`, que es la tarea padre del mismo proyecto. Borrar una padre está prohibido mientras tenga hijas (ver Reglas), así que no hace falta cascada.
- `position Int @default(0)`, el orden entre hermanas.
- `deliverableId String?`, el entregable al que contribuye, con `onDelete: SetNull`.

En las tareas existentes, la migración asigna `position` según el orden actual de la lista (`createdAt`), para que los códigos salgan estables desde el primer día.

### Código EDT y orden

- El código no se guarda: se calcula al leer con el orden de `position` entre hermanas, empezando en 1 (`1`, `1.2`, `1.2.3`).
- Una tarea nueva, o que cambia de padre, queda al final de sus nuevas hermanas.
- El PM la sube o la baja entre sus hermanas con `POST /api/tasks/:id/move { direction: 'up' | 'down' }`, que intercambia `position` con la vecina. En el extremo de la lista no hace nada y responde 200 con el orden actual.
- El máximo es 4 niveles. Poner una tarea a más profundidad responde 400 en `parentId` con «La EDT admite hasta 4 niveles».

### Reglas del servidor

- **Elegir la padre** con `parentId` en crear y en editar tarea, que ya cubre la versión de C11:
  - La padre debe ser del mismo proyecto. Si no, 400 en `parentId` con «Elige una tarea de este proyecto».
  - No puede ser la propia tarea ni una de sus descendientes. Si no, 400 «Una tarea no puede quedar dentro de sí misma».
  - `parentId: null` la deja en la raíz.
- **Primera hija de una tarea con trabajo propio:** si la futura padre tiene responsables, costo planeado mayor que 0, pasos, gastos ligados o dependencias (como predecesora o como sucesora), responde 409 `task_has_work` con «Esta tarea tiene trabajo propio. Antes de añadirle subtareas, quita o mueve: <lista>». La lista nombra solo lo que tiene, por ejemplo «responsables, costo planeado, 2 gastos». Nada se borra.
- **Una tarea con hijas** (en adelante, padre) no admite trabajo propio:
  - Asignarla (`assigneeIds` o `PUT /assignees`) responde 400 en `assigneeIds`.
  - Ponerle `plannedCostCents` mayor que 0, `startDate` o `dueDate` responde 400 en ese campo con «Se calcula con sus subtareas».
  - `/progress`, los pasos, las dependencias y ligarle un gasto responden 409 `task_is_summary` con «Una tarea con subtareas se actualiza a través de ellas».
  - Comentarios, anexos, hito, entregable, título, descripción y prioridad sí se permiten.
- **Borrar una padre** responde 409 `task_has_children` con «Mueve o borra primero sus subtareas».
- **Proyecto cerrado:** la ruta nueva `move` queda cubierta por `closedGuard` y su prueba de cobertura.
- **Permisos:** la ruta nueva de escritura es solo para PM y se registra en la matriz de acceso y en la bitácora.

### Resumen de la padre (se calcula al leer, no se guarda)

El DTO de tarea añade estos campos:

- `wbsCode: string`;
- `parentId`, `position` y `deliverableId`;
- `childCount: number`;
- `isSummary: boolean`, que es `childCount > 0`.

En una padre, estos campos salen calculados con sus hojas descendientes, es decir, las tareas sin hijas que cuelgan de ella a cualquier nivel:

- **Fechas:** `startDate` es la menor y `dueDate` la mayor entre las fechas que existen; `null` si ninguna tiene.
- **Costo:** `plannedCostCents` es la suma, y solo va al PM, como hoy.
- **Avance:** `progress` usa `weightedProgress` de C7 con las hojas descendientes.
- **Estado:**
  - «Hecha» si todas las hojas están hechas;
  - «Bloqueada» si alguna está bloqueada y ninguna está en curso;
  - «En curso» si alguna está en curso o hecha;
  - «Por hacer» si no.

Se calcula con todas las tareas del proyecto en una sola consulta, como ya hace la lista de tareas.

### Solo hojas en los cálculos

Estos cálculos pasan a filtrar tareas sin hijas (`children: { none: {} }` o el equivalente en memoria):

- valor ganado y línea base;
- avance ponderado (indicadores, salud, panel y lista de proyectos);
- tareas vencidas y bloqueadas;
- carga del equipo;
- calendario;
- tareas por vencer de la tarea diaria;
- pendientes e informe de cierre;
- Mis tareas, aunque una padre no tiene responsables.

La línea base guarda solo hojas con costo. Al fijar una base nueva, una padre nunca entra.

### Interfaz

- **Lista (vista por defecto de Tareas):** se convierte en árbol. Cada fila muestra el código EDT, la sangría por nivel y un botón para plegar o desplegar sus hijas; todo empieza desplegado.
  - Una padre muestra su resumen (fechas, avance y, para el PM, costo) en gris secundario, para que se note que es calculado.
  - Para el PM: «Subir» y «Bajar» en cada fila.
  - Con filtros activos se muestran las tareas que coinciden y, atenuadas, sus antecesoras para dar contexto.

```
Código  Tarea                  Responsable  Fechas            Avance
1       ▾ Diseño                            02 mar – 30 abr   45 %
1.1       ▾ Maquetas                        02 mar – 20 mar   80 %
1.1.1        Pantallas          Beatriz     02 mar – 10 mar  100 %
1.1.2        Revisión           Carlos      11 mar – 20 mar   60 %
1.2          Guía de estilo     Beatriz     21 mar – 30 abr   10 %
2       ▸ Construcción                      01 may – 30 jun    0 %
```

- **Tablero:** solo hojas. Cada tarjeta muestra el código y el título de su padre directa, en texto pequeño.
- **Cronograma:** filas en orden EDT. Una padre se dibuja como barra de resumen, más fina y del color secundario, de su inicio a su fin calculados.
- **Formulario de tarea:**
  - Campo nuevo «Tarea padre», un selector con código y título que excluye la propia tarea y sus descendientes.
  - Campo nuevo «Entregable», un selector opcional con los entregables del proyecto, solo para el PM.
  - En una padre, los campos de fechas, costo y responsables se ven en solo lectura con «Se calcula con sus subtareas».
- **Detalle de tarea:** el código EDT junto al título, la ruta de antecesoras como migas («1 Diseño › 1.1 Maquetas») y, en una padre, la lista de sus hijas con enlace.
- **Detalle de entregable:** sección «Trabajo» con las tareas ligadas (código, título y avance). Un entregable sin tareas ligadas dice «Aún no hay tareas ligadas a este entregable».
- **El 409 `task_has_work`** se muestra en el formulario con su mensaje, sin cerrar la ventana.
- **Gastos y dependencias:** el selector de tarea del formulario de gasto y el de predecesora en el detalle de tarea solo ofrecen hojas.
- **Quién ve el árbol:** todos los perfiles que hoy ven la lista de tareas ven el árbol completo, porque la lista ya trae todas las tareas del proyecto. El costo de cualquier fila, también el resumido, solo llega al PM.

### Pruebas

- **Servidor:**
  - Código EDT con hermanas y tres niveles; `move` arriba y abajo, también en los extremos.
  - Profundidad 5: 400.
  - Ciclo: 400.
  - Padre de otro proyecto: 400.
  - Primera hija de una tarea con trabajo propio: 409 con la lista exacta.
  - Sin trabajo: se acepta.
  - Una padre rechaza responsables, costo, fechas, progress, pasos, dependencias y gasto ligado; acepta comentario.
  - Borrar una padre: 409.
  - Resumen de fechas, costo, avance y estado; el colaborador no recibe el costo de la padre.
  - Valor ganado, línea base, avance, vencidas, carga, calendario, cierre y tarea diaria ignoran las padres. Hay una prueba por cálculo con un proyecto de una padre y dos hijas donde contar la padre cambiaría el resultado.
  - `closedGuard`, matriz de acceso y bitácora cubren `move`.
  - Ligar a un entregable: el detalle del entregable lista la tarea. Un entregable de otro proyecto da 400.
  - La migración numera las tareas existentes.
- **Cliente:**
  - El árbol muestra códigos y sangría, y pliega.
  - Subir y bajar envían `move`.
  - El formulario excluye descendientes del selector de padre.
  - Una padre muestra los campos calculados en solo lectura.
  - El 409 `task_has_work` se ve en el formulario.
  - El tablero no muestra padres.
  - El detalle del entregable lista el trabajo.
- **e2e:** el flujo existente sigue pasando. Se añade un paso: el PM crea una subtarea bajo «Construcción» y la lista muestra «2.1». Para eso «Construcción» no puede tener trabajo propio en ese momento; si lo tiene, la subtarea va bajo una tarea nueva sin trabajo.

## Decisiones mías para revisar

- **Máximo de 4 niveles.** Alcanza para proyecto › fase › entregable › paquete y evita árboles inmanejables.
- **El resumen se calcula al leer y no se guarda.** Así nunca queda desactualizado cuando cambia una hija. El costo es una consulta de tareas por proyecto, que ya se hace.
- **Una padre no admite dependencias.** F7 calculará la ruta crítica sobre hojas; permitirlas en padres complica esa cuenta.
- **El estado de la padre se deriva de sus hojas** con la regla de arriba, y no se puede cambiar a mano.
- **Ligar a un entregable es solo del PM**, como el resto del formulario de tarea.
- **Mover entre hermanas con «Subir» y «Bajar»**, sin arrastrar. Es lo mínimo usable y accesible desde el teclado.

## Lo que queda al constructor

- Dónde vive el cálculo del árbol: una función pura en `server/src/domain/wbs.ts` es lo esperado.
- Cómo el DTO de tarea recibe las demás tareas del proyecto para calcular el resumen.
- El aspecto exacto de la barra de resumen en el cronograma.
