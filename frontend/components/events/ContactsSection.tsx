import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export interface ContactRow {
  name: string;
  phone: string;
  email: string;
  role_label: string;
}

interface ContactsSectionProps {
  contacts: ContactRow[];
  onChange: (contacts: ContactRow[]) => void;
}

export function ContactsSection({ contacts, onChange }: ContactsSectionProps) {
  const addContact = () => {
    onChange([...contacts, { name: '', phone: '', email: '', role_label: '' }]);
  };

  const removeContact = (index: number) => {
    const newContacts = [...contacts];
    newContacts.splice(index, 1);
    onChange(newContacts);
  };

  const updateContact = (index: number, field: keyof ContactRow, value: string) => {
    const newContacts = [...contacts];
    newContacts[index][field] = value;
    onChange(newContacts);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif font-bold text-espresso">Contacts (Optional)</h3>
        <Button type="button" variant="secondary" size="sm" onClick={addContact}>
          Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-sm text-shadow bg-ivory p-4 rounded-[10px] text-center border border-oat">
          No contacts added. Click "Add contact" to add organizers or support contacts.
        </div>
      ) : (
        <div className="space-y-4">
          {contacts.map((contact, index) => (
            <div key={index} className="bg-ivory p-4 rounded-[10px] relative border border-oat">
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="absolute top-2 right-2 text-shadow hover:text-burgundy w-6 h-6 flex items-center justify-center rounded-full bg-sunlit shadow-sm border border-oat"
                title="Remove contact"
              >
                &times;
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <Input
                  label="Name"
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="e.g. John Doe"
                />
                <Input
                  label="Role label"
                  value={contact.role_label}
                  onChange={(e) => updateContact(index, 'role_label', e.target.value)}
                  placeholder="e.g. Event Coordinator"
                />
                <Input
                  label="Email"
                  type="email"
                  value={contact.email}
                  onChange={(e) => updateContact(index, 'email', e.target.value)}
                  placeholder="e.g. john@example.com"
                />
                <Input
                  label="Phone"
                  value={contact.phone}
                  onChange={(e) => updateContact(index, 'phone', e.target.value)}
                  placeholder="e.g. +1234567890"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
