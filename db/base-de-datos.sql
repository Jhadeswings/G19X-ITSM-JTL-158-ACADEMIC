--
-- PostgreSQL database dump
--

\restrict 8FajZjsJNRNJM1lBCy2QGnzgcus3RDnZcBYc5iE4hwlFnoIjhPVkiiiQMfn5YLv

-- Dumped from database version 15.19 (Debian 15.19-1.pgdg13+2)
-- Dumped by pg_dump version 15.19 (Debian 15.19-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: evaluacion_inmutable(); Type: FUNCTION; Schema: public; Owner: talento
--

CREATE FUNCTION public.evaluacion_inmutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            RAISE EXCEPTION
                'La evaluación oficial es inmutable: operación % no permitida sobre evaluaciones',
                TG_OP;
        END;
        $$;


ALTER FUNCTION public.evaluacion_inmutable() OWNER TO talento;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO talento;

--
-- Name: auditorias_modificacion; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.auditorias_modificacion (
    id integer NOT NULL,
    actor_cuenta_id integer NOT NULL,
    entidad character varying(64) NOT NULL,
    entidad_id integer NOT NULL,
    operacion character varying(64) NOT NULL,
    valores_anteriores jsonb,
    valores_nuevos jsonb,
    motivo character varying(512),
    fecha timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auditorias_modificacion OWNER TO talento;

--
-- Name: auditorias_modificacion_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.auditorias_modificacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.auditorias_modificacion_id_seq OWNER TO talento;

--
-- Name: auditorias_modificacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.auditorias_modificacion_id_seq OWNED BY public.auditorias_modificacion.id;


--
-- Name: capacitaciones; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.capacitaciones (
    id integer NOT NULL,
    empleado_id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    fecha date NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.capacitaciones OWNER TO talento;

--
-- Name: capacitaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.capacitaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.capacitaciones_id_seq OWNER TO talento;

--
-- Name: capacitaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.capacitaciones_id_seq OWNED BY public.capacitaciones.id;


--
-- Name: cuentas_acceso; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.cuentas_acceso (
    id integer NOT NULL,
    empleado_id integer,
    rol character varying(16) NOT NULL,
    email character varying(320) NOT NULL,
    password_hash character varying(255) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_cuentas_acceso_rol_valido CHECK (((rol)::text = ANY ((ARRAY['RH'::character varying, 'EMPLEADO'::character varying])::text[])))
);


ALTER TABLE public.cuentas_acceso OWNER TO talento;

--
-- Name: cuentas_acceso_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.cuentas_acceso_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cuentas_acceso_id_seq OWNER TO talento;

--
-- Name: cuentas_acceso_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.cuentas_acceso_id_seq OWNED BY public.cuentas_acceso.id;


--
-- Name: empleados; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.empleados (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    puesto character varying(255),
    area character varying(255),
    fecha_ingreso date,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.empleados OWNER TO talento;

--
-- Name: empleados_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.empleados_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.empleados_id_seq OWNER TO talento;

--
-- Name: empleados_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.empleados_id_seq OWNED BY public.empleados.id;


--
-- Name: evaluaciones; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.evaluaciones (
    id integer NOT NULL,
    empleado_id integer NOT NULL,
    periodo character varying(7) NOT NULL,
    desempeno_tecnico_nivel integer,
    desempeno_tecnico_status character varying(32) NOT NULL,
    liderazgo_nivel integer,
    liderazgo_status character varying(32) NOT NULL,
    trabajo_equipo_nivel integer,
    trabajo_equipo_status character varying(32) NOT NULL,
    comunicacion_nivel integer,
    comunicacion_status character varying(32) NOT NULL,
    aprendizaje_nivel integer,
    aprendizaje_status character varying(32) NOT NULL,
    performance_axis numeric(4,3),
    potential_axis numeric(4,3),
    box_code character varying(16),
    generado_en timestamp with time zone DEFAULT now() NOT NULL,
    generado_por_cuenta_id integer NOT NULL,
    empleado_nombre character varying(255),
    empleado_puesto character varying(255),
    empleado_area character varying(255),
    CONSTRAINT ck_evaluaciones_aprendizaje_nivel_rango CHECK (((aprendizaje_nivel IS NULL) OR ((aprendizaje_nivel >= 1) AND (aprendizaje_nivel <= 5)))),
    CONSTRAINT ck_evaluaciones_aprendizaje_status_coherente CHECK (((((aprendizaje_status)::text = 'CALCULABLE'::text) AND (aprendizaje_nivel IS NOT NULL)) OR (((aprendizaje_status)::text = 'INSUFFICIENT_DATA'::text) AND (aprendizaje_nivel IS NULL)))),
    CONSTRAINT ck_evaluaciones_comunicacion_nivel_rango CHECK (((comunicacion_nivel IS NULL) OR ((comunicacion_nivel >= 1) AND (comunicacion_nivel <= 5)))),
    CONSTRAINT ck_evaluaciones_comunicacion_status_coherente CHECK (((((comunicacion_status)::text = 'CALCULABLE'::text) AND (comunicacion_nivel IS NOT NULL)) OR (((comunicacion_status)::text = 'INSUFFICIENT_DATA'::text) AND (comunicacion_nivel IS NULL)))),
    CONSTRAINT ck_evaluaciones_desempeno_tecnico_nivel_rango CHECK (((desempeno_tecnico_nivel IS NULL) OR ((desempeno_tecnico_nivel >= 1) AND (desempeno_tecnico_nivel <= 5)))),
    CONSTRAINT ck_evaluaciones_desempeno_tecnico_status_coherente CHECK (((((desempeno_tecnico_status)::text = 'CALCULABLE'::text) AND (desempeno_tecnico_nivel IS NOT NULL)) OR (((desempeno_tecnico_status)::text = 'INSUFFICIENT_DATA'::text) AND (desempeno_tecnico_nivel IS NULL)))),
    CONSTRAINT ck_evaluaciones_liderazgo_nivel_rango CHECK (((liderazgo_nivel IS NULL) OR ((liderazgo_nivel >= 1) AND (liderazgo_nivel <= 5)))),
    CONSTRAINT ck_evaluaciones_liderazgo_status_coherente CHECK (((((liderazgo_status)::text = 'CALCULABLE'::text) AND (liderazgo_nivel IS NOT NULL)) OR (((liderazgo_status)::text = 'INSUFFICIENT_DATA'::text) AND (liderazgo_nivel IS NULL)))),
    CONSTRAINT ck_evaluaciones_periodo_formato CHECK (((periodo)::text ~ '^[0-9]{4}-Q[1-4]$'::text)),
    CONSTRAINT ck_evaluaciones_trabajo_equipo_nivel_rango CHECK (((trabajo_equipo_nivel IS NULL) OR ((trabajo_equipo_nivel >= 1) AND (trabajo_equipo_nivel <= 5)))),
    CONSTRAINT ck_evaluaciones_trabajo_equipo_status_coherente CHECK (((((trabajo_equipo_status)::text = 'CALCULABLE'::text) AND (trabajo_equipo_nivel IS NOT NULL)) OR (((trabajo_equipo_status)::text = 'INSUFFICIENT_DATA'::text) AND (trabajo_equipo_nivel IS NULL))))
);


ALTER TABLE public.evaluaciones OWNER TO talento;

--
-- Name: evaluaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.evaluaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.evaluaciones_id_seq OWNER TO talento;

--
-- Name: evaluaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.evaluaciones_id_seq OWNED BY public.evaluaciones.id;


--
-- Name: participaciones; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.participaciones (
    id integer NOT NULL,
    empleado_id integer NOT NULL,
    proyecto_id integer NOT NULL,
    rol character varying(255) NOT NULL,
    entregables text,
    en_equipo boolean DEFAULT false NOT NULL,
    coordino_tareas boolean DEFAULT false NOT NULL,
    explico_a_publico_distinto boolean DEFAULT false NOT NULL,
    resolvio_problema boolean DEFAULT false NOT NULL,
    horas integer NOT NULL,
    fecha_registro date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_participaciones_horas_no_negativas CHECK ((horas >= 0))
);


ALTER TABLE public.participaciones OWNER TO talento;

--
-- Name: participaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.participaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.participaciones_id_seq OWNER TO talento;

--
-- Name: participaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.participaciones_id_seq OWNED BY public.participaciones.id;


--
-- Name: proyectos; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.proyectos (
    id integer NOT NULL,
    nombre character varying(255) NOT NULL,
    nombre_normalizado character varying(255) NOT NULL,
    area character varying(255),
    cliente character varying(255),
    estado character varying(16) DEFAULT 'EN_PROCESO'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_proyectos_estado_valido CHECK (((estado)::text = ANY ((ARRAY['EN_PROCESO'::character varying, 'COMPLETADO'::character varying, 'CANCELADO'::character varying])::text[])))
);


ALTER TABLE public.proyectos OWNER TO talento;

--
-- Name: proyectos_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.proyectos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.proyectos_id_seq OWNER TO talento;

--
-- Name: proyectos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.proyectos_id_seq OWNED BY public.proyectos.id;


--
-- Name: tokens_recuperacion; Type: TABLE; Schema: public; Owner: talento
--

CREATE TABLE public.tokens_recuperacion (
    id integer NOT NULL,
    cuenta_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    usado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tokens_recuperacion OWNER TO talento;

--
-- Name: tokens_recuperacion_id_seq; Type: SEQUENCE; Schema: public; Owner: talento
--

CREATE SEQUENCE public.tokens_recuperacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tokens_recuperacion_id_seq OWNER TO talento;

--
-- Name: tokens_recuperacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: talento
--

ALTER SEQUENCE public.tokens_recuperacion_id_seq OWNED BY public.tokens_recuperacion.id;


--
-- Name: auditorias_modificacion id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.auditorias_modificacion ALTER COLUMN id SET DEFAULT nextval('public.auditorias_modificacion_id_seq'::regclass);


--
-- Name: capacitaciones id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.capacitaciones ALTER COLUMN id SET DEFAULT nextval('public.capacitaciones_id_seq'::regclass);


--
-- Name: cuentas_acceso id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.cuentas_acceso ALTER COLUMN id SET DEFAULT nextval('public.cuentas_acceso_id_seq'::regclass);


--
-- Name: empleados id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.empleados ALTER COLUMN id SET DEFAULT nextval('public.empleados_id_seq'::regclass);


--
-- Name: evaluaciones id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.evaluaciones ALTER COLUMN id SET DEFAULT nextval('public.evaluaciones_id_seq'::regclass);


--
-- Name: participaciones id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.participaciones ALTER COLUMN id SET DEFAULT nextval('public.participaciones_id_seq'::regclass);


--
-- Name: proyectos id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.proyectos ALTER COLUMN id SET DEFAULT nextval('public.proyectos_id_seq'::regclass);


--
-- Name: tokens_recuperacion id; Type: DEFAULT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.tokens_recuperacion ALTER COLUMN id SET DEFAULT nextval('public.tokens_recuperacion_id_seq'::regclass);


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.alembic_version (version_num) FROM stdin;
b7c1e9f2a4d3
\.


--
-- Data for Name: auditorias_modificacion; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.auditorias_modificacion (id, actor_cuenta_id, entidad, entidad_id, operacion, valores_anteriores, valores_nuevos, motivo, fecha) FROM stdin;
1	7	participacion	2	CORRECCION	{"horas": 120}	{"horas": 160}	Ajuste de horas del proveedor (demo)	2026-10-18 19:15:29.496276-06
2	7	participacion	10	CORRECCION	{"entregables": "Inventario de fuentes"}	{"entregables": "Inventario de fuentes y diccionario de datos (v2)"}	Entregables incompletos en el registro original (demo)	2026-10-18 19:15:30.054917-06
3	2	participacion	5	MODIFICACION_EMPLEADO	{"rol": "Diseño UI"}	{"rol": "Diseño UI/UX"}	\N	2026-10-18 19:15:30.078602-06
\.


--
-- Data for Name: capacitaciones; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.capacitaciones (id, empleado_id, nombre, fecha, completado, created_at, updated_at) FROM stdin;
1	1	Python avanzado	2026-02-10	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
2	1	Seguridad OWASP	2026-05-06	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
3	1	Kubernetes básico	2026-09-15	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
4	1	Taller de presentaciones	2026-10-05	f	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
5	2	Accesibilidad web	2026-03-11	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
6	2	Design systems	2026-07-22	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
7	3	Negociación	2026-04-09	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
8	3	Facilitación de talleres	2026-08-19	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
9	3	Excel avanzado	2025-10-01	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
10	4	dbt fundamentals	2026-06-03	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
11	4	Orquestación con Airflow	2026-06-25	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
12	5	Liderazgo de equipos	2026-02-27	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
13	5	Scrum	2026-05-14	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
14	5	Gestión de riesgos	2026-07-30	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
15	5	Coaching	2026-09-24	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
16	6	Herramientas de soporte	2024-11-12	t	2026-10-18 19:15:30.096452-06	2026-10-18 19:15:30.096452-06
\.


--
-- Data for Name: cuentas_acceso; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.cuentas_acceso (id, empleado_id, rol, email, password_hash, activo, must_change_password, created_at, updated_at) FROM stdin;
1	1	EMPLEADO	empleado01@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
2	2	EMPLEADO	empleado02@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
3	3	EMPLEADO	empleado03@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
4	4	EMPLEADO	empleado04@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
5	5	EMPLEADO	empleado05@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
6	6	EMPLEADO	empleado06@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
7	\N	RH	rh.demo@example.com	$2b$12$USCR4hWiZAnZEGrhpE4oOOg3fkaV9Ir0m96WUA2iR22xe3vuWCNbO	t	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
\.


--
-- Data for Name: empleados; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.empleados (id, nombre, puesto, area, fecha_ingreso, activo, created_at, updated_at) FROM stdin;
1	Alexa Ríos Fuentes	Desarrolladora Backend	Tecnología	2021-03-15	t	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
2	Bruno Salazar Mina	Diseñador UX	Tecnología	2022-07-04	t	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
3	Camila Vega Ortega	Consultora de Negocio	Consultoría	2019-11-20	t	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
4	Diego Lara Pineda	Ingeniero de Datos	Tecnología	2023-02-13	t	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
5	Elena Marín Soto	Líder de Proyecto	Consultoría	2020-05-04	t	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
6	Fabio Ruiz Cantú	Analista de Soporte	Operaciones	2024-09-02	f	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
\.


--
-- Data for Name: evaluaciones; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.evaluaciones (id, empleado_id, periodo, desempeno_tecnico_nivel, desempeno_tecnico_status, liderazgo_nivel, liderazgo_status, trabajo_equipo_nivel, trabajo_equipo_status, comunicacion_nivel, comunicacion_status, aprendizaje_nivel, aprendizaje_status, performance_axis, potential_axis, box_code, generado_en, generado_por_cuenta_id, empleado_nombre, empleado_puesto, empleado_area) FROM stdin;
1	1	2026-Q4	4	CALCULABLE	4	CALCULABLE	4	CALCULABLE	3	CALCULABLE	3	CALCULABLE	4.000	3.500	AM	2026-10-18 19:15:30.179625-06	7	Alexa Ríos Fuentes	Desarrolladora Backend	Tecnología
2	2	2026-Q4	4	CALCULABLE	4	CALCULABLE	1	CALCULABLE	4	CALCULABLE	3	CALCULABLE	4.000	3.000	AM	2026-10-18 19:15:30.179625-06	7	Bruno Salazar Mina	Diseñador UX	Tecnología
3	3	2026-Q4	4	CALCULABLE	4	CALCULABLE	3	CALCULABLE	4	CALCULABLE	3	CALCULABLE	4.000	3.500	AM	2026-10-18 19:15:30.179625-06	7	Camila Vega Ortega	Consultora de Negocio	Consultoría
4	4	2026-Q4	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	3	CALCULABLE	\N	\N	\N	2026-10-18 19:15:30.179625-06	7	Diego Lara Pineda	Ingeniero de Datos	Tecnología
5	5	2026-Q4	4	CALCULABLE	4	CALCULABLE	2	CALCULABLE	4	CALCULABLE	2	CALCULABLE	4.000	3.000	AM	2026-10-18 19:15:30.179625-06	7	Elena Marín Soto	Líder de Proyecto	Consultoría
6	1	2026-Q3	3	CALCULABLE	4	CALCULABLE	4	CALCULABLE	3	CALCULABLE	3	CALCULABLE	3.000	3.500	MM	2026-10-18 19:15:30.334213-06	7	Alexa Ríos Fuentes	Desarrolladora Backend	Tecnología
7	2	2026-Q3	3	CALCULABLE	4	CALCULABLE	1	CALCULABLE	4	CALCULABLE	3	CALCULABLE	3.000	3.000	MM	2026-10-18 19:15:30.334213-06	7	Bruno Salazar Mina	Diseñador UX	Tecnología
8	3	2026-Q3	3	CALCULABLE	4	CALCULABLE	3	CALCULABLE	4	CALCULABLE	3	CALCULABLE	3.000	3.500	MM	2026-10-18 19:15:30.334213-06	7	Camila Vega Ortega	Consultora de Negocio	Consultoría
9	4	2026-Q3	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	\N	INSUFFICIENT_DATA	2	CALCULABLE	\N	\N	\N	2026-10-18 19:15:30.334213-06	7	Diego Lara Pineda	Ingeniero de Datos	Tecnología
10	5	2026-Q3	3	CALCULABLE	4	CALCULABLE	2	CALCULABLE	4	CALCULABLE	2	CALCULABLE	3.000	3.000	MM	2026-10-18 19:15:30.334213-06	7	Elena Marín Soto	Líder de Proyecto	Consultoría
\.


--
-- Data for Name: participaciones; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.participaciones (id, empleado_id, proyecto_id, rol, entregables, en_equipo, coordino_tareas, explico_a_publico_distinto, resolvio_problema, horas, fecha_registro, created_at, updated_at) FROM stdin;
1	1	1	Backend	API de reportes y autenticación	t	t	t	f	160	2026-01-12	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
3	1	3	Ingeniería de datos	Carga histórica validada	t	f	f	t	80	2026-05-18	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
4	1	4	Backend	Migración de endpoints (en curso)	t	t	f	f	60	2026-08-10	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
6	2	2	Diseño UX	Flujos de alta de clientes	f	f	t	f	90	2026-04-14	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
7	2	3	Diseño de dashboards	Tablero de seguimiento	f	t	t	t	70	2026-06-01	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
8	3	1	Análisis de negocio	Requerimientos del portal	t	t	t	f	110	2026-01-26	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
9	3	2	Coordinación	Gestión con el cliente	t	f	f	t	140	2026-03-17	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
11	3	4	Coordinación	Plan de liberación	f	t	t	f	50	2026-09-01	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
12	4	2	Ingeniería de datos	Pipelines de ingesta	f	t	f	t	130	2026-04-07	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
13	4	4	Datos	Modelo intermedio	f	f	t	f	80	2026-08-24	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
14	5	1	Liderazgo técnico	Arquitectura y revisiones	f	t	t	f	150	2026-01-19	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
15	5	2	Liderazgo técnico	Gestión del proveedor	f	f	t	t	70	2026-09-01	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
16	5	3	Liderazgo técnico	Plan de migración	t	t	f	f	90	2026-05-11	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
17	6	4	Soporte	Mesa de ayuda inicial	f	t	f	t	40	2025-06-16	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
2	1	2	Backend	Servicios de sincronización	f	t	t	t	160	2026-03-03	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
10	3	3	Análisis	Inventario de fuentes y diccionario de datos (v2)	f	t	t	f	60	2026-05-26	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:30.054917-06
5	2	1	Diseño UI/UX	Sistema de componentes	f	t	f	f	100	2026-02-02	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:30.078602-06
\.


--
-- Data for Name: proyectos; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.proyectos (id, nombre, nombre_normalizado, area, cliente, estado, created_at, updated_at) FROM stdin;
1	Portal Interno PluriOne	portal interno plurione	Tecnología	\N	COMPLETADO	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
2	App Clientes Costa Verde	app clientes costa verde	Consultoría	Grupo Costa Verde (ficticio)	COMPLETADO	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
3	Migración de Datos Maestros	migracion de datos maestros	Tecnología	\N	CANCELADO	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
4	Rediseño del Portal Web	rediseno del portal web	Tecnología	\N	EN_PROCESO	2026-10-18 19:15:29.496276-06	2026-10-18 19:15:29.496276-06
\.


--
-- Data for Name: tokens_recuperacion; Type: TABLE DATA; Schema: public; Owner: talento
--

COPY public.tokens_recuperacion (id, cuenta_id, token_hash, expira_en, usado, created_at, updated_at) FROM stdin;
\.


--
-- Name: auditorias_modificacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.auditorias_modificacion_id_seq', 3, true);


--
-- Name: capacitaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.capacitaciones_id_seq', 16, true);


--
-- Name: cuentas_acceso_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.cuentas_acceso_id_seq', 7, true);


--
-- Name: empleados_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.empleados_id_seq', 6, true);


--
-- Name: evaluaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.evaluaciones_id_seq', 10, true);


--
-- Name: participaciones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.participaciones_id_seq', 17, true);


--
-- Name: proyectos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.proyectos_id_seq', 4, true);


--
-- Name: tokens_recuperacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: talento
--

SELECT pg_catalog.setval('public.tokens_recuperacion_id_seq', 1, false);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: auditorias_modificacion pk_auditorias_modificacion; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.auditorias_modificacion
    ADD CONSTRAINT pk_auditorias_modificacion PRIMARY KEY (id);


--
-- Name: capacitaciones pk_capacitaciones; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.capacitaciones
    ADD CONSTRAINT pk_capacitaciones PRIMARY KEY (id);


--
-- Name: cuentas_acceso pk_cuentas_acceso; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.cuentas_acceso
    ADD CONSTRAINT pk_cuentas_acceso PRIMARY KEY (id);


--
-- Name: empleados pk_empleados; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.empleados
    ADD CONSTRAINT pk_empleados PRIMARY KEY (id);


--
-- Name: evaluaciones pk_evaluaciones; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT pk_evaluaciones PRIMARY KEY (id);


--
-- Name: participaciones pk_participaciones; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.participaciones
    ADD CONSTRAINT pk_participaciones PRIMARY KEY (id);


--
-- Name: proyectos pk_proyectos; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT pk_proyectos PRIMARY KEY (id);


--
-- Name: tokens_recuperacion pk_tokens_recuperacion; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.tokens_recuperacion
    ADD CONSTRAINT pk_tokens_recuperacion PRIMARY KEY (id);


--
-- Name: evaluaciones uq_evaluaciones_empleado_periodo; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT uq_evaluaciones_empleado_periodo UNIQUE (empleado_id, periodo);


--
-- Name: participaciones uq_participaciones_empleado_proyecto; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.participaciones
    ADD CONSTRAINT uq_participaciones_empleado_proyecto UNIQUE (empleado_id, proyecto_id);


--
-- Name: proyectos uq_proyectos_nombre_normalizado; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT uq_proyectos_nombre_normalizado UNIQUE (nombre_normalizado);


--
-- Name: tokens_recuperacion uq_tokens_recuperacion_token_hash; Type: CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.tokens_recuperacion
    ADD CONSTRAINT uq_tokens_recuperacion_token_hash UNIQUE (token_hash);


--
-- Name: ix_auditorias_entidad_entidad_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_auditorias_entidad_entidad_id ON public.auditorias_modificacion USING btree (entidad, entidad_id);


--
-- Name: ix_auditorias_fecha; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_auditorias_fecha ON public.auditorias_modificacion USING btree (fecha);


--
-- Name: ix_auditorias_modificacion_actor_cuenta_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_auditorias_modificacion_actor_cuenta_id ON public.auditorias_modificacion USING btree (actor_cuenta_id);


--
-- Name: ix_capacitaciones_empleado_completado_fecha; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_capacitaciones_empleado_completado_fecha ON public.capacitaciones USING btree (empleado_id, completado, fecha);


--
-- Name: ix_capacitaciones_empleado_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_capacitaciones_empleado_id ON public.capacitaciones USING btree (empleado_id);


--
-- Name: ix_cuentas_acceso_empleado_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE UNIQUE INDEX ix_cuentas_acceso_empleado_id ON public.cuentas_acceso USING btree (empleado_id);


--
-- Name: ix_empleados_activo; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_empleados_activo ON public.empleados USING btree (activo);


--
-- Name: ix_empleados_area; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_empleados_area ON public.empleados USING btree (area);


--
-- Name: ix_evaluaciones_empleado_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_evaluaciones_empleado_id ON public.evaluaciones USING btree (empleado_id);


--
-- Name: ix_evaluaciones_generado_por_cuenta_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_evaluaciones_generado_por_cuenta_id ON public.evaluaciones USING btree (generado_por_cuenta_id);


--
-- Name: ix_evaluaciones_periodo; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_evaluaciones_periodo ON public.evaluaciones USING btree (periodo);


--
-- Name: ix_participaciones_empleado_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_participaciones_empleado_id ON public.participaciones USING btree (empleado_id);


--
-- Name: ix_participaciones_fecha_registro; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_participaciones_fecha_registro ON public.participaciones USING btree (fecha_registro);


--
-- Name: ix_participaciones_proyecto_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_participaciones_proyecto_id ON public.participaciones USING btree (proyecto_id);


--
-- Name: ix_proyectos_area; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_proyectos_area ON public.proyectos USING btree (area);


--
-- Name: ix_proyectos_estado; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_proyectos_estado ON public.proyectos USING btree (estado);


--
-- Name: ix_proyectos_nombre_normalizado_trgm; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_proyectos_nombre_normalizado_trgm ON public.proyectos USING gin (nombre_normalizado public.gin_trgm_ops);


--
-- Name: ix_tokens_recuperacion_cuenta_id; Type: INDEX; Schema: public; Owner: talento
--

CREATE INDEX ix_tokens_recuperacion_cuenta_id ON public.tokens_recuperacion USING btree (cuenta_id);


--
-- Name: uq_cuentas_acceso_email_ci; Type: INDEX; Schema: public; Owner: talento
--

CREATE UNIQUE INDEX uq_cuentas_acceso_email_ci ON public.cuentas_acceso USING btree (lower((email)::text));


--
-- Name: evaluaciones trg_evaluaciones_inmutable; Type: TRIGGER; Schema: public; Owner: talento
--

CREATE TRIGGER trg_evaluaciones_inmutable BEFORE DELETE OR UPDATE ON public.evaluaciones FOR EACH ROW EXECUTE FUNCTION public.evaluacion_inmutable();


--
-- Name: auditorias_modificacion fk_auditorias_modificacion_actor_cuenta_id_cuentas_acceso; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.auditorias_modificacion
    ADD CONSTRAINT fk_auditorias_modificacion_actor_cuenta_id_cuentas_acceso FOREIGN KEY (actor_cuenta_id) REFERENCES public.cuentas_acceso(id) ON DELETE RESTRICT;


--
-- Name: capacitaciones fk_capacitaciones_empleado_id_empleados; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.capacitaciones
    ADD CONSTRAINT fk_capacitaciones_empleado_id_empleados FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE RESTRICT;


--
-- Name: cuentas_acceso fk_cuentas_acceso_empleado_id_empleados; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.cuentas_acceso
    ADD CONSTRAINT fk_cuentas_acceso_empleado_id_empleados FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE RESTRICT;


--
-- Name: evaluaciones fk_evaluaciones_empleado_id_empleados; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT fk_evaluaciones_empleado_id_empleados FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE RESTRICT;


--
-- Name: evaluaciones fk_evaluaciones_generado_por_cuenta_id_cuentas_acceso; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.evaluaciones
    ADD CONSTRAINT fk_evaluaciones_generado_por_cuenta_id_cuentas_acceso FOREIGN KEY (generado_por_cuenta_id) REFERENCES public.cuentas_acceso(id) ON DELETE RESTRICT;


--
-- Name: participaciones fk_participaciones_empleado_id_empleados; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.participaciones
    ADD CONSTRAINT fk_participaciones_empleado_id_empleados FOREIGN KEY (empleado_id) REFERENCES public.empleados(id) ON DELETE RESTRICT;


--
-- Name: participaciones fk_participaciones_proyecto_id_proyectos; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.participaciones
    ADD CONSTRAINT fk_participaciones_proyecto_id_proyectos FOREIGN KEY (proyecto_id) REFERENCES public.proyectos(id) ON DELETE RESTRICT;


--
-- Name: tokens_recuperacion fk_tokens_recuperacion_cuenta_id_cuentas_acceso; Type: FK CONSTRAINT; Schema: public; Owner: talento
--

ALTER TABLE ONLY public.tokens_recuperacion
    ADD CONSTRAINT fk_tokens_recuperacion_cuenta_id_cuentas_acceso FOREIGN KEY (cuenta_id) REFERENCES public.cuentas_acceso(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 8FajZjsJNRNJM1lBCy2QGnzgcus3RDnZcBYc5iE4hwlFnoIjhPVkiiiQMfn5YLv

