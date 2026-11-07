# Gestor de proyectos PMBOK 7

Aplicación web para gestionar proyectos según PMBOK 7 en una red local. Incluye acta de constitución, tareas con varios asignados y dependencias, anexos, interesados, riesgos, presupuesto e indicadores. Tiene dos roles: Project Manager y Colaborador.

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

Al arrancar, la consola muestra las direcciones de acceso, por ejemplo `http://192.168.1.20:3080`. La base de datos se crea o actualiza sola.

Para cambiar el puerto o la carpeta de datos, usa las variables de entorno `PORT` y `DATA_DIR`.

## Primer ingreso

1. Abre la dirección en el navegador y crea tu cuenta de Project Manager.
2. En **Usuarios**, crea las cuentas de tus colaboradores con una contraseña temporal y compártela con cada persona. Deberán cambiarla al entrar.
3. Crea un proyecto y añade a tus colaboradores al equipo desde la pestaña **Resumen**. Solo verán los proyectos de los que son miembros.

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
