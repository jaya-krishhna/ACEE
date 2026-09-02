import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-espresso">
          {label}
          {props.required && <span className="text-burgundy ml-0.5">*</span>}
        </label>
      )}
      <input
        {...props}
        id={inputId}
        className={clsx(
          'form-input',
          error && 'border-burgundy focus:border-burgundy focus:ring-burgundy',
          className,
        )}
      />
      {error && <p className="text-xs text-burgundy">{error}</p>}
      {hint && !error && <p className="text-xs text-shadow">{hint}</p>}
    </div>
  );
}
