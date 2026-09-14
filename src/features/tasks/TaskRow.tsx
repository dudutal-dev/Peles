import {
  BellRing,
  Building2,
  Calendar,
  CalendarClock,
  CalendarHeart,
  CalendarX2,
  Check,
  CircleCheck,
  Folder,
  Highlighter,
  Hourglass,
  ShieldCheck,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { describeDue, formatShortDate, toISODate } from '../../domain/dates';
import { daysPhrase } from '../../domain/labels';
import type { ContextKind, Task } from '../../domain/types';
import { daysWaiting, needsNudge } from '../../domain/views';
import { useTaskActions } from './useTaskActions';

const CONTEXT_ICON: Record<ContextKind, typeof Folder> = {
  project: Folder,
  contact: Building2,
  meeting: Users,
  event: CalendarHeart,
};

const ICON = 15;

interface TaskRowProps {
  task: Task;
  /** 'waiting' מוסיף את מספר הימים שהפריט תקוע. */
  variant?: 'default' | 'waiting';
  hideOwner?: boolean;
  hideContext?: boolean;
}

function ownerText(task: Task): string {
  if (task.owner.kind === 'director') return 'ראש המינהל';
  return task.owner.name.trim();
}

export function TaskRow({ task, variant = 'default', hideOwner = false, hideContext = false }: TaskRowProps) {
  const { today, openTask } = useApp();
  const { complete, reopen } = useTaskActions();
  const [completing, setCompleting] = useState(false);

  const isDone = task.status === 'done';
  const due = task.dueDate ? describeDue(task.dueDate, today) : null;
  const overdue = !isDone && due?.tone === 'overdue';
  const nudge = needsNudge(task, today);

  const meta: ReactNode[] = [];

  if (isDone && task.completedAt) {
    meta.push(
      <span key="done" className="meta meta-done">
        <CircleCheck size={ICON} aria-hidden="true" />
        הושלמה {formatShortDate(toISODate(new Date(task.completedAt)), today)}
      </span>,
    );
  } else if (due && task.dueDate) {
    const Icon = due.tone === 'overdue' ? CalendarX2 : due.tone === 'today' ? CalendarClock : Calendar;
    const cls = due.tone === 'overdue' ? 'meta meta-overdue' : due.tone === 'today' ? 'meta meta-today' : 'meta';
    meta.push(
      <span key="due" className={cls}>
        <Icon size={ICON} aria-hidden="true" />
        {due.tone === 'later' || due.tone === 'soon' ? `עד ${due.text}` : due.text}
      </span>,
    );
  }

  if (nudge) {
    meta.push(
      <span key="nudge" className="meta meta-nudge">
        <BellRing size={ICON} aria-hidden="true" />
        לנדנד
      </span>,
    );
  }

  if (task.directorAwaits && !isDone) {
    meta.push(
      <span key="director" className="meta meta-director">
        <Highlighter size={ICON} aria-hidden="true" />
        ראש המינהל מחכה
      </span>,
    );
  }

  if (task.urgent && !isDone) {
    meta.push(
      <span key="urgent" className="meta meta-urgent">
        <Zap size={ICON} aria-hidden="true" />
        דחוף
      </span>,
    );
  }

  if (!isDone && task.status === 'verify') {
    meta.push(
      <span key="verify" className="meta">
        <ShieldCheck size={ICON} aria-hidden="true" />
        לוודא
      </span>,
    );
  }

  const owner = ownerText(task);
  if (!hideOwner && task.status === 'waiting' && variant === 'default') {
    meta.push(
      <span key="owner" className="meta">
        <Hourglass size={ICON} aria-hidden="true" />
        {owner ? `ממתין ל${owner}` : 'ממתין לתגובה'}
      </span>,
    );
  } else if (!hideOwner && owner && task.owner.kind !== 'me') {
    meta.push(
      <span key="owner" className="meta">
        <UserRound size={ICON} aria-hidden="true" />
        {owner}
      </span>,
    );
  }

  if (!hideContext && task.context && task.context.label.trim()) {
    const Icon = CONTEXT_ICON[task.context.kind];
    meta.push(
      <span key="ctx" className="meta">
        <Icon size={ICON} aria-hidden="true" />
        {task.context.label}
      </span>,
    );
  }

  for (const tag of task.tags) {
    meta.push(
      <span key={`tag-${tag}`} className="meta meta-tag">
        #{tag}
      </span>,
    );
  }

  const waited = variant === 'waiting' ? daysWaiting(task, today) : 0;
  const stuckLevel = waited >= 14 ? 'very-long' : waited >= 7 ? 'long' : 'normal';

  const onCheck = () => {
    if (isDone) {
      void reopen(task);
      return;
    }
    setCompleting(true);
    // רגע קצר לראות את הסימון לפני שהשורה יוצאת מהרשימה
    window.setTimeout(() => void complete(task), 320);
  };

  const checkLabel = isDone
    ? `החזרה לפתוחות: ${task.title}`
    : task.status === 'waiting'
      ? `סימון שהתקבל: ${task.title}`
      : `סימון כהושלם: ${task.title}`;

  return (
    <div
      className="task-row"
      data-completing={completing}
      data-urgent={task.urgent && !isDone}
    >
      <button
        type="button"
        className="task-check"
        aria-pressed={completing || isDone}
        aria-label={checkLabel}
        data-status={task.status}
        data-overdue={overdue}
        onClick={onCheck}
        disabled={completing}
      >
        <span className="check-ring">
          <Check size={15} strokeWidth={3} aria-hidden="true" />
        </span>
      </button>
      <button type="button" className="task-main" onClick={() => openTask(task.id)}>
        <span className="task-title">
          {task.directorAwaits && !isDone ? <span className="hl">{task.title}</span> : task.title}
        </span>
        {meta.length > 0 && <span className="task-meta">{meta}</span>}
      </button>
      {variant === 'waiting' && (
        <span className="stuck" data-level={stuckLevel} aria-label={`ממתין ${daysPhrase(waited)}`}>
          <b>{waited}</b>
          <small>{waited === 1 ? 'יום' : 'ימים'}</small>
        </span>
      )}
    </div>
  );
}

export function TaskList({ tasks, variant, hideOwner, hideContext }: { tasks: readonly Task[] } & Omit<TaskRowProps, 'task'>) {
  return (
    <div className="panel">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          {...(variant ? { variant } : {})}
          {...(hideOwner ? { hideOwner } : {})}
          {...(hideContext ? { hideContext } : {})}
        />
      ))}
    </div>
  );
}
