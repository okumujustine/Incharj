import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
}

export function Input({
  label,
  error,
  hint,
  leftElement,
  rightElement,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftElement && (
          <div className="absolute left-3 flex items-center text-text-muted pointer-events-none">
            {leftElement}
          </div>
        )}
        <input
          id={inputId}
          className={[
            'w-full h-9 bg-bg-surface text-text-primary text-sm',
            'border border-border rounded px-3',
            'placeholder:text-text-muted',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-150',
            error ? 'border-error focus:border-error focus:ring-error/30' : '',
            leftElement ? 'pl-9' : '',
            rightElement ? 'pr-9' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 flex items-center text-text-muted">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export function Textarea({ label, error, hint, className = '', id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={[
          'w-full bg-bg-surface text-text-primary text-sm',
          'border border-border rounded px-3 py-2',
          'placeholder:text-text-muted',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
          'disabled:opacity-50 disabled:cursor-not-allowed resize-none',
          'transition-colors duration-150',
          error ? 'border-error focus:border-error focus:ring-error/30' : '',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, hint, options, className = '', id, ...props }: SelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-text-secondary uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={[
          'w-full h-9 bg-bg-surface text-text-primary text-sm',
          'border border-border rounded px-3',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30',
          'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          'transition-colors duration-150 appearance-none',
          error ? 'border-error' : '',
          className,
        ].join(' ')}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-bg-elevated">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-error">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
}
