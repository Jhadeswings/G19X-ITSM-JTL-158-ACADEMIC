import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn('ui-input', invalid && 'ui-input--invalid', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
})

export { Input }
