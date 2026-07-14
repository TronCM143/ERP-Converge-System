import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { apiFetch } from '../../shared/api';

export interface ClientSummary {
  id: number;
  name: string;
  address: string;
  contactPerson?: string;
  contactNumber?: string;
  email?: string;
  stage: string;
  quotationCount: number;
  lastUpdated: string;
  createdAt: string;
}

interface ClientFormModalProps {
  onClose: () => void;
  onSaved: (client: ClientSummary) => void;
}

export default function ClientFormModal({ onClose, onSaved }: ClientFormModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contactPerson: '',
    contactNumber: '',
    email: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) return;

    try {
      setIsLoading(true);
      const res = await apiFetch('/api/clients', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const client = await res.json();
        onSaved(client);
      }
    } catch (err) {
      console.error('Failed to create client:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>Create a new client to get started</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Company Name *</label>
            <Input
              required
              placeholder="Acme Corp"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Address *</label>
            <Input
              required
              placeholder="123 Main St, City, Country"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Contact Person</label>
            <Input
              placeholder="John Doe"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Phone</label>
            <Input
              placeholder="+1 (555) 123-4567"
              value={formData.contactNumber}
              onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Email</label>
            <Input
              type="email"
              placeholder="contact@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Creating...' : 'Create Client'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
