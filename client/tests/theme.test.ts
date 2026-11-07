import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src');
/** Valores propios permitidos: la lista de colores de proyecto y de avatares, con texto legible por diseño. */
const HEX_ALLOWED = new Set(['lib/display.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// El texto blanco sobre botones y avatares es intencional.
const OLD_COLOR = /(?<![\w-])bg-white\b|(?<![\w-])(?:bg|text|border|divide|fill|stroke|outline|ring)-(?:slate|gray|zinc|indigo|blue|red|green|amber|emerald)-\d+/;

describe('tema', () => {
  it('los componentes usan clases del tema, no colores claros directos', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => OLD_COLOR.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('los colores hexadecimales solo están en sus listas', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !HEX_ALLOWED.has(relative(SRC, path).replace(/\\/g, '/')))
      .filter((path) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});
