import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
    <div className="relative min-h-screen w-full overflow-hidden flex justify-end items-center p-[5vh_6vw] box-border max-[900px]:justify-center">
      {/* Backs the panel's "backdrop-filter: url(#liquid-glass-distortion)" */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="8" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="blurredNoise" />
            <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* backdrop */}
      <div
        className="absolute inset-0 z-0
        [background:radial-gradient(ellipse_900px_700px_at_82%_50%,rgba(59,130,246,0.16),transparent_70%),linear-gradient(to_right,rgba(2,6,23,0.15)_0%,rgba(2,6,23,0.35)_100%),url('/pexels-photo-2881233.jpg')_center/cover_no-repeat]"
      />

      {/* Logo */}
      <img
        src="/CSiLogo.png"
        alt="Converge.IT Solutions Inc."
        className="absolute top-10 left-10 z-[2] h-12 w-auto
        drop-shadow-[0_2px_6px_rgba(2,6,23,0.35)]
        max-[480px]:h-9 max-[480px]:top-6 max-[480px]:left-6"
      />

      {/* Liquid glass card */}
      <motion.div
        className="relative z-[1] flex justify-center items-center
        w-[42%] min-w-[400px] max-w-[460px] max-h-[90vh]
        p-[64px_48px] box-border overflow-hidden rounded-[32px]
        bg-white/55 border border-white/50
        [-webkit-backdrop-filter:blur(20px)_saturate(160%)]
        [backdrop-filter:url(#liquid-glass-distortion)_blur(20px)_saturate(160%)]
        [box-shadow:0_20px_60px_rgba(2,6,23,0.35),0_2px_8px_rgba(2,6,23,0.12),inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.15)]
        before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:p-px before:pointer-events-none
        before:[background:linear-gradient(135deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.15)_35%,rgba(255,255,255,0)_55%)]
        before:[-webkit-mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]
        before:[-webkit-mask-composite:xor] before:[mask-composite:exclude]
        max-[900px]:w-full max-[900px]:min-w-0 max-[900px]:max-w-[480px]
        max-[480px]:p-[48px_32px] max-[480px]:rounded-[24px]"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative z-[1] w-full max-w-[340px]">
          
          {/* Added Header for Visual Hierarchy */}
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Welcome Back</h2>
            <p className="text-sm text-slate-600 mt-1.5 font-medium">Please sign in to your account</p>
          </div>

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
                className="w-full px-4 py-3.5 box-border text-[15px] text-slate-900 font-medium
                bg-white/70 border border-[rgba(15,23,42,0.14)] rounded-[12px]
                transition-all duration-200 shadow-sm
                placeholder:text-[rgba(71,85,105,0.55)] placeholder:font-normal
                hover:border-[rgba(15,23,42,0.24)] hover:bg-white/80
                focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                className="w-full px-4 py-3.5 box-border text-[15px] text-slate-900 font-medium
                bg-white/70 border border-[rgba(15,23,42,0.14)] rounded-[12px]
                transition-all duration-200 shadow-sm
                placeholder:text-[rgba(71,85,105,0.55)] placeholder:font-normal
                hover:border-[rgba(15,23,42,0.24)] hover:bg-white/80
                focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {error && (
              <motion.div
                className="bg-red-50/90 border border-red-200 text-red-600 font-medium
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
              className="w-full py-3.5 border-0 rounded-[12px] bg-blue-600 text-white
              text-[15px] font-semibold tracking-wide cursor-pointer
              shadow-[0_8px_20px_rgba(37,99,235,0.25)]
              transition-all duration-200
              enabled:hover:bg-blue-700 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_12px_24px_rgba(37,99,235,0.35)]
              disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}