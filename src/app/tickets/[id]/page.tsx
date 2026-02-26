'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface TicketUser {
  id: string;
  name: string | null;
  email: string;
}

interface TicketMessage {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  user: TicketUser | null;
}

interface TicketDetail {
  id: string;
  ticketNumber: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  user: TicketUser;
  messages: TicketMessage[];
}

function statusBadge(status: string): string {
  switch (status) {
    case 'OPEN': return 'bg-blue-900/50 text-blue-400';
    case 'IN_PROGRESS': return 'bg-yellow-900/50 text-yellow-400';
    case 'WAITING_ON_CUSTOMER': return 'bg-orange-900/50 text-orange-400';
    case 'RESOLVED': return 'bg-green-900/50 text-green-400';
    case 'CLOSED': return 'bg-gray-700 text-gray-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Open';
    case 'IN_PROGRESS': return 'In Progress';
    case 'WAITING_ON_CUSTOMER': return 'Waiting on You';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return status;
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'LOW': return 'bg-gray-700 text-gray-400';
    case 'NORMAL': return 'bg-blue-900/50 text-blue-400';
    case 'HIGH': return 'bg-orange-900/50 text-orange-400';
    case 'URGENT': return 'bg-red-900/50 text-red-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function categoryBadge(category: string): string {
  switch (category) {
    case 'BILLING': return 'bg-purple-900/50 text-purple-400';
    case 'TECHNICAL': return 'bg-blue-900/50 text-blue-400';
    case 'FEATURE_REQUEST': return 'bg-green-900/50 text-green-400';
    case 'ACCOUNT': return 'bg-yellow-900/50 text-yellow-400';
    case 'OTHER': return 'bg-gray-700 text-gray-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'BILLING': return 'Billing';
    case 'TECHNICAL': return 'Technical';
    case 'FEATURE_REQUEST': return 'Feature Request';
    case 'ACCOUNT': return 'Account';
    case 'OTHER': return 'Other';
    default: return category;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTicket = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load ticket');
      }
      const data = await res.json();
      setTicket(data.ticket);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchTicket();
  }, [status, fetchTicket]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (ticket?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.messages]);

  // Auto-dismiss success messages after 5s
  useEffect(() => {
    if (successMsg) {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessMsg(''), 5000);
    }
  }, [successMsg]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyBody.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send reply');
      }

      const data = await res.json();

      // Optimistically add the new message and update status
      setTicket((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, data.message],
          status: data.reopened ? 'OPEN' : prev.status,
          updatedAt: new Date().toISOString(),
        };
      });

      setReplyBody('');
      if (data.reopened) {
        setSuccessMsg('Reply sent and ticket reopened.');
      } else {
        setSuccessMsg('Reply sent.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    // Send a message which auto-reopens
    if (!replyBody.trim()) {
      setError('Please add a message to reopen the ticket');
      return;
    }
    handleReply({ preventDefault: () => {} } as React.FormEvent);
  };

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (status === 'unauthenticated') return null;

  if (error && !ticket) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <Link
            href="/tickets"
            className="inline-block px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
          >
            Back to Tickets
          </Link>
        </div>
      </main>
    );
  }

  if (!ticket) return null;

  const isClosed = ticket.status === 'CLOSED';
  const isResolved = ticket.status === 'RESOLVED';

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/tickets" className="text-gray-400 hover:text-white text-sm">
              &larr; Back to Tickets
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Ticket Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start gap-3 mb-3">
            <span className="text-gray-500 font-mono text-sm">#{ticket.ticketNumber}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(ticket.status)}`}>
              {statusLabel(ticket.status)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge(ticket.priority)}`}>
              {ticket.priority}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge(ticket.category)}`}>
              {categoryLabel(ticket.category)}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{ticket.subject}</h1>
          <p className="text-sm text-gray-500">
            Opened by {ticket.user.name || ticket.user.email} on {formatDateTime(ticket.createdAt)}
          </p>
        </div>

        {/* Success Message */}
        {successMsg && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-xl text-green-300 text-sm">
            {successMsg}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
            <button
              onClick={() => setError('')}
              className="ml-3 text-red-400 hover:text-red-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Thread */}
        <div className="space-y-4 mb-8">
          {ticket.messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl p-5 ${
                message.isStaff
                  ? 'bg-gray-800 border-l-4 border-l-blue-500 border border-gray-700'
                  : 'bg-gray-800/50 border border-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    message.isStaff
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-200'
                  }`}
                >
                  {(message.user?.name || message.user?.email || '?')[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white">
                  {message.user?.name || message.user?.email || 'System'}
                </span>
                {message.isStaff && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 font-medium">
                    Staff
                  </span>
                )}
                <span className="text-xs text-gray-500 ml-auto">
                  {formatDateTime(message.createdAt)}
                </span>
              </div>
              <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {message.body}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Form */}
        {!isClosed && (
          <div className="border-t border-gray-800 pt-6">
            <form onSubmit={isResolved ? (e) => { e.preventDefault(); handleReopen(); } : handleReply}>
              <label htmlFor="reply" className="block text-sm font-medium text-gray-300 mb-2">
                {isResolved ? 'Add a reply to reopen this ticket' : 'Reply'}
              </label>
              <textarea
                id="reply"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={isResolved ? 'Add your message to reopen this ticket...' : 'Type your reply...'}
                rows={4}
                maxLength={5000}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[100px]"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-500">{replyBody.length}/5,000</p>
                <div className="flex items-center gap-3">
                  {isResolved && (
                    <button
                      type="submit"
                      disabled={submitting || !replyBody.trim()}
                      className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {submitting ? 'Sending...' : 'Reopen & Reply'}
                    </button>
                  )}
                  {!isResolved && (
                    <button
                      type="submit"
                      disabled={submitting || !replyBody.trim()}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {submitting ? 'Sending...' : 'Send Reply'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Closed ticket notice */}
        {isClosed && (
          <div className="border-t border-gray-800 pt-6">
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 text-center">
              <p className="text-gray-400 text-sm">
                This ticket was closed{ticket.closedAt ? ` on ${formatDateTime(ticket.closedAt)}` : ''}.
                If you need further help, please{' '}
                <Link href="/tickets/new" className="text-blue-400 hover:text-blue-300 underline">
                  create a new ticket
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
