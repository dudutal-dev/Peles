import { useEffect } from 'react';

/**
 * ב-iOS המקלדת מכסה אלמנטים קבועים בתחתית המסך, וגובה החלון (innerHeight) לא משתנה.
 * מחשבים מה-visualViewport:
 *   ‎--kb  — כמה מתחתית המסך מוסתר (המקלדת), כדי להרים את הגיליון מעליה
 *   ‎--vvh — הגובה הנראה בפועל, כדי שהגיליון לא יהיה גבוה ממה שרואים
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // פחות מ-80px זה פס כתובת או סרגל, לא מקלדת
      const kb = hidden > 80 ? hidden : 0;
      root.style.setProperty('--kb', `${Math.round(kb)}px`);
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
