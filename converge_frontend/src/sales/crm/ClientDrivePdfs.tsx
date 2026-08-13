import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../shared/api';
import { Download, FileText, RefreshCw } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string | null;
  size: number | null;
  webViewLink: string | null;
}

const formatSize = (n: number | null) => {
  if (!n) return '';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

// Lists the quotation PDFs stored in this client's Google Drive subfolder
// (named after the client) and downloads them through the app's proxy.
export default function ClientDrivePdfs({ clientId }: { clientId: number }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [configured, setConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/drive/clients/${clientId}/quotations`);
      if (res.ok) {
        const data = await res.json();
        setConfigured(Boolean(data.configured));
        setFiles(Array.isArray(data.files) ? data.files : []);
      } else {
        setError('Could not load Drive files.');
      }
    } catch {
      setError('Could not load Drive files.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleDownload = async (file: DriveFile) => {
    setDownloadingId(file.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/drive/files/${file.id}/download`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'quotation.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download ${file.name}.`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Drive not set up on the server: stay quiet rather than showing an empty box.
  if (!configured) return null;

  return (
    <Card className="border-0 mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold text-zinc-100">Files in drive</CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchFiles} disabled={isLoading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        {isLoading ? (
          <p className="text-sm text-zinc-500 italic">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No PDFs in this client's Drive folder yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
              >
                <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{f.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {f.modifiedTime
                      ? new Date(f.modifiedTime).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
                      : ''}
                    {f.size ? ` · ${formatSize(f.size)}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(f)}
                  disabled={downloadingId === f.id}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
