import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toasts clear themselves. Keyed on the message so two identical failures in a
  // row still restart the timer rather than letting the first one expire early.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

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
    <div className="relative min-h-screen w-full bg-zinc-950 flex items-center justify-center p-6 overflow-hidden">
      {/* Subtle ambient spotlight effect for an elegant dark backdrop */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_0,transparent_60%)]" />

      {/* Aesthetic minimalist dark card */}
      <div className="relative z-10 w-full max-w-[400px] bg-zinc-950/80 backdrop-blur-md border border-zinc-800 p-10 shadow-[0_0_50px_rgba(0,0,0,0.6)]">
        <div className="w-full flex flex-col items-center">
          
          {/* Logo - elegantly faded and inverted */}
          <div className="mb-10 flex justify-center w-full">
            <img
              src="/CSiLogo.png"
              alt="Converge.IT Solutions Inc."
              className="h-12 w-auto filter invert grayscale opacity-75 hover:opacity-100 transition-opacity duration-500"
            />
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-6">
            
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold ml-1">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                autoComplete="username"
                className="w-full px-4 py-3.5 text-[14px] text-zinc-100 font-light
                bg-zinc-900/40 border border-zinc-800 rounded-none
                transition-all duration-300
                hover:border-zinc-600
                focus:outline-none focus:border-zinc-300 focus:bg-zinc-900/80 focus:ring-0"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-semibold ml-1">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3.5 text-[14px] text-zinc-100 font-light
                bg-zinc-900/40 border border-zinc-800 rounded-none
                transition-all duration-300
                hover:border-zinc-600
                focus:outline-none focus:border-zinc-300 focus:bg-zinc-900/80 focus:ring-0"
              />
            </div>

            {/* The error used to render here as a bordered block, which pushed
                the form down as it appeared. It is now a toast at the bottom of
                the viewport — see the end of this component. */}

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-zinc-100 text-zinc-950 border border-zinc-100 rounded-none
                text-[12px] font-bold uppercase tracking-[0.15em] cursor-pointer
                transition-all duration-300
                hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]
                disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Error toast: fixed to the bottom-centre of the viewport and above the
          card (z-50 vs the card's z-10), so it never shifts the form. Clears
          itself after 4s, and is dismissed immediately by the next submit. */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="login-error"
            role="alert"
            aria-live="assertive"
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5
              rounded-md bg-red-950/95 border border-red-500/60 text-red-100 text-[13px]
              shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="leading-none">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}