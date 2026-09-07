import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'sm'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  type?: 'button' | 'submit'
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading
  const sizeClass = size === 'lg' ? ' btn--lg' : size === 'sm' ? ' btn--sm' : ''

  return (
    <button
      type={type}
      className={`btn btn--${variant}${sizeClass}${block ? ' btn--block' : ''} ${className}`.trim()}
      disabled={inactive}
      aria-busy={loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
