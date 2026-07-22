import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';
import { GlassMorphCard } from '../components/ui/glass-morph-card';

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
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-900 flex items-center justify-center p-6">
      {/* backdrop */}
      <div
        className="absolute inset-0 z-0
        [background:radial-gradient(ellipse_1100px_800px_at_50%_40%,rgba(59,130,246,0.18),transparent_70%),linear-gradient(to_bottom,rgba(2,6,23,0.25)_0%,rgba(2,6,23,0.55)_100%),url('/pexels-photo-2881233.jpg')_center/cover_no-repeat]"
      />

      {/* Glass morph card, centered */}
      <motion.div
        className="relative z-[1] w-full max-w-[420px]"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <GlassMorphCard glowColor="blue" intensity={8} className="w-full">
          <div className="w-full flex flex-col items-center px-10 py-12">
            {/* Logo */}
            <div className="mb-6 flex justify-center w-full">
              <img
                src="/CSiLogo.png"
                alt="Converge.IT Solutions Inc."
                className="h-16 w-auto"
              />
            </div>

            <h1 className="text-xl text-white mb-1 tracking-wide">Welcome!</h1>
            <p className="text-sm text-white/60 mb-8"></p>

            <form onSubmit={handleSubmit} className="w-full">
              <div className="mb-4">
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  autoComplete="username"
                  placeholder="Username"
                  className="w-full px-4 py-3.5 box-border text-[15px] text-white font-medium
                  bg-white/10 border border-white/20 rounded-[12px] backdrop-blur-sm
                  transition-all duration-200
                  placeholder:text-white/45 placeholder:font-normal
                  hover:bg-white/[0.14] hover:border-white/30
                  focus:outline-none focus:bg-white/[0.16] "
                />
              </div>

              <div className="mb-6">
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  className="w-full px-4 py-3.5 box-border text-[15px] text-white font-medium
                  bg-white/10 border border-white/20 rounded-[12px] backdrop-blur-sm
                  transition-all duration-200
                  placeholder:text-white/45 placeholder:font-normal
                  hover:bg-white/[0.14] hover:border-white/30
                  focus:outline-none focus:bg-white/[0.16] "
                />
              </div>

              {error && (
                <motion.div
                  className="bg-red-500/15 border border-red-400/30 text-red-200 font-medium
                  text-[13px] px-4 py-3 rounded-[12px] mb-6 overflow-hidden flex items-center gap-2"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 border-0 rounded-[12px] text-white
                bg-gradient-to-r from-cyan-500 to-blue-600
                text-[15px] font-semibold tracking-wide cursor-pointer
                shadow-[0_8px_24px_rgba(37,99,235,0.35)]
                transition-all duration-200
                enabled:hover:from-cyan-400 enabled:hover:to-blue-500 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_12px_28px_rgba(37,99,235,0.45)]
                disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </motion.button>
            </form>
          </div>
        </GlassMorphCard>
      </motion.div>
    </div>
  );
}
