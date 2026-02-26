'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import TemplatePickerModal from '@/components/TemplatePickerModal';

interface ProjectSummary {
  id: string;
  name: string;
  brief: { productService?: string } | null;
  updatedAt: string;
  createdAt: string;
  adCount: number;
  videoCount: number;
  renderCount: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trimEnd() + '...';
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProjects = useCallback(async (pageNum: number) => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/projects?page=${pageNum}&pageSize=20`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load projects');
      }
      const data = await res.json();
      setProjects(data.projects);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth redirect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch projects when authenticated
  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchProjects(page);
  }, [status, page, fetchProjects]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Auto-dismiss confirmDelete after 5s
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 5000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  // Auto-dismiss success message after 5s
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleNewProject = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Project' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create project');
      }
      const data = await res.json();
      // Navigate to the wizard with the new project ID
      router.push(`/?projectId=${data.project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      setCreating(false);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/templates/${templateId}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create project from template');
      }
      const data = await res.json();
      setShowTemplateModal(false);
      router.push(`/?projectId=${data.project.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project from template');
      setCreating(false);
    }
  };

  const handleStartFromScratch = () => {
    setShowTemplateModal(false);
    handleNewProject();
  };

  const handleDelete = async (projectId: string) => {
    if (confirmDelete !== projectId) {
      setConfirmDelete(projectId);
      return;
    }

    setDeleting(projectId);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete project');
      }
      // Remove from local state immediately
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (pagination) {
        setPagination({ ...pagination, totalCount: pagination.totalCount - 1 });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setDeleting(null);
    }
  };

  const handleDuplicate = async (projectId: string) => {
    setDuplicating(projectId);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to duplicate project');
      }
      const data = await res.json();
      // Add the duplicate to the top of the list
      setProjects((prev) => [data.project, ...prev]);
      if (pagination) {
        setPagination({ ...pagination, totalCount: pagination.totalCount + 1 });
      }
      setSuccessMessage(`Project duplicated! "${data.project.name}"`);
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate project');
    } finally {
      setDuplicating(null);
    }
  };

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-white">Projects</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTemplateModal(true)}
              disabled={creating}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : '+ New Project'}
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
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

        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-xl text-green-300 text-sm flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              className="ml-3 text-green-400 hover:text-green-200 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-gray-400">Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">No projects yet</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md">
              Create your first project to start building video ads with AI-generated copy,
              custom overlays, and background music.
            </p>
            <button
              onClick={() => setShowTemplateModal(true)}
              disabled={creating}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : 'Create Your First Project'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden group"
                >
                  <Link
                    href={`/?projectId=${project.id}`}
                    className="block p-5"
                  >
                    <h3 className="text-white font-semibold text-base group-hover:text-blue-400 transition-colors">
                      {project.name}
                    </h3>
                    {project.brief?.productService && (
                      <p className="text-gray-400 text-sm mt-1 leading-snug">
                        {truncate(project.brief.productService, 80)}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {project.adCount} ad{project.adCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {project.videoCount} video{project.videoCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {project.renderCount} render{project.renderCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <p className="text-gray-600 text-xs mt-3">
                      Updated {formatDate(project.updatedAt)}
                    </p>
                  </Link>

                  <div className="border-t border-gray-700/50 px-5 py-2.5 flex justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDuplicate(project.id);
                      }}
                      disabled={duplicating === project.id}
                      className="text-xs px-2.5 py-1 rounded-md transition-colors text-gray-500 hover:text-blue-400 hover:bg-gray-700/50 disabled:opacity-50"
                    >
                      {duplicating === project.id ? (
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          Duplicating...
                        </span>
                      ) : (
                        'Duplicate'
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(project.id);
                      }}
                      disabled={deleting === project.id}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                        confirmDelete === project.id
                          ? 'bg-red-600 text-white hover:bg-red-500'
                          : 'text-gray-500 hover:text-red-400 hover:bg-gray-700/50'
                      } disabled:opacity-50`}
                    >
                      {deleting === project.id
                        ? 'Deleting...'
                        : confirmDelete === project.id
                        ? 'Click again to confirm'
                        : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Template Picker Modal */}
      <TemplatePickerModal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={handleTemplateSelect}
        onStartFromScratch={handleStartFromScratch}
        loading={creating}
      />
    </main>
  );
}
