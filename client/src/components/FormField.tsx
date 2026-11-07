import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { ApiError, errorMessage } from '../api/client';

type FieldProps = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** Enlaza una etiqueta y un mensaje de error con su control. */
export function FormField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<FieldProps>, {
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? errorId : undefined,
      })
    : children;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {control}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export type FormErrors = { fields: Record<string, string>; message?: string };
export const NO_ERRORS: FormErrors = { fields: {} };

/** Traduce un error de la API a errores de formulario. Lo escrito no se toca. */
export function applyFieldErrors(error: unknown, setErrors: (errors: FormErrors) => void) {
  if (error instanceof ApiError && error.fields && Object.keys(error.fields).length > 0) {
    setErrors({ fields: error.fields, message: undefined });
  } else {
    setErrors({ fields: {}, message: errorMessage(error) });
  }
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}
