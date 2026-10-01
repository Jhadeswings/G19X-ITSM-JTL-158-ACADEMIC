// Sección Empleado → Mi cuenta (PRD §21.6; Especificación Técnica §4, §5,
// §31/§32; Style Guide §7, §11, §28).
//
// Esta pantalla es de SOLO LECTURA para los datos laborales. Muestra
// exactamente los cuatro datos que el PRD exige —nombre, puesto, área y correo
// de acceso— y permite cambiar la contraseña. NO hay edición de nombre,
// puesto, área ni correo: PRD §21.6 dice explícitamente "No permite modificar
// datos laborales", y el backend no expone ningún endpoint para que el
// Empleado los modifique (los administra RH en `PATCH /rh/employees`).
//
// Contrato consumido: `GET /api/v1/me` mediante `obtenerCuenta`. Es el único
// transporte de `/me` y devuelve el JSON del backend SIN transformar. No se
// envía `empleado_id` ni se consulta `/rh/employees`: la identidad la deriva el
// backend del token (§32).
//
// Solo se muestran los cuatro campos de PRD §21.6. NO se pintan `cuenta_id`,
// `empleado_id`, `rol`, `must_change_password`, `activo`, fecha de ingreso ni
// antigüedad: son identificadores internos, datos de sesión o estado de
// credencial, y §21.6 no los pide.
//
// `puesto` y `area` son NULLABLES en el contrato (ET §5: el estado
// `profile_incomplete` de §30 admite que falten). No se inventa copy de
// negocio: se reutiliza `SIN_DATO`, el texto neutro que el sistema ya emplea
// para datos ausentes (`PerfilEmpleado` lo usa exactamente en estos dos
// campos). No se crea una regla de "perfil incompleto".
//
// El bloque de cambio de contraseña es un componente INDEPENDIENTE
// (`CambioPasswordCuenta`, MB-6-3) con su propio estado. Un fallo al cambiar
// la contraseña no toca esta consulta ni oculta los datos ya cargados, y esta
// consulta nunca toca la sesión ni `mustChangePassword`.
//
// Autorización: el frontend no decide permisos; un 401 delega en
// `alSesionExpirada` (ET §31/§32, patrón de las demás vistas de Empleado).

import { useCallback, useEffect, useState } from 'react'
import { obtenerCuenta } from '../api/cuenta.js'
import CambioPasswordCuenta from '../componentes/CambioPasswordCuenta.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

/** Estado inicial de la consulta: la misma forma que usan las otras vistas. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

export default function MiCuenta({ token, alSesionExpirada }) {
  const [consulta, setConsulta] = useState(consultaInicial)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    obtenerCuenta(token)
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §31/§32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { fase, datos } = consulta

  return (
    <div className="mi-cuenta">
      <SectionHeader
        eyebrow="Cuenta"
        title="Mi cuenta"
        description="Información de tu cuenta y acceso al sistema."
      />

      {fase === 'cargando' && <EstadoCarga texto="Cargando tu información…" />}

      {fase === 'error' && (
        <EstadoError
          titulo="No pudimos cargar esta información."
          mensaje="La información de tu cuenta no está disponible en este momento."
          onReintentar={cargar}
        />
      )}

      {fase === 'listo' && datos && (
        <>
          {/* Datos laborales: SOLO LECTURA. Sin inputs, sin botones de editar,
              sin formularios: §21.6 prohíbe modificarlos. */}
          <section
            className="cuenta-datos"
            aria-labelledby="cuenta-datos-titulo"
          >
            <h2 id="cuenta-datos-titulo" className="cuenta-datos__titulo">
              Información de la cuenta
            </h2>
            <dl className="cuenta-datos__lista">
              <div>
                <dt>Nombre</dt>
                <dd>{datos.empleado_nombre || SIN_DATO}</dd>
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
                <dt>Correo de acceso</dt>
                <dd>{datos.email || SIN_DATO}</dd>
              </div>
            </dl>
          </section>

          {/* Cambio de contraseña: la ÚNICA acción editable de la pantalla. */}
          <section
            className="cuenta-seguridad"
            aria-labelledby="cuenta-seguridad-titulo"
          >
            <h2 id="cuenta-seguridad-titulo" className="cuenta-seguridad__titulo">
              Seguridad
            </h2>
            <CambioPasswordCuenta
              token={token}
              alSesionExpirada={alSesionExpirada}
            />
          </section>
        </>
      )}
    </div>
  )
}