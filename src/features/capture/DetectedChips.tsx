import { AtSign, Calendar, Hash, X } from 'lucide-react';
import type { Detected } from '../../domain/capture';
import { describeDue, formatShortDate } from '../../domain/dates';
import type { ISODate } from '../../domain/types';

const ORDER: Record<Detected['kind'], number> = { due: 0, owner: 1, tag: 2 };

interface DetectedChipsProps {
  detected: readonly Detected[];
  today: ISODate;
  onCancel: (token: string) => void;
}

/** מה שזוהה בטקסט (תאריך, גורם, תגיות), עם אפשרות לבטל כל זיהוי. */
export function DetectedChips({ detected, today, onCancel }: DetectedChipsProps) {
  if (detected.length === 0) return null;
  return (
    <div className="chips capture-detected" aria-label="זוהה בטקסט">
      {[...detected]
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
        .map((d) => (
          <span key={`${d.kind}-${d.token}`} className="chip chip-detected">
            {d.kind === 'due' ? (
              <>
                <Calendar size={15} aria-hidden="true" />
                {dueText(d.value, today)}
              </>
            ) : d.kind === 'owner' ? (
              <>
                <AtSign size={15} aria-hidden="true" />
                {d.value}
              </>
            ) : (
              <>
                <Hash size={15} aria-hidden="true" />
                {d.value}
              </>
            )}
            <button
              type="button"
              className="chip-remove"
              aria-label={`ביטול זיהוי של ${d.token}`}
              onClick={() => onCancel(d.token)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </span>
        ))}
    </div>
  );
}

function dueText(iso: ISODate, today: ISODate): string {
  const rel = describeDue(iso, today);
  return rel.tone === 'later' ? `עד ${rel.text}` : `${rel.text}, ${formatShortDate(iso, today)}`;
}
