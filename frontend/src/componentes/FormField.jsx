export default function FormField({ id, label, hint, error, required, children }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="form-field__hint" id={hintId}>{hint}</p>}
      {error && <p className="form-field__error" id={errorId} role="alert">{error}</p>}
    </div>
  )
}
