// Payment gateway abstraction. The MVP records payments manually (bank
// transfer, cash, cheque, etc.) and lets clients report a payment for the
// freelancer to confirm. Online gateways plug in here: implement
// createCheckout(invoice) on the server and handle the provider webhook by
// inserting a confirmed payment for the invoice.
export const PAYMENT_METHODS = ['Bank transfer', 'Cash', 'Card (in person)', 'Cheque', 'PayPal', 'Other'];

export const gateways = {
  manual: { id: 'manual', label: 'Manual payments', online: false, available: true },
  stripe: { id: 'stripe', label: 'Stripe', online: true, available: false },
  paypal: { id: 'paypal', label: 'PayPal', online: true, available: false },
  regional: { id: 'regional', label: 'Regional gateways', online: true, available: false },
};

export const onlinePaymentsEnabled = () => Object.values(gateways).some((g) => g.online && g.available);
