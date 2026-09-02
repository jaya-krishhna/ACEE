'use client';

import React, { useState } from 'react';
import { Search, Mic, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  isLoading?: boolean;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = 'Search hackathons, internships, or ask AI (e.g., "AI hackathons in Chennai")...',
  className = '',
  isLoading = false,
}: SearchBarProps) {
  const [isListening, setIsListening] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(value);
    }
  };

  const handleVoiceSearch = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice search is not supported in your browser');
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        toast.success('Listening... Speak your query', { id: 'voice-search' });
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onChange(transcript);
        if (onSubmit) onSubmit(transcript);
        toast.success(`Voice input: "${transcript}"`, { id: 'voice-search' });
      };

      recognition.onerror = () => {
        setIsListening(false);
        toast.error('Voice search error. Please try typing.', { id: 'voice-search' });
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
      toast.error('Voice search is temporarily unavailable', { id: 'voice-search' });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative flex items-center w-full max-w-3xl mx-auto ${className}`}
      role="search"
    >
      <div className="relative flex items-center w-full bg-ivory border border-oat rounded-full shadow-sm hover:border-espresso/40 focus-within:border-burgundy focus-within:ring-2 focus-within:ring-burgundy/20 transition-all p-1.5 pl-5">
        <Sparkles className="w-5 h-5 text-burgundy shrink-0 mr-3" aria-hidden="true" />

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="Search events or ask AI"
          className="w-full bg-transparent text-espresso placeholder:text-shadow text-sm md:text-base focus:outline-none pr-2"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              if (onClear) onClear();
            }}
            aria-label="Clear search input"
            className="p-1 text-shadow hover:text-espresso rounded-full transition-colors mr-1 shrink-0"
          >
            <X size={18} />
          </button>
        )}

        <button
          type="button"
          onClick={handleVoiceSearch}
          aria-label={isListening ? 'Listening to voice search' : 'Start voice search'}
          className={`p-2 text-shadow hover:text-burgundy rounded-full transition-colors mr-1 shrink-0 ${
            isListening ? 'text-burgundy animate-pulse bg-burgundy/10' : ''
          }`}
          title="Voice search"
        >
          <Mic size={18} />
        </button>

        <button
          type="submit"
          aria-label="Submit search query"
          className="w-10 h-10 rounded-full bg-burgundy text-sunlit hover:bg-burgundy/90 active:bg-burgundy/80 flex items-center justify-center shrink-0 shadow-sm transition-colors disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? (
            <svg className="animate-spin h-5 w-5 text-sunlit" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <Search size={18} />
          )}
        </button>
      </div>
    </form>
  );
}
