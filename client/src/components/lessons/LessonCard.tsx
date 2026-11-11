import { LABELS, localToday } from '@pm/shared';
import { Link } from 'react-router-dom';
import type { Lesson } from '../../api/types';
import { shortDate } from '../../lib/display';
import { Badge, Button } from '../ui';

/** Una lección aprendida. `showProject` enlaza a su proyecto (página global). */
export function LessonCard({ lesson, showProject, onEdit, onDelete }: { lesson: Lesson; showProject?: boolean; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={lesson.type === 'WORKED_WELL' ? 'success' : 'warning'}>{LABELS.lessonType[lesson.type]}</Badge>
        <Badge>{LABELS.lessonCategory[lesson.category]}</Badge>
        {showProject && (
          <Link className="text-sm font-medium text-link hover:underline" to={`/proyectos/${lesson.project.id}/lecciones`}>
            {lesson.project.name}
          </Link>
        )}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-ink-soft">Situación</dt>
          <dd className="whitespace-pre-line text-ink [overflow-wrap:anywhere]">{lesson.situation}</dd>
        </div>
        {lesson.recommendation && (
          <div>
            <dt className="text-xs text-ink-soft">Recomendación</dt>
            <dd className="whitespace-pre-line text-ink [overflow-wrap:anywhere]">{lesson.recommendation}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>{`${lesson.author.name} · ${shortDate(localToday(new Date(lesson.createdAt)))}`}</span>
        {lesson.canEdit && onEdit && (
          <Button variant="ghost" className="ml-auto" onClick={onEdit}>
            Editar
          </Button>
        )}
        {lesson.canEdit && onDelete && (
          <Button variant="ghost" onClick={onDelete}>
            Eliminar
          </Button>
        )}
      </div>
    </article>
  );
}
