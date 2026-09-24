// Estado vacío (Style Guide §13.4): qué está vacío, por qué y qué se
// puede hacer. Neutro, nunca punitivo (Style Guide §25).

export default function EstadoVacio({ titulo, descripcion }) {
  return (
    <div className="estado-vacio">
      <p className="estado-vacio__titulo">{titulo}</p>
      <p className="estado-vacio__descripcion">{descripcion}</p>
    </div>
  )
}
