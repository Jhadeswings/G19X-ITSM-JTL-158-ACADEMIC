"""Generación del informe PDF del perfil individual de empleado (RH) — v2.

DECISIONES_TECNICAS §55: el documento se construye con una PLANTILLA HTML
dedicada (``app/services/pdf/plantilla_perfil.html``) más una hoja de
estilos de impresión (``app/services/pdf/perfil_pdf.css``) y se convierte a
PDF con Chromium vía Playwright (``print_background=True``,
``prefer_css_page_size=True``, sin cabeceras ni pies automáticos). El
resultado es texto real seleccionable, no una captura de pantalla.

Reglas que este servicio respeta:

- Composición de SOLO LECTURA de piezas existentes: ``empleado_service``,
  ``resultado_actual_service`` (CompetencyEngine, ET §13/§18),
  ``nine_box_service`` (§20) y ``evaluation_service`` (§21/§24). La
  plantilla NO recalcula reglas de negocio: solo presenta DTOs ya
  calculados por el backend.
- Sin IA: la descarga NO dispara ninguna generación de sugerencia (PRD
  v1.4 §20.2.1, DECISIONES §52).
- Sin persistencia: no crea evaluaciones ni guarda ``ResultadoActual``
  (§18); el histórico se lee del snapshot guardado y no se recalcula
  (§24, DECISIONES §30).
- ``INSUFFICIENT_DATA`` se presenta como «Datos insuficientes» (cursiva
  ``#90A4AE``), nunca como nivel 0 (§14); el 9-Box vacío se muestra como
  tal, sin inventar cuadrante (§20.2).
- Exactamente 2 páginas Carta (Letter): la página 1 termina con
  «Fortalezas y oportunidades | Experiencia» y la 2 empieza con «Última
  evaluación oficial». Sin cabeceras, pies de página, fechas al margen ni
  numeración (la CSS fija la paginación y evita cortes de bloque).
- Nombre de archivo ASCII sanitizado SIN correo:
  ``perfil-empleado-{slug}-{YYYY-MM-DD}.pdf`` (fecha de negocio §12; jamás
  la de una evaluación histórica).
- Chromium se instala AL CONSTRUIR la imagen (ver ``Dockerfile``); este
  módulo solo lo usa. Los recursos de Playwright se liberan SIEMPRE
  (context manager + ``finally``), también ante errores.
- Nada del contenido se registra en logs.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.fechas import fecha_negocio_hoy
from app.schemas.resultado_actual import (
    CompetenciaResultadoDTO,
    EstadoCompetencia,
    _ETIQUETAS_NIVEL,
)
from app.services import (
    empleado_service,
    evaluation_service,
    nine_box_service,
    resultado_actual_service,
)

_DIR_PLANTILLAS = Path(__file__).resolve().parent / "pdf"
_PLANTILLA = (_DIR_PLANTILLAS / "plantilla_perfil.html").read_text(
    encoding="utf-8"
)
_CSS = (_DIR_PLANTILLAS / "perfil_pdf.css").read_text(encoding="utf-8")

SIN_DATO = "—"
TEXTO_DI = "Datos insuficientes"

_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

# Nombres de las CINCO competencias exactas (PRD §4–§8; espejo de textos.js:
# copy de presentación, sin reglas de negocio).
NOMBRES_COMPETENCIAS = {
    "desempeno_tecnico": "Desempeño técnico",
    "liderazgo": "Liderazgo",
    "trabajo_equipo": "Trabajo en equipo",
    "comunicacion": "Comunicación",
    "aprendizaje": "Capacidad de aprendizaje",
}

# Orden fijo de presentación en el documento (columna izquierda = los tres
# primeros; columna derecha = los dos restantes; ídem en el histórico).
_ORDEN_COMPETENCIAS = (
    "desempeno_tecnico",
    "liderazgo",
    "trabajo_equipo",
    "comunicacion",
    "aprendizaje",
)

# Etiquetas legibles de la evidencia (claves EXACTAS del CompetencyEngine).
_ETIQUETAS_EVIDENCIA = {
    "participaciones": "Participaciones",
    "coordino_tareas_true": "Coordinó tareas",
    "en_equipo_true": "Trabajó en equipo",
    "explico_a_publico_distinto_true": "Explicó a públicos distintos",
    "proyectos_completados": "Proyectos completados",
    "proyectos_evaluables": "Proyectos evaluables",
    "proyectos_cancelados": "Proyectos cancelados",
    "proyectos_en_proceso_excluidos": "Proyectos en proceso (excluidos)",
    "capacitaciones_registradas": "Capacitaciones registradas",
    "cursos_completados_anio": "Cursos completados este año",
    "proyectos_unicos": "Proyectos únicos",
    "roles_distintos": "Roles distintos",
    "minimo_capacitaciones": "Mínimo de capacitaciones requeridas",
    "minimo_proyectos_unicos": "Mínimo de proyectos únicos requeridos",
}

# Indicadores presentados por competencia, en el orden de la especificación.
_ORDEN_EVIDENCIA = {
    "desempeno_tecnico": (
        "proyectos_completados",
        "proyectos_evaluables",
        "proyectos_cancelados",
        "proyectos_en_proceso_excluidos",
    ),
    "liderazgo": ("participaciones", "coordino_tareas_true"),
    "trabajo_equipo": ("participaciones", "en_equipo_true"),
    "comunicacion": ("participaciones", "explico_a_publico_distinto_true"),
    "aprendizaje": (
        "roles_distintos",
        "proyectos_unicos",
        "capacitaciones_registradas",
        "cursos_completados_anio",
    ),
}

# Clase CSS por etiqueta de nivel (SOLO presentación; los niveles los decide
# el motor). «Alto» comparte el tratamiento del nivel máximo y «Inicial» el
# del mínimo, para cubrir los cinco niveles del catálogo con la paleta
# especificada sin inventar colores nuevos.
_CLASE_NIVEL = {
    "Consolidado": "competencia__nivel--consolidado",
    "Alto": "competencia__nivel--consolidado",
    "En crecimiento": "competencia__nivel--crecimiento",
    "En desarrollo": "competencia__nivel--desarrollo",
    "Inicial": "competencia__nivel--desarrollo",
}


# ---------------------------------------------------------------------------
# Utilidades de presentación
# ---------------------------------------------------------------------------
def _slug(texto: str) -> str:
    """Slug ASCII seguro para nombre de archivo (sin correo, sin acentos)."""
    descompuesto = unicodedata.normalize("NFKD", texto or "")
    ascii_ = descompuesto.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "empleado"


def _fecha_legible(d: date | None) -> str:
    """'4 de octubre de 2026' o el estado de ausencia permitido."""
    if d is None:
        return SIN_DATO
    return f"{d.day} de {_MESES[d.month - 1]} de {d.year}"


def _fecha_hora_legible(momento: datetime) -> str:
    """Fecha legible en la zona de negocio (§12)."""
    zona = ZoneInfo(get_settings().TZ)
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return _fecha_legible(momento.astimezone(zona).date())


def _nivel_actual(competencia: CompetenciaResultadoDTO) -> tuple[str, str]:
    """('Nivel 2 • En desarrollo', clase_css) o ('Datos insuficientes', di)."""
    if (
        competencia.estado == EstadoCompetencia.INSUFFICIENT_DATA
        or competencia.nivel is None
    ):
        return TEXTO_DI, "competencia__nivel--di"
    etiqueta = _ETIQUETAS_NIVEL.get(competencia.nivel, "")
    texto = f"Nivel {competencia.nivel} • {etiqueta}"
    return texto, _CLASE_NIVEL.get(etiqueta, "competencia__nivel--consolidado")


def _valor_historico(nivel, status: str) -> tuple[str, bool]:
    """('Nivel 1.', False) o ('Datos insuficientes.', True)."""
    if nivel is None or status == EstadoCompetencia.INSUFFICIENT_DATA.value:
        return f"{TEXTO_DI}.", True
    return f"Nivel {nivel}.", False


def _valor_nine_box(nb) -> tuple[str, bool]:
    """Texto del 9-Box real; sin ejes ⇒ ('Datos insuficientes.', True)."""
    if nb is None or nb.box_code is None:
        return f"{TEXTO_DI}.", True
    return (
        "Rendimiento "
        f"{nb.etiqueta_performance} · Potencial {nb.etiqueta_potencial} "
        f"(celda {nb.box_code})",
        False,
    )


def _fila(descripcion: str, valor: str, di: bool = False) -> str:
    """Fila descripción-izquierda / valor-derecha (nunca viñeta)."""
    clase = " fila__valor--di" if di else ""
    return (
        f'<div class="fila"><span class="fila__desc">'
        f'{escape(descripcion)}</span>'
        f'<span class="fila__valor{clase}">{escape(valor)}</span></div>'
    )


def _clave_de(competencia) -> str:
    """Clave legible de un DTO de resultado o de snapshot histórico."""
    return str(getattr(competencia.clave, "value", competencia.clave))


def _ordenar(competencias) -> list:
    """Orden fijo de presentación de las cinco competencias (§4–§8)."""
    posicion = {clave: i for i, clave in enumerate(_ORDEN_COMPETENCIAS)}
    return sorted(
        competencias,
        key=lambda c: posicion.get(_clave_de(c), len(posicion)),
    )


def _bloque_competencia(competencia: CompetenciaResultadoDTO) -> str:
    clave = _clave_de(competencia)
    nombre = NOMBRES_COMPETENCIAS.get(clave, clave)
    nivel_texto, clase = _nivel_actual(competencia)
    filas = [
        _fila(
            _ETIQUETAS_EVIDENCIA.get(indicador, indicador),
            str(competencia.evidencia[indicador]),
        )
        for indicador in _ORDEN_EVIDENCIA.get(clave, ())
        if indicador in competencia.evidencia
    ]
    evidencias = "\n".join(filas)
    return (
        '<div class="competencia">\n'
        '  <div class="competencia__fila">'
        f'<span class="competencia__nombre">{escape(nombre)}</span>'
        f'<span class="competencia__nivel {clase}">'
        f"{escape(nivel_texto)}</span></div>\n"
        f"  {evidencias}\n"
        "</div>"
    )


def _lista(claves) -> str:
    """Viñetas cuadradas ■ con nombres legibles (o '—' si está vacía)."""
    valores = [getattr(c, "value", c) for c in claves]
    if not valores:
        valores = [SIN_DATO]
    return "\n".join(
        '        <li><span class="lista__vineta">■</span>'
        f'<span class="lista__texto">{escape(NOMBRES_COMPETENCIAS.get(c, c))}'
        "</span></li>"
        for c in valores
    )


# ---------------------------------------------------------------------------
# Contexto de cada página (SOLO presentación de DTOs ya calculados)
# ---------------------------------------------------------------------------
def _contexto_pagina_1(empleado, resultado) -> dict[str, str]:
    """Valores de la página 1: encabezado, datos básicos, competencias y D+E."""
    cuenta = getattr(empleado, "cuenta", None)
    rol = SIN_DATO if cuenta is None else {
        "RH": "RH", "EMPLEADO": "Empleado",
    }.get(cuenta.rol, cuenta.rol)
    estado = "Activo" if empleado.activo else "Inactivo"
    correo = SIN_DATO if cuenta is None else (cuenta.email or SIN_DATO)

    competencias = _ordenar(resultado.competencias)
    experiencia = resultado.experiencia
    antiguedad = (
        SIN_DATO if experiencia.anios_antiguedad is None
        else f"{experiencia.anios_antiguedad} años"
    )

    return {
        "nombre": escape(empleado.nombre),
        "estado": escape(estado),
        "rol": escape(rol),
        "puesto": escape(empleado.puesto or SIN_DATO),
        "area": escape(empleado.area or SIN_DATO),
        "fecha_ingreso": escape(_fecha_legible(empleado.fecha_ingreso)),
        "correo": escape(correo),
        "bloques_izquierda": "\n".join(
            _bloque_competencia(c) for c in competencias[:3]
        ),
        "bloques_derecha": "\n".join(
            _bloque_competencia(c) for c in competencias[3:]
        ),
        "lista_fortalezas": _lista(resultado.fortalezas),
        "lista_oportunidades": _lista(resultado.oportunidades),
        "antiguedad": escape(antiguedad),
        "proyectos_unicos": str(experiencia.proyectos_unicos),
    }


def _nivel_evolucion(evaluacion) -> str:
    """Nivel registrado en el snapshot de la PRIMERA competencia (§5.2).

    La nota de evolución es de UNA línea por periodo (el diseño no admite
    tablas): se toma el nivel tal como quedó guardado en su periodo, sin
    recalcular. ``Datos insuficientes`` nunca se convierte en nivel 0.
    """
    por_clave = {
        _clave_de(c): c for c in evaluacion.competencias
    }
    for clave in _ORDEN_COMPETENCIAS:
        competencia = por_clave.get(clave)
        if competencia is not None:
            if (
                competencia.nivel is None
                or competencia.status
                == EstadoCompetencia.INSUFFICIENT_DATA.value
            ):
                return TEXTO_DI
            return f"Nivel {competencia.nivel}"
    return SIN_DATO


def _bloque_historico(ultima) -> str:
    """Bloque con borde izquierdo: periodo, fecha y competencias históricas."""
    historicas = _ordenar(ultima.competencias)
    filas = [
        _fila(
            NOMBRES_COMPETENCIAS.get(_clave_de(c), _clave_de(c)),
            *_valor_historico(c.nivel, c.status),
        )
        for c in historicas
    ]
    columna_izquierda = "\n".join(filas[:3])
    columna_derecha = "\n".join(filas[3:])
    periodo = escape(str(ultima.periodo))
    generada = _fecha_hora_legible(ultima.generado_en)
    return (
        '    <div class="historico">\n'
        '      <p class="historico__linea">'
        f"Periodo {periodo} • Generada el {generada}</p>\n"
        '      <p class="historico__titulo">Competencias históricas:</p>\n'
        '      <div class="competencias-historicas">\n'
        '        <div class="competencias-historicas__columna">\n'
        f"{columna_izquierda}\n"
        "        </div>\n"
        '        <div class="competencias-historicas__columna">\n'
        f"{columna_derecha}\n"
        "        </div>\n"
        "      </div>\n"
        "    </div>"
    )


_NOTA_HISTORICA = (
    '<p class="nota">Fotografía histórica oficial del periodo más reciente: '
    "no refleja cambios registrados después de generarse.</p>"
)

_NOTA_SIN_HISTORICO = (
    '<p class="nota">Aún no hay evaluaciones oficiales registradas para este '
    "empleado. Cuando RH genere el periodo vigente, su fotografía histórica "
    "aparecerá aquí.</p>"
)


def _contexto_pagina_2(nine_box_actual, evaluaciones) -> dict[str, str]:
    """Valores de la página 2: histórico oficial, 9-Box y evolución."""
    ultima = evaluaciones[0] if evaluaciones else None

    if ultima is None:
        # Estado de ausencia permitido: sin periodo inventado (§6).
        nota_historica = _NOTA_SIN_HISTORICO
        bloque = ""
        nota_evolucion = (
            "Sin evaluaciones oficiales: no hay evolución que mostrar."
        )
    else:
        nota_historica = _NOTA_HISTORICA
        bloque = _bloque_historico(ultima)
        evolucion = ", ".join(
            f"{e.periodo}: {_nivel_evolucion(e)}" for e in evaluaciones
        )
        nota_evolucion = (
            "Evolución: Nivel de una competencia en cada evaluación oficial, "
            "tal como quedó registrado en su periodo: sin recalcular "
            f"({evolucion})."
        )

    nb_actual, nb_actual_di = _valor_nine_box(nine_box_actual)
    nb_historico, nb_historico_di = _valor_nine_box(
        ultima.nine_box if ultima is not None else None
    )

    return {
        "nota_historica": nota_historica,
        "bloque_historico": bloque,
        "clase_ninebox": " fila__valor--di" if nb_actual_di else "",
        "ninebox_actual": escape(nb_actual),
        "clase_ninebox_historico": (
            " fila__valor--di" if nb_historico_di else ""
        ),
        "ninebox_historico": escape(nb_historico),
        "nota_evolucion": escape(nota_evolucion),
    }


# ---------------------------------------------------------------------------
# Renderizado (HTML + CSS → Chromium/Playwright → PDF)
# ---------------------------------------------------------------------------
def construir_html_perfil(
    empleado, resultado, nine_box_actual, evaluaciones
) -> str:
    """HTML completo del informe (2 páginas Carta) a partir de DTOs reales.

    Entradas ya calculadas por los servicios del backend: aquí NO se
    aplican fórmulas ni reglas de negocio, solo se presentan.
    """
    contexto: dict[str, str] = {}
    contexto.update(_contexto_pagina_1(empleado, resultado))
    contexto.update(_contexto_pagina_2(nine_box_actual, evaluaciones))
    return _PLANTILLA.format(css=_CSS, **contexto)


def _renderizar_pdf(html: str) -> bytes:
    """Convierte el HTML del informe a PDF con Chromium (Playwright).

    - ``print_background=True``: fondos y colores de impresión.
    - ``prefer_css_page_size=True``: el tamaño de página lo manda la CSS
      (``@page { size: Letter portrait; margin: 14mm 12mm; }``). Los
      márgenes del renderizador se fijan a 0 para NO contradecir a la CSS:
      la única fuente de márgenes es la hoja de estilos.
    - Sin cabeceras ni pies automáticos de Chromium (sin numeración ni
      fechas al margen).
    - El navegador y la página se cierran SIEMPRE, también si falla el
      ``pdf()``: los recursos de Playwright viven en un context manager y
      el cierre va en un ``finally``.
    """
    with sync_playwright() as pw:
        navegador = pw.chromium.launch(headless=True)
        pagina = None
        try:
            pagina = navegador.new_page()
            pagina.set_content(html, wait_until="load")
            return pagina.pdf(
                prefer_css_page_size=True,
                print_background=True,
                display_header_footer=False,
                header_template="",
                footer_template="",
                margin={
                    "top": "0",
                    "right": "0",
                    "bottom": "0",
                    "left": "0",
                },
            )
        finally:
            if pagina is not None:
                pagina.close()
            navegador.close()


def generar_pdf_perfil(db: Session, empleado_id: int) -> tuple[bytes, str]:
    """Construye el informe PDF del perfil del empleado indicado.

    Devuelve ``(bytes_pdf, nombre_de_archivo)``. Solo lectura: compone los
    servicios existentes (empleado, resultado actual, 9-Box vigente e
    historial de evaluaciones) sin fórmulas propias ni IA. El nombre es
    ASCII y nunca incluye el correo.
    """
    empleado = empleado_service.obtener_empleado(db, empleado_id)  # 404
    resultado = resultado_actual_service.obtener_resultado_actual(
        db, empleado_id
    )
    nine_box_actual = nine_box_service.obtener_nine_box_actual(
        db, empleado_id
    )
    evaluaciones_orm, _total = evaluation_service.listar_evaluaciones(
        db, empleado_id=empleado_id, pagina=1, por_pagina=100
    )
    evaluaciones = [
        evaluation_service.a_evaluacion_out(e) for e in evaluaciones_orm
    ]

    html = construir_html_perfil(
        empleado, resultado, nine_box_actual, evaluaciones
    )
    contenido = _renderizar_pdf(html)

    nombre = (
        f"perfil-empleado-{_slug(empleado.nombre)}-"
        f"{fecha_negocio_hoy().isoformat()}.pdf"
    )
    return contenido, nombre
