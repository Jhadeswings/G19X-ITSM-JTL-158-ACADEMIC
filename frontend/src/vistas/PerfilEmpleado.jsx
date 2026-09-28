// Perfil individual RH: información básica (PRD §20.1; Style Guide §6, §7, §10).
//
// Subvista interna de la sección Empleados, con el mismo patrón listado ↕
// alta: sin ruta nueva ni router. Usa EXCLUSIVAMENTE el endpoint existente
// GET /api/v1/rh/employees/{id} y muestra SOLO la información básica del
// EmpleadoOut, sin recalcular nada ni adelantar resultados, competencias,
// evaluaciones ni 9-Box.

import { useCallback, useEffect, useState } from 'react'
import { obtenerEmpleado } from '../api/empleados.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

function etiquetaEstado(activo) {
  return activo ? 'Activo' : 'Inactivo'
}

/** Estado inicial de la consulta: la misma forma que usa Empleados. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

export default function PerfilEmpleado({ token, empleadoId, alVolver, alSesionExpirada }) {
  const [consulta, setConsulta] = useState(consultaInicial)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    obtenerEmpleado(token, empleadoId)
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, empleadoId, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { fase, datos, error } = consulta

  return (
    <div className="perfil-empleado">
      <div className="empleados__volver">
        <Button variant="ghost" onClick={alVolver}>
          Volver al listado
        </Button>
      </div>

      {fase === 'cargando' && <EstadoCarga texto="Cargando información del empleado…" />}

      {fase === 'error' && error?.estado === 404 && (
        <>
          <EstadoVacio
            titulo="Este empleado no está disponible."
            descripcion="Es posible que ya no exista o que no se pueda consultar en este momento. Puedes volver al listado para continuar."
          />
          <div className="empleados__volver">
            <Button variant="secondary" onClick={alVolver}>
              Volver al listado
            </Button>
          </div>
        </>
      )}

      {fase === 'error' && error?.estado !== 404 && (
        <EstadoError
          titulo="No pudimos cargar la información del empleado"
          mensaje="Ocurrió un problema al obtener la información básica."
          onReintentar={cargar}
        />
      )}

      {fase === 'listo' && datos && (
        <>
          <SectionHeader
            eyebrow="Perfil del empleado"
            title={datos.nombre}
            description="Información básica registrada."
          />
          <section className="perfil-empleado__basica" aria-labelledby="perfil-basica-titulo">
            <h2 id="perfil-basica-titulo">Información básica</h2>
            <dl className="perfil-empleado__lista">
              <div>
                <dt>Nombre</dt>
                <dd>{datos.nombre || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Puesto</dt>
                <dd>{datos.puesto || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Área</dt>
                <dd>{datos.area || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Fecha de ingreso</dt>
                <dd>{datos.fecha_ingreso || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge tone={datos.activo ? 'success' : 'neutral'}>
                    {etiquetaEstado(datos.activo)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Correo de acceso</dt>
                <dd>{datos.cuenta?.email || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Rol de cuenta</dt>
                <dd>{datos.cuenta?.rol || SIN_DATO}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  )
}
