import React from 'react';
import { Input } from '../../components/ui/input';

export interface ClientFormValues {
  name: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
}

export const emptyClientFormValues = (): ClientFormValues => ({
  name: '',
  address: '',
  contactPerson: '',
  contactNumber: '',
  email: ''
});

export default function ClientFormFields({
  values,
  onChange
}: {
  values: ClientFormValues;
  onChange: (values: ClientFormValues) => void;
}) {
  const set = (key: keyof ClientFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: e.target.value });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Company Name</label>
        <Input type="text" value={values.name} onChange={set('name')} placeholder="e.g. Acme Corp" className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Address</label>
        <Input type="text" value={values.address} onChange={set('address')} placeholder="Client address" className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Contact Person</label>
        <Input
          type="text"
          value={values.contactPerson}
          onChange={set('contactPerson')}
          placeholder="Name of the point of contact"
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Contact Number</label>
        <Input type="text" value={values.contactNumber} onChange={set('contactNumber')} placeholder="Phone number" className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Email</label>
        <Input type="text" value={values.email} onChange={set('email')} placeholder="Email address" className="mt-1" />
      </div>
    </div>
  );
}
