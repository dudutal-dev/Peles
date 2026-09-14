import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, BellOff, Send } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { db } from '../../data/db';
import { ALL_WEEKDAYS, WEEKDAY_LETTERS, WEEKDAY_NAMES } from '../../domain/labels';
import type { PushSettings } from '../../domain/notifications';
import type { Weekday } from '../../domain/types';
import {
  disablePush,
  enablePush,
  loadPushSettings,
  pushAvailability,
  savePushSettings,
  sendTestPush,
  syncPushSchedule,
} from '../../pwa/push';
import { Section } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const UNAVAILABLE_TEXT = {
  unconfigured: 'שרת ההתראות עוד לא חובר לאפליקציה. אחרי ההגדרה אפשר יהיה להפעיל כאן תזכורות לנייד.',
  dev: 'בגרסת הפיתוח אין התראות. הן פעילות באפליקציה המותקנת.',
  'needs-install': 'באייפון, התראות עובדות רק מהאפליקציה שבמסך הבית. בספארי: כפתור השיתוף, "הוספה למסך הבית", ואז לפתוח את פלס משם.',
  unsupported: 'הדפדפן הזה לא תומך בהתראות.',
  denied: 'ההתראות חסומות למכשיר הזה. אפשר לאשר אותן בהגדרות המכשיר, תחת התראות ואז פלס.',
} as const;

export function NotificationsPanel() {
  const { tasks, meetings } = useApp();
  const toast = useToast();
  const availability = pushAvailability();
  const enabled = useLiveQuery(async () => {
    const raw = (await db.meta.get('pushState'))?.value;
    return typeof raw === 'string' && (JSON.parse(raw) as { enabled?: boolean }).enabled === true;
  }, []);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { morning: useId(), evening: useId() };

  useEffect(() => {
    void loadPushSettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<PushSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await savePushSettings(next);
    const r = await syncPushSchedule(tasks, meetings, { force: true });
    setError(r.ok ? null : r.error);
  };

  return (
    <Section title="התראות">
      <div className="panel">
        <div className="stack">
          {availability !== 'available' ? (
            <p className="prose">{UNAVAILABLE_TEXT[availability]}</p>
          ) : !enabled ? (
            <>
              <p className="prose">
                תזכורת בבוקר עם סדר היום, ותזכורת לפני סוף היום על מה שצריך לנדנד או שמועדו מחר. מגיעה גם כשהאפליקציה סגורה.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const r = await enablePush(tasks, meetings);
                  setBusy(false);
                  if (r.ok) toast({ message: 'ההתראות הופעלו' });
                  else setError(r.error);
                }}
              >
                <Bell size={18} aria-hidden="true" />
                {busy ? 'מפעיל...' : 'הפעלת התראות'}
              </button>
            </>
          ) : (
            settings && (
              <>
                <div className="notify-row">
                  <label className="check-line" htmlFor={ids.morning}>
                    <input id={ids.morning} type="checkbox" checked={settings.morning} onChange={(e) => void update({ morning: e.target.checked })} />
                    סדר היום בבוקר
                  </label>
                  <input
                    type="time"
                    className="input time-input"
                    aria-label="שעת תזכורת הבוקר"
                    value={settings.morningTime}
                    disabled={!settings.morning}
                    onChange={(e) => e.target.value && void update({ morningTime: e.target.value })}
                  />
                </div>
                <div className="notify-row">
                  <label className="check-line" htmlFor={ids.evening}>
                    <input id={ids.evening} type="checkbox" checked={settings.evening} onChange={(e) => void update({ evening: e.target.checked })} />
                    לפני סוף היום
                  </label>
                  <input
                    type="time"
                    className="input time-input"
                    aria-label="שעת תזכורת הערב"
                    value={settings.eveningTime}
                    disabled={!settings.evening}
                    onChange={(e) => e.target.value && void update({ eveningTime: e.target.value })}
                  />
                </div>
                <div>
                  <p className="field-label">באילו ימים</p>
                  <div className="day-picker" role="group" aria-label="ימי התראות">
                    {ALL_WEEKDAYS.map((d: Weekday) => (
                      <button
                        key={d}
                        type="button"
                        className="day-toggle"
                        aria-pressed={settings.days.includes(d)}
                        aria-label={`יום ${WEEKDAY_NAMES[d]}`}
                        onClick={() =>
                          void update({ days: settings.days.includes(d) ? settings.days.filter((x) => x !== d) : [...settings.days, d].sort() })
                        }
                      >
                        {WEEKDAY_LETTERS[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="field-hint">התראה נשלחת רק כשיש על מה: איחורים, מה לנדנד, מועד מחר או ישיבות.</p>
                <div className="action-bar" style={{ marginBlockStart: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      const r = await sendTestPush();
                      if (r.ok) toast({ message: 'נשלחה התראת בדיקה' });
                      else setError(r.error);
                    }}
                  >
                    <Send size={17} aria-hidden="true" />
                    התראת בדיקה
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={async () => {
                      await disablePush();
                      toast({ message: 'ההתראות כובו' });
                    }}
                  >
                    <BellOff size={17} aria-hidden="true" />
                    כיבוי
                  </button>
                </div>
              </>
            )
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <p className="field-hint">פרטיות: השרת יודע רק מתי להעיר את הטלפון. תוכן ההתראה נבנה בטלפון, מהנתונים שבו.</p>
        </div>
      </div>
    </Section>
  );
}
