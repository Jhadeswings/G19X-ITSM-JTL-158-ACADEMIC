// Vista "Mis proyectos" del rol Empleado (PRD §11, §21.3; Style Guide §26
// "Proyectos Empleado").
//
// Alcance (MB-5A): BUSCAR un proyecto por nombre y, si no existe coincidencia
// exacta, CREARLO. El registro de la participación es otro microbloque: esta
// vista no registra participaciones.
//
// Contrato real del backend (nada se inventa):
// - GET /api/v1/me/projects/search?nombre= → `coincidencia_exacta` + hasta 5
//   sugerencias aproximadas. La búsqueda es OBLIGATORIA antes de crear
//   (PRD §11.1/§21.3) y la coincidencia aproximada es INFORMATIVA: nunca un
//   error y nunca crea una relación con el proyecto (§8).
// - POST /api/v1/me/projects → crea el proyecto, siempre en EN_PROCESO (§6).
//   El duplicado exacto responde 409 y se muestra como respuesta del backend,
//   no como fallo genérico.
// - NO existe GET /me/projects: el Empleado no tiene listado de proyectos, y
//   la vista no lo simula. La confirmación se construye ÚNICAMENTE con el
//   ProyectoOut que devuelve el POST.
//
// La vista no decide nada de negocio: no determina si el proyecto existe (lo
// dice el backend), no normaliza nombres, no calcula similitudes y no fija el
// estado. Las dos únicas decisiones de presentación son las de los documentos:
// ofrecer el alta cuando el backend no encontró coincidencia exacta (PRD §11.1
// "Crear nuevo si no existe") y no mostrar más de 5 sugerencias (PRD §11.3/§8).

import { useState } from 'react'
import { CheckCircle2, FolderKanban, Repeat2, Search } from 'lucide-react'
import { buscarProyectos, crearProyecto } from '../api/proyectos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import FormField from '../componentes/FormField.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import { Input } from '../componentes/ui/Input.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

/** Máximo de sugerencias aproximadas que el producto permite mostrar (§11.3/§8). */
const SUGERENCIAS_MAXIMAS = 5

/** Etiquetas de presentación de los estados oficiales del proyecto (§6). */
const ETIQUETAS_ESTADO = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

/** Tono del badge (Style Guide §4.5): EN_PROCESO es identidad, NO advertencia;
 *  CANCELADO tampoco implica error automáticamente. */
const TONOS_ESTADO = {
  EN_PROCESO: 'neutral',
  COMPLETADO: 'success',
  CANCELADO: 'outline',
}

function etiquetaEstado(estado) {
  return ETIQUETAS_ESTADO[estado] ?? estado
}

function tonoEstado(estado) {
  return TONOS_ESTADO[estado] ?? 'neutral'
}

/** Estado inicial de la consulta (mismo patrón que las demás vistas). */
function consultaInicial() {
  return { fase: 'inicial', datos: null, error: null }
}

/** Payload del contrato: opcionales vacíos → null (nunca string vacío). */
function prepararProyecto({ nombre, area, cliente }) {
  return {
    nombre: nombre.trim(),
    area: area.trim() || null,
    cliente: cliente.trim() || null,
  }
}

export default function MisProyectos({ token, alSesionExpirada }) {
  const [nombreEscrito, setNombreEscrito] = useState('')
  const [consultaEjecutada, setConsultaEjecutada] = useState('')
  const [avisoBusqueda, setAvisoBusqueda] = useState(null)
  const [busqueda, setBusqueda] = useState(consultaInicial)
  const [formulario, setFormulario] = useState({ nombre: '', area: '', cliente: '' })
  const [alta, setAlta] = useState({ fase: 'inactiva', datos: null, error: null })

  function buscar(nombre) {
    setConsultaEjecutada(nombre)
    setBusqueda({ fase: 'cargando', datos: null, error: null })
    setAlta({ fase: 'inactiva', datos: null, error: null })
    buscarProyectos(token, nombre)
      .then((datos) => {
        setBusqueda({ fase: 'listo', datos, error: null })
        // El alta se ofrece SOLO si el backend no encontró coincidencia exacta
        // (PRD §11.1: "Crear nuevo si no existe"). El nombre buscado se
        // prellena por comodidad y sigue siendo editable.
        if (datos?.coincidencia_exacta == null) {
          setFormulario({ nombre, area: '', cliente: '' })
        }
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setBusqueda({ fase: 'error', datos: null, error })
      })
  }

  function manejarBusqueda(evento) {
    evento.preventDefault()
    const nombre = nombreEscrito.trim()
    if (!nombre) {
      // El contrato exige `nombre` (Query(..., min_length=1) → 422): no se
      // dispara una consulta vacía. No es una regla nueva, es el contrato.
      setAvisoBusqueda('Escribe el nombre del proyecto para buscarlo.')
      return
    }
    setAvisoBusqueda(null)
    buscar(nombre)
  }

  async function enviarAlta() {
    setAlta({ fase: 'enviando', datos: null, error: null })
    try {
      const proyecto = await crearProyecto(token, prepararProyecto(formulario))
      setAlta({ fase: 'creado', datos: proyecto, error: null })
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      // 409 (duplicado exacto) y 422 conservan el mensaje del backend y se
      // muestran junto al formulario: son respuestas del contrato, no fallos.
      if (error?.estado === 409 || error?.estado === 422) {
        setAlta({ fase: 'invalido', datos: null, error })
        return
      }
      setAlta({ fase: 'error', datos: null, error })
    }
  }

  function manejarAlta(evento) {
    evento.preventDefault()
    enviarAlta()
  }

  /** Vuelve al estado inicial de la sección (sin ningún dato simulado). */
  function reiniciar() {
    setNombreEscrito('')
    setConsultaEjecutada('')
    setAvisoBusqueda(null)
    setBusqueda(consultaInicial())
    setFormulario({ nombre: '', area: '', cliente: '' })
    setAlta({ fase: 'inactiva', datos: null, error: null })
  }

  const exacta = busqueda.datos?.coincidencia_exacta ?? null
  // El backend garantiza el máximo (§8); el tope aquí es la regla de
  // presentación del PRD §11.3 ("hasta 5 sugerencias aproximadas").
  const sugerencias = (busqueda.datos?.sugerencias ?? []).slice(0, SUGERENCIAS_MAXIMAS)
  const puedeCrear = busqueda.fase === 'listo' && exacta === null
  // Confirmación de creación: ÚNICAMENTE con el ProyectoOut del backend. No
  // se simula un listado persistente: no existe GET /me/projects.
  if (alta.fase === 'creado') {
    return (
      <div className="mis-proyectos">
        <SectionHeader
          eyebrow="Proyectos"
          title="Mis proyectos"
          description="Busca un proyecto del catálogo compartido y, si todavía no existe, regístralo."
        />
        <section className="proyectos-creado" aria-label="Proyecto creado">
          <Alert tone="success" title="Proyecto creado">
            Quedó registrado en el catálogo compartido con el estado inicial del producto.
          </Alert>
          <p className="proyectos-creado__nombre">{alta.datos.nombre}</p>
          <dl className="proyectos-datos">
            <div>
              <dt>Estado</dt>
              <dd>
                <Badge tone={tonoEstado(alta.datos.estado)}>
                  {etiquetaEstado(alta.datos.estado)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Área</dt>
              <dd>{alta.datos.area ?? SIN_DATO}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{alta.datos.cliente ?? SIN_DATO}</dd>
            </div>
            <div>
              <dt>Identificador</dt>
              <dd>{alta.datos.id}</dd>
            </div>
            <div>
              <dt>Nombre normalizado</dt>
              <dd>{alta.datos.nombre_normalizado}</dd>
            </div>
          </dl>
          <p className="proyectos-nota">
            Estos datos son la respuesta del servidor para el proyecto registrado: se
            muestran tal cual, sin recalcularlos. «Nombre normalizado» es la forma que el
            backend usa para detectar duplicados exactos.
          </p>
          <Button type="button" variant="secondary" onClick={reiniciar}>
            <Repeat2 aria-hidden="true" /> Buscar otro proyecto
          </Button>
        </section>
      </div>
    )
  }

  return (
    <div className="mis-proyectos">
      <SectionHeader
        eyebrow="Proyectos"
        title="Mis proyectos"
        description="Busca un proyecto del catálogo compartido y, si todavía no existe, regístralo."
      />

      <section className="proyectos-paso" aria-labelledby="proyectos-busqueda-titulo">
        <h2 className="proyectos-paso__titulo" id="proyectos-busqueda-titulo">
          <span>01</span> Buscar el proyecto
        </h2>
        <p className="proyectos-paso__nota">
          La búsqueda es obligatoria antes de registrar un proyecto: así se evitan
          duplicados en el catálogo compartido.
        </p>
        <form
          className="proyectos-busqueda"
          onSubmit={manejarBusqueda}
          aria-busy={busqueda.fase === 'cargando'}
        >
          <FormField
            id="proyectos-busqueda-nombre"
            label="Nombre del proyecto"
            hint="Escríbelo como lo conoces: el sistema compara sin distinguir mayúsculas ni acentos."
            error={avisoBusqueda}
          >
            <Input
              id="proyectos-busqueda-nombre"
              autoComplete="off"
              value={nombreEscrito}
              onChange={(evento) => setNombreEscrito(evento.target.value)}
              invalid={Boolean(avisoBusqueda)}
            />
          </FormField>
          <Button type="submit" loading={busqueda.fase === 'cargando'}>
            <Search aria-hidden="true" />
            {busqueda.fase === 'cargando' ? 'Buscando…' : 'Buscar proyecto'}
          </Button>
        </form>
      </section>

      <section
        className="proyectos-resultado"
        aria-label="Resultado de la búsqueda"
        aria-live="polite"
      >
        {busqueda.fase === 'inicial' && (
          <EstadoVacio
            titulo="Todavía no has buscado un proyecto"
            descripcion="Escribe un nombre y usa «Buscar proyecto». Si ya existe, lo verás aquí; si no, podrás registrarlo."
          />
        )}

        {busqueda.fase === 'cargando' && (
          <EstadoCarga texto="Buscando en el catálogo…" />
        )}

        {busqueda.fase === 'error' && (
          <EstadoError
            titulo="No pudimos completar la búsqueda"
            mensaje={busqueda.error?.message}
            onReintentar={() => buscar(consultaEjecutada)}
          />
        )}

        {/* Coincidencia exacta: el backend ya decidió que el proyecto existe
            (PRD §11.1 "Seleccionar existente"). No se calcula nada aquí. */}
        {busqueda.fase === 'listo' && exacta && (
          <div className="proyectos-coincidencia">
            <p className="proyectos-coincidencia__etiqueta">
              <CheckCircle2 aria-hidden="true" /> Proyecto existente
            </p>
            <p className="proyectos-coincidencia__nombre">{exacta.nombre}</p>
            <dl className="proyectos-datos">
              <div>
                <dt>Área</dt>
                <dd>{exacta.area ?? SIN_DATO}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{exacta.cliente ?? SIN_DATO}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge tone={tonoEstado(exacta.estado)}>
                    {etiquetaEstado(exacta.estado)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Nombre normalizado</dt>
                <dd>{exacta.nombre_normalizado}</dd>
              </div>
            </dl>
            <p className="proyectos-nota">
              Este proyecto ya existe en el catálogo compartido: no hace falta crearlo de
              nuevo. «Nombre normalizado» es la forma que el backend usa para detectar
              duplicados exactos.
            </p>
          </div>
        )}

        {/* Sin coincidencia exacta: las sugerencias aproximadas son
            INFORMATIVAS (§8). No son un error y no crean ninguna relación. */}
        {busqueda.fase === 'listo' && !exacta && (
          <div className="proyectos-sugerencias">
            <p className="proyectos-sugerencias__titulo">Sugerencias aproximadas</p>
            <p className="proyectos-sugerencias__nota">
              Ninguna coincide exactamente. Son informativas: no crean ninguna relación con
              el proyecto ni impiden registrar uno nuevo.
            </p>
            {sugerencias.length > 0 ? (
              <ul className="proyectos-sugerencias__lista">
                {sugerencias.map((sugerencia) => (
                  <li className="proyecto-sugerencia" key={sugerencia.proyecto.id}>
                    <p className="proyecto-sugerencia__nombre">
                      {sugerencia.proyecto.nombre}
                    </p>
                    <dl className="proyectos-datos">
                      <div>
                        <dt>Área</dt>
                        <dd>{sugerencia.proyecto.area ?? SIN_DATO}</dd>
                      </div>
                      <div>
                        <dt>Cliente</dt>
                        <dd>{sugerencia.proyecto.cliente ?? SIN_DATO}</dd>
                      </div>
                      <div>
                        <dt>Estado</dt>
                        <dd>
                          <Badge tone={tonoEstado(sugerencia.proyecto.estado)}>
                            {etiquetaEstado(sugerencia.proyecto.estado)}
                          </Badge>
                        </dd>
                      </div>
                      {/* Similitud tal cual llega: sin convertir a porcentaje ni
                          redondear, para no sugerir una calificación. */}
                      <div>
                        <dt>Similitud</dt>
                        <dd>{sugerencia.similitud}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <EstadoVacio
                titulo="Sin coincidencias en el catálogo"
                descripcion="No existe un proyecto con ese nombre ni coincidencias aproximadas. Puedes registrarlo como proyecto nuevo."
              />
            )}
          </div>
        )}
      </section>

      {/* Alta (PRD §11.1 "Crear nuevo si no existe"): aparece SOLO cuando el
          backend no devolvió coincidencia exacta. El estado EN_PROCESO lo fija
          el backend; aquí no se envía. */}
      {puedeCrear && (
        <section
          className="proyectos-paso"
          aria-labelledby="proyectos-alta-titulo"
        >
          <h2 className="proyectos-paso__titulo" id="proyectos-alta-titulo">
            <span>02</span> Registrar el proyecto
          </h2>
          {alta.fase === 'error' ? (
            <EstadoError
              titulo="No pudimos registrar el proyecto"
              mensaje={alta.error?.message}
              onReintentar={enviarAlta}
            />
          ) : (
            <>
              <p className="proyectos-paso__nota">
                No existe un proyecto con ese nombre exacto. Regístralo y el sistema lo
                creará en estado «En proceso».
              </p>
              <form
                className="proyectos-alta"
                onSubmit={manejarAlta}
                aria-busy={alta.fase === 'enviando'}
              >
                <div className="proyectos-alta__campos">
                  <FormField id="proyectos-alta-nombre" label="Nombre" required>
                    <Input
                      id="proyectos-alta-nombre"
                      required
                      value={formulario.nombre}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, nombre: evento.target.value })
                      }
                      invalid={alta.fase === 'invalido'}
                    />
                  </FormField>
                  <FormField id="proyectos-alta-area" label="Área">
                    <Input
                      id="proyectos-alta-area"
                      value={formulario.area}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, area: evento.target.value })
                      }
                    />
                  </FormField>
                  <FormField id="proyectos-alta-cliente" label="Cliente">
                    <Input
                      id="proyectos-alta-cliente"
                      value={formulario.cliente}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, cliente: evento.target.value })
                      }
                    />
                  </FormField>
                </div>
                {/* 409 (duplicado exacto) y 422 se muestran con el mensaje del
                    backend: son respuestas del contrato, no fallos técnicos. */}
                {alta.fase === 'invalido' && (
                  <Alert tone="error">{alta.error?.message}</Alert>
                )}
                <div className="proyectos-alta__acciones">
                  <span>Los campos con * son obligatorios.</span>
                  <Button type="submit" loading={alta.fase === 'enviando'}>
                    <FolderKanban aria-hidden="true" />
                    {alta.fase === 'enviando' ? 'Registrando…' : 'Crear proyecto'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  )
}
