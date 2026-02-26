'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-400 mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
