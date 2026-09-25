export default function BrandMark({ compact = false, inverse = false, className = '' }) {
  return (
    <div className={`brand-mark ${inverse ? 'brand-mark--inverse' : ''} ${className}`.trim()}>
      <span className="brand-mark__symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="brand-mark__copy">
        <strong>TALENTO</strong>
        {!compact && <small>PluriOne</small>}
      </span>
    </div>
  )
}
