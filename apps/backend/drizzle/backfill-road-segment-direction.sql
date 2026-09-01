-- Backfill de road_segments.direction a partir do sufixo ja existente em road_name.
--
-- Roda depois da migration 0011_report_dimensions.sql (a coluna "direction" precisa
-- existir). NUNCA escreve em road_name, so popula a coluna nova.
--
-- Uso: psql "$DATABASE_URL" -f drizzle/backfill-road-segment-direction.sql

BEGIN;

-- 1) Segmentos cujo road_name termina em Norte/Sul/Leste/Oeste (case-insensitive),
--    ex.: "SP-021 Norte" -> direction = 'norte'.
UPDATE road_segments
SET direction = lower(substring(road_name from '(?i)\s+(norte|sul|leste|oeste)$'))
WHERE direction IS NULL
  AND road_name ~* '\s+(norte|sul|leste|oeste)$';

-- 2) Segmentos com road_name unico na tabela (sem duplicata) e sem sufixo de sentido:
--    rodovia de pista unica, sem separacao Norte/Sul.
UPDATE road_segments rs
SET direction = 'unica'
WHERE direction IS NULL
  AND road_name !~* '\s+(norte|sul|leste|oeste)$'
  AND (SELECT count(*) FROM road_segments rs2 WHERE rs2.road_name = rs.road_name) = 1;

COMMIT;

-- Revisar manualmente: road_name duplicado, sem sufixo de sentido, ainda sem direction.
-- Nao da pra advinhar automatico qual pista e qual so pelo nome repetido.
SELECT road_name, count(*) AS total, array_agg(id) AS ids
FROM road_segments
WHERE direction IS NULL
GROUP BY road_name
HAVING count(*) > 1;
