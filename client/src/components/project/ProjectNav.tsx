import type { Section } from '@pm/shared';
import {
  Activity,
  ArrowLeftRight,
  CalendarClock,
  ChartLine,
  FileText,
  Flag,
  House,
  Lightbulb,
  ListChecks,
  Package,
  Paperclip,
  ScrollText,
  ShieldAlert,
  SquareCheckBig,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

type Item = { to: string; label: string; section: Section; Icon: LucideIcon };

/** Las secciones del proyecto agrupadas por área (rediseño de la navegación). */
export const PROJECT_GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Visión general',
    items: [
      { to: 'resumen', label: 'Resumen', section: 'project', Icon: House },
      { to: 'informes', label: 'Informes', section: 'reports', Icon: FileText },
      { to: 'actividad', label: 'Actividad', section: 'activity', Icon: Activity },
    ],
  },
  {
    title: 'Planificación',
    items: [
      { to: 'acta', label: 'Acta', section: 'planning', Icon: ScrollText },
      { to: 'requisitos', label: 'Requisitos', section: 'requirements', Icon: ListChecks },
      { to: 'tareas', label: 'Tareas', section: 'tasks', Icon: SquareCheckBig },
      { to: 'entregables', label: 'Entregables', section: 'deliverables', Icon: Package },
    ],
  },
  {
    title: 'Control',
    items: [
      { to: 'riesgos', label: 'Riesgos', section: 'risks', Icon: ShieldAlert },
      { to: 'incidentes', label: 'Incidentes', section: 'incidents', Icon: Zap },
      { to: 'cambios', label: 'Control de cambios', section: 'changes', Icon: ArrowLeftRight },
      { to: 'presupuesto', label: 'Presupuesto', section: 'budget', Icon: Wallet },
      { to: 'desempeno', label: 'Desempeño', section: 'performance', Icon: ChartLine },
    ],
  },
  {
    title: 'Personas',
    items: [
      { to: 'interesados', label: 'Interesados', section: 'stakeholders', Icon: Users },
      { to: 'reuniones', label: 'Reuniones', section: 'meetings', Icon: CalendarClock },
    ],
  },
  {
    title: 'Cierre',
    items: [
      { to: 'lecciones', label: 'Lecciones', section: 'lessons', Icon: Lightbulb },
      { to: 'anexos', label: 'Anexos', section: 'attachments', Icon: Paperclip },
      { to: 'cierre', label: 'Cierre', section: 'closure', Icon: Flag },
    ],
  },
];

type Props = { canRead: (section: Section) => boolean; overdueTasks: number; compact: boolean };

/** Escritorio: columna con grupos. Móvil (`compact`): una fila con desplazamiento horizontal. */
export function ProjectNav({ canRead, overdueTasks, compact }: Props) {
  const groups = PROJECT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canRead(i.section)) })).filter((g) => g.items.length > 0);
  const badge = (item: Item) =>
    item.to === 'tareas' && overdueTasks > 0 ? (
      <span aria-hidden="true" title={`${overdueTasks} vencidas`} className="ml-auto min-w-6 rounded-full bg-risk-bg px-2 py-0.5 text-center text-xs font-semibold text-risk-fg">
        {overdueTasks}
      </span>
    ) : null;

  if (compact) {
    return (
      <nav aria-label="Secciones del proyecto" data-print-hide className="-mx-4 mb-4 overflow-x-auto border-b border-line px-4">
        <div className="flex w-max gap-1">
          {groups.flatMap((g) => g.items).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap ${isActive ? 'border-link text-link' : 'border-transparent text-ink-soft'}`
              }
            >
              <span data-nav-label>{item.label}</span>
              {badge(item)}
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Secciones del proyecto" data-print-hide className="sticky top-4 flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{group.title}</p>
          {group.items.map(({ Icon, ...item }) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-150 ${isActive ? 'bg-active font-semibold text-ink shadow-[inset_3px_0_0_var(--color-link)]' : 'text-ink-nav hover:bg-raised'}`
              }
            >
              <Icon size={17} aria-hidden="true" />
              <span data-nav-label className="truncate">
                {item.label}
              </span>
              {badge({ Icon, ...item })}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
