import { parseMoneyToCents } from '@pm/shared';
import { useState, type InputHTMLAttributes } from 'react';
import { inputClass } from './ui';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  /** Centavos, o null si lo escrito no es un monto válido. */
  value: number | null;
  onChange: (cents: number | null) => void;
  /** Dejar el campo vacío equivale a cero, en lugar de a un monto inválido. */
  blankIsZero?: boolean;
};

export const INVALID_MONEY_MESSAGE = 'Monto inválido. Ejemplos: 1234,50 o 1.234,50';

const toText = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

export function MoneyInput({ value, onChange, blankIsZero, ...props }: Props) {
  const [text, setText] = useState(blankIsZero && value === 0 ? '' : toText(value));
  return (
    <input
      {...props}
      className={inputClass}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const blank = event.target.value.trim() === '';
        onChange(blank && blankIsZero ? 0 : parseMoneyToCents(event.target.value));
      }}
    />
  );
}
