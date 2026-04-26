-- =============================================
-- OvernightWriter — Supabase Schema
-- Run this in your Supabase SQL editor
-- =============================================

-- Scripts table
create table if not exists public.scripts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  writers jsonb not null default '[]',
  contact_email text default '',
  contact_phone text default '',
  draft_count integer not null default 1,
  import_source text default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Backfill column on existing deployments
alter table public.scripts add column if not exists import_source text default null;

-- Drafts table
create table if not exists public.drafts (
  id uuid default gen_random_uuid() primary key,
  script_id uuid references public.scripts(id) on delete cascade not null,
  draft_number integer not null default 1,
  content jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- API keys table (for OpenClaw and other agents)
create table if not exists public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  label text not null default 'OpenClaw',
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.scripts enable row level security;
alter table public.drafts enable row level security;
alter table public.api_keys enable row level security;

-- Scripts: users can only access their own
create policy "users_own_scripts" on public.scripts
  for all using (auth.uid() = user_id);

-- Drafts: users can access drafts of their own scripts
create policy "users_own_drafts" on public.drafts
  for all using (
    exists (
      select 1 from public.scripts
      where scripts.id = drafts.script_id
      and scripts.user_id = auth.uid()
    )
  );

-- API keys: users manage their own
create policy "users_own_api_keys" on public.api_keys
  for all using (auth.uid() = user_id);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger scripts_updated_at
  before update on public.scripts
  for each row execute function update_updated_at();

create trigger drafts_updated_at
  before update on public.drafts
  for each row execute function update_updated_at();

-- Indexes
create index if not exists idx_scripts_user_id on public.scripts(user_id);
create index if not exists idx_drafts_script_id on public.drafts(script_id);
create index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);

-- =============================================
-- Subscriptions table (Stripe sync)
-- =============================================
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  plan_id text not null default 'free',
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;
create policy "users_own_subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id);

-- User preferences
create table if not exists public.user_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  autosave boolean default true,
  claude_key_set boolean default false,
  openai_key_set boolean default false,
  kimi_key_set boolean default false,
  gemini_key_set boolean default false,
  updated_at timestamptz default now()
);

alter table public.user_preferences enable row level security;
create policy "users_own_preferences" on public.user_preferences
  for all using (auth.uid() = user_id);

-- Encrypted model keys (stored server-side only via service role)
create table if not exists public.user_model_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  encrypted_key text not null,
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

-- Model keys use service role only — no user RLS access
-- Access is via serverless functions with service role key only
alter table public.user_model_keys enable row level security;
create policy "service_role_only_model_keys" on public.user_model_keys
  for all using (false); -- blocks all direct client access

-- Indexes
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);
create index if not exists idx_user_model_keys_user_provider on public.user_model_keys(user_id, provider);
