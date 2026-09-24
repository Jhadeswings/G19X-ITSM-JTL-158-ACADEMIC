// Estado de error (Style Guide §13.2/§13.6): qué ocurrió, qué significa
// y qué puede hacer el usuario. Nunca se muestran detalles técnicos.

export default function EstadoError({ titulo = 'No pudimos cargar tu progreso', mensaje, onReintentar }) {
  return (
    <section className="estado-error" role="alert">
      <h2 className="estado-error__titulo">{titulo}</h2>
      <p className="estado-error__mensaje">
        {mensaje || 'Ocurrió un problema al obtener tu información.'}
      </p>
      <p className="estado-error__ayuda">
        Tus datos no se han perdido. Puedes intentarlo de nuevo en unos momentos.
      </p>
      {onReintentar && (
        <button type="button" className="boton boton--primario" onClick={onReintentar}>
          Intentar de nuevo
        </button>
      )}
    </section>
  )
}
