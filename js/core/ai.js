// AI assistant. Two providers behind one interface:
//  - "local": deterministic, rule-based helpers that run in the browser.
//  - "anthropic": Claude via the user's own API key (stored only on this device).
// The assistant only ever returns suggestions. Nothing is sent, applied,
// charged or approved without the user reviewing and confirming it.
// Output follows the active language (English or Arabic).
import { UserError } from './util.js';
import { t, lang } from './i18n.js';

const KEY_STORE = 'sw.ai.anthropicKey';
export const CLAUDE_MODEL = 'claude-opus-5';

export const aiConfig = {
  getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE); } catch { throw new UserError(t('Your browser blocked local storage, so the key cannot be saved.')); } },
  provider() { return aiConfig.getKey() ? 'anthropic' : 'local'; },
};

// Labels are English source strings; views translate them with t().
export const AI_TASKS = {
  brief: { label: 'Turn a message into a brief', placeholder: 'Paste the client message, e.g. "I need a 30-second promotional video for my restaurant."' },
  proposal: { label: 'Draft a proposal introduction', placeholder: 'Pick a project, or describe the project.' },
  scope: { label: 'Identify scope risks', placeholder: 'Pick a project, or paste the scope.' },
  followup: { label: 'Write a polite follow-up', placeholder: 'Who are you following up with, and about what?' },
  feedback: { label: "Summarize the client's feedback", placeholder: 'Pick a project, or paste feedback.' },
  caseStudy: { label: 'Turn a project into a case study', placeholder: 'Pick a completed project.' },
  health: { label: 'What is delaying this project?', placeholder: 'Pick a project.' },
};

// ---------------- Local provider ----------------
const has = (s, ...words) => words.some((w) => s.includes(w));
function localBrief(text) {
  const s = text.toLowerCase();
  const secs = s.match(/(\d+)\s*(-|\s)?\s*(second|sec|s\b|ثانية|ثواني|ثوان)/);
  const mins = s.match(/(\d+)\s*(-|\s)?\s*(minute|min|دقيقة|دقائق)/);
  const count = (...words) => { for (const w of words) { const m = s.match(new RegExp(`(\\d+)\\s+${w}`)); if (m) return Number(m[1]); } return null; };
  let type = 'Other', deliverable = '', needs = [];
  if (has(s, 'video', 'reel', 'film', 'commercial', 'tiktok', 'ad ', 'فيديو', 'ريلز', 'إعلان', 'اعلان', 'فلم', 'فيلم', 'مونتاج')) {
    type = has(s, 'edit', 'footage', 'مونتاج') && !has(s, 'shoot', 'film', 'تصوير') ? 'Video Editing' : 'Video Production';
    const len = secs ? t('{n}-second', { n: secs[1] }) : mins ? t('{n}-minute', { n: mins[1] }) : '';
    const promo = has(s, 'promo', 'commercial', 'ad', 'ترويج', 'إعلان', 'اعلان');
    deliverable = t(promo ? '{n} × {len} promotional video' : '{n} × {len} video', { n: count('videos', 'reels', 'فيديو', 'فيديوهات') || 1, len }).replace(/\s+/g, ' ');
    needs = type === 'Video Production' ? ['Location', 'Talent', 'Camera', 'Lighting', 'Sound', 'Editing', 'Music licensing'] : ['Footage transfer', 'Editing', 'Color grade', 'Music licensing', 'Subtitles'];
  } else if (has(s, 'logo', 'شعار', 'لوغو', 'لوجو')) { type = 'Logo Design'; deliverable = t('1 × logo with final files'); needs = ['Brand questionnaire', 'Concept sketches', 'Vector artwork']; }
  else if (has(s, 'brand', 'identity', 'هوية', 'علامة')) { type = 'Brand Identity'; deliverable = t('Logo suite, color palette, typography, brand guidelines'); needs = ['Discovery session', 'Moodboards', 'Guidelines document']; }
  else if (has(s, 'photo', 'shoot', 'headshot', 'صور', 'تصوير فوتوغرافي', 'جلسة تصوير')) { type = 'Photography'; deliverable = t('{n} × edited photos', { n: count('photos', 'صورة', 'صور') || 20 }); needs = ['Location', 'Lighting', 'Styling/props', 'Retouching']; }
  else if (has(s, 'post', 'social', 'instagram', 'content', 'منشور', 'محتوى', 'انستغرام', 'انستقرام', 'سوشيال')) { type = 'Social Media Package'; deliverable = t('{n} × social posts', { n: count('posts', 'منشور', 'منشورات') || 12 }); needs = ['Content calendar', 'Copywriting', 'Design templates']; }
  else if (has(s, 'campaign', 'launch', 'حملة', 'إطلاق', 'اطلاق')) { type = 'Marketing Campaign'; deliverable = t('Campaign concept, key visual and social adaptations'); needs = ['Strategy', 'Creative concept', 'Production', 'Media plan (not included by default)']; }
  const objective = has(s, 'launch', 'opening', 'new', 'افتتاح', 'إطلاق', 'اطلاق', 'جديد') ? 'Launch awareness' : has(s, 'sale', 'sell', 'order', 'book', 'مبيعات', 'بيع', 'حجز', 'طلبات') ? 'Drive sales / conversions' : has(s, 'hire', 'recruit', 'توظيف') ? 'Recruitment' : 'Brand awareness';
  const platforms = [has(s, 'instagram', 'reel', 'ig', 'انستغرام', 'انستقرام', 'ريلز') && 'Instagram', has(s, 'tiktok', 'تيك توك', 'تيكتوك') && 'TikTok', has(s, 'youtube', 'يوتيوب') && 'YouTube', has(s, 'linkedin', 'لينكد') && 'LinkedIn', has(s, 'website', 'web', 'موقع') && 'Website'].filter(Boolean);
  const tone = has(s, 'luxury', 'premium', 'high-end', 'elegant', 'فاخر', 'راق', 'راقي', 'فخم') ? 'Premium / Elegant' : has(s, 'fun', 'playful', 'مرح') ? 'Playful / Energetic' : has(s, 'corporate', 'professional', 'مؤسسي', 'احترافي') ? 'Professional / Clear' : 'Premium / Modern';
  const audience = has(s, 'restaurant', 'cafe', 'food', 'مطعم', 'مقهى', 'كافيه', 'طعام', 'أكل') ? 'Local diners, food lovers 20–45' : has(s, 'b2b', 'business', 'saas', 'tech', 'شركات', 'تقنية') ? 'Business decision makers' : has(s, 'student', 'young', 'طلاب', 'شباب') ? 'Young adults 18–30' : 'To confirm with client';
  return {
    type, objective: t(objective), audience: t(audience), deliverablesText: deliverable, platforms: (platforms.length ? platforms : ['Instagram', 'TikTok']).map((x) => t(x)).join(t(', ')), tone: t(tone),
    productionNeeds: needs.map((x) => t(x)).join(t(', ')),
    notes: t('Original request: "{text}"\nQuestions to confirm: deadline, budget, brand assets, usage rights.', { text: text.trim().slice(0, 400) }),
  };
}

function localScope(ctx) {
  const risks = [];
  const d = ctx.deliverables || [];
  const ex = ctx.exclusions || [];
  if (!d.length) risks.push(t('No deliverables are listed. Anything could be argued to be in scope.'));
  d.filter((x) => /video|reel|film|فيديو|ريل/i.test(x.title) && !/\d+\s*s|\d+\s*sec|minute|ثانية|دقيقة|\(\d/i.test(x.title)).forEach((x) => risks.push(t('"{title}" has no duration. State the length (e.g. 30s).', { title: x.title })));
  d.filter((x) => /photo|صور/i.test(x.title) && x.quantity <= 1).forEach((x) => risks.push(t('"{title}" has no clear quantity of photos.', { title: x.title })));
  if (!ex.some((x) => /revision|تعديل/i.test(x))) risks.push(t('Additional revisions are not listed as excluded.'));
  if (!ex.some((x) => /talent|location|travel|موقع|ممثل|سفر|مواهب/i.test(x)) && /video|photo/i.test(ctx.type || '')) risks.push(t('Talent, location and travel costs are not addressed.'));
  if (!ex.some((x) => /advert|media|paid|إعلان|اعلان|ممول/i.test(x)) && /social|campaign|content/i.test(ctx.type || '')) risks.push(t('Paid advertising / media spend is not excluded.'));
  if ((ctx.revisions ?? 2) > 3) risks.push(t('{n} revision rounds is generous — consider 2 and selling more via change orders.', { n: ctx.revisions }));
  if (!ctx.deadline) risks.push(t('No deadline is set, so timeline expectations are open-ended.'));
  if (!ctx.depositPercent) risks.push(t('No deposit is required. Work could start without any payment commitment.'));
  if (ctx.briefNotes && /asap|urgent|quick|عاجل|بسرعة|مستعجل/i.test(ctx.briefNotes)) risks.push(t('The brief mentions urgency — confirm a rush fee or a realistic date.'));
  return risks.length ? risks.map((r) => `• ${r}`).join('\n') : `• ${t('No obvious scope risks found. Deliverables, exclusions, revisions and deposit are all defined.')}`;
}

function localFollowup(ctx, text) {
  return t("Hi {name},\n\nI hope you're well. I wanted to follow up on {topic}. Whenever you have a moment, let me know if you have any questions — happy to walk you through anything.\n\nIf now isn't the right time, no problem at all; just tell me when suits you better.\n\nBest regards,\n{sender}", {
    name: ctx.clientName || t('there'), topic: ctx.waitingOn || text || t('our project'), sender: ctx.senderName || '',
  }).trim();
}

function localFeedback(ctx, text) {
  const items = (ctx.feedback || []).map((f) => f.comment);
  if (text) items.push(...text.split('\n').filter(Boolean));
  if (!items.length) return t('There is no feedback to summarize yet.');
  const groups = { 'Visuals & shots': [], 'Text & copy': [], 'Audio & music': [], 'Color & style': [], 'Timing & pacing': [], Other: [] };
  items.forEach((c) => {
    const s = c.toLowerCase();
    const g = has(s, 'text', 'copy', 'title', 'font', 'typo', 'spell', 'logo', 'نص', 'خط', 'عنوان', 'شعار', 'إملاء', 'كتابة') ? 'Text & copy'
      : has(s, 'music', 'audio', 'sound', 'voice', 'موسيقى', 'صوت') ? 'Audio & music'
      : has(s, 'color', 'colour', 'bright', 'dark', 'grade', 'style', 'لون', 'ألوان', 'إضاءة', 'فاتح', 'غامق') ? 'Color & style'
      : has(s, 'fast', 'slow', 'long', 'short', 'cut', 'pace', 'timing', 'سريع', 'بطيء', 'طويل', 'قصير', 'مدة', 'توقيت') ? 'Timing & pacing'
      : has(s, 'shot', 'image', 'photo', 'scene', 'replace', 'crop', 'لقطة', 'صورة', 'مشهد', 'استبدال') ? 'Visuals & shots' : 'Other';
    groups[g].push(c);
  });
  const out = [t('{n} comment(s) in total.', { n: items.length })];
  Object.entries(groups).forEach(([g, cs]) => { if (cs.length) out.push(`\n${t(g)} (${cs.length})\n${cs.map((c) => `• ${c}`).join('\n')}`); });
  return out.join('\n');
}

function localCaseStudy(ctx) {
  return [
    `${ctx.name}`,
    `${t('Client')}: ${ctx.clientName || '—'} · ${ctx.type ? t(ctx.type) : ''}`,
    `\n${t('Challenge')}\n${ctx.objective || t('Describe the problem the client came to you with.')}`,
    `\n${t('Approach')}\n${ctx.revisionsUsed != null ? t('We started with a structured brief, agreed a clear scope, and delivered through {n} revision round(s).', { n: ctx.revisionsUsed }) : t('We started with a structured brief and agreed a clear scope.')} ${t('[Describe your creative process and key decisions.]')}`,
    `\n${t('Deliverables')}\n${(ctx.deliverables || []).map((d) => `• ${d.quantity} × ${d.title}`).join('\n') || '—'}`,
    `\n${t('Results')}\n${t('[Add measurable outcomes: reach, engagement, sales, client quote.]')}`,
  ].join('\n');
}

function localHealth(ctx) {
  const out = [];
  if (ctx.nextAction) out.push(`${t('Next step')}: ${ctx.nextAction.label} — ${ctx.nextAction.detail || ''}`);
  (ctx.signals || []).forEach((s) => out.push(`• ${s}`));
  if (!ctx.signals?.length) out.push(`• ${t('Nothing appears to be blocking this project right now.')}`);
  return out.join('\n');
}

function localProposal(ctx) {
  const objective = String(ctx.objective || t('to deliver high-quality creative work on time')).replace(/\.$/, '');
  const list = (ctx.deliverables || []).map((d) => `${d.quantity} × ${d.title}`).join(t(', ')) || t('the deliverables listed below');
  return t('Thank you for considering me for {name}. Based on the brief, the goal is: {objective}.\n\nThis proposal covers {list}, with {n} revision round(s) included. Anything outside this scope will be quoted separately before any work begins, so there are no surprises.', { name: ctx.name, objective: lang() === 'ar' ? objective : objective.charAt(0).toLowerCase() + objective.slice(1), list, n: ctx.revisions ?? 2 });
}

const local = {
  async run(task, { text, ctx = {} }) {
    switch (task) {
      case 'brief': if (!text?.trim()) throw new UserError(t('Paste the client message first.')); return { kind: 'brief', data: localBrief(text) };
      case 'scope': return { kind: 'text', text: localScope(ctx) };
      case 'followup': return { kind: 'text', text: localFollowup(ctx, text) };
      case 'feedback': return { kind: 'text', text: localFeedback(ctx, text) };
      case 'caseStudy': return { kind: 'text', text: localCaseStudy(ctx) };
      case 'health': return { kind: 'text', text: localHealth(ctx) };
      case 'proposal': return { kind: 'text', text: localProposal(ctx) };
      default: throw new UserError(t('Unknown assistant task.'));
    }
  },
};

// ---------------- Claude provider (bring your own key) ----------------
const SYSTEM = 'You are the assistant inside Scopewise, a business tool for creative freelancers. You draft suggestions the freelancer reviews before using. Be concise, professional and specific. Never claim to have sent, approved, charged or signed anything. Do not invent facts that are not in the provided context; mark unknowns as questions to confirm.';
const PROMPTS = {
  brief: 'Turn this client message into a structured project brief. Respond with only a JSON object with string fields: type (one of, in English exactly: Logo Design, Brand Identity, Social Media Package, Video Production, Video Editing, Photography, Content Creation, Marketing Campaign, Motion Graphics, Other), objective, audience, deliverablesText (one deliverable per line), platforms, tone, productionNeeds, notes (include questions to confirm).',
  proposal: 'Write a short, confident proposal introduction (2 short paragraphs) for this project. Mention the scope boundary. Plain text only.',
  scope: 'List the concrete scope risks in this project (ambiguous deliverables, missing exclusions, revision exposure, timeline, payment). Bullet points with "• ", each with a one-line fix. Plain text.',
  followup: 'Write a short, polite follow-up message to the client. Warm but professional, no pressure. Plain text.',
  feedback: "Summarize the client's feedback into grouped, actionable changes with a short priority note. Plain text with bullets.",
  caseStudy: 'Turn this completed project into a portfolio case study with sections: Challenge, Approach, Deliverables, Results. Use placeholders in [brackets] for facts not provided. Plain text.',
  health: 'Identify what is delaying this project and the single most useful next step. Short bullets. Plain text.',
};

let sdkPromise = null;
const claude = {
  async run(task, { text, ctx = {} }) {
    const apiKey = aiConfig.getKey();
    if (!apiKey) throw new UserError(t('Add your Anthropic API key in Settings → AI to use Claude.'));
    sdkPromise ||= import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm');
    let Anthropic;
    try { ({ default: Anthropic } = await sdkPromise); } catch { sdkPromise = null; throw new UserError(t('Could not load the AI client. Check your connection and try again.')); }
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const language = lang() === 'ar' ? '\n\nWrite all text values in Modern Standard Arabic.' : '';
    const content = `${PROMPTS[task]}${language}\n\nContext (JSON):\n${JSON.stringify(ctx, null, 2)}${text ? `\n\nFreelancer input:\n${text}` : ''}`;
    let msg;
    try {
      msg = await client.beta.messages.create({
        model: CLAUDE_MODEL, max_tokens: 16000, system: SYSTEM,
        thinking: { type: 'adaptive' }, output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        messages: [{ role: 'user', content }],
      });
    } catch (e) {
      console.error(e);
      if (e?.status === 401) throw new UserError(t('Your Anthropic API key was rejected. Check it in Settings → AI.'));
      if (e?.status === 429) throw new UserError(t('The AI service is busy. Please try again in a moment.'));
      throw new UserError(t('The AI request did not complete. Please try again.'));
    }
    if (msg.stop_reason === 'refusal') throw new UserError(t('The AI declined this request. Try rephrasing it.'));
    const out = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (task === 'brief') {
      const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
      try { return { kind: 'brief', data: JSON.parse(json) }; } catch { return { kind: 'text', text: out }; }
    }
    return { kind: 'text', text: out };
  },
};

export async function runAI(task, input) {
  const provider = aiConfig.provider() === 'anthropic' ? claude : local;
  const result = await provider.run(task, input);
  return { ...result, provider: aiConfig.provider() };
}
