// File preview + feedback viewer shared by the freelancer app and the client portal.
// Supports timestamped comments on video/audio and pinned comments on images.
import { html, raw, icon, openModal, closeModal, refreshModal, modalHead, onAction, onForm, toast, rerender } from '../ui.js';
import { db } from '../core/store.js';
import { fmtTimecode, fmtRelative, fmtBytes, humanError } from '../core/util.js';
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

// ---------------- Viewer modal ----------------
let vs = null; // viewer state

export function openViewer(versionId, ctx = {}) {
  vs = { versionId, ctx, pin: null, url: null, error: null };
  openModal(renderViewer, { size: 'lg' });
  urlFor(versionId, ctx).then((u) => { if (vs?.versionId === versionId) { vs.url = u; refreshModal(); } }).catch((e) => { if (vs) { vs.error = humanError(e); refreshModal(); } });
}

function renderViewer() {
  const v = db.get('fileVersions', vs.versionId);
  if (!v) return html`${modalHead('File')}<p>This file is no longer available.</p>`;
  const f = db.get('files', v.fileId);
  const kind = fileKind(v);
  const isClient = !!vs.ctx.token;
  const comments = listFeedback(f.projectId, { versionId: v.id }).filter((c) => !isClient || c.authorType === 'client' || c.authorType === 'freelancer');
  const versions = versionsOf(f.id);
  const pins = comments.filter((c) => c.pinX != null);
  let media;
  if (vs.error) media = html`<div class="stage-empty">${vs.error}</div>`;
  else if (!vs.url) media = html`<div class="stage-empty">Loading…</div>`;
  else if (kind === 'video') media = html`<video id="viewer-media" src="${vs.url}" controls playsinline></video>`;
  else if (kind === 'audio') media = html`<div style="padding:40px;width:100%"><audio id="viewer-media" src="${vs.url}" controls style="width:100%"></audio></div>`;
  else if (kind === 'image') media = html`<div style="position:relative;display:inline-block"><img id="viewer-media" src="${vs.url}" alt="${f.name}" data-action="viewer-pin">
      <div class="pin-layer" style="pointer-events:none">${pins.map((c, i) => html`<span class="pin" style="left:${c.pinX}%;top:${c.pinY}%" title="${c.comment}">${i + 1}</span>`)}${vs.pin ? html`<span class="pin pending" style="left:${vs.pin.x}%;top:${vs.pin.y}%">+</span>` : ''}</div></div>`;
  else if (kind === 'pdf') media = html`<iframe src="${vs.url}" title="${f.name}" style="width:100%;height:65vh;border:0;background:#fff"></iframe>`;
  else media = html`<div class="stage-empty">No preview for this file type.<br><br><button class="btn btn-secondary btn-sm" data-action="viewer-download">Download to view</button></div>`;

  const hint = kind === 'video' || kind === 'audio' ? 'Your comment is pinned to the current playback time.' : kind === 'image' ? 'Click the image to pin your comment to a spot.' : 'Add a page, section or frame reference if helpful.';
  return html`${modalHead(`${f.name} · ${v.label}`, `${fmtBytes(v.size)} · uploaded ${fmtRelative(v.createdAt)} by ${v.uploaderName}`)}
    <div class="versions" style="margin:-8px 0 14px">${versions.map((x) => html`<button class="ver${x.isFinal ? ' final' : ''}" data-action="viewer-version" data-id="${x.id}"${x.id === v.id ? raw(' aria-current="true" style="outline:2px solid var(--ink)"') : ''}>${x.label}</button>`)}</div>
    <div class="viewer">
      <div class="stage${kind === 'image' ? ' pinnable' : ''}">${media}</div>
      <div>
        <div class="comments" aria-label="Comments">${comments.length ? comments.map((c, i) => html`<div class="comment${c.status === 'resolved' ? ' resolved' : ''}">
            <div class="comment-meta"><span><b>${c.authorName}</b> · ${fmtRelative(c.createdAt)}</span>
              <span>${c.timecode != null ? html`<button class="tc" data-action="viewer-seek" data-t="${c.timecode}">${fmtTimecode(c.timecode)}</button>` : ''}${c.pinX != null ? html`<span class="tc">#${pins.indexOf(c) + 1}</span>` : ''}${c.reference ? html`<span class="tc">${c.reference}</span>` : ''}</span></div>
            <div>${c.comment}</div>
            ${!isClient ? html`<button class="link-btn small" data-action="viewer-resolve" data-id="${c.id}" data-status="${c.status === 'open' ? 'resolved' : 'open'}">${c.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>` : c.status === 'resolved' ? html`<span class="small muted">Resolved</span>` : ''}
          </div>`) : html`<p class="muted small">No comments on this version yet.</p>`}</div>
        <form class="form-stack" data-form="viewer-comment" style="gap:8px;margin-top:12px">
          ${isClient ? html`<input name="name" placeholder="Your name" aria-label="Your name" value="${vs.ctx.name || ''}" required>` : ''}
          <textarea name="comment" rows="3" placeholder="${kind === 'video' ? 'e.g. Please replace this shot.' : 'Add a comment…'}" aria-label="Comment" required></textarea>
          ${kind !== 'video' && kind !== 'audio' && kind !== 'image' ? html`<input name="reference" placeholder="Page / section / frame (optional)" aria-label="Reference">` : ''}
          <small class="muted">${hint}${vs.pin ? ' Pin placed.' : ''}</small>
          <div class="btn-row"><button class="btn btn-primary btn-sm" type="submit">Add comment</button><button type="button" class="btn btn-ghost btn-sm" data-action="viewer-download">${icon('download', 14)} Download</button></div>
        </form>
      </div>
    </div>`;
}

onAction({
  'viewer-version': (el) => { openViewer(el.dataset.id, vs.ctx); return false; },
  'viewer-seek': (el) => { const m = document.getElementById('viewer-media'); if (m) { m.currentTime = Number(el.dataset.t); m.play?.(); } return false; },
  'viewer-pin': (el, ev) => {
    const r = el.getBoundingClientRect();
    vs.pin = { x: Math.round(((ev.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((ev.clientY - r.top) / r.height) * 1000) / 10 };
    const draft = document.querySelector('.modal textarea[name=comment]')?.value;
    refreshModal();
    const ta = document.querySelector('.modal textarea[name=comment]'); if (ta) { ta.value = draft || ''; ta.focus(); }
    return false;
  },
  'viewer-resolve': (el) => { setFeedbackStatus(el.dataset.id, el.dataset.status); refreshModal(); rerender(); return false; },
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
    const t = m?.currentTime;
    refreshModal(); rerender();
    const m2 = document.getElementById('viewer-media');
    if (m2 && t) m2.addEventListener('loadedmetadata', () => { m2.currentTime = t; }, { once: true });
    toast('Comment added.');
    return false;
  },
});

export const closeViewer = () => { vs = null; closeModal(); };
