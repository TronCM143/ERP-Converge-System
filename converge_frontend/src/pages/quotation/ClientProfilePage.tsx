import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import PageHeader from '../../shared/PageHeader';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues } from './ClientFormFields';
import { ClientSummary } from './ClientFormModal';
import HistoryTimeline from '../../shared/HistoryTimeline';
import QuotationDetailModal from './QuotationDetailModal';
import { ArrowLeft, Edit2, Save, X } from 'lucide-react';

interface Quotation {
  id: number;
  quotationNumber: string;
  quotationName: string;
  status: string;
  grandTotal: number;
  createdAt: string;
}

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
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
      if (res.ok) {
        const data = await res.json();
        setClient(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQuotations = async () => {
    try {
      const res = await apiFetch(`/api/quotations?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setQuotations(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchClient();
    fetchQuotations();
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
          contactPerson: (editValues.contactPerson || '').trim() || null,
          contactNumber: (editValues.contactNumber || '').trim() || null,
          email: (editValues.email || '').trim() || null
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
      <div className="min-h-screen app-surface p-6">
        <Card className="p-12 text-center max-w-md mx-auto">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-zinc-400 mb-6">Client not found.</p>
          <Link className="inline-block" to="/quotation/crm">
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
    <div className="min-h-screen app-surface">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900/80 via-zinc-950/80 to-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/quotation/crm">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to CRM
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100 tracking-[0.06em]">
                {client.name}
              </h1>
              <p className="text-zinc-400 text-sm mt-1">
                Client since {new Date(client.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Badge variant="default" className="px-4 py-2 text-base">
              {client.stage}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Client Information */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Client Information</CardTitle>
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
                      <label className="text-xs font-semibold text-zinc-400 uppercase">Company Name</label>
                      <p className="text-zinc-50 mt-1">{client.name}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase">Address</label>
                      <p className="text-zinc-50 mt-1">{client.address}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase">Contact Person</label>
                      <p className="text-zinc-50 mt-1">{editValues?.contactPerson || '—'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase">Phone</label>
                      <p className="text-zinc-50 mt-1">{editValues?.contactNumber || '—'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-400 uppercase">Email</label>
                      <p className="text-zinc-50 mt-1 truncate">{editValues?.email || '—'}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity History</CardTitle>
              </CardHeader>
              <CardContent>
                <HistoryTimeline entityType="Client" entityId={client.id} />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Quotations */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Quotations</CardTitle>
                  <Badge variant="secondary">{quotations.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {quotations.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">📋</div>
                    <p className="text-zinc-400">No quotations yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quotations.map((quote) => (
                      <motion.div
                        key={quote.id}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => setSelectedQuotationId(quote.id)}
                        className="p-4 rounded-lg border border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold text-zinc-50 group-hover:text-zinc-100 transition-colors">
                                {quote.quotationNumber}
                              </h4>
                              <Badge
                                variant={
                                  quote.status === 'Draft'
                                    ? 'secondary'
                                    : quote.status === 'Approved'
                                    ? 'success'
                                    : quote.status === 'Rejected'
                                    ? 'destructive'
                                    : 'default'
                                }
                                className="text-xs"
                              >
                                {quote.status}
                              </Badge>
                            </div>
                            <p className="text-zinc-400 text-sm mt-1">{quote.quotationName}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-zinc-50">₱{quote.grandTotal.toLocaleString()}</p>
                            <p className="text-zinc-400 text-xs mt-1">
                              {new Date(quote.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
