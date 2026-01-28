-- ============================================================================
-- TALENTIA - DATA AS OF DATE SETTING
-- Migration: 005_data_as_of_date_setting.sql
-- Fecha: 2026-01-08
-- Descripcion: Adds initial data_as_of_date setting for tracking Excel file dates
-- ============================================================================

-- Insert initial data_as_of_date setting (if not exists)
INSERT INTO settings (key, value, description, category, is_system)
VALUES (
    'data_as_of_date',
    '{"date": null, "source": null, "updated_at": null}'::jsonb,
    'Fecha de referencia del archivo Excel para calculos de vencimiento y dias en proceso',
    'data',
    true
)
ON CONFLICT (key) DO NOTHING;

-- Comment
COMMENT ON COLUMN settings.value IS 'Valor JSON: data_as_of_date contiene {date: ISO string, source: filename|header|cell|unknown, updated_at: ISO string}';
