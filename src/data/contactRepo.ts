import { createContact, type NewContactInput } from '../domain/contacts';
import type { Contact } from '../domain/types';
import type { LishkaDB } from './db';

export type ContactPatch = Partial<Pick<Contact, 'name' | 'type' | 'role' | 'phone' | 'email' | 'notes'>>;

export async function addContact(db: LishkaDB, input: NewContactInput): Promise<Contact> {
  const contact = createContact(input);
  await db.contacts.add(contact);
  return contact;
}

export async function updateContact(db: LishkaDB, id: string, patch: ContactPatch): Promise<void> {
  await db.contacts.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteContact(db: LishkaDB, id: string): Promise<void> {
  const now = Date.now();
  await db.contacts.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreContact(db: LishkaDB, id: string): Promise<void> {
  await db.contacts.update(id, { deletedAt: null, updatedAt: Date.now() });
}
