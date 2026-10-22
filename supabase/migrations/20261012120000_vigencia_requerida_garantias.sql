-- "Vigencia requerida hasta" de cada garantía: el hito que debe cubrir (más el margen del proyecto).
--   rtb · ntp · interconexion (conclusión de obras de interconexión) · cod · fin_construccion · fecha (vigencia_fecha)
-- Valores iniciales según el tipo, igual que el valor por defecto de la app:
--   interconexión (CENACE o "interconexión") → cod; cumplimiento EPC ("EPC" o "cumplimiento") → fin_construccion; otras → rtb.
-- Nota: el plazo exigido a la garantía de interconexión está por confirmar con el Manual de Interconexión
-- (cap. 15 Garantías Financieras) y el contrato de interconexión vigente.
-- Solo agrega dos columnas y les da su valor inicial; no cambia vencimientos ni estados.

alter table public.project_guarantees
  add column if not exists vigencia_requerida text not null default 'rtb',
  add column if not exists vigencia_fecha date;

alter table public.project_guarantees drop constraint if exists project_guarantees_vigencia_requerida_check;
alter table public.project_guarantees
  add constraint project_guarantees_vigencia_requerida_check
  check (vigencia_requerida in ('rtb', 'ntp', 'interconexion', 'cod', 'fin_construccion', 'fecha'));

alter table public.project_guarantees drop constraint if exists project_guarantees_vigencia_fecha_check;
alter table public.project_guarantees
  add constraint project_guarantees_vigencia_fecha_check
  check ((vigencia_requerida = 'fecha') = (vigencia_fecha is not null));

-- Valores iniciales por tipo (misma regla que categoriaGarantia en src/lib/validaciones.ts)
update public.project_guarantees
   set vigencia_requerida = case
     when translate(lower(beneficiario || ' ' || concepto || ' ' || tipo), 'áéíóú', 'aeiou') ~ '(cenace|interconexion)' then 'cod'
     when translate(lower(beneficiario || ' ' || concepto || ' ' || tipo), 'áéíóú', 'aeiou') ~ '(\mepc\M|cumplimiento)' then 'fin_construccion'
     else 'rtb'
   end
 where vigencia_requerida = 'rtb' and vigencia_fecha is null;

-- Reversión:
--   alter table public.project_guarantees drop constraint if exists project_guarantees_vigencia_fecha_check;
--   alter table public.project_guarantees drop constraint if exists project_guarantees_vigencia_requerida_check;
--   alter table public.project_guarantees drop column if exists vigencia_fecha, drop column if exists vigencia_requerida;
