// "How Scopewise works" — a complete guide, in the app's own visual language.
// Copy is bilingual data (not run through t()) so each language reads as written.
import { html, icon, href, pageHead, onAction } from '../ui.js';
import { auth } from '../core/auth.js';
import { lang } from '../core/i18n.js';
import { langSwitch } from './shell.js';

const S = (id, ic, title, lead, cards) => ({ id, ic, title, lead, cards });
const C = (h, p) => ({ h, p });

const FLOW = [
  ['Brief', 'موجز المشروع'], ['Scope', 'نطاق العمل'], ['Proposal', 'عرض السعر'], ['Contract', 'العقد'], ['Project', 'التنفيذ'],
  ['Feedback', 'الملاحظات'], ['Revision', 'التعديل'], ['Approval', 'الاعتماد'], ['Payment', 'الدفع'], ['Delivery', 'التسليم'],
];

const SECTIONS = [
  S('start', 'sparkles', { en: 'Get started', ar: 'البداية' }, { en: 'Create an account, choose how you work, and you are ready in a few screens.', ar: 'أنشئ حسابك، واختر طريقة عملك، وتصبح جاهزًا في بضع شاشات.' }, [
    C({ en: '1 · Create your account', ar: '١ · أنشئ حسابك' }, { en: 'Sign up with your email and confirm it from the development mailbox. Forgot your password? The reset link arrives in the same mailbox.', ar: 'سجّل ببريدك ثم وثّقه من صندوق البريد التجريبي. ونسيت كلمة المرور؟ يصلك رابط الاستعادة في الصندوق نفسه.' }),
    C({ en: '2 · Individual or organization', ar: '٢ · فرد أم مؤسسة' }, { en: 'Individuals get a personal workspace. Organizations get members, teams and roles. You can have both and switch any time.', ar: 'الفرد تُنشأ له مساحة شخصية، والمؤسسة يكون لها أعضاء وفرق وأدوار. ويمكنك امتلاك الاثنين والتبديل متى شئت.' }),
    C({ en: '3 · Set up your workspace', ar: '٣ · جهّز مساحة عملك' }, { en: 'Your field, services, currency, name and logo. They pre-fill proposals, invoices and the client portal.', ar: 'مجالك وخدماتك وعملتك واسمك وشعارك. تُستخدم لتعبئة عروض الأسعار والفواتير وبوابة العميل.' }),
    C({ en: 'Language and appearance', ar: 'اللغة والمظهر' }, { en: 'Switch between English (LTR) and العربية (RTL) at any time, and between light, dark and automatic. What people write is never translated.', ar: 'بدّل بين العربية (RTL) والإنجليزية (LTR) في أي وقت، وبين الفاتح والداكن والتلقائي. ما يكتبه الناس لا يُترجم أبدًا.' }),
    C({ en: 'Try the demo', ar: 'جرّب النسخة التجريبية' }, { en: 'On the sign-in page pick Alex, Layla, Karim, Yousef or Sarah (password demo-studio-2026) and compare what each role sees in "Program X".', ar: 'من صفحة الدخول اختر Alex أو Layla أو Karim أو Yousef أو Sarah (كلمة المرور demo-studio-2026) وقارن ما يراه كل دور في مشروع "Program X".' }),
  ]),
  S('map', 'home', { en: 'The map', ar: 'الخريطة' }, { en: 'One coherent place: workspace → organization → project → section.', ar: 'مكان واحد متصل: مساحة العمل ← المؤسسة ← المشروع ← القسم.' }, [
    C({ en: 'Sidebar', ar: 'الشريط الجانبي' }, { en: 'Dashboard, Calendar, Projects, Clients, Proposals, Contracts, Invoices, Payments, Files, Portfolio, Analytics, AI Assistant, Organization, Settings. On phones it becomes a floating bottom bar.', ar: 'لوحة التحكم، التقويم، المشاريع، العملاء، عروض الأسعار، العقود، الفواتير، المدفوعات، الملفات، المعرض، التحليلات، المساعد، المؤسسة، الإعدادات. وعلى الهاتف يصبح شريطًا سفليًا عائمًا.' }),
    C({ en: 'Breadcrumbs', ar: 'مسار التنقل' }, { en: 'Always tells you where you are: organization › project › section. Inside a project the page takes on the project color.', ar: 'يخبرك دائمًا أين أنت: المؤسسة ‹ المشروع ‹ القسم. وداخل المشروع تكتسب الصفحة لونه.' }),
    C({ en: 'Command center', ar: 'مركز الأوامر' }, { en: 'Press Ctrl/Cmd + K to search projects, organizations, clients, people, files, invoices and messages — in Arabic, English or both — and run quick actions.', ar: 'اضغط Ctrl/Cmd + K للبحث في المشاريع والمؤسسات والعملاء والأشخاص والملفات والفواتير والرسائل بالعربية أو الإنجليزية أو بهما، وتنفيذ إجراءات سريعة.' }),
    C({ en: 'Workspace switcher', ar: 'مبدّل المساحات' }, { en: 'The name at the top of the sidebar. Tap it to jump between your personal workspace and your organizations.', ar: 'الاسم في أعلى الشريط الجانبي. اضغطه للانتقال بين مساحتك الشخصية ومؤسساتك.' }),
    C({ en: 'Notifications', ar: 'الإشعارات' }, { en: 'Three kinds: notification (something happened), reminder (something will happen) and action required (waiting for you). Each one opens the exact screen.', ar: 'ثلاثة أنواع: إشعار (حدث شيء)، تذكير (سيحدث شيء)، وإجراء مطلوب (ينتظرك). وكل واحد يفتح الشاشة المعنية مباشرة.' }),
  ]),
  S('who', 'users', { en: 'Individuals & organizations', ar: 'الأفراد والمؤسسات' }, { en: 'Four relationships are supported: individual ↔ individual, individual ↔ organization, organization ↔ individual, organization ↔ organization.', ar: 'تُدعم أربع علاقات: فرد ← فرد، فرد ← مؤسسة، مؤسسة ← فرد، مؤسسة ← مؤسسة.' }, [
    C({ en: 'Individual', ar: 'الفرد' }, { en: 'Freelancers and consultants. A personal workspace, full access to your own projects, clients who are people or companies.', ar: 'المستقلون والمستشارون. مساحة شخصية وصلاحيات كاملة على مشاريعك، وعملاء أفراد أو شركات.' }),
    C({ en: 'Organization', ar: 'المؤسسة' }, { en: 'Companies, agencies, studios, production companies and TV channels: members, teams, roles, permissions and shared projects.', ar: 'الشركات والوكالات والاستوديوهات وشركات الإنتاج والقنوات: أعضاء وفرق وأدوار وصلاحيات ومشاريع مشتركة.' }),
    C({ en: 'Example', ar: 'مثال' }, { en: 'ABC Production (production company) delivers "Program X — Season 1" to XYZ TV (channel). Each organization has its own people, and both work in the same project.', ar: 'شركة ABC Production (إنتاج) تنفّذ "برنامج X — الموسم الأول" لقناة XYZ TV. لكل مؤسسة أشخاصها، وتعمل الاثنتان في المشروع نفسه.' }),
    C({ en: 'Create an organization', ar: 'إنشاء مؤسسة' }, { en: 'Individuals: Organization page → Create an organization. Your personal workspace stays untouched.', ar: 'للأفراد: صفحة المؤسسة ← إنشاء مؤسسة. وتبقى مساحتك الشخصية كما هي.' }),
  ]),
  S('roles', 'shield', { en: 'Roles & permissions', ar: 'الأدوار والصلاحيات' }, { en: 'Two independent levels. Nobody sees everything by default.', ar: 'مستويان مستقلان. ولا أحد يرى كل شيء افتراضيًا.' }, [
    C({ en: 'Organization roles', ar: 'أدوار المؤسسة' }, { en: 'Owner (everything) · Admin (members, teams, settings, all projects) · Manager (runs every project) · Member (only assigned projects) · Finance (proposals, contracts, invoices, payments) · Viewer (read-only).', ar: 'مالك (كل شيء) · مسؤول (الأعضاء والفرق والإعدادات وكل المشاريع) · مدير (يدير كل المشاريع) · عضو (مشاريعه فقط) · مالية (العروض والعقود والفواتير والمدفوعات) · مشاهد (قراءة فقط).' }),
    C({ en: 'Project roles', ar: 'أدوار المشروع' }, { en: 'Project owner, manager, producer, director, designer, editor, reviewer, approver, finance. A person can be a Member in the organization and Approver in one project.', ar: 'مالك المشروع، مدير، منتج، مخرج، مصمم، مونتير، مراجع، معتمِد، مالية. وقد يكون الشخص عضوًا في المؤسسة ومعتمِدًا في مشروع.' }),
    C({ en: 'Finance is protected', ar: 'المالية محمية' }, { en: 'Editors and designers do not see contract value, invoices, payments or financial activity unless they are given the Finance role.', ar: 'المونتير والمصمم لا يريان قيمة العقد ولا الفواتير ولا المدفوعات ولا النشاط المالي إلا بدور المالية.' }),
    C({ en: 'Teams', ar: 'الفرق' }, { en: 'Group people (Production, Content, Finance) and add a whole team to a project in one step.', ar: 'اجمع الأشخاص في فرق (إنتاج، محتوى، مالية) وأضف فريقًا كاملًا إلى مشروع بخطوة واحدة.' }),
  ]),
  S('project', 'folder', { en: 'Inside a project', ar: 'داخل المشروع' }, { en: 'A project is a shared workspace, not a folder. Each section only shows what your role allows.', ar: 'المشروع مساحة عمل مشتركة لا مجرد مجلد. وكل قسم يعرض فقط ما يسمح به دورك.' }, [
    C({ en: 'Next action', ar: 'الإجراء التالي' }, { en: 'One dominant card says what to do now — or what the other side is waiting for — with a button to open the right screen.', ar: 'بطاقة واحدة بارزة تخبرك بما عليك فعله الآن، أو بما ينتظره الطرف الآخر، مع زر يفتح الشاشة الصحيحة.' }),
    C({ en: 'Brief & Scope', ar: 'الموجز والنطاق' }, { en: 'Objective, audience, deliverables, quantities, revisions included and exclusions. The scope protects both sides. Extra requests become change orders the client approves.', ar: 'الهدف والجمهور والمخرجات والكميات وجولات التعديل والاستثناءات. النطاق يحمي الطرفين، وأي طلب إضافي يصبح طلب تغيير يوافق عليه العميل.' }),
    C({ en: 'Proposal & Contract', ar: 'عرض السعر والعقد' }, { en: 'Proposal: draft → sent → viewed → accepted / declined / expired. The contract is generated from it and, once accepted, creates the deposit invoice.', ar: 'عرض السعر: مسودة ← أُرسل ← شوهد ← مقبول / مرفوض / منتهٍ. والعقد يُولَّد منه، وعند قبوله تُصدر فاتورة الدفعة المقدّمة.' }),
    C({ en: 'Files & versions', ar: 'الملفات والإصدارات' }, { en: 'Folders, v01 → v02 → Final, preview for video and images. A Final version cannot be overwritten. Share a version for review and the client is notified.', ar: 'مجلدات وإصدارات v01 ← v02 ← نهائي ومعاينة للفيديو والصور. لا يمكن الكتابة فوق النهائي، والمشاركة للمراجعة تُنبّه العميل.' }),
    C({ en: 'Feedback & revisions', ar: 'الملاحظات والتعديلات' }, { en: 'Comments pinned to a timecode (00:17) or a point on an image, replies, and Resolved. Revision rounds count against the agreed allowance.', ar: 'تعليقات مثبتة على لحظة (00:17) أو نقطة على الصورة، وردود، وحالة "محلول". وتُحتسب جولات التعديل من الرصيد المتفق عليه.' }),
    C({ en: 'Approval', ar: 'الاعتماد' }, { en: 'Final review: Request changes or Approve final. It is recorded with name, date and version and cannot be edited. It updates the stage, timeline, calendar and notifications.', ar: 'المراجعة النهائية: طلب تعديلات أو اعتماد نهائي. يُسجَّل بالاسم والتاريخ والإصدار ولا يُعدَّل، ويحدّث المرحلة والخط الزمني والتقويم والإشعارات.' }),
    C({ en: 'Invoices & payments', ar: 'الفواتير والمدفوعات' }, { en: 'Deposit, final and extra invoices; statuses draft → sent → viewed → due / overdue → partly paid → paid. Record payments, or confirm ones the client reports. Paying the deposit activates the project.', ar: 'فواتير الدفعة المقدّمة والنهائية والإضافية. الحالات: مسودة ← أُرسلت ← شوهدت ← مستحقة / متأخرة ← جزئية ← مدفوعة. سجّل الدفعات أو أكّد ما يبلّغ عنه العميل، وسداد الدفعة المقدّمة يفعّل المشروع.' }),
    C({ en: 'Tasks, messages, team', ar: 'المهام والرسائل والفريق' }, { en: 'Tasks with due dates, one conversation for everyone on the project, and a Team tab with both organizations and their roles.', ar: 'مهام بمواعيد، ومحادثة واحدة لكل من في المشروع، وتبويب فريق يجمع المؤسستين وأدوارهما.' }),
    C({ en: 'Delivery', ar: 'التسليم' }, { en: 'After approval, deliver the final files. You can hold downloads until the project is paid in full.', ar: 'بعد الاعتماد تُسلَّم الملفات النهائية، ويمكنك حجب التحميل حتى السداد الكامل.' }),
  ]),
  S('calendar', 'calendar', { en: 'Calendar & timeline', ar: 'التقويم والخط الزمني' }, { en: 'Dates are never typed twice. They appear on their own.', ar: 'لا تُكتب المواعيد مرتين. تظهر من تلقاء نفسها.' }, [
    C({ en: 'Project calendar', ar: 'تقويم المشروع' }, { en: 'Deadlines, meetings, milestones, invoices, approvals and deliveries in the project color. Add meetings and milestones yourself; the rest is derived.', ar: 'المواعيد النهائية والاجتماعات والمحطات والفواتير والاعتمادات والتسليمات بلون المشروع. تضيف الاجتماعات والمحطات بنفسك، والباقي يُشتق تلقائيًا.' }),
    C({ en: 'All-projects calendar', ar: 'التقويم العام' }, { en: 'Every project together. Filter by My projects, My tasks, Deadlines, Meetings, Reviews, Approvals, Payments, Deliveries, and hide or show projects.', ar: 'كل المشاريع معًا. رشّح حسب مشاريعي أو مهامي أو المواعيد أو الاجتماعات أو المراجعات أو الاعتمادات أو المدفوعات أو التسليمات، وأخفِ أو أظهر مشاريع.' }),
    C({ en: 'Activity timeline', ar: 'سجل النشاط' }, { en: 'A permanent chronological record by day: time, person, organization, action. Finance events are hidden from people without finance access.', ar: 'سجل زمني دائم مرتب بالأيام: الوقت والشخص والجهة والإجراء. والأحداث المالية مخفية عمّن لا صلاحية مالية له.' }),
    C({ en: 'Smart reminders', ar: 'التذكيرات الذكية' }, { en: 'Delivery in 2 days → tomorrow → today → overdue. Invoices before, on and after the due date. Only the right people get them.', ar: 'التسليم بعد يومين ← غدًا ← اليوم ← متأخر. والفواتير قبل الاستحقاق وفي يومه وبعده. ولا تصل إلا لأصحاب الصلة.' }),
  ]),
  S('client', 'chat', { en: 'The client side', ar: 'جهة العميل' }, { en: 'The client sees a calm, simple version of the project.', ar: 'يرى العميل نسخة هادئة وبسيطة من المشروع.' }, [
    C({ en: 'Secure link', ar: 'الرابط السري' }, { en: 'External clients open a private link — no account. It opens one project only. You can reset the link or turn the portal off.', ar: 'العميل الخارجي يفتح رابطًا خاصًا بلا حساب، وهو لمشروع واحد فقط. ويمكنك إعادة توليده أو إيقاف البوابة.' }),
    C({ en: 'What the client does', ar: 'ما يفعله العميل' }, { en: 'Completes the brief, accepts the proposal and contract, reviews files, comments, approves, approves change orders, reports payments, and messages the team.', ar: 'يكمل الموجز، ويقبل العرض والعقد، ويراجع الملفات ويعلّق ويعتمد، ويوافق على طلبات التغيير، ويبلّغ عن الدفع، ويراسل الفريق.' }),
    C({ en: 'Organizations as clients', ar: 'مؤسسة كعميل' }, { en: 'If the client organization is on Scopewise, its members sign in and see the project in their own workspace, limited by their project role.', ar: 'إذا كانت مؤسسة العميل على Scopewise يدخل أعضاؤها ويرون المشروع في مساحتهم، محدودًا بدورهم في المشروع.' }),
    C({ en: 'Project language & color', ar: 'لغة المشروع ولونه' }, { en: 'Project settings (⋯) lets you set the project language, color and a name in the other language. The portal follows them.', ar: 'من إعدادات المشروع (⋯) تحدد لغة المشروع ولونه واسمًا بلغة أخرى، وتتبعها البوابة.' }),
  ]),
  S('pro', 'star', { en: 'Working like a pro', ar: 'العمل باحتراف' }, { en: 'Habits that keep every project clear and protected.', ar: 'عادات تُبقي كل مشروع واضحًا ومحميًا.' }, [
    C({ en: 'Day one', ar: 'اليوم الأول' }, { en: 'Finish setup, add your logo, set currency, tax and payment instructions in Settings, then add your first client.', ar: 'أكمل الإعداد، وأضف شعارك، واضبط العملة والضريبة وتعليمات الدفع في الإعدادات، ثم أضف أول عميل.' }),
    C({ en: 'First project', ar: 'أول مشروع' }, { en: 'Brief → scope → proposal → contract → deposit → files → feedback → approval → final invoice → delivery. Follow the Next action card.', ar: 'موجز ← نطاق ← عرض ← عقد ← دفعة مقدّمة ← ملفات ← ملاحظات ← اعتماد ← فاتورة نهائية ← تسليم. اتبع بطاقة الإجراء التالي.' }),
    C({ en: 'Protect your scope', ar: 'احمِ نطاقك' }, { en: 'Anything outside the agreement becomes a change order. Keep communication inside the project so the record stays complete.', ar: 'أي شيء خارج الاتفاق يصبح طلب تغيير. وأبقِ التواصل داخل المشروع ليبقى السجل كاملًا.' }),
    C({ en: 'Every day', ar: 'كل يوم' }, { en: 'Start at "Needs your attention", check the calendar weekly, use Ctrl/Cmd + K for everything.', ar: 'ابدأ من "بحاجة إلى انتباهك"، وراجع التقويم أسبوعيًا، واستخدم Ctrl/Cmd + K لكل شيء.' }),
    C({ en: 'For organizations', ar: 'للمؤسسات' }, { en: 'Give the least access that works, keep Finance as its own role, name one project owner and one approver on the client side, and review the Team tab regularly.', ar: 'امنح أقل صلاحية تكفي، واجعل المالية دورًا مستقلًا، وسمِّ مالكًا واحدًا للمشروع ومعتمِدًا واحدًا من جهة العميل، وراجع تبويب الفريق دوريًا.' }),
    C({ en: 'Back up', ar: 'النسخ الاحتياطي' }, { en: 'Data lives in this browser. Export it from Settings regularly.', ar: 'البيانات محفوظة في هذا المتصفح. صدّرها من الإعدادات بانتظام.' }),
  ]),
  S('limits', 'clock', { en: 'Good to know', ar: 'للعلم' }, { en: 'What this version does and does not do.', ar: 'ما تفعله هذه النسخة وما لا تفعله.' }, [
    C({ en: 'Local only', ar: 'محلية فقط' }, { en: 'There is no server yet: no sync between devices, no real email (messages appear in the development mailbox), and client links open in the browser that created the project.', ar: 'لا يوجد خادم بعد: لا مزامنة بين الأجهزة ولا بريد حقيقي (الرسائل تظهر في الصندوق التجريبي)، وروابط العميل تفتح في المتصفح الذي أُنشئ فيه المشروع.' }),
    C({ en: 'Payments', ar: 'المدفوعات' }, { en: 'Payments are recorded manually or reported by the client. Online payment is not connected.', ar: 'تُسجَّل الدفعات يدويًا أو يبلّغ بها العميل. والدفع الإلكتروني غير موصول.' }),
    C({ en: 'Next step', ar: 'الخطوة التالية' }, { en: 'For real use across companies, add a backend with a database and real email.', ar: 'للاستخدام الفعلي بين الشركات يلزم خادم وقاعدة بيانات وبريد حقيقي.' }),
  ]),
];

const T = (o) => o[lang()] || o.en;

function body() {
  const ar = lang() === 'ar';
  return html`<div class="guide">
    <section class="guide-hero"><div class="eyebrow">${ar ? 'دليل الاستخدام' : 'User guide'}</div>
      <h1>${ar ? 'كيف تعمل Scopewise' : 'How Scopewise works'}</h1>
      <p class="page-sub">${ar ? 'من أول دخول حتى الاحتراف، في صفحة واحدة.' : 'From first sign-in to working like a pro, on one page.'}</p>
      <ol class="guide-flow" aria-label="${ar ? 'مسار العمل' : 'Workflow'}">${FLOW.map(([en, a], i) => html`<li><span>${i + 1}</span>${ar ? a : en}</li>`)}</ol></section>
    <nav class="guide-toc" aria-label="${ar ? 'محتويات الدليل' : 'Contents'}">${SECTIONS.map((s) => html`<button type="button" class="chip-btn" data-action="guide-go" data-id="${s.id}">${icon(s.ic, 15)} ${T(s.title)}</button>`)}</nav>
    ${SECTIONS.map((s, i) => html`<section class="guide-sec" id="guide-${s.id}">
      <header class="guide-sec-head"><span class="guide-num">${icon(s.ic, 20)}</span><div><div class="eyebrow">${String(i + 1).padStart(2, '0')}</div><h2>${T(s.title)}</h2><p class="muted" style="margin:4px 0 0">${T(s.lead)}</p></div></header>
      <div class="guide-grid">${s.cards.map((c) => html`<article class="card guide-card"><h3>${T(c.h)}</h3><p>${T(c.p)}</p></article>`)}</div></section>`)}
    <section class="cta-card attention guide-end"><div><h2>${ar ? 'جاهز للبدء؟' : 'Ready to start?'}</h2><p class="muted" style="margin:4px 0 0">${ar ? 'أنشئ حسابك أو جرّب النسخة التجريبية.' : 'Create your account or try the demo.'}</p></div>
      <a class="btn btn-primary btn-lg" href="${href(auth.currentUser() ? '/dashboard' : '/signup')}">${auth.currentUser() ? (ar ? 'افتح لوحة التحكم' : 'Open dashboard') : (ar ? 'ابدأ مجانًا' : 'Start Free')} ${icon('arrow', 16)}</a></section>
  </div>`;
}

// In the app (shell) and public (marketing header) variants.
export const guideApp = () => body();
export function guidePublic() {
  const user = auth.currentUser();
  const ar = lang() === 'ar';
  return html`<div class="lp"><header class="lp-nav">
      <a class="brand" href="${href('/')}" style="padding:0" aria-label="Scopewise"><img src="assets/icon.svg" alt=""><span class="brand-name">Scopewise</span></a>
      <nav>${langSwitch()}${user ? html`<a class="btn btn-primary" href="${href('/dashboard')}">${ar ? 'لوحة التحكم' : 'Open dashboard'}</a>` : html`<a class="btn btn-ghost" href="${href('/login')}">${ar ? 'دخول' : 'Sign in'}</a><a class="btn btn-primary" href="${href('/signup')}">${ar ? 'ابدأ مجانًا' : 'Start Free'}</a>`}</nav></header>
    <main class="guide-public">${body()}</main></div>`;
}

onAction({ 'guide-go': (el) => { document.getElementById(`guide-${el.dataset.id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return false; } });
export { pageHead };
