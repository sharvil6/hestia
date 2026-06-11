import React, { useState, useRef, useMemo } from 'react';
import { X, Tag as TagIcon, Plus } from 'lucide-react';
import { getTags } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Tag } from '@hestia/shared/types';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Tag editor with add / delete and autocomplete suggestions drawn from the
 * set of tags already used across recipes. Every tag is normalized to
 * lowercase before it leaves this component.
 */
export default function TagInput({ value, onChange }: TagInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: getTags,
  });

  const normalized = input.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!normalized) return [];
    return (allTags || [])
      .map((t) => t.name)
      .filter((name) => name.includes(normalized) && !value.includes(name))
      .slice(0, 6);
  }, [allTags, normalized, value]);

  // Whether the typed text is itself a brand-new tag worth offering to create.
  const showCreate =
    normalized.length > 0 &&
    !value.includes(normalized) &&
    !suggestions.includes(normalized);

  const addTag = (raw: string) => {
    const name = raw.trim().toLowerCase();
    if (!name || value.includes(name)) {
      setInput('');
      setHighlight(0);
      return;
    }
    onChange([...value, name]);
    setInput('');
    setHighlight(0);
  };

  const removeTag = (name: string) => {
    onChange(value.filter((t) => t !== name));
  };

  // Combined option list the arrow keys move through: existing matches first,
  // then the "create" affordance when relevant.
  const options = useMemo(
    () => [...suggestions, ...(showCreate ? [normalized] : [])],
    [suggestions, showCreate, normalized]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const choice = options[highlight] ?? normalized;
      addTag(choice);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setInput('');
    }
  };

  const showDropdown = isFocused && options.length > 0;

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-serif font-medium text-gray-800 flex items-center">
        <TagIcon className="w-4 h-4 mr-2 text-[#8A9A5B]" /> Tags
      </h3>

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-[#8A9A5B]/50 focus-within:border-[#8A9A5B] transition-colors">
          {value.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 bg-[#8A9A5B]/10 text-[#5f6b3d] border border-[#8A9A5B]/25 rounded-full pl-3 pr-2 py-1 text-xs font-medium uppercase tracking-wide"
            >
              {name}
              <button
                type="button"
                onClick={() => removeTag(name)}
                aria-label={`Remove ${name}`}
                className="text-[#8A9A5B] hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 120)}
            placeholder={value.length === 0 ? 'e.g. dinner, vegetarian, quick' : 'Add a tag...'}
            className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none py-1"
          />
        </div>

        {showDropdown && (
          <ul className="absolute z-20 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
            {suggestions.map((name, idx) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(name)}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    highlight === idx ? 'bg-[#8A9A5B]/10 text-[#5f6b3d]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <TagIcon className="w-3.5 h-3.5 text-[#8A9A5B]" />
                  {name}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(normalized)}
                  onMouseEnter={() => setHighlight(suggestions.length)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                    highlight === suggestions.length ? 'bg-[#CC5500]/10 text-[#CC5500]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-[#CC5500]" />
                  Create <span className="font-semibold">{normalized}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
