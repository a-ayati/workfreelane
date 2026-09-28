// AI assistant. Two providers behind one interface:
//  - "local": deterministic, rule-based helpers that run in the browser.
//  - "anthropic": Claude via the user's own API key (stored only on this device).
// The assistant only ever returns suggestions. Nothing is sent, applied,
// charged or approved without the user reviewing and confirming it.
import { UserError } from './util.js';

const KEY_STORE = 'sw.ai.anthropicKey';
export const CLAUDE_MODEL = 'claude-opus-5';

export const aiConfig = {
  getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } },
  setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE); } catch { throw new UserError('Your browser blocked local storage, so the key cannot be saved.'); } },
  provider() { return aiConfig.getKey() ? 'anthropic' : 'local'; },
};

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
const has = (t, ...words) => words.some((w) => t.includes(w));
function localBrief(text) {
  const t = text.toLowerCase();
  const secs = t.match(/(\d+)\s*(-|\s)?\s*(second|sec|s\b)/);
  const mins = t.match(/(\d+)\s*(-|\s)?\s*(minute|min)/);
  const count = (w) => { const m = t.match(new RegExp(`(\\d+)\\s+${w}`)); return m ? Number(m[1]) : null; };
  let type = 'Other', deliverable = '', needs = [];
  if (has(t, 'video', 'reel', 'film', 'commercial', 'tiktok', 'ad ')) {
    type = has(t, 'edit', 'footage') && !has(t, 'shoot', 'film') ? 'Video Editing' : 'Video Production';
    const len = secs ? `${secs[1]}-second` : mins ? `${mins[1]}-minute` : '';
    deliverable = `${count('videos') || count('reels') || 1} × ${len ? len + ' ' : ''}${has(t, 'promo', 'commercial', 'ad') ? 'promotional ' : ''}video`;
    needs = type === 'Video Production' ? ['Location', 'Talent', 'Camera', 'Lighting', 'Sound', 'Editing', 'Music licensing'] : ['Footage transfer', 'Editing', 'Color grade', 'Music licensing', 'Subtitles'];
  } else if (has(t, 'logo')) { type = 'Logo Design'; deliverable = '1 × logo with final files'; needs = ['Brand questionnaire', 'Concept sketches', 'Vector artwork']; }
  else if (has(t, 'brand', 'identity')) { type = 'Brand Identity'; deliverable = 'Logo suite, color palette, typography, brand guidelines'; needs = ['Discovery session', 'Moodboards', 'Guidelines document']; }
  else if (has(t, 'photo', 'shoot', 'headshot')) { type = 'Photography'; deliverable = `${count('photos') || 20} × edited photos`; needs = ['Location', 'Lighting', 'Styling/props', 'Retouching']; }
  else if (has(t, 'post', 'social', 'instagram', 'content')) { type = 'Social Media Package'; deliverable = `${count('posts') || 12} × social posts`; needs = ['Content calendar', 'Copywriting', 'Design templates']; }
  else if (has(t, 'campaign', 'launch')) { type = 'Marketing Campaign'; deliverable = 'Campaign concept, key visual and social adaptations'; needs = ['Strategy', 'Creative concept', 'Production', 'Media plan (not included by default)']; }
  const objective = has(t, 'launch', 'opening', 'new') ? 'Launch awareness' : has(t, 'sale', 'sell', 'order', 'book') ? 'Drive sales / conversions' : has(t, 'hire', 'recruit') ? 'Recruitment' : 'Brand awareness';
  const platforms = [has(t, 'instagram', 'reel', 'ig') && 'Instagram', has(t, 'tiktok') && 'TikTok', has(t, 'youtube') && 'YouTube', has(t, 'linkedin') && 'LinkedIn', has(t, 'website', 'web') && 'Website'].filter(Boolean);
  const tone = has(t, 'luxury', 'premium', 'high-end', 'elegant') ? 'Premium / Elegant' : has(t, 'fun', 'playful') ? 'Playful / Energetic' : has(t, 'corporate', 'professional') ? 'Professional / Clear' : 'Premium / Modern';
  const audience = has(t, 'restaurant', 'cafe', 'food') ? 'Local diners, food lovers 20–45' : has(t, 'b2b', 'business', 'saas', 'tech') ? 'Business decision makers' : has(t, 'student', 'young') ? 'Young adults 18–30' : 'To confirm with client';
  return {
    type, objective, audience, deliverablesText: deliverable, platforms: (platforms.length ? platforms : ['Instagram', 'TikTok']).join(', '), tone,
    productionNeeds: needs.join(', '), notes: `Original request: "${text.trim().slice(0, 400)}"\nQuestions to confirm: deadline, budget, brand assets, usage rights.`,
  };
}

function localScope(ctx) {
  const risks = [];
  const d = ctx.deliverables || [];
  const ex = ctx.exclusions || [];
  if (!d.length) risks.push('No deliverables are listed. Anything could be argued to be in scope.');
  d.filter((x) => /video|reel|film/i.test(x.title) && !/\d+\s*s|\d+\s*sec|minute|\(\d/i.test(x.title)).forEach((x) => risks.push(`"${x.title}" has no duration. State the length (e.g. 30s).`));
  d.filter((x) => /photo/i.test(x.title) && x.quantity <= 1).forEach((x) => risks.push(`"${x.title}" has no clear quantity of photos.`));
  if (!ex.some((x) => /revision/i.test(x))) risks.push('Additional revisions are not listed as excluded.');
  if (!ex.some((x) => /talent|location|travel/i.test(x)) && /video|photo/i.test(ctx.type || '')) risks.push('Talent, location and travel costs are not addressed.');
  if (!ex.some((x) => /advert|media|paid/i.test(x)) && /social|campaign|content/i.test(ctx.type || '')) risks.push('Paid advertising / media spend is not excluded.');
  if ((ctx.revisions ?? 2) > 3) risks.push(`${ctx.revisions} revision rounds is generous — consider 2 and selling more via change orders.`);
  if (!ctx.deadline) risks.push('No deadline is set, so timeline expectations are open-ended.');
  if (!ctx.depositPercent) risks.push('No deposit is required. Work could start without any payment commitment.');
  if (ctx.briefNotes && /asap|urgent|quick/i.test(ctx.briefNotes)) risks.push('The brief mentions urgency — confirm a rush fee or a realistic date.');
  return risks.length ? risks.map((r) => `• ${r}`).join('\n') : '• No obvious scope risks found. Deliverables, exclusions, revisions and deposit are all defined.';
}

function localFollowup(ctx, text) {
  const name = ctx.clientName || 'there';
  const topic = ctx.waitingOn || text || 'our project';
  return `Hi ${name},\n\nI hope you're well. I wanted to follow up on ${topic}. Whenever you have a moment, let me know if you have any questions — happy to walk you through anything.\n\nIf now isn't the right time, no problem at all; just tell me when suits you better.\n\nBest regards,\n${ctx.senderName || ''}`.trim();
}

function localFeedback(ctx, text) {
  const items = (ctx.feedback || []).map((f) => f.comment);
  if (text) items.push(...text.split('\n').filter(Boolean));
  if (!items.length) return 'There is no feedback to summarize yet.';
  const groups = { 'Visuals & shots': [], 'Text & copy': [], 'Audio & music': [], 'Color & style': [], 'Timing & pacing': [], Other: [] };
  items.forEach((c) => {
    const t = c.toLowerCase();
    const g = has(t, 'text', 'copy', 'title', 'font', 'typo', 'spell', 'logo') ? 'Text & copy' : has(t, 'music', 'audio', 'sound', 'voice') ? 'Audio & music' : has(t, 'color', 'colour', 'bright', 'dark', 'grade', 'style') ? 'Color & style' : has(t, 'fast', 'slow', 'long', 'short', 'cut', 'pace', 'timing') ? 'Timing & pacing' : has(t, 'shot', 'image', 'photo', 'scene', 'replace', 'crop') ? 'Visuals & shots' : 'Other';
    groups[g].push(c);
  });
  const out = [`${items.length} comment(s) in total.`];
  Object.entries(groups).forEach(([g, cs]) => { if (cs.length) out.push(`\n${g} (${cs.length})\n${cs.map((c) => `• ${c}`).join('\n')}`); });
  return out.join('\n');
}

function localCaseStudy(ctx) {
  return [
    `${ctx.name}`,
    `Client: ${ctx.clientName || '—'} · ${ctx.type || ''}`,
    `\nChallenge\n${ctx.objective || 'Describe the problem the client came to you with.'}`,
    `\nApproach\nWe started with a structured brief, agreed a clear scope${ctx.revisionsUsed != null ? `, and delivered through ${ctx.revisionsUsed} revision round(s)` : ''}. [Describe your creative process and key decisions.]`,
    `\nDeliverables\n${(ctx.deliverables || []).map((d) => `• ${d.quantity} × ${d.title}`).join('\n') || '—'}`,
    `\nResults\n[Add measurable outcomes: reach, engagement, sales, client quote.]`,
  ].join('\n');
}

function localHealth(ctx) {
  const out = [];
  if (ctx.nextAction) out.push(`Next step: ${ctx.nextAction.label} — ${ctx.nextAction.detail || ''}`);
  (ctx.signals || []).forEach((s) => out.push(`• ${s}`));
  if (!ctx.signals?.length) out.push('• Nothing appears to be blocking this project right now.');
  return out.join('\n');
}

function localProposal(ctx) {
  return `Thank you for considering me for ${ctx.name}. Based on the brief, the goal is ${String(ctx.objective || 'to deliver high-quality creative work on time').replace(/\.$/, '').toLowerCase()}.\n\nThis proposal covers ${(ctx.deliverables || []).map((d) => `${d.quantity} × ${d.title}`).join(', ') || 'the deliverables listed below'}, with ${ctx.revisions ?? 2} revision round(s) included. Anything outside this scope will be quoted separately before any work begins, so there are no surprises.`;
}

const local = {
  async run(task, { text, ctx = {} }) {
    switch (task) {
      case 'brief': if (!text?.trim()) throw new UserError('Paste the client message first.'); return { kind: 'brief', data: localBrief(text) };
      case 'scope': return { kind: 'text', text: localScope(ctx) };
      case 'followup': return { kind: 'text', text: localFollowup(ctx, text) };
      case 'feedback': return { kind: 'text', text: localFeedback(ctx, text) };
      case 'caseStudy': return { kind: 'text', text: localCaseStudy(ctx) };
      case 'health': return { kind: 'text', text: localHealth(ctx) };
      case 'proposal': return { kind: 'text', text: localProposal(ctx) };
      default: throw new UserError('Unknown assistant task.');
    }
  },
};

// ---------------- Claude provider (bring your own key) ----------------
const SYSTEM = 'You are the assistant inside Scopewise, a business tool for creative freelancers. You draft suggestions the freelancer reviews before using. Be concise, professional and specific. Never claim to have sent, approved, charged or signed anything. Do not invent facts that are not in the provided context; mark unknowns as questions to confirm.';
const PROMPTS = {
  brief: 'Turn this client message into a structured project brief. Respond with only a JSON object with string fields: type (one of: Logo Design, Brand Identity, Social Media Package, Video Production, Video Editing, Photography, Content Creation, Marketing Campaign, Motion Graphics, Other), objective, audience, deliverablesText (one deliverable per line), platforms, tone, productionNeeds, notes (include questions to confirm).',
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
    if (!apiKey) throw new UserError('Add your Anthropic API key in Settings → AI to use Claude.');
    sdkPromise ||= import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm');
    let Anthropic;
    try { ({ default: Anthropic } = await sdkPromise); } catch { sdkPromise = null; throw new UserError('Could not load the AI client. Check your connection and try again.'); }
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const content = `${PROMPTS[task]}\n\nContext (JSON):\n${JSON.stringify(ctx, null, 2)}${text ? `\n\nFreelancer input:\n${text}` : ''}`;
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
      if (e?.status === 401) throw new UserError('Your Anthropic API key was rejected. Check it in Settings → AI.');
      if (e?.status === 429) throw new UserError('The AI service is busy. Please try again in a moment.');
      throw new UserError('The AI request did not complete. Please try again.');
    }
    if (msg.stop_reason === 'refusal') throw new UserError('The AI declined this request. Try rephrasing it.');
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
