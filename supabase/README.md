# Scopewise on Supabase

Database, permissions (RLS) and the migration path from the browser MVP to a real backend.

## What is here

| File | What |
|---|---|
| `migrations/0001_core.sql` | Identity (`profiles` on `auth.users`), workspaces, members, teams, clients, projects, project members/organizations, and the permission functions `org_role`, `ws_can`, `project_side`, `project_can`, `portal_check` |
| `migrations/0002_app_tables.sql` | **Generated.** Permission seed and every project-scoped table with row level security |
| `tests/permissions.sql` | ABC Production ↔ XYZ TV scenario, 22 checks (editor cannot see invoices, client approver cannot see finance, outsiders see nothing, activity log is append-only…) |
| `../tools/gen-supabase.mjs` | Regenerates 0002 from `js/services/capabilities.js` |

Permissions have one source of truth: `js/services/capabilities.js`. After changing a role or capability run `node tools/gen-supabase.mjs` and ship the new migration.

## Apply

```bash
supabase db push            # or paste 0001 then 0002 into the SQL editor
```

Test locally against any Postgres 15+ (Supabase's `auth.uid()` reads `request.jwt.claim.sub`):

```bash
psql -f supabase/migrations/0001_core.sql && psql -f supabase/migrations/0002_app_tables.sql
psql -f supabase/tests/permissions.sql      # prints "ok   …" per check, raises on the first failure
```

## Design notes

- **Typed columns only where security needs them** (`workspace_id`, `project_id`, `side`, `role`, status, color…). Other fields of each record live in `data jsonb`, matching the app's objects one-to-one. Promote fields to columns when you need to query or constrain them.
- **RLS is the source of truth.** The browser checks are conveniences; the database refuses anything the role does not allow.
- **Guests (secret client link)** have no account. Never open tables to `anon`. Use an edge function with the service role that calls `portal_check(project_id, token)` and returns only what the portal shows. Store `sha256(token)`, never the token.
- **Files**: use Supabase Storage with a private bucket; keep object keys in `file_versions.data`, serve signed URLs, and add storage policies that call `project_can(project_id, 'files.view')`.
- **Email**: send from an edge function (Resend/Postmark). Invitations create a `workspace_members`/`project_members` row with `status = 'invited'` and no `user_id`; claim it on first sign-in by email.

## Not done yet (the real work left)

1. **Async data layer.** `js/core/store.js` is synchronous (`db.get/all/find/insert/update/remove`), ~360 call sites. Add a Supabase adapter and convert the services to `async`/`await`, or load a project's rows into the in-memory store on open and write through (faster to ship, weaker offline guarantees).
2. **Auth.** Replace `js/core/auth.js` (local PBKDF2, IndexedDB sessions) with Supabase Auth.
3. **Server-side rules that are not access control**: plan limits, invoice numbering (use a sequence per workspace), deposit → project activation, reminders (scheduled function), notification fan-out.
4. **Payments and email providers.**
5. Security review, load test, backups, privacy policy and terms.
