-- Email-only member access and purchase provisioning
-- Applied to production on 2026-10-05.

create extension if not exists pgcrypto;

create table if not exists public.member_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text,
  success boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists idx_member_login_attempts_email_created
  on public.member_login_attempts (email_hash, created_at desc);
create index if not exists idx_member_login_attempts_ip_created
  on public.member_login_attempts (ip_hash, created_at desc);
alter table public.member_login_attempts enable row level security;

create table if not exists public.purchase_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  purchase_id text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists idx_purchase_access_tokens_user on public.purchase_access_tokens (user_id);
create index if not exists idx_purchase_access_tokens_expires on public.purchase_access_tokens (expires_at);
alter table public.purchase_access_tokens enable row level security;

create table if not exists public.purchase_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  customer_email text,
  offer_code text,
  status text not null default 'received'
    check (status in ('received','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (provider, external_event_id)
);
create index if not exists idx_purchase_events_email
  on public.purchase_events (lower(customer_email))
  where customer_email is not null;
alter table public.purchase_events enable row level security;

create table if not exists public.offer_entitlements (
  offer_code text not null,
  product_code text not null references public.products(code) on delete restrict,
  primary key (offer_code, product_code)
);
alter table public.offer_entitlements enable row level security;

insert into public.offer_entitlements (offer_code, product_code) values
  ('kit_basico','maps_150'),
  ('kit_completo','maps_150'),
  ('kit_completo','bonus_mercado_40'),
  ('kit_completo','bonus_pdf_sem_misterio'),
  ('kit_completo','bonus_email_profissional'),
  ('kit_completo','bonus_seguranca_digital'),
  ('bump_pix','bump_pix'),
  ('bump_celular','bump_celular'),
  ('bump_fotos_ia','bump_fotos_ia')
on conflict do nothing;

create table if not exists public.webhook_secrets (
  provider text primary key,
  secret_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.webhook_secrets enable row level security;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.app_settings enable row level security;

create table if not exists public.purchase_notifications (
  id uuid primary key default gen_random_uuid(),
  purchase_event_id uuid references public.purchase_events(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  access_url text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  sent_at timestamptz
);
create index if not exists idx_purchase_notifications_status
  on public.purchase_notifications(status, created_at);
alter table public.purchase_notifications enable row level security;

create unique index if not exists idx_profiles_email_lower_unique
  on public.profiles ((lower(email)))
  where email is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.rls_auto_enable() to service_role;

revoke all on table public.member_login_attempts from anon, authenticated;
revoke all on table public.purchase_access_tokens from anon, authenticated;
revoke all on table public.purchase_events from anon, authenticated;
revoke all on table public.offer_entitlements from anon, authenticated;
revoke all on table public.webhook_secrets from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.purchase_notifications from anon, authenticated;

-- Production-only setup:
-- 1) insert a SHA-256 webhook secret into public.webhook_secrets.
-- 2) set public.app_settings.member_app_url to the deployed member-area URL.
-- Do not commit the raw webhook secret.


create table if not exists public.external_offer_mappings (
  provider text not null,
  external_id text not null,
  offer_code text not null,
  label text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (provider, external_id)
);
alter table public.external_offer_mappings enable row level security;
revoke all on table public.external_offer_mappings from anon, authenticated;
