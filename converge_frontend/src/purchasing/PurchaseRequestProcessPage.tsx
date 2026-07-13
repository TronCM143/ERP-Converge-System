import React from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../shared/PageHeader';

export default function PurchaseRequestProcessPage() {
  const { purchaseRequestId } = useParams();

  return (
    <div>
      <PageHeader title="Purchase Request Process" subtitle={purchaseRequestId ? `PR: ${purchaseRequestId}` : undefined} />
      <div className="card">Workflow stepper will be implemented here.</div>
    </div>
  );
}

