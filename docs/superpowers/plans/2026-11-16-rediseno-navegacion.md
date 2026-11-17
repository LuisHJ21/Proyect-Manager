# Rediseño de la navegación del proyecto — Plan

**Goal:** Menú del proyecto agrupado a la izquierda, menú general compacto dentro del proyecto y Resumen en dos columnas.

**Spec:** `docs/superpowers/specs/2026-11-16-rediseno-navegacion-design.md`

## Global Constraints
- Solo cliente; nombres accesibles de los enlaces sin cambios; `aria-label="Secciones del proyecto"` se conserva.
- Pruebas con `npx vitest run` y `npx tsc -b` en `client/`; flujo completo con `npm run build` y `npm run test:e2e`.

### Task 1: Menú lateral agrupado del proyecto
- [ ] Prueba en `client/tests/projectLayout.test.tsx`: el orden de enlaces por perfil sigue los grupos (colaborador: Resumen, Acta, Requisitos, Tareas, Entregables, Riesgos, Incidentes, Control de cambios, Reuniones, Lecciones, Anexos; observador: Resumen, Informes, Acta, Requisitos, Tareas, Entregables, Lecciones, Anexos); el PM ve los títulos de grupo; con 2 tareas vencidas el enlace Tareas muestra «2» y su nombre sigue siendo «Tareas».
- [ ] Implementar `client/src/components/project/ProjectNav.tsx` y usarlo en `ProjectLayout.tsx` con el encabezado nuevo.
- [ ] Commit `feat: menú lateral agrupado del proyecto`.

### Task 2: Menú general compacto dentro del proyecto
- [ ] Prueba en `client/tests/layout.test.tsx`: dentro de `/proyectos/p1/resumen` la navegación «Principal» conserva sus enlaces por nombre, no muestra «Proyectos activos» ni «Nuevo proyecto»; fuera del proyecto sí.
- [ ] Implementar el modo compacto en `AppLayout.tsx`.
- [ ] Commit `feat: menú general compacto dentro de un proyecto`.

### Task 3: Resumen en dos columnas
- [ ] Prueba en `client/tests/projectLayout.test.tsx`: el Resumen tiene las regiones «Columna principal» y «Columna lateral»; la descripción y el equipo van en la lateral.
- [ ] Implementar en `Summary.tsx`.
- [ ] Commit `feat: resumen del proyecto en dos columnas`.

### Task 4: Verificación
- [ ] Suite del cliente, `tsc -b`, build y flujo completo.
