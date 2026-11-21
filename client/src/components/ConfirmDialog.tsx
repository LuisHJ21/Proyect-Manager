import { useEffect, useId, type ReactNode } from 'react';
import { Button } from './ui';

type Props = {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-10">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`min-w-0 w-full rounded-lg bg-surface p-4 shadow-xl sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = 'Confirmar', danger, confirmDisabled, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="mb-6 space-y-3 text-sm text-ink-nav">{children}</div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
