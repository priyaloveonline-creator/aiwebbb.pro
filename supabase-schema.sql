-- ================================================================
-- AIWEBBB — Database Schema (v3)
-- Run this entire file in Supabase SQL Editor
-- ================================================================

create extension if not exists "uuid-ossp";

-- ================================================================
-- PROFILES — one row per user, created automatically on signup
-- ================================================================
create table if not exists public.profiles (
  id                      uuid references auth.users on delete cascade primary key,
  email                   text unique not null,
  full_name               text,
  avatar_url              text,
  plan                    text not null default 'free' check (plan in ('free','pro','plus')),
  pro_credits_balance     bigint not null default 0,
  plus_credits_balance    bigint not null default 0,
  credits_used_this_month bigint not null default 0,
  credits_reset_at        timestamptz not null default (now() + interval '30 days'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own_profile" on public.profiles;
create policy "own_profile" on public.profiles for all using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ================================================================
-- CONVERSATIONS + MESSAGES — full chat history
-- ================================================================
create table if not exists public.conversations (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references public.profiles(id) on delete cascade not null,
  title            text not null default 'New Chat',
  provider         text not null,
  model_id         text,
  model_name       text,
  is_pinned        boolean not null default false,
  message_count    integer not null default 0,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.conversations enable row level security;
drop policy if exists "own_conversations" on public.conversations;
create policy "own_conversations" on public.conversations for all using (auth.uid() = user_id);
create index if not exists idx_conv_user on public.conversations(user_id, updated_at desc);

create table if not exists public.messages (
  id               uuid primary key default uuid_generate_v4(),
  conversation_id  uuid references public.conversations(id) on delete cascade not null,
  user_id          uuid references public.profiles(id) on delete cascade not null,
  role             text not null check (role in ('user','assistant','system')),
  content          text not null,
  model_id         text,
  input_tokens     integer default 0,
  output_tokens    integer default 0,
  credits_used     integer default 0,
  created_at       timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "own_messages" on public.messages;
create policy "own_messages" on public.messages for all using (auth.uid() = user_id);
create index if not exists idx_msg_conv on public.messages(conversation_id, created_at);

create or replace function public.bump_conversation() returns trigger as $$
begin
  update public.conversations
  set message_count = message_count + 1, last_message_at = new.created_at, updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_bump_conv on public.messages;
create trigger trg_bump_conv after insert on public.messages
  for each row execute procedure public.bump_conversation();

-- ================================================================
-- PROMPTS LIBRARY — single saved prompt + response pairs
-- (NOT full conversations — just one specific exchange the user
--  wants to keep and reuse later)
-- ================================================================
create table if not exists public.prompts_library (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  title        text not null,
  prompt       text not null,
  response     text not null,
  provider     text,
  model_name   text,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);
alter table public.prompts_library enable row level security;
drop policy if exists "own_prompts" on public.prompts_library;
create policy "own_prompts" on public.prompts_library for all using (auth.uid() = user_id);
create index if not exists idx_prompts_user on public.prompts_library(user_id, created_at desc);

-- ================================================================
-- DOCUMENTS — files uploaded to the AI, auto-expire after 7 days
-- Actual file bytes live in Supabase Storage bucket "documents";
-- this table stores metadata + the storage path.
-- ================================================================
create table if not exists public.documents (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references public.profiles(id) on delete cascade not null,
  file_name      text not null,
  file_type      text,
  file_size      bigint,
  storage_path   text not null,
  summary        text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '7 days')
);
alter table public.documents enable row level security;
drop policy if exists "own_documents" on public.documents;
create policy "own_documents" on public.documents for all using (auth.uid() = user_id);
create index if not exists idx_docs_user on public.documents(user_id, created_at desc);
create index if not exists idx_docs_expiry on public.documents(expires_at);

-- ================================================================
-- PROJECTS — AI tool outputs (image/video/audio/code generations),
-- auto-expire after 7 days
-- ================================================================
create table if not exists public.projects (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references public.profiles(id) on delete cascade not null,
  tool_type      text not null,          -- image | video | audio | code | other
  title          text not null,
  prompt         text,
  output_url     text,                   -- storage path or external URL
  thumbnail_url  text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '7 days')
);
alter table public.projects enable row level security;
drop policy if exists "own_projects" on public.projects;
create policy "own_projects" on public.projects for all using (auth.uid() = user_id);
create index if not exists idx_projects_user on public.projects(user_id, created_at desc);
create index if not exists idx_projects_expiry on public.projects(expires_at);

-- ================================================================
-- Auto-cleanup — called by the frontend right before it loads
-- Documents / Projects, so expired rows never show up.
-- Works on every Supabase tier, no cron/scheduled job required.
-- ================================================================
create or replace function public.cleanup_expired(p_user_id uuid) returns void as $$
begin
  delete from public.documents where user_id = p_user_id and expires_at < now();
  delete from public.projects  where user_id = p_user_id and expires_at < now();
end;
$$ language plpgsql security definer;

-- ================================================================
-- ORDERS — Razorpay payments (India + international cards)
-- ================================================================
create table if not exists public.orders (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid references public.profiles(id) on delete cascade not null,
  plan                text not null check (plan in ('pro','plus')),
  currency            text not null default 'inr',
  amount              integer not null,   -- smallest unit: paise (INR) or cents (USD)
  credits             bigint not null,
  status              text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  razorpay_order_id   text unique,
  razorpay_payment_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.orders enable row level security;
drop policy if exists "own_orders" on public.orders;
create policy "own_orders" on public.orders for select using (auth.uid() = user_id);
create index if not exists idx_orders_user on public.orders(user_id, created_at desc);

-- Called only by the server (service role) after signature verification
create or replace function public.apply_credits(
  p_user_id uuid, p_plan text, p_credits bigint
) returns void as $$
begin
  if p_plan = 'pro' then
    update public.profiles set
      plan = 'pro', pro_credits_balance = pro_credits_balance + p_credits,
      credits_reset_at = now() + interval '30 days', updated_at = now()
    where id = p_user_id;
  elsif p_plan = 'plus' then
    update public.profiles set
      plan = 'plus', plus_credits_balance = plus_credits_balance + p_credits,
      credits_reset_at = now() + interval '30 days', updated_at = now()
    where id = p_user_id;
  end if;
end;
$$ language plpgsql security definer;

-- Called directly from the browser (with the user's own JWT) right after
-- a paid-plan chat response finishes streaming, to deduct usage credits.
-- Safe to expose: it can only ever reduce auth.uid()'s own balance.
create or replace function public.deduct_credits(
  p_bucket text, p_amount bigint
) returns void as $$
begin
  if p_bucket = 'pro' then
    update public.profiles set
      pro_credits_balance = greatest(0, pro_credits_balance - p_amount),
      credits_used_this_month = credits_used_this_month + p_amount,
      updated_at = now()
    where id = auth.uid();
  elsif p_bucket = 'plus' then
    update public.profiles set
      plus_credits_balance = greatest(0, plus_credits_balance - p_amount),
      credits_used_this_month = credits_used_this_month + p_amount,
      updated_at = now()
    where id = auth.uid();
  end if;
end;
$$ language plpgsql security definer;

-- ================================================================
-- STORAGE — run once in Supabase Dashboard > Storage (or via SQL)
-- Create a private bucket called "documents" for uploaded files.
-- ================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "own_document_files_select" on storage.objects;
create policy "own_document_files_select" on storage.objects
  for select using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own_document_files_insert" on storage.objects;
create policy "own_document_files_insert" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "own_document_files_delete" on storage.objects;
create policy "own_document_files_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
