import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../../shared/PageHeader';
import { apiFetch } from '../../shared/api';
import './QuotationsListPage.css';

interface Quotation {
  id: number;
  quotationNumber: string;
  clientName: string;
  quotationName: string;
  grandTotal: number;
  status: string;
}

export default function QuotationsListPage() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchQuotations = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/quotations');
      if (res.ok) setQuotations(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const filteredQuotations = quotations.filter(
    (q) =>
      q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quotationName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

  return (
    <div className="quotations-list-page">
      <div className="quotations-list__header">
        <PageHeader title="Quotations" subtitle="All quotations across clients" />

        <div className="quotations-list__nav">
          <NavTab onClick={() => navigate('/sales/crm')}>CRM</NavTab>
          <NavTab active>Quotations</NavTab>
        </div>

        <input
          type="text"
          className="form-control quotations-list__search"
          placeholder="Search quotations…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="card empty-state">
          <div className="empty-state__text">Loading…</div>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state__icon">📋</div>
          <div className="empty-state__text">{searchQuery ? 'No quotations match your search.' : 'No quotations yet.'}</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Quotation #</th>
                <th>Client</th>
                <th>Name</th>
                <th>Grand Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((q) => (
                <tr key={q.id} className="quotation-row" onClick={() => navigate(`/sales/clients/${q.id}`)}>
                  <td style={{ fontWeight: 600 }}>{q.quotationNumber}</td>
                  <td>{q.clientName}</td>
                  <td>{q.quotationName}</td>
                  <td>{peso(q.grandTotal)}</td>
                  <td>
                    <span className={`badge badge--${q.status.toLowerCase()}`}>{q.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NavTab({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`crm-nav-tab ${active ? 'crm-nav-tab--active' : ''}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
