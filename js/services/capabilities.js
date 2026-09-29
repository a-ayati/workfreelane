// Pure permission model — no browser APIs, so a server (SQL seed, edge function)
// can share it. context.js applies it; tools/gen-supabase.mjs exports it to SQL.
export const PROJECT_ROLES = ['owner', 'manager', 'producer', 'director', 'designer', 'editor', 'reviewer', 'approver', 'finance', 'viewer'];
export const ORG_ROLES = ['owner', 'admin', 'manager', 'member', 'finance', 'viewer'];

export const CAPS_ALL = [
  'project.view', 'brief.view', 'brief.edit', 'brief.submit', 'scope.view', 'scope.edit',
  'proposal.view', 'proposal.edit', 'proposal.respond', 'contract.view', 'contract.edit', 'contract.accept',
  'files.view', 'files.upload', 'feedback.view', 'feedback.write',
  'revisions.view', 'revisions.manage', 'revisions.request',
  'approvals.view', 'approvals.request', 'approvals.respond', 'changes.respond',
  'finance.view', 'finance.manage', 'finance.pay', 'delivery.manage',
  'team.view', 'team.manage', 'tasks.view', 'tasks.manage', 'messages', 'calendar.view', 'activity.view', 'settings.manage',
];
// Capabilities that only make sense on one side of a project.
export const PROVIDER_ONLY = new Set(['brief.edit', 'scope.edit', 'proposal.edit', 'contract.edit', 'approvals.request', 'revisions.manage', 'delivery.manage', 'finance.manage', 'settings.manage']);
export const CLIENT_ONLY = new Set(['brief.submit', 'proposal.respond', 'contract.accept', 'approvals.respond', 'changes.respond', 'revisions.request', 'finance.pay']);
const WORK = ['project.view', 'brief.view', 'scope.view', 'files.view', 'files.upload', 'feedback.view', 'feedback.write', 'revisions.view', 'tasks.view', 'messages', 'calendar.view', 'activity.view', 'team.view'];
const REVIEW = ['project.view', 'brief.view', 'scope.view', 'files.view', 'feedback.view', 'feedback.write', 'revisions.view', 'revisions.request', 'brief.submit', 'approvals.view', 'tasks.view', 'messages', 'calendar.view', 'activity.view', 'team.view'];
export const ROLE_CAPS = {
  owner: CAPS_ALL,
  manager: CAPS_ALL,
  producer: CAPS_ALL.filter((c) => !['finance.manage', 'finance.pay', 'team.manage', 'settings.manage'].includes(c)),
  director: CAPS_ALL.filter((c) => !['finance.manage', 'finance.pay', 'settings.manage'].includes(c)),
  designer: [...WORK, 'tasks.manage'],
  editor: [...WORK, 'tasks.manage'],
  reviewer: REVIEW,
  approver: [...REVIEW, 'approvals.respond', 'proposal.view', 'proposal.respond', 'contract.view', 'contract.accept', 'changes.respond'],
  finance: ['project.view', 'scope.view', 'proposal.view', 'contract.view', 'approvals.view', 'finance.view', 'finance.manage', 'finance.pay', 'messages', 'calendar.view', 'activity.view', 'team.view'],
  viewer: ['project.view', 'brief.view', 'scope.view', 'files.view', 'feedback.view', 'revisions.view', 'approvals.view', 'calendar.view', 'activity.view', 'team.view'],
};
// Organization roles that grant access to every project of the organization.
export const IMPLICIT = { owner: 'owner', admin: 'owner', manager: 'manager', finance: 'finance' };

// Workspace-level permission (lists and pages that span every project).
export const WS_CAPS = {
  owner: ['*'], admin: ['*'],
  manager: ['projects.create', 'clients.view', 'clients.manage', 'finance.view', 'proposal.view', 'contract.view', 'portfolio', 'analytics', 'members.view'],
  finance: ['finance.view', 'finance.manage', 'proposal.view', 'contract.view', 'clients.view', 'members.view'],
  member: ['projects.create', 'members.view'],
  viewer: ['members.view'],
};
export const roleCaps = (role) => ROLE_CAPS[role] || [];
