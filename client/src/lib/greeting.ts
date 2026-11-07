export function greeting(now: Date, name: string): string {
  const hour = now.getHours();
  const salute = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${salute}, ${name.trim().split(/\s+/)[0]}`;
}

export function longDate(now: Date): string {
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
