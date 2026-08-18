import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues } from './ClientFormFields';
import ClientAccentPicker from './ClientAccentPicker';
import { ClientSummary } from './ClientFormModal';
import QuotationsPage from '../quotation/QuotationsPage';
import { AlertTriangle, ArrowLeft, Edit2, Save, Search, Trash2, X } from 'lucide-react';

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Non-404 load failures (500, network, auth). Tracked separately from
  // `notFound` so the page can offer a retry rather than claiming the client
  // doesn't exist.
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchClient = async () => {
    // No id in the URL (e.g. someone landed on /sales/clients/) — there is
    // nothing to fetch, and requesting /api/clients/undefined just 404s.
    if (!clientId) {
      setNotFound(true);
      return;
    }

    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await apiFetch(`/api/clients/${clientId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        // Anything that isn't a 404 used to fall through here silently, leaving
        // `client` null and the page rendering absolutely nothing.
        throw new Error(`Request failed (${res.status})`);
      }
      setClient(await res.json());
    } catch (err) {
      console.error('Failed to load client:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load this client.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  /* Arriving from a notification link like "?quotation=34" opens that quotation
     in the generator. The id is handed to the quotations list rather than opened
     here: the generator needs the whole quotation record, and the list is what
     fetches it. */
  const deepLinkQuotationId = (() => {
    const q = searchParams.get('quotation');
    if (!q) return undefined;
    const id = parseInt(q, 10);
    return Number.isNaN(id) ? undefined : id;
  })();

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

  /* Everything below replaces a bare `return null`, which rendered a blank
     page during loading AND on every non-404 failure — with no spinner, no
     message and no way back. */
  if (loadError) {
    return (
      <div className="min-h-screen app-surface p-6">
        <Card className="p-10 text-center max-w-md mx-auto">
          <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-rose-600" />
          <p className="text-zinc-100 font-semibold mb-1">Could not load this client.</p>
          <p className="text-[12px] text-zinc-500 mb-6">{loadError}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="secondary" onClick={() => void fetchClient()}>
              Try again
            </Button>
            <Link to="/sales/crm">
              <Button variant="secondary" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to CRM
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen app-surface p-6">
        <Card className="p-10 text-center max-w-md mx-auto">
          <p className="text-[13px] text-zinc-500 italic">
            {isLoading ? 'Loading client…' : 'No client to show.'}
          </p>
          {!isLoading && (
            <Link to="/sales/crm" className="inline-block mt-5">
              <Button variant="secondary" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to CRM
              </Button>
            </Link>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-36px)] overflow-hidden app-surface -translate-y-[-20px]">
      {/* Fixed-height page: nothing here scrolls except the quotation rows.
          flex-col so the back link takes its own height and the grid below
          claims the rest — h-full on the grid alone would have overflowed by
          exactly the height of the link. */}
      <div className="px-4 py-3 h-full flex flex-col ">
        {/* Top row: navigation on the left, the one destructive action on the
            far right. Delete used to live in the Client Information header
            beside Edit; the left column is only 23% wide, so no amount of
            spacing in there kept a destructive control clear of a routine one.
            Out here it is in the page corner, nowhere near Edit. */}
        <div className="mb-3 flex items-start justify-between gap-3">
          {/* There was no way back to the board from here except the browser
              button — this page is reached both from a card and from a
              notification link. */}
          <Link
            to="/sales/crm"
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Return to CRM
          </Link>

          {!isEditing && (
            /* The error reads under the button that caused it rather than in
               the card the button no longer belongs to. */
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={isDeleting}
                onClick={handleDeleteClient}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Delete client"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
            </div>
          )}
        </div>

        {/* Client details were a third of the width; they are ~30% narrower now
            (33% -> 23%), which is both what the panel needs once it is compact
            and what the five-column quotation table was short of. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(200px,23%)_1fr] gap-4 flex-1 min-h-0">
          {/* Left Column - Client Information (static; scrolls only itself if long) */}
          <div className="min-h-0 overflow-y-auto">
            <Card className="border-0">
              {/* Edit is the only control left in here — Delete moved to the
                  page's top-right corner so the two are never mistaken for
                  each other. */}
              <CardHeader className="flex flex-row items-center gap-1 space-y-0">
                <CardTitle className="text-lg font-semibold text-zinc-100">Client Information</CardTitle>
                {!isEditing && (
                  <Button variant="ghost" size="sm" onClick={startEditing} title="Edit client">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
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

                    {/* Card colour lives with the client, not on the board:
                        a picker on every kanban card was noisy and fought with
                        drag for the same pointer events. */}
                    <div className="pt-2.5 border-t border-zinc-800">
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Card Colour
                      </label>
                      <div className="mt-1">
                        <ClientAccentPicker
                          clientId={client.id}
                          clientName={client.name}
                          value={client.accentColor}
                          onSaved={(accentColor) =>
                            setClient((prev) => (prev ? { ...prev, accentColor } : prev))
                          }
                        />
                      </div>
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
            {/* Quotations open in the quotation generator, which the list owns
                itself — this page no longer holds a separate detail modal. */}
            <QuotationsPage
              client={client}
              autoOpenModal={autoOpenNewQuotation}
              openQuotationId={deepLinkQuotationId}
              onQuotationChanged={fetchClient}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
