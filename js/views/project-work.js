// Project workspace: files, feedback, revisions, approvals.
import { html, raw, icon, href, pill, empty, field, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog, parseHash } from '../ui.js';
import { db } from '../core/store.js';
import { fmtDateTime, fmtShortDate, fmtRelative, fmtBytes, fmtTimecode, UserError } from '../core/util.js';
import { runAI } from '../core/ai.js';
import { getProject, financials } from '../services/core.js';
import { listFiles, uploadFile, renameFile, moveFile, deleteFile, markFinal, sendForReview, listFeedback, setFeedbackStatus, addFeedback, listRounds, startRound, logRevisionRequest, listApprovals, requestApproval, withdrawApproval, deliverFinal, latestVersion, deliveryLocked } from '../services/delivery.js';
import { FOLDERS, ROUND_STATUSES } from '../services/constants.js';
import { thumb, openViewer, download } from './viewer.js';

const APPROVAL_STATUSES = { pending: { label: 'Awaiting client', tone: 'amber' }, approved: { label: 'Approved', tone: 'green' }, changes_requested: { label: 'Changes requested', tone: 'red' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };

// ---------------- Files ----------------
export function filesTab(p) {
  const q = parseHash().query;
  const folder = FOLDERS.some((f) => f.id === q.folder) ? q.folder : '';
  const all = listFiles(p.id);
  const files = folder ? all.filter((f) => f.folder === folder) : all;
  const canDeliver = p.status === 'approved';
  const deliverables = all.filter((f) => f.folder === 'deliverables');
  return html`
    ${canDeliver ? html`<div class="notice ${p.deliveredAt ? 'notice-ok' : 'notice-warn'}" style="margin-bottom:16px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
      <span>${p.deliveredAt ? html`✓ Final files delivered ${fmtShortDate(p.deliveredAt)}.${deliveryLocked(p) ? ' Downloads unlock for the client once the balance is paid.' : ''}` : html`Final version approved. Upload the final files to <b>06 Deliverables</b>, then deliver them. (${deliverables.length} file(s) ready)`}</span>
      <button class="btn btn-primary btn-sm" data-action="deliver" data-id="${p.id}">${p.deliveredAt ? 'Deliver again' : 'Deliver final files'}</button></div>` : ''}
    <nav class="folders" aria-label="Folders">
      ${FOLDERS.map((f) => html`<a class="folder${folder === f.id ? ' active' : ''}" href="${href(`/projects/${p.id}/files?folder=${folder === f.id ? '' : f.id}`)}"><b>${f.label}</b><span>${all.filter((x) => x.folder === f.id).length} files</span></a>`)}
    </nav>
    <form class="card" data-form="files-upload" style="margin-bottom:16px">
      <input type="hidden" name="id" value="${p.id}">
      <div class="form-grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;align-items:end">
        <label class="field"><span>Upload files</span><input type="file" name="files" multiple></label>
        ${field({ label: 'Folder', name: 'folder', type: 'select', value: folder || (['active', 'in_review', 'revision_requested'].includes(p.status) ? 'drafts' : p.status === 'approved' ? 'deliverables' : 'brief'), options: FOLDERS.map((f) => [f.id, f.label]) })}
        <button class="btn btn-primary" type="submit">${icon('upload', 16)} Upload</button>
      </div>
      <div class="upload-progress" style="margin-top:12px" hidden><span></span></div>
      <p class="small muted" data-upload-status style="margin:8px 0 0">Up to 250 MB per file. Files are stored on this device.</p>
    </form>
    ${files.length ? html`<div class="list">${files.map((f) => fileRow(p, f))}</div>`
      : empty({ title: folder ? 'This folder is empty' : 'No files yet', body: 'Upload drafts, references and final files. Each upload of the same file becomes a new version (v01, v02, Final).' })}`;
}

function fileRow(p, f) {
  const v = f.latest;
  const inClientView = ['review', 'final', 'deliverables', 'brand', 'brief'].includes(f.folder) && (f.folder !== 'review' || f.sharedAt);
  const fb = db.count('feedback', (x) => x.fileId === f.id && x.status === 'open');
  return html`<div class="file-row">
    ${v ? thumb(v) : html`<div class="file-thumb">—</div>`}
    <div style="min-width:0">
      <div class="cell-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
      <div class="cell-sub">${FOLDERS.find((x) => x.id === f.folder)?.label} · ${v ? `${fmtBytes(v.size)} · ${fmtRelative(v.createdAt)}` : ''}${f.uploadedBy === 'client' ? ' · from client' : ''}${inClientView ? ' · visible to client' : ''}${fb ? ` · ${fb} open comment${fb > 1 ? 's' : ''}` : ''}</div>
      <div class="versions">${f.versions.map((x) => html`<button class="ver${x.isFinal ? ' final' : ''}" data-action="file-view" data-id="${x.id}" aria-label="Open ${f.name} ${x.label}">${x.label}</button>`)}</div>
    </div>
    <div class="btn-row" style="justify-content:flex-end">
      ${['active', 'in_review', 'revision_requested'].includes(p.status) && ['drafts', 'review'].includes(f.folder) ? html`<button class="btn btn-secondary btn-sm" data-action="file-review" data-id="${f.id}">Send for review</button>` : ''}
      <button class="icon-btn" data-action="file-view" data-id="${v?.id}" aria-label="Preview">${icon('eye', 16)}</button>
      <button class="icon-btn" data-action="file-download" data-id="${v?.id}" aria-label="Download">${icon('download', 16)}</button>
      <button class="icon-btn" data-action="file-menu" data-id="${f.id}" aria-label="More actions for ${f.name}">${icon('more', 16)}</button>
    </div>
  </div>`;
}

function fileMenuModal(fileId) {
  const f = db.get('files', fileId);
  const p = db.get('projects', f.projectId);
  const v = latestVersion(fileId);
  return html`${modalHead(f.name, `${v?.label || ''} · ${FOLDERS.find((x) => x.id === f.folder)?.label}`)}
    <form class="form-stack" data-form="file-rename"><input type="hidden" name="id" value="${f.id}">
      <div class="btn-row" style="align-items:flex-end;flex-wrap:nowrap">${field({ label: 'Rename', name: 'name', value: f.name, required: true })}<button class="btn btn-secondary" type="submit">Save</button></div></form>
    <form class="form-stack" data-form="file-move" style="margin-top:14px"><input type="hidden" name="id" value="${f.id}">
      <div class="btn-row" style="align-items:flex-end;flex-wrap:nowrap">${field({ label: 'Move to folder', name: 'folder', type: 'select', value: f.folder, options: FOLDERS.map((x) => [x.id, x.label]) })}<button class="btn btn-secondary" type="submit">Move</button></div></form>
    <form class="form-stack" data-form="file-version" style="margin-top:14px"><input type="hidden" name="id" value="${f.id}"><input type="hidden" name="projectId" value="${p.id}">
      <label class="field"><span>Upload a new version (${`v${String((f.versions?.length || db.count('fileVersions', (x) => x.fileId === f.id)) + 1).padStart(2, '0')}`})</span><input type="file" name="files"></label>
      ${v?.isFinal ? html`<label class="check"><input type="checkbox" name="confirmFinal" data-bool> The latest version is <b>Final</b>. I want to add a new version on top of it.</label>` : ''}
      <div class="upload-progress" hidden><span></span></div>
      <div><button class="btn btn-secondary" type="submit">${icon('upload', 16)} Upload version</button></div></form>
    <div class="divider"></div>
    <div class="btn-row">
      ${v && !v.isFinal ? html`<button class="btn btn-secondary btn-sm" data-action="file-final" data-id="${v.id}">Mark ${v.label} as Final</button>` : ''}
      ${['active', 'in_review', 'revision_requested'].includes(p.status) && v ? html`<button class="btn btn-secondary btn-sm" data-action="approval-new" data-id="${p.id}" data-version="${v.id}">Request final approval</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto" data-action="file-delete" data-id="${f.id}">${icon('trash', 14)} Delete file</button>
    </div>`;
}

async function uploadWithProgress(form, projectId, fileList, opts) {
  const bar = form.querySelector('.upload-progress');
  const status = form.querySelector('[data-upload-status]');
  if (!fileList?.length) throw new UserError('Choose a file to upload.');
  bar.hidden = false;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (status) status.textContent = `Uploading ${file.name} (${i + 1} of ${fileList.length})…`;
    await uploadFile(projectId, { ...opts, file, onProgress: (x) => { bar.firstElementChild.style.width = `${Math.round(x * 100)}%`; } });
  }
}

// ---------------- Feedback ----------------
export function feedbackTab(p) {
  const q = parseHash().query;
  const show = q.show || 'open';
  const all = listFeedback(p.id);
  const items = all.filter((f) => show === 'all' || f.status === show);
  const byVersion = new Map();
  items.forEach((f) => { const k = f.fileVersionId || 'general'; if (!byVersion.has(k)) byVersion.set(k, []); byVersion.get(k).push(f); });
  return html`<div class="btn-row" style="justify-content:space-between;margin-bottom:16px">
      <nav class="filters" style="margin:0">${[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']].map(([id, l]) => html`<a href="${href(`/projects/${p.id}/feedback?show=${id}`)}" class="${show === id ? 'active' : ''}">${l} (${id === 'all' ? all.length : all.filter((x) => x.status === id).length})</a>`)}</nav>
      <span class="btn-row"><button class="btn btn-secondary btn-sm" data-action="feedback-summary" data-id="${p.id}">${icon('sparkles', 14)} Summarize</button><button class="btn btn-secondary btn-sm" data-action="feedback-note" data-id="${p.id}">${icon('plus', 14)} Add note</button></span></div>
    ${items.length ? [...byVersion.entries()].map(([vid, list]) => {
      const v = vid !== 'general' ? db.get('fileVersions', vid) : null;
      const f = v ? db.get('files', v.fileId) : null;
      return html`<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>${f ? `${f.name} · ${v.label}` : 'General comments'}</h3>${v ? html`<button class="btn btn-ghost btn-sm" data-action="file-view" data-id="${v.id}">${icon('eye', 14)} Open viewer</button>` : ''}</div>
        <div class="stack" style="gap:8px">${list.map((c) => html`<div class="comment${c.status === 'resolved' ? ' resolved' : ''}"><div class="comment-meta"><span><b>${c.authorName}</b> · ${fmtDateTime(c.createdAt)}${c.revisionRoundId ? ` · revision ${db.get('revisionRounds', c.revisionRoundId)?.number}` : ''}</span>
          <span>${c.timecode != null ? html`<span class="tc">${fmtTimecode(c.timecode)}</span>` : ''}${c.pinX != null ? html`<span class="tc">pinned</span>` : ''}${c.reference ? html`<span class="tc">${c.reference}</span>` : ''}</span></div>
          <div>${c.comment}</div><div class="btn-row" style="justify-content:space-between;margin-top:6px"><span class="small muted">${c.status === 'open' ? 'Open' : 'Resolved'}</span><button class="link-btn small" data-action="fb-status" data-id="${c.id}" data-status="${c.status === 'open' ? 'resolved' : 'open'}">${c.status === 'open' ? 'Mark resolved' : 'Reopen'}</button></div></div>`)}</div></div>`;
    }) : empty({ title: show === 'open' ? 'No open feedback' : 'No feedback', body: 'When the client comments on a shared version — with timestamps on video or pins on images — it appears here.' })}`;
}

// ---------------- Revisions ----------------
export function revisionsTab(p) {
  const rounds = listRounds(p.id);
  const used = rounds.length;
  const open = rounds.find((r) => r.status !== 'delivered');
  return html`<div class="grid-main">
    <div class="stack">
      ${rounds.length ? html`<div class="list">${[...rounds].reverse().map((r) => {
        const fbCount = db.count('feedback', (f) => f.revisionRoundId === r.id);
        const co = r.changeOrderId ? db.get('changeOrders', r.changeOrderId) : null;
        return html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto">
          <div><div class="cell-title">Revision ${r.number} / ${p.revisionsIncluded}${r.isExtra ? html` <span class="pill pill-red"><span class="dot"></span>Additional revision</span>` : ''}</div>
            <div class="small" style="margin:4px 0">${r.summary || 'No summary'}</div>
            <div class="cell-sub">Requested by ${r.requestedBy} · ${fmtDateTime(r.requestedAt)} · ${fbCount} linked comment(s)${r.deliveredAt ? ` · delivered ${fmtShortDate(r.deliveredAt)}` : ''}${co ? ` · change order ${co.status}` : ''}</div>
            ${r.isExtra && !r.changeOrderId ? html`<div class="notice notice-warn small" style="margin-top:8px">This round is beyond the included allowance. Create a change order before starting — nothing is charged automatically. <a href="${href(`/projects/${p.id}/scope`)}">Create change order</a></div>` : ''}</div>
          <div class="btn-row">${pill(ROUND_STATUSES, r.status)}${r.status === 'requested' ? html`<button class="btn btn-secondary btn-sm" data-action="round-start" data-id="${r.id}">Start work</button>` : ''}${r.status !== 'delivered' ? html`<a class="btn btn-primary btn-sm" href="${href(`/projects/${p.id}/files?folder=drafts`)}">Upload revision</a>` : ''}</div>
        </div>`;
      })}</div>` : empty({ title: 'No revisions yet', body: 'When the client requests changes after a review, a revision round is created and counted against the allowance.' })}
    </div>
    <aside class="stack">
      <div class="card"><div class="muted small">Revision rounds</div><div class="big-figure">${used} / ${p.revisionsIncluded}</div>
        <p class="small muted" style="margin:6px 0 0">${used > p.revisionsIncluded ? 'Allowance exceeded — additional rounds should be covered by change orders.' : `${p.revisionsIncluded - used} included round(s) remaining.`}</p></div>
      ${!open && ['in_review', 'awaiting_approval', 'active'].includes(p.status) ? html`<form class="card form-stack" data-form="round-log"><input type="hidden" name="id" value="${p.id}">
        <h2>Log a revision request</h2><p class="small muted" style="margin:0">Client asked by email or phone? Record it here so it counts.</p>
        <textarea name="summary" rows="3" aria-label="What should change" placeholder="What should change?" required></textarea>
        <button class="btn btn-secondary" type="submit">Create revision round</button></form>` : ''}
    </aside>
  </div>`;
}

// ---------------- Approvals ----------------
export function approvalsTab(p) {
  const list = listApprovals(p.id);
  const canRequest = ['active', 'in_review', 'revision_requested'].includes(p.status) && !list.some((a) => a.status === 'pending');
  const files = listFiles(p.id).filter((f) => f.latest && ['review', 'final', 'drafts'].includes(f.folder));
  return html`${canRequest ? html`<form class="card form-grid" data-form="approval-create" style="margin-bottom:20px"><input type="hidden" name="id" value="${p.id}">
      <div class="full"><h2>Request final approval</h2><p class="small muted" style="margin:4px 0 0">The client sees “Final Approval Required” with Approve and Request Changes.</p></div>
      ${files.length ? html`${field({ label: 'Version to approve', name: 'fileVersionId', type: 'select', options: files.flatMap((f) => f.versions.slice().reverse().map((v) => [v.id, `${f.name} · ${v.label}`])), full: true })}
        ${field({ label: 'Message (optional)', name: 'message', type: 'textarea', rows: 2, full: true, value: 'This version is ready for final approval.' })}
        <div class="form-actions full"><button class="btn btn-primary" type="submit">Send for approval</button></div>`
        : html`<p class="full muted">Upload a version in Files first.</p>`}</form>` : ''}
    ${list.length ? html`<div class="stack">${list.map((a) => html`<div class="card"><div class="card-head"><h3>${a.fileName} · ${a.versionLabel}</h3>${pill(APPROVAL_STATUSES, a.status)}</div>
      ${a.status === 'approved' ? html`<div class="notice notice-ok"><b>✓ Approved</b><dl class="kv" style="margin-top:8px"><dt>Client</dt><dd>${a.clientName}</dd><dt>Date & time</dt><dd>${fmtDateTime(a.respondedAt)}</dd><dt>Version</dt><dd>${a.fileName} ${a.versionLabel}</dd>${a.note ? html`<dt>Note</dt><dd>${a.note}</dd>` : ''}</dl><p class="small" style="margin:8px 0 0">This approval is a permanent part of the project record.</p></div>`
        : a.status === 'changes_requested' ? html`<p><b>${a.clientName}</b> requested changes ${fmtRelative(a.respondedAt)}:</p><p class="prose muted">${a.note}</p>`
        : a.status === 'pending' ? html`<p class="muted">Sent ${fmtDateTime(a.requestedAt)}. Waiting for the client.</p><button class="btn btn-ghost btn-sm" data-action="approval-withdraw" data-id="${a.id}">Withdraw request</button>`
        : html`<p class="muted">Withdrawn.</p>`}
      <button class="btn btn-ghost btn-sm" data-action="file-view" data-id="${a.fileVersionId}">${icon('eye', 14)} View version</button></div>`)}</div>`
      : !canRequest ? empty({ title: 'No approvals yet', body: p.status === 'draft' || p.status === 'awaiting_deposit' ? 'Final approval can be requested once work has started.' : 'Approval requests will appear here.' }) : ''}`;
}

// ---------------- Handlers ----------------
onAction({
  'file-view': (el) => { if (el.dataset.id) openViewer(el.dataset.id); return false; },
  'file-download': async (el) => { if (el.dataset.id) await download(el.dataset.id); return false; },
  'file-menu': (el) => { openModal(fileMenuModal(el.dataset.id)); return false; },
  'file-final': async (el) => {
    if (!(await confirmDialog({ title: 'Mark as Final?', body: 'This version will be labelled Final. Future uploads to this file will ask for confirmation first.', confirm: 'Mark as Final' }))) return false;
    markFinal(el.dataset.id); toast('Marked as Final.');
  },
  'file-review': async (el) => { sendForReview(el.dataset.id); toast('Shared with the client for review.'); },
  'file-delete': async (el) => {
    closeModal();
    const f = db.get('files', el.dataset.id);
    const hasFinal = db.find('fileVersions', (v) => v.fileId === f.id && v.isFinal);
    if (!(await confirmDialog({ title: `Delete ${f.name}?`, body: `All versions are permanently deleted.${hasFinal ? ' This file includes a Final version.' : ''}`, confirm: 'Delete', tone: 'danger', requireText: hasFinal ? 'DELETE' : '' }))) return false;
    await deleteFile(f.id, { confirmFinal: true }); toast('File deleted.');
  },
  'fb-status': (el) => { setFeedbackStatus(el.dataset.id, el.dataset.status); },
  'feedback-note': (el) => {
    openModal(html`${modalHead('Add a note', 'General comment on the project, visible to the client in the portal feedback.')}<form class="form-stack" data-form="feedback-note"><input type="hidden" name="id" value="${el.dataset.id}"><textarea name="comment" rows="4" required aria-label="Comment"></textarea><div class="form-actions"><button class="btn btn-primary" type="submit">Add</button></div></form>`);
    return false;
  },
  'feedback-summary': async (el) => {
    const p = getProject(el.dataset.id);
    const r = await runAI('feedback', { ctx: { project: p.name, feedback: listFeedback(p.id).filter((f) => f.status === 'open').map((f) => ({ comment: f.comment, at: f.timecode != null ? fmtTimecode(f.timecode) : f.reference || '' })) } });
    openModal(html`${modalHead('Feedback summary', `Suggested by the ${r.provider === 'anthropic' ? 'Claude' : 'local'} assistant — review before using.`)}<textarea class="ai-out" rows="14" aria-label="Summary">${r.text}</textarea><div class="modal-actions"><button class="btn btn-secondary" data-action="copy-ai">Copy</button><button class="btn btn-primary" data-action="modal-close">Done</button></div>`, { size: 'lg' });
    return false;
  },
  'copy-ai': async () => { const t = document.querySelector('.modal textarea')?.value || ''; try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { toast('Select the text and copy it.'); } return false; },
  'round-start': (el) => {
    const r = db.get('revisionRounds', el.dataset.id);
    if (r.isExtra && !r.changeOrderId) toast('Heads up: this round is beyond the allowance and has no approved change order.', 'error');
    startRound(el.dataset.id);
  },
  'approval-new': (el) => { closeModal(); go(`/projects/${el.dataset.id}/approvals`); return false; },
  'approval-withdraw': async (el) => { if (await confirmDialog({ title: 'Withdraw approval request?', body: 'The client will no longer see it.', confirm: 'Withdraw' })) withdrawApproval(el.dataset.id); },
  deliver: async (el) => {
    const p = getProject(el.dataset.id);
    if (!(await confirmDialog({ title: 'Deliver final files?', body: `Files in 06 Deliverables become downloadable for the client${p.lockDeliveryUntilPaid && financials(p).balance > 0 ? ' once the balance is paid' : ''}. A final invoice is drafted for any remaining balance.`, confirm: 'Deliver' }))) return false;
    const inv = deliverFinal(p.id);
    toast(inv ? `Delivered. Final invoice ${inv.number} is ready to send.` : 'Final files delivered.');
  },
});

onForm({
  'files-upload': async (v, form) => {
    await uploadWithProgress(form, v.id, v.files, { folder: v.folder });
    toast(v.files.length > 1 ? `${v.files.length} files uploaded.` : 'File uploaded.');
  },
  'file-version': async (v, form) => {
    await uploadWithProgress(form, v.projectId, v.files, { fileId: v.id, confirmFinalOverwrite: !!v.confirmFinal });
    closeModal(); toast('New version uploaded.');
  },
  'file-rename': (v) => { renameFile(v.id, v.name); closeModal(); toast('Renamed.'); },
  'file-move': (v) => { moveFile(v.id, v.folder); closeModal(); toast('Moved.'); },
  'feedback-note': (v) => { addFeedback(v.id, { comment: v.comment }); closeModal(); },
  'round-log': (v) => { logRevisionRequest(v.id, v.summary); toast('Revision round created.'); },
  'approval-create': (v) => { requestApproval(v.id, v); toast('Sent to the client for final approval.'); },
});
