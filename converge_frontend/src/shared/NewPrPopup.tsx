import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { NewPurchaseRequestNotification } from './useNotificationHub';
import './NewPrPopup.css';

export default function NewPrPopup({
  notification,
  onDismiss
}: {
  notification: NewPurchaseRequestNotification | null;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          className="pr-popup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            className="pr-popup"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pr-popup__icon">
              <Inbox className="h-8 w-8 mx-auto text-zinc-400" />
            </div>
            <div className="pr-popup__title">New Purchase Request</div>
            <div className="pr-popup__body">
              <strong>{notification.prNumber}</strong> from Sales for{' '}
              <strong>{notification.clientName}</strong>
              {notification.quotationNumber && (
                <>
                  {' '}
                  (Quotation {notification.quotationNumber})
                </>
              )}
              {' — '}
              {notification.itemCount} item{notification.itemCount === 1 ? '' : 's'}.
            </div>
            <div className="pr-popup__actions">
              <button className="btn" type="button" onClick={onDismiss}>
                Dismiss
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  onDismiss();
                  navigate('/purchasing/purchase-requests?tab=prs');
                }}
              >
                View Purchase Request
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
