import { CircleCheck, Highlighter, Mic, Zap } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { db } from '../../data/db';
import { addTask } from '../../data/taskRepo';
import { parseCapture } from '../../domain/capture';
import type { TaskStatus } from '../../domain/types';
import { Segmented } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { DetectedChips } from './DetectedChips';
import { useSpeech } from './useSpeech';

type CaptureStatus = Exclude<TaskStatus, 'done'>;

const STATUS_OPTIONS = [
  { value: 'todo', label: 'לביצוע' },
  { value: 'waiting', label: 'ממתין לתגובה' },
  { value: 'verify', label: 'לוודא' },
] as const satisfies ReadonlyArray<{ value: CaptureStatus; label: string }>;

interface CaptureSheetProps {
  open: boolean;
  initialText: string;
  onClose: () => void;
}

export function CaptureSheet({ open, initialText, onClose }: CaptureSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="קליטה מהירה">
      <CaptureForm initialText={initialText} onClose={onClose} />
    </Sheet>
  );
}

function CaptureForm({ initialText, onClose }: { initialText: string; onClose: () => void }) {
  const { today, openTask } = useApp();
  const toast = useToast();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState(initialText);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [status, setStatus] = useState<CaptureStatus>('todo');
  const [statusTouched, setStatusTouched] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [director, setDirector] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const speech = useSpeech((chunk) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${chunk}` : chunk));
  });

  const parsed = parseCapture(text, today, ignored);
  // כתבו @שם ולא בחרו סטטוס ידנית — זה כנראה ממתין לתגובה מאותו גורם
  const effectiveStatus: CaptureStatus = !statusTouched && parsed.ownerName ? 'waiting' : status;
  const canSubmit = parsed.title.length > 0;

  const reset = () => {
    setText('');
    setIgnored([]);
    setStatus('todo');
    setStatusTouched(false);
    setUrgent(false);
    setDirector(false);
  };

  const submit = async (keepOpen: boolean) => {
    if (!canSubmit) {
      inputRef.current?.focus();
      return;
    }
    const hasDetails =
      parsed.dueDate !== null ||
      parsed.ownerName !== null ||
      parsed.tags.length > 0 ||
      urgent ||
      director ||
      effectiveStatus !== 'todo';

    const task = await addTask(db, {
      title: parsed.title,
      dueDate: parsed.dueDate,
      tags: parsed.tags,
      owner: parsed.ownerName ? { kind: 'external', name: parsed.ownerName } : { kind: 'me', name: '' },
      status: effectiveStatus,
      urgent,
      directorAwaits: director,
      inbox: !hasDetails,
    });

    reset();
    if (keepOpen) {
      setLastAdded(task.title);
      setAddedCount((n) => n + 1);
      inputRef.current?.focus();
    } else {
      onClose();
      toast({
        message: `נוספה: ${task.title}`,
        actionLabel: 'פרטים',
        onAction: () => openTask(task.id),
      });
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      {lastAdded && (
        <p className="capture-added" role="status">
          <CircleCheck size={16} aria-hidden="true" />
          {addedCount > 1 ? `נוספו ${addedCount}. אחרונה: ${lastAdded}` : `נוספה: ${lastAdded}`}
        </p>
      )}

      <div className="capture-field">
        <label htmlFor={inputId} className="visually-hidden">
          מה צריך לקרות?
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          data-autofocus
          className="textarea capture-input"
          placeholder="מה צריך לקרות?"
          rows={2}
          value={text}
          enterKeyHint="done"
          aria-describedby={hintId}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit(false);
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

      <DetectedChips detected={parsed.detected} today={today} onCancel={(token) => setIgnored((prev) => [...prev, token])} />

      <p className="capture-hint" id={hintId}>
        אפשר לכתוב <kbd>מחר</kbd>, <kbd>עד יום חמישי</kbd>, <kbd>#תגית</kbd> או <kbd>@שם_גורם</kbd>. את שאר הפרטים אפשר להשלים אחר כך.
      </p>

      <div className="field">
        <Segmented
          label="סוג המעקב"
          value={effectiveStatus}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v);
            setStatusTouched(true);
          }}
        />
      </div>

      <div className="chips field">
        <button type="button" className="chip" aria-pressed={urgent} onClick={() => setUrgent((v) => !v)}>
          <Zap size={16} aria-hidden="true" />
          דחוף לי
        </button>
        <button
          type="button"
          className="chip"
          data-kind="director"
          aria-pressed={director}
          onClick={() => setDirector((v) => !v)}
        >
          <Highlighter size={16} aria-hidden="true" />
          ראש המינהל מחכה
        </button>
      </div>

      <div className="sheet-foot sheet-foot-sticky sheet-foot-even">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          הוספה
        </button>
        <button type="button" className="btn btn-secondary" disabled={!canSubmit} onClick={() => void submit(true)}>
          הוספה ועוד אחת
        </button>
      </div>
    </form>
  );
}
