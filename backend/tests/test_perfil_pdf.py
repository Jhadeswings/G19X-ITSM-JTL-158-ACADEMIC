"""Exportación REAL del perfil de empleado a PDF (DECISIONES §55).

Motor: plantilla HTML+CSS (``app/services/pdf/``) convertida a PDF con
Chromium vía Playwright. Las pruebas inspeccionan el archivo con ``pypdf``:

1. PDF válido: magic ``%PDF``, ``application/pdf``, ``attachment`` con
   nombre sanitizado ASCII (sin correo).
2. Exactamente 2 páginas Carta (612 × 792 pt por página) con el corte
   especificado: la página 1 cierra con «Fortalezas y oportunidades |
   Experiencia» y la 2 comienza en «Última evaluación oficial». Sin
   cabeceras, pies de página, fechas al margen ni números de página.
3. Secciones, textos fijos, acentos y orden de las cinco competencias.
4. Los datos son los del empleado consultado: nada de valores fijos de
   demostración (p. ej. nunca «Vanesa»).
5. ``Datos insuficientes`` y campos ausentes se muestran como tales, sin
   inventar valores ni convertir DI en cero.
6. El histórico del snapshot NO se recalcula: convive en el PDF con un
   resultado actual que cambió después de generarse la evaluación.
7. Autorización existente: 401 sin token, 403 Empleado, RH 200, 404 si el
   empleado no existe. Un fallo de generación responde 500 con mensaje
   genérico (sin detalle interno).
8. La generación no crea evaluaciones, no modifica datos y NO invoca a la
   IA (la descarga jamás dispara una sugerencia).
9. Muestra sintética de referencia (``tests/muestra_perfil_pdf.py``) con
   TODOS los valores del documento maquetado.
"""

import re
from datetime import date
from io import BytesIO

from pypdf import PdfReader
from sqlalchemy import func, select

from app.core.fechas import fecha_negocio_hoy
from app.models.capacitacion import Capacitacion
from app.models.evaluacion import Evaluacion
from app.models.participacion import Participacion
from app.models.proyecto import Proyecto
from app.services import evaluation_service
from app.services.competency_engine import CompetencyEngine
from tests.helpers import (
    cabecera,
    crear_cuenta,
    crear_empleado,
    login_y_token,
)

ANIO = fecha_negocio_hoy().year
URL_PDF = "/api/v1/rh/employees/{empleado_id}/profile/pdf"

# Carta/Letter vertical en puntos PDF (8.5 × 11 pulgadas).
ANCHO_CARTA = 612.0
ALTO_CARTA = 792.0


# ----------------------------------------------------------------------
# Utilidades de inspección del PDF
# ----------------------------------------------------------------------
def _lector(binario: bytes) -> PdfReader:
    return PdfReader(BytesIO(binario))


def _paginas(binario: bytes) -> int:
    return len(_lector(binario).pages)


def _pagina_es_carta(page) -> bool:
    return (
        abs(float(page.mediabox.width) - ANCHO_CARTA) < 0.5
        and abs(float(page.mediabox.height) - ALTO_CARTA) < 0.5
    )


def _texto_pagina(binario: bytes, indice: int) -> str:
    """Texto de una página con espacios normalizados (comparaciones)."""
    texto = _lector(binario).pages[indice].extract_text() or ""
    return re.sub(r"\s+", " ", texto).strip()


def _texto_pdf(binario: bytes) -> str:
    """Texto de todo el documento (Chromium escribe ToUnicode: acentos OK)."""
    return re.sub(
        r"\s+", " ",
        "\n".join(
            pagina.extract_text() or "" for pagina in _lector(binario).pages
        ),
    ).strip()


def _sembrar_evaluable(db, *, nombre, puesto=None, area=None, cuenta=None,
                       prefijo="PR"):
    """Empleado con desempeño técnico calculable (3 proyectos COMPLETADO)
    y 4 capacitaciones completadas del año (aprendizaje calculable).

    ``prefijo`` distingue los proyectos entre siembras (unicidad global de
    ``nombre_normalizado``, ET §6.1)."""
    empleado = crear_empleado(db, nombre=nombre, puesto=puesto, area=area)
    if cuenta is not None:
        crear_cuenta(db, rol="EMPLEADO", email=cuenta, empleado=empleado)
    for i in range(3):
        proyecto = Proyecto(
            nombre=f"{prefijo}-P{i}",
            nombre_normalizado=f"{prefijo.lower()}-p{i}",
            estado="COMPLETADO",
        )
        db.add(proyecto)
        db.flush()
        db.add(Participacion(
            empleado_id=empleado.id,
            proyecto_id=proyecto.id,
            rol="QA",
            horas=10,
            fecha_registro=fecha_negocio_hoy(),
        ))
    for i in range(4):
        db.add(Capacitacion(
            empleado_id=empleado.id,
            nombre=f"{prefijo}-C{i}",
            fecha=date(ANIO, 6, 1),
            completado=True,
        ))
    db.commit()
    return empleado


def _nivel_tecnico(db, empleado_id) -> int | None:
    for c in CompetencyEngine(db).calculate(empleado_id).competencias:
        if c.clave.value == "desempeno_tecnico":
            return c.nivel
    return None


def _contar(db, modelo) -> int:
    return int(db.scalar(select(func.count()).select_from(modelo)) or 0)


# ----------------------------------------------------------------------
# 1/7. Contrato, autorización y errores gestionados
# ----------------------------------------------------------------------
class TestContratoYAutorizacion:
    def test_sin_token_401(self, client, db):
        empleado = _sembrar_evaluable(db, nombre="Empleado PDF")
        respuesta = client.get(URL_PDF.format(empleado_id=empleado.id))
        assert respuesta.status_code == 401

    def test_empleado_403(self, client, db, cuenta_empleado):
        token = login_y_token(client, "empleado@empresa.dev")
        empleado = _sembrar_evaluable(db, nombre="Otro Empleado")
        respuesta = client.get(
            URL_PDF.format(empleado_id=empleado.id),
            headers=cabecera(token),
        )
        assert respuesta.status_code == 403

    def test_empleado_inexistente_404(self, client, cuenta_rh):
        token = login_y_token(client, "rh@empresa.dev")
        respuesta = client.get(
            URL_PDF.format(empleado_id=99999), headers=cabecera(token)
        )
        assert respuesta.status_code == 404

    def test_pdf_valido_rh(self, client, db, cuenta_rh):
        empleado = _sembrar_evaluable(
            db,
            nombre="García Ñandú",
            cuenta="garcia@empresa.dev",
        )
        token = login_y_token(client, "rh@empresa.dev")
        respuesta = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        )
        assert respuesta.status_code == 200
        assert respuesta.headers["content-type"].startswith(
            "application/pdf"
        )
        disposicion = respuesta.headers["content-disposition"]
        assert disposicion.startswith("attachment; filename=")
        nombre = disposicion.split('filename="')[1].rstrip('"')
        assert nombre == (
            f"perfil-empleado-garcia-nandu-{fecha_negocio_hoy().isoformat()}"
            ".pdf"
        )
        nombre.encode("ascii")  # sin correo, sin acentos, ASCII puro
        cuerpo = respuesta.content
        assert cuerpo.startswith(b"%PDF")
        # Perfil actual + histórico/desarrollo: SIEMPRE 2 páginas Carta.
        assert _paginas(cuerpo) == 2
        assert all(_pagina_es_carta(p) for p in _lector(cuerpo).pages)

    def test_error_generacion_responde_500_generico(self, client, db,
                                                    cuenta_rh, monkeypatch):
        import app.api.rh_empleados as modulo_router

        def _fallar(_db, _empleado_id):
            raise RuntimeError("detalle interno sensible")

        monkeypatch.setattr(
            modulo_router.perfil_pdf_service,
            "generar_pdf_perfil",
            _fallar,
        )
        empleado = _sembrar_evaluable(db, nombre="Fallo Render")
        token = login_y_token(client, "rh@empresa.dev")
        respuesta = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        )
        assert respuesta.status_code == 500
        assert "detalle interno sensible" not in respuesta.text

    def test_secciones_presentas(self, client, db, cuenta_rh):
        empleado = _sembrar_evaluable(
            db, nombre="García Ñandú", puesto="Diseñador", area="TI",
            cuenta="garcia@empresa.dev",
        )
        token = login_y_token(client, "rh@empresa.dev")
        cuerpo = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content
        texto = _texto_pdf(cuerpo)
        for esperado in (
            "García", "Ñandú", "Diseñador",  # acentos intactos
            "PERFIL DEL EMPLEADO • INFORMACIÓN BÁSICA REGISTRADA",
            "RESULTADO ACTUAL", "COMPETENCIAS & EVIDENCIA",
            "FORTALEZAS Y OPORTUNIDADES", "EXPERIENCIA",
            "ÚLTIMA EVALUACIÓN OFICIAL", "9-BOX Y EVOLUCIÓN",
            "Acciones de Desarrollo:", "Activo", "Empleado",
            "garcia@empresa.dev",
            "Proyectos completados",        # evidencia real del motor
            "Capacitaciones registradas",
            "No corresponde a un periodo ni se guarda como registro.",
            "Evidencia que sustenta cada competencia del resultado actual.",
        ):
            assert esperado in texto, esperado


# ----------------------------------------------------------------------
# 2/3. Formato Carta, paginación exacta y sin elementos de página
# ----------------------------------------------------------------------
class TestFormatoYPaginacion:
    def test_dos_paginas_carta_y_corte_especificado(self, client, db,
                                                    cuenta_rh):
        empleado = _sembrar_evaluable(
            db, nombre="Corte de Página", puesto="Analista", area="TI"
        )
        token = login_y_token(client, "rh@empresa.dev")
        cuerpo = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content

        assert _paginas(cuerpo) == 2
        lector = _lector(cuerpo)
        assert all(_pagina_es_carta(p) for p in lector.pages)

        pagina_1 = _texto_pagina(cuerpo, 0)
        pagina_2 = _texto_pagina(cuerpo, 1)
        # La 1 CIERRA con Fortalezas y oportunidades | Experiencia...
        assert "FORTALEZAS Y OPORTUNIDADES" in pagina_1
        assert "EXPERIENCIA" in pagina_1
        assert "Antigüedad" in pagina_1
        assert pagina_1.rstrip().endswith("Proyectos únicos 3")
        # ...y NO empieza la 2; esta COMIENZA en Última evaluación oficial.
        assert "ÚLTIMA EVALUACIÓN OFICIAL" not in pagina_1
        assert pagina_2.startswith("ÚLTIMA EVALUACIÓN OFICIAL")
        assert "RESULTADO ACTUAL" not in pagina_2
        assert "COMPETENCIAS & EVIDENCIA" not in pagina_2
        assert "FORTALEZAS Y OPORTUNIDADES" not in pagina_2

    def test_sin_cabeceras_pies_ni_numeracion(self, client, db, cuenta_rh):
        empleado = _sembrar_evaluable(db, nombre="Sin Elemento Pie")
        token = login_y_token(client, "rh@empresa.dev")
        texto = _texto_pdf(client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content)
        assert "Página 1" not in texto
        assert "Página 2" not in texto
        assert "Generado el" not in texto  # la 2 sí dice «Generada el»
        assert not re.search(r"\b1\s*/\s*2\b", texto)

    def test_orden_de_las_cinco_competencias(self, client, db, cuenta_rh):
        empleado = _sembrar_evaluable(db, nombre="Orden Correcto")
        token = login_y_token(client, "rh@empresa.dev")
        pagina_1 = _texto_pagina(client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content, 0)
        nombres = (
            "Desempeño técnico",
            "Liderazgo",
            "Trabajo en equipo",
            "Comunicación",
            "Capacidad de aprendizaje",
        )
        posiciones = [pagina_1.index(nombre) for nombre in nombres]
        assert posiciones == sorted(posiciones)
        # Columna izquierda: DT, Liderazgo, Trabajo | derecha: Com., Aprend.
        assert posiciones[2] < posiciones[3]


# ----------------------------------------------------------------------
# 4/5. Datos reales por empleado, DI y ausentes
# ----------------------------------------------------------------------
class TestDatosReales:
    def test_cada_perfil_trae_sus_datos(self, client, db, cuenta_rh):
        ana = _sembrar_evaluable(
            db, nombre="Ana García", cuenta="ana@empresa.dev", prefijo="AN"
        )
        bruno = _sembrar_evaluable(
            db, nombre="Bruno López", cuenta="bruno@empresa.dev", prefijo="BR"
        )
        token = login_y_token(client, "rh@empresa.dev")
        pdf_ana = _texto_pdf(client.get(
            URL_PDF.format(empleado_id=ana.id), headers=cabecera(token)
        ).content)
        pdf_bruno = _texto_pdf(client.get(
            URL_PDF.format(empleado_id=bruno.id), headers=cabecera(token)
        ).content)
        assert "García" in pdf_ana and "López" not in pdf_ana
        assert "López" in pdf_bruno and "García" not in pdf_bruno
        # Nunca valores fijos del documento de referencia:
        assert "Vanesa" not in pdf_ana and "Vanesa" not in pdf_bruno
        assert "pruebavanesa" not in pdf_ana
        assert "pruebavanesa" not in pdf_bruno

    def test_datos_insuficientes_y_campos_ausentes(self, client, db,
                                                   cuenta_rh):
        # Sin participaciones ni capacitaciones ni cuenta: todo DI y sin
        # puesto/área/ingreso/correo. Nada se inventa.
        empleado = crear_empleado(db, nombre="Recién Ingresado")
        token = login_y_token(client, "rh@empresa.dev")
        cuerpo = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content
        texto = _texto_pdf(cuerpo)
        assert "Datos insuficientes" in texto
        assert "—" in texto  # convención de la app para ausentes
        assert "9-Box" in texto
        assert "9-Box histórico" in texto
        assert "Datos insuficientes." in texto
        assert "Nivel 0" not in texto  # DI jamás es cero


# ----------------------------------------------------------------------
# 6/8. Histórico inmutable, sin efectos laterales y sin IA
# ----------------------------------------------------------------------
class TestHistoricoYSinEfectos:
    def test_historico_no_recalculado(self, client, db, cuenta_rh):
        empleado = _sembrar_evaluable(db, nombre="Histórico Fiel")
        # Snapshot del periodo vigente con los niveles de AHORA.
        evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)
        nivel_snapshot = _nivel_tecnico(db, empleado.id)
        assert nivel_snapshot is not None  # 3/3 completados: calculable

        # El estado presente CAMBIA después del snapshot: 3 cancelados
        # nuevos bajan el desempeño técnico vigente.
        for i in range(3):
            proyecto = Proyecto(
                nombre=f"H-P{i}",
                nombre_normalizado=f"h-p{i}",
                estado="CANCELADO",
            )
            db.add(proyecto)
            db.flush()
            db.add(Participacion(
                empleado_id=empleado.id,
                proyecto_id=proyecto.id,
                rol="QA",
                horas=10,
                fecha_registro=fecha_negocio_hoy(),
            ))
        db.commit()
        nivel_actual = _nivel_tecnico(db, empleado.id)
        assert nivel_actual != nivel_snapshot  # divergen: la prueba es útil

        token = login_y_token(client, "rh@empresa.dev")
        texto = _texto_pdf(client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).content)
        # El PDF conserva el snapshot original...
        assert f"Nivel {nivel_snapshot}" in texto
        # ...y muestra el resultado actual DISTINTO: nunca lo sustituye.
        assert f"Nivel {nivel_actual}" in texto
        # El bloque histórico conserva su periodo y su fecha de generación.
        assert "Competencias históricas:" in texto
        assert "Generada el" in texto

    def test_no_crea_evaluaciones_ni_modifica_datos(self, client, db,
                                                    cuenta_rh):
        empleado = _sembrar_evaluable(db, nombre="Sin Efectos")
        evaluation_service.generar_evaluaciones(db, cuenta_rh=cuenta_rh)
        db.expire_all()
        antes = {
            "evaluaciones": _contar(db, Evaluacion),
            "participaciones": _contar(db, Participacion),
            "capacitaciones": _contar(db, Capacitacion),
        }
        token = login_y_token(client, "rh@empresa.dev")
        assert client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        ).status_code == 200
        db.expire_all()
        assert _contar(db, Evaluacion) == antes["evaluaciones"]
        assert _contar(db, Participacion) == antes["participaciones"]
        assert _contar(db, Capacitacion) == antes["capacitaciones"]

    def test_la_descarga_no_invoca_la_ia(self, client, db, cuenta_rh,
                                         monkeypatch):
        import app.api.rh_empleados as modulo_router

        def _prohibido():
            raise AssertionError(
                "La descarga del PDF no debe invocar a la IA."
            )

        monkeypatch.setattr(
            modulo_router, "construir_orchestrator", _prohibido
        )
        empleado = _sembrar_evaluable(db, nombre="Sin IA")
        token = login_y_token(client, "rh@empresa.dev")
        respuesta = client.get(
            URL_PDF.format(empleado_id=empleado.id), headers=cabecera(token)
        )
        assert respuesta.status_code == 200
        texto = _texto_pdf(respuesta.content)
        # El bloque es un texto fijo de presentación (sin llamada a IA):
        assert "no determina niveles ni modifica el resultado oficial" in texto
        assert "Sugerencia de apoyo generada con IA" in texto


# ----------------------------------------------------------------------
# 9. Muestra sintética: fidelidad de TODOS los valores de referencia
# ----------------------------------------------------------------------
def _compacto(texto: str) -> str:
    """Sin espacios: estable ante junturas de tramos de pypdf."""
    return re.sub(r"\s+", "", texto)


class TestMuestraSintetica:
    def test_muestra_con_todos_los_valores_de_referencia(self):
        from tests.muestra_perfil_pdf import RUTA_SALIDA, generar_pdf

        ruta = generar_pdf()
        assert ruta == RUTA_SALIDA and ruta.exists()
        cuerpo = ruta.read_bytes()
        assert cuerpo.startswith(b"%PDF")
        assert _paginas(cuerpo) == 2
        assert all(_pagina_es_carta(p) for p in _lector(cuerpo).pages)

        pagina_1 = _texto_pagina(cuerpo, 0)
        pagina_2 = _texto_pagina(cuerpo, 1)
        pagina_1_c = _compacto(pagina_1)
        pagina_2_c = _compacto(pagina_2)

        # Encabezado y datos básicos de la muestra (4.1 / 4.2).
        for esperado in (
            "Vanesa Gutiérrez Zamora",
            "PERFIL DEL EMPLEADO • INFORMACIÓN BÁSICA REGISTRADA",
            "Desarrollador de software",
            "Tecnología",
            "4 de octubre de 2026",
            "pruebavanesa@empresa.dev",
        ):
            assert esperado in pagina_1, esperado
        assert _compacto("ESTADO: Activo • ROL: Empleado") in pagina_1_c

        # Notas y subtítulos con texto EXACTO (4.3).
        assert (
            "Cálculo dinámico con el estado actual del empleado. "
            "No corresponde a un periodo ni se guarda como registro."
        ) in pagina_1
        assert "COMPETENCIAS & EVIDENCIA" in pagina_1
        assert (
            "Evidencia que sustenta cada competencia del resultado actual."
        ) in pagina_1

        # Competencias: niveles y evidencia de la fixture (4.4).
        for esperado in (
            "Desempeño técnico",
            "Proyectos completados",
            "Proyectos evaluables",
            "Proyectos cancelados",
            "Proyectos en proceso (excluidos)",
            "Coordinó tareas",
            "Trabajó en equipo",
            "Explicó a públicos distintos",
            "Roles distintos",
            "Proyectos únicos",
            "Capacitaciones registradas",
            "Cursos completados este año",
        ):
            assert esperado in pagina_1, esperado
        for nivel in (
            "Datos insuficientes",
            "Nivel 2 • En desarrollo",
            "Nivel 4 • Consolidado",
            "Nivel 3 • En crecimiento",
        ):
            assert _compacto(nivel) in pagina_1_c, nivel

        # Orden obligatorio de las cinco competencias en la página 1.
        nombres = (
            "Desempeño técnico",
            "Liderazgo",
            "Trabajo en equipo",
            "Comunicación",
            "Capacidad de aprendizaje",
        )
        posiciones = [pagina_1.index(n) for n in nombres]
        assert posiciones == sorted(posiciones)

        # Valores numéricos concretos de la evidencia (1/1/0/2; 3/1; ...).
        assert re.search(
            r"Proyectos en proceso \(excluidos\)\s+2", pagina_1
        )
        assert re.search(r"Coordinó tareas\s+1", pagina_1)
        assert re.search(r"Trabajó en equipo\s+2", pagina_1)
        assert re.search(r"Explicó a públicos distintos\s+2", pagina_1)
        assert re.search(r"Capacitaciones registradas\s+2", pagina_1)
        assert re.search(r"Cursos completados este año\s+2", pagina_1)

        # Fortalezas / Oportunidades | Experiencia cierran la página 1.
        assert "FORTALEZAS Y OPORTUNIDADES" in pagina_1
        assert "OPORTUNIDADES" in pagina_1
        assert "EXPERIENCIA" in pagina_1
        assert "Antigüedad" in pagina_1
        assert re.search(r"Antigüedad\s+0\.04 años", pagina_1)
        assert pagina_1.rstrip().endswith("Proyectos únicos 3")

        # Página 2: histórico oficial con periodo y fecha exactos (5.1).
        assert pagina_2.startswith("ÚLTIMA EVALUACIÓN OFICIAL")
        assert (
            "Fotografía histórica oficial del periodo más reciente: "
            "no refleja cambios registrados después de generarse."
        ) in pagina_2
        assert "Periodo 2026-Q4" in pagina_2
        assert "Generada el 5 de octubre de 2026" in pagina_2
        assert "Competencias históricas:" in pagina_2
        for esperado in ("Nivel 1.", "Nivel 5.", "Nivel 2.", "Nivel 3."):
            assert esperado in pagina_2, esperado
        assert pagina_2_c.count("Datosinsuficientes.") >= 3  # DT + 9Box×2

        # 9-Box y evolución con el texto exacto (5.2).
        assert "9-Box" in pagina_2 and "9-Box histórico" in pagina_2
        assert (
            "sin recalcular (2026-Q4: Datos insuficientes)."
        ) in pagina_2

        # Acciones de desarrollo: UN solo bloque con el texto exacto (5.3).
        assert "Acciones de Desarrollo:" in pagina_2
        assert (
            "Sugerencia de apoyo generada con IA a partir del resultado "
            "actual del empleado."
        ) in pagina_2
        assert (
            "Consulta una sugerencia de desarrollo cuando la necesites: "
            "se genera en el momento a partir de los datos actuales del "
            "empleado."
        ) in pagina_2
