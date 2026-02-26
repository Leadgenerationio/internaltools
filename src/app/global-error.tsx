'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#030712',
          color: '#f9fafb',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            backgroundColor: '#1f2937',
            borderRadius: '12px',
            padding: '48px',
            maxWidth: '480px',
            width: '100%',
            margin: '24px',
            textAlign: 'center',
            border: '1px solid #374151',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '28px',
            }}
          >
            !
          </div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#f9fafb',
              margin: '0 0 12px',
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#9ca3af',
              margin: '0 0 32px',
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. The error has been reported and we will
            look into it. You can try again or refresh the page.
          </p>
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 32px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseOver={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = '#2563eb')
            }
            onMouseOut={(e) =>
              ((e.target as HTMLButtonElement).style.backgroundColor = '#3b82f6')
            }
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                fontSize: '12px',
                color: '#6b7280',
                margin: '24px 0 0',
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
