-- Registro de exportaciones: quién descargó el análisis financiero (Excel) de cada proyecto, con su rol y cuándo.
-- * Tabla nueva project_export_log (no modifica tablas existentes). Solo el dueño la lee (en Equipo y accesos).
-- * Nadie escribe directo: la app llama a registrar_exportacion() ANTES de generar el archivo; si el registro falla,
--   no se exporta (así no hay exportaciones sin rastro). Se registran todas, incluidas las del dueño.
-- * El tipo admite por ahora 'analisis_financiero'; otros reportes se agregarían en la restricción.

create table if not exists public.project_export_log (
  id            uuid primary key default gen_random_uuid(),
  project_id    text not null references public.solar_projects (id) on delete cascade,
  user_id       uuid not null,
  user_email    text,
  rol           text not null check (rol in ('dueno', 'editor', 'lector')),
  tipo          text not null check (tipo in ('analisis_financiero')),
  exportado_en  timestamptz not null default now()
);
create index if not exists project_export_log_proyecto_idx on public.project_export_log (project_id, exportado_en desc);
alter table public.project_export_log enable row level security;

create policy "project_export_log_select_dueno" on public.project_export_log for select to authenticated
  using (public.es_dueno(project_id));
revoke insert, update, delete on public.project_export_log from anon, authenticated;

create or replace function public.registrar_exportacion(p_project_id text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text := public.rol_en_proyecto(p_project_id);
begin
  if v_rol is null then
    raise exception 'No tienes acceso a este proyecto.' using errcode = '42501', hint = 'sin_acceso';
  end if;
  if p_tipo is distinct from 'analisis_financiero' then
    raise exception 'Tipo de exportación no válido.' using errcode = '22023', hint = 'tipo_invalido';
  end if;
  insert into public.project_export_log (project_id, user_id, user_email, rol, tipo)
  values (p_project_id, auth.uid(), nullif(auth.jwt() ->> 'email', ''), v_rol, p_tipo);
end;
$$;
revoke execute on function public.registrar_exportacion(text, text) from public, anon;
grant execute on function public.registrar_exportacion(text, text) to authenticated;

-- Reversión: drop function registrar_exportacion(text, text); drop table project_export_log.
