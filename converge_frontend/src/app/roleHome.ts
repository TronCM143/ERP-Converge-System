import { Role } from './AuthContext';

export function roleHome(role: Role): string {
  switch (role) {
    case 'quotation':
      return '/sales/crm';
    case 'purchasing':
      return '/purchasing/purchase-requests';
    case 'admin':
      /* The module picker, not a module. Admin can reach Sales, Inventory and
         Purchasing, so landing straight in the CRM (as this used to) presented
         one area as though it were the whole app.

         RequireRole also redirects here on a denied route, so this must stay a
         page admin can always load — never a module page, or a denial could
         bounce between two guards. */
      return '/admin';
    default:
      return '/';
  }
}
