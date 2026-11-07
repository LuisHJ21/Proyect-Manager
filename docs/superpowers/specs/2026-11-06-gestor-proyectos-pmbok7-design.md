# Gestor de proyectos basado en PMBOK 7: especificación de diseño

**Fecha:** 2026-11-06
**Estado:** pendiente de revisión

## 1. Propósito

Aplicación web para que un Project Manager administre sus proyectos según PMBOK 7: registrar la información del proyecto y su acta de constitución, planificar y asignar tareas a colaboradores, y seguir el avance, los riesgos, los interesados y el presupuesto.

### Criterios de éxito de la primera versión

1. Un Project Manager crea un proyecto con su acta completa y la aprueba.
2. Crea tareas, las asigna a uno o más colaboradores y define dependencias entre ellas.
3. Cada colaborador entra con su propia cuenta desde otro equipo de la red local, ve sus tareas y actualiza su avance.
4. El Project Manager ve el avance actualizado, los riesgos, los interesados y el presupuesto de cada proyecto.

### Restricciones

- Frontend en React con Tailwind.
- Uso en red local: la aplicación corre en un equipo o servidor de la oficina.
- Interfaz en español.

## 2. Arquitectura

Un solo proceso Node atiende la API y entrega el frontend compilado. Todo el código está en TypeScript, organizado con npm workspaces:

| Paquete | Contenido | Tecnología |
|---|---|---|
| `client/` | Interfaz web | React, Tailwind, Vite, React Router, TanStack Query |
| `server/` | API y entrega de archivos estáticos | Fastify, Prisma |
| `shared/` | Esquemas de validación y tipos comunes | Zod |

- **Base de datos:** SQLite, con Prisma para el acceso y las migraciones. Las migraciones pendientes se aplican al arrancar.
- **Almacenamiento:** la base de datos y los anexos viven dentro de la carpeta `data/`.
- **Red:** el servidor escucha en `0.0.0.0`. El puerto predeterminado es 3080 y se cambia con la variable `PORT`. La carpeta de datos se cambia con `DATA_DIR`.
- **Concurrencia:** si dos personas modifican el mismo registro, prevalece el último guardado.

## 3. Cuentas y sesiones

- No hay registro público. La pantalla de configuración inicial solo está disponible mientras no exista ningún usuario, y crea el primer Project Manager.
- Un Project Manager crea cuentas con una contraseña temporal. El usuario debe cambiarla en su primer ingreso y no puede usar otras funciones hasta hacerlo.
- Un Project Manager puede restablecer la contraseña de otro usuario con una nueva contraseña temporal.
- Las contraseñas tienen un mínimo de 10 caracteres y se guardan con hash argon2id.
- La sesión se guarda en la base de datos y se identifica con una cookie `httpOnly` y `SameSite=Lax`. Vence tras 12 horas.
- Tras 5 intentos fallidos con el mismo correo e IP, el inicio de sesión se bloquea durante 15 minutos.
- Los usuarios se desactivan, no se borran. Una cuenta desactivada no puede entrar y sus sesiones se invalidan. No se puede desactivar al último Project Manager activo.

**Limitación aceptada:** el acceso es por `http://`, sin cifrado. Es adecuado para una red de oficina de confianza. Se puede añadir HTTPS más adelante con un proxy, sin cambiar la aplicación.

## 4. Roles y permisos

Hay dos roles: **Project Manager (PM)** y **Colaborador**. Todos los PM ven todos los proyectos. Un colaborador solo ve los proyectos de los que es miembro.

| Acción | Project Manager | Colaborador |
|---|---|---|
| Crear, editar y eliminar proyectos | Sí | No |
| Crear, editar y aprobar actas | Sí | No |
| Ver resumen, objetivos, hitos, equipo y acta | Sí | Solo lectura, si es miembro |
| Ver presupuesto y gastos, y gestionarlos | Sí | No |
| Ver interesados y riesgos, y gestionarlos | Sí | No |
| Crear, editar y eliminar tareas, asignarlas y definir dependencias | Sí | No |
| Ver las tareas del proyecto | Sí | Solo lectura, si es miembro |
| Actualizar estado y avance de una tarea, y comentarla | Todas | Solo si está asignado |
| Subir anexos a una tarea | Sí | Solo si está asignado |
| Subir anexos al proyecto | Sí | No |
| Ver y descargar anexos | Sí | Los de tareas y del proyecto, si es miembro |
| Eliminar anexos | Todos | Solo los que subió él mismo |
| Gestionar usuarios | Sí | No |

Todos los permisos se validan en el servidor. La API no envía a un colaborador datos de presupuesto, gastos, interesados ni riesgos, ni los indicadores derivados de ellos.

## 5. Pantallas

**Generales**

- **Configuración inicial, inicio de sesión y cambio de contraseña.**
- **Proyectos:** lista con estado y avance.
- **Mis tareas:** tareas asignadas al usuario en todos sus proyectos. Es la pantalla de inicio del colaborador.
- **Usuarios:** solo para PM.

**Dentro de cada proyecto** (las marcadas con * solo las ve el PM)

- **Resumen:** descripción, objetivos, equipo e indicadores.
- **Acta:** contenido del acta y su estado.
- **Tareas:** vistas de lista, tablero Kanban y cronograma.
- **Anexos:** archivos del proyecto.
- **Interesados\***, **Riesgos\*** y **Presupuesto\***.

## 6. Relación con PMBOK 7

| Dominio de desempeño | Dónde aparece | Cobertura |
|---|---|---|
| Interesados | Registro de interesados | Completa |
| Equipo | Miembros del proyecto y su rol | Básica |
| Enfoque de desarrollo y ciclo de vida | Campo del proyecto: predictivo, ágil o híbrido | Básica |
| Planificación | Acta, objetivos, hitos, cronograma y presupuesto | Completa |
| Trabajo del proyecto | Tareas, asignaciones, Kanban, comentarios y anexos | Completa |
| Entrega | Alcance, criterios de éxito y estado de los objetivos | Parcial |
| Medición | Indicadores del resumen | Básica |
| Incertidumbre | Registro de riesgos | Completa |

Los 12 principios de PMBOK 7 son guías de conducta y no tienen un módulo propio.

## 7. Modelo de datos

Todas las entidades tienen identificador y fechas de creación y actualización. Las fechas de planificación son de calendario, sin hora. Los montos se guardan como enteros en centavos.

- **User:** nombre, correo único, hash de contraseña, rol, activo, debe cambiar contraseña.
- **Session:** usuario, token, vencimiento.
- **Project:** nombre, descripción, estado (*Planificación*, *En ejecución*, *En pausa*, *Cerrado*, *Cancelado*), enfoque (*Predictivo*, *Ágil*, *Híbrido*), fecha de inicio, fecha de fin, presupuesto planificado, código de moneda. La fecha de inicio no puede ser posterior a la de fin.
- **ProjectMember:** proyecto, usuario, rol en el proyecto (texto libre).
- **Charter:** una por proyecto, creada junto con él. Justificación, alcance incluido, alcance excluido, límites, supuestos, restricciones, criterios de éxito, patrocinador, estado (*Borrador*, *Aprobada*), aprobado por, fecha de aprobación.
- **Objective:** proyecto, descripción, métrica, meta, estado (*Pendiente*, *Cumplido*, *No cumplido*).
- **Milestone:** proyecto, nombre, fecha límite, estado (*Pendiente*, *Alcanzado*).
- **Task:** proyecto, hito opcional, título, descripción, estado (*Por hacer*, *En curso*, *Bloqueada*, *Hecha*), prioridad (*Baja*, *Media*, *Alta*), fecha de inicio, fecha límite, avance (0 a 100). La fecha de inicio no puede ser posterior a la límite.
- **TaskAssignee:** tarea, usuario. Una tarea puede tener cero o más asignados.
- **TaskDependency:** tarea predecesora, tarea sucesora.
- **TaskComment:** tarea, autor, texto. Los comentarios no se editan ni se eliminan.
- **Attachment:** proyecto, tarea opcional (sin tarea es un anexo del proyecto), quien lo subió, nombre original, nombre en disco, tipo, tamaño.
- **Stakeholder:** proyecto, nombre, organización, cargo, contacto, influencia e interés (*Bajo*, *Medio*, *Alto*), estrategia de gestión.
- **Risk:** proyecto, descripción, tipo (*Amenaza*, *Oportunidad*), probabilidad e impacto (1 a 5), respuesta, plan de respuesta, responsable (usuario miembro), estado (*Abierto*, *En tratamiento*, *Cerrado*). El puntaje no se guarda: se calcula como probabilidad × impacto.
- **Expense:** proyecto, descripción, monto, fecha, categoría (*Mano de obra*, *Materiales*, *Equipos*, *Servicios*, *Otros*).

Las respuestas válidas dependen del tipo de riesgo:

- **Amenaza:** Evitar, Mitigar, Transferir, Escalar, Aceptar.
- **Oportunidad:** Explotar, Mejorar, Compartir, Escalar, Aceptar.

## 8. Reglas de negocio

### Acta

- Solo se puede aprobar con justificación, alcance incluido y criterios de éxito completos.
- La aprobación registra quién aprobó y cuándo.
- Si se edita un acta aprobada, vuelve a *Borrador* y se borran los datos de aprobación.

### Tareas y asignaciones

- Solo se pueden asignar miembros del proyecto.
- Quitar a un miembro de un proyecto también quita sus asignaciones y su responsabilidad sobre riesgos, tras una advertencia.
- El estado y el avance son únicos por tarea, no por persona.
- Marcar una tarea como *Hecha* fija su avance en 100.
- *Bloqueada* es un estado manual, independiente de las dependencias.

### Dependencias

- Solo existe el tipo fin a inicio, y solo entre tareas del mismo proyecto. Una tarea puede tener varias predecesoras.
- Se rechaza cualquier dependencia que cree un ciclo, y el error muestra la cadena que lo causa. Una tarea no puede depender de sí misma.
- Una tarea no puede pasar a *En curso* ni a *Hecha* hasta que todas sus predecesoras estén en *Hecha*. El error indica cuáles faltan. Esta regla se aplica a ambos roles. Para saltarla, el PM debe quitar la dependencia.
- Si una predecesora terminada se reabre, las sucesoras conservan su estado y muestran una advertencia.
- Las fechas no se recalculan solas. Si una tarea empieza antes de la fecha límite de una predecesora, la aplicación muestra una advertencia, pero permite guardar.
- La lista y el Kanban marcan las tareas que están en espera de predecesoras. El cronograma dibuja las dependencias como flechas.

### Anexos

- Límite de 25 MB por archivo.
- Tipos permitidos: PDF, Word, Excel, PowerPoint, imágenes (PNG, JPG, GIF, WebP), TXT, CSV y ZIP. Se valida la extensión y el tipo declarado.
- Los archivos se guardan con un nombre aleatorio, requieren sesión y permiso sobre el proyecto, y siempre se entregan como descarga, nunca para abrirse en el navegador.
- Los anexos del proyecto son visibles para todos sus miembros.

### Indicadores

- **Avance:** promedio simple del avance de todas las tareas. Sin tareas, es 0 %.
- **Tareas vencidas:** fecha límite anterior a hoy y estado distinto de *Hecha*.
- **Tareas bloqueadas:** en estado *Bloqueada*.
- **Presupuesto (solo PM):** planificado, suma de gastos y diferencia.
- **Riesgos altos (solo PM):** no cerrados con puntaje de 15 o más.
- **Próximos hitos:** pendientes con fecha dentro de los próximos 14 días.

### Eliminaciones

- **Proyecto:** elimina de forma permanente sus tareas, anexos y demás datos. Requiere escribir el nombre del proyecto para confirmar.
- **Tarea:** elimina sus dependencias, comentarios y anexos. Si otras tareas dependen de ella, se muestra una advertencia antes.

## 9. Manejo de errores

La API responde con un formato común: un código, un mensaje en español y, si corresponde, detalles por campo.

| Código HTTP | Caso | Comportamiento en la interfaz |
|---|---|---|
| 400 | Datos inválidos | Marca cada campo con su error y conserva lo escrito |
| 401 | Sin sesión o sesión vencida | Lleva a iniciar sesión |
| 403 | Acción sin permiso | Muestra un mensaje claro |
| 404 | No existe, o el usuario no es miembro del proyecto | Muestra "no encontrado", sin revelar que existe |
| 409 | Predecesoras sin terminar o ciclo de dependencias | Explica la causa. En el Kanban, la tarjeta vuelve a su columna |
| 413 / 415 | Archivo demasiado grande o de tipo no permitido | Indica el límite o los tipos aceptados |
| 429 | Demasiados intentos de inicio de sesión | Indica cuándo volver a intentarlo |
| 5xx o sin conexión | Falla del servidor | Muestra un aviso y permite reintentar, sin perder lo escrito |

Al subir un anexo, primero se escribe el archivo y luego el registro. Si el registro falla, se borra el archivo, de modo que no quedan archivos sueltos ni registros incompletos.

## 10. Pruebas

- **API (Vitest, con base de datos temporal):**
  - Permisos de cada rol, incluyendo que un colaborador no reciba datos ocultos.
  - Dependencias: ciclos, bloqueo y reapertura.
  - Acta: requisitos para aprobar y vuelta a *Borrador*.
  - Anexos: tamaño, tipo y acceso sin sesión.
  - Cálculo de indicadores.
- **Componentes (React Testing Library):** formulario del acta y manejo de errores en el Kanban.
- **Flujo completo (Playwright):**
  1. El PM crea un proyecto y su acta.
  2. Crea dos tareas dependientes y las asigna a dos colaboradores.
  3. Un colaborador entra con su cuenta, comprueba el bloqueo y completa su tarea.
  4. El PM ve el avance actualizado.

## 11. Instalación y operación

- **Instalación y arranque:** `npm install`, `npm run build` y `npm start`.
- **README:** incluye estos pasos, cómo permitir el puerto en el firewall de Windows y cómo respaldar.
- **Respaldo:** manual, copiando la carpeta `data/` con el servidor detenido.
- **Disponibilidad:** los colaboradores solo pueden entrar mientras el equipo que aloja la aplicación esté encendido y con la aplicación en marcha.

## 12. Fuera del alcance de la primera versión

- Notificaciones por correo.
- Ruta crítica y recálculo automático de fechas.
- Dependencias de un tipo distinto a fin a inicio.
- Valor ganado (EVM).
- Exportar el acta a PDF.
- Historial de versiones del acta.
- Respaldos automáticos y HTTPS integrado.
- Avance por persona dentro de una tarea.
