import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const badgeVariants = cva('ui-badge', {
  variants: {
    tone: {
      neutral: 'ui-badge--neutral',
      primary: 'ui-badge--primary',
      accent: 'ui-badge--accent',
      success: 'ui-badge--success',
      outline: 'ui-badge--outline',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export default function Badge({ className, tone, ...props }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
