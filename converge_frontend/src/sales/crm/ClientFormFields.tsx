import React from 'react';

export interface ClientFormValues {
  name: string;
  address: string;
  // Kept in state (not rendered) so an existing client's contactPerson value
  // round-trips through edit-save untouched instead of being wiped to null -
  // the field was removed from the UI, not from what the form preserves.
  contactPerson: string;
  contactNumber: string;
  email: string;
  notes: string;
  // yyyy-MM-dd for the date input, or '' for none. Converted to/from the API's
  // ISO timestamp at the modal boundary.
  followUpDate: string;
}

export const emptyClientFormValues = (): ClientFormValues => ({
  name: '',
  address: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
  notes: '',
  followUpDate: ''
});

/* Shared by the New Client dialog and the edit form on a client's profile.

   showFollowUp is false for creation: a follow-up date is something you set once
   you are working the deal, not a question to answer before the client exists.
   It stays on the profile form, which is the only place it can now be set — the
   value itself is untouched either way, so hiding the input never clears a date
   already on the record (same treatment contactPerson gets above). */
export default function ClientFormFields({
  values,
  onChange,
  showFollowUp = true
}: {
  values: ClientFormValues;
  onChange: (values: ClientFormValues) => void;
  showFollowUp?: boolean;
}) {
  const set = (key: keyof ClientFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [key]: e.target.value });

  const fieldClass =
    'w-full px-3 py-2 bg-transparent text-zinc-50 placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors';

  return (
    <div className="space-y-3">
      <div className="border border-zinc-700/60 rounded-md overflow-hidden divide-y divide-zinc-700/60 bg-zinc-900/40">
        <input type="text" value={values.name} onChange={set('name')} placeholder="Client name" className={fieldClass} />
        <input type="text" value={values.address} onChange={set('address')} placeholder="Address" className={fieldClass} />
        <input
          type="text"
          value={values.contactNumber}
          onChange={set('contactNumber')}
          placeholder="Contact number"
          className={fieldClass}
        />
        <input type="text" value={values.email} onChange={set('email')} placeholder="Email address" className={fieldClass} />
        {/* Labelled, unlike the rest: an empty date input shows only "mm/dd/yyyy"
            chrome, so a placeholder-style hint has nowhere to live. */}
        {showFollowUp && (
          <label className="flex items-center gap-3 px-3 py-2">
            <span className="text-[13px] text-zinc-500 shrink-0">Follow-up</span>
            <input
              type="date"
              value={values.followUpDate}
              onChange={set('followUpDate')}
              className="flex-1 bg-transparent text-zinc-50 text-[14px] focus:outline-none"
            />
          </label>
        )}
      </div>

      <textarea
        value={values.notes}
        onChange={set('notes')}
        placeholder="Notes…"
        rows={3}
        className="w-full px-3 py-2 border border-zinc-700/60 rounded-md bg-zinc-900/40 text-zinc-50 text-sm italic placeholder-zinc-500 focus:outline-none focus:bg-zinc-700/40 transition-colors resize-none"
      />
    </div>
  );
}
