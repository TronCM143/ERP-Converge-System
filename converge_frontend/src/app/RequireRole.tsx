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
  const { isAuthenticated, role: currentRole } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!allowedRoles.includes(currentRole!)) {
    return <Navigate to={roleHome(currentRole!)} replace />;
  }

  return <>{children}</>;
}
