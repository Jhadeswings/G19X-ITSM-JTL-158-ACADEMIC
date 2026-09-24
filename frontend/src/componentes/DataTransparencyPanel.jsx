// DataTransparencyPanel (Style Guide §20).
//
// Responde "¿Qué datos utiliza el sistema?" y deja claro que la IA no
// determina los niveles. Contenido estático de transparencia según el
// Style Guide y el PRD §21.2.

export default function DataTransparencyPanel() {
  return (
    <section className="transparencia" aria-label="Transparencia de datos">
      <h3 className="transparencia__titulo">¿Qué datos utiliza el sistema?</h3>
      <ul className="transparencia__lista">
        <li>Participaciones en proyectos y tu rol en ellas.</li>
        <li>Trabajo en equipo en tus participaciones.</li>
        <li>Coordinación de tareas en tus participaciones.</li>
        <li>Explicación a públicos distintos.</li>
        <li>Capacitaciones registradas.</li>
      </ul>
      <p className="transparencia__nota">
        Los niveles se calculan con reglas del sistema a partir de estos
        datos. La IA no determina los niveles ni modifica el resultado
        oficial: solo genera sugerencias de desarrollo.
      </p>
    </section>
  )
}
