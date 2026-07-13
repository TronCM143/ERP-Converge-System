import React from 'react';

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
    <>
      <div className="form-group">
        <label>Company Name</label>
        <input type="text" className="form-control" value={values.name} onChange={set('name')} placeholder="e.g. Acme Corp" />
      </div>
      <div className="form-group">
        <label>Address</label>
        <input type="text" className="form-control" value={values.address} onChange={set('address')} placeholder="Client address" />
      </div>
      <div className="form-group">
        <label>Contact Person</label>
        <input
          type="text"
          className="form-control"
          value={values.contactPerson}
          onChange={set('contactPerson')}
          placeholder="Name of the point of contact"
        />
      </div>
      <div className="form-group">
        <label>Contact Number</label>
        <input type="text" className="form-control" value={values.contactNumber} onChange={set('contactNumber')} placeholder="Phone number" />
      </div>
      <div className="form-group">
        <label>Email</label>
        <input type="text" className="form-control" value={values.email} onChange={set('email')} placeholder="Email address" />
      </div>
    </>
  );
}
