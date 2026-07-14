import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const role = await login(username.trim(), password);
      const redirectTo = (location.state as { from?: string })?.from;
      navigate(redirectTo || roleHome(role), {
        replace: true
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="login-card__brand">
       
          <div>
            <div className="login-card__title">Converge.IT Solutions Inc.</div>
          
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
          
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              autoComplete="username"
            />
          </div>
          <div className="form-group">
          
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <motion.div
              className="login-card__error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
            >
              {error}
            </motion.div>
          )}

          <motion.button
            className="btn btn--primary login-card__submit"
            type="submit"
            disabled={isSubmitting}
            whileTap={{ scale: 0.98 }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
