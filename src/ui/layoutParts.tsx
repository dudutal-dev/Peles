import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/** חזרה למסך הרשימה. בעברית "אחורה" הוא חץ ימינה. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="back-link" href={href}>
      <ArrowRight size={20} aria-hidden="true" />
      {label}
    </a>
  );
}

interface EntityRowProps {
  href: string;
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}

/** שורה ברשימת ישיבות/אירועים/גורמים: כולה קישור למסך הפרטים. */
export function EntityRow({ href, lead, title, meta, trailing }: EntityRowProps) {
  return (
    <a className="entity-row" href={href}>
      {lead !== undefined && <span className="entity-lead">{lead}</span>}
      <span className="entity-body">
        <span className="entity-title">{title}</span>
        {meta && <span className="entity-meta">{meta}</span>}
      </span>
      {trailing}
      <ChevronLeft size={18} className="entity-chevron" aria-hidden="true" />
    </a>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="progress" aria-label={label}>
      <span aria-hidden="true" className="num">
        {done}/{total}
      </span>
      <span className="progress-track" aria-hidden="true">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function NotFound({ backHref, backLabel, text }: { backHref: string; backLabel: string; text: string }) {
  return (
    <div className="screen">
      <BackLink href={backHref} label={backLabel} />
      <p className="prose" style={{ marginBlockStart: 16 }}>
        {text}
      </p>
    </div>
  );
}
