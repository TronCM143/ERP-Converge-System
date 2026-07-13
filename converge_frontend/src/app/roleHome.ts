import { Role } from './AuthContext';

export function roleHome(role: Role): string {
  switch (role) {
    case 'quotation':
      return '/sales/crm';
    case 'purchasing':
      return '/purchasing/purchase-requests';
    case 'admin':
      // Admin oversees the CRM pipeline; settings stay in the profile menu.
      return '/sales/crm';
    default:
      return '/';
  }
}
