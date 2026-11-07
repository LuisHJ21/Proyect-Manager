import { Button } from './ui';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-risk-fg bg-risk-bg p-6 text-center">
      <p className="text-sm text-risk-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function Loading() {
  return (
    <p role="status" className="p-8 text-center text-sm text-ink-soft">
      Cargando…
    </p>
  );
}
