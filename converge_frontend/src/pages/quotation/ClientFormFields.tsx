import React from 'react';
import { Input } from '../../components/ui/input';

export interface ClientFormValues {
  name: string;
  address: string;
  contactPerson?: string;
  contactNumber?: string;
  email?: string;
}

interface ClientFormFieldsProps {
  values: ClientFormValues;
  onChange: (values: ClientFormValues) => void;
}

export default function ClientFormFields({ values, onChange }: ClientFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Company Name</label>
        <Input
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          placeholder="Acme Corp"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Address</label>
        <Input
          value={values.address}
          onChange={(e) => onChange({ ...values, address: e.target.value })}
          placeholder="123 Main St, City, Country"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Contact Person</label>
        <Input
          value={values.contactPerson || ''}
          onChange={(e) => onChange({ ...values, contactPerson: e.target.value })}
          placeholder="John Doe"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Phone</label>
        <Input
          value={values.contactNumber || ''}
          onChange={(e) => onChange({ ...values, contactNumber: e.target.value })}
          placeholder="+1 (555) 123-4567"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase">Email</label>
        <Input
          type="email"
          value={values.email || ''}
          onChange={(e) => onChange({ ...values, email: e.target.value })}
          placeholder="contact@example.com"
          className="mt-1"
        />
      </div>
    </div>
  );
}
