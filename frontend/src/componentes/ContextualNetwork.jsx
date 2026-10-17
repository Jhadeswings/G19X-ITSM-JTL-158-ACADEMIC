export default function ContextualNetwork({
  className = '',
  label = 'Red conceptual de crecimiento conectado',
  decorativa = false,
}) {
  const accesibilidad = decorativa
    ? { 'aria-hidden': true }
    : { role: 'img', 'aria-label': label }
  return (
    <svg
      className={`contextual-network ${className}`.trim()}
      viewBox="0 0 560 360"
      fill="none"
      {...accesibilidad}
    >
      <path className="contextual-network__path" d="M48 246C142 231 144 116 244 128C345 140 356 258 486 210" />
      <path className="contextual-network__path contextual-network__path--secondary" d="M106 92C187 112 225 67 291 87C373 112 381 226 480 252" />
      <path className="contextual-network__path" d="M155 302C232 273 298 298 367 268" />
      <circle className="contextual-network__node" cx="48" cy="246" r="6" />
      <circle className="contextual-network__node" cx="244" cy="128" r="9" />
      <circle className="contextual-network__node contextual-network__node--accent" cx="486" cy="210" r="7" />
      <circle className="contextual-network__node" cx="106" cy="92" r="5" />
      <circle className="contextual-network__node contextual-network__node--accent" cx="291" cy="87" r="6" />
      <circle className="contextual-network__node" cx="480" cy="252" r="5" />
      <circle className="contextual-network__node" cx="155" cy="302" r="4" />
      <circle className="contextual-network__node" cx="367" cy="268" r="4" />
    </svg>
  )
}
