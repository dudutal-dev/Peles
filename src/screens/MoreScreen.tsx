import { BookOpen, Building2, CalendarHeart, Settings2, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import { href } from '../app/router';
import { upcomingEvents } from '../domain/events';
import { countPhrase } from '../domain/labels';
import { meetingLists } from '../domain/meetings';
import { EntityRow } from '../ui/layoutParts';

/** מסך "עוד": כניסה למודולים שלא בסרגל התחתון. */
export function MoreScreen() {
  const { meetings, tasks, events, contacts, today } = useApp();
  const lists = meetingLists(meetings, tasks, today);
  const upcoming = upcomingEvents(events, today, 60);
  const contactCount = contacts.filter((c) => c.deletedAt === null).length;

  const icon = (node: ReactNode) => <span className="hub-icon">{node}</span>;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="screen-title">עוד</h1>
      </header>
      <div className="panel">
        <EntityRow
          href={href('meetings')}
          lead={icon(<Users size={22} aria-hidden="true" />)}
          title="ישיבות"
          meta={
            <>
              {lists.today.length > 0 && <span>{countPhrase(lists.today.length, 'אחת היום', 'היום')}</span>}
              {lists.toSummarize.length > 0 && <span className="meta-nudge">{countPhrase(lists.toSummarize.length, 'אחת לסיכום', 'לסיכום')}</span>}
              {lists.today.length === 0 && lists.toSummarize.length === 0 && <span>תיעוד החלטות וחלוקת אחריות</span>}
            </>
          }
        />
        <EntityRow
          href={href('events')}
          lead={icon(<CalendarHeart size={22} aria-hidden="true" />)}
          title="אירועים"
          meta={<span>{upcoming.length > 0 ? countPhrase(upcoming.length, 'אירוע אחד בתכנון', 'אירועים בתכנון') : 'פרידות, כנסים, גיבושים'}</span>}
        />
        <EntityRow
          href={href('contacts')}
          lead={icon(<Building2 size={22} aria-hidden="true" />)}
          title="גורמים"
          meta={<span>{contactCount > 0 ? countPhrase(contactCount, 'גורם אחד', 'גורמים') : 'קבלנים, מחוזות, יועצים'}</span>}
        />
      </div>

      <div className="panel" style={{ marginBlockStart: 16 }}>
        <EntityRow href={href('guide')} lead={icon(<BookOpen size={22} aria-hidden="true" />)} title="מדריך למשתמש" meta={<span>איך עובדים עם פלס</span>} />
        <EntityRow href={href('settings')} lead={icon(<Settings2 size={22} aria-hidden="true" />)} title="הגדרות וגיבוי" meta={<span>התראות, שגרת בוקר, גיבוי</span>} />
      </div>
    </div>
  );
}
