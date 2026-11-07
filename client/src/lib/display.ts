export const PROJECT_COLORS = ['#6C8CFF', '#A78BFA', '#F97316', '#2DD4BF', '#EAB308'];

/** Fondos de avatar con contraste suficiente para texto blanco. */
const AVATAR_COLORS = ['#0F766E', '#7C3AED', '#C2410C', '#1D4ED8', '#3B5BDB', '#A21CAF'];

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export const projectColor = (id: string) => PROJECT_COLORS[hash(id) % PROJECT_COLORS.length]!;
export const avatarColor = (key: string) => AVATAR_COLORS[hash(key) % AVATAR_COLORS.length]!;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Para buscar sin distinguir mayúsculas ni acentos. */
export const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function shortDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]} ${year}`;
}
