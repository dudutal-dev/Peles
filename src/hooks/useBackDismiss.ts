import { useEffect, useRef } from 'react';

/**
 * כפתור "חזור" של הטלפון סוגר את הגיליון הפתוח העליון, במקום לצאת מהמסך.
 * מחסנית אחת לכל האפליקציה, כדי שגיליונות מקוננים ייסגרו אחד-אחד.
 */
interface Entry {
  close: () => void;
}

const stack: Entry[] = [];
let ignoredPops = 0;
let listening = false;

function onPopState() {
  if (ignoredPops > 0) {
    ignoredPops -= 1;
    return;
  }
  const top = stack.pop();
  top?.close();
}

export function useBackDismiss(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const entry: Entry = { close: () => closeRef.current() };
    window.history.pushState({ sheet: true }, '');
    stack.push(entry);

    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) {
        // נסגר מתוך הממשק, לא דרך "חזור" — מסירים את הרשומה שהוספנו
        stack.splice(index, 1);
        ignoredPops += 1;
        window.history.back();
      }
    };
  }, [open]);
}
