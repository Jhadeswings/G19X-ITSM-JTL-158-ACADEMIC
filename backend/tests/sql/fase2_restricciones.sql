-- Pruebas de restricciones (Fase 2). Modo autocommit: cada error esperado es
-- independiente. Limpia datos previos y se limpia al final.

TRUNCATE TABLE auditorias_modificacion, evaluaciones, participaciones,
    capacitaciones, proyectos, cuentas_acceso, empleados RESTART IDENTITY CASCADE;

INSERT INTO empleados (nombre, puesto, area, fecha_ingreso, activo)
VALUES ('Empleado Prueba', 'Dev', 'TI', '2024-01-15', true);

INSERT INTO cuentas_acceso (empleado_id, rol, email, password_hash)
VALUES (1, 'EMPLEADO', 'Prueba@Example.COM', 'hash_x');

-- 1) Email case-insensitive: debe FALLAR (violación de uq_cuentas_acceso_email_ci)
INSERT INTO cuentas_acceso (empleado_id, rol, email, password_hash)
VALUES (NULL, 'RH', 'prueba@example.com', 'hash_y');

-- 2) Rol inválido: debe FALLAR (ck_cuentas_acceso_rol_valido)
INSERT INTO cuentas_acceso (empleado_id, rol, email, password_hash)
VALUES (NULL, 'ADMIN', 'otro@example.com', 'hash_z');

-- 3) Evaluacion válida (status CALCULABLE con nivel, DI con NULL)
INSERT INTO evaluaciones (empleado_id, periodo,
    desempeno_tecnico_nivel, desempeno_tecnico_status,
    liderazgo_nivel, liderazgo_status,
    trabajo_equipo_nivel, trabajo_equipo_status,
    comunicacion_nivel, comunicacion_status,
    aprendizaje_nivel, aprendizaje_status,
    performance_axis, potential_axis, box_code, generado_por_cuenta_id)
VALUES (1, '2026-Q3',
    4, 'CALCULABLE',
    3, 'CALCULABLE',
    2, 'CALCULABLE',
    NULL, 'INSUFFICIENT_DATA',
    5, 'CALCULABLE',
    4.000, 3.500, 'A2', 1);

-- 4) Periodo duplicado: debe FALLAR (uq_evaluaciones_empleado_periodo)
INSERT INTO evaluaciones (empleado_id, periodo,
    desempeno_tecnico_nivel, desempeno_tecnico_status,
    liderazgo_nivel, liderazgo_status,
    trabajo_equipo_nivel, trabajo_equipo_status,
    comunicacion_nivel, comunicacion_status,
    aprendizaje_nivel, aprendizaje_status, generado_por_cuenta_id)
VALUES (1, '2026-Q3', 4,'CALCULABLE', 3,'CALCULABLE', 2,'CALCULABLE', 4,'CALCULABLE', 5,'CALCULABLE', 1);

-- 5) Periodo mal formado: debe FALLAR (ck_evaluaciones_periodo_formato)
INSERT INTO evaluaciones (empleado_id, periodo,
    desempeno_tecnico_nivel, desempeno_tecnico_status,
    liderazgo_nivel, liderazgo_status,
    trabajo_equipo_nivel, trabajo_equipo_status,
    comunicacion_nivel, comunicacion_status,
    aprendizaje_nivel, aprendizaje_status, generado_por_cuenta_id)
VALUES (1, '2026-Q5', 4,'CALCULABLE', 3,'CALCULABLE', 2,'CALCULABLE', 4,'CALCULABLE', 5,'CALCULABLE', 1);

-- 6) Status incoherente: debe FALLAR (CALCULABLE con nivel NULL)
INSERT INTO evaluaciones (empleado_id, periodo,
    desempeno_tecnico_nivel, desempeno_tecnico_status,
    liderazgo_nivel, liderazgo_status,
    trabajo_equipo_nivel, trabajo_equipo_status,
    comunicacion_nivel, comunicacion_status,
    aprendizaje_nivel, aprendizaje_status, generado_por_cuenta_id)
VALUES (1, '2026-Q4', NULL,'CALCULABLE', 3,'CALCULABLE', 2,'CALCULABLE', 4,'CALCULABLE', 5,'CALCULABLE', 1);

-- 7) Nivel fuera de rango: debe FALLAR (ck_evaluaciones_*_nivel_rango)
INSERT INTO evaluaciones (empleado_id, periodo,
    desempeno_tecnico_nivel, desempeno_tecnico_status,
    liderazgo_nivel, liderazgo_status,
    trabajo_equipo_nivel, trabajo_equipo_status,
    comunicacion_nivel, comunicacion_status,
    aprendizaje_nivel, aprendizaje_status, generado_por_cuenta_id)
VALUES (1, '2026-Q4', 9,'CALCULABLE', 3,'CALCULABLE', 2,'CALCULABLE', 4,'CALCULABLE', 5,'CALCULABLE', 1);

-- 8) Inmutabilidad: UPDATE debe FALLAR (trigger)
UPDATE evaluaciones SET box_code = 'B3' WHERE empleado_id = 1;

-- 9) Inmutabilidad: DELETE debe FALLAR (trigger)
DELETE FROM evaluaciones WHERE empleado_id = 1;

-- 10) Proyecto válido
INSERT INTO proyectos (nombre, nombre_normalizado, area, cliente, estado)
VALUES ('Proyecto Arbol', 'proyecto arbol', 'TI', NULL, 'EN_PROCESO');

-- 11) nombre_normalizado duplicado: debe FALLAR
INSERT INTO proyectos (nombre, nombre_normalizado, estado)
VALUES ('Otro', 'proyecto arbol', 'COMPLETADO');

-- 12) Estado inválido: debe FALLAR (ck_proyectos_estado_valido)
INSERT INTO proyectos (nombre, nombre_normalizado, estado)
VALUES ('Otro', 'proyecto zz', 'PAUSADO');

-- 13) Participación válida
INSERT INTO participaciones (empleado_id, proyecto_id, rol, entregables,
    en_equipo, coordino_tareas, explico_a_publico_distinto, resolvio_problema,
    horas, fecha_registro)
VALUES (1, 1, 'Dev', 'API', true, false, true, false, 120, '2026-09-01');

-- 14) Participación duplicada empleado/proyecto: debe FALLAR
INSERT INTO participaciones (empleado_id, proyecto_id, rol, horas, fecha_registro)
VALUES (1, 1, 'QA', 10, '2026-09-02');

-- 15) Horas negativas: debe FALLAR (ck_participaciones_horas_no_negativas)
INSERT INTO participaciones (empleado_id, proyecto_id, rol, horas, fecha_registro)
VALUES (1, 1, 'QA', -5, '2026-09-02');

-- 16) Capacitación válida
INSERT INTO capacitaciones (empleado_id, nombre, fecha, completado)
VALUES (1, 'Curso SQL', '2026-08-10', true);

-- 17) Auditoría válida con JSONB
INSERT INTO auditorias_modificacion (actor_cuenta_id, entidad, entidad_id,
    operacion, valores_anteriores, valores_nuevos, motivo)
VALUES (1, 'participacion', 1, 'CORRECCION',
    '{"rol": "Dev"}'::jsonb, '{"rol": "Developer"}'::jsonb, 'corrección RH');

-- 18) pg_trgm operativo: función de similitud disponible
SELECT 'pg_trgm_similitud' AS prueba, similarity('proyecto arbol', 'proyecto arboles') AS valor;

-- 19) pg_trgm: índice GIN usable con % y similarity
SELECT 'pg_trgm_busqueda' AS prueba, count(*) FROM proyectos
WHERE nombre_normalizado % 'proyecto arboles';

-- Limpieza final (TRUNCATE no dispara triggers de fila)
TRUNCATE TABLE auditorias_modificacion, evaluaciones, participaciones,
    capacitaciones, proyectos, cuentas_acceso, empleados RESTART IDENTITY CASCADE;
