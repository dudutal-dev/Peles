import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href } from '../../app/router';
import { countPhrase } from '../../domain/labels';
import { meetingTasks, meetingsOn } from '../../domain/meetings';
import { Section } from '../../ui/primitives';
import { EntityRow } from '../../ui/layoutParts';
import { MeetingFormSheet } from './MeetingFormSheet';

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** יומן פנימי: ישיבות ופגישות של היום, כל אחת נפתחת לתיעוד. Google Calendar מתוכנן לשלב ג'. */
export function TodayMeetingsSection() {
  const { today, meetings, tasks } = useApp();
  const [adding, setAdding] = useState(false);
  const list = meetingsOn(meetings, today);
  const now = nowHHMM();

  return (
    <Section
      title="ישיבות ופגישות היום"
      count={list.length}
      action={
        <button type="button" className="btn btn-quiet" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          ישיבה
        </button>
      }
    >
      <div className="panel">
        {list.length === 0 ? (
          <p className="panel-note">אין ישיבות רשומות להיום</p>
        ) : (
          list.map((m) => {
            const decisions = meetingTasks(tasks, m.id).length;
            const past = m.time !== '' && m.time < now;
            return (
              <EntityRow
                key={m.id}
                href={href('meeting', m.id)}
                lead={<span data-past={past}>{m.time || 'היום'}</span>}
                title={m.title}
                meta={
                  (m.location || decisions > 0) && (
                    <>
                      {m.location && <span>{m.location}</span>}
                      {decisions > 0 && <span>{countPhrase(decisions, 'החלטה אחת', 'החלטות')}</span>}
                    </>
                  )
                }
              />
            );
          })
        )}
      </div>
      <MeetingFormSheet open={adding} onClose={() => setAdding(false)} />
    </Section>
  );
}
