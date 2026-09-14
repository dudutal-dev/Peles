import { useEffect } from 'react';

/**
 * ב-iOS המקלדת מכסה אלמנטים קבועים בתחתית המסך.
 * מחשבים את גובה המקלדת מה-visualViewport ומעבירים אותו ל-CSS כ-‎--kb.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb', `${Math.round(inset)}px`);
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
