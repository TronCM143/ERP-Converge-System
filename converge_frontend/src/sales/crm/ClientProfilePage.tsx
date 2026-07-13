import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../../shared/PageHeader';
import { apiFetch } from '../../shared/api';
import ClientFormFields, { ClientFormValues } from './ClientFormFields';
import { ClientSummary } from './ClientFormModal';
import QuotationsPage from '../quotation/QuotationsPage';
import QuotationDetailModal from '../quotation/QuotationDetailModal';
import './ClientProfilePage.css';

type Tab = 'overview' | 'quotations';

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<ClientFormValues | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
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
      <div className="card empty-state">
        <div className="empty-state__icon">🔍</div>
        <div className="empty-state__text">Client not found.</div>
        <Link className="btn" to="/sales/crm" style={{ marginTop: '12px', display: 'inline-block' }}>
          Back to CRM
        </Link>
      </div>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <div className="client-profile">
      <div className="client-profile__header">
        <div className="client-profile__header-content">
          <div className="client-profile__back">
            <Link to="/sales/crm">← Back to CRM</Link>
          </div>
          <div className="client-profile__title-section">
            <h1 className="client-profile__title">{client.name}</h1>
            <p className="client-profile__meta">
              Client since {new Date(client.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="client-profile__badge">
            <span className={`badge badge--${client.stage.toLowerCase()}`}>{client.stage}</span>
          </div>
        </div>

        <div className="client-profile__tabs">
          <button
            className={`client-profile__tab ${activeTab === 'overview' ? 'client-profile__tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`client-profile__tab ${activeTab === 'quotations' ? 'client-profile__tab--active' : ''}`}
            onClick={() => setActiveTab('quotations')}
          >
            Quotations
          </button>
        </div>
      </div>

      <div className="client-profile__content">
        {activeTab === 'overview' && (
          <div className="client-profile__overview">
            <div className="card">
              <div className="panel-header">
                <h2>Client Information</h2>
                {!isEditing && (
                  <button className="btn" type="button" onClick={startEditing}>
                    Edit
                  </button>
                )}
              </div>

              {isEditing && editValues ? (
                <form onSubmit={handleSaveEdit}>
                  <ClientFormFields values={editValues} onChange={setEditValues} />
                  <div className="action-bar">
                    <button className="btn" type="button" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                    <button className="btn btn--primary" type="submit" disabled={isLoading}>
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="form-group">
                    <label>Company Name</label>
                    <div className="form-control form-control--static">{client.name}</div>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <div className="form-control form-control--static">{client.address}</div>
                  </div>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <div className="form-control form-control--static">{client.contactPerson || '—'}</div>
                  </div>
                  <div className="form-group">
                    <label>Contact Number</label>
                    <div className="form-control form-control--static">{client.contactNumber || '—'}</div>
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <div className="form-control form-control--static">{client.email || '—'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'quotations' && (
          <QuotationsPage
            client={client}
            onQuotationChanged={fetchClient}
            onQuotationSelect={setSelectedQuotationId}
          />
        )}
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
