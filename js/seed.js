// Realistic demo workspace, created through the same services the app uses so
// every record (statuses, invoices, activity) is consistent.
import { db, flush } from './core/store.js';
import { auth } from './core/auth.js';
import { clock, addDays } from './core/util.js';
import { completeOnboarding, createClient, createProject, updateBusiness } from './services/core.js';
import { saveBrief, sendBrief, createProposal, updateProposal, sendProposal, portalViewProposal, portalRespondProposal, portalAcceptContract, createChangeOrder, portalRespondChangeOrder, portalSubmitBrief } from './services/workflow.js';
import { recordPayment, sendInvoice, invoiceChangeOrder } from './services/billing.js';
import { uploadFile, sendForReview, portalAddFeedback, portalRequestRevision, requestApproval, portalRespondApproval, markFinal, deliverFinal, completeProject, createReminder } from './services/delivery.js';
import { savePortfolioItem } from './services/growth.js';
import { subscription } from './services/context.js';

export const DEMO = { name: 'Alex Morgan', email: 'alex.morgan@demo.scopewise.app', password: 'demo-studio-2026' };

const base = () => new Date();
function at(daysAgo, hour = 10) { const d = addDays(base(), -daysAgo); d.setHours(hour, 15, 0, 0); clock.set(d); return d.toISOString().slice(0, 10); }
const iso = (daysFromNow) => addDays(base(), daysFromNow).toISOString().slice(0, 10);

function art(title, sub, bg, fg = '#F3EEE5') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${bg}"/><circle cx="1260" cy="300" r="180" fill="${fg}" opacity=".12"/><rect x="120" y="640" width="520" height="6" fill="#C77B3B"/><text x="120" y="560" font-family="Georgia, serif" font-size="120" fill="${fg}">${title}</text><text x="120" y="720" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="${fg}" opacity=".7">${sub}</text></svg>`;
  return new File([svg], `${title.replace(/\s+/g, '_')}.svg`, { type: 'image/svg+xml' });
}
const tokenOf = (id) => db.get('projects', id).portalToken;

async function proposalFor(project, { items, deliverables, exclusions, timeline, revisions = 2, intro, paymentTerms }) {
  const prop = createProposal(project.id);
  updateProposal(prop.id, {
    title: project.name, introduction: intro || db.get('businesses', project.businessId).proposalIntro, objective: db.find('briefs', (b) => b.projectId === project.id)?.objective || '',
    timeline, revisions, depositPercent: 50, paymentTerms: paymentTerms || '50% deposit to start, 50% on final approval before delivery of final files.',
    validUntil: iso(14), notes: '', items, deliverables, exclusions: exclusions.join('\n'),
  });
  return prop;
}

export async function seedDemo() {
  if (db.find('users', (u) => u.email === DEMO.email)) return;
  try {
    at(60, 9);
    await auth.signup({ name: DEMO.name, email: DEMO.email, password: DEMO.password });
    const u = auth.currentUser();
    db.update('users', u.id, { emailVerified: true });
    completeOnboarding({ disciplines: ['Creative Director', 'Videographer', 'Photographer'], services: 'Brand identity\nCampaign video production\nSocial media content\nPhotography', currency: 'QAR', businessName: 'Alex Morgan Studio' });
    updateBusiness({ address: 'West Bay, Doha, Qatar', paymentInstructions: 'Bank transfer to Alex Morgan Studio\nIBAN QA00 DEMO 0000 0000 0000 0000 0000 0\nPlease include the invoice number as the reference.' });
    db.update('subscriptions', subscription().id, { plan: 'pro' });

    const abc = createClient({ name: 'ABC Restaurant', company: 'مجموعة مطاعم ABC', email: 'marketing@abc-restaurant.example', phone: '+974 4400 1122', country: 'قطر', language: 'ar', notes: 'Main contact: Omar Haddad (Marketing Manager). Reads the portal in Arabic. Prefers WhatsApp for quick questions, email for approvals.' });
    const nova = createClient({ name: 'Nova Agency', company: 'Nova Creative Agency', email: 'sara@nova-agency.example', phone: '+971 4 555 0199', country: 'United Arab Emirates', notes: 'Sara Lindqvist, Brand Lead. White-label work for their hospitality clients.' });
    const tech = createClient({ name: 'Vertex Tech', company: 'Vertex Technologies', email: 'daniel.kim@vertex-tech.example', phone: '+974 4000 7788', country: 'Qatar', notes: 'Daniel Kim, Head of Communications. Quarterly content needs.' });

    // 1) Corporate Video — completed last month.
    at(58);
    const corp = createProject({ name: 'Corporate Video', clientId: tech.id, type: 'Video Production', deadline: iso(-24), revisionsIncluded: 2, depositPercent: 50, budget: 14000 });
    saveBrief(corp.id, { objective: 'Introduce Vertex Tech to enterprise buyers with a 90-second brand film.', audience: 'IT directors and procurement teams in the GCC', platforms: 'Website, LinkedIn, trade shows', tone: 'Confident, human, clear' });
    await proposalFor(corp, { timeline: '30 days', items: [{ description: 'Brand film production (pre-production, 1 shoot day, edit)', quantity: 1, unitPrice: 12000 }, { description: 'Motion graphics & captions', quantity: 1, unitPrice: 2000 }], deliverables: [{ title: 'Brand film (90s)', quantity: 1 }, { title: 'LinkedIn cut-downs (15s)', quantity: 3 }], exclusions: ['Talent fees', 'Location fees', 'Additional shoot days', 'Paid advertising'] });
    sendProposal(db.find('proposals', (x) => x.projectId === corp.id).id);
    at(57); portalViewProposal(corp.id, tokenOf(corp.id)); portalRespondProposal(corp.id, tokenOf(corp.id), { decision: 'accept', name: 'Daniel Kim' });
    at(56); portalAcceptContract(corp.id, tokenOf(corp.id), { name: 'Daniel Kim', agree: true });
    at(54); recordPayment(db.find('invoices', (i) => i.projectId === corp.id && i.kind === 'deposit').id, { amount: 7000, method: 'Bank transfer', reference: 'VT-88231', paidAt: at(54) });
    at(40); const cf = await uploadFile(corp.id, { folder: 'drafts', file: art('Vertex Brand Film', 'Rough cut · v01', '#1B2A3A') });
    sendForReview(cf.file.id);
    at(38); portalAddFeedback(corp.id, tokenOf(corp.id), { name: 'Daniel Kim', comment: 'Great pace. Can the product UI shots be brighter?', fileVersionId: cf.version.id, timecode: 42 });
    portalRequestRevision(corp.id, tokenOf(corp.id), { name: 'Daniel Kim', summary: 'Brighten UI shots, swap the closing line to "Built for what\'s next".' });
    at(35); const cv2 = await uploadFile(corp.id, { fileId: cf.file.id, file: art('Vertex Brand Film', 'Final cut · v02', '#1B2A3A') });
    markFinal(cv2.version.id);
    requestApproval(corp.id, { fileVersionId: cv2.version.id, message: 'This version is ready for final approval.' });
    at(33); portalRespondApproval(corp.id, tokenOf(corp.id), db.find('approvals', (a) => a.projectId === corp.id && a.status === 'pending').id, { decision: 'approve', name: 'Daniel Kim' });
    at(32); await uploadFile(corp.id, { folder: 'deliverables', file: art('Vertex Brand Film Master', 'ProRes master · 4K', '#1B2A3A') });
    deliverFinal(corp.id);
    const corpFinal = db.find('invoices', (i) => i.projectId === corp.id && i.kind === 'final');
    sendInvoice(corpFinal.id);
    at(27); recordPayment(corpFinal.id, { amount: 7000, method: 'Bank transfer', reference: 'VT-90417', paidAt: at(27) });
    at(26); completeProject(corp.id);
    savePortfolioItem(null, { projectId: corp.id, title: 'Vertex Tech — Built for what’s next', client: 'Vertex Technologies', category: 'Video Production', challenge: 'Make a complex B2B platform feel human for enterprise buyers.', approach: 'Documentary-style interviews with real engineers, intercut with bright product UI and a restrained motion system.', deliverables: '1 × 90s brand film\n3 × 15s LinkedIn cut-downs', results: '[Add results: views, leads, client quote]', description: '', visibility: 'public', coverVersionId: cv2.version.id, mediaVersionIds: [cv2.version.id] });

    // 2) Brand Identity — awaiting final approval.
    at(34);
    const brand = createProject({ name: 'Brand Identity', clientId: nova.id, templateKey: 'brand', deadline: iso(6) });
    saveBrief(brand.id, { objective: 'A new identity for Sahra, a boutique desert hotel, ahead of its opening season.', audience: 'Affluent travellers 30–55, design-conscious', platforms: 'Print, website, signage, social', tone: 'Warm, minimal, premium' });
    await proposalFor(brand, { timeline: '28 days', items: [{ description: 'Brand identity system', quantity: 1, unitPrice: 12000 }], deliverables: [{ title: 'Logo suite', quantity: 1 }, { title: 'Color palette & typography', quantity: 1 }, { title: 'Brand guidelines (PDF)', quantity: 1 }, { title: 'Stationery designs', quantity: 3 }], exclusions: ['Website design', 'Printing costs', 'Photography', 'Additional revision rounds beyond those included'] });
    sendProposal(db.find('proposals', (x) => x.projectId === brand.id).id);
    at(33); portalViewProposal(brand.id, tokenOf(brand.id)); portalRespondProposal(brand.id, tokenOf(brand.id), { decision: 'accept', name: 'Sara Lindqvist' });
    at(32); portalAcceptContract(brand.id, tokenOf(brand.id), { name: 'Sara Lindqvist', agree: true });
    at(30); recordPayment(db.find('invoices', (i) => i.projectId === brand.id && i.kind === 'deposit').id, { amount: 6000, method: 'Bank transfer', reference: 'NOVA-5521', paidAt: at(30) });
    at(15); const bf = await uploadFile(brand.id, { folder: 'drafts', file: art('Sahra', 'Logo concepts · v01', '#6B4E3D') });
    sendForReview(bf.file.id);
    at(13); portalAddFeedback(brand.id, tokenOf(brand.id), { name: 'Sara Lindqvist', comment: 'Concept B is the one. Can the wordmark breathe a little more?', fileVersionId: bf.version.id, pinX: 32, pinY: 48 });
    portalRequestRevision(brand.id, tokenOf(brand.id), { name: 'Sara Lindqvist', summary: 'Go with concept B, increase letter-spacing on the wordmark, try a warmer sand tone.' });
    at(8); const bv2 = await uploadFile(brand.id, { fileId: bf.file.id, file: art('Sahra', 'Brand system · v02', '#8A6A52') });
    sendForReview(bf.file.id);
    at(1, 16); requestApproval(brand.id, { fileVersionId: bv2.version.id, message: 'Final brand system for approval.' });

    // 3) Restaurant Campaign — Arabic-speaking client; revision requested, 50% paid, overdue change-order invoice.
    at(16);
    const rest = createProject({ name: 'حملة المطعم', clientId: abc.id, type: 'Content Creation', deadline: iso(2), revisionsIncluded: 2, depositPercent: 50 });
    saveBrief(rest.id, { objective: 'إطلاق قائمة الخريف الجديدة وزيادة حجوزات نهاية الأسبوع.', audience: 'روّاد المطاعم ومحبو الطعام في الدوحة، 20–45 عاماً', platforms: 'إنستغرام، تيك توك', tone: 'فاخر، دافئ، عصري', references: 'https://instagram.com/ — المجموعة المحفوظة "الخريف"', productionNeeds: 'الموقع (المطعم)، تنسيق الأطباق، الكاميرا، الإضاءة، المونتاج' });
    await proposalFor(rest, {
      timeline: '14 يوماً', intro: 'شكراً لثقتكم. يوضح هذا العرض نطاق العمل والجدول الزمني والتكلفة لحملة إطلاق قائمة الخريف.',
      paymentTerms: '50% دفعة مقدّمة لبدء العمل، و50% عند الاعتماد النهائي وقبل تسليم الملفات النهائية.',
      items: [{ description: 'إنتاج محتوى الحملة', quantity: 1, unitPrice: 7500 }],
      deliverables: [{ title: 'ريلز (30 ثانية)', quantity: 3 }, { title: 'فيديو رئيسي (60 ثانية)', quantity: 1 }, { title: 'صور معدّلة', quantity: 10 }],
      exclusions: ['تصوير إضافي', 'جولات تعديل إضافية', 'الإعلانات المدفوعة', 'الممثلون والمواهب', 'رسوم المواقع'],
    });
    sendProposal(db.find('proposals', (x) => x.projectId === rest.id).id);
    at(15); portalViewProposal(rest.id, tokenOf(rest.id)); portalRespondProposal(rest.id, tokenOf(rest.id), { decision: 'accept', name: 'عمر حداد' });
    at(15, 14); portalAcceptContract(rest.id, tokenOf(rest.id), { name: 'عمر حداد', agree: true });
    at(14); recordPayment(db.find('invoices', (i) => i.projectId === rest.id && i.kind === 'deposit').id, { amount: 3750, method: 'Bank transfer', reference: 'ABC-20931', paidAt: at(14) });
    at(12); const co = createChangeOrder(rest.id, { title: 'ريل إضافي (تشويقي 15 ثانية)', description: 'مقطع تشويقي قصير للعدّ التنازلي لإطلاق القائمة.', amount: 800, extraDays: 0 });
    at(12, 15); portalRespondChangeOrder(rest.id, tokenOf(rest.id), co.id, { decision: 'approve', name: 'عمر حداد' });
    const coInv = invoiceChangeOrder(co.id);
    sendInvoice(coInv.id);
    at(6); const rf = await uploadFile(rest.id, { folder: 'drafts', file: art('Autumn Menu', 'Hero video storyboard · v01', '#3A2A1E') });
    await uploadFile(rest.id, { folder: 'drafts', file: art('Reel 01', 'Truffle risotto · v01', '#2F3B2A') });
    sendForReview(rf.file.id);
    at(4); portalAddFeedback(rest.id, tokenOf(rest.id), { name: 'عمر حداد', comment: 'نرجو استبدال هذه اللقطة، فتنسيق الطبق يبدو مستعجلاً.', fileVersionId: rf.version.id, pinX: 62, pinY: 40 });
    portalAddFeedback(rest.id, tokenOf(rest.id), { name: 'عمر حداد', comment: 'نرجو إطالة ظهور الشعار في نهاية الفيديو.', fileVersionId: rf.version.id, reference: 'الإطار 12' });
    at(4, 12); portalRequestRevision(rest.id, tokenOf(rest.id), { name: 'عمر حداد', summary: 'استبدال لقطة طبق الريزوتو، وإطالة ظهور الشعار في النهاية إلى ثانيتين.' });

    // 4) Social Media Content — proposal sent, no response yet.
    at(5);
    const social = createProject({ name: 'Social Media Content', clientId: tech.id, templateKey: 'social', deadline: iso(24) });
    saveBrief(social.id, { objective: 'Q4 thought-leadership content for LinkedIn and Instagram.', audience: 'Tech decision makers', platforms: 'LinkedIn, Instagram', tone: 'Clear, confident' });
    await proposalFor(social, { timeline: '21 days', items: [{ description: 'Q4 social media package', quantity: 1, unitPrice: 4500 }], deliverables: [{ title: 'Feed post designs', quantity: 12 }, { title: 'Story designs', quantity: 6 }, { title: 'Caption copy', quantity: 12 }], exclusions: ['Paid advertising spend', 'Community management', 'Photography or filming'] });
    sendProposal(db.find('proposals', (x) => x.projectId === social.id).id);

    // 5) Website Launch Visuals — brief sent to the client.
    at(1);
    const web = createProject({ name: 'Website Launch Visuals', clientId: nova.id, type: 'Photography', deadline: iso(30), budget: 5000 });
    sendBrief(web.id);

    at(0); createReminder({ clientId: tech.id, projectId: corp.id, dueDate: iso(0), note: 'Ask Daniel about Q1 product launch video.' });
  } finally {
    clock.set(null);
    await flush();
  }
}
export { portalSubmitBrief };
