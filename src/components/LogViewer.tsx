'use client';

import { useState, useEffect, useCallback } from 'react';

export default function LogViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      setLogs([`Error fetching logs: ${e}`]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 2000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  return (
    <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-left text-xs text-gray-500 hover:text-gray-400 hover:bg-gray-800/50"
      >
        <span>📋 Debug logs</span>
        <span className="text-gray-600">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="border-t border-gray-700 max-h-64 overflow-y-auto p-3 font-mono text-xs">
          {loading && logs.length === 0 ? (
            <p className="text-gray-500">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-500">No logs yet. Try uploading a video.</p>
          ) : (
            <pre className="text-gray-300 whitespace-pre-wrap break-words">
              {logs.map((line, i) => (
                <div key={i} className={line.includes('ERROR') ? 'text-red-400' : line.includes('WARN') ? 'text-yellow-400' : ''}>
                  {line}
                </div>
              ))}
            </pre>
          )}
          <button
            onClick={fetchLogs}
            className="mt-2 text-blue-400 hover:text-blue-300 text-xs"
          >
            Refresh now
          </button>
        </div>
      )}
    </div>
  );
}
