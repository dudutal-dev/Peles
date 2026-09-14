import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigateAfterSheet } from '../../app/router';
import { db } from '../../data/db';
import { addEvent } from '../../data/eventRepo';
import { formatShortDate } from '../../domain/dates';
import { EVENT_TEMPLATES, daysUntil, eventProgress } from '../../domain/events';
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL, daysPhrase } from '../../domain/labels';
import type { EventType, OrgEvent } from '../../domain/types';
import { BackLink, EntityRow, ProgressBar } from '../../ui/layoutParts';
import { EmptyState, Field, Section } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';

export function countdownText(target: string | null, today: string): string {
  if (!target) return 'בלי תאריך';
  const d = daysUntil(target, today);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d < 0) return `לפני ${daysPhrase(d)}`;
  return `בעוד ${daysPhrase(d)}`;
}

export function EventsScreen() {
  const { events, tasks, today } = useApp();
  const [adding, setAdding] = useState(false);
  const live = events.filter((e) => e.deletedAt === null);
  const planning = live
    .filter((e) => e.status === 'planning')
    .sort((a, b) => (a.targetDate ?? '9999') < (b.targetDate ?? '9999') ? -1 : 1);
  const finished = live.filter((e) => e.status !== 'planning').sort((a, b) => b.updatedAt - a.updatedAt);

  const row = (e: OrgEvent) => {
    const progress = eventProgress(tasks, e.id);
    return (
      <EntityRow
        key={e.id}
        href={href('event', e.id)}
        lead={e.targetDate ? formatShortDate(e.targetDate, today) : '—'}
        title={e.title}
        meta={
          <>
            <span>{EVENT_TYPE_LABEL[e.type]}</span>
            {e.status === 'planning' ? <span>{countdownText(e.targetDate, today)}</span> : <span>{EVENT_STATUS_LABEL[e.status]}</span>}
            {e.expectedAttendees !== null && <span>{e.expectedAttendees} איש</span>}
          </>
        }
        trailing={progress.total > 0 ? <ProgressBar done={progress.done} total={progress.total} label={`${progress.done} מתוך ${progress.total} הושלמו`} /> : undefined}
      />
    );
  };

  return (
    <div className="screen">
      <BackLink href={href('more')} label="עוד" />
      <header className="screen-head">
        <h1 className="screen-title">אירועים</h1>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          אירוע חדש
        </button>
      </header>

      {planning.length === 0 ? (
        <div className="panel">
          <EmptyState
            tone="neutral"
            title="אין אירועים בתכנון"
            text="אירוע חדש נפתח עם רשימת משימות מוכנה לפי הסוג: פרידה, פרישה, כנס, גיבוש ועוד."
          />
        </div>
      ) : (
        <Section title="בתכנון" count={planning.length}>
          <div className="panel">{planning.map(row)}</div>
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="התקיימו או בוטלו">
          <div className="panel">{finished.map(row)}</div>
        </Section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="אירוע חדש">
        <NewEventForm
          onCreated={(id) => {
            setAdding(false);
            navigateAfterSheet(href('event', id));
          }}
        />
      </Sheet>
    </div>
  );
}

const TYPES: EventType[] = ['farewell', 'retirement', 'conference', 'teamBuilding', 'teamEvening', 'recognition', 'funDay', 'onboarding', 'other'];

function NewEventForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { today } = useApp();
  const [type, setType] = useState<EventType>('farewell');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [attendees, setAttendees] = useState('');
  const ids = { title: useId(), date: useId(), attendees: useId() };
  const items = EVENT_TEMPLATES[type].length;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number.parseInt(attendees, 10);
        const event = await addEvent(
          db,
          { type, title, targetDate: date || null, expectedAttendees: Number.isFinite(n) && n > 0 ? n : null },
          today,
        );
        onCreated(event.id);
      }}
    >
      <Field label="סוג האירוע">
        <div className="type-grid" role="radiogroup" aria-label="סוג האירוע">
          {TYPES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className="type-option" onClick={() => setType(t)}>
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="שם האירוע" htmlFor={ids.title}>
        <input id={ids.title} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'farewell' ? 'למשל: פרידה מרפי' : EVENT_TYPE_LABEL[type]} />
      </Field>
      <div className="two-col">
        <Field label="תאריך" htmlFor={ids.date}>
          <input id={ids.date} type="date" className="input" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="משתתפים (הערכה)" htmlFor={ids.attendees}>
          <input id={ids.attendees} type="number" inputMode="numeric" min={1} className="input" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="40" />
        </Field>
      </div>
      <p className="field-hint" style={{ marginBlockEnd: 12 }}>
        {items > 0
          ? `ייפתח עם ${items} משימות מוכנות${date ? ', כל אחת עם תאריך יעד לפני האירוע' : ''}. אפשר לערוך, למחוק ולהוסיף.`
          : 'ייפתח בלי רשימה מוכנה. אפשר להוסיף משימות בעצמך.'}
      </p>
      <div className="sheet-foot sheet-foot-sticky">
        <button type="submit" className="btn btn-primary">
          יצירת אירוע
        </button>
      </div>
    </form>
  );
}
