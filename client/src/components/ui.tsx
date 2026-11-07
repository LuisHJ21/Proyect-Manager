import { LABELS, type Health } from '@pm/shared';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { avatarColor, initials } from '../lib/display';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'border border-control bg-surface text-ink hover:bg-raised',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  ghost: 'text-ink-nav hover:bg-raised',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  'block w-full rounded-lg border border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-link focus:outline-2 focus:outline-link aria-[invalid=true]:border-risk-fg';

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-nav',
  info: 'bg-info-bg text-info-fg',
  success: 'bg-ok-bg text-ok-fg',
  warning: 'bg-warn-bg text-warn-fg',
  danger: 'bg-risk-bg text-risk-fg',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

const HEALTH_DISPLAY: Record<Health, { tone: Tone; Icon: typeof CircleAlert }> = {
  AT_RISK: { tone: 'danger', Icon: CircleAlert },
  ATTENTION: { tone: 'warning', Icon: TriangleAlert },
  ON_TRACK: { tone: 'success', Icon: CircleCheck },
};

export function HealthBadge({ health }: { health: Health }) {
  const { tone, Icon } = HEALTH_DISPLAY[health];
  return (
    <Badge tone={tone}>
      <Icon size={12} aria-hidden="true" />
      {LABELS.health[health]}
    </Badge>
  );
}

export function ProgressBar({ value, label, color, tone }: { value: number; label?: string; color?: string; tone?: 'warning' }) {
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Avance'} className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${tone === 'warning' ? 'bg-warn-fg' : 'bg-link'}`} style={{ width: `${value}%`, ...(color ? { backgroundColor: color } : {}) }} />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-control p-6 text-center text-sm text-ink-soft">{children}</div>;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-7 w-7 text-[11px]', lg: 'h-8 w-8 text-xs' };
  return (
    <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizes[size]}`} style={{ backgroundColor: avatarColor(name) }}>
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 2 }: { people: { id: string; name: string }[]; max?: number }) {
  if (people.length === 0) return <span className="text-sm text-ink-soft">—</span>;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center" aria-label={`Equipo: ${people.map((p) => p.name).join(', ')}`}>
      {shown.map((person, index) => (
        <span key={person.id} className={`rounded-full border-2 border-surface ${index > 0 ? '-ml-2' : ''}`}>
          <Avatar name={person.name} />
        </span>
      ))}
      {extra > 0 && <span className="-ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-raised text-[11px] font-semibold text-ink-nav">+{extra}</span>}
    </span>
  );
}
