-- Scopewise — production relational schema (PostgreSQL 15+).
-- The browser MVP stores the same entities (same names, camelCase fields) in
-- IndexedDB through js/core/store.js. A server adapter maps 1:1 to these tables.
-- Every table has id, created_at, updated_at. Money is numeric(12,2).

create extension if not exists pgcrypto;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Identity ----------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  name text not null,
  password_hash text not null,                -- argon2id on the server
  role text not null default 'freelancer' check (role in ('freelancer','client','team_member','admin')),
  email_verified_at timestamptz,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  title text, bio text, phone text,
  disciplines text[] not null default '{}', services text[] not null default '{}',
  avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('verify','reset')),
  token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Business ----------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete restrict,
  name text not null, slug text unique, currency char(3) not null default 'QAR',
  logo_url text, brand_color text, address text,
  tax_label text default 'VAT', tax_rate numeric(5,2) not null default 0,
  invoice_prefix text not null default 'INV-', next_invoice_number int not null default 1001,
  proposal_prefix text not null default 'P-', next_proposal_number int not null default 101,
  payment_instructions text, default_payment_terms text, proposal_intro text,
  default_due_days int not null default 7, default_revisions int not null default 2,
  default_deposit_percent int not null default 50, proposal_validity_days int not null default 14,
  contract_sections jsonb not null default '[]', notification_settings jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','studio')),
  status text not null default 'active', provider text, provider_ref text, current_period_end timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, company text, email citext, phone text, country text, notes text,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, email)
);

-- ---------- Projects ----------
create type project_status as enum ('draft','awaiting_deposit','active','in_review','revision_requested','awaiting_approval','approved','completed','cancelled');
create table projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  name text not null, type text not null, status project_status not null default 'draft',
  deadline date, budget numeric(12,2) not null default 0, currency char(3) not null,
  revisions_included int not null default 2, deposit_percent int not null default 50 check (deposit_percent between 0 and 100),
  exclusions text[] not null default '{}',
  portal_token_hash text not null unique, portal_disabled boolean not null default false,
  lock_delivery_until_paid boolean not null default false, template_key text,
  started_at timestamptz, approved_at timestamptz, delivered_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on projects (business_id, status);
create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create table briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','sent','submitted','reviewed')),
  objective text, audience text, platforms text, tone text, deliverables_text text,
  "references" text, production_needs text, notes text, budget numeric(12,2),
  sent_at timestamptz, submitted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null, quantity int not null default 1 check (quantity > 0), description text,
  position int not null default 0, source text not null default 'scope' check (source in ('scope','change_order')),
  change_order_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Proposal → Contract → Change orders ----------
create table proposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  number text not null, title text not null, introduction text, objective text, timeline text,
  revisions int not null default 2, deposit_percent int not null default 50, payment_terms text,
  valid_until date not null, notes text, currency char(3) not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','accepted','rejected','expired')),
  sent_at timestamptz, viewed_at timestamptz, responded_at timestamptz, accepted_by_name text, response_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, number)
);
-- At most one accepted proposal per project.
create unique index one_accepted_proposal on proposals (project_id) where status = 'accepted';
create table proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  description text not null, quantity numeric(10,2) not null check (quantity > 0), unit_price numeric(12,2) not null check (unit_price >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table contracts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  proposal_id uuid references proposals(id),
  title text not null, parties jsonb not null, sections jsonb not null, disclaimer text not null,
  status text not null default 'sent' check (status in ('draft','sent','accepted','void')),
  sent_at timestamptz, accepted_at timestamptz, accepted_by_name text, accepted_ip inet, fingerprint text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null, description text, amount numeric(12,2) not null check (amount >= 0), extra_days int not null default 0,
  revision_round_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  responded_at timestamptz, responded_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table deliverables add foreign key (change_order_id) references change_orders(id) on delete set null;

-- ---------- Files, feedback, revisions, approvals ----------
create table files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  folder text not null check (folder in ('brief','brand','drafts','review','final','deliverables')),
  name text not null, uploaded_by text not null check (uploaded_by in ('freelancer','client')), shared_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  number int not null, label text not null, storage_key text not null,   -- object storage key; served via signed URLs
  size_bytes bigint not null, mime text not null, original_name text not null,
  is_final boolean not null default false, uploader_type text not null, uploader_name text not null, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (file_id, number)
);
create unique index one_final_version on file_versions (file_id) where is_final;
create table revision_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number int not null, status text not null default 'requested' check (status in ('requested','in_progress','delivered')),
  is_extra boolean not null default false, summary text, requested_by text not null,
  requested_at timestamptz not null default now(), delivered_at timestamptz,
  delivered_version_id uuid references file_versions(id), change_order_id uuid references change_orders(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, number)
);
alter table change_orders add foreign key (revision_round_id) references revision_rounds(id) on delete set null;
create table feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_version_id uuid references file_versions(id) on delete set null,
  revision_round_id uuid references revision_rounds(id) on delete set null,
  author_type text not null check (author_type in ('freelancer','client')), author_name text not null,
  comment text not null, timecode_seconds numeric(10,3), pin_x numeric(5,2), pin_y numeric(5,2), reference text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_version_id uuid not null references file_versions(id) on delete restrict,
  file_name text not null, version_label text not null, message text,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','withdrawn')),
  requested_at timestamptz not null default now(), responded_at timestamptz, client_name text, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Decided approvals are immutable.
create or replace function approvals_immutable() returns trigger language plpgsql as $$
begin if old.status <> 'pending' then raise exception 'approval % is final', old.id; end if; return new; end $$;
create trigger approvals_immutable before update or delete on approvals for each row execute function approvals_immutable();

-- ---------- Billing ----------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  change_order_id uuid references change_orders(id),
  number text not null, kind text not null check (kind in ('deposit','final','change_order','custom')),
  issue_date date not null, due_date date not null, currency char(3) not null,
  discount numeric(12,2) not null default 0, tax_rate numeric(5,2) not null default 0, tax_label text, notes text,
  status text not null default 'draft' check (status in ('draft','sent','viewed','partially_paid','paid','overdue','cancelled')),
  sent_at timestamptz, viewed_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, number), check (due_date >= issue_date)
);
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null, quantity numeric(10,2) not null check (quantity > 0), unit_price numeric(12,2) not null check (unit_price >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0), method text not null, reference text, paid_at date not null,
  provider text not null default 'manual',            -- 'manual' | 'stripe' | 'paypal' | regional gateways
  provider_ref text unique,                           -- gateway charge id (idempotent webhook inserts)
  status text not null default 'confirmed' check (status in ('reported','confirmed','rejected')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------- Growth ----------
create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null, client text, category text, challenge text, approach text, deliverables text, results text, description text,
  visibility text not null default 'private' check (visibility in ('private','public')),
  cover_version_id uuid references file_versions(id) on delete set null, media_version_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  due_date date not null, note text not null, done_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  type text not null, title text not null, body text, link text, key text unique, read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  actor_type text not null check (actor_type in ('freelancer','client','system')), actor_name text not null,
  action text not null, message text not null, meta jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on activity_logs (project_id, created_at desc);
-- Activity is append-only.
create or replace function deny_change() returns trigger language plpgsql as $$ begin raise exception 'append-only table'; end $$;
create trigger activity_append_only before update or delete on activity_logs for each row execute function deny_change();

-- updated_at triggers
do $$ declare t text; begin
  for t in select unnest(array['users','profiles','sessions','email_tokens','businesses','subscriptions','clients','projects','project_members','briefs','deliverables','proposals','proposal_items','contracts','change_orders','files','file_versions','revision_rounds','feedback','invoices','invoice_items','payments','portfolio_items','reminders','notifications']) loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop; end $$;

-- ---------- Row-level security (freelancer side) ----------
-- The API sets `app.user_id` per request. Client-portal requests never use
-- these policies: they go through server endpoints that verify the project's
-- portal token and scope every query to that single project id.
alter table projects enable row level security;
create policy project_access on projects using (
  exists (select 1 from businesses b where b.id = projects.business_id and b.owner_id = current_setting('app.user_id')::uuid)
  or exists (select 1 from project_members m where m.project_id = projects.id and m.user_id = current_setting('app.user_id')::uuid)
);
-- Repeat the same pattern (via project_id or business_id) for every project-scoped table.
