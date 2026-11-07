import { describe, expect, it } from 'vitest';
import { createExpenseSchema, createMilestoneSchema } from '../src/schemas';

describe('mensajes de validación', () => {
  it('una fecha ausente da un mensaje en español', () => {
    const result = createMilestoneSchema.safeParse({ name: 'H', dueDate: null });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Este campo es obligatorio');
  });

  it('un campo ausente da un mensaje en español', () => {
    const result = createExpenseSchema.safeParse({ description: 'G', amountCents: 100, date: '2026-11-01' });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe('Este campo es obligatorio');
  });

  it('una opción fuera de la lista da un mensaje en español', () => {
    const result = createExpenseSchema.safeParse({ description: 'G', amountCents: 100, date: '2026-11-01', category: 'X' });
    expect(result.error!.issues[0]!.message).toBe('Selecciona una opción válida');
  });
});
