import { Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useApp } from '../../app/AppContext';
import { href, navigate } from '../../app/router';
import { db } from '../../data/db';
import { deleteContact, restoreContact, updateContact } from '../../data/contactRepo';
import { contactTasks } from '../../domain/contacts';
import { CONTACT_TYPE_SHORT_LABEL } from '../../domain/labels';
import { isOpen } from '../../domain/task';
import type { Contact, ContactType } from '../../domain/types';
import { recentlyDone, waitingView } from '../../domain/views';
import { useDraft } from '../../hooks/useDraft';
import { BackLink, NotFound } from '../../ui/layoutParts';
import { EmptyState, Field, Section, Segmented } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { TaskList } from '../tasks/TaskRow';

const TYPE_OPTIONS = (['contractor', 'district', 'consultant', 'internal', 'other'] as const).map((value) => ({
  value,
  label: CONTACT_TYPE_SHORT_LABEL[value],
}));

export function ContactScreen({ id }: { id: string }) {
  const { contacts } = useApp();
  const contact = contacts.find((c) => c.id === id);
  if (!contact || contact.deletedAt !== null) {
    return <NotFound backHref={href('contacts')} backLabel="גורמים" text="הגורם לא נמצא. ייתכן שנמחק." />;
  }
  return <ContactDetail key={contact.id} contact={contact} />;
}

function ContactDetail({ contact }: { contact: Contact }) {
  const { tasks, openCapture } = useApp();
  const toast = useToast();
  const ids = { name: useId(), role: useId(), phone: useId(), email: useId(), notes: useId() };

  const name = useDraft(contact.name, (v) => v.trim() && updateContact(db, contact.id, { name: v.trim() }));
  const role = useDraft(contact.role, (v) => updateContact(db, contact.id, { role: v.trim() }));
  const phone = useDraft(contact.phone, (v) => updateContact(db, contact.id, { phone: v.trim() }));
  const email = useDraft(contact.email, (v) => updateContact(db, contact.id, { email: v.trim() }));
  const notes = useDraft(contact.notes, (v) => updateContact(db, contact.id, { notes: v }));

  const related = contactTasks(tasks, contact);
  const waiting = waitingView(related);
  const otherOpen = related.filter((t) => isOpen(t) && t.status !== 'waiting');
  const done = recentlyDone(related, Date.now(), 90);

  return (
    <div className="screen">
      <BackLink href={href('contacts')} label="גורמים" />

      <div className="field" style={{ marginBlockStart: 4 }}>
        <label htmlFor={ids.name} className="visually-hidden">
          שם הגורם
        </label>
        <input
          id={ids.name}
          className="input title-input detail-title"
          value={name.value}
          onChange={(e) => name.onChange(e.target.value)}
          onBlur={() => {
            if (!name.value.trim()) name.setValue(contact.name);
            name.flush();
          }}
        />
      </div>

      <div className="field">
        <Segmented<ContactType>
          label="סוג הגורם"
          value={contact.type}
          options={TYPE_OPTIONS}
          onChange={(type) => void updateContact(db, contact.id, { type })}
        />
      </div>

      <div className="action-bar" style={{ marginBlock: '4px 16px' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openCapture(`@${contact.name.trim().replace(/\s+/g, '_')} `)}
        >
          <Plus size={18} aria-hidden="true" />
          משימה מול הגורם
        </button>
        {contact.phone && (
          <a className="btn btn-secondary" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
            <Phone size={18} aria-hidden="true" />
            חיוג
          </a>
        )}
        {contact.email && (
          <a className="btn btn-secondary" href={`mailto:${contact.email}`}>
            <Mail size={18} aria-hidden="true" />
            מייל
          </a>
        )}
      </div>

      <Section title="ממתין מול הגורם" count={waiting.length}>
        {waiting.length === 0 ? (
          <div className="panel">
            <EmptyState title="לא ממתינים לשום דבר מהגורם הזה" />
          </div>
        ) : (
          <TaskList tasks={waiting} variant="waiting" hideOwner />
        )}
      </Section>

      {otherOpen.length > 0 && (
        <Section title="משימות פתוחות נוספות" count={otherOpen.length}>
          <TaskList tasks={otherOpen} hideOwner />
        </Section>
      )}

      <Section title="פרטים">
        <div className="panel">
          <div className="stack">
            <Field label="תפקיד או איש קשר" htmlFor={ids.role}>
              <input id={ids.role} className="input" value={role.value} onChange={(e) => role.onChange(e.target.value)} onBlur={role.flush} placeholder="למשל: מנהל עבודה, יוסי" />
            </Field>
            <div className="two-col">
              <Field label="טלפון" htmlFor={ids.phone}>
                <input id={ids.phone} type="tel" inputMode="tel" dir="ltr" className="input" value={phone.value} onChange={(e) => phone.onChange(e.target.value)} onBlur={phone.flush} />
              </Field>
              <Field label="מייל" htmlFor={ids.email}>
                <input id={ids.email} type="email" inputMode="email" dir="ltr" className="input" value={email.value} onChange={(e) => email.onChange(e.target.value)} onBlur={email.flush} />
              </Field>
            </div>
            <Field label="הערות" htmlFor={ids.notes}>
              <textarea id={ids.notes} className="textarea" value={notes.value} onChange={(e) => notes.onChange(e.target.value)} onBlur={notes.flush} />
            </Field>
          </div>
        </div>
      </Section>

      {done.length > 0 && (
        <Section title="נסגרו ב-90 הימים האחרונים" count={done.length}>
          <TaskList tasks={done} hideOwner />
        </Section>
      )}

      <button
        type="button"
        className="btn btn-danger btn-block"
        style={{ marginBlockStart: 28 }}
        onClick={async () => {
          await deleteContact(db, contact.id);
          navigate(href('contacts'));
          toast({ message: 'הגורם נמחק. המשימות מולו נשארו.', actionLabel: 'ביטול', onAction: () => void restoreContact(db, contact.id) });
        }}
      >
        <Trash2 size={18} aria-hidden="true" />
        מחיקת הגורם
      </button>
    </div>
  );
}
