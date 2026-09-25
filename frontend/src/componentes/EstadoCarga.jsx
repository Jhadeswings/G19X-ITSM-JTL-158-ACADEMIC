// Estado de carga (Style Guide §13.5): skeleton discreto con texto
// legible, sin depender solo de la animación.
//
// `texto` permite adaptar el mensaje a la vista que lo usa (p. ej. el alta
// de empleados de RH); sin props conserva el texto de "Mi progreso".

export default function EstadoCarga({ texto = 'Cargando tu progreso…' }) {
  return (
    <section className="estado-carga" aria-live="polite" aria-busy="true">
      <p className="estado-carga__titulo">{texto}</p>
      <div className="esqueleto" aria-hidden="true">
        <span className="esqueleto__linea" />
        <span className="esqueleto__linea" />
        <span className="esqueleto__linea esqueleto__linea--corta" />
      </div>
    </section>
  )
}
