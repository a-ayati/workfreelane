// File preview + feedback viewer shared by the freelancer app and the client portal.
// Supports timestamped comments on video/audio and pinned comments on images.
import { html, raw, icon, avatar, openModal, closeModal, refreshModal, modalHead, onAction, onForm, toast, rerender } from '../ui.js';
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { fmtTimecode, fmtRelative, fmtDateTime, fmtBytes, humanError } from '../core/util.js';
import { blobURLFor, fileKind, versionsOf, listFeedback, addFeedback, portalAddFeedback, setFeedbackStatus, portalDownloaded } from '../services/delivery.js';

const urlCache = new Map();
export async function urlFor(versionId, ctx = {}) {
  const key = `${versionId}:${ctx.token || ''}`;
  if (!urlCache.has(key)) urlCache.set(key, blobURLFor(versionId, ctx).catch((e) => { urlCache.delete(key); throw e; }));
  return urlCache.get(key);
}

// Fill <img|video data-blob="versionId" data-pid data-t> once the page is rendered.
export function hydrateBlobs(root = document) {
  root.querySelectorAll('[data-blob]:not([data-hydrated])').forEach(async (el) => {
    el.dataset.hydrated = '1';
    try {
      const url = await urlFor(el.dataset.blob, { projectId: el.dataset.pid, token: el.dataset.t });
      if (el.tagName === 'A') el.href = url; else el.src = url;
    } catch { /* thumbnail missing: leave placeholder */ }
  });
}

export function thumb(v, ctx = {}) {
  const kind = fileKind(v);
  const attrs = raw(`data-blob="${v.id}"${ctx.token ? ` data-pid="${ctx.projectId}" data-t="${ctx.token}"` : ''}`);
  if (kind === 'image') return html`<div class="file-thumb"><img alt="" ${attrs} loading="lazy"></div>`;
  if (kind === 'video') return html`<div class="file-thumb"><video muted preload="metadata" ${attrs}></video></div>`;
  const ext = (v.originalName.split('.').pop() || 'file').slice(0, 4);
  return html`<div class="file-thumb">${ext}</div>`;
}

export async function download(versionId, ctx = {}) {
  const v = db.get('fileVersions', versionId);
  const f = db.get('files', v.fileId);
  const url = await urlFor(versionId, ctx);
  const a = document.createElement('a');
  const ext = v.originalName.includes('.') ? '.' + v.originalName.split('.').pop() : '';
  a.href = url; a.download = `${f.name}_${v.label}${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  if (ctx.token) portalDownloaded(ctx.projectId, ctx.token, versionId);
}

export const verLabel = (v) => (v?.isFinal ? t('Final') : v?.label || '');

// ---------------- Conversation ----------------
// Feedback reads as threads: avatars, timestamps, replies and a resolved state.
function bubble(c, { isClient, seek, pinNo, reply }) {
  const mine = isClient ? c.authorType === 'client' : c.authorType === 'freelancer';
  const round = !reply && c.revisionRoundId ? db.get('revisionRounds', c.revisionRoundId) : null;
  return html`<div class="bubble-row${reply ? ' reply' : ''}">${avatar(c.authorName, null, 28)}<div class="bubble${mine ? ' mine' : ''}">
    <div class="meta"><b>${c.authorName}</b><time datetime="${c.createdAt}" title="${fmtDateTime(c.createdAt)}">${fmtRelative(c.createdAt)}</time>
      ${c.timecode != null ? seek ? html`<button class="tc" dir="ltr" data-action="viewer-seek" data-t="${c.timecode}" aria-label="${t('Jump to {at}', { at: fmtTimecode(c.timecode) })}">${fmtTimecode(c.timecode)}</button>` : html`<span class="tc" dir="ltr">${fmtTimecode(c.timecode)}</span>` : ''}
      ${pinNo > 0 ? html`<span class="tc">#${pinNo}</span>` : c.pinX != null ? html`<span class="tc">${t('pinned')}</span>` : ''}${c.reference ? html`<span class="tc">${c.reference}</span>` : ''}
      ${round ? html`<span>${t('revision {n}', { n: round.number })}</span>` : ''}</div>
    <div class="prose" dir="auto">${c.comment}</div></div></div>`;
}

export function conversation(list, { isClient = false, ctx = {}, seek = false, pins = [], canReply = true } = {}) {
  const roots = list.filter((c) => !c.parentId);
  return html`${roots.map((c) => {
    const resolved = c.status === 'resolved';
    const replies = list.filter((r) => r.parentId === c.id);
    return html`<div class="thread${resolved ? ' resolved' : ''}">
      ${bubble(c, { isClient, seek, pinNo: pins.indexOf(c) + 1 })}
      ${replies.map((r) => bubble(r, { isClient, reply: true }))}
      <div class="thread-actions">
        ${resolved ? html`<span class="resolved-mark">${icon('check', 13)} ${t('Resolved')}</span>` : ''}
        ${canReply && !resolved ? html`<details class="reply-toggle"><summary class="link-btn">${t('Reply')}</summary>
          <form class="reply-form" data-form="fb-reply"><input type="hidden" name="parentId" value="${c.id}"><input type="hidden" name="pid" value="${c.projectId}">
            ${isClient ? html`<input type="hidden" name="t" value="${ctx.token}">${ctx.name ? html`<input type="hidden" name="name" value="${ctx.name}">` : html`<input name="name" placeholder="${t('Your name')}" aria-label="${t('Your name')}" required>`}` : ''}
            <input name="comment" placeholder="${t('Write a reply…')}" aria-label="${t('Reply to {name}', { name: c.authorName })}" autocomplete="off" required>
            <button class="btn btn-primary btn-sm" type="submit">${t('Send')}</button></form></details>` : ''}
        ${!isClient ? html`<button class="link-btn" data-action="fb-status" data-id="${c.id}" data-status="${resolved ? 'open' : 'resolved'}">${resolved ? t('Reopen') : t('Mark resolved')}</button>` : ''}
      </div></div>`;
  })}`;
}

// ---------------- Immersive viewer ----------------
let vs = null; // viewer state

export function openViewer(versionId, ctx = {}) {
  vs = { versionId, ctx, pin: null, url: null, error: null, zoom: 1 };
  if (document.querySelector('#modal-root .modal.viewer-modal')) refreshModal();
  else openModal(renderViewer, { size: 'lg viewer-modal' });
  urlFor(versionId, ctx).then((u) => { if (vs?.versionId === versionId) { vs.url = u; refreshModal(); } }).catch((e) => { if (vs?.versionId === versionId) { vs.error = humanError(e); refreshModal(); } });
}

function neighbours(v) {
  const list = versionsOf(v.fileId);
  const i = list.findIndex((x) => x.id === v.id);
  return { prev: list[i - 1] || null, next: list[i + 1] || null, list };
}

function renderViewer() {
  const v = vs && db.get('fileVersions', vs.versionId);
  if (!v) return html`${modalHead(t('File'))}<p>${t('This file is no longer available.')}</p>`;
  const f = db.get('files', v.fileId);
  const kind = fileKind(v);
  const isClient = !!vs.ctx.token;
  const comments = listFeedback(f.projectId, { versionId: v.id });
  const { prev, next, list: versions } = neighbours(v);
  const pins = comments.filter((c) => c.pinX != null && !c.parentId);
  const z = vs.zoom;
  let media;
  if (vs.error) media = html`<div class="stage-empty">${vs.error}</div>`;
  else if (!vs.url) media = html`<div class="stage-empty" role="status" aria-label="${t('Loading…')}"><div class="skel"></div></div>`;
  else if (kind === 'video') media = html`<video id="viewer-media" src="${vs.url}" controls playsinline></video>`;
  else if (kind === 'audio') media = html`<div style="padding:40px;width:100%"><audio id="viewer-media" src="${vs.url}" controls style="width:100%"></audio></div>`;
  else if (kind === 'image') media = html`<div class="zoom-wrap"${z > 1 ? raw(` style="width:${z * 100}%"`) : ''}><img id="viewer-media" src="${vs.url}" alt="${f.name}" data-action="viewer-pin">
      <div class="pin-layer" style="pointer-events:none">${pins.map((c, i) => html`<span class="pin" style="left:${c.pinX}%;top:${c.pinY}%" title="${c.comment}">${i + 1}</span>`)}${vs.pin ? html`<span class="pin pending" style="left:${vs.pin.x}%;top:${vs.pin.y}%">+</span>` : ''}</div></div>`;
  else if (kind === 'pdf') media = html`<iframe src="${vs.url}" title="${f.name}" style="width:100%;height:65vh;border:0;background:#fff"></iframe>`;
  else media = html`<div class="stage-empty">${t('No preview for this file type.')}<br><br><button class="btn btn-secondary btn-sm" data-action="viewer-download">${t('Download to view')}</button></div>`;

  const hint = t(kind === 'video' || kind === 'audio' ? 'Your comment is pinned to the current playback time.' : kind === 'image' ? 'Click the image to pin your comment to a spot.' : 'Add a page, section or frame reference if helpful.');
  const open = comments.filter((c) => !c.parentId && c.status === 'open').length;
  return html`${modalHead(`${f.name} · ${verLabel(v)}`, t('{size} · uploaded {when} by {name}', { size: fmtBytes(v.size), when: fmtRelative(v.createdAt), name: v.uploaderName }))}
    <div class="versions" style="margin:-8px 0 14px" role="group" aria-label="${t('Versions')}">${versions.map((x) => html`<button class="ver${x.isFinal ? ' final' : ''}" data-action="viewer-version" data-id="${x.id}"${x.id === v.id ? raw(' aria-current="true"') : ''}>${verLabel(x)}</button>`)}</div>
    <div class="viewer">
      <div class="stage${kind === 'image' ? ' pinnable' : ''}${z > 1 ? ' zoomed' : ''}" data-swipe-versions>
        ${media}
        ${prev ? html`<button class="stage-nav-btn prev" data-action="viewer-version" data-id="${prev.id}" aria-label="${t('Previous version ({version})', { version: verLabel(prev) })}">${icon('back', 18)}</button>` : ''}
        ${next ? html`<button class="stage-nav-btn next" data-action="viewer-version" data-id="${next.id}" aria-label="${t('Next version ({version})', { version: verLabel(next) })}">${icon('arrow', 18)}</button>` : ''}
        ${kind === 'image' && vs.url ? html`<div class="stage-controls" role="group" aria-label="${t('Zoom')}">
          <button data-action="viewer-zoom" data-z="-1" aria-label="${t('Zoom out')}"${z <= 1 ? raw(' disabled') : ''}>−</button>
          <button data-action="viewer-zoom" data-z="0" aria-label="${t('Fit to screen')}">${Math.round(z * 100)}%</button>
          <button data-action="viewer-zoom" data-z="1" aria-label="${t('Zoom in')}"${z >= 3 ? raw(' disabled') : ''}>+</button></div>` : ''}
      </div>
      <div>
        <div class="card-head" style="margin-bottom:8px"><h3>${t('Comments')}</h3><span class="small muted">${t('{n} open', { n: open })}</span></div>
        <div class="comments" aria-label="${t('Comments')}">${comments.length ? conversation(comments, { isClient, ctx: vs.ctx, seek: true, pins }) : html`<p class="muted small">${t('No comments on this version yet.')}</p>`}</div>
        <form class="form-stack" data-form="viewer-comment" style="gap:8px;margin-top:12px">
          ${isClient ? html`<input name="name" placeholder="${t('Your name')}" aria-label="${t('Your name')}" value="${vs.ctx.name || ''}" required>` : ''}
          <textarea name="comment" rows="3" placeholder="${kind === 'video' ? t('e.g. Please replace this shot.') : t('Add a comment…')}" aria-label="${t('Comment')}" required></textarea>
          ${kind !== 'video' && kind !== 'audio' && kind !== 'image' ? html`<input name="reference" placeholder="${t('Page / section / frame (optional)')}" aria-label="${t('Reference')}">` : ''}
          <small class="muted">${hint}${vs.pin ? ` ${t('Pin placed.')}` : ''}</small>
          <div class="btn-row"><button class="btn btn-primary btn-sm" type="submit">${t('Add comment')}</button><button type="button" class="btn btn-ghost btn-sm" data-action="viewer-download">${icon('download', 14)} ${t('Download')}</button></div>
        </form>
      </div>
    </div>`;
}

// Keep a half-written comment when the viewer re-renders.
function refreshKeepingDraft() {
  const draft = document.querySelector('.modal textarea[name=comment]')?.value;
  refreshModal();
  const ta = document.querySelector('.modal textarea[name=comment]'); if (ta && draft) ta.value = draft;
  return ta;
}

function stepVersion(dir) {
  const v = vs && db.get('fileVersions', vs.versionId);
  if (!v) return;
  const n = neighbours(v)[dir < 0 ? 'prev' : 'next'];
  if (n) openViewer(n.id, vs.ctx);
}

onAction({
  'viewer-version': (el) => { openViewer(el.dataset.id, vs.ctx); return false; },
  'viewer-seek': (el) => { const m = document.getElementById('viewer-media'); if (m) { m.currentTime = Number(el.dataset.t); m.play?.(); } return false; },
  'viewer-pin': (el, ev) => {
    const r = el.getBoundingClientRect();
    vs.pin = { x: Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10 };
    refreshKeepingDraft()?.focus({ preventScroll: true });
    return false;
  },
  'viewer-zoom': (el) => {
    const d = Number(el.dataset.z);
    const steps = [1, 1.5, 2, 3];
    const i = steps.indexOf(vs.zoom);
    vs.zoom = d === 0 ? 1 : steps[Math.max(0, Math.min(steps.length - 1, i + d))];
    refreshKeepingDraft();
    return false;
  },
  'fb-status': (el) => { setFeedbackStatus(el.dataset.id, el.dataset.status); if (vs && document.querySelector('.viewer-modal')) refreshKeepingDraft(); },
  'viewer-download': async () => { await download(vs.versionId, vs.ctx); return false; },
});
onForm({
  'viewer-comment': (v) => {
    const m = document.getElementById('viewer-media');
    const kind = fileKind(db.get('fileVersions', vs.versionId));
    const data = { ...v, fileVersionId: vs.versionId, timecode: (kind === 'video' || kind === 'audio') && m ? m.currentTime : null, pinX: vs.pin?.x ?? null, pinY: vs.pin?.y ?? null };
    const f = db.get('files', db.get('fileVersions', vs.versionId).fileId);
    if (vs.ctx.token) { portalAddFeedback(vs.ctx.projectId, vs.ctx.token, data); vs.ctx.name = v.name; } else addFeedback(f.projectId, data);
    vs.pin = null;
    const at = m?.currentTime;
    refreshModal(); rerender();
    const m2 = document.getElementById('viewer-media');
    if (m2 && at) m2.addEventListener('loadedmetadata', () => { m2.currentTime = at; }, { once: true });
    toast(t('Comment added.'));
    return false;
  },
  'fb-reply': (v) => {
    if (v.t) {
      portalAddFeedback(v.pid, v.t, { parentId: v.parentId, comment: v.comment, name: v.name });
      try { if (v.name) localStorage.setItem(`sw.portal.name.${v.pid}`, v.name.trim()); } catch { /* ignore */ }
      if (vs) vs.ctx.name = v.name;
    } else addFeedback(v.pid, { parentId: v.parentId, comment: v.comment });
    if (vs && document.querySelector('.viewer-modal')) refreshKeepingDraft();
  },
});

// Swipe the preview sideways to move between versions (the arrow buttons do the same).
let sw = null;
document.addEventListener('pointerdown', (e) => {
  const stage = e.target.closest('[data-swipe-versions]');
  if (!stage || e.pointerType === 'mouse' || !vs || vs.zoom > 1 || e.target.closest('video, audio, iframe, button')) { sw = null; return; }
  sw = { x: e.clientX, y: e.clientY, stage };
});
document.addEventListener('pointerup', (e) => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  sw = null;
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
  const rtl = document.documentElement.dir === 'rtl';
  e.target.closest('[data-swipe-versions]')?.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { once: true, capture: true });
  stepVersion((dx < 0) !== rtl ? 1 : -1);
});
// Arrow keys step through versions while the viewer is open.
document.addEventListener('keydown', (e) => {
  if (!vs || !document.querySelector('.viewer-modal') || e.target.closest('input, textarea, select, video, audio')) return;
  const rtl = document.documentElement.dir === 'rtl';
  if (e.key === 'ArrowRight') { e.preventDefault(); stepVersion(rtl ? -1 : 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepVersion(rtl ? 1 : -1); }
});

export const closeViewer = () => { vs = null; closeModal(); };
