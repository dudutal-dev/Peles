import { X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useBackDismiss } from '../hooks/useBackDismiss';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}

/**
 * גיליון תחתון מבוסס <dialog>: לכידת פוקוס, Esc, לחיצה על הרקע וכפתור "חזור".
 * התוכן נבנה מחדש בכל פתיחה, כך שטפסים מתחילים נקיים.
 */
export function Sheet({ open, onClose, title, children, footer, headerExtra }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useBackDismiss(open, onClose);

  // useLayoutEffect: פתיחה בתוך אותה לחיצה, כדי ש-iOS יסכים לפתוח מקלדת
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const target = dialog.querySelector<HTMLElement>('[data-autofocus]');
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div className="sheet-head">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            {headerExtra}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה">
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
