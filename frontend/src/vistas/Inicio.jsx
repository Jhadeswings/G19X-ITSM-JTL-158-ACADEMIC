// Vista "Inicio" del Empleado (PRD §21.1, MB-7-2).
//
// Inicio es una pantalla de RESUMEN Y ORIENTACIÓN: dice qué hay en cada área y
// lleva a la sección donde el detalle vive. No es una segunda copia de
// "Mi progreso", que es donde están las cinco tarjetas con evidencia, las
// fortalezas, las oportunidades, la recomendación IA y la transparencia.
//
// Estructura (las cuatro orientaciones que exige el PRD §21.1):
//   1. SectionHeader.
//   2. Resumen superior: acceso a Mi progreso / Proyectos / Capacitaciones.
//   3. Tus proyectos: selección compacta, máximo 3, del contrato real.
//   4. Resumen de competencias: una fila por competencia, sin evidencia.
//   5. Próximo paso: bloque honesto, SIN regla automática.
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
import { Compass, FolderKanban, GraduationCap, Target } from 'lucide-react'
import { obtenerResultadoActual } from '../api/resultado.js'
import { listarMisProyectos } from '../api/proyectos.js'
import { listarCapacitaciones } from '../api/capacitaciones.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import MetricCard from '../componentes/MetricCard.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'

const DI = 'INSUFFICIENT_DATA'

/** Máximo de proyectos listados en el resumen (sin paginación en Inicio). */
const MAX_PROYECTOS = 3

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
  onIrAProgreso,
  onIrAProyectos,
  onIrACapacitaciones,
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
      <SectionHeader
        eyebrow="Resumen"
        title="Inicio"
        description="Una lectura breve de tu progreso, tus proyectos y tus competencias."
      />

      {/* --- Resumen superior: TRES tarjetas equivalentes ------------------
          Réjilla de 3 columnas iguales + `stretch` = mismo ancho y altura.
          Las tres usan el prop `action` de `MetricCard`, que ancla el botón al
          pie con `margin-top: auto`: así el botón queda SIEMPRE en la misma
          línea base, sea cual sea la altura del dato. Cada tarjeta lleva
          etiqueta, icono arriba a la derecha, texto breve, dato y botón. */}
      <div className="inicio-metricas">
        <MetricCard
          label="Mi progreso"
          icon={Compass}
          description="Tus cinco competencias, su evidencia y cómo se obtienen."
          action={
            onIrAProgreso && (
              <Button type="button" variant="secondary" onClick={onIrAProgreso}>
                Ver mi progreso
              </Button>
            )
          }
        />
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

      {/* --- Tus proyectos: listado compacto de filas -------------------- */}
      <Panel titulo="Tus proyectos" id="inicio-proyectos">
        <p className="inicio-panel__intro">
          Proyectos del catálogo en los que tienes una participación registrada.
        </p>
        <EstadoProyectos
          estado={proyectos}
          recargar={recargarProyectos}
          onIrAProyectos={onIrAProyectos}
        />
      </Panel>

      {/* --- Resumen de competencias: cinco filas ------------------------ */}
      <Panel titulo="Resumen de competencias" id="inicio-competencias">
        <p className="inicio-panel__intro">
          Las cinco competencias con su nivel actual. La evidencia de cada una y
          cómo se obtiene están en Mi progreso.
        </p>
        <Competencias competencias={competencias} />
        {onIrAProgreso && (
          <Button
            type="button"
            variant="secondary"
            className="inicio-boton-ancho"
            onClick={onIrAProgreso}
          >
            Ver detalle en Mi progreso
          </Button>
        )}
      </Panel>

      {/* --- Próximo paso --------------------------------------------------
          Bloque de ORIENTACIÓN, visualmente secundario y compacto (Style
          Guide): el sistema no define todavía una regla que determine el
          próximo paso, así que este bloque lo dice con honestidad y ofrece el
          acceso a la sección donde sí hay contexto. No afirma ninguna
          prioridad calculada, no usa IA y no elige competencia, proyecto ni
          capacitación. */}
      <section
        className="inicio-bloque inicio-bloque--reservado"
        aria-labelledby="inicio-proximo-paso"
      >
        <div className="inicio-bloque--reservado__texto">
          <h2 id="inicio-proximo-paso">
            <Target aria-hidden="true" /> Próximo paso
          </h2>
          <p>
            Todavía no hay un próximo paso definido: el sistema aún no define una
            regla para sugerirlo. Revisa tu resultado en Mi progreso.
          </p>
        </div>
        {onIrAProgreso && (
          <Button type="button" variant="ghost" onClick={onIrAProgreso}>
            Ir a Mi progreso
          </Button>
        )}
      </section>
    </div>
  )
}

/**
 * Panel de sección: caja blanca de ancho completo, como en la referencia.
 * Título + apoyo + contenido, sin contenedores anidados.
 */
function Panel({ id, titulo, children }) {
  return (
    <section className="inicio-panel" aria-labelledby={id}>
      <h2 id={id}>{titulo}</h2>
      {children}
    </section>
  )
}

/**
 * Estado de "Tus proyectos": carga, error compacto con reintento, vacío o la
 * selección. Un fallo aquí NO oculta las competencias (columna contigua).
 *
 * Solo se pintan campos que ya existen en `ProyectoOut`: nombre, área y estado.
 * No hay horas, porcentajes, scores ni "destacado".
 */
function EstadoProyectos({ estado, recargar, onIrAProyectos }) {
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
            <li key={proyecto.id} className="inicio-proyectos__item">
              <span className="inicio-proyectos__nombre">{proyecto.nombre}</span>
              <span className="inicio-proyectos__datos">
                {proyecto.area && (
                  <span className="inicio-proyectos__area">{proyecto.area}</span>
                )}
                <Badge tone="outline">{proyecto.estado}</Badge>
              </span>
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

      {onIrAProyectos && (
        <Button type="button" variant="secondary" onClick={onIrAProyectos}>
          Ver mis proyectos
        </Button>
      )}
    </>
  )
}

/**
 * Resumen compacto de las cinco competencias, en el orden oficial del
 * contrato. NO se usan `CompetenciaCard`: su evidencia, sus barras y "¿Cómo se
 * obtiene?" pertenecen a "Mi progreso" (§21.2).
 *
 * El texto `nivel · etiqueta` es SIEMPRE visible, de modo que la marca visual
 * del nivel es un apoyo y nunca la única fuente de información. No se calcula
 * nada: `nivel` y `etiqueta` se pintan tal cual los devuelve el backend, y
 * `INSUFFICIENT_DATA` se nombra (nunca se convierte en nivel 0, §14).
 */
function Competencias({ competencias }) {
  return (
    <ul className="inicio-competencias">
      {competencias.map((competencia) => {
        const sinDatos = competencia.estado === DI
        return (
          <li key={competencia.clave} className="inicio-competencias__fila">
            <span className="inicio-competencias__nombre">
              {NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}
            </span>
            {sinDatos ? (
              <span className="inicio-competencias__sin-datos">
                Datos insuficientes
              </span>
            ) : (
              <span className="inicio-competencias__nivel">
                {/* Marca ligera del NIVEL RECIBIDO: son 5 segmentos fijos,
                    `data-nivel` los marca como alcanzados. No hay cálculo. */}
                <span
                  className="inicio-nivel"
                  data-nivel={competencia.nivel}
                  aria-hidden="true"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className="inicio-nivel__paso" data-activo={n <= competencia.nivel || undefined} />
                  ))}
                </span>
                <Badge tone="neutral">
                  {competencia.nivel} · {competencia.etiqueta}
                </Badge>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
