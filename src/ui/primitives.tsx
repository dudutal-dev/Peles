import { CircleCheck, Sparkles } from 'lucide-react';
import { useId, type ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  /** שם הקבוצה לקורא מסך. */
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

/** בחירה אחת מתוך כמה, על בסיס רדיו אמיתי (מקלדת וקורא מסך עובדים מעצמם). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <label key={opt.value} className="segmented-option">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={opt.value === value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}

export function Field({ label, children, hint, htmlFor }: FieldProps) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <p className="field-label" aria-hidden="true">
          {label}
        </p>
      )}
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function Section({ title, count, action, children, id }: SectionProps) {
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId} id={id}>
      <div className="section-head">
        <h2 className="section-title" id={headingId}>
          {title}
        </h2>
        {count !== undefined && count > 0 && <span className="section-count">{count}</span>}
        {action && <div className="section-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

interface EmptyStateProps {
  title: string;
  text?: string;
  tone?: 'good' | 'neutral';
  action?: ReactNode;
}

/** מצב ריק: "אין ממתינים" היא בשורה טובה, ומוצגת ככזו. */
export function EmptyState({ title, text, tone = 'good', action }: EmptyStateProps) {
  return (
    <div className="empty" data-tone={tone}>
      <span className="empty-icon" aria-hidden="true">
        {tone === 'good' ? <CircleCheck size={20} /> : <Sparkles size={18} />}
      </span>
      <div>
        <p className="empty-title">{title}</p>
        {text && <p className="empty-text">{text}</p>}
        {action && <div className="empty-action">{action}</div>}
      </div>
    </div>
  );
}

/** סימן הפלס: בועה צהובה במרכז הזכוכית. */
export function LevelMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="32" height="32" rx="8" fill="#0E5E6F" />
      <rect x="4" y="10.5" width="24" height="11" rx="5.5" fill="#F1F3F2" />
      <rect x="9.6" y="12.4" width="1.4" height="7.2" rx="0.7" fill="#0E5E6F" />
      <rect x="21" y="12.4" width="1.4" height="7.2" rx="0.7" fill="#0E5E6F" />
      <circle cx="16" cy="16" r="3.3" fill="#FFE45C" stroke="#0E5E6F" strokeWidth="0.8" />
    </svg>
  );
}
