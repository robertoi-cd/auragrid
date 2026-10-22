-- Depreciación fiscal por categorías de activo (supuestos financieros del proyecto).
-- * Agrega 9 columnas a project_financial_assumptions; no borra ni cambia ninguna existente.
-- * depreciacion_por_categorias = false (por defecto): se sigue usando el esquema actual (depreciacion_esquema),
--   así que ningún proyecto cambia al aplicar esta migración.
-- * Activa: el CAPEX se reparte entre equipo de generación, obra civil, subestación y línea, e interconexión (los %
--   suman 100) y cada parte se deprecia a su tasa anual. Por defecto, 100 % en equipo de generación al 100 % en el
--   año 1 (LISR art. 34 fr. XIII), que da el mismo resultado que el esquema actual de Alpha I.
-- * Las tasas de las otras tres categorías no tienen valor por defecto (null): las captura el usuario con su asesor
--   fiscal. Si una categoría con reparto > 0 % no tiene tasa, la app no calcula y muestra una alerta.
-- * El historial de supuestos (registrar_cambio_supuestos) registra estas columnas automáticamente.

alter table public.project_financial_assumptions
  add column if not exists depreciacion_por_categorias boolean not null default false,
  add column if not exists depreciacion_generacion_pct numeric not null default 100 check (depreciacion_generacion_pct between 0 and 100),
  add column if not exists depreciacion_obra_civil_pct numeric not null default 0 check (depreciacion_obra_civil_pct between 0 and 100),
  add column if not exists depreciacion_subestacion_pct numeric not null default 0 check (depreciacion_subestacion_pct between 0 and 100),
  add column if not exists depreciacion_interconexion_pct numeric not null default 0 check (depreciacion_interconexion_pct between 0 and 100),
  add column if not exists depreciacion_generacion_tasa_pct numeric not null default 100 check (depreciacion_generacion_tasa_pct > 0 and depreciacion_generacion_tasa_pct <= 100),
  add column if not exists depreciacion_obra_civil_tasa_pct numeric check (depreciacion_obra_civil_tasa_pct > 0 and depreciacion_obra_civil_tasa_pct <= 100),
  add column if not exists depreciacion_subestacion_tasa_pct numeric check (depreciacion_subestacion_tasa_pct > 0 and depreciacion_subestacion_tasa_pct <= 100),
  add column if not exists depreciacion_interconexion_tasa_pct numeric check (depreciacion_interconexion_tasa_pct > 0 and depreciacion_interconexion_tasa_pct <= 100);

-- El reparto suma 100 % (con tolerancia de redondeo)
alter table public.project_financial_assumptions drop constraint if exists depreciacion_categorias_suma_100;
alter table public.project_financial_assumptions add constraint depreciacion_categorias_suma_100 check (
  abs(depreciacion_generacion_pct + depreciacion_obra_civil_pct + depreciacion_subestacion_pct + depreciacion_interconexion_pct - 100) <= 0.01
);

-- Reversión: alter table public.project_financial_assumptions drop constraint depreciacion_categorias_suma_100,
-- drop column depreciacion_por_categorias, depreciacion_generacion_pct, depreciacion_obra_civil_pct,
-- depreciacion_subestacion_pct, depreciacion_interconexion_pct, depreciacion_generacion_tasa_pct,
-- depreciacion_obra_civil_tasa_pct, depreciacion_subestacion_tasa_pct, depreciacion_interconexion_tasa_pct;
