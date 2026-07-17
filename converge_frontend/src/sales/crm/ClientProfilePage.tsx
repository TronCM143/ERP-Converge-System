import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues } from './ClientFormFields';
import { ClientSummary } from './ClientFormModal';
import QuotationsPage from '../quotation/QuotationsPage';
import QuotationDetailModal from '../quotation/QuotationDetailModal';
import { ArrowLeft, Edit2, Save, Search, X } from 'lucide-react';

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();
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

  const toFormValues = (c: ClientSummary): ClientFormValues => ({
    name: c.name,
    address: c.address,
    contactPerson: c.contactPerson || '',
    contactNumber: c.contactNumber || '',
    email: c.email || ''
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
          email: editValues.email.trim() || null
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

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black p-6">
        <Card className="p-12 text-center max-w-md mx-auto">
          <Search className="h-10 w-10 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400 mb-6">Client not found.</p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      {/* Side-by-side Content */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left Column - Client Information */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <Link to="/sales/crm" title="Back to CRM">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                  <CardTitle>Client Information</CardTitle>
                </div>
                {!isEditing && (
                  <Button variant="ghost" size="sm" onClick={startEditing}>
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
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase">Company Name</label>
                      <p className="text-slate-50 mt-1">{client.name}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase">Address</label>
                      <p className="text-slate-50 mt-1">{client.address}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase">Contact Person</label>
                      <p className="text-slate-50 mt-1">{client.contactPerson || '—'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase">Phone</label>
                      <p className="text-slate-50 mt-1">{client.contactNumber || '—'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase">Email</label>
                      <p className="text-slate-50 mt-1 truncate">{client.email || '—'}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Quotations */}
          <div className="lg:col-span-2">
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
