import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronUp, Download, HardDrive, Plus, Smartphone, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { backupFileName, exportBackup, restoreBackup, validateBackup } from '../data/backup';
import { db } from '../data/db';
import { getMeta, setMeta } from '../data/meta';
import {
  addRoutineItem,
  deleteRoutineItem,
  moveRoutineItem,
  restoreRoutineItem,
  updateRoutineItem,
} from '../data/routineRepo';
import { formatShortDate, todayISO, toISODate } from '../domain/dates';
import { ALL_WEEKDAYS, WEEKDAY_LETTERS, WEEKDAY_NAMES, WORK_WEEK } from '../domain/labels';
import { describeRecurrence } from '../domain/routine';
import type { RoutineItem, Weekday } from '../domain/types';
import {
  canPromptInstall,
  getStorageStatus,
  isIOS,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
  requestPersistentStorage,
  type StorageStatus,
} from '../pwa/pwa';
import { href } from '../app/router';
import { NotificationsPanel } from '../features/notifications/NotificationsPanel';
import { BackLink } from '../ui/layoutParts';
import { Section } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export function SettingsScreen() {
  return (
    <div className="screen">
      <BackLink href={href('more')} label="עוד" />
      <header className="screen-head">
        <h1 className="screen-title">הגדרות וגיבוי</h1>
      </header>
      <NotificationsPanel />
      <RoutineEditor />
      <BackupPanel />
      <DevicePanel />
      <p className="screen-sub" style={{ marginBlock: '28px 8px', textAlign: 'center' }}>
        פלס, גרסה {__APP_VERSION__} ({__BUILD_ID__}). הנתונים נשמרים במכשיר הזה בלבד.
      </p>
    </div>
  );
}

/* ——— שגרה ——— */

function RoutineEditor() {
  const items = useLiveQuery(() => db.routineItems.orderBy('order').toArray(), []);
  const [newTitle, setNewTitle] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const newId = useId();
  const toast = useToast();

  if (!items) return null;
  const active = items.filter((i) => i.deletedAt === null);

  const add = async () => {
    if (!newTitle.trim()) return;
    await addRoutineItem(db, newTitle);
    setNewTitle('');
  };

  return (
    <Section title="שגרת הבוקר">
      <p className="prose" style={{ marginBlockEnd: 10 }}>
        פעולות קבועות שמופיעות כל בוקר ברשימת "שגרת היום". הסימון מתאפס לבד: פריט יומי כל יום, פריט שבועי כל יום ראשון.
      </p>
      <div className="panel">
        {active.map((item, index) => (
          <RoutineItemEditor
            key={item.id}
            item={item}
            expanded={openId === item.id}
            onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
            isFirst={index === 0}
            isLast={index === active.length - 1}
            onDelete={async () => {
              await deleteRoutineItem(db, item.id);
              toast({
                message: 'הפריט הוסר מהשגרה',
                actionLabel: 'ביטול',
                onAction: () => void restoreRoutineItem(db, item.id),
              });
            }}
          />
        ))}
        <form
          className="settings-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label htmlFor={newId} className="visually-hidden">
            פריט שגרה חדש
          </label>
          <input
            id={newId}
            className="input settings-text"
            placeholder="פריט חדש, למשל: לבדוק דואר דחוף"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button type="submit" className="icon-btn" aria-label="הוספה לשגרה" disabled={!newTitle.trim()}>
            <Plus size={22} aria-hidden="true" />
          </button>
        </form>
      </div>
    </Section>
  );
}

interface RoutineItemEditorProps {
  item: RoutineItem;
  expanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
  onDelete: () => void;
}

function RoutineItemEditor({ item, expanded, onToggle, isFirst, isLast, onDelete }: RoutineItemEditorProps) {
  const [title, setTitle] = useState(item.title);
  const inputId = useId();
  const daysId = useId();
  const recurrence = item.recurrence;
  const selectedDays: Weekday[] = recurrence.kind === 'days' ? recurrence.days : [];

  const toggleDay = (d: Weekday) => {
    const next = selectedDays.includes(d) ? selectedDays.filter((x) => x !== d) : [...selectedDays, d].sort();
    void updateRoutineItem(db, item.id, { recurrence: { kind: 'days', days: next } });
  };

  return (
    <div className="routine-edit">
      <div className="routine-edit-top">
        <label htmlFor={inputId} className="visually-hidden">
          שם הפריט
        </label>
        <input
          id={inputId}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== item.title) void updateRoutineItem(db, item.id, { title: title.trim() });
            else setTitle(item.title);
          }}
        />
        <button type="button" className="btn btn-quiet" onClick={onToggle} aria-expanded={expanded} aria-controls={daysId}>
          {describeRecurrence(recurrence)}
        </button>
      </div>
      {expanded && (
        <div id={daysId}>
          <div className="day-picker" role="group" aria-label="באילו ימים">
            {ALL_WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                className="day-toggle"
                aria-pressed={recurrence.kind === 'days' && selectedDays.includes(d)}
                aria-label={`יום ${WEEKDAY_NAMES[d]}`}
                onClick={() => toggleDay(d)}
              >
                {WEEKDAY_LETTERS[d]}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginBlockStart: 10 }}>
            <button
              type="button"
              className="chip"
              aria-pressed={recurrence.kind === 'days' && describeRecurrence(recurrence) === 'כל יום עבודה'}
              onClick={() => void updateRoutineItem(db, item.id, { recurrence: { kind: 'days', days: [...WORK_WEEK] } })}
            >
              ימי עבודה
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={recurrence.kind === 'weekly'}
              onClick={() => void updateRoutineItem(db, item.id, { recurrence: { kind: 'weekly' } })}
            >
              פעם בשבוע
            </button>
          </div>
          <div className="chips" style={{ marginBlockStart: 10 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="הזזה למעלה"
              disabled={isFirst}
              onClick={() => void moveRoutineItem(db, item.id, -1)}
            >
              <ChevronUp size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="הזזה למטה"
              disabled={isLast}
              onClick={() => void moveRoutineItem(db, item.id, 1)}
            >
              <ChevronDown size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-quiet" style={{ color: 'var(--danger)', marginInlineStart: 'auto' }} onClick={onDelete}>
              <Trash2 size={17} aria-hidden="true" />
              הסרה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ——— גיבוי ——— */

function BackupPanel() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    void getMeta<number>(db, 'lastBackupAt').then((v) => setLastBackup(v ?? null));
  }, []);

  const save = async () => {
    setError(null);
    const backup = await exportBackup(db);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const name = backupFileName();
    const file = new File([blob], name, { type: 'application/json' });

    try {
      // בנייד: שיתוף ישירות ל-Drive, למייל או ל-WhatsApp של עצמי
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'גיבוי פלס' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('שמירת הגיבוי לא הצליחה. אפשר לנסות שוב.');
      return;
    }
    const now = Date.now();
    await setMeta(db, 'lastBackupAt', now);
    setLastBackup(now);
    toast({ message: 'הגיבוי נשמר' });
  };

  const restore = async (file: File) => {
    setError(null);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setError('לא הצלחנו לקרוא את הקובץ. צריך לבחור קובץ גיבוי שנשמר מפלס.');
      return;
    }
    const result = validateBackup(json);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const count = result.value.data.tasks.filter((t) => t.deletedAt === null).length;
    const when = formatShortDate(result.value.exportedAt.slice(0, 10), today);
    const confirmed = window.confirm(
      `שחזור מגיבוי מ-${when} עם ${count} משימות.\nכל הנתונים הנוכחיים במכשיר יוחלפו. להמשיך?`,
    );
    if (!confirmed) return;
    await restoreBackup(db, result.value);
    toast({ message: 'הנתונים שוחזרו מהגיבוי' });
  };

  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - lastBackup) / 86_400_000) : null;

  return (
    <Section title="גיבוי">
      <div className="panel">
        <div className="stack">
          <p className="prose">
            הנתונים שמורים <strong>רק במכשיר הזה</strong>. אם הטלפון מוחלף או הדפדפן נמחק, רק גיבוי יחזיר אותם.{' '}
            {lastBackup
              ? `גיבוי אחרון: ${formatShortDate(toISODate(new Date(lastBackup)), today)}${daysSinceBackup !== null && daysSinceBackup >= 7 ? ', כדאי לגבות שוב.' : '.'}`
              : 'עדיין לא נשמר גיבוי.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            <Download size={18} aria-hidden="true" />
            שמירת גיבוי
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={18} aria-hidden="true" />
            שחזור מקובץ גיבוי
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void restore(file);
            }}
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ——— מכשיר ——— */

function DevicePanel() {
  const toast = useToast();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const standalone = isStandalone();
  // בספארי באייפון, אחסון קבוע ניתן רק לאפליקציה שהותקנה למסך הבית; בקשה מהדפדפן נדחית בשקט
  const iosBrowser = isIOS() && !standalone;

  useEffect(() => {
    void getStorageStatus().then(setStorage);
    return onInstallAvailabilityChange(() => setCanInstall(canPromptInstall()));
  }, []);

  const storageText = storage?.persisted
    ? 'הדפדפן לא ימחק את הנתונים כדי לפנות מקום.'
    : iosBrowser
      ? 'באייפון, הנתונים מוגנים רק באפליקציה שהותקנה למסך הבית. בדפדפן, ספארי עלול למחוק אותם אחרי תקופה בלי שימוש.'
      : 'במחסור במקום הדפדפן עלול למחוק נתונים. אחסון קבוע והתקנה למסך הבית מפחיתים את הסיכון.';

  return (
    <Section title="המכשיר">
      <div className="panel">
        <div className="settings-row" style={{ paddingInline: 16 }}>
          <HardDrive size={20} aria-hidden="true" style={{ color: 'var(--ink-2)', flex: 'none' }} />
          <div className="settings-text">
            <p>{storage?.persisted ? 'אחסון קבוע פעיל' : 'אחסון רגיל'}</p>
            <p>{storageText}</p>
          </div>
          {storage?.supported && !storage.persisted && !iosBrowser && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                const granted = await requestPersistentStorage();
                setStorage(await getStorageStatus());
                toast({
                  message: granted
                    ? 'אחסון קבוע הופעל'
                    : 'הדפדפן לא אישר אחסון קבוע. התקנה למסך הבית ושימוש קבוע בדרך כלל משנים את זה. בינתיים כדאי לגבות.',
                  durationMs: 7000,
                });
              }}
            >
              הפעלה
            </button>
          )}
        </div>
        <div className="settings-row" style={{ paddingInline: 16 }}>
          <Smartphone size={20} aria-hidden="true" style={{ color: 'var(--ink-2)', flex: 'none' }} />
          <div className="settings-text">
            <p>{standalone ? 'מותקנת במסך הבית' : 'התקנה למסך הבית'}</p>
            <p>
              {standalone
                ? 'נפתחת כמו אפליקציה ועובדת גם בלי קליטה.'
                : isIOS()
                  ? 'בספארי: כפתור השיתוף, ואז "הוספה למסך הבית".'
                  : 'בכרום: תפריט שלוש הנקודות, ואז "התקנת אפליקציה".'}
            </p>
          </div>
          {canInstall && !standalone && (
            <button type="button" className="btn btn-quiet" onClick={() => void promptInstall()}>
              התקנה
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}
