import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AuthProvider } from './app/AuthContext';
import ErrorBoundary from './app/ErrorBoundary';

import './globals.css';
import './styles/theme.css';

/* ErrorBoundary sits inside BrowserRouter (so its "Back to CRM" works) but
   outside App, so a crash in any route shows a message instead of unmounting
   the tree and leaving a blank white page. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

