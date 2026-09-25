export default function SectionHeader({ eyebrow, title, description, actions, className = '' }) {
  return (
    <div className={`section-header ${className}`.trim()}>
      <div className="section-header__copy">
        {eyebrow && <p className="section-header__eyebrow">{eyebrow}</p>}
        <h1 className="section-header__title">{title}</h1>
        {description && <p className="section-header__description">{description}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </div>
  )
}
