import { expect, test } from '@playwright/test';

test('las páginas principales no desbordan el ancho de la pantalla', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await page.getByLabel('Nombre').fill('Paula');
  await page.getByLabel('Correo').fill('paula-responsive@x.com');
  await page.getByLabel('Contraseña').fill('contraseña-del-pm-1');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByLabel('Nombre').fill('Portal');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Portal' })).toBeVisible();
  const projectPath = new URL(page.url()).pathname.replace(/\/resumen$/, '');

  const projectRoutes = await page.locator('nav[aria-label="Secciones del proyecto"] a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
  const appRoutes = await page.locator('nav[aria-label="Principal"] a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
  await page.goto(`${projectPath}/tareas`);
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  await page.getByRole('dialog').getByLabel('Título').fill('Construcción');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar tarea' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Construcción' }).click();
  const taskRoute = new URL(page.url()).pathname;
  const routes = [...new Set([taskRoute, ...appRoutes, ...projectRoutes])];

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await page.locator('main').waitFor();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const clippedControls = [...document.querySelectorAll('button, input, select, textarea')].filter((element) => {
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || (rect.left >= -1 && rect.right <= viewport + 1)) return false;
          let parent = element.parentElement;
          while (parent) {
            if (parent.scrollWidth > parent.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(parent).overflowX)) return false;
            parent = parent.parentElement;
          }
          return true;
        }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName).slice(0, 3);
        const outer = [...document.querySelectorAll('*')].filter((element) => {
          if (element === document.documentElement || element === document.body) return false;
          const rect = element.getBoundingClientRect();
          if (rect.right <= viewport + 1) return false;
          let parent = element.parentElement;
          while (parent) {
            if (parent.scrollWidth > parent.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(parent).overflowX)) return false;
            parent = parent.parentElement;
          }
          return true;
        }).map((element) => `${element.tagName}:${Math.round(element.getBoundingClientRect().right)}:${String(element.className).slice(0, 80)}`).slice(0, 6);
        return { clippedControls, outer };
      });
      expect(overflow.outer, `${route} a ${width}px`).toEqual([]);
      expect(overflow.clippedControls, `${route} a ${width}px`).toEqual([]);
    }
    if (width > 768) continue;
    await page.goto(taskRoute);
    for (const name of ['Editar tarea', 'Reportar incidente']) {
      await page.getByRole('button', { name }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const clipped = await dialog.locator('input, select, textarea, button').evaluateAll((controls) => controls.filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
      }).map((control) => control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName));
      expect(clipped, `${name} a ${width}px`).toEqual([]);
      await page.keyboard.press('Escape');
    }
  }
});
