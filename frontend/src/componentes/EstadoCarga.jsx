// Estado de carga (Style Guide §13.5): skeleton discreto con texto
// legible, sin depender solo de la animación.

export default function EstadoCarga() {
  return (
    <section className="estado-carga" aria-live="polite" aria-busy="true">
      <p className="estado-carga__titulo">Cargando tu progreso…</p>
      <div className="esqueleto" aria-hidden="true">
        <span className="esqueleto__linea" />
        <span className="esqueleto__linea" />
        <span className="esqueleto__linea esqueleto__linea--corta" />
      </div>
    </section>
  )
}
