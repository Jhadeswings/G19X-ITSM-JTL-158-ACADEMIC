import { cn } from '../lib/utils.js'

export default function MetricCard({ label, value, description, icon: Icon, action, className, children, ...props }) {
  return (
    <article className={cn('metric-card', className)} {...props}>
      <div className="metric-card__top">
        <h2 className="metric-card__label">{label}</h2>
        {Icon && <span className="metric-card__icon" aria-hidden="true"><Icon /></span>}
      </div>
      {value !== undefined && value !== null && <p className="metric-card__value">{value}</p>}
      {description && <p className="metric-card__description">{description}</p>}
      {children}
      {action && <div className="metric-card__action">{action}</div>}
    </article>
  )
}
