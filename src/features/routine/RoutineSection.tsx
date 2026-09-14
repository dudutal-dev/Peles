import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { href } from '../../app/router';
import { db } from '../../data/db';
import { setRoutineDone } from '../../data/routineRepo';
import { weekStart } from '../../domain/dates';
import { describeRecurrence, routineForDay } from '../../domain/routine';
import type { ISODate } from '../../domain/types';
import { EmptyState, Section } from '../../ui/primitives';

export function RoutineSection({ today }: { today: ISODate }) {
  const items = useLiveQuery(() => db.routineItems.toArray(), []);
  const checks = useLiveQuery(
    () => db.routineChecks.where('periodKey').anyOf([today, `W${weekStart(today)}`]).toArray(),
    [today],
  );
  const [expanded, setExpanded] = useState(false);

  if (!items || !checks) return null;

  const entries = routineForDay(items, checks, today);
  const done = entries.filter((e) => e.done).length;
  const allDone = entries.length > 0 && done === entries.length;
  const pct = entries.length ? Math.round((done / entries.length) * 100) : 0;

  const progress =
    entries.length > 0 ? (
      <span className="progress" aria-label={`${done} מתוך ${entries.length} בוצעו`}>
        <span aria-hidden="true">
          {done}/{entries.length}
        </span>
        <span className="progress-track" aria-hidden="true">
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    ) : undefined;

  return (
    <Section title="שגרת היום" action={progress}>
      {entries.length === 0 ? (
        <div className="panel">
          <EmptyState
            tone="neutral"
            title="אין שגרה קבועה להיום"
            text="פעולות שחוזרות כל יום או כל שבוע יופיעו כאן כל בוקר."
            action={
              <a className="btn btn-quiet" href={href('more')}>
                הגדרת שגרה
              </a>
            }
          />
        </div>
      ) : allDone && !expanded ? (
        <div className="panel">
          <button type="button" className="done-summary" onClick={() => setExpanded(true)} aria-expanded="false">
            <CircleCheck size={20} aria-hidden="true" />
            <span>השגרה של היום הושלמה</span>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="panel">
          {entries.map(({ item, periodKey, done: isDone }) => (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={isDone}
              className="routine-row"
              onClick={() => void setRoutineDone(db, item.id, periodKey, !isDone)}
            >
              <span className="routine-box">
                <span className="check-ring">
                  <Check size={15} strokeWidth={3} aria-hidden="true" />
                </span>
              </span>
              <span className="routine-title">{item.title}</span>
              {item.recurrence.kind === 'weekly' && (
                <span className="routine-freq">{describeRecurrence(item.recurrence)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}
