import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** תקלה בממשק לא מוחקת נתונים: הם שמורים במסד המקומי. מציגים דרך לחזור לעבודה. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" role="alert">
        <h1 className="screen-title" style={{ marginBlockEnd: 8 }}>
          משהו בתצוגה נתקע
        </h1>
        <p className="prose" style={{ marginBlockEnd: 16 }}>
          הנתונים שמורים במכשיר ולא נפגעו. טעינה מחדש של האפליקציה בדרך כלל פותרת את זה.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          טעינה מחדש
        </button>
      </div>
    );
  }
}
