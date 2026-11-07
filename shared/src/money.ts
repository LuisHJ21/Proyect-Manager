const GROUPED = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/;

/** Convierte texto escrito por una persona a centavos, usando solo aritmética entera. */
export function parseMoneyToCents(input: string): number | null {
  const text = input.trim();
  if (!/^\d(?:[\d.,]*\d)?$/.test(text)) return null;

  const lastSeparator = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  let integerText = text;
  let decimals = '';

  if (lastSeparator >= 0) {
    const tail = text.slice(lastSeparator + 1);
    if (tail.length > 3) return null;
    if (tail.length <= 2) {
      integerText = text.slice(0, lastSeparator);
      decimals = tail;
      if (integerText.includes(text[lastSeparator]!)) return null;
    }
  }

  if (/[.,]/.test(integerText) && !GROUPED.test(integerText)) return null;

  const units = Number(integerText.replace(/[.,]/g, ''));
  const cents = units * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
