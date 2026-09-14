import { Plus, Search, UserPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigate, navigateAfterSheet } from '../../app/router';
import { db } from '../../data/db';
import { addContact } from '../../data/contactRepo';
import { contactSummaries, normalizeName, unsavedContactNames } from '../../domain/contacts';
import { CONTACT_TYPE_LABEL, CONTACT_TYPE_SHORT_LABEL, countPhrase, daysPhrase } from '../../domain/labels';
import type { ContactType } from '../../domain/types';
import { BackLink, EntityRow } from '../../ui/layoutParts';
import { EmptyState, Field, Section, Segmented } from '../../ui/primitives';
import { Sheet } from '../../ui/Sheet';

const TYPE_OPTIONS = (['contractor', 'district', 'consultant', 'internal', 'other'] as const).map((value) => ({
  value,
  label: CONTACT_TYPE_SHORT_LABEL[value],
}));

export function ContactsScreen() {
  const { contacts, tasks, today } = useApp();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const searchId = useId();

  const summaries = contactSummaries(contacts, tasks, today).filter(
    (s) => !query.trim() || normalizeName(`${s.contact.name} ${s.contact.role}`).includes(normalizeName(query)),
  );
  const unsaved = unsavedContactNames(contacts, tasks);

  return (
    <div className="screen">
      <BackLink href={href('more')} label="עוד" />
      <header className="screen-head">
        <div>
          <h1 className="screen-title">גורמים</h1>
          <p className="screen-sub">קבלנים, מחוזות, יועצים וגורמים פנימיים, ומה פתוח מול כל אחד</p>
        </div>
      </header>

      <div className="action-bar" style={{ marginBlock: '0 12px' }}>
        <div className="search" role="search" style={{ flex: 1, margin: 0 }}>
          <Search size={18} aria-hidden="true" />
          <label htmlFor={searchId} className="visually-hidden">
            חיפוש גורם
          </label>
          <input id={searchId} type="search" className="input" placeholder="חיפוש" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden="true" />
          גורם
        </button>
      </div>

      {summaries.length === 0 && !query.trim() ? (
        <div className="panel">
          <EmptyState tone="neutral" title="עוד לא נשמרו גורמים" text="גורם שמור מרכז טלפון, מייל וכל מה שפתוח מולו." />
        </div>
      ) : summaries.length === 0 ? (
        <div className="panel">
          <EmptyState tone="neutral" title={`לא נמצא גורם בשם "${query.trim()}"`} />
        </div>
      ) : (
        <div className="panel">
          {summaries.map((s) => (
            <EntityRow
              key={s.contact.id}
              href={href('contact', s.contact.id)}
              title={s.contact.name}
              meta={
                <>
                  <span>{CONTACT_TYPE_LABEL[s.contact.type]}</span>
                  {s.open === 0 && <span>אין פריטים פתוחים</span>}
                  {s.waiting > 0 && <span>{countPhrase(s.waiting, 'ממתין אחד', 'ממתינים')}</span>}
                  {s.overdue > 0 && <span className="meta-overdue">{s.overdue} באיחור</span>}
                  {s.oldestWaitingDays !== null && s.oldestWaitingDays > 0 && <span>הוותיק: {daysPhrase(s.oldestWaitingDays)}</span>}
                </>
              }
              trailing={s.open > 0 ? <span className="count-pill num">{s.open}</span> : undefined}
            />
          ))}
        </div>
      )}

      {unsaved.length > 0 && !query.trim() && (
        <Section title="מופיעים במשימות ועוד לא נשמרו" count={unsaved.length}>
          <div className="panel">
            {unsaved.map((u) => (
              <div key={u.name} className="settings-row" style={{ paddingInline: 16 }}>
                <div className="settings-text">
                  <p>{u.name}</p>
                  <p>{countPhrase(u.open, 'משימה פתוחה אחת', 'משימות פתוחות')}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={async () => {
                    const c = await addContact(db, { name: u.name });
                    navigate(href('contact', c.id));
                  }}
                >
                  <UserPlus size={17} aria-hidden="true" />
                  שמירה
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="גורם חדש">
        <NewContactForm
          onCreated={(id) => {
            setAdding(false);
            navigateAfterSheet(href('contact', id));
          }}
        />
      </Sheet>
    </div>
  );
}

function NewContactForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>('contractor');
  const [phone, setPhone] = useState('');
  const ids = { name: useId(), phone: useId() };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const c = await addContact(db, { name, type, phone });
        onCreated(c.id);
      }}
    >
      <Field label="שם" htmlFor={ids.name}>
        <input id={ids.name} data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: קבלן א. כהן" required />
      </Field>
      <Field label="סוג">
        <Segmented<ContactType> label="סוג הגורם" value={type} options={TYPE_OPTIONS} onChange={setType} />
      </Field>
      <Field label="טלפון" htmlFor={ids.phone}>
        <input id={ids.phone} type="tel" inputMode="tel" autoComplete="off" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="לא חובה" dir="ltr" />
      </Field>
      <div className="sheet-foot sheet-foot-sticky">
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          שמירת גורם
        </button>
      </div>
    </form>
  );
}
