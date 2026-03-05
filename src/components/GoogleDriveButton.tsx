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
  hasChildren: boolean;
}

type ExportStatus = 'idle' | 'loading-folders' | 'exporting' | 'done' | 'error';

interface ExportResult {
  exported: number;
  failed: number;
  total: number;
  folderUrl: string;
  results: Array<{ name: string; success: boolean; error?: string }>;
}

/** Extract folder ID from a Google Drive URL */
function extractFolderIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  // Match: https://drive.google.com/drive/folders/FOLDER_ID or /drive/u/0/folders/FOLDER_ID
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // If it looks like a raw folder ID (no slashes, alphanumeric)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
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

  // Folder navigation state
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteError, setPasteError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!showFolderPicker) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchQuery.length === 0) {
      // Reset to current folder level
      loadFolders(folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined);
      return;
    }

    if (searchQuery.length < 2) return;

    searchTimerRef.current = setTimeout(() => {
      loadFolders(undefined, searchQuery);
    }, 300);
  }, [searchQuery]);

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
        window.location.href = data.url;
      }
    } catch {
      setError('Failed to start Google Drive connection');
    }
  };

  const loadFolders = async (parentId?: string, search?: string) => {
    setStatus('loading-folders');
    setError(null);
    setIsSearching(!!search);
    try {
      const params = new URLSearchParams();
      if (parentId) params.set('parentId', parentId);
      if (search) params.set('search', search);

      const res = await fetch(`/api/integrations/google-drive/folders?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setStatus('idle');
        if (res.status === 401) setConnected(false);
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

  const handleOpenPicker = () => {
    if (showFolderPicker) {
      setShowFolderPicker(false);
    } else {
      setFolderStack([]);
      setSearchQuery('');
      setPasteUrl('');
      setPasteError('');
      loadFolders();
    }
  };

  const handleNavigateInto = (folder: DriveFolder) => {
    setSearchQuery('');
    setFolderStack((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFolders(folder.id);
  };

  const handleNavigateBack = () => {
    setSearchQuery('');
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined;
    loadFolders(parentId);
  };

  const handlePasteExport = () => {
    setPasteError('');
    const folderId = extractFolderIdFromUrl(pasteUrl);
    if (!folderId) {
      setPasteError('Invalid Google Drive folder link');
      return;
    }
    handleExport(folderId);
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
        if (res.status === 401) setConnected(false);
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

  const currentParentName = folderStack.length > 0 ? folderStack[folderStack.length - 1].name : 'My Drive';

  // Still loading status
  if (connected === null) return null;

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
              onClick={handleOpenPicker}
              disabled={disabled || files.length === 0 || status === 'loading-folders'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors border border-gray-600"
            >
              <GoogleDriveIcon />
              {status === 'loading-folders' && !showFolderPicker ? (
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
              <div className="absolute top-full left-0 mt-1 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                {/* Auto-create option */}
                <div className="p-3 border-b border-gray-700">
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

                {/* Search */}
                <div className="p-2 border-b border-gray-700">
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search folders..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Breadcrumb / Back button */}
                {!isSearching && folderStack.length > 0 && (
                  <div className="px-3 pt-2 pb-1 flex items-center gap-1">
                    <button
                      onClick={handleNavigateBack}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back
                    </button>
                    <span className="text-xs text-gray-500 ml-1 truncate">/ {currentParentName}</span>
                  </div>
                )}

                {isSearching && searchQuery && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-xs text-gray-500">Results for &quot;{searchQuery}&quot;</span>
                  </div>
                )}

                {/* Folder list */}
                <div className="max-h-52 overflow-y-auto p-2">
                  {status === 'loading-folders' ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : folders.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-3">
                      {searchQuery ? 'No folders found' : 'No subfolders'}
                    </p>
                  ) : (
                    folders.map((folder) => (
                      <div key={folder.id} className="flex items-center group">
                        <button
                          onClick={() => handleExport(folder.id)}
                          className="flex-1 text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2 min-w-0"
                          title={`Export to "${folder.name}"`}
                        >
                          <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          </svg>
                          <span className="truncate">{folder.name}</span>
                        </button>
                        {folder.hasChildren && (
                          <button
                            onClick={() => handleNavigateInto(folder)}
                            className="shrink-0 p-1.5 text-gray-500 hover:text-white hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Browse subfolders"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Paste URL section */}
                <div className="p-2 border-t border-gray-700">
                  <p className="text-[10px] text-gray-500 px-1 mb-1.5">Or paste a Google Drive folder link:</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={pasteUrl}
                      onChange={(e) => { setPasteUrl(e.target.value); setPasteError(''); }}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-600 min-w-0"
                    />
                    <button
                      onClick={handlePasteExport}
                      disabled={!pasteUrl.trim()}
                      className="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                    >
                      Go
                    </button>
                  </div>
                  {pasteError && <p className="text-[10px] text-red-400 px-1 mt-1">{pasteError}</p>}
                </div>

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
