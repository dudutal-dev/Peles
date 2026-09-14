import { CalendarDays, CircleCheck, Clock, MapPin, Mic, Pencil, Share2, Trash2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigate } from '../../app/router';
import { db } from '../../data/db';
import {
  addCommitment,
  closeMeeting,
  deleteMeeting,
  reopenMeeting,
  restoreMeeting,
  updateMeeting,
} from '../../data/meetingRepo';
import { updateTask } from '../../data/taskRepo';
import { normalizeName } from '../../domain/contacts';
import { formatDayHeader, formatShortDate, toISODate } from '../../domain/dates';
import { OWNER_LABEL } from '../../domain/labels';
import {
  bucketOf,
  bucketPatch,
  cleanList,
  meetingSummaryText,
  meetingTasks,
  parseCommitment,
  type MeetingBucket,
} from '../../domain/meetings';
import type { Meeting, OwnerKind, Task } from '../../domain/types';
import { useDraft } from '../../hooks/useDraft';
import { BackLink, NotFound } from '../../ui/layoutParts';
import { EmptyState, Field, Section, Segmented } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { DetectedChips } from '../capture/DetectedChips';
import { useSpeech } from '../capture/useSpeech';
import { TaskRow } from '../tasks/TaskRow';
import { MeetingFormSheet } from './MeetingFormSheet';

export function MeetingScreen({ id }: { id: string }) {
  const { meetings } = useApp();
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting || meeting.deletedAt !== null) {
    return <NotFound backHref={href('meetings')} backLabel="ישיבות" text="הישיבה לא נמצאה. ייתכן שנמחקה." />;
  }
  return <MeetingDetail key={meeting.id} meeting={meeting} />;
}

const BUCKET_OPTIONS = [
  { value: 'mine', label: 'לטיפולי' },
  { value: 'handed', label: 'הועבר' },
  { value: 'follow', label: 'למעקב' },
] as const;

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const { tasks, today, contacts } = useApp();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [participant, setParticipant] = useState('');
  const ids = { title: useId(), participant: useId(), participantList: useId(), notes: useId() };

  const title = useDraft(meeting.title, (v) => v.trim() && updateMeeting(db, meeting.id, { title: v.trim() }));
  const notes = useDraft(meeting.notes, (v) => updateMeeting(db, meeting.id, { notes: v }));

  const items = meetingTasks(tasks, meeting.id);
  const closed = meeting.closedAt !== null;
  const liveContacts = contacts.filter((c) => c.deletedAt === null);

  const addParticipant = () => {
    const names = participant.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    void updateMeeting(db, meeting.id, { participants: cleanList([...meeting.participants, ...names]) });
    setParticipant('');
  };

  const share = async () => {
    notes.flush();
    const text = meetingSummaryText({ ...meeting, notes: notes.value }, tasks, today);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: 'הסיכום הועתק. אפשר להדביק בוואטסאפ או במייל.' });
    } catch {
      toast({ message: 'לא הצלחנו להעתיק. אפשר לנסות שוב.' });
    }
  };

  return (
    <div className="screen">
      <BackLink href={href('meetings')} label="ישיבות" />

      <div className="field" style={{ marginBlockStart: 4 }}>
        <label htmlFor={ids.title} className="visually-hidden">
          נושא הישיבה
        </label>
        <input
          id={ids.title}
          className="input title-input detail-title"
          value={title.value}
          onChange={(e) => title.onChange(e.target.value)}
          onBlur={() => {
            if (!title.value.trim()) title.setValue(meeting.title);
            title.flush();
          }}
        />
        <div className="info-line">
          <span className="meta">
            <CalendarDays size={16} aria-hidden="true" />
            {formatDayHeader(meeting.date)}
          </span>
          {meeting.time && (
            <span className="meta num">
              <Clock size={16} aria-hidden="true" />
              {meeting.time}
            </span>
          )}
          {meeting.location && (
            <span className="meta">
              <MapPin size={16} aria-hidden="true" />
              {meeting.location}
            </span>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
            <Pencil size={16} aria-hidden="true" />
            עריכה
          </button>
        </div>
      </div>

      <Field label="משתתפים" htmlFor={ids.participant}>
        {meeting.participants.length > 0 && (
          <div className="chips" style={{ marginBlockEnd: 8 }}>
            {meeting.participants.map((p) => (
              <span key={p} className="chip chip-detected">
                {p}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`הסרת ${p}`}
                  onClick={() => void updateMeeting(db, meeting.id, { participants: meeting.participants.filter((x) => x !== p) })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="input-row" style={{ marginBlockStart: 0 }}>
          <input
            id={ids.participant}
            className="input"
            placeholder="שם, או כמה שמות מופרדים בפסיק"
            list={ids.participantList}
            value={participant}
            enterKeyHint="enter"
            onChange={(e) => setParticipant(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addParticipant();
              }
            }}
          />
          <button type="button" className="btn btn-secondary" onClick={addParticipant} disabled={!participant.trim()}>
            הוספה
          </button>
          <datalist id={ids.participantList}>
            {liveContacts
              .filter((c) => !meeting.participants.some((p) => normalizeName(p) === normalizeName(c.name)))
              .map((c) => (
                <option key={c.id} value={c.name} />
              ))}
          </datalist>
        </div>
      </Field>

      {closed ? (
        <div className="closed-banner">
          <CircleCheck size={20} aria-hidden="true" />
          <span>הישיבה סוכמה ב-{formatShortDate(toISODate(new Date(meeting.closedAt ?? Date.now())), today)}</span>
          <button type="button" className="btn btn-quiet" onClick={() => void reopenMeeting(db, meeting.id)}>
            פתיחה מחדש
          </button>
        </div>
      ) : (
        !splitting && <CommitmentBar meeting={meeting} />
      )}

      <Section
        title={splitting ? 'חלוקת אחריות' : 'מה סוכם'}
        count={items.length}
        action={
          !closed &&
          items.length > 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setSplitting((v) => !v)}>
              {splitting ? 'חזרה לתיעוד' : 'חלוקה'}
            </button>
          )
        }
      >
        {items.length === 0 ? (
          <div className="panel">
            <EmptyState tone="neutral" title="עוד לא נרשמו התחייבויות" text="כל שורה שנרשמת למעלה מופיעה כאן כמשימת מעקב." />
          </div>
        ) : splitting ? (
          <>
            <p className="screen-sub" style={{ marginBlockEnd: 8 }}>
              לכל פריט: לטפל בעצמך, להעביר לאחרים (ממתין לתגובה) או רק לעקוב.
            </p>
            <div className="panel">
              {items.map((t) => (
                <SplitRow key={t.id} task={t} />
              ))}
            </div>
          </>
        ) : (
          <div className="panel">
            {items.map((t) => (
              <TaskRow key={t.id} task={t} hideContext />
            ))}
          </div>
        )}
      </Section>

      <Section title="הערות">
        <label htmlFor={ids.notes} className="visually-hidden">
          הערות מהישיבה
        </label>
        <textarea
          id={ids.notes}
          className="textarea"
          style={{ minHeight: 110 }}
          placeholder="מה נאמר, רקע, דברים שלא הפכו למשימה"
          value={notes.value}
          onChange={(e) => notes.onChange(e.target.value)}
          onBlur={notes.flush}
        />
      </Section>

      <div className="action-bar">
        <button type="button" className="btn btn-secondary" onClick={() => void share()}>
          <Share2 size={18} aria-hidden="true" />
          שיתוף סיכום
        </button>
        {!closed && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              notes.flush();
              await closeMeeting(db, meeting.id);
              setSplitting(false);
              toast({ message: 'הישיבה סוכמה ונסגרה' });
            }}
          >
            <CircleCheck size={18} aria-hidden="true" />
            סגירת הישיבה
          </button>
        )}
      </div>

      <button
        type="button"
        className="btn btn-danger btn-block"
        style={{ marginBlockStart: 28 }}
        onClick={async () => {
          await deleteMeeting(db, meeting.id);
          navigate(href('meetings'));
          toast({ message: 'הישיבה נמחקה. המשימות שנולדו בה נשארו.', actionLabel: 'ביטול', onAction: () => void restoreMeeting(db, meeting.id) });
        }}
      >
        <Trash2 size={18} aria-hidden="true" />
        מחיקת הישיבה
      </button>

      <MeetingFormSheet open={editing} onClose={() => setEditing(false)} meeting={meeting} />
    </div>
  );
}

/** תיעוד תוך כדי ישיבה: שורה אחת = מי התחייב למה עד מתי. */
function CommitmentBar({ meeting }: { meeting: Meeting }) {
  const { today } = useApp();
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [ignored, setIgnored] = useState<string[]>([]);
  const [owner, setOwner] = useState<OwnerKind>('me');
  const [last, setLast] = useState<string | null>(null);
  const speech = useSpeech((chunk) => setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${chunk}` : chunk)));

  const parsed = parseCommitment(text, today, owner, ignored);
  const ownerFromText = parsed.detected.some((d) => d.kind === 'owner');

  const submit = async () => {
    if (!parsed.title) {
      inputRef.current?.focus();
      return;
    }
    const task = await addCommitment(db, meeting, parsed);
    setLast(task.title);
    setText('');
    setIgnored([]);
    inputRef.current?.focus();
  };

  return (
    <section className="log-box" aria-labelledby={`${inputId}-label`}>
      <label id={`${inputId}-label`} htmlFor={inputId} className="section-title" style={{ display: 'block', marginBlockEnd: 8 }}>
        תיעוד תוך כדי
      </label>
      <div className="capture-field">
        <textarea
          id={inputId}
          ref={inputRef}
          className="textarea capture-input"
          rows={2}
          placeholder="@קבלן_כהן ישלח אישור בטיחות עד חמישי"
          value={text}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {speech.supported && (
          <button
            type="button"
            className="mic-btn"
            aria-pressed={speech.listening}
            aria-label={speech.listening ? 'עצירת הקלטה' : 'הקלדה קולית'}
            onClick={speech.toggle}
          >
            <Mic size={22} aria-hidden="true" />
          </button>
        )}
      </div>
      {speech.error && (
        <p className="error-text" role="alert">
          {speech.error}
        </p>
      )}
      <DetectedChips detected={parsed.detected} today={today} onCancel={(token) => setIgnored((p) => [...p, token])} />
      <div className="field" style={{ marginBlock: '10px 10px' }}>
        <Segmented<OwnerKind>
          label="באחריות"
          value={ownerFromText ? parsed.owner.kind : owner}
          onChange={setOwner}
          options={[
            { value: 'me', label: OWNER_LABEL.me },
            { value: 'director', label: OWNER_LABEL.director },
            { value: 'external', label: OWNER_LABEL.external },
          ]}
        />
        {!ownerFromText && owner === 'external' && (
          <p className="field-hint">כדאי לציין מי, עם ‎@שם בתחילת השורה.</p>
        )}
      </div>
      {last && (
        <p className="capture-added" role="status">
          <CircleCheck size={16} aria-hidden="true" />
          נרשם: {last}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={() => void submit()} disabled={!parsed.title}>
        רישום
      </button>
    </section>
  );
}

function SplitRow({ task }: { task: Task }) {
  const bucket: MeetingBucket = bucketOf(task);
  return (
    <div className="split-row">
      <TaskRow task={task} hideContext />
      {bucket !== 'done' && (
        <div className="split-controls">
          <Segmented<Exclude<MeetingBucket, 'done'>>
            label={`חלוקה: ${task.title}`}
            value={bucket}
            options={BUCKET_OPTIONS}
            onChange={(b) => void updateTask(db, task.id, bucketPatch(task, b))}
          />
          {bucket === 'handed' && task.owner.kind === 'external' && !task.owner.name.trim() && (
            <p className="field-hint">עוד לא צוין למי הועבר. אפשר להשלים בפרטי המשימה.</p>
          )}
        </div>
      )}
    </div>
  );
}
