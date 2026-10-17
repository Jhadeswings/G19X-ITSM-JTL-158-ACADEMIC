// Vista "Inicio" del Empleado (PRD §21.1, MB-7-2).
//
// Inicio es una pantalla de RESUMEN Y ORIENTACIÓN: dice qué hay en cada área y
// lleva a la sección donde el detalle vive. No es una segunda copia de
// "Mi progreso", que es donde están las cinco tarjetas con evidencia, las
// fortalezas, las oportunidades, la recomendación IA y la transparencia.
//
// Estructura (rediseño visual Fase 1, boceto «Inicio»):
//   1. Encabezado de bienvenida: saludo personalizado sobre verde petróleo,
//      botón «Ver mi progreso» e ilustración decorativa de nodos conectados.
//   2. Resumen de actividad: Proyectos y Capacitaciones (totales reales).
//   3. Resumen de competencias: gráfico radial + lista numerada emparejada.
//   4. Tus proyectos: selección compacta, máximo 3, del contrato real.
//   5. Próximo paso: bloque honesto, SIN regla automática.
//
// El gráfico radial es SOLO una capa visual sobre los niveles que ya envía el
// backend: dibuja un vértice por competencia calculable y numera los ejes para
// emparejarlos con la lista de al lado. `INSUFFICIENT_DATA` no dibuja vértice
// (jamás se pinta como nivel 0) y su número pasa a estilo neutro.
//
// Reglas que esta vista respeta (Style Guide §3.6, §15.3; PRD §17.4):
// - No calcula nada: ni niveles, ni promedios, ni porcentajes globales, ni
//   scores, ni rankings, ni 9-Box, ni comparación organizacional.
// - No convierte "datos insuficientes" en 0: `INSUFFICIENT_DATA` se muestra
//   tal cual, con `nivel` nulo.
// - La experiencia es CONTEXTO, no competencia, y no tiene bloque propio aquí.
// - NO hay dependencia de IA: la recomendación de desarrollo vive en
//   "Mi progreso", que es donde tiene contexto. Aquí no se llama a ningún
//   proveedor ni a `/me/progress/recommendation`.
// - "Próximo paso" NO se decide aquí: no hay regla de backend que lo
//   determine, así que el bloque orienta sin afirmar que el sistema haya
//   elegido un próximo paso concreto.
//
// Cada bloque tiene su propia consulta y su propio estado: que los proyectos
// o las capacitaciones fallen no oculta el resumen de competencias, que ya sí
// cargó. El 401 de cualquier fuente delega en `alSesionExpirada`.

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, FolderKanban, GraduationCap, Target } from 'lucide-react'
import { obtenerResultadoActual } from '../api/resultado.js'
import { listarMisProyectos } from '../api/proyectos.js'
import { listarCapacitaciones } from '../api/capacitaciones.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import { Button } from '../componentes/ui/Button.jsx'
import ContextualNetwork from '../componentes/ContextualNetwork.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import MetricCard from '../componentes/MetricCard.jsx'

const DI = 'INSUFFICIENT_DATA'

/** Máximo de proyectos listados en el resumen (sin paginación en Inicio). */
const MAX_PROYECTOS = 3

/** Escala oficial de niveles del contrato (CompetencyEngine): 1–5. */
const NIVEL_MAXIMO = 5

/** Geometría del gráfico radial: unidades del viewBox 300×300, solo dibujo. */
const RADIAL = {
  centro: 150,
  radioValor: 100,
  radioIndice: 127,
  anillos: [1, 2, 3, 4, 5],
}

/**
 * Punto (x, y) sobre el círculo: trigonometría de PRESENTACIÓN. No calcula
 * niveles ni valores: solo traduce a coordenadas el `nivel` que ya trae el
 * contrato para dibujar el gráfico.
 */
function puntoEn(anguloGrados, radio) {
  const radianes = (anguloGrados * Math.PI) / 180
  return [
    RADIAL.centro + radio * Math.cos(radianes),
    RADIAL.centro + radio * Math.sin(radianes),
  ]
}

/** Estado inicial de cada consulta: misma forma en todas las fuentes. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/**
 * Manejador uniforme de las tres fuentes.
 *
 * Cada consulta es independiente: guarda su propio estado, un 401 delega en
 * `alSesionExpirada` y cualquier otro error queda en SU bloque, sin arrastrar
 * al resto de la pantalla.
 */
function usarConsulta(consultar, token, alSesionExpirada) {
  const [estado, setEstado] = useState(consultaInicial)

  const cargar = useCallback(() => {
    setEstado(consultaInicial())
    consultar(token)
      .then((datos) => setEstado({ fase: 'listo', datos, error: null }))
      .catch((e) => {
        if (e?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setEstado({ fase: 'error', datos: null, error: e })
      })
  }, [consultar, token, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  return [estado, cargar]
}

export default function Inicio({
  token,
  alSesionExpirada,
  nombreEmpleado,
  onIrAProgreso,
  onIrAProyectos,
  onIrACapacitaciones,
  onIrAProyecto,
}) {
  const [resultado, recargarResultado] = usarConsulta(
    obtenerResultadoActual,
    token,
    alSesionExpirada,
  )
  const [proyectos, recargarProyectos] = usarConsulta(
    listarMisProyectos,
    token,
    alSesionExpirada,
  )
  const [capacitaciones, recargarCapacitaciones] = usarConsulta(
    listarCapacitaciones,
    token,
    alSesionExpirada,
  )

  // El resultado oficial es la fuente principal: si falla, la pantalla no tiene
  // nada que resumir y se muestra el error con su reintento.
  if (resultado.fase === 'cargando') return <EstadoCarga texto="Cargando tu inicio…" />
  if (resultado.fase === 'error') {
    return (
      <EstadoError
        titulo="No pudimos cargar tu inicio"
        mensaje={resultado.error?.message}
        onReintentar={recargarResultado}
      />
    )
  }

  const { competencias } = resultado.datos

  return (
    <div className="inicio-empleado">
      {/* --- Encabezado de bienvenida (boceto Fase 1) ----------------------
          Verde petróleo profundo, saludo personalizado y el MISMO acceso a
          «Mi progreso» que ya existía más abajo: no se añade navegación nueva.
          El nombre llega como prop desde la cuenta que el shell ya consulta
          (GET /api/v1/me): aquí no se hace ninguna llamada adicional, y sin
          nombre el saludo es genérico —nunca se inventa identidad. La red de
          nodos conectados es decorativa (aria-hidden en ContextualNetwork). */}
      <header className="inicio-hero" aria-labelledby="inicio-saludo">
        <div className="inicio-hero__copy">
          <p className="inicio-hero__eyebrow">Tu espacio de desarrollo</p>
          <h1 id="inicio-saludo" className="inicio-hero__saludo">
            {nombreEmpleado ? `¡Hola, ${nombreEmpleado}!` : '¡Hola!'}
          </h1>
          <p className="inicio-hero__descripcion">
            Una lectura breve de tu progreso, tus proyectos y tus competencias.
          </p>
          {onIrAProgreso && (
            <Button
              type="button"
              variant="secondary"
              className="inicio-hero__boton"
              onClick={onIrAProgreso}
            >
              Ver mi progreso <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </div>
        <ContextualNetwork
          className="inicio-hero__red"
          label="Ilustración decorativa de nodos conectados"
        />
      </header>

      {/* --- Resumen de actividad: franja gris verdoso claro ---------------
          Los DOS indicadores (Solo Proyectos y Capacitaciones) viven
          directamente sobre la franja, sin tarjetas blancas individuales: el
          override acotado de `.metric-card` neutraliza su caja SOLO aquí.
          El acceso a «Mi progreso» vive en el héroe, en el botón del resumen
          de competencias y en el enlace de Próximo paso. `1fr 1fr` +
          `stretch` igualan alturas y el prop `action` de `MetricCard` ancla
          los enlaces a la misma línea base (`margin-top: auto`). */}
      <div className="inicio-metricas">
        <MetricCard
          label="Proyectos"
          icon={FolderKanban}
          description={
            proyectos.fase === 'error'
              ? 'No pudimos consultar el total.'
              : 'Total de proyectos registrados.'
          }
          action={
            onIrAProyectos && (
              <Button type="button" variant="secondary" onClick={onIrAProyectos}>
                Ir a Mis proyectos
              </Button>
            )
          }
        >
          <p className="inicio-valor">
            {proyectos.fase === 'cargando' || proyectos.fase === 'error'
              ? '—'
              : proyectos.datos?.total}
          </p>
        </MetricCard>
        <MetricCard
          label="Capacitaciones"
          icon={GraduationCap}
          description={
            capacitaciones.fase === 'error'
              ? 'No pudimos consultar el total.'
              : 'Total de capacitaciones registradas.'
          }
          action={
            onIrACapacitaciones && (
              <Button type="button" variant="secondary" onClick={onIrACapacitaciones}>
                Ir a Mis capacitaciones
              </Button>
            )
          }
        >
          <p className="inicio-valor">
            {capacitaciones.fase === 'cargando' || capacitaciones.fase === 'error'
              ? '—'
              : capacitaciones.datos?.total}
          </p>
        </MetricCard>
      </div>

      {/* --- Resumen de competencias: gráfico radial + lista numerada ------
          El gráfico SOLO organiza visualmente los niveles del contrato: un
          vértice por competencia calculable y un número por eje emparejado
          con la lista. DI no dibuja vértice ni se convierte en 0 (§14). */}
      <Panel titulo="Resumen de competencias" id="inicio-competencias">
        <p className="inicio-panel__intro">
          Las cinco competencias con su nivel actual. La evidencia de cada una y
          cómo se obtiene están en Mi progreso.
        </p>
        <div className="inicio-competencias">
          <div className="inicio-competencias__grafico">
            <GraficoRadial competencias={competencias} />
            <p className="inicio-competencias__leyenda">
              Los números del gráfico corresponden a la lista.
            </p>
          </div>
          <Competencias competencias={competencias} />
        </div>
        {onIrAProgreso && (
          <Button
            type="button"
            variant="secondary"
            className="inicio-boton-ancho"
            onClick={onIrAProgreso}
          >
            Ver mi progreso
          </Button>
        )}
      </Panel>

      {/* --- Tus proyectos: lista abierta sobre la franja suave -----------
          Filas separadas por filetes horizontales finos, sin tarjetas
          individuales ni borde exterior: la franja gris verdoso claro es la
          zona que las contiene. */}
      <Panel
        titulo="Tus proyectos"
        id="inicio-proyectos"
        className="inicio-panel--suave"
      >
        <p className="inicio-panel__intro">
          Proyectos del catálogo en los que tienes una participación registrada.
        </p>
        <EstadoProyectos
          estado={proyectos}
          recargar={recargarProyectos}
          onIrAProyecto={onIrAProyecto}
        />
      </Panel>

      {/* --- Próximo paso --------------------------------------------------
          Bloque de ORIENTACIÓN, visualmente secundario (Style Guide). NO es
          una alerta ni una recomendación: el sistema no define todavía una
          regla que determine el próximo paso, así que el texto lo dice con
          honestidad. Sin tarjeta interior, sin segundo contenedor y sin cajas
          anidadas: título, mensaje y enlace discreto en el mismo bloque. No
          afirma ninguna prioridad calculada, no usa IA y no elige
          competencia, proyecto ni capacitación. */}
      <section
        className="inicio-bloque inicio-bloque--reservado"
        aria-labelledby="inicio-proximo-paso"
      >
        <h2 id="inicio-proximo-paso">
          <Target aria-hidden="true" /> Próximo paso
        </h2>
        <p>Todavía no hay un próximo paso definido.</p>
        {onIrAProgreso && (
          <Button
            type="button"
            variant="ghost"
            className="inicio-enlace"
            onClick={onIrAProgreso}
          >
            Mi progreso
          </Button>
        )}
      </section>
    </div>
  )
}

/**
 * Panel de sección: ZONA de ancho completo (ajuste Fase 1b), no una tarjeta.
 * Fondo plano por cambio de zona —blanca por defecto; `--suave` para la
 * franja gris verdoso claro—, sin borde ni esquinas redondeadas. Título +
 * apoyo + contenido, sin contenedores anidados.
 */
function Panel({ id, titulo, className = '', children }) {
  return (
    <section
      className={`inicio-panel ${className}`.trim()}
      aria-labelledby={id}
    >
      <h2 id={id}>{titulo}</h2>
      {children}
    </section>
  )
}

/**
 * Etiquetas de PRESENTACIÓN de los estados oficiales del proyecto (§6),
 * idénticas a las de «Mis proyectos»: solo cambia el texto visible, nunca
 * el dato del contrato. Un estado no contemplado conserva su etiqueta real.
 */
const ETIQUETAS_ESTADO = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

/**
 * Indicador VISUAL del estado de un proyecto (ajuste final de Inicio):
 * punto + etiqueta, sin píldora ni etiqueta rectangular. «Completado»
 * lleva punto verde relleno; «En proceso», punto naranja delineado con
 * interior transparente; «Cancelado» y cualquier otro estado real se
 * muestran solo con su etiqueta (Cancelado en rojo sobrio, el resto en
 * gris neutral). La clase de variante (`--completado`, `--en-proceso`,
 * `--cancelado`) pinta el color del TEXTO en el CSS. No es un control:
 * la fila completa ya es el botón existente que lleva a «Mis proyectos».
 */
const VARIANTE_ESTADO = {
  EN_PROCESO: 'en-proceso',
  COMPLETADO: 'completado',
  CANCELADO: 'cancelado',
}

function EstadoProyecto({ estado }) {
  const punto =
    estado === 'COMPLETADO'
      ? 'inicio-estado__punto--completado'
      : estado === 'EN_PROCESO'
        ? 'inicio-estado__punto--en-proceso'
        : null
  const variante = VARIANTE_ESTADO[estado]

  return (
    <span
      className={
        variante
          ? `inicio-proyectos__estado inicio-proyectos__estado--${variante}`
          : 'inicio-proyectos__estado'
      }
    >
      {punto && <i className={`inicio-estado__punto ${punto}`} aria-hidden="true" />}
      {ETIQUETAS_ESTADO[estado] ?? estado}
    </span>
  )
}

/**
 * Estado de "Tus proyectos": carga, error compacto con reintento, vacío o la
 * selección. Un fallo aquí NO oculta las competencias (columna contigua).
 *
 * Solo se pintan campos que ya existen en `ProyectoOut`: nombre, área y estado.
 * No hay horas, porcentajes, scores ni "destacado".
 */
function EstadoProyectos({ estado, recargar, onIrAProyecto }) {
  if (estado.fase === 'cargando') return <EstadoCarga />
  if (estado.fase === 'error') {
    return (
      <EstadoError
        titulo="No pudimos cargar tus proyectos"
        mensaje={estado.error?.message}
        onReintentar={recargar}
      />
    )
  }

  const { items, total } = estado.datos
  const seleccionados = items.slice(0, MAX_PROYECTOS)

  return (
    <>
      {seleccionados.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no tienes proyectos"
          descripcion="Cuando registres una participación en un proyecto, aparecerá aquí."
        />
      ) : (
        <ul className="inicio-proyectos">
          {seleccionados.map((proyecto) => (
            <li key={proyecto.id}>
              {/* Cada fila es un control: lleva a «Mis proyectos» con ESE
                  proyecto ya seleccionado, donde se muestra la participación
                  registrada. Solo viaja su identificador. */}
              <button
                type="button"
                className="inicio-proyectos__item"
                onClick={() => onIrAProyecto?.(proyecto.id)}
                disabled={!onIrAProyecto}
              >
                <span className="inicio-proyectos__nombre">{proyecto.nombre}</span>
                <span className="inicio-proyectos__datos">
                  {proyecto.area && (
                    <span className="inicio-proyectos__area">{proyecto.area}</span>
                  )}
                  <EstadoProyecto estado={proyecto.estado} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* El recorte se informa con los números del contrato, sin paginación. */}
      {total > MAX_PROYECTOS && (
        <p className="inicio-nota">
          Muestras {MAX_PROYECTOS} de {total} proyectos registrados.
        </p>
      )}
    </>
  )
}

/**
 * Lista numerada de las cinco competencias, en el orden oficial del contrato.
 * NO se usan `CompetenciaCard`: su evidencia, sus barras y "¿Cómo se obtiene?"
 * pertenecen a "Mi progreso" (§21.2).
 *
 * El número inicial de cada fila replica el del eje en el gráfico radial: así
 * fila y eje quedan emparejados (boceto Fase 1). El nivel se pinta tal cual lo
 * devuelve el backend —número y etiqueta en celdas propias, sin chip ni borde—
 * y `INSUFFICIENT_DATA` ocupa la columna del estado (nunca nivel 0, §14).
 */
function Competencias({ competencias }) {
  return (
    <ul className="inicio-competencias__lista">
      {competencias.map((competencia, indice) => {
        const sinDatos = competencia.estado === DI
        return (
          <li key={competencia.clave} className="inicio-competencias__fila">
            <span
              className={
                sinDatos
                  ? 'inicio-competencias__indice inicio-competencias__indice--di'
                  : 'inicio-competencias__indice'
              }
              aria-hidden="true"
            >
              {indice + 1}
            </span>
            <span className="inicio-competencias__nombre">
              {NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}
            </span>
            {sinDatos ? (
              <span className="inicio-competencias__sin-datos">
                Datos insuficientes
              </span>
            ) : (
              // Dos celdas fijas: el número comparte eje con el resto de
              // niveles y la etiqueta con el resto de etiquetas.
              <span className="inicio-competencias__nivel">
                <span className="inicio-competencias__numero">
                  {competencia.nivel}
                </span>
                <span className="inicio-competencias__etiqueta">
                  {competencia.etiqueta}
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Gráfico radial de las cinco competencias (capa VISUAL, §17.4).
 *
 * Solo traduce a geometría lo que el backend ya envía: un vértice por
 * competencia CALCULABLE a distancia `nivel` sobre su eje, y un número por eje
 * (1–5) que empareja el gráfico con la lista de al lado. Los anillos son la
 * escala oficial de niveles del contrato (1–5): no se calcula ni promedia
 * nada en React.
 *
 * `INSUFFICIENT_DATA` NO dibuja vértice —no existe un nivel 0 que pintar— y
 * su número de eje toma el estilo neutro, igual que en la lista.
 *
 * El SVG es decorativo (`aria-hidden`): toda la información accesible vive en
 * la lista numerada contigua.
 */
function GraficoRadial({ competencias }) {
  if (!competencias.length) return null

  const paso = 360 / competencias.length
  const puntos = competencias.map((competencia, indice) => {
    const nivel = Number(competencia.nivel)
    const calculable = competencia.estado !== DI && Number.isFinite(nivel)
    return {
      numero: indice + 1,
      angulo: -90 + indice * paso,
      calculable,
      radio: calculable ? (nivel / NIVEL_MAXIMO) * RADIAL.radioValor : null,
    }
  })

  const anillos = RADIAL.anillos.map((nivel) =>
    puntos
      .map((punto) =>
        puntoEn(punto.angulo, (nivel / NIVEL_MAXIMO) * RADIAL.radioValor).join(','),
      )
      .join(' '),
  )

  const vertices = puntos
    .filter((punto) => punto.calculable)
    .map((punto) => ({ ...punto, xy: puntoEn(punto.angulo, punto.radio) }))

  return (
    <svg
      className="inicio-radial"
      viewBox="0 0 300 300"
      aria-hidden="true"
      focusable="false"
    >
      {anillos.map((puntosAnillo, indice) => (
        <polygon
          key={`anillo-${indice}`}
          className="inicio-radial__anillo"
          points={puntosAnillo}
        />
      ))}
      {puntos.map((punto) => {
        const [x, y] = puntoEn(punto.angulo, RADIAL.radioValor)
        return (
          <line
            key={`eje-${punto.numero}`}
            className="inicio-radial__eje"
            x1={RADIAL.centro}
            y1={RADIAL.centro}
            x2={x}
            y2={y}
          />
        )
      })}
      {vertices.length >= 3 && (
        <polygon
          className="inicio-radial__area"
          points={vertices.map((vertice) => vertice.xy.join(',')).join(' ')}
        />
      )}
      {vertices.length >= 2 && (
        <polyline
          className="inicio-radial__linea"
          points={vertices.map((vertice) => vertice.xy.join(',')).join(' ')}
        />
      )}
      {vertices.map((vertice) => (
        <circle
          key={`vertice-${vertice.numero}`}
          className="inicio-radial__vertice"
          cx={vertice.xy[0]}
          cy={vertice.xy[1]}
          r={5.5}
        />
      ))}
      {puntos.map((punto) => {
        const [x, y] = puntoEn(punto.angulo, RADIAL.radioIndice)
        return (
          <g
            key={`indice-${punto.numero}`}
            className={
              punto.calculable
                ? 'inicio-radial__chip'
                : 'inicio-radial__chip inicio-radial__chip--di'
            }
          >
            <circle cx={x} cy={y} r={11.5} />
            <text x={x} y={y}>
              {punto.numero}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
