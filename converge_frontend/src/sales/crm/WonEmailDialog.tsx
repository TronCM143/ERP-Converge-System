import React from 'react';
import { Mail } from 'lucide-react';
import EmailRecipientPickerDialog, { EmailCandidate } from '../../shared/EmailRecipientPickerDialog';

export type WonEmailCandidate = EmailCandidate;

interface Props {
  clientName: string;
  candidates: WonEmailCandidate[];
  onConfirm: (emails: string[]) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export default function WonEmailDialog({ clientName, candidates, onConfirm, onSkip, onCancel }: Props) {
  return (
    <EmailRecipientPickerDialog
      icon={<Mail className="h-4 w-4" />}
      title={`Notify — ${clientName} won`}
      description={
        'Choose who gets the "deal won" email. This only affects this send — it won\'t change your saved notification recipients.'
      }
      candidates={candidates}
      cancelLabel="Cancel"
      skipLabel="Skip Email"
      confirmLabel="Send Email"
      onConfirm={onConfirm}
      onSkip={onSkip}
      onCancel={onCancel}
    />
  );
}
