import { CalendarDays, ListPlus, Plus, Trash2, Users } from 'lucide-react';
import { useId, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigate } from '../../app/router';
import { db } from '../../data/db';
import { addEventItem, addEventItems, deleteEvent, restoreEvent, updateEvent } from '../../data/eventRepo';
import {
  PLANNED_ATTENDANCE,
  budgetSummary,
  eventProgress,
  eventTasks,
  formatShekels,
  missingTemplateItems,
} from '../../domain/events';
import {
  BUDGET_MODEL_LABEL,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  VENUE_LABEL,
  countPhrase,
} from '../../domain/labels';
import type { BudgetModel, EventBudget, EventStatus, OrgEvent, VenueKind } from '../../domain/types';
import { useDraft } from '../../hooks/useDraft';
import { BackLink, NotFound, ProgressBar } from '../../ui/layoutParts';
import { EmptyState, Field, Section, Segmented } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { TaskList } from '../tasks/TaskRow';
import { countdownText } from './EventsScreen';

export function EventScreen({ id }: { id: string }) {
  const { events } = useApp();
  const event = events.find((e) => e.id === id);
  if (!event || event.deletedAt !== null) {
    return <NotFound backHref={href('events')} backLabel="אירועים" text="האירוע לא נמצא. ייתכן שנמחק." />;
  }
  return <EventDetail key={event.id} event={event} />;
}

function EventDetail({ event }: { event: OrgEvent }) {
  const { tasks, today } = useApp();
  const toast = useToast();
  const [newItem, setNewItem] = useState('');
  const ids = { title: useId(), date: useId(), attendees: useId(), newItem: useId(), notes: useId() };

  const title = useDraft(event.title, (v) => v.trim() && updateEvent(db, event.id, { title: v.trim() }));
  const notes = useDraft(event.notes, (v) => updateEvent(db, event.id, { notes: v }));
  const attendees = useDraft(event.expectedAttendees?.toString() ?? '', (v) => {
    const n = Number.parseInt(v, 10);
    return updateEvent(db, event.id, { expectedAttendees: Number.isFinite(n) && n > 0 ? n : null });
  });

  const items = eventTasks(tasks, event.id);
  const progress = eventProgress(tasks, event.id);
  const missing = missingTemplateItems(event, tasks);

  const addItem = async () => {
    if (!newItem.trim()) return;
    await addEventItem(db, event, newItem.trim());
    setNewItem('');
  };

  return (
    <div className="screen">
      <BackLink href={href('events')} label="אירועים" />

      <div className="field" style={{ marginBlockStart: 4 }}>
        <label htmlFor={ids.title} className="visually-hidden">
          שם האירוע
        </label>
        <input
          id={ids.title}
          className="input title-input detail-title"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={() => {
            if (!title.value.trim()) title.setValue(event.title);
            title.flush();
          }}
        />
        <div className="info-line">
          <span>{EVENT_TYPE_LABEL[event.type]}</span>
          <span className="meta">
            <CalendarDays size={16} aria-hidden="true" />
            {countdownText(event.targetDate, today)}
          </span>
          {progress.total > 0 && (
            <ProgressBar done={progress.done} total={progress.total} label={`${progress.done} מתוך ${progress.total} הושלמו`} />
          )}
        </div>
      </div>

      <div className="two-col">
        <Field label="תאריך" htmlFor={ids.date}>
          <input
            id={ids.date}
            type="date"
            className="input"
            value={event.targetDate ?? ''}
            onChange={async (e) => {
              const next = e.target.value || null;
              const shifted = await updateEvent(db, event.id, { targetDate: next });
              if (shifted > 0) toast({ message: `תאריכי ${countPhrase(shifted, 'משימה אחת', 'משימות')} עודכנו בהתאם` });
            }}
          />
        </Field>
        <Field label="משתתפים (הערכה)" htmlFor={ids.attendees}>
          <input
            id={ids.attendees}
            type="number"
            inputMode="numeric"
            min={1}
            className="input"
            value={attendees.value}
            onChange={(e) => attendees.onChange(e.target.value)}
            onBlur={attendees.flush}
          />
        </Field>
      </div>

      <Section title="משימות האירוע" count={items.length}>
        {items.length === 0 ? (
          <div className="panel">
            <EmptyState tone="neutral" title="אין עדיין משימות" text="אפשר להוסיף משימה למטה, או לטעון את הרשימה המוכנה לסוג האירוע." />
          </div>
        ) : (
          <TaskList tasks={items} hideContext />
        )}
        <form
          className="input-row"
          onSubmit={(e) => {
            e.preventDefault();
            void addItem();
          }}
        >
          <label htmlFor={ids.newItem} className="visually-hidden">
            משימה חדשה לאירוע
          </label>
          <input id={ids.newItem} className="input" placeholder="משימה נוספת, למשל: להזמין בלונים" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!newItem.trim()} aria-label="הוספת משימה לאירוע">
            <Plus size={18} aria-hidden="true" />
          </button>
        </form>
        {missing.length > 0 && (
          <button
            type="button"
            className="btn btn-quiet"
            style={{ marginBlockStart: 6 }}
            onClick={() => void addEventItems(db, event, missing, today)}
          >
            <ListPlus size={18} aria-hidden="true" />
            {items.length === 0 ? `טעינת ${missing.length} משימות מוכנות ל${EVENT_TYPE_LABEL[event.type]}` : `הוספת ${countPhrase(missing.length, 'פריט חסר', 'פריטים חסרים')} מהרשימה המוכנה`}
          </button>
        )}
      </Section>

      <BudgetSection event={event} />

      <Section title="מקום">
        <Segmented<VenueKind>
          label="סוג המקום"
          value={event.venue}
          onChange={(venue) => void updateEvent(db, event.id, { venue })}
          options={(['undecided', 'internal', 'external'] as const).map((v) => ({ value: v, label: VENUE_LABEL[v] }))}
        />
        <p className="field-hint">
          {event.venue === 'internal'
            ? 'אולם, חדר ישיבות או גינה במתקן של כללית: חוסך את עלות המקום ומפנה תקציב לאוכל, למתנה או לפעילות.'
            : event.venue === 'external'
              ? 'מסעדה, אולם או אתר: יוצאים מהשגרה, אבל שכירת המקום יכולה לעלות 2,000–15,000 ₪.'
              : 'מקום פנימי ללא עלות חוסך אלפי שקלים; מקום חיצוני נותן תחושת אירוע. כדאי להשוות לפני שמחליטים.'}
        </p>
      </Section>

      <Section title="סטטוס">
        <Segmented<EventStatus>
          label="סטטוס האירוע"
          value={event.status}
          onChange={(status) => void updateEvent(db, event.id, { status })}
          options={(['planning', 'done', 'cancelled'] as const).map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] }))}
        />
      </Section>

      <Section title="הערות">
        <label htmlFor={ids.notes} className="visually-hidden">
          הערות לאירוע
        </label>
        <textarea id={ids.notes} className="textarea" placeholder="ספקים, מחירים שקיבלתי, רעיונות" value={notes.value} onChange={(e) => notes.onChange(e.target.value)} onBlur={notes.flush} />
      </Section>

      <button
        type="button"
        className="btn btn-danger btn-block"
        style={{ marginBlockStart: 28 }}
        onClick={async () => {
          await deleteEvent(db, event.id);
          navigate(href('events'));
          toast({ message: 'האירוע ומשימותיו נמחקו', actionLabel: 'ביטול', onAction: () => void restoreEvent(db, event.id) });
        }}
      >
        <Trash2 size={18} aria-hidden="true" />
        מחיקת האירוע
      </button>
    </div>
  );
}

function numberOrNull(v: string): number | null {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** תקציב לפי שלושת המודלים של הסקיל: לראש, סכום כולל, או משולב (ארגון + השתתפות עצמית). */
function BudgetSection({ event }: { event: OrgEvent }) {
  const ids = { a: useId(), b: useId() };
  const b = event.budget;
  const summary = budgetSummary(event);

  const save = (patch: Partial<EventBudget>) => void updateEvent(db, event.id, { budget: { ...b, ...patch } });
  const perHead = useDraft(b.perHead?.toString() ?? '', (v) => save({ perHead: numberOrNull(v) }));
  const total = useDraft(b.total?.toString() ?? '', (v) => save({ total: numberOrNull(v) }));
  const org = useDraft(b.orgShare?.toString() ?? '', (v) => save({ orgShare: numberOrNull(v) }));
  const self = useDraft(b.selfShare?.toString() ?? '', (v) => save({ selfShare: numberOrNull(v) }));

  const moneyInput = (id: string, label: string, draft: ReturnType<typeof useDraft>) => (
    <Field label={label} htmlFor={id}>
      <input id={id} type="number" inputMode="decimal" min={0} className="input" value={draft.value} onChange={(e) => draft.onChange(e.target.value)} onBlur={draft.flush} />
    </Field>
  );

  return (
    <Section title="תקציב">
      <Segmented<BudgetModel>
        label="מודל התקציב"
        value={b.model}
        onChange={(model) => save({ model })}
        options={(['none', 'perHead', 'lumpSum', 'combined'] as const).map((m) => ({ value: m, label: BUDGET_MODEL_LABEL[m] }))}
      />
      {b.model !== 'none' && (
        <div className="panel" style={{ marginBlockStart: 10 }}>
          <div className="stack">
            {b.model === 'perHead' && moneyInput(ids.a, 'סכום לכל משתתף (₪)', perHead)}
            {b.model === 'lumpSum' && moneyInput(ids.a, 'סכום כולל לאירוע (₪)', total)}
            {b.model === 'combined' && (
              <div className="two-col">
                {moneyInput(ids.a, 'חלק הארגון לראש (₪)', org)}
                {moneyInput(ids.b, 'השתתפות עצמית לראש (₪)', self)}
              </div>
            )}

            <div className="budget-lines">
              {summary.planned === null ? (
                <p className="field-hint">כדי לחשב, צריך להזין מספר משתתפים משוער.</p>
              ) : (
                <>
                  <p className="budget-line">
                    <span>
                      <Users size={15} aria-hidden="true" /> תכנון ל-{Math.round(PLANNED_ATTENDANCE * 100)}% הגעה
                    </span>
                    <b className="num">{summary.planned} איש</b>
                  </p>
                  {summary.perHead !== null && (
                    <p className="budget-line">
                      <span>לכל משתתף</span>
                      <b className="num">{formatShekels(summary.perHead)}</b>
                    </p>
                  )}
                  {b.model === 'combined' && summary.orgPerHead !== null && summary.planned !== null && (
                    <p className="budget-line">
                      <span>חלק הארגון, סה"כ</span>
                      <b className="num">{formatShekels(summary.orgPerHead * summary.planned)}</b>
                    </p>
                  )}
                  {summary.total !== null && (
                    <p className="budget-line budget-total">
                      <span>תקציב כולל לתכנון</span>
                      <b className="num">{formatShekels(summary.total)}</b>
                    </p>
                  )}
                </>
              )}
            </div>
            <p className="field-hint">
              מומלץ להשאיר 5–10% רזרבה. מחיר סופי נסגר תמיד בהצעת מחיר מהספק.
              {b.model === 'combined' && ' השתתפות עצמית גבוהה מורידה הגעה; כדאי לשמור אותה נמוכה.'}
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}
