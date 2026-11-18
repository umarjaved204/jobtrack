import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Mail, Pencil, Phone, Plus, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { applyServerError } from '@/features/auth/form-errors';
import { useFormAlert } from '@/features/auth/use-form-alert';
import { isApiError } from '@/lib/api/errors';
import type { Contact } from '@/types/application';

import { contactsQuery, useCreateContact, useDeleteContact, useUpdateContact } from './api';
import {
  contactFields,
  contactFormSchema,
  type ContactFormValues,
  contactFormValues,
  toContactInput,
  toContactPatch,
} from './contact-schema';

type Editing = { type: 'create' } | { type: 'edit'; contact: Contact };

function ContactForm({
  applicationId,
  editing,
  onDone,
}: {
  applicationId: string;
  editing: Editing;
  onDone: () => void;
}) {
  const create = useCreateContact(applicationId);
  const update = useUpdateContact(applicationId);
  const alert = useFormAlert();
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: contactFormValues(editing.type === 'edit' ? editing.contact : undefined),
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const field = (name: keyof ContactFormValues) => ({ error: errors[name]?.message });

  const onSubmit = form.handleSubmit(async (values) => {
    alert.clear();
    try {
      if (editing.type === 'create') {
        await create.mutateAsync(toContactInput(values));
      } else {
        const patch = toContactPatch(values, dirtyFields);
        if (Object.keys(patch).length) await update.mutateAsync({ id: editing.contact.id, patch });
      }
      onDone();
    } catch (error) {
      alert.showOutcome(applyServerError(error, form.setError, contactFields));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      {alert.message && <Alert>{alert.message}</Alert>}
      <FormField label="Name" {...field('name')}>
        <Input autoComplete="off" {...form.register('name')} />
      </FormField>
      <FormField label="Role" description="Recruiter, hiring manager…" {...field('role')}>
        <Input autoComplete="off" {...form.register('role')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Email" {...field('email')}>
          <Input
            type="email"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            {...form.register('email')}
          />
        </FormField>
        <FormField label="Phone" {...field('phone')}>
          <Input type="tel" autoComplete="off" {...form.register('phone')} />
        </FormField>
      </div>
      <FormField label="LinkedIn profile" {...field('linkedin_url')}>
        <Input
          type="url"
          inputMode="url"
          placeholder="https://…"
          {...form.register('linkedin_url')}
        />
      </FormField>
      <FormField label="Notes" {...field('notes')}>
        <Textarea rows={3} className="min-h-20" {...form.register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || alert.isWaiting}>
          {isSubmitting ? 'Saving…' : editing.type === 'create' ? 'Add contact' : 'Save contact'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ContactCard({
  contact,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="grid gap-1.5 border-b py-4 first:pt-0 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{contact.name}</h3>
          {contact.role && <p className="text-sm text-muted-foreground">{contact.role}</p>}
        </div>
        <div className="-mt-1 -mr-2 flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${contact.name}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${contact.name}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <ul className="grid gap-1 text-sm">
        {contact.email && (
          <li className="flex items-center gap-2">
            <Mail aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <a
              href={`mailto:${contact.email}`}
              className="break-all text-primary-text underline-offset-4 hover:underline"
            >
              {contact.email}
            </a>
          </li>
        )}
        {contact.phone && (
          <li className="flex items-center gap-2">
            <Phone aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
              className="font-mono underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          </li>
        )}
        {contact.linkedin_url && (
          <li className="flex items-center gap-2">
            <UserRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-text underline-offset-4 hover:underline"
            >
              Profile<span className="sr-only"> of {contact.name} (opens in a new tab)</span>
            </a>
          </li>
        )}
      </ul>
      {contact.notes && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{contact.notes}</p>
      )}
    </li>
  );
}

/** People at the company for this application: add, edit, delete (with a confirm). */
function ContactsSection({ applicationId }: { applicationId: string }) {
  const contacts = useQuery(contactsQuery(applicationId));
  const remove = useDeleteContact(applicationId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  let content;
  if (contacts.isPending) {
    content = <Skeleton className="h-16 w-full" />;
  } else if (contacts.isError) {
    content = (
      <Alert title="Contacts didn’t load">
        <p>{isApiError(contacts.error) ? contacts.error.detail : 'Something went wrong.'}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void contacts.refetch()}
        >
          <RotateCcw /> Try again
        </Button>
      </Alert>
    );
  } else if (contacts.data.length === 0) {
    content = (
      <p className="text-sm text-muted-foreground">
        No contacts yet. Add the recruiter or hiring manager so they’re easy to find later.
      </p>
    );
  } else {
    content = (
      <ul>
        {contacts.data.map((contact) => (
          <ContactCard
            key={contact.id}
            contact={contact}
            onEdit={() => setEditing({ type: 'edit', contact })}
            onDelete={() => {
              remove.reset();
              setDeleting(contact);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="contacts-heading" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="contacts-heading" className="font-display text-xl font-semibold">
          Contacts
        </h2>
        <Button variant="outline" size="sm" onClick={() => setEditing({ type: 'create' })}>
          <Plus /> Add contact
        </Button>
      </div>
      {content}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.type === 'edit' ? `Edit ${editing.contact.name}` : 'Add a contact'}
            </DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ContactForm
              key={editing.type === 'edit' ? editing.contact.id : 'new'}
              applicationId={applicationId}
              editing={editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this contact'}?`}
        description="Their details and notes are removed from this application."
        confirmLabel="Delete contact"
        pending={remove.isPending}
        error={
          remove.isError
            ? isApiError(remove.error)
              ? remove.error.detail
              : 'Couldn’t delete the contact. Try again.'
            : null
        }
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </section>
  );
}

export { ContactsSection };
