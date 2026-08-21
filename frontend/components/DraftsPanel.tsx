'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import { deleteRecipeDraft, getRecipeDrafts } from '@/lib/api';
import type { RecipeDraftSummary } from '@hestia/shared/types';

export const DRAFTS_QUERY_KEY = ['recipe-drafts'] as const;

/** Minute-granularity relative time — a draft saved 40 seconds ago should say so. */
function savedAgo(iso?: string): string {
  if (!iso) return '';
  // Timestamps come back from FastAPI without a zone suffix but are UTC.
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(normalized).toLocaleDateString();
}

function summaryLine(draft: RecipeDraftSummary): string {
  const parts: string[] = [];
  if (draft.ingredient_count) parts.push(`${draft.ingredient_count} ingredient${draft.ingredient_count === 1 ? '' : 's'}`);
  if (draft.instruction_count) parts.push(`${draft.instruction_count} step${draft.instruction_count === 1 ? '' : 's'}`);
  if (parts.length === 0) parts.push('Nothing added yet');
  return `${parts.join(' · ')} · saved ${savedAgo(draft.updated_at)}`;
}

interface DraftsPanelProps {
  /** Load this draft back into the form. */
  onResume: (draftId: string) => void;
  /** The draft currently open in the form, if any — highlighted in the list. */
  activeDraftId: string | null;
  /** Id being loaded, so the row can show a spinner. */
  resumingId: string | null;
  /** Fired after a successful delete, so the parent can clear the form if the
   * deleted draft was the one open in it. */
  onDeleted: (draftId: string) => void;
}

/**
 * The saved-drafts list inside the add-recipe panel. Each row either resumes
 * editing or is deleted; there's nothing else a half-finished recipe can do.
 */
export default function DraftsPanel({ onResume, activeDraftId, resumingId, onDeleted }: DraftsPanelProps) {
  const queryClient = useQueryClient();
  const { data: drafts, isLoading } = useQuery<RecipeDraftSummary[]>({
    queryKey: DRAFTS_QUERY_KEY,
    queryFn: getRecipeDrafts,
  });

  const remove = useMutation({
    mutationFn: deleteRecipeDraft,
    onSuccess: (_data, draftId) => {
      queryClient.invalidateQueries({ queryKey: DRAFTS_QUERY_KEY });
      onDeleted(draftId);
    },
    onError: () => alert('Could not delete that draft. Try again in a moment.'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 bg-[#CC5500]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileText className="w-7 h-7 text-[#CC5500]" />
        </div>
        <h3 className="text-lg font-serif font-medium text-gray-800 mb-1">No saved drafts</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Start writing a recipe and it saves itself here automatically — close the tab
          whenever you like and pick it up later.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {drafts.map((draft) => {
        const isActive = draft.id === activeDraftId;
        const isResuming = draft.id === resumingId;
        return (
          <li
            key={draft.id}
            className={`flex items-center gap-3 bg-white border rounded-xl p-4 shadow-sm transition-colors ${
              isActive ? 'border-[#CC5500]/40 ring-1 ring-[#CC5500]/20' : 'border-gray-100'
            }`}
          >
            <button
              onClick={() => onResume(draft.id)}
              disabled={isResuming}
              className="flex-1 min-w-0 text-left"
            >
              <p className="font-serif text-base text-gray-800 truncate">
                {draft.title?.trim() || 'Untitled draft'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{summaryLine(draft)}</p>
            </button>

            {isResuming ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
            ) : (
              <span className="text-xs font-medium text-[#CC5500] whitespace-nowrap shrink-0">
                {isActive ? 'Open' : 'Continue'}
              </span>
            )}

            <button
              onClick={() => {
                const label = draft.title?.trim() || 'this untitled draft';
                if (confirm(`Delete ${label}? This can't be undone.`)) remove.mutate(draft.id);
              }}
              disabled={remove.isPending && remove.variables === draft.id}
              aria-label="Delete draft"
              title="Delete draft"
              className="p-2 -mr-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
