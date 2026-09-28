// Email abstraction. The MVP ships a local "outbox" provider: messages are
// recorded and visible in the development mailbox (#/mailbox) instead of being
// delivered. Swap `provider` for a real transport (Postmark, SES, Resend…)
// through a server endpoint; call sites stay the same.
import { db } from './store.js';

const provider = {
  id: 'local-outbox',
  label: 'Development mailbox (not delivered)',
  async send(msg) { return db.insert('outbox', { ...msg, provider: 'local-outbox', status: 'recorded' }); },
};

export const mailer = {
  provider,
  send({ to, subject, body, link, linkLabel, kind }) {
    return provider.send({ to, subject, body, link: link || '', linkLabel: linkLabel || '', kind: kind || 'general' });
  },
};

export const appBaseURL = () => location.href.split('#')[0];
export const appLink = (hashPath) => `${appBaseURL()}#${hashPath}`;
