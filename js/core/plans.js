// Subscription plans. Configurable in one place; billing is not connected yet.
export const PLANS = {
  free: {
    id: 'free', name: 'Free', price: 0, period: 'month',
    tagline: 'For getting started',
    limits: { activeProjects: 2 },
    features: { clientPortal: true, analytics: false, ai: false, automations: false, branding: false, team: false },
    highlights: ['2 active projects', 'Clients', 'Basic proposals', 'Basic invoices'],
  },
  pro: {
    id: 'pro', name: 'Pro', price: 19, period: 'month',
    tagline: 'For working freelancers',
    limits: { activeProjects: Infinity },
    features: { clientPortal: true, analytics: true, ai: true, automations: true, branding: true, team: false },
    highlights: ['Unlimited projects', 'Client portal', 'Advanced revisions', 'Analytics', 'AI Assistant', 'Custom branding'],
  },
  studio: {
    id: 'studio', name: 'Studio', price: 49, period: 'month',
    tagline: 'For creative studios',
    limits: { activeProjects: Infinity },
    features: { clientPortal: true, analytics: true, ai: true, automations: true, branding: true, team: true },
    highlights: ['Everything in Pro', 'Team members, roles and project access', 'Team analytics (coming soon)', 'White-label portal (coming soon)'],
  },
};
// Note: the client portal is kept on Free in this MVP because the whole
// brief→payment workflow depends on it. Change `features.clientPortal` to gate it.

export const planOf = (sub) => PLANS[sub?.plan] || PLANS.free;
