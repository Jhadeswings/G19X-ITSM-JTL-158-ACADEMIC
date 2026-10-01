// Sección Empleado → Mis capacitaciones (PRD §21.4; Especificación Técnica
// §11, §31; DECISIONES_TECNICAS §21; Style Guide §19, §21, §31, §33).
//
// El PRD define EXACTAMENTE tres datos para esta pantalla: nombre, fecha y
// completado. La TrainingCard del Style Guide muestra esos mismos tres, sin
// gráficos ni puntuaciones. No hay edición, no hay eliminación y no hay
// detalle: DECISIONES_TECNICAS §21 cierra el contrato ("NO existen PATCH, DELETE
// ni endpoints RH de capacitaciones"), así que esta vista NO inventa un botón
// que el backend no sostiene.
//
// Contrato real (MB-5C-1, `api/capacitaciones.js`):
//   - GET  /api/v1/me/trainings?pagina=&por_pagina= → CapacitacionPageOut
//           { total, pagina, por_pagina, items[] };
//   - POST /api/v1/me/trainings → 201 CapacitacionOut.
// `consultarCapacitacion()` existe en la API pero el flujo de esta pantalla NO
// lo necesita (no hay detalle ni navegación): no se fuerza su uso.
//
// El listado se presenta en el ORDEN que devuelve el backend (`fecha` DESC,
// `id` DESC): no se reordena en el cliente. Una capacitación recién registrada
// puede no aparecer en la página actual y eso es correcto.
//
// Tras registrar, la vista RECARGA la página actual con el mismo patrón que
// usan las vistas existentes (`cargar()`): no hay caché global ni inserción
// manual en el estado, que falsearía el orden y la paginación del backend.
//
// Autorización: el frontend no decide permisos; un 401 delega en
// `alSesionExpirada` (ET §31/§32, patrón de MiProgreso/MisProyectos).

import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import {
  POR_PAGINA_DEFECTO,
  crearCapacitacion,
  listarCapacitaciones,
} from '../api/capacitaciones.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import FormField from '../componentes/FormField.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import { Input } from '../componentes/ui/Input.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'

/** Estado inicial de la consulta: la misma forma que usan las otras vistas. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Avisos iniciales del formulario: sin reglas, solo los campos obligatorios. */
function avisosIniciales() {
  return { nombre: '', fecha: '' }
}

/**
 * Validación local MÍNIMA, espejo del contrato `CapacitacionCreateIn`
 * (`nombre` y `fecha` obligatorios; el backend ya rechaza el 422). NO calcula
 * niveles, no puntúa y no conoce reglas de negocio (ET §42).
 */
function validarCampos({ nombre, fecha }) {
  const avisos = avisosIniciales()
  if (!nombre.trim()) avisos.nombre = 'Escribe el nombre de la capacitación.'
  if (!fecha.trim()) avisos.fecha = 'Indica la fecha de la capacitación.'
  return { avisos, valido: !avisos.nombre && !avisos.fecha }
}

/** Estado de completado en TEXTO: el color nunca es la única señal (§3). */
function etiquetaCompletado(completado) {
  return completado ? 'Completado' : 'En proceso'
}

export default function MisCapacitaciones({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [consulta, setConsulta] = useState(consultaInicial)
  const [formulario, setFormulario] = useState({
    nombre: '',
    fecha: '',
    completado: false,
  })
  const [avisos, setAvisos] = useState(avisosIniciales)
  const [registro, setRegistro] = useState({ fase: 'inactivo', error: null, mensaje: null })

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarCapacitaciones(token, { pagina, porPagina: POR_PAGINA_DEFECTO })
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // Cualquier otro fallo es un estado explícito con reintento: nunca se
        // convierte en "cero capacitaciones" (§13.6).
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  function manejarEnvio(evento) {
    evento.preventDefault()
    const { avisos: nuevos, valido } = validarCampos(formulario)
    setAvisos(nuevos)
    if (!valido) return

    // Payload EXACTO de CapacitacionCreateIn: ni `empleado_id` (lo deriva la
    // cuenta), ni `id`/`created_at`/`updated_at` (los fija el servidor).
    const payload = {
      nombre: formulario.nombre.trim(),
      fecha: formulario.fecha,
      completado: formulario.completado,
    }

    setRegistro({ fase: 'enviando', error: null, mensaje: null })
    crearCapacitacion(token, payload)
      .then((creada) => {
        setRegistro({
          fase: 'listo',
          error: null,
          mensaje: `Registramos «${creada.nombre}».`,
        })
        setFormulario({ nombre: '', fecha: '', completado: false })
        setAvisos(avisosIniciales())
        // Recarga de la página actual con el patrón existente: el orden y la
        // paginación siguen siendo los del backend.
        cargar()
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setRegistro({ fase: 'error', error, mensaje: null })
      })
  }

  const { fase, datos } = consulta
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const enviando = registro.fase === 'enviando'

  return (
    <div className="mis-capacitaciones">
      <SectionHeader
        eyebrow="Tu desarrollo"
        title="Mis capacitaciones"
        description="Registra las capacitaciones que realizas. Solo se guardan nombre, fecha y si ya las completaste."
      />

      {/* Tarea principal de la pantalla (Style Guide §19): registrar. */}
      <section
        className="capacitaciones-registro"
        aria-labelledby="capacitaciones-registro-titulo"
      >
        <h2 className="capacitaciones-registro__titulo" id="capacitaciones-registro-titulo">
          Registrar capacitación
        </h2>

        {registro.fase === 'listo' && <Alert tone="success">{registro.mensaje}</Alert>}
        {registro.fase === 'error' && <Alert tone="error">{registro.error?.message}</Alert>}

        <form className="capacitaciones-registro__form" onSubmit={manejarEnvio} noValidate>
          <div className="capacitaciones-registro__campos">
            <FormField id="capacitacion-nombre" label="Nombre" required error={avisos.nombre}>
              <Input
                id="capacitacion-nombre"
                name="nombre"
                autoComplete="off"
                value={formulario.nombre}
                invalid={Boolean(avisos.nombre)}
                onChange={(evento) =>
                  setFormulario({ ...formulario, nombre: evento.target.value })
                }
              />
            </FormField>

            <FormField id="capacitacion-fecha" label="Fecha" required error={avisos.fecha}>
              <Input
                id="capacitacion-fecha"
                name="fecha"
                type="date"
                value={formulario.fecha}
                invalid={Boolean(avisos.fecha)}
                onChange={(evento) =>
                  setFormulario({ ...formulario, fecha: evento.target.value })
                }
              />
            </FormField>

            {/* `completado` es un dato, no un indicador de desempeño: puede
                quedarse en false al registrar (el contrato lo permite). */}
            <div className="capacitaciones-registro__completado">
              <Input
                id="capacitacion-completado"
                name="completado"
                type="checkbox"
                checked={formulario.completado}
                onChange={(evento) =>
                  setFormulario({ ...formulario, completado: evento.target.checked })
                }
              />
              <label htmlFor="capacitacion-completado">Completado</label>
            </div>
          </div>

          <Button type="submit" loading={enviando}>
            <Save aria-hidden="true" /> Registrar capacitación
          </Button>
        </form>
      </section>

      <section className="capacitaciones-lista" aria-labelledby="capacitaciones-lista-titulo">
        <h2 className="capacitaciones-lista__titulo" id="capacitaciones-lista-titulo">
          Capacitaciones registradas
        </h2>

        {fase === 'cargando' && <EstadoCarga texto="Cargando capacitaciones…" />}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar tus capacitaciones"
            mensaje="Ocurrió un problema al obtener tus capacitaciones registradas."
            onReintentar={cargar}
          />
        )}

        {/* Estado vacío SOLO cuando no hay ninguna capacitación registrada
            (`total === 0` del backend). Una página vacía con `total > 0`
            significa "no estás en la página 1": es un caso de paginación, no
            un listado vacío, y nunca se inventa un "sin datos" (§13.4). */}
        {fase === 'listo' && total === 0 && (
          <EstadoVacio
            titulo="Todavía no has registrado capacitaciones."
            descripcion="Usa el formulario de arriba para registrar la primera."
          />
        )}

        {fase === 'listo' && items.length > 0 && (
          <ul className="capacitaciones-cards">
            {items.map((capacitacion) => (
              <li key={capacitacion.id} className="capacitacion-card">
                <p className="capacitacion-card__nombre">{capacitacion.nombre}</p>
                <dl className="capacitaciones-card__datos">
                  <div>
                    <dt>Fecha</dt>
                    <dd>{capacitacion.fecha}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {/* Texto + badge: el color nunca es la única señal. */}
                      <Badge tone={capacitacion.completado ? 'success' : 'neutral'}>
                        {etiquetaCompletado(capacitacion.completado)}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}

        {/* La paginación depende de `total`, no de `items.length`: sigue
            visible aunque esta página concreta venga sin ítems. */}
        {fase === 'listo' && total > 0 && (
          <Pagination
            pagina={datos?.pagina ?? pagina}
            porPagina={porPagina}
            total={total}
            onCambiarPagina={setPagina}
            etiqueta="capacitaciones"
          />
        )}
      </section>
    </div>
  )
}

