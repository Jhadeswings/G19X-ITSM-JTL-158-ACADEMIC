-- Crea la base de datos AISLADA de pruebas de la suite backend.
--
-- MB-7-TEST-SAFETY: la suite ejecuta TRUNCATE CASCADE en cada test. Para
-- que jamás alcance los datos de desarrollo, debe apuntar SIEMPRE a una
-- base desechable cuyo nombre empiece por 'talento_test' (lo exige la
-- barrera backend/tests/db_guardia.py).
--
-- Es idempotente (no falla si ya existe) y este script del entrypoint solo
-- corre la PRIMERA vez que se inicializa el volumen. Si borras el volumen
-- o la base, vuelve a crearse con `docker compose up -d db`.
--
-- NUNCA contiene datos de desarrollo: es una base vacía y desechable.

SELECT 'CREATE DATABASE talento_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'talento_test')\gexec