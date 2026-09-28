# Scopewise — freelancer business management (MVP)

**Run your freelance business in one place.** From brief to payment.

Scopewise is built for creative freelancers (designers, video editors, videographers, photographers, motion designers, content creators, creative directors). It covers the whole client workflow and puts scope protection at its centre:

```
LEAD → BRIEF → PROPOSAL → CONTRACT → DEPOSIT → PROJECT → FEEDBACK → REVISION → APPROVAL → INVOICE → PAYMENT → DELIVERY → FOLLOW-UP
```

The app has two sides: a **freelancer dashboard** and a **client portal**. Clients open the portal through a private link and see only their own project.

## Run it

This is a static app with no build step. Serve the repository root with any static server:

```bash
npx http-server -p 5173 -c-1 .
# open http://localhost:5173/
```

GitHub Pages can host it as-is. Click **Explore the demo** to open a seeded workspace for *Alex Morgan, Creative Director*, with ABC Restaurant, Nova Agency and Vertex Tech as clients.

### Tests

The end-to-end test walks through the full quality checklist in a real browser (Playwright/Chromium):

```bash
npm i -D playwright   # or link a global install
npx http-server -p 5173 -c-1 . &
BASE=http://localhost:5173/ node tests/e2e.mjs
```

It covers these steps: register, reject a weak password, onboarding, email verification, create a client, create a project from a template, draft the brief with the AI assistant (the user reviews and applies it), create and send a proposal. It then covers the client side: an invalid link is refused, the client accepts the proposal and then the contract (on a mobile viewport), and the freelancer records the deposit so the project becomes active. The rest of the flow is: upload a file, send it for review, the client leaves a pinned comment and requests a revision, a v02 version is uploaded, approval is requested, the client approves (the approval is recorded with name and version), final files are delivered and a final invoice is drafted, the invoice is sent, the client reports a payment and the freelancer confirms it, the project is completed and added to the portfolio. The test also checks the activity log, global search, plan gating, that one project's link cannot open another project, protected routes, and that there are no console errors. The results are written to `tests/e2e-results.txt`.

## Arabic & English

The whole app is bilingual, with full right-to-left layout in Arabic.

- **Freelancer language:** switch with the English/العربية button (sidebar, auth pages, landing) or in Settings → Language.
- **Client language:** set per client (client profile, or when creating a client). The client portal, proposals, contracts, invoices and client emails use it. The client can also switch the portal language themselves.
- **Contract templates:** there are two, one in English and one in Arabic (Settings → Contract Templates). A client receives the template in their own language.
- **Activity and notifications** are stored as templates plus variables, so the same history reads correctly in either language.
- **Translations:** they live in `js/i18n/ar-*.js`, keyed by the English source string. Run `node tools/i18n-keys.mjs --missing` to list strings that still need a translation.

## Architecture

| Layer | Where | Notes |
|---|---|---|
| UI runtime | `js/ui.js` | Hash router, delegated `data-action` / `data-form` handlers, modals with focus trap, toasts, shared components. All output goes through an auto-escaping `html```` template (`js/core/html.js`). |
| Views | `js/views/*` | `public` (landing, auth, dev mailbox), `onboarding`, `shell`, `dashboard`, `projects` (list, create, workspace), `project-work` (files, feedback, revisions, approvals), `viewer` (preview + timestamp/pin comments), `documents` (proposals, contracts, invoices, payments), `clients`, `growth` (portfolio, analytics, AI, search, notifications), `settings`, `portal`. |
| Domain services | `js/services/*` | All business rules and permission checks: `core` (business, clients, projects, financials, **next action**), `workflow` (brief, proposal, contract, change orders), `delivery` (files, versions, feedback, revisions, approvals, delivery, reminders), `billing` (invoices, payments), `growth` (portfolio, analytics, notifications, search), `context` (access control, activity log, notifications). |
| Data | `js/core/store.js` | Tables with `id`, `createdAt`, `updatedAt`, persisted through a **storage adapter**. The shipped adapter uses IndexedDB (local-first) and keeps browser tabs in sync with `BroadcastChannel`. `activityLogs` is append-only. `docs/schema.sql` is the matching PostgreSQL schema for a server adapter. |
| Auth | `js/core/auth.js` | PBKDF2-SHA256 (210k iterations) password hashing, 30-day sessions, email verification, password reset (1-hour single-use tokens), login and reset rate limiting. |
| Integrations (abstractions) | `js/core/mailer.js`, `js/core/payments.js`, `js/core/ai.js`, `js/core/plans.js` | Email currently goes to a local outbox, shown at `#/mailbox`. Payment gateways are registered but not connected; payments are recorded manually or reported by the client and then confirmed. AI runs on a local rule-based provider, or on Claude with the user's own API key. Plans are defined in one config file. |

### Routes

Freelancer routes: `#/dashboard`, `#/projects`, `#/projects/new`, `#/projects/:id/(overview|brief|proposal|contract|scope|files|feedback|revisions|approvals|invoices|activity)`, `#/clients`, `#/clients/:id`, `#/proposals`, `#/proposals/:id`, `#/contracts`, `#/invoices`, `#/invoices/:id`, `#/payments`, `#/files`, `#/portfolio`, `#/portfolio/:id`, `#/analytics`, `#/ai`, `#/search`, `#/notifications`, `#/settings/:section`.

Public routes: `#/`, `#/login`, `#/signup`, `#/forgot`, `#/reset`, `#/verify`, `#/onboarding`, `#/mailbox`.

Client portal: `#/client/:projectId/(overview|brief|proposal|contract|scope|files|feedback|revisions|approval|invoice)?t=<portal token>`.

### Security model

- Every freelancer service call resolves the signed-in user and checks ownership (`requireProject`, `requireOwned`). A freelancer can reach only projects of a business they own, or projects where they are a `projectMember`.
- Every client-portal call requires the project id plus its random portal token (`portalProject`). A token for one project cannot open another. The freelancer can reset the link or turn the portal off.
- Clients only see the brief, brand, review (once shared), final and deliverables folders. Deliverables unlock on delivery, and optionally only after full payment.
- Decided approvals and accepted contracts cannot be changed. Accepted contracts store a fingerprint of the accepted text. The activity log is append-only.
- All rendering is escaped by default. Inputs are validated in the services (lengths, emails, amounts, dates).
- **Local-first limitation:** in this MVP all data lives in the browser. Anyone with access to the device and browser profile can read it, and client links only work on the same device ("Preview as client"). Moving to the server adapter plus `docs/schema.sql` (with its row-level-security policy pattern) is what makes the permission model a real server-side boundary.

## What is real vs. coming soon

**Real in this build:** accounts; onboarding; clients; projects and templates; briefs, including briefs filled in by the client; proposals and their states; public proposal view with accept/decline; contract generation and acceptance; scope included/not included; change orders the client approves or declines; deposit and final invoices; payment tracking, including payments reported by the client; files with folders and versioning (v01, v02, Final) and overwrite protection for Final; video timestamp and image pin feedback; revision allowance with change-order prompts; immutable approvals; delivery with optional hold-until-paid; completion; portfolio; follow-up reminders; notifications with settings; activity log; global search; analytics; the AI assistant (always reviewed by the user, never auto-sent); plan limits; settings; data export.

**Labelled "Coming Soon" in the UI:** cloud sync and client links that work across devices, real email delivery, online card payments (Stripe, PayPal, regional gateways), billing for plans, public portfolio pages, automated follow-up emails, custom project templates, team members and white-label portal (Studio), and two-factor sign-in.

> Contracts are generated from a template and are **not legal advice**. Adapt them to your jurisdiction and get legal advice where needed. The app says this wherever contracts appear.
