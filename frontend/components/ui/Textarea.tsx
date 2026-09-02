import React from 'react';
import { clsx } from 'clsx';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className, id, rows = 4, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-espresso">
          {label}
          {props.required && <span className="text-burgundy ml-0.5">*</span>}
        </label>
      )}
      <textarea
        {...props}
        id={inputId}
        rows={rows}
        className={clsx(
          'form-input resize-y',
          error && 'border-burgundy focus:border-burgundy focus:ring-burgundy',
          className,
        )}
      />
      {error && <p className="text-xs text-burgundy">{error}</p>}
      {hint && !error && <p className="text-xs text-shadow">{hint}</p>}
    </div>
  );
}
