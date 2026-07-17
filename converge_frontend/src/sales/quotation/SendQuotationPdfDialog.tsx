import React from 'react';
import { FileText } from 'lucide-react';
import EmailRecipientPickerDialog, { EmailCandidate } from '../../shared/EmailRecipientPickerDialog';

interface Props {
  quotationNumber: string;
  candidates: EmailCandidate[];
  onConfirm: (emails: string[]) => void;
  onCancel: () => void;
}

export default function SendQuotationPdfDialog({ quotationNumber, candidates, onConfirm, onCancel }: Props) {
  return (
    <EmailRecipientPickerDialog
      icon={<FileText className="h-4 w-4" />}
      title={`Send Quotation ${quotationNumber}`}
      description="Choose who gets the PDF. This only affects this send — it won't change your saved notification recipients."
      candidates={candidates}
      cancelLabel="Cancel"
      confirmLabel="Send PDF"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
