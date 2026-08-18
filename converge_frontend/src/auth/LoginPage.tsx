import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { roleHome } from '../app/roleHome';

/* Split login screen.

   Layout note: the photo panel and the blue corner shapes are absolutely
   positioned and clipped with `clip-path`, rather than being flex siblings.
   The diagonal seam has to cut ACROSS the boundary between the photo and the
   form, which a flex row can't express — the two children would each need to
   know the other's slope. Positioning them independently over one container
   keeps the angles in one place and lets the form panel stay a normal
   centred column.

   Below `lg` the photo and the corner shapes are dropped entirely and the form
   becomes a plain centred card: the diagonals only read well when there's real
   width to cut across. */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  /* Shared field styling: transparent background with dark blue text and border.
     The `autofill:` rules override Chrome's default autofill background, forcing
     a white inset shadow to blend with the form, keeping text dark blue. */
  const fieldClass = `
    w-full border border-[#3a598f] bg-transparent px-3 py-2
    text-[14px] text-[#3a598f] outline-none transition-colors duration-200
    placeholder:text-[#8ba3c7]
    hover:border-[#6b8ec0]
    focus:border-[#6b8ec0] focus:ring-0
    autofill:[-webkit-text-fill-color:#3a598f]
    autofill:[box-shadow:0_0_0_1000px_#fff_inset]
    autofill:[caret-color:#3a598f]
  `;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">

      {/* ── Photo panel ──────────────────────────────────────────────────
         Clipped so its right edge is a diagonal: narrower at the top, wider
         at the bottom, which is what opens up the white wedge the form sits
         in. */}
      <div
        className="absolute inset-y-0 left-0 hidden lg:block w-[72%]"
        style={{ clipPath: 'polygon(0 0, 86% 0, 100% 100%, 0 100%)' }}
      >
        <img
          src="/login-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        {/* Dark blue/grey wash to match the image aesthetics and hold the text */}
        <div className="absolute inset-0 bg-[#2b446b]/50" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1b2f4c]/85 via-[#1b2f4c]/40 to-transparent" />

        {/* Statement, bottom-left */}
        <div className="absolute bottom-0 left-0 p-12 xl:p-16">
          <h1 className="text-4xl xl:text-5xl font-light leading-[1.18] tracking-tight text-white">
            Your Vision
            <br />
            Our Expertise
            <br />
            We Make
            <span className="font-normal text-orange-500"> IT </span>
            Work
          </h1>
        </div>
      </div>

      {/* ── Blue & White corner shapes ───────────────────────────────────
         Two angled band clusters top-right and bottom-right.
         White layers act as borders/gaps between the photo and the blue planes. */}
      <div className="hidden lg:block pointer-events-none" aria-hidden="true">
        {/* top-right */}
        {/* Layer 1: White outer border */}
        <div
          className="absolute top-0 right-0 h-[28%] w-[48%] bg-white"
          style={{ clipPath: 'polygon(18% 0, 100% 0, 100% 66%, 0 0)' }}
        />
        {/* Layer 2: Dark Blue */}
        <div
          className="absolute top-0 right-0 h-[26%] w-[46%] bg-[#3a598f]"
          style={{ clipPath: 'polygon(22% 0, 100% 0, 100% 62%, 0 0)' }}
        />
        {/* Layer 3: White inner border */}
        <div
          className="absolute top-0 right-0 h-[22%] w-[36%] bg-white"
          style={{ clipPath: 'polygon(34% 0, 100% 0, 100% 78%, 0 0)' }}
        />
        {/* Layer 4: Light Blue */}
        <div
          className="absolute top-0 right-0 h-[20%] w-[34%] bg-[#6b8ec0]"
          style={{ clipPath: 'polygon(38% 0, 100% 0, 100% 74%, 0 0)' }}
        />

        {/* bottom-right */}
        {/* Layer 1: White outer border */}
        <div
          className="absolute bottom-0 right-0 h-[28%] w-[48%] bg-white"
          style={{ clipPath: 'polygon(0 100%, 100% 34%, 100% 100%, 0 100%)' }}
        />
        {/* Layer 2: Dark Blue */}
        <div
          className="absolute bottom-0 right-0 h-[26%] w-[46%] bg-[#3a598f]"
          style={{ clipPath: 'polygon(0 100%, 100% 38%, 100% 100%, 0 100%)' }}
        />
        {/* Layer 3: White inner border */}
        <div
          className="absolute bottom-0 right-0 h-[20%] w-[34%] bg-white"
          style={{ clipPath: 'polygon(0 100%, 100% 22%, 100% 100%, 0 100%)' }}
        />
        {/* Layer 4: Light Blue */}
        <div
          className="absolute bottom-0 right-0 h-[18%] w-[32%] bg-[#6b8ec0]"
          style={{ clipPath: 'polygon(0 100%, 100% 26%, 100% 100%, 0 100%)' }}
        />
      </div>

      {/* ── Form panel ───────────────────────────────────────────────────
         Sits above the shapes (z-10) and is pushed to the right by ml-auto. */}
      <div className="relative z-10 ml-auto flex min-h-screen w-full lg:w-[34%] xl:w-[32%] items-center justify-center px-8 py-12">
        <div className="w-full max-w-[300px]">

          {/* Logo, inside the panel and above the greeting. */}
          <div className="mb-5 flex justify-center">
            <img
              src="/CSiLogo.png"
              alt="Converge.IT Solutions Inc."
              className="h-auto w-[210px] max-w-full object-contain"
            />
          </div>

          <h2 className="mb-10 text-center text-[20px] font-semibold tracking-tight text-[#3a598f]">
            Welcome back.
          </h2>

          <form onSubmit={handleSubmit} className="space-y-7">

            <div>
              <label
                htmlFor="login-username"
                className="mb-0.5 block text-[12px] text-[#3a598f]"
              >
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
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-0.5 block text-[12px] text-[#3a598f]"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={fieldClass}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="
                  w-full bg-[#3a598f] py-2.5 text-[13px] font-medium text-white
                  transition-colors duration-200
                  hover:bg-[#2a4570]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a598f] focus-visible:ring-offset-2
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              >
                {isSubmitting ? 'Signing in…' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="login-error"
            role="alert"
            aria-live="assertive"
            className="
              fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5
              border border-red-800 bg-red-700 px-4 py-2.5 text-[13px] text-red-50
              shadow-[0_8px_24px_-6px_rgba(15,35,64,0.24)]
            "
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 shrink-0 text-red-100"
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