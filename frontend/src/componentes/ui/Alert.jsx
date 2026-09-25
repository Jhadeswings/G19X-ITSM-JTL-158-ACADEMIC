import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '../../lib/utils.js'

const iconos = { error: AlertCircle, success: CheckCircle2, info: Info }

export default function Alert({ tone = 'info', title, children, className, ...props }) {
  const Icono = iconos[tone] || Info
  return (
    <div
      className={cn('ui-alert', `ui-alert--${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <Icono className="ui-alert__icon" aria-hidden="true" />
      <div className="ui-alert__content">
        {title && <strong className="ui-alert__title">{title}</strong>}
        {children && <div className="ui-alert__message">{children}</div>}
      </div>
    </div>
  )
}
