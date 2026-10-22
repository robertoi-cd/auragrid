-- Historial del asistente por proyecto y usuario. Solo se guardan preguntas y respuestas
-- (los avisos de error del chat no). Cada usuario ve y borra únicamente sus propios mensajes.

create table if not exists public.assistant_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.solar_projects (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 20000),
  created_at  timestamptz not null default now()
);
create index if not exists assistant_messages_proyecto_usuario_idx
  on public.assistant_messages (project_id, user_id, created_at);

alter table public.assistant_messages enable row level security;

-- Ver: solo los mensajes propios
create policy "assistant_messages_select_propios" on public.assistant_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Guardar: solo como uno mismo y en proyectos propios
create policy "assistant_messages_insert_propios" on public.assistant_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.solar_projects sp where sp.id = project_id and sp.owner_id = (select auth.uid()))
  );

-- Borrar ("Borrar historial"): solo los mensajes propios. No hay política de UPDATE: los mensajes no se editan.
create policy "assistant_messages_delete_propios" on public.assistant_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reversión:
--   drop table if exists public.assistant_messages;
