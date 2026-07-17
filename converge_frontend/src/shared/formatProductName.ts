// Product names are stored with underscores instead of spaces
// (e.g. "dahua_2mp_5tb"). This formats them for display only — the
// underlying stored value is never changed.
export function formatProductName(raw: string): string {
  return raw ? raw.replace(/_/g, ' ') : '';
}
