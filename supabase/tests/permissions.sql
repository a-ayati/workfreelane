-- Permission scenario: ABC Production (provider) ↔ XYZ TV (client) on "Program X".
-- Run after both migrations. Needs auth.uid() to read request.jwt.claim.sub (true on Supabase).
\set ON_ERROR_STOP on
create temp table ids (k text primary key, id uuid default gen_random_uuid());
insert into ids (k) values ('alex'),('layla'),('karim'),('yousef'),('sarah'),('khalid'),('hassan'),('outsider'),('abc'),('xyz'),('client'),('px');
grant all on ids to authenticated;
insert into auth.users (id, email) select id, k || '@t.test' from ids where k in ('alex','layla','karim','yousef','sarah','khalid','hassan','outsider');
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where k = $1 $$;
create function pg_temp.as_user(k text) returns void language sql as $$ select set_config('request.jwt.claim.sub', (select id::text from ids where ids.k = $1), false) $$;

-- Setup as service role (superuser bypasses RLS).
insert into workspaces (id, kind, org_type, name, owner_id) values (pg_temp.id('abc'), 'organization', 'Production company', 'ABC Production', pg_temp.id('alex')), (pg_temp.id('xyz'), 'organization', 'TV channel', 'XYZ TV', pg_temp.id('sarah'));
insert into workspace_members (workspace_id, user_id, role) values
  (pg_temp.id('abc'), pg_temp.id('layla'), 'manager'), (pg_temp.id('abc'), pg_temp.id('karim'), 'member'), (pg_temp.id('abc'), pg_temp.id('yousef'), 'finance'),
  (pg_temp.id('xyz'), pg_temp.id('khalid'), 'manager'), (pg_temp.id('xyz'), pg_temp.id('hassan'), 'finance');
insert into workspace_members (workspace_id, user_id, role) values (pg_temp.id('xyz'), pg_temp.id('sarah'), 'member') on conflict (workspace_id, user_id) do update set role = 'member';
insert into clients (id, workspace_id, linked_workspace_id, name) values (pg_temp.id('client'), pg_temp.id('abc'), pg_temp.id('xyz'), 'XYZ TV');
insert into projects (id, workspace_id, client_id, name, type) values (pg_temp.id('px'), pg_temp.id('abc'), pg_temp.id('client'), 'Program X', 'Video Production');
insert into project_members (project_id, user_id, workspace_id, side, role) values
  (pg_temp.id('px'), pg_temp.id('karim'), pg_temp.id('abc'), 'provider', 'editor'),
  (pg_temp.id('px'), pg_temp.id('sarah'), pg_temp.id('xyz'), 'client', 'approver');
insert into invoices (project_id, data) values (pg_temp.id('px'), '{"number":"INV-1024"}');
insert into files (project_id, data) values (pg_temp.id('px'), '{"name":"Episode_04"}');
insert into activity_logs (project_id, action, data) values (pg_temp.id('px'), 'file.uploaded', '{}'), (pg_temp.id('px'), 'invoice.sent', '{}');

set role authenticated;
create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok   %', label; end $$;
create function pg_temp.rows(stmt text) returns int language plpgsql as $$ declare c int; begin execute stmt; get diagnostics c = row_count; return c; end $$;
create function pg_temp.n(t text) returns int language plpgsql as $$ declare c int; begin execute format('select count(*) from %I', t) into c; return c; end $$;

select pg_temp.as_user('alex');
select pg_temp.check('owner sees project, invoices, files', pg_temp.n('projects') = 1 and pg_temp.n('invoices') = 1 and pg_temp.n('files') = 1);
select pg_temp.check('owner sees all activity', pg_temp.n('activity_logs') = 2);

select pg_temp.as_user('karim');
select pg_temp.check('editor sees project and files', pg_temp.n('projects') = 1 and pg_temp.n('files') = 1);
select pg_temp.check('editor does NOT see invoices', pg_temp.n('invoices') = 0);
select pg_temp.check('editor does not see finance activity', pg_temp.n('activity_logs') = 1);
select pg_temp.check('editor cannot rename the project', pg_temp.rows($q$update projects set name = 'x'$q$) = 0);
select pg_temp.check('editor cannot change organization members', pg_temp.rows($q$update workspace_members set role = 'owner'$q$) = 0);

select pg_temp.as_user('yousef');
select pg_temp.check('provider finance sees invoices', pg_temp.n('invoices') = 1);
select pg_temp.check('provider finance sees project', pg_temp.n('projects') = 1);

select pg_temp.as_user('sarah');
select pg_temp.check('client approver sees project (shared)', pg_temp.n('projects') = 1);
select pg_temp.check('client approver does NOT see invoices', pg_temp.n('invoices') = 0);
select pg_temp.check('client approver cannot edit provider-only settings', pg_temp.rows($q$update projects set name = 'x'$q$) = 0);
select pg_temp.check('client approver can see ABC workspace name', exists (select 1 from workspaces where name = 'ABC Production'));
select pg_temp.check('client approver cannot list ABC members', (select count(*) from workspace_members where workspace_id = pg_temp.id('abc')) = 0);
select pg_temp.check('client approver cannot see ABC clients', pg_temp.n('clients') = 0);

select pg_temp.as_user('khalid');
select pg_temp.check('client-org manager sees project through organization', pg_temp.n('projects') = 1);
select pg_temp.check('client-org manager sees invoices (finance.view via manager)', pg_temp.n('invoices') = 1);

select pg_temp.as_user('hassan');
select pg_temp.check('client-org finance sees invoices', pg_temp.n('invoices') = 1);

select pg_temp.as_user('outsider');
select pg_temp.check('outsider sees nothing', pg_temp.n('projects') = 0 and pg_temp.n('invoices') = 0 and pg_temp.n('files') = 0 and pg_temp.n('activity_logs') = 0);
do $$ begin
  begin insert into tasks (project_id, data) values ((select id from ids where k = 'px'), '{}'); raise exception 'FAIL: outsider inserted a task'; exception when insufficient_privilege or check_violation then raise notice 'ok   outsider cannot insert tasks'; end;
end $$;

select pg_temp.as_user('alex');
do $$ begin
  begin update activity_logs set action = 'x'; if found then raise exception 'FAIL: activity log was updated'; end if; end;
  begin delete from activity_logs; if found then raise exception 'FAIL: activity log was deleted'; end if; end;
  raise notice 'ok   activity log is append-only';
end $$;
insert into workspaces (kind, name, owner_id) values ('personal', 'Alex Personal', pg_temp.id('alex'));
select pg_temp.check('creating a workspace makes the creator its owner', exists (select 1 from workspace_members m join workspaces w on w.id = m.workspace_id where w.name = 'Alex Personal' and m.role = 'owner' and m.user_id = pg_temp.id('alex')));
