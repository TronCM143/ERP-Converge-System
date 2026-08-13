import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues } from './ClientFormFields';
import { ClientSummary } from './ClientFormModal';
import QuotationsPage from '../quotation/QuotationsPage';
import QuotationDetailModal from '../quotation/QuotationDetailModal';
import { ArrowLeft, Edit2, Save, Search, Trash2, X } from 'lucide-react';

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Set when arriving from the "Quotation Generator" button on the
  // all-quotations page: opens the new-quotation modal immediately.
  const autoOpenNewQuotation = searchParams.get('newQuotation') === '1';

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<ClientFormValues | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchClient = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/clients/${clientId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) setClient(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  // Arriving from a notification link like "?quotation=34" opens that
  // quotation's detail modal directly.
  useEffect(() => {
    const q = searchParams.get('quotation');
    if (!q) return;
    const id = parseInt(q, 10);
    if (!Number.isNaN(id)) setSelectedQuotationId(id);
  }, [searchParams]);

  const toFormValues = (c: ClientSummary): ClientFormValues => ({
    name: c.name,
    address: c.address,
    contactPerson: c.contactPerson || '',
    contactNumber: c.contactNumber || '',
    email: c.email || '',
    notes: c.notes || '',
    // ISO timestamp → yyyy-MM-dd, which is the only form <input type="date">
    // accepts; anything else silently renders as blank.
    followUpDate: c.followUpDate ? c.followUpDate.slice(0, 10) : ''
  });

  const startEditing = () => {
    if (!client) return;
    setEditValues(toFormValues(client));
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !editValues) return;

    if (!editValues.name.trim() || !editValues.address.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editValues.name.trim(),
          address: editValues.address.trim(),
          contactPerson: editValues.contactPerson.trim() || null,
          contactNumber: editValues.contactNumber.trim() || null,
          email: editValues.email.trim() || null,
          notes: editValues.notes.trim() || null,
          // Clearing the box sends null, which the API stores as "nothing scheduled".
          followUpDate: editValues.followUpDate ? new Date(editValues.followUpDate).toISOString() : null
        })
      });
      if (!res.ok) {
        throw new Error('Failed to update client.');
      }
      setClient(await res.json());
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!client) return;
    if (!window.confirm(`Delete "${client.name}"? This can't be undone.`)) return;

    setDeleteError(null);
    try {
      setIsDeleting(true);
      const res = await apiFetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete client.');
      }
      navigate('/sales/crm', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete client.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen app-surface p-6">
        <Card className="p-12 text-center max-w-md mx-auto">
          <Search className="h-10 w-10 mx-auto mb-4 text-zinc-600" />
          <p className="text-zinc-400 mb-6">Client not found.</p>
          <Link to="/sales/crm">
            <Button variant="secondary" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to CRM
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <div className="h-[calc(100vh-36px)] overflow-hidden app-surface -translate-y-[-20px]">
      {/* Fixed-height page: nothing here scrolls except the quotation rows.
          flex-col so the back link takes its own height and the grid below
          claims the rest — h-full on the grid alone would have overflowed by
          exactly the height of the link. */}
      <div className="px-4 py-3 h-full flex flex-col ">
        {/* There was no way back to the board from here except the browser
            button — this page is reached both from a card and from a
            notification link. */}
        <Link
          to="/sales/crm"
          className="inline-flex items-center gap-1.5 self-start mb-3 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Return to CRM
        </Link>

        {/* Client details were a third of the width; they are ~30% narrower now
            (33% -> 23%), which is both what the panel needs once it is compact
            and what the five-column quotation table was short of. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,23%)_1fr] gap-4 flex-1 min-h-0">
          {/* Left Column - Client Information (static; scrolls only itself if long) */}
          <div className="min-h-0 overflow-y-auto">
            <Card className="border-0">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg font-semibold text-zinc-100">Client Information</CardTitle>
                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={startEditing}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting}
                      onClick={handleDeleteClient}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      title="Delete client"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              {deleteError && (
                <p className="px-6 -mt-2 mb-2 text-xs text-red-400">{deleteError}</p>
              )}
              <CardContent>
                {isEditing && editValues ? (
                  <form onSubmit={handleSaveEdit} className="space-y-4">
                    <ClientFormFields values={editValues} onChange={setEditValues} />
                    <div className="flex gap-2 pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                        className="flex-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        size="sm"
                        className="flex-1"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                ) : (
                  /* Order is deliberate: identity, then how to reach them, then
                     where they are, then free text. Total Sales is last and
                     ruled off — it is a financial summary, not a detail of the
                     client. space-y-2.5 rather than 4: the old gaps made a
                     seven-field panel scroll for no reason. */
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Client Name</label>
                      {/* The one prominent line in the panel. */}
                      <p className="text-[17px] font-semibold leading-tight text-zinc-50 mt-0.5">{client.name}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Contact Person</label>
                      <p className="text-[14px] text-zinc-200 leading-tight mt-0.5">{client.contactPerson || '—'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Phone</label>
                      <p className="text-[14px] text-zinc-200 leading-tight mt-0.5">{client.contactNumber || '—'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Email</label>
                      <p className="text-[14px] text-zinc-200 leading-tight mt-0.5 break-words">{client.email || '—'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Address</label>
                      <p className="text-[14px] text-zinc-200 leading-tight mt-0.5">{client.address}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Note</label>
                      <p className="text-[14px] text-zinc-300 leading-snug mt-0.5 whitespace-pre-wrap">{client.notes || '—'}</p>
                    </div>

                    <div className="pt-2.5 border-t border-zinc-800">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Total Sales</label>
                      <p className="text-[17px] font-bold text-zinc-100 tabular-nums leading-tight mt-0.5">
                        {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(client.totalSales)}
                      </p>
                      {/* Approved quotations only — a Sent quotation is not a
                          sale, so this can read ₱0.00 while quotations exist. */}
                      <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">From approved quotations only</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Quotations (header/columns static, rows scroll) */}
          <div className="min-h-0 h-full">
            <QuotationsPage
              client={client}
              autoOpenModal={autoOpenNewQuotation}
              onQuotationChanged={fetchClient}
              onQuotationSelect={setSelectedQuotationId}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedQuotationId && (
          <QuotationDetailModal
            quotationId={selectedQuotationId}
            onClose={() => setSelectedQuotationId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
