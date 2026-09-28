export const DISCIPLINES = ['Graphic Designer', 'Video Editor', 'Videographer', 'Photographer', 'Motion Designer', 'Content Creator', 'Creative Director', 'Social Media Manager', 'Brand Designer', 'Marketing', 'Other'];
export const CURRENCIES = ['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD', 'BHD', 'OMR', 'EGP', 'MAD', 'CAD', 'AUD'];

export const PROJECT_STATUSES = {
  draft: { label: 'Draft', tone: 'neutral' },
  awaiting_deposit: { label: 'Awaiting Deposit', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  in_review: { label: 'In Review', tone: 'blue' },
  revision_requested: { label: 'Revision Requested', tone: 'amber' },
  awaiting_approval: { label: 'Awaiting Approval', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' },
  completed: { label: 'Completed', tone: 'ink' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};
export const OPEN_STATUSES = ['draft', 'awaiting_deposit', 'active', 'in_review', 'revision_requested', 'awaiting_approval', 'approved'];
// Projects that count against plan limits (work has been committed to).
export const ACTIVE_STATUSES = ['awaiting_deposit', 'active', 'in_review', 'revision_requested', 'awaiting_approval', 'approved'];

export const PROPOSAL_STATUSES = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'blue' }, viewed: { label: 'Viewed', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'green' }, rejected: { label: 'Declined', tone: 'red' }, expired: { label: 'Expired', tone: 'neutral' },
};
export const CONTRACT_STATUSES = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Awaiting acceptance', tone: 'amber' }, accepted: { label: 'Accepted', tone: 'green' }, void: { label: 'Void', tone: 'neutral' },
};
export const INVOICE_STATUSES = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Sent', tone: 'blue' }, viewed: { label: 'Viewed', tone: 'blue' },
  partially_paid: { label: 'Partially Paid', tone: 'amber' }, paid: { label: 'Paid', tone: 'green' }, overdue: { label: 'Overdue', tone: 'red' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export const CO_STATUSES = { pending: { label: 'Awaiting client', tone: 'amber' }, approved: { label: 'Approved', tone: 'green' }, declined: { label: 'Declined', tone: 'red' } };
export const ROUND_STATUSES = { requested: { label: 'Requested', tone: 'amber' }, in_progress: { label: 'In progress', tone: 'blue' }, delivered: { label: 'Delivered', tone: 'green' } };

export const FOLDERS = [
  { id: 'brief', label: '01 Brief' },
  { id: 'brand', label: '02 Brand Assets' },
  { id: 'drafts', label: '03 Drafts' },
  { id: 'review', label: '04 Review' },
  { id: 'final', label: '05 Final' },
  { id: 'deliverables', label: '06 Deliverables' },
];
// Folders the client can see in the portal.
export const CLIENT_FOLDERS = ['brief', 'brand', 'review', 'final', 'deliverables'];

export const PROJECT_TYPES = ['Logo Design', 'Brand Identity', 'Social Media Package', 'Video Production', 'Video Editing', 'Photography', 'Content Creation', 'Marketing Campaign', 'Motion Graphics', 'Other'];

const STD_EXCLUSIONS = ['Additional revision rounds beyond those included', 'Work outside the listed deliverables'];
export const TEMPLATES = {
  logo: { name: 'Logo Design', type: 'Logo Design', days: 10, revisions: 2, deposit: 50, price: 3500,
    deliverables: [['Logo concepts', 3], ['Final logo files (SVG, PNG, PDF)', 1], ['Basic usage sheet', 1]],
    exclusions: [...STD_EXCLUSIONS, 'Full brand guidelines', 'Trademark search or registration', 'Printing costs'] },
  brand: { name: 'Brand Identity', type: 'Brand Identity', days: 28, revisions: 2, deposit: 50, price: 12000,
    deliverables: [['Logo suite', 1], ['Color palette & typography', 1], ['Brand guidelines (PDF)', 1], ['Stationery designs', 3]],
    exclusions: [...STD_EXCLUSIONS, 'Website design', 'Printing costs', 'Photography'] },
  social: { name: 'Social Media Package', type: 'Social Media Package', days: 14, revisions: 2, deposit: 50, price: 4500,
    deliverables: [['Feed post designs', 12], ['Story designs', 6], ['Caption copy', 12]],
    exclusions: [...STD_EXCLUSIONS, 'Paid advertising spend', 'Community management', 'Photography or filming'] },
  videoProduction: { name: 'Video Production', type: 'Video Production', days: 21, revisions: 2, deposit: 50, price: 15000,
    deliverables: [['Hero video (60s)', 1], ['Cut-downs for social (15s)', 3], ['Shoot day', 1]],
    exclusions: [...STD_EXCLUSIONS, 'Talent fees', 'Location fees', 'Additional shoot days', 'Paid advertising', 'Licensed music beyond stock library'] },
  videoEditing: { name: 'Video Editing', type: 'Video Editing', days: 10, revisions: 2, deposit: 50, price: 3000,
    deliverables: [['Edited video', 1], ['Color grade', 1], ['Subtitled version', 1]],
    exclusions: [...STD_EXCLUSIONS, 'Filming', 'Motion graphics beyond titles', 'Licensed music beyond stock library'] },
  photography: { name: 'Photography', type: 'Photography', days: 7, revisions: 1, deposit: 50, price: 4000,
    deliverables: [['Half-day shoot', 1], ['Edited photos', 20]],
    exclusions: [...STD_EXCLUSIONS, 'Additional shooting time', 'Location fees', 'Props and styling', 'Advanced retouching'] },
  content: { name: 'Content Creation', type: 'Content Creation', days: 14, revisions: 2, deposit: 50, price: 5000,
    deliverables: [['Short-form videos (Reels/TikTok)', 4], ['Photos', 10], ['Content calendar', 1]],
    exclusions: [...STD_EXCLUSIONS, 'Paid advertising', 'Talent fees', 'Posting and community management'] },
  campaign: { name: 'Marketing Campaign', type: 'Marketing Campaign', days: 30, revisions: 2, deposit: 50, price: 18000,
    deliverables: [['Campaign concept', 1], ['Key visual', 1], ['Social adaptations', 8], ['Campaign video (30s)', 1]],
    exclusions: [...STD_EXCLUSIONS, 'Media buying', 'Paid advertising spend', 'Talent and location fees', 'Printing'] },
};

export const DEFAULT_CONTRACT_SECTIONS = [
  ['Project Scope', 'The Freelancer will deliver the work described in the accepted proposal for "{{project}}" to {{client}}. Only the items listed under Deliverables are included in this agreement.'],
  ['Deliverables', '{{deliverables}}'],
  ['Timeline', 'Work begins once this agreement is accepted and the deposit is received. The target completion date is {{deadline}}. Delays in client feedback, approvals or payments extend the timeline accordingly.'],
  ['Payment Terms', 'The total project fee is {{total}}. {{paymentTerms}}'],
  ['Deposit', 'A non-refundable deposit of {{depositPercent}}% ({{depositAmount}}) is due before work begins.'],
  ['Revisions', 'This project includes {{revisions}} revision round(s). A revision round is one consolidated set of feedback. Additional rounds are billed via a change order approved by the Client before work starts.'],
  ['Cancellation', 'Either party may cancel in writing. Work completed up to the cancellation date is billable, and the deposit is non-refundable.'],
  ['Usage Rights', 'On full payment, the Client receives the right to use the final deliverables for the purposes described in the brief. The Freelancer may show the work in their portfolio unless agreed otherwise in writing.'],
  ['Intellectual Property', 'The Freelancer retains ownership of drafts, unused concepts and working files. Ownership of final deliverables transfers to the Client on full payment, unless stated otherwise.'],
  ['Final Delivery', 'Final files are delivered through the client portal after final approval. Delivery of full-resolution files may be conditional on payment of the outstanding balance.'],
  ['Additional Work', 'Any work outside the agreed scope — including the items listed as not included — requires a written change order with its own price, approved by the Client before work begins.'],
];

export const DEFAULT_CONTRACT_SECTIONS_AR = [
  ['نطاق العمل', 'يلتزم المستقل بتنفيذ الأعمال الواردة في عرض السعر المقبول لمشروع "{{project}}" لصالح {{client}}، ويقتصر نطاق هذه الاتفاقية على المخرجات المحددة أدناه.'],
  ['المخرجات', '{{deliverables}}'],
  ['الجدول الزمني', 'يبدأ العمل بعد الموافقة على هذه الاتفاقية واستلام الدفعة المقدّمة، ويكون موعد التسليم المتوقع {{deadline}}. ويُمدَّد الجدول الزمني بقدر أي تأخير في ملاحظات العميل أو اعتماداته أو دفعاته.'],
  ['شروط الدفع', 'إجمالي قيمة المشروع {{total}}. {{paymentTerms}}'],
  ['الدفعة المقدّمة', 'تُستحق دفعة مقدّمة غير قابلة للاسترداد بنسبة {{depositPercent}}% ({{depositAmount}}) قبل بدء العمل.'],
  ['جولات التعديل', 'يشمل هذا المشروع {{revisions}} جولة تعديل، وتعني جولة التعديل مجموعة واحدة من الملاحظات تُرسل دفعة واحدة. وتُنفَّذ أي جولات إضافية بموجب طلب تغيير يعتمده العميل قبل بدء العمل.'],
  ['الإلغاء', 'يحق لأي من الطرفين إلغاء الاتفاقية بإشعار كتابي، وتُستحق قيمة الأعمال المنجزة حتى تاريخ الإلغاء، مع عدم استرداد الدفعة المقدّمة.'],
  ['حقوق الاستخدام', 'بعد السداد الكامل، يحق للعميل استخدام المخرجات النهائية للأغراض الموضحة في موجز المشروع. ويحق للمستقل عرض العمل ضمن معرض أعماله ما لم يُتفق كتابياً على خلاف ذلك.'],
  ['الملكية الفكرية', 'يحتفظ المستقل بملكية المسودات والأفكار غير المستخدمة وملفات العمل، وتنتقل ملكية المخرجات النهائية إلى العميل بعد السداد الكامل ما لم يُنص على خلاف ذلك.'],
  ['التسليم', 'تُسلَّم الملفات النهائية عبر بوابة العميل بعد الاعتماد النهائي، ويجوز أن يكون تسليم الملفات بدقتها الكاملة مشروطاً بسداد المبلغ المتبقي.'],
  ['الأعمال خارج نطاق العمل', 'يتطلب أي عمل خارج نطاق العمل المتفق عليه — بما في ذلك البنود المحددة كخارج نطاق العمل — طلب تغيير مكتوباً بتكلفة مستقلة يعتمده العميل قبل بدء التنفيذ.'],
];

export const CONTRACT_DISCLAIMER = 'This agreement was generated from a template. It is not legal advice and may not be suitable for your jurisdiction. Adapt it to your situation and seek legal advice where necessary.';

export const NOTIFICATION_TYPES = {
  client_action: 'Client actions (accepted, approved, feedback)',
  revision: 'Revision requests',
  payment: 'Payments and invoices',
  deadline: 'Deadline reminders',
  followup: 'Follow-up reminders',
  stale: 'Client has not responded',
};
