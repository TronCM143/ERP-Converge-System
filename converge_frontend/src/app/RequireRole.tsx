import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Role, useAuth } from './AuthContext';
import { roleHome } from './roleHome';

export default function RequireRole({
  role,
  children
}: {
  role: Role | Role[];
  children: React.ReactNode;
}) {
  const { isAuthenticated, isRestoring, role: currentRole } = useAuth();
  const location = useLocation();

  /* Deciding anything while the session is still being restored would redirect
     a signed-in user to /login and lose the page they asked for. */
  if (isRestoring) {
    return <div className="p-10 text-center text-[13px] italic text-zinc-500">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(currentRole!)) {
    return <Navigate to={roleHome(currentRole!)} replace />;
  }

  return <>{children}</>;
}
