-- Flitscript: projects, clients, presets and custom fonts. Only caption data (JSON) lives here, never video.
-- Access model: an internal tool, so every signed-in @flitsdigital.nl account can read and edit everything.

-- True when the caller is a signed-in Flits Digital team member.
create or replace function public.is_flits()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@flitsdigital.nl', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  -- Names and jargon sent to transcription as keyterms.
  glossary text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null
);

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  -- null = available for every client
  client_id uuid references public.clients on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  style jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients on delete set null,
  name text not null check (length(trim(name)) between 1 and 200),
  -- Identifies the local source file: name, size, duration and a hash of its first MBs.
  fingerprint jsonb not null,
  video_meta jsonb not null,
  -- { words, groups, style }: the source of truth for everything rendered and exported.
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null,
  updated_by uuid default auth.uid() references auth.users on delete set null
);

create table public.fonts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients on delete cascade,
  family text not null check (length(trim(family)) between 1 and 100),
  -- Object path in the private "fonts" storage bucket.
  path text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users on delete set null
);

create index presets_client_id_idx on public.presets (client_id);
create index projects_client_id_idx on public.projects (client_id);
create index projects_updated_at_idx on public.projects (updated_at desc);
create index fonts_client_id_idx on public.fonts (client_id);

create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger presets_updated_at before update on public.presets for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.presets enable row level security;
alter table public.projects enable row level security;
alter table public.fonts enable row level security;

-- One policy per table: the whole team works on everything; anyone else sees nothing.
create policy "team members manage clients" on public.clients
  for all to authenticated using ((select public.is_flits())) with check ((select public.is_flits()));
create policy "team members manage presets" on public.presets
  for all to authenticated using ((select public.is_flits())) with check ((select public.is_flits()));
create policy "team members manage projects" on public.projects
  for all to authenticated using ((select public.is_flits())) with check ((select public.is_flits()));
create policy "team members manage fonts" on public.fonts
  for all to authenticated using ((select public.is_flits())) with check ((select public.is_flits()));

-- Private bucket for uploaded client fonts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('fonts', 'fonts', false, 10485760)
on conflict (id) do nothing;

create policy "team members manage font files" on storage.objects
  for all to authenticated
  using (bucket_id = 'fonts' and (select public.is_flits()))
  with check (bucket_id = 'fonts' and (select public.is_flits()));

-- Signup guard: only @flitsdigital.nl addresses may create an account.
-- Enable it in the dashboard: Authentication → Hooks → "Before User Created" → Postgres → public.hook_flits_only_signup.
create or replace function public.hook_flits_only_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if lower(event -> 'user' ->> 'email') like '%@flitsdigital.nl' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('message', 'Alleen @flitsdigital.nl-adressen hebben toegang.', 'http_code', 403));
end;
$$;

grant execute on function public.hook_flits_only_signup to supabase_auth_admin;
revoke execute on function public.hook_flits_only_signup from authenticated, anon, public;
