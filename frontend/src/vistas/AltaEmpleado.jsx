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
import { CheckCircle2, RotateCcw, UserPlus } from 'lucide-react'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import FormField from '../componentes/FormField.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import { Input } from '../componentes/ui/Input.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'

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
      <div className="employee-success" aria-live="polite">
        <div className="employee-success__seal"><CheckCircle2 aria-hidden="true" /></div>
        <p className="eyebrow eyebrow--accent">Registro completado</p>
        <Badge tone="success" className="employee-success__badge"><CheckCircle2 aria-hidden="true" /> Operación confirmada</Badge>
        <h2>Empleado creado</h2>
        <p className="employee-success__lead">La persona quedó registrada y su cuenta de acceso está preparada.</p>
        <dl className="employee-success__summary">
          <div><dt>Nombre</dt><dd>{alta.nombre}</dd></div>
          <div><dt>Correo de acceso</dt><dd>{correo}</dd></div>
          <div><dt>Cuenta</dt><dd>{alta.cuenta?.activo ? 'Activa' : 'Inactiva'}</dd></div>
          <div><dt>Primer acceso</dt><dd>{alta.cuenta?.must_change_password ? 'requiere cambio de contraseña en el primer acceso' : 'Completado'}</dd></div>
        </dl>
        <Alert tone="info" title="Nota operativa">La credencial temporal no se muestra aquí. En este entorno de desarrollo, el backend la registra en su log para entregársela a la persona.</Alert>
        <Button type="button" onClick={reiniciar}><RotateCcw aria-hidden="true" /> Registrar otro empleado</Button>
      </div>
    )
  }

  return (
    <div className="employee-onboarding">
      <SectionHeader eyebrow="Gestión de personas" title="Registrar empleado" description="Crea el perfil y la cuenta de acceso de una nueva persona. Los datos se organizan para facilitar una revisión clara antes de guardar." />
      {/* Aviso informativo: bloque independiente sobre el formulario, no
          dentro de él. Separa visualmente el mensaje de la primera sección
          (Style Guide §6: bloques con espacio claro entre sí). El `id` se
          conserva porque el campo de correo lo referencia con
          `aria-describedby="ayuda-alta"`. */}
      <p className="employee-form__intro" id="ayuda-alta">El sistema creará también la cuenta de acceso con una credencial temporal para el primer acceso. Los datos laborales marcados como opcionales pueden completarse ahora o posteriormente.</p>
      <form className="employee-form" aria-labelledby="alta-titulo" onSubmit={manejarEnvio} aria-busy={fase === 'enviando'}>
        <h2 id="alta-titulo" className="visualmente-oculto">Registrar empleado</h2>
        <div className="employee-form__sections">
          <fieldset className="form-section"><legend><span>01</span><div><strong>Datos de identidad</strong><small>Información principal de la persona</small></div></legend>
            <div className="form-section__fields"><FormField id="alta-nombre" label="Nombre" required><Input id="alta-nombre" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} invalid={Boolean(error && error.estado === 422)} /></FormField><FormField id="alta-email" label="Correo de acceso" required><Input id="alta-email" type="email" autoComplete="username" aria-describedby="ayuda-alta" required value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(error && (error.estado === 409 || error.estado === 422))} /></FormField></div>
          </fieldset>
          <fieldset className="form-section"><legend><span>02</span><div><strong>Información laboral</strong><small>Contexto inicial de la cuenta</small></div></legend>
            <div className="form-section__fields form-section__fields--laboral"><FormField id="alta-puesto" label="Puesto"><Input id="alta-puesto" autoComplete="organization-title" value={puesto} onChange={(e) => setPuesto(e.target.value)} /></FormField><FormField id="alta-area" label="Área"><Input id="alta-area" value={area} onChange={(e) => setArea(e.target.value)} /></FormField><FormField id="alta-fecha" label="Fecha de ingreso"><Input id="alta-fecha" type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} /></FormField></div>
          </fieldset>
        </div>
        {error && <Alert tone="error">{mensajeDeError(error)}</Alert>}
        <div className="employee-form__actions"><span>Los campos con * son obligatorios.</span><Button type="submit" loading={fase === 'enviando'}><UserPlus aria-hidden="true" /> {fase === 'enviando' ? 'Creando empleado…' : 'Crear empleado'}</Button></div>
      </form>
    </div>
  )
}

