import React from 'react';
import PageHeader from '../shared/PageHeader';

export default function CreatePurchaseRequestPage() {
  return (
    <div>
      <PageHeader
        title="Create Purchase Request"
        breadcrumbItems={[{ label: 'Purchase Requests', href: '/purchasing/purchase-requests' }]}
      />
      <div className="card">Create PR form will be implemented here.</div>
    </div>
  );
}

