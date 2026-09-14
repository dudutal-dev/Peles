import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  CalendarHeart,
  Check,
  Folder,
  Highlighter,
  Minus,
  Plus,
  Trash2,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigateAfterSheet } from '../../app/router';
import { normalizeName } from '../../domain/contacts';
import { db } from '../../data/db';
import { updateTask } from '../../data/taskRepo';
import { addDays, daysSince, endOfWorkWeek, formatShortDate, startOfNextWeek, toISODate } from '../../domain/dates';
import {
  CONTEXT_LABEL,
  CONTEXT_SHORT_LABEL,
  OWNER_LABEL,
  SOURCE_LABEL,
  STATUS_SHORT_LABEL,
  daysPhrase,
} from '../../domain/labels';
import type { TaskPatch } from '../../domain/task';
import type { ContextKind, OwnerKind, SourceKind, Task, TaskStatus } from '../../domain/types';
import { knownValues } from '../../domain/views';
import { Field, Segmented } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { useTaskActions } from './useTaskActions';

interface TaskSheetProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskSheet({ taskId, onClose }: TaskSheetProps) {
  const [savedAt, setSavedAt] = useState(0);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!savedAt) return;
    setShowSaved(true);
    const t = window.setTimeout(() => setShowSaved(false), 1600);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onSaved = useCallback(() => setSavedAt(Date.now()), []);

  return (
    <Sheet
      open={taskId !== null}
      onClose={onClose}
      title="פרטי משימה"
      headerExtra={
        <span className="save-state" data-visible={showSaved} aria-live="polite">
          {showSaved && (
            <>
              <Check size={15} aria-hidden="true" />
              נשמר
            </>
          )}
        </span>
      }
    >
      {taskId && <TaskLoader id={taskId} onSaved={onSaved} onClose={onClose} />}
    </Sheet>
  );
}

function TaskLoader({ id, onSaved, onClose }: { id: string; onSaved: () => void; onClose: () => void }) {
  const result = useLiveQuery(async () => (await db.tasks.get(id)) ?? 'missing', [id], null);

  useEffect(() => {
    if (result === 'missing' || (result && result.deletedAt !== null)) onClose();
  }, [result, onClose]);

  if (result === null || result === 'missing' || result.deletedAt !== null) return null;
  return <TaskForm key={id} task={result} onSaved={onSaved} onClose={onClose} />;
}

/** שמירה אוטומטית: שינויים בטקסט נשמרים 400ms אחרי ההקלדה, כל השאר מיד. */
function usePatchSaver(id: string, onSaved: () => void) {
  const pending = useRef<TaskPatch>({});
  const timer = useRef<number | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    await updateTask(db, id, patch);
    onSavedRef.current();
  }, [id]);

  const patch = useCallback(
    (p: TaskPatch, debounce = false) => {
      pending.current = { ...pending.current, ...p, inbox: false };
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (debounce) {
        timer.current = window.setTimeout(() => void flush(), 400);
      } else {
        void flush();
      }
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  return { patch, flush };
}

const STATUS_OPTIONS = (['todo', 'waiting', 'verify', 'done'] as const).map((value) => ({
  value,
  label: STATUS_SHORT_LABEL[value],
}));
const OWNER_OPTIONS = (['me', 'director', 'external'] as const).map((value) => ({ value, label: OWNER_LABEL[value] }));
const CONTEXT_OPTIONS = (['project', 'contact', 'meeting', 'event'] as const).map((value) => ({
  value,
  label: CONTEXT_SHORT_LABEL[value],
}));
const SOURCE_OPTIONS = (['direct', 'self', 'meeting'] as const).map((value) => ({ value, label: SOURCE_LABEL[value] }));

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = normalizeName(v);
    if (!v.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findByName<T extends { deletedAt: number | null }>(list: readonly T[], name: string, getName: (item: T) => string): T | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  return list.find((item) => item.deletedAt === null && normalizeName(getName(item)) === key);
}

interface LinkedEntityProps {
  icon: LucideIcon;
  kindLabel: string;
  title: string;
  onOpen: () => void;
  onUnlink?: () => void;
}

function LinkedEntity({ icon: Icon, kindLabel, title, onOpen, onUnlink }: LinkedEntityProps) {
  return (
    <div className="linked-entity">
      <Icon size={20} aria-hidden="true" />
      <div className="linked-entity-text">
        <p className="linked-entity-kind">{kindLabel}</p>
        <p className="linked-entity-title">{title}</p>
      </div>
      <button type="button" className="btn btn-quiet" onClick={onOpen}>
        פתיחה
      </button>
      {onUnlink && (
        <button type="button" className="icon-btn" aria-label={`ניתוק הקישור ל${title}`} onClick={onUnlink}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const CONTEXT_ICONS: Record<ContextKind, LucideIcon> = {
  project: Folder,
  contact: Building2,
  meeting: Users,
  event: CalendarHeart,
};

function TaskForm({ task, onSaved, onClose }: { task: Task; onSaved: () => void; onClose: () => void }) {
  const { today, tasks, meetings, events, contacts, index } = useApp();
  const liveMeetings = meetings.filter((m) => m.deletedAt === null);
  const liveEvents = events.filter((e) => e.deletedAt === null);
  const liveContacts = contacts.filter((c) => c.deletedAt === null);

  const openEntity = (target: string) => {
    onClose();
    navigateAfterSheet(target);
  };

  const linkedContext = (() => {
    const ctx = task.context;
    if (!ctx?.refId) return null;
    const entity =
      ctx.kind === 'meeting' ? index.meetings.get(ctx.refId) : ctx.kind === 'event' ? index.events.get(ctx.refId) : ctx.kind === 'contact' ? index.contacts.get(ctx.refId) : undefined;
    if (!entity || entity.deletedAt !== null) return null;
    const screen = ctx.kind === 'meeting' ? 'meeting' : ctx.kind === 'event' ? 'event' : 'contact';
    return {
      kind: ctx.kind,
      icon: CONTEXT_ICONS[ctx.kind],
      title: 'title' in entity ? entity.title : entity.name,
      href: href(screen, ctx.refId),
    };
  })();

  const sourceMeeting = (() => {
    if (task.source.kind !== 'meeting' || !task.source.refId) return null;
    const m = index.meetings.get(task.source.refId);
    return m && m.deletedAt === null ? m : null;
  })();
  const { remove } = useTaskActions();
  const { patch, flush } = usePatchSaver(task.id, onSaved);
  const ids = {
    title: useId(),
    owner: useId(),
    ownersList: useId(),
    due: useId(),
    context: useId(),
    contextList: useId(),
    source: useId(),
    sourceList: useId(),
    tag: useId(),
    tagList: useId(),
    notes: useId(),
  };

  // טיוטות לשדות טקסט, כדי שעדכון מהמסד לא יקפיץ את הסמן באמצע הקלדה
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [ownerName, setOwnerName] = useState(task.owner.name);
  const [contextKind, setContextKind] = useState<ContextKind>(task.context?.kind ?? 'project');
  const [contextLabel, setContextLabel] = useState(task.context?.label ?? '');
  const [sourceLabel, setSourceLabel] = useState(task.source.label);
  const [tagDraft, setTagDraft] = useState('');

  const known = knownValues(tasks);

  const contextSuggestions: Record<ContextKind, string[]> = {
    project: known.contexts.project,
    contact: unique([...liveContacts.map((c) => c.name), ...known.contexts.contact]),
    meeting: unique([...liveMeetings.map((m) => m.title), ...known.contexts.meeting]),
    event: unique([...liveEvents.map((e) => e.title), ...known.contexts.event]),
  };

  /** שם שתואם ישות שמורה (גורם, ישיבה, אירוע) מקשר אליה אוטומטית. */
  const setContext = (kind: ContextKind, label: string) => {
    const clean = label.trim();
    if (!clean) {
      patch({ context: null }, true);
      return;
    }
    const match =
      kind === 'contact'
        ? findByName(liveContacts, clean, (c) => c.name)
        : kind === 'meeting'
          ? findByName(liveMeetings, clean, (m) => m.title)
          : kind === 'event'
            ? findByName(liveEvents, clean, (e) => e.title)
            : undefined;
    patch({ context: { kind, label: clean, refId: match?.id ?? null } }, true);
  };

  const addTag = () => {
    const tag = tagDraft.replace(/^#/, '').trim();
    if (!tag) return;
    patch({ tags: [...task.tags, tag] });
    setTagDraft('');
  };

  const dueChips: Array<{ label: string; value: string | null }> = [
    { label: 'היום', value: today },
    { label: 'מחר', value: addDays(today, 1) },
    { label: 'סוף השבוע', value: endOfWorkWeek(today) },
    { label: 'שבוע הבא', value: startOfNextWeek(today) },
  ];

  const waitingDays = daysSince(task.statusChangedAt, today);

  return (
    <div>
      {task.inbox && (
        <div className="inbox-note">
          <span>נקלטה בקליטה מהירה. אפשר להשלים פרטים, או להשאיר כמו שהיא.</span>
          <button type="button" className="btn btn-quiet" onClick={() => patch({})}>
            סיום מיון
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor={ids.title} className="visually-hidden">
          כותרת
        </label>
        <textarea
          id={ids.title}
          className="textarea title-input"
          rows={1}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) patch({ title: e.target.value }, true);
          }}
          onBlur={() => {
            if (!title.trim()) setTitle(task.title);
            void flush();
          }}
        />
      </div>

      <Field label="סטטוס">
        <Segmented<TaskStatus> label="סטטוס" value={task.status} options={STATUS_OPTIONS} onChange={(v) => patch({ status: v })} />
      </Field>

      <Field label="באחריות">
        <Segmented<OwnerKind>
          label="באחריות"
          value={task.owner.kind}
          options={OWNER_OPTIONS}
          onChange={(kind) => patch({ owner: { kind, name: kind === 'external' ? ownerName : '' } })}
        />
        {task.owner.kind === 'external' && (
          <div className="input-row">
            <label htmlFor={ids.owner} className="visually-hidden">
              שם הגורם
            </label>
            <input
              id={ids.owner}
              className="input"
              placeholder="שם הגורם (קבלן, מחוז, יועץ)"
              list={ids.ownersList}
              value={ownerName}
              onChange={(e) => {
                setOwnerName(e.target.value);
                patch({ owner: { kind: 'external', name: e.target.value.trim() } }, true);
              }}
              onBlur={() => void flush()}
            />
            <datalist id={ids.ownersList}>
              {unique([...liveContacts.map((c) => c.name), ...known.owners]).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
        )}
      </Field>

      <Field label="תאריך יעד" htmlFor={ids.due}>
        <div className="chips">
          {dueChips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="chip"
              aria-pressed={task.dueDate === c.value}
              onClick={() => patch({ dueDate: c.value })}
            >
              {c.label}
            </button>
          ))}
          {task.dueDate && (
            <button type="button" className="chip" onClick={() => patch({ dueDate: null })}>
              <X size={15} aria-hidden="true" />
              בלי תאריך
            </button>
          )}
        </div>
        <div className="input-row">
          <input
            id={ids.due}
            type="date"
            className="input"
            value={task.dueDate ?? ''}
            onChange={(e) => patch({ dueDate: e.target.value || null })}
          />
        </div>
      </Field>

      {task.status === 'waiting' && (
        <Field
          label="תזכורת"
          hint={task.dueDate ? 'הפריט יסומן "לנדנד" במסך הבוקר וברשימת הממתינים.' : 'כדי לקבל תזכורת צריך לקבוע תאריך יעד.'}
        >
          <div className="reminder-line">
            <span>להתחיל להתריע</span>
            <span className="stepper">
              <button
                type="button"
                className="icon-btn"
                aria-label="פחות ימים"
                disabled={task.reminder.daysBefore <= 0}
                onClick={() => patch({ reminder: { ...task.reminder, daysBefore: task.reminder.daysBefore - 1 } })}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <output aria-live="polite">{task.reminder.daysBefore}</output>
              <button
                type="button"
                className="icon-btn"
                aria-label="יותר ימים"
                disabled={task.reminder.daysBefore >= 14}
                onClick={() => patch({ reminder: { ...task.reminder, daysBefore: task.reminder.daysBefore + 1 } })}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </span>
            <span>ימים לפני המועד</span>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={task.reminder.repeatDailyWhenOverdue}
              onChange={(e) => patch({ reminder: { ...task.reminder, repeatDailyWhenOverdue: e.target.checked } })}
            />
            אם המועד עבר ועדיין אין תשובה, להמשיך להתריע כל יום
          </label>
        </Field>
      )}

      <Field label="סימון">
        <div className="chips">
          <button type="button" className="chip" aria-pressed={task.urgent} onClick={() => patch({ urgent: !task.urgent })}>
            <Zap size={16} aria-hidden="true" />
            דחוף לי
          </button>
          <button
            type="button"
            className="chip"
            data-kind="director"
            aria-pressed={task.directorAwaits}
            onClick={() => patch({ directorAwaits: !task.directorAwaits })}
          >
            <Highlighter size={16} aria-hidden="true" />
            ראש המינהל מחכה
          </button>
        </div>
      </Field>

      <Field label="הקשר">
        {linkedContext ? (
          <LinkedEntity
            icon={linkedContext.icon}
            kindLabel={CONTEXT_LABEL[linkedContext.kind]}
            title={linkedContext.title}
            onOpen={() => openEntity(linkedContext.href)}
            onUnlink={() => {
              setContextLabel('');
              patch({ context: null });
            }}
          />
        ) : (
          <>
        <Segmented<ContextKind>
          label="סוג ההקשר"
          value={contextKind}
          options={CONTEXT_OPTIONS}
          onChange={(kind) => {
            setContextKind(kind);
            if (contextLabel.trim()) setContext(kind, contextLabel);
          }}
        />
        <div className="input-row">
          <label htmlFor={ids.context} className="visually-hidden">
            שם ה{CONTEXT_LABEL[contextKind]}
          </label>
          <input
            id={ids.context}
            className="input"
            placeholder={
              contextKind === 'contact'
                ? 'למשל: קבלן כהן, מחוז דרום'
                : contextKind === 'project'
                  ? 'פרויקט או נושא, למשל: מרפאת חולון'
                  : `שם ה${CONTEXT_LABEL[contextKind]}`
            }
            list={ids.contextList}
            value={contextLabel}
            onChange={(e) => {
              setContextLabel(e.target.value);
              setContext(contextKind, e.target.value);
            }}
            onBlur={() => void flush()}
          />
          <datalist id={ids.contextList}>
            {contextSuggestions[contextKind].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
          </>
        )}
      </Field>

      <Field label="מקור">
        {sourceMeeting && (
          <LinkedEntity
            icon={Users}
            kindLabel="מתוך ישיבה"
            title={sourceMeeting.title}
            onOpen={() => openEntity(href('meeting', sourceMeeting.id))}
          />
        )}
        {!sourceMeeting && (
        <Segmented<SourceKind>
          label="מקור"
          value={task.source.kind}
          options={SOURCE_OPTIONS}
          onChange={(kind) => patch({ source: { kind, label: kind === 'meeting' ? sourceLabel.trim() : '', refId: null } })}
        />
        )}
        {!sourceMeeting && task.source.kind === 'meeting' && (
          <div className="input-row">
            <label htmlFor={ids.source} className="visually-hidden">
              איזו ישיבה
            </label>
            <input
              id={ids.source}
              className="input"
              placeholder="איזו ישיבה?"
              list={ids.sourceList}
              value={sourceLabel}
              onChange={(e) => {
                setSourceLabel(e.target.value);
                const match = findByName(meetings, e.target.value, (m) => m.title);
                patch({ source: { kind: 'meeting', label: e.target.value.trim(), refId: match?.id ?? null } }, true);
              }}
              onBlur={() => void flush()}
            />
            <datalist id={ids.sourceList}>
              {unique([...liveMeetings.map((m) => m.title), ...known.meetings]).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        )}
      </Field>

      <Field label="תגיות" htmlFor={ids.tag}>
        {task.tags.length > 0 && (
          <div className="chips" style={{ marginBlockEnd: 8 }}>
            {task.tags.map((tag) => (
              <span key={tag} className="chip chip-detected">
                #{tag}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`הסרת התגית ${tag}`}
                  onClick={() => patch({ tags: task.tags.filter((t) => t !== tag) })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="input-row" style={{ marginBlockStart: 0 }}>
          <input
            id={ids.tag}
            className="input"
            placeholder="מחוז, נושא, קבלן..."
            list={ids.tagList}
            value={tagDraft}
            enterKeyHint="enter"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={addTag} disabled={!tagDraft.trim()}>
            הוספה
          </button>
          <datalist id={ids.tagList}>
            {known.tags
              .filter((t) => !task.tags.includes(t))
              .map((t) => (
                <option key={t} value={t} />
              ))}
          </datalist>
        </div>
      </Field>

      <Field label="הערות" htmlFor={ids.notes}>
        <textarea
          id={ids.notes}
          className="textarea"
          value={notes}
          placeholder="פרטים, מספרי טלפון, מה סוכם"
          onChange={(e) => {
            setNotes(e.target.value);
            patch({ notes: e.target.value }, true);
          }}
          onBlur={() => void flush()}
        />
      </Field>

      <p className="task-footnote">
        נוצרה {formatShortDate(toISODate(new Date(task.createdAt)), today)}.
        {task.status === 'waiting' && ` ממתין ${waitingDays === 0 ? 'מהיום' : daysPhrase(waitingDays)}.`}
        {task.status === 'done' && task.completedAt && ` הושלמה ${formatShortDate(toISODate(new Date(task.completedAt)), today)}.`}
      </p>

      <button
        type="button"
        className="btn btn-danger btn-block"
        onClick={async () => {
          await flush();
          onClose();
          await remove(task);
        }}
      >
        <Trash2 size={18} aria-hidden="true" />
        מחיקת המשימה
      </button>
    </div>
  );
}
