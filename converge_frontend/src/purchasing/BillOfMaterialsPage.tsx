import React from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../shared/PageHeader';

export default function BillOfMaterialsPage() {
  const { billOfMaterialId } = useParams();

  return (
    <div>
      <PageHeader title="Bill of Materials" subtitle={billOfMaterialId ? `BOM: ${billOfMaterialId}` : undefined} />
      <div className="card">BOM items editable table will be implemented here.</div>
    </div>
  );
}

