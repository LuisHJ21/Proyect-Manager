# Gestor de proyectos PMBOK 7

Aplicación web para gestionar proyectos según PMBOK 7 en una red local. Incluye panel general, calendario, acta de constitución, tareas con varios asignados y dependencias, anexos, interesados, riesgos, presupuesto e indicadores.

## Roles

- **Project Manager:** entra al panel general, ve todos los proyectos y gestiona proyectos, tareas y usuarios. No recibe tareas asignadas.
- **Colaborador:** entra a **Mis tareas** y ve solo los proyectos de los que es miembro. Actualiza el estado y el avance de las tareas que tiene asignadas.

Ambos roles tienen un calendario con las actividades por fecha límite. El Project Manager ve todas las de los proyectos activos, y el colaborador, las suyas y los hitos de sus proyectos.

## Textos con formato y matriz RACI

- **Textos con formato:** el acta, la descripción del proyecto, los objetivos y los riesgos se escriben con negrita, cursiva, títulos de sección y listas. Al guardar se elimina cualquier otro formato, como enlaces, imágenes o código. Los textos escritos antes de este cambio se muestran tal cual, con un párrafo por línea.
- **Matriz RACI:** en la pestaña **Interesados** de cada proyecto, el Project Manager define actividades y, para cada miembro del equipo o interesado, si hace el trabajo (R), rinde cuentas (A), se le consulta (C) o se le informa (I). Cada fila avisa si le falta una A, si tiene más de una o si le falta una R. Los colaboradores no ven la matriz.

## Línea base, valor ganado y cambios

Solo el Project Manager ve estas secciones.

- **Costo planeado:** cada tarea puede tener un costo planeado, y cada gasto puede ligarse a una tarea.
- **Línea base:** en la pestaña **Desempeño**, "Fijar línea base" guarda una foto de las tareas con costo y sus fechas. Se puede volver a fijar con un motivo, y cada versión queda en el historial.
- **Indicadores:**
  - **CPI** (eficiencia de costo): valor ganado entre costo real. Menos de 1 significa que se gasta más de lo que se avanza.
  - **SPI** (eficiencia de plazo): valor ganado entre valor planeado. Menos de 1 significa atraso.
  - **EAC** (costo final estimado): lo que costará el proyecto si sigue igual.
  - **VAC** (variación al terminar): presupuesto planeado menos EAC. Negativo significa sobrecosto.
- **Salud:** con línea base, un CPI o SPI bajo 0,9 marca el proyecto como "Atención".
- **Cambios:** la pestaña **Cambios** registra cada solicitud con su impacto en alcance, plazo y costo, y su decisión con una nota. Una nueva línea base puede citar un cambio aprobado.

## Incidentes y decisiones

- **Incidentes:** cualquier miembro del proyecto reporta un problema desde la pestaña **Incidentes** o desde una tarea. El colaborador ve los que reportó y los que tiene asignados. Si es el responsable, puede marcarlos en curso y resolverlos con una resolución. El Project Manager ve todos, asigna responsable, prioridad y fecha límite, y los cierra o reabre.
- **Riesgo a incidente:** en el detalle de un riesgo, "Pasar a incidente" crea el incidente con el título, el responsable y la prioridad del riesgo.
- **Panel:** los incidentes de prioridad alta abiertos y los vencidos aparecen en "Requiere atención".
- **Decisiones:** en la pestaña **Control de cambios**, el Project Manager registra qué se decidió, quién y por qué, con enlaces a cambios e incidentes. Al cerrar un incidente puede registrarlo como decisión. Los colaboradores no ven las decisiones.

## Entregables y aceptación

Esta función es solo para el Project Manager; los colaboradores no ven la pestaña.

- **Entregables:** en la pestaña **Entregables** se registra cada producto que hay que entregar (ENT-1, ENT-2…). Cada uno puede tener hito, fecha comprometida y una lista de criterios de aceptación.
- **Revisión:** un entregable pasa de "Pendiente" a "En revisión". Desde ahí se acepta o se rechaza en nombre de un interesado del registro.
  - Para aceptar, todos los criterios tienen que estar marcados.
  - Para rechazar hay que escribir el motivo.
  - Como evidencia se puede elegir un archivo de **Anexos**, por ejemplo el acta firmada. Conviene subirlo antes.
- **Historial:** cada revisión queda guardada con la fecha, el interesado, la nota, el anexo y cómo estaban los criterios en ese momento.
  - Si después se borra el interesado o el anexo, el historial conserva el nombre.
  - Un entregable aceptado se puede reabrir; el historial no se pierde.
  - Mientras está aceptado, sus criterios no se pueden cambiar.
- **Panel:** los entregables vencidos (pasada la fecha comprometida y sin aceptar) aparecen en "Requiere atención".

## Requisitos

- Node.js 24
- Windows, Linux o macOS

## Instalación y arranque

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

**Antes de actualizar** a una versión nueva, detén la aplicación y copia la carpeta `data/`: al arrancar, la base de datos se actualiza sola y no se puede deshacer sin esa copia.

Al arrancar, la consola muestra las direcciones de acceso, por ejemplo `http://192.168.1.20:3080`. La base de datos se crea o actualiza sola.

Para cambiar el puerto o la carpeta de datos, usa las variables de entorno `PORT` y `DATA_DIR`.

## Primer ingreso

1. Abre la dirección en el navegador y crea tu cuenta de Project Manager.
2. En **Usuarios**, crea las cuentas de tus colaboradores con una contraseña temporal y compártela con cada persona. Deberán cambiarla al entrar.
3. Crea un proyecto y añade a tus colaboradores al equipo desde la pestaña **Resumen**. Solo verán los proyectos de los que son miembros.
4. Crea tareas y asígnalas a los colaboradores del proyecto.

## Olvidé mi contraseña

Si el Project Manager olvida su contraseña, en el equipo que aloja la aplicación abre una terminal en la carpeta del proyecto y ejecuta:

```bash
npm run reset-password -- tu-correo@ejemplo.com
```

La consola muestra una contraseña temporal. Al entrar con ella, la aplicación pide cambiarla. Sin correo, el comando lista los Project Managers registrados. Un colaborador también puede pedirle al Project Manager que le restablezca la contraseña desde **Usuarios**.

## Permitir el acceso desde otros equipos (Windows)

Abre PowerShell como administrador y permite el puerto en el firewall:

```powershell
New-NetFirewallRule -DisplayName "Gestor PMBOK" -Direction Inbound -Protocol TCP -LocalPort 3080 -Action Allow
```

Si usas otro puerto, cambia `3080` por ese valor.

## Respaldos

Los datos y los anexos están en la carpeta `data/`. Para respaldar:

1. Detén el servidor.
2. Copia la carpeta `data/` a otro disco.
3. Vuelve a arrancar el servidor.

Los respaldos no son automáticos. Si el disco falla, se pierde lo que no hayas copiado.

Para restaurar, detén el servidor y reemplaza la carpeta `data/` por la copia.

## Limitaciones

- **Sin cifrado:** el acceso es por `http://`, así que las contraseñas y los datos viajan sin cifrar por la red. Úsala solo en una red de oficina de confianza, no en una Wi-Fi compartida. Se puede añadir HTTPS poniendo un proxy delante.
- **Disponibilidad:** tus colaboradores solo pueden entrar mientras el equipo que aloja la aplicación esté encendido y con la aplicación en marcha.

## Desarrollo

```bash
npm run dev
```

La consola indica la dirección de la interfaz (normalmente `http://localhost:5173`). La API usa el puerto 3080.

```bash
npm test
```

La prueba de extremo a extremo usa Microsoft Edge y necesita haber compilado antes con `npm run build`:

```bash
npm run test:e2e
```
