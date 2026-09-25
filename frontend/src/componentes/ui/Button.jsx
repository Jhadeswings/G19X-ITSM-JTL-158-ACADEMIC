import { forwardRef } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      primary: 'ui-button--primary',
      secondary: 'ui-button--secondary',
      ghost: 'ui-button--ghost',
      danger: 'ui-button--danger',
    },
    size: {
      default: 'ui-button--default',
      small: 'ui-button--small',
      large: 'ui-button--large',
      icon: 'ui-button--icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

const Button = forwardRef(function Button(
  { className, variant, size, loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="ui-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})

export { Button, buttonVariants }
