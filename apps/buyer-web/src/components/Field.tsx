import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface BaseProps {
  label?: string
  error?: string
  hint?: string
}

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>

export function Input({ label, error, hint, id, className = '', ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={`field__control ${error ? 'field__control--error' : ''} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <span className="field__error" id={`${inputId}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ label, error, hint, id, className = '', ...rest }: TextareaProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={inputId}
        className={`field__control ${error ? 'field__control--error' : ''} ${className}`.trim()}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <span className="field__error" id={`${inputId}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export function Select({
  label,
  error,
  hint,
  id,
  className = '',
  children,
  ...rest
}: BaseProps & React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <select
        id={inputId}
        className={`field__control ${error ? 'field__control--error' : ''} ${className}`.trim()}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  )
}
