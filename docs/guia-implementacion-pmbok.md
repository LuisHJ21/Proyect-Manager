# Guía de implementación: correcciones y funciones faltantes

**Fecha:** 2026-11-11 (actualizada el 2026-11-12 con las decisiones de la sección 3)
**Base analizada:** commit `50f2ad3` (cierre y lecciones aprendidas)
**Contexto de uso:** aplicación en la nube (Netlify con Supabase) con tres perfiles: PM, Colaborador y Observador. Hoy hay un solo PM, que también ejecuta tareas.

## 1. Cómo usar esta guía

Es una hoja de ruta, no un plan de tareas. Cada bloque (C1…, F1…) es independiente y debe pasar por el mismo ciclo que ya usa el repositorio: especificación en `docs/superpowers/specs/`, plan en `docs/superpowers/plans/`, implementación con pruebas primero. El orden recomendado está en la sección 7.

**Límite del análisis:** se revisó el código, el esquema, las especificaciones y el README. Las pruebas (unas 700) no se pudieron ejecutar en este análisis porque `node_modules` está instalado para Windows; antes de empezar, ejecuta `npm test` y `npm run test:e2e` para confirmar que la base está en verde.

## 2. Estado actual

Pila: React 19 + Tailwind + TanStack Query (`client/`), Fastify 5 + Prisma + SQLite (`server/`, a sustituir por Hono + PostgreSQL según la sección 4), Zod (`shared/`). Los permisos se validan en el servidor y las reglas de negocio están en funciones puras (`server/src/domain/`) con pruebas.

| Dominio de desempeño (PMBOK 7) | Lo que existe | Cobertura |
|---|---|---|
| Interesados | Registro con influencia, interés y estrategia; matriz RACI | Media |
| Equipo | Miembros con rol libre, carga de tareas por persona | Básica |
| Enfoque y ciclo de vida | Campo predictivo/ágil/híbrido, sin efecto en la aplicación | Mínima |
| Planificación | Acta, objetivos, hitos, tareas con dependencias fin-inicio, cronograma, presupuesto, línea base | Media |
| Trabajo del proyecto | Tareas, pasos, Kanban, comentarios, anexos, incidentes, decisiones, control de cambios | Alta |
| Entrega | Entregables con criterios y aceptación, cierre con informe | Media |
| Medición | Indicadores, salud, valor ganado (CPI, SPI, EAC, VAC), curva S, panel general | Alta |
| Incertidumbre | Registro de riesgos con respuesta, paso de riesgo a incidente | Media |
| Conocimiento | Lecciones aprendidas por proyecto y biblioteca global | Alta |

No existen: EDT, estimación de esfuerzo y registro de horas, ruta crítica, plan de comunicaciones, actas de reunión, informes de estado, requisitos y trazabilidad, calidad, adquisiciones, registro de supuestos, notificaciones, bitácora de actividad, plantillas y perfil de observador.

## 3. Decisiones tomadas (2026-11-12)

1. **Rol PM:** hoy hay un solo PM, pero el rol admite varios. No se bloquea la creación de más PM (ver C2).
2. **El PM ejecuta tareas:** el PM puede asignarse tareas, pasos, riesgos e incidentes, porque también hace trabajo de coordinación.
3. **Tres perfiles:** PM, Colaborador (equipo) y Observador (solo lectura, para dar acceso puntual a alguien). Ver F1.
4. **Despliegue en la nube:** interfaz y API en Netlify, API con Hono en lugar de Fastify, base de datos y anexos en Supabase. Deja de ser una aplicación de red local. Ver sección 4.

## 4. Migración a Netlify, Hono y Supabase

Decisiones del 2026-11-12: alojamiento en **Netlify**, API propia con **Hono** en lugar de Fastify, base de datos y anexos en **Supabase**, se conserva el inicio de sesión actual y se empieza con la base limpia.

El detalle está en dos documentos, que mandan sobre este resumen:

- Especificación: `docs/superpowers/specs/2026-11-12-migracion-netlify-supabase-design.md`
- Plan de 14 tareas: `docs/superpowers/plans/2026-11-12-migracion-netlify-supabase.md`

Resumen de los bloques:

- **M0. De Fastify a Hono.** Se convierten los 28 módulos de rutas sin cambiar direcciones ni respuestas, con las pruebas actuales como red de seguridad. Se hace primero y sobre SQLite.
- **M1. Base de datos en Postgres.** Prisma con el pooler de Supabase para la API y conexión de sesión para migraciones; migración inicial nueva; RLS activado en todas las tablas.
- **M2. API como Netlify Function.** La misma aplicación Hono envuelta con `hono/netlify`; la interfaz es un sitio estático; las migraciones corren en la compilación.
- **M3. Anexos en Supabase Storage.** Subida directa del navegador en tres pasos (solicitar, subir, confirmar), porque una función no acepta archivos de 25 MB.
- **M4. Nada en memoria.** Los intentos de inicio de sesión pasan a una tabla (absorbe C5).
- **M5. Zona horaria.** "Hoy" se calcula con `APP_TIMEZONE=America/Lima`; en la nube el servidor trabaja en UTC.
- **M6. Tarea diaria.** Función programada de Netlify: limpia sesiones, intentos y subidas incompletas, y guarda la foto de valor ganado (parte de C6).
- **M7. Seguridad en internet.** Cookie `secure`, cabeceras de seguridad y código obligatorio para la configuración inicial (absorbe C4).
- **M8. Desarrollo, pruebas y documentación.** PostgreSQL local con Docker, README nuevo y `CLAUDE.md` para trabajar con Claude Code.

**Respaldos (sustituye a C3).** Supabase gestiona copias según el plan contratado: verificar qué incluye el tuyo. Añadir después un script de exportación (`pg_dump` más copia del bucket) para tener una copia propia periódica.

## 5. Correcciones

### Prioridad alta

**C1. Permisos incoherentes con el trabajo del equipo.**
Un colaborador puede ser responsable de un riesgo (`Risk.ownerId`) pero no puede verlo: riesgos, interesados, entregables, cambios y desempeño son solo para PM (`readAccess: 'pm'` en `server/src/routes/registers.ts`, `requireProjectPm` en entregables). El equipo construye entregables cuyos criterios de aceptación no ve. Se resuelve con F1; como mínimo inmediato: que el responsable de un riesgo lo vea y actualice su estado, igual que ya ocurre con los incidentes (`incidentAccess` en `server/src/domain/incidents.ts` es el modelo a seguir).

**C2. El PM también ejecuta tareas.**
- Hoy un PM no puede ser asignado: `assertAssignable` (`server/src/routes/tasks.ts`) exige `role: 'COLLABORATOR'`, y al ascender a alguien a PM se le quitan sus asignaciones (`server/src/routes/users.ts`). Permitir asignar a cualquier miembro activo con rol PM o Colaborador y eliminar esa limpieza.
- El PM debe ser miembro del proyecto para asignarse; al crear un proyecto, añadir a su creador como miembro.
- Dar al PM la página **Mis tareas** (`RequireCollaborator` en `client/src/router.tsx` la reserva hoy al colaborador) e incluirlo en la carga de trabajo del panel (`server/src/domain/dashboard.ts` filtra por rol colaborador).
- Varios PM: se mantiene como está, todos los PM ven todos los proyectos. Cuando haya más de uno, decidir si cada PM ve solo los suyos; eso pediría `Project.ownerId` y un filtro en `getProjectAccess`. No se hace ahora.

**C3. Respaldos.** Sustituido por la sección 4 (respaldos en Supabase más exportación propia).

**C4. Seguridad de transporte y cabeceras.** Pasa a ser obligatorio con el despliegue en la nube; se ejecuta dentro de M7 con los equivalentes de Hono y `netlify.toml`.
- La cookie de sesión no lleva `secure` y Fastify no confía en el proxy (`server/src/routes/auth.ts`, `server/src/app.ts`). Añadir `TRUST_PROXY` y `COOKIE_SECURE` en `server/src/config.ts` para que el despliegue con HTTPS que sugiere el README sea seguro y `req.ip` sea el real en el limitador.
- No hay cabeceras de seguridad. Registrar `@fastify/helmet` con CSP restrictiva y `frame-ancestors 'none'`.

**C5. Sesiones y limitador de intentos.**
- Las sesiones vencidas nunca se borran (`server/src/auth/sessions.ts`): purgar al arrancar y una vez al día.
- En `LoginLimiter` los fallos no caducan (cuatro fallos hoy y uno el mes próximo bloquean) y el mapa crece sin límite: usar una ventana de 15 minutos y limpiar entradas viejas.
- El inicio de sesión responde más rápido si el correo no existe (no se verifica hash): verificar contra un hash fijo para igualar el tiempo.

### Prioridad media

**C6. Valor ganado.**
- La foto diaria de la curva S solo se guarda cuando el PM abre la pestaña Desempeño (`GET /api/projects/:id/performance` escribe en `EvmSnapshot`). Los días sin visita quedan sin dato. Mover la foto a la tarea diaria de M6 para todos los proyectos activos con línea base y dejar el GET sin escrituras.
- En `server/src/domain/evm.ts`, `eacCents = cpi ? … : bacCents` devuelve EAC = BAC cuando el CPI es 0 (hay gasto y ningún avance), que es el caso más preocupante. Usar `AC + (BAC − EV)` cuando el CPI no sea utilizable y mostrarlo como estimación.
- El costo real incluye todos los gastos aunque no estén ligados a tareas de la línea base, mientras que el valor ganado solo cuenta tareas en línea base. Mostrar el gasto fuera de línea base por separado.

**C7. Avance del proyecto sin ponderar.**
`averageProgress` (`server/src/domain/indicators.ts`) promedia todas las tareas por igual: una tarea de un día pesa como una de seis meses. Ponderar por costo planeado o, si falta, por duración; cuando exista F6, por esfuerzo estimado.

**C8. Los cambios aprobados no se aplican.**
Aprobar una solicitud (`server/src/routes/changeRequests.ts`) solo cambia su estado; el plazo, el presupuesto y la línea base se ajustan de memoria. Añadir el estado "Aplicado": tras aprobar, la interfaz ofrece actualizar fecha de fin y presupuesto con los impactos declarados y fijar nueva línea base citando el cambio. El panel debe listar los cambios aprobados sin aplicar.

**C9. Hitos.**
La fecha del hito no se valida contra las fechas del proyecto (las tareas sí, con `isWithinProject`) y su estado es manual. Añadir `validate` en el registro de hitos de `registers.ts` y sugerir "Alcanzado" cuando todas sus tareas y entregables estén terminados.

**C10. Textos sin límite de longitud.**
Solo entregables y lecciones tienen máximo. Añadir `.max()` en `shared/src/schemas.ts` a títulos (200), descripciones y campos del acta (20 000) y comentarios (5 000).

**C11. Ediciones simultáneas.**
Prevalece el último guardado. Al abrir más información al equipo aumenta el riesgo de pisar cambios. Enviar `updatedAt` en las ediciones de acta, tareas, riesgos y entregables y responder 409 si cambió.
- Hecho (`docs/superpowers/specs/2026-11-15-ediciones-simultaneas-design.md`): en vez de `updatedAt` se usa un número de versión que solo sube con lo que muestran los formularios, así el avance y los pasos de una tarea no chocan con la edición del PM. Guardar con una versión vieja responde 409 `edit_conflict`; tareas, riesgos y entregables avisan y cargan la versión actual, y el acta conserva el borrador para copiarlo.

### Prioridad baja

**C12. Repositorio.** Falta `.gitattributes`: el índice está en LF y la copia de trabajo en CRLF, y fuera de Windows decenas de archivos aparecen como modificados por completo. Añadir `* text=auto` y normalizar. Añadir `"engines": { "node": ">=24" }` en `package.json`.

**C13. Biblioteca global de lecciones.** `GET /api/lessons` muestra a cualquier usuario lecciones y nombres de proyectos de los que no es miembro. Es intencional, pero choca con "solo la información necesaria": hacerlo configurable en F1.

## 6. Funciones faltantes

Cada función indica el dominio de PMBOK 7 que cubre, el modelo de datos mínimo y dónde se engancha.

### Fase 1. Acceso del equipo y control

**F1. Perfiles de acceso por proyecto** (Equipo, Interesados)
- Modelo: añadir `OBSERVER` a `ROLE` en `shared/src/enums.ts`. Quedan tres perfiles de cuenta: PM, Colaborador y Observador. Un observador solo ve los proyectos a los que el PM lo añade como miembro.
  - **PM:** todo, como hoy, y además ejecuta tareas (C2).
  - **Colaborador:** lo actual, más los entregables en lectura (con sus criterios) y los riesgos de los que es responsable.
  - **Observador:** solo lectura de resumen, acta, hitos, tareas, entregables, lecciones e informes de estado. No ve costos, presupuesto, desempeño, riesgos, interesados ni control de cambios. No puede ser asignado, comentar, subir anexos ni reportar incidentes.
- Servidor: sustituir el booleano `isPm` de `getProjectAccess` (`server/src/auth/access.ts`) por un objeto de capacidades, por ejemplo `can.read('risks')` y `can.write('tasks')`, calculado desde una tabla fija perfil × sección, y usarlo en `registerProjectCrud` y en cada ruta. Mantener la regla de que los datos ocultos no salen de la API. Un guardia global rechaza toda escritura de un observador, con el mismo patrón que `closedGuard`.
- Usuarios: `client/src/pages/Users.tsx` ofrece los tres perfiles; el inicio del observador es la lista de proyectos.
- Cliente: `ProjectLayout.tsx` filtra pestañas por capacidades en lugar de `pmOnly`.
- Pruebas: una matriz perfil × ruta, igual que la prueba de cobertura de `closedGuard`.

**F2. Notificaciones dentro de la aplicación** (Trabajo del proyecto)
- Modelo: `Notification { userId, kind, projectId, entityId, title, readAt }`.
- Eventos: tarea asignada, tarea por vencer o vencida, incidente asignado, comentario en mi tarea, entregable en revisión, cambio decidido.
- Generación en las rutas que ya hacen esos cambios y en la tarea diaria de M6 para los vencimientos. Campana en `AppLayout.tsx`. El correo queda para después porque exige un servidor SMTP.
- Hecho (`docs/superpowers/specs/2026-11-14-notificaciones-design.md`): tarea asignada, comentario, vence mañana, venció ayer e incidente asignado. «Cambio decidido» se añadió con F4. «Entregable en revisión» se quitó: solo el PM lo pasa a revisión.

**F3. Bitácora de actividad** (Medición, gobierno)
- Modelo: `ActivityLog { projectId, userId, action, entity, entityId, summary, createdAt }`.
- Un middleware de Hono para las escrituras con respuesta 2xx evita tocar cada ruta. Pestaña "Actividad" solo PM, con filtros por persona y entidad.

**F4. Solicitudes de cambio desde el equipo** (Trabajo del proyecto)
- Hoy solo el PM registra cambios. Permitir que un miembro proponga un cambio con título y descripción (mismo patrón que `reportIncidentSchema`); el PM completa impactos y decide.
- Hecho (`docs/superpowers/specs/2026-11-15-solicitudes-cambio-equipo-design.md`): el colaborador propone y ve solo sus propuestas, sin impactos; los PM reciben aviso de cada propuesta y quien la propuso, de la decisión. Una propuesta del equipo no se borra: se rechaza con una nota.

### Fase 2. Planificación

**F5. EDT (estructura de desglose del trabajo)** (Planificación, Entrega)
- Modelo: `Task.parentId` para jerarquía con código EDT calculado (1, 1.1, 1.1.2) y `Task.deliverableId` para ligar el trabajo al entregable.
- Las tareas padre resumen fechas, costo y avance de sus hijas y no se asignan.
- Vista de árbol en `Tasks.tsx`; el cronograma (`Timeline.tsx`) agrupa por padre.

**F6. Esfuerzo, horas y capacidad** (Equipo, Planificación, Medición)
- Modelo: `Task.estimatedHours`, `TimeEntry { taskId, userId, date, hours, note }`, `ProjectMember.hourlyRateCents` y `weeklyCapacityHours`.
- El colaborador registra horas en su tarea; el costo de mano de obra real se calcula con la tarifa (visible solo para PM) y entra al valor ganado como costo real.
- El panel de carga pasa de contar tareas a comparar horas asignadas con capacidad por semana.

**F7. Ruta crítica y tipos de dependencia** (Planificación)
- Modelo: `TaskDependency.type` (FS, SS, FF, SF) y `lagDays`.
- Función pura `criticalPath(tasks, dependencies)` en `server/src/domain/` con pasada hacia adelante y hacia atrás; devuelve holgura por tarea.
- El cronograma resalta la ruta crítica; opción "reprogramar sucesoras" al mover una fecha, siempre con confirmación.

**F8. Reservas y presupuesto por categoría** (Planificación, Incertidumbre)
- Modelo: `Project.contingencyReserveCents`, `managementReserveCents` y un presupuesto por categoría de gasto.
- Presupuesto muestra planeado frente a real por categoría y el consumo de la reserva. `reserveCents` de `evm.ts` deja de ser la simple diferencia entre presupuesto y BAC.

### Fase 3. Interesados y comunicaciones

**F9. Involucramiento de interesados** (Interesados)
- Modelo: `Stakeholder.currentEngagement` y `desiredEngagement` (desconocedor, reticente, neutral, de apoyo, líder), más expectativas.
- Vistas: cuadrícula poder/interés con los datos que ya existen y matriz de involucramiento actual frente a deseado.

**F10. Plan de comunicaciones y actas de reunión** (Interesados, Trabajo del proyecto)
- Modelo: `CommunicationItem { qué, audiencia, frecuencia, canal, responsable }` y `Meeting { fecha, asistentes, notas, acuerdos }`.
- Cada acuerdo de una reunión puede convertirse en tarea, decisión o incidente con un clic, reutilizando `createDecision` y `createIncident`.

**F11. Informe de estado periódico** (Medición, Interesados)
- Modelo: `StatusReport { projectId, periodo, snapshot JSON, comentario del PM }`.
- Contenido: salud, avance, indicadores de valor ganado, hitos, riesgos principales, incidentes, cambios y próximos pasos. Mismo patrón que el informe de cierre (`buildClosureReport` y la vista imprimible), congelado al emitirlo. Es lo que verá el Observador.

### Fase 4. Entrega y calidad

**F12. Requisitos y trazabilidad** (Entrega)
- Modelo: `Requirement { código, descripción, origen (interesado), prioridad, estado }` con relación a entregables.
- Matriz de trazabilidad: requisito → entregable → tareas → criterio de aceptación. Las solicitudes de cambio pueden citar requisitos afectados.

**F13. Calidad** (Entrega)
- Métricas de calidad por proyecto con meta y valor medido.
- No conformidades: reutilizar incidentes añadiendo `Incident.kind` (incidente, defecto, no conformidad) y un vínculo opcional al entregable; un rechazo de entregable puede generar una.

**F14. Adquisiciones** (Trabajo del proyecto)
- Modelo: `Vendor`, `Contract { proveedor, objeto, monto, fechas, estado, anexo }`. `Expense.contractId` liga los pagos al contrato.
- La categoría "Proveedores" ya existe en lecciones; falta el módulo.

### Fase 5. Incertidumbre y medición

**F15. Riesgos completos y registro de supuestos** (Incertidumbre)
- Riesgos: disparador, fecha de próxima revisión, costo de contingencia, probabilidad e impacto residuales e historial de evaluaciones (`RiskAssessment`). Vista de matriz de probabilidad e impacto 5×5.
- Supuestos: hoy son texto libre en el acta. Crear `Assumption { descripción, responsable, fecha de validación, estado }`; un supuesto que resulta falso se convierte en riesgo o incidente.

**F16. Medición ampliada** (Medición)
- TCPI en `computeEvm`, tendencia de hitos (fecha planeada frente a pronosticada) y umbrales de salud configurables por proyecto (hoy son constantes en `server/src/domain/health.ts`).
- Exportación a CSV de tareas, riesgos, gastos, incidentes y lecciones.

### Fase 6. Adaptación

**F17. Plantillas, fases y enfoque ágil** (Enfoque de desarrollo y ciclo de vida)
- Plantillas: crear un proyecto copiando estructura (EDT, hitos, RACI, riesgos típicos) de otro.
- Fases con puerta de aprobación: `Phase { nombre, fechas, estado, criterios de salida }`.
- Para proyectos ágiles o híbridos: backlog priorizado e iteraciones, con gráfico de trabajo pendiente. El campo `approach` decide qué vistas aparecen.

**F18. Versiones y PDF del acta** (Planificación)
- Guardar una versión del acta en cada aprobación (`CharterVersion` con el contenido congelado) y ofrecer la vista imprimible. Ambas quedaron fuera del alcance de la primera versión.

## 7. Orden recomendado

| Etapa | Bloques | Motivo |
|---|---|---|
| 1 | C12, M0 a M8 (con C4 y C5) | Cambiar de plataforma primero: todo lo demás se construye sobre Postgres y la nube |
| 2 | C2, C1 + F1 | PM que ejecuta tareas y los tres perfiles de acceso |
| 3 | F3 ✓, F2 ✓, F4 ✓, C11 ✓ | Control y comunicación al abrir más información |
| 4 | C6, C7, C8, C9, C10 | Dejar fiables los números que ya se muestran |
| 5 | F5, F6, F7, F8 | Planificación completa; F5 es requisito de F6, F7 y F12 |
| 6 | F11, F9, F10 | Informes y comunicaciones para interesados |
| 7 | F12, F13, F15, F16 | Entrega, calidad e incertidumbre |
| 8 | F14, F17, F18 | Según necesidad |

## 8. Reglas para cada bloque

- Seguir los patrones existentes: esquema Zod en `shared/src/schemas.ts`, regla pura en `server/src/domain/` con su prueba, ruta en `server/src/routes/`, migración Prisma nueva (nunca editar una aplicada), etiquetas en `LABELS`.
- Toda ruta nueva de escritura bajo `/api/projects/:id/…` o `/api/tasks/:id/…` queda cubierta por `closedGuard`; revisar su prueba de cobertura.
- Todo dato de costo sigue oculto para quien no sea PM, y se prueba que la API no lo envía.
- Los informes congelados (cierre, estado, versiones del acta) se guardan como JSON, igual que `ProjectClosure.report`.
- Probar cada migración en una base de pruebas de Supabase antes de aplicarla en producción.
