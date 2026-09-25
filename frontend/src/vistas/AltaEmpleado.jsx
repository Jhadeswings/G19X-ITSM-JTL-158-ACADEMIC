// Vista "Empleados → Alta de empleado" para el rol RH (PRD §3.3, §20.1;
// Style Guide §21: formularios en página, sin modal).
//
// Usa Únicamente el endpoint existente POST /api/v1/rh/employees (ET §31).
// El backend exige rol RH (require_rh) y crea Empleado + CuentaAcceso con
// credencial temporal: esa credencial NUNCA se pide ni se muestra aquí
// (DECISIONES_TECNICAS.md §14). En desarrollo local se entrega mediante el
// log del backend.
//
// Campos: los cinco que registra RH según PRD §3.3. El contrato actual solo
// exige nombre y correo; puesto, área y fecha de ingreso son opcionales en
// el schema backend y aquí NO se les añaden restricciones nuevas.
//
// Errores: 409 y 422 se explican junto al formulario; 401 cierra la sesión
// con el patrón existente; el resto usa EstadoError con mensaje comprensible
// (Style Guide §13.6), nunca excepciones técnicas.
//
// El frontend NO autoriza: rol y creación real viven en el backend (ET §31).

import { useState } from 'react'
import { crearEmpleado } from '../api/empleados.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'

/** Mensaje comprensible por estado HTTP (nunca detalles técnicos). */
function mensajeDeError(error) {
  if (error?.estado === 409) {
    return 'Ese correo de acceso ya está registrado. Usa otro correo o revisa si la cuenta ya existe.'
  }
  if (error?.estado === 422) {
    return 'Los datos enviados no son válidos. Revisa los campos e inténtalo de nuevo.'
  }
  // Style Guide §13.6: nunca se muestra el detalle técnico del error.
  return 'No fue posible crear el empleado. Inténtalo de nuevo más tarde.'
}

/** Payload del contrato actual: opcionales vacíos → null (no string vacío). */
function prepararDatos({ nombre, email, puesto, area, fechaIngreso }) {
  return {
    nombre: nombre.trim(),
    email: email.trim(),
    puesto: puesto.trim() || null,
    area: area.trim() || null,
    fecha_ingreso: fechaIngreso || null,
  }
}

export default function AltaEmpleado({ token, alSesionExpirada }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [puesto, setPuesto] = useState('')
  const [area, setArea] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState('')
  const [fase, setFase] = useState('formulario')
  const [error, setError] = useState(null)
  const [alta, setAlta] = useState(null)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    setError(null)
    setFase('enviando')
    try {
      const empleado = await crearEmpleado(
        token,
        prepararDatos({ nombre, email, puesto, area, fechaIngreso }),
      )
      setAlta(empleado)
      setFase('exito')
    } catch (e) {
      if (e?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      if (e?.estado === 409 || e?.estado === 422) {
        // Se guarda el error crudo: la traducción ocurre solo al render.
        setError(e)
        setFase('formulario')
        return
      }
      setError(e)
      setFase('error')
    }
  }

  function reiniciar() {
    setAlta(null)
    setError(null)
    setNombre('')
    setEmail('')
    setPuesto('')
    setArea('')
    setFechaIngreso('')
    setFase('formulario')
  }

  function volverAlFormulario() {
    setError(null)
    setFase('formulario')
  }

  if (fase === 'enviando') {
    return <EstadoCarga texto="Creando el empleado…" />
  }

  if (fase === 'error') {
    return (
      <EstadoError
        titulo="No pudimos crear el empleado"
        mensaje={mensajeDeError(error)}
        onReintentar={volverAlFormulario}
      />
    )
  }

  if (fase === 'exito' && alta) {
    const correo = alta.cuenta?.email || email
    return (
      <div className="login">
        <section className="login__tarjeta" aria-live="polite">
          <h2>Empleado creado</h2>
          <p>
            Se registró a <strong>{alta.nombre}</strong> con el correo de
            acceso <strong>{correo}</strong>.
          </p>
          <p>
            {alta.cuenta?.activo
              ? 'La cuenta de acceso está activa'
              : 'La cuenta de acceso está inactiva'}
            {alta.cuenta?.must_change_password
              ? ' y requiere cambio de contraseña en el primer acceso.'
              : '.'}
          </p>
          <p className="contexto__nota">
            La credencial temporal no se muestra en la interfaz. En este
            entorno de desarrollo, el backend la registra en su log para
            entregársela al empleado.
          </p>
          <button
            type="button"
            className="boton boton--primario"
            onClick={reiniciar}
          >
            Registrar otro empleado
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="login">
      <form
        className="login__tarjeta"
        aria-labelledby="alta-titulo"
        onSubmit={manejarEnvio}
      >
        <h2 id="alta-titulo">Registrar empleado</h2>
        <p className="seccion__intro" id="ayuda-alta">
          Registra los datos del nuevo empleado. El sistema creará también su
          cuenta de acceso con una credencial temporal para el primer acceso.
        </p>
        <label className="campo" htmlFor="alta-nombre">
          Nombre
          <input
            id="alta-nombre"
            autoComplete="name"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="alta-email">
          Correo de acceso
          <input
            id="alta-email"
            type="email"
            autoComplete="username"
            aria-describedby="ayuda-alta"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="alta-puesto">
          Puesto
          <input
            id="alta-puesto"
            autoComplete="organization-title"
            value={puesto}
            onChange={(e) => setPuesto(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="alta-area">
          Área
          <input
            id="alta-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="alta-fecha">
          Fecha de ingreso
          <input
            id="alta-fecha"
            type="date"
            value={fechaIngreso}
            onChange={(e) => setFechaIngreso(e.target.value)}
          />
        </label>
        {error && (
          <p className="login__error" role="alert">
            {mensajeDeError(error)}
          </p>
        )}
        <button
          type="submit"
          className="boton boton--primario"
          disabled={fase === 'enviando'}
        >
          Crear empleado
        </button>
      </form>
    </div>
  )
}

