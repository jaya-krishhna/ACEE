import React from 'react';
import { clsx } from 'clsx';

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options?: SelectOption[];
  placeholder?: string;
  children?: React.ReactNode;
}

export function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  children,
  className,
  id,
  ...props
}: SelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-espresso">
          {label}
          {props.required && <span className="text-burgundy ml-0.5">*</span>}
        </label>
      )}
      <select
        {...props}
        id={inputId}
        className={clsx(
          'form-input',
          error && 'border-burgundy focus:border-burgundy focus:ring-burgundy',
          className,
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children
          ? children
          : options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
      </select>
      {error && <p className="text-xs text-burgundy">{error}</p>}
      {hint && !error && <p className="text-xs text-shadow">{hint}</p>}
    </div>
  );
}
