import { Hourglass, ListChecks, Plus, Settings2, Sunrise } from 'lucide-react';
import { href, type Route } from './router';
import type { Snapshot } from '../domain/views';

interface TabBarProps {
  route: Route;
  snap: Snapshot | null;
  onCapture: () => void;
}

export function TabBar({ route, snap, onCapture }: TabBarProps) {
  const current = (screen: Route['screen']) => (route.screen === screen ? 'page' : undefined);

  return (
    <nav className="tabbar" aria-label="ניווט ראשי">
      <div className="tabbar-inner">
        <a className="tab" href={href('morning')} aria-current={current('morning')}>
          <Sunrise size={24} aria-hidden="true" />
          <span>בוקר</span>
        </a>
        <a className="tab" href={href('waiting')} aria-current={current('waiting')}>
          <Hourglass size={24} aria-hidden="true" />
          <span>ממתין</span>
          {snap && snap.nudges > 0 && (
            <span className="tab-badge" data-tone="nudge" aria-label={`${snap.nudges} לנדנד`}>
              {snap.nudges}
            </span>
          )}
        </a>
        <button type="button" className="capture-tab" onClick={onCapture} aria-label="קליטה מהירה של משימה">
          <span className="capture-disc">
            <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span aria-hidden="true">משימה</span>
        </button>
        <a className="tab" href={href('tasks', route.screen === 'tasks' ? route.tab : 'today')} aria-current={current('tasks')}>
          <ListChecks size={24} aria-hidden="true" />
          <span>משימות</span>
          {snap && snap.overdue > 0 && (
            <span className="tab-badge" aria-label={`${snap.overdue} באיחור`}>
              {snap.overdue}
            </span>
          )}
        </a>
        <a className="tab" href={href('more')} aria-current={current('more')}>
          <Settings2 size={24} aria-hidden="true" />
          <span>עוד</span>
        </a>
      </div>
    </nav>
  );
}
