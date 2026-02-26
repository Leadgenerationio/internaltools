'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ExportFile {
  url: string;
  name: string;
}

interface Props {
  /** Files to export (rendered video results) */
  files: ExportFile[];
  /** Only enable when renders are complete */
  disabled?: boolean;
}

interface DriveFolder {
  id: string;
  name: string;
}

type ExportStatus = 'idle' | 'loading-folders' | 'exporting' | 'done' | 'error';

interface ExportResult {
  exported: number;
  failed: number;
  total: number;
  folderUrl: string;
  results: Array<{ name: string; success: boolean; error?: string }>;
}

export default function GoogleDriveButton({ files, disabled }: Props) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>();
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportProgress, setExportProgress] = useState<string>('');

  const abortRef = useRef<AbortController | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check connection status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Listen for OAuth callback messages (from popup window)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'google-drive-callback') {
        if (event.data.success) {
          checkStatus();
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Auto-dismiss success messages after 8 seconds
  useEffect(() => {
    if (status === 'done') {
      dismissTimerRef.current = setTimeout(() => {
        setStatus('idle');
        setExportResult(null);
        setExportProgress('');
      }, 8000);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [status]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showFolderPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowFolderPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFolderPicker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/integrations/google-drive/status');
      const data = await res.json();
      setConnected(data.connected);
      setConnectedEmail(data.email);
    } catch {
      setConnected(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    try {
      const res = await fetch('/api/integrations/google-drive/auth');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      // Open OAuth in popup
      const popup = window.open(data.url, 'google-drive-auth', 'width=600,height=700,scrollbars=yes');
      if (!popup) {
        // Fallback: redirect in same window
        window.location.href = data.url;
      }
    } catch {
      setError('Failed to start Google Drive connection');
    }
  };

  const handleLoadFolders = async () => {
    setStatus('loading-folders');
    setError(null);
    try {
      const res = await fetch('/api/integrations/google-drive/folders');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setStatus('idle');
        if (res.status === 401) {
          setConnected(false);
        }
        return;
      }
      setFolders(data.folders);
      setShowFolderPicker(true);
      setStatus('idle');
    } catch {
      setError('Failed to load Drive folders');
      setStatus('idle');
    }
  };

  const handleExport = useCallback(async (folderId?: string) => {
    if (files.length === 0) return;

    setStatus('exporting');
    setError(null);
    setExportResult(null);
    setShowFolderPicker(false);
    setExportProgress(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''} to Google Drive...`);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/integrations/google-drive/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({ url: f.url, name: f.name })),
          folderId: folderId || undefined,
        }),
        signal: abort.signal,
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setStatus('error');
        if (res.status === 401) {
          setConnected(false);
        }
        return;
      }

      setExportResult(data);
      setStatus('done');

      if (data.failed === 0) {
        setExportProgress(`Exported ${data.exported} file${data.exported !== 1 ? 's' : ''} to Google Drive`);
      } else {
        setExportProgress(
          `Exported ${data.exported} of ${data.total} files (${data.failed} failed)`
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('idle');
        setExportProgress('');
        return;
      }
      setError(err.message || 'Export failed');
      setStatus('error');
    } finally {
      abortRef.current = null;
    }
  }, [files]);

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setExportProgress('');
  };

  // Still loading status
  if (connected === null) {
    return null;
  }

  // Not connected — show connect button
  if (!connected) {
    return (
      <div className="inline-flex flex-col items-start gap-1">
        <button
          onClick={handleConnect}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors border border-gray-600"
        >
          <GoogleDriveIcon />
          Connect Google Drive
        </button>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  // Connected — show export button with folder picker
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        {status === 'exporting' ? (
          <>
            <button
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg border border-blue-600"
            >
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Exporting...
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-950/70 border border-red-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                if (showFolderPicker) {
                  setShowFolderPicker(false);
                } else {
                  handleLoadFolders();
                }
              }}
              disabled={disabled || files.length === 0 || status === 'loading-folders'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors border border-gray-600"
            >
              <GoogleDriveIcon />
              {status === 'loading-folders' ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  Export to Drive ({files.length})
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {/* Folder picker dropdown */}
            {showFolderPicker && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-3 border-b border-gray-700">
                  <p className="text-xs text-gray-400 mb-2">Choose destination folder:</p>
                  <button
                    onClick={() => handleExport()}
                    className="w-full text-left px-3 py-2 text-sm text-white bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg transition-colors"
                  >
                    <span className="font-medium">Auto-create folder</span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Ad Maker Exports / {new Date().toISOString().split('T')[0]}
                    </span>
                  </button>
                </div>
                {folders.length > 0 && (
                  <div className="max-h-48 overflow-y-auto p-2">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleExport(folder.id)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {connectedEmail && (
                  <div className="p-2 border-t border-gray-700">
                    <p className="text-[10px] text-gray-500 px-1">
                      Connected as {connectedEmail}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress / result message */}
      {exportProgress && (
        <div
          className={`flex items-center gap-2 text-xs ${
            status === 'done' && exportResult?.failed === 0
              ? 'text-green-400'
              : status === 'done' && exportResult && exportResult.failed > 0
              ? 'text-yellow-400'
              : status === 'error'
              ? 'text-red-400'
              : 'text-blue-400'
          }`}
        >
          <span>{exportProgress}</span>
          {status === 'done' && exportResult?.folderUrl && (
            <a
              href={exportResult.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-300 font-medium"
            >
              Open in Drive
            </a>
          )}
        </div>
      )}

      {/* Per-file error details */}
      {status === 'done' && exportResult && exportResult.failed > 0 && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {exportResult.results
            .filter((r) => !r.success)
            .map((r, i) => (
              <p key={i}>
                Failed: {r.name} — {r.error}
              </p>
            ))}
        </div>
      )}

      {/* Error message */}
      {error && status === 'error' && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

/** Google Drive logo icon */
function GoogleDriveIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-20.4 35.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.4 13.15z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-10.1-17.5c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 23.8h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}
