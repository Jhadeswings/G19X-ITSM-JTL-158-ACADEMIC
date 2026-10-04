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

      {/* --- Resumen superior: acceso a las tres áreas -------------------- */}
      <div className="inicio-metricas">
        <MetricCard
          label="Mi progreso"
          icon={Compass}
          description="El detalle de tus cinco competencias vive en Mi progreso."
        >
          {onIrAProgreso && (
            <Button type="button" variant="secondary" onClick={onIrAProgreso}>
              Ver mi progreso
            </Button>
          )}
        </MetricCard>
        <TarjetaTotal
          icon={FolderKanban}
          label="Proyectos"
          total={proyectos.datos?.total}
          cargando={proyectos.fase === 'cargando'}
          error={proyectos.fase === 'error'}
          onIr={onIrAProyectos}
          textoBoton="Ir a Mis proyectos"
        />
        <TarjetaTotal
          icon={GraduationCap}
          label="Capacitaciones"
          total={capacitaciones.datos?.total}
          cargando={capacitaciones.fase === 'cargando'}
          error={capacitaciones.fase === 'error'}
          onIr={onIrACapacitaciones}
          textoBoton="Ir a Mis capacitaciones"
        />
      </div>

      {/* --- Tus proyectos ------------------------------------------------ */}
      <Seccion
        id="inicio-proyectos"
        titulo="Tus proyectos"
        descripcion="Proyectos del catálogo en los que tienes una participación registrada."
        estado={proyectos}
        recargar={recargarProyectos}
        vacioTitulo="Todavía no tienes proyectos"
        vacioDescripcion="Cuando registres una participación en un proyecto, aparecerá aquí."
      >
        {(datos) => (
          <>
            <ul className="inicio-proyectos">
              {datos.items.slice(0, MAX_PROYECTOS).map((proyecto) => (
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
            {datos.total > MAX_PROYECTOS && (
              <p className="inicio-nota">
                Muestras {MAX_PROYECTOS} de {datos.total} proyectos registrados.
              </p>
            )}
          </>
        )}
      </Seccion>

      {/* --- Resumen de competencias --------------------------------------
          Cinco filas compactas. NO se usan `CompetenciaCard` completas: su
          evidencia y sus barras pertenecen a "Mi progreso" (§21.2). Aquí solo
          el nivel y la etiqueta, tal cual los calcula el backend. */}
      <section className="inicio-bloque" aria-labelledby="inicio-competencias">
        <h2 id="inicio-competencias">Resumen de competencias</h2>
        <p className="seccion__intro">
          Las cinco competencias con su nivel actual. La evidencia de cada una y
          cómo se obtiene están en Mi progreso.
        </p>
        <ul className="inicio-competencias">
          {competencias.map((competencia) => (
            <li key={competencia.clave} className="inicio-competencias__fila">
              <span className="inicio-competencias__nombre">
                {NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}
              </span>
              {competencia.estado === DI ? (
                // `nivel` llega null con INSUFFICIENT_DATA: nunca se pinta
                // como cero ni se convierte en un nivel inventado (§14).
                <span className="inicio-competencias__sin-datos">
                  Datos insuficientes
                </span>
              ) : (
                <Badge tone="neutral">
                  {competencia.nivel} · {competencia.etiqueta}
                </Badge>
              )}
            </li>
          ))}
        </ul>
        {onIrAProgreso && (
          <Button type="button" variant="secondary" onClick={onIrAProgreso}>
            Ver detalle en Mi progreso
          </Button>
        )}
      </section>

      {/* --- Próximo paso --------------------------------------------------
          Bloque de ORIENTACIÓN, no una alerta (Style Guide). El sistema no
          define todavía una regla que determine el próximo paso, así que este
          bloque lo dice con honestidad y ofrece el acceso a la sección donde sí
          hay contexto. No afirma ninguna prioridad calculada, no usa IA y no
          elige competencia, proyecto ni capacitación. */}
      <section
        className="inicio-bloque inicio-bloque--reservado"
        aria-labelledby="inicio-proximo-paso"
      >
        <h2 id="inicio-proximo-paso">
          <Target aria-hidden="true" /> Próximo paso
        </h2>
        <EstadoVacio
          titulo="Todavía no hay un próximo paso definido"
          descripcion="El sistema aún no define una regla para sugerirlo. Revisa tu resultado en Mi progreso para ver dónde tienes evidencia y dónde no."
        />
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
 * Tarjeta de un área con total. El `total` viene LITERAL del contrato
 * (`ProyectoPageOut.total` / `CapacitacionPageOut.total`): aquí no se calcula
 * ninguna métrica nueva, ni porcentaje, ni indicador, ni media.
 */
function TarjetaTotal({ icon, label, total, cargando, error, onIr, textoBoton }) {
  return (
    <MetricCard
      label={label}
      icon={icon}
      description={
        error
          ? 'No pudimos consultar el total.'
          : `Total de ${label.toLowerCase()} registrados.`
      }
    >
      <p className="inicio-total">{cargando || error ? '—' : total}</p>
      {onIr && (
        <Button type="button" variant="secondary" onClick={onIr}>
          {textoBoton}
        </Button>
      )}
    </MetricCard>
  )
}

/**
 * Bloque con consulta propia: carga, error con reintento y vacío. Un fallo aquí
 * NO oculta el resto de la pantalla.
 */
function Seccion({
  id,
  titulo,
  descripcion,
  estado,
  recargar,
  vacioTitulo,
  vacioDescripcion,
  children,
}) {
  const vacio = estado.fase === 'listo' && (estado.datos?.items?.length ?? 0) === 0
  return (
    <section className="inicio-bloque" aria-labelledby={id}>
      <h2 id={id}>{titulo}</h2>
      <p className="seccion__intro">{descripcion}</p>
      {estado.fase === 'cargando' && <EstadoCarga />}
      {estado.fase === 'error' && (
        <EstadoError
          titulo={`No pudimos cargar ${titulo.toLowerCase()}`}
          mensaje={estado.error?.message}
          onReintentar={recargar}
        />
      )}
      {estado.fase === 'listo' &&
        (vacio ? (
          <EstadoVacio titulo={vacioTitulo} descripcion={vacioDescripcion} />
        ) : (
          children(estado.datos)
        ))}
    </section>
  )
}
