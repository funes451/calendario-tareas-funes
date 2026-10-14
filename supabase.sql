create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha_inicio date not null,
  fecha_fin date,
  responsable text not null check (responsable in ('Eli', 'Marti', 'David')),
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en curso', 'hecho')),
  proyecto text,
  fecha_creacion timestamptz not null default now(),
  constraint fechas_coherentes check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

alter table public.tareas enable row level security;

create policy "lectura_publica" on public.tareas for select using (true);
create policy "insercion_publica" on public.tareas for insert with check (true);
create policy "actualizacion_publica" on public.tareas for update using (true) with check (true);
create policy "borrado_publico" on public.tareas for delete using (true);

alter publication supabase_realtime add table public.tareas;
