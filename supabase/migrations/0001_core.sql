-- Scopewise on Supabase — core: identity, workspaces, membership, projects, permission functions.
-- Mirrors js/services/context.js. The permission tables are seeded by 0002 (generated from
-- js/services/capabilities.js — never edit those rows by hand).
create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Permission model (data, seeded in 0002) ----------
create table role_caps (          -- project role → capability
  role text not null, cap text not null,
  side_only text check (side_only in ('provider','client')),   -- capability only exists on one side
  primary key (role, cap)
);
create table implicit_roles (     -- organization role → project role it grants on every project of the org
  org_role text primary key, project_role text not null
);
create table ws_caps (            -- organization role → workspace-level capability ('*' = all)
  role text not null, cap text not null, primary key (role, cap)
);

-- ---------- Identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', email citext,
  lang text not null default 'en' check (lang in ('en','ar')),
  current_workspace_id uuid, onboarded boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- Workspaces (personal or organization) ----------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'personal' check (kind in ('personal','organization')),
  org_type text, name text not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  currency char(3) not null default 'QAR', logo_url text, brand_color text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,    -- null while only invited
  email citext, name text, title text,
  role text not null default 'member' check (role in ('owner','admin','manager','member','finance','viewer')),
  status text not null default 'active' check (status in ('active','invited')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, user_id), unique (workspace_id, email)
);
create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade, name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  member_id uuid not null references workspace_members(id) on delete cascade,
  primary key (team_id, member_id)
);
-- The creator of a workspace becomes its owner member.
create function add_owner_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into workspace_members (workspace_id, user_id, role, email, name)
  select new.id, new.owner_id, 'owner', p.email, p.name from profiles p where p.id = new.owner_id
  on conflict do nothing;
  return new;
end $$;
create trigger workspaces_owner after insert on workspaces for each row execute function add_owner_member();

-- ---------- Clients & projects ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  linked_workspace_id uuid references workspaces(id) on delete set null,   -- the client is itself an organization on Scopewise
  name text not null, company text, email citext, phone text, country text, notes text,
  language text not null default 'en' check (language in ('en','ar')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,     -- the delivering side
  client_id uuid not null references clients(id) on delete restrict,
  name text not null, alt_name text, type text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_deposit','active','in_review','revision_requested','awaiting_approval','approved','completed','cancelled')),
  color text not null default '#3B6FE0', icon text not null default 'folder',
  language text check (language in ('en','ar')),               -- null = follow the client
  deadline date, currency char(3) not null default 'QAR',
  portal_token_hash text unique,                               -- sha256 of the secret link token
  portal_disabled boolean not null default false,
  data jsonb not null default '{}',                            -- remaining project fields (budget, deposit %, …)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  side text not null check (side in ('provider','client')),
  role text not null check (role in ('owner','manager','producer','director','designer','editor','reviewer','approver','finance','viewer')),
  status text not null default 'active' check (status in ('active','invited')),
  email citext, name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create table project_orgs (      -- extra organizations taking part in a project
  project_id uuid not null references projects(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  side text not null check (side in ('provider','client')),
  primary key (project_id, workspace_id)
);
create index on workspace_members (user_id) where status = 'active';
create index on projects (workspace_id);
create index on project_members (user_id);

create trigger t_profiles before update on profiles for each row execute function touch_updated_at();
create trigger t_workspaces before update on workspaces for each row execute function touch_updated_at();
create trigger t_wm before update on workspace_members for each row execute function touch_updated_at();
create trigger t_teams before update on teams for each row execute function touch_updated_at();
create trigger t_clients before update on clients for each row execute function touch_updated_at();
create trigger t_projects before update on projects for each row execute function touch_updated_at();
create trigger t_pm before update on project_members for each row execute function touch_updated_at();

-- ---------- Permission functions (SECURITY DEFINER so RLS on the tables they read cannot recurse) ----------
create function org_role(ws uuid) returns text language sql stable security definer set search_path = public as $$
  select role from workspace_members where workspace_id = ws and user_id = auth.uid() and status = 'active'
  union all select 'owner' from workspaces where id = ws and owner_id = auth.uid()
  limit 1 $$;

create function ws_can(ws uuid, cap text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ws_caps c where c.role = org_role(ws) and (c.cap = '*' or c.cap = $2)) $$;

-- Every workspace taking part in a project: provider, linked client organization, extra organizations.
create function project_parties(p uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select workspace_id from projects where id = p
  union select c.linked_workspace_id from projects pr join clients c on c.id = pr.client_id where pr.id = p and c.linked_workspace_id is not null
  union select workspace_id from project_orgs where project_id = p $$;

-- 'provider' | 'client' | null (no access at all)
create function project_side(p uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when pr.workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and status = 'active')
                   or exists (select 1 from workspaces w where w.id = pr.workspace_id and w.owner_id = auth.uid()) then 'provider' end
       from projects pr where pr.id = p),
    (select po.side from project_orgs po where po.project_id = p and org_role(po.workspace_id) is not null limit 1),
    (select 'client' from projects pr join clients c on c.id = pr.client_id
       where pr.id = p and c.linked_workspace_id is not null and org_role(c.linked_workspace_id) is not null),
    (select side from project_members where project_id = p and user_id = auth.uid() and status <> 'invited' limit 1)
  ) $$;

-- Capability check: implicit (organization role) ∪ explicit (project role), filtered by side.
create function project_can(p uuid, cap text) returns boolean language sql stable security definer set search_path = public as $$
  with side as (select project_side(p) as s),
  roles as (
    select ir.project_role as r from implicit_roles ir
      join (select org_role(w) as orole from project_parties(p) w) o on o.orole = ir.org_role
    union select role from project_members where project_id = p and user_id = auth.uid() and status <> 'invited'
  )
  select exists (select 1 from role_caps rc, roles, side
                 where rc.role = roles.r and rc.cap = $2 and side.s is not null and (rc.side_only is null or rc.side_only = side.s)) $$;

-- Guests (secret link) never touch tables directly: an edge function calls this with the service role.
create function portal_check(pid uuid, tok text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = pid and not portal_disabled and portal_token_hash = encode(digest(tok, 'sha256'), 'hex')) $$;

-- ---------- Row level security ----------
alter table role_caps enable row level security;   -- read-only reference data
alter table implicit_roles enable row level security;
alter table ws_caps enable row level security;
create policy read_ref on role_caps for select to authenticated using (true);
create policy read_ref on implicit_roles for select to authenticated using (true);
create policy read_ref on ws_caps for select to authenticated using (true);

alter table profiles enable row level security;
create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from workspace_members a join workspace_members b using (workspace_id) where a.user_id = auth.uid() and b.user_id = profiles.id)
  or exists (select 1 from project_members a join project_members b using (project_id) where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table workspaces enable row level security;
create policy ws_select on workspaces for select to authenticated using (
  org_role(id) is not null
  or exists (select 1 from projects p where p.workspace_id = workspaces.id and project_side(p.id) is not null));
create policy ws_insert on workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy ws_update on workspaces for update to authenticated using (ws_can(id, 'settings')) with check (ws_can(id, 'settings'));

alter table workspace_members enable row level security;
create policy wm_select on workspace_members for select to authenticated using (user_id = auth.uid() or ws_can(workspace_id, 'members.view'));
create policy wm_write on workspace_members for all to authenticated using (ws_can(workspace_id, 'members.manage')) with check (ws_can(workspace_id, 'members.manage'));

alter table teams enable row level security;
create policy teams_select on teams for select to authenticated using (ws_can(workspace_id, 'members.view'));
create policy teams_write on teams for all to authenticated using (ws_can(workspace_id, 'members.manage')) with check (ws_can(workspace_id, 'members.manage'));
alter table team_members enable row level security;
create policy tm_select on team_members for select to authenticated using (exists (select 1 from teams t where t.id = team_id and ws_can(t.workspace_id, 'members.view')));
create policy tm_write on team_members for all to authenticated using (exists (select 1 from teams t where t.id = team_id and ws_can(t.workspace_id, 'members.manage')))
  with check (exists (select 1 from teams t where t.id = team_id and ws_can(t.workspace_id, 'members.manage')));

alter table clients enable row level security;
create policy clients_select on clients for select to authenticated using (ws_can(workspace_id, 'clients.view'));
create policy clients_write on clients for all to authenticated using (ws_can(workspace_id, 'clients.manage')) with check (ws_can(workspace_id, 'clients.manage'));

alter table projects enable row level security;
create policy projects_select on projects for select to authenticated using (project_can(id, 'project.view'));
create policy projects_insert on projects for insert to authenticated with check (ws_can(workspace_id, 'projects.create'));
create policy projects_update on projects for update to authenticated using (project_can(id, 'settings.manage')) with check (project_can(id, 'settings.manage'));

alter table project_members enable row level security;
create policy pm_select on project_members for select to authenticated using (user_id = auth.uid() or project_can(project_id, 'team.view'));
create policy pm_write on project_members for all to authenticated using (project_can(project_id, 'team.manage')) with check (project_can(project_id, 'team.manage'));
alter table project_orgs enable row level security;
create policy po_select on project_orgs for select to authenticated using (project_can(project_id, 'team.view'));
create policy po_write on project_orgs for all to authenticated using (project_can(project_id, 'team.manage')) with check (project_can(project_id, 'team.manage'));

create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
