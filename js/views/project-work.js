// Project workspace: files, feedback, revisions, approvals.
import { html, raw, icon, href, pill, empty, field, onAction, onForm, go, toast, openModal, closeModal, modalHead, confirmDialog, parseHash } from '../ui.js';
import { db } from '../core/store.js';
import { t } from '../core/i18n.js';
import { fmtDateTime, fmtShortDate, fmtRelative, fmtBytes, fmtTimecode, UserError } from '../core/util.js';
import { runAI } from '../core/ai.js';
import { getProject, financials } from '../services/core.js';
import { listFiles, uploadFile, renameFile, moveFile, deleteFile, markFinal, sendForReview, listFeedback, setFeedbackStatus, addFeedback, listRounds, startRound, logRevisionRequest, listApprovals, requestApproval, withdrawApproval, deliverFinal, latestVersion, deliveryLocked } from '../services/delivery.js';
import { FOLDERS, ROUND_STATUSES } from '../services/constants.js';
import { thumb, openViewer, download, verLabel } from './viewer.js';

export const APPROVAL_STATUSES = { pending: { label: 'Awaiting client', tone: 'amber' }, approved: { label: 'Approved', tone: 'green' }, changes_requested: { label: 'Changes requested', tone: 'red' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } };
export const folderName = (id) => t(FOLDERS.find((f) => f.id === id)?.label || id);
const folderOptions = () => FOLDERS.map((f) => [f.id, t(f.label)]);

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
      <span>${p.deliveredAt ? html`${t('✓ Final files delivered {date}.', { date: fmtShortDate(p.deliveredAt) })}${deliveryLocked(p) ? ` ${t('Downloads unlock for the client once the balance is paid.')}` : ''}` : t('Final version approved. Upload the final files to 06 Deliverables, then deliver them. ({n} file(s) ready)', { n: deliverables.length })}</span>
      <button class="btn btn-primary btn-sm" data-action="deliver" data-id="${p.id}">${p.deliveredAt ? t('Deliver again') : t('Deliver final files')}</button></div>` : ''}
    <nav class="folders" aria-label="${t('Folders')}">
      ${FOLDERS.map((f) => html`<a class="folder${folder === f.id ? ' active' : ''}" href="${href(`/projects/${p.id}/files?folder=${folder === f.id ? '' : f.id}`)}"><b>${t(f.label)}</b><span>${t('{n} files', { n: all.filter((x) => x.folder === f.id).length })}</span></a>`)}
    </nav>
    <form class="card" data-form="files-upload" style="margin-bottom:16px">
      <input type="hidden" name="id" value="${p.id}">
      <div class="form-grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) auto;align-items:end">
        <label class="field"><span>${t('Upload files')}</span><input type="file" name="files" multiple></label>
        ${field({ label: t('Folder'), name: 'folder', type: 'select', value: folder || (['active', 'in_review', 'revision_requested'].includes(p.status) ? 'drafts' : p.status === 'approved' ? 'deliverables' : 'brief'), options: folderOptions() })}
        <button class="btn btn-primary" type="submit">${icon('upload', 16)} ${t('Upload')}</button>
      </div>
      <div class="upload-progress" style="margin-top:12px" hidden><span></span></div>
      <p class="small muted" data-upload-status style="margin:8px 0 0">${t('Up to 250 MB per file. Files are stored on this device.')}</p>
    </form>
    ${files.length ? html`<div class="list">${files.map((f) => fileRow(p, f))}</div>`
      : empty({ title: folder ? t('This folder is empty') : t('No files yet'), body: t('Upload drafts, references and final files. Each upload of the same file becomes a new version (v01, v02, Final).') })}`;
}

function fileRow(p, f) {
  const v = f.latest;
  const inClientView = ['review', 'final', 'deliverables', 'brand', 'brief'].includes(f.folder) && (f.folder !== 'review' || f.sharedAt);
  const fb = db.count('feedback', (x) => x.fileId === f.id && x.status === 'open');
  const meta = [folderName(f.folder), v ? `${fmtBytes(v.size)} · ${fmtRelative(v.createdAt)}` : '', f.uploadedBy === 'client' ? t('from client') : '', inClientView ? t('visible to client') : '', fb ? t(fb === 1 ? '1 open comment' : '{n} open comments', { n: fb }) : ''].filter(Boolean).join(' · ');
  return html`<div class="file-row">
    ${v ? thumb(v) : html`<div class="file-thumb">—</div>`}
    <div style="min-width:0">
      <div class="cell-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
      <div class="cell-sub">${meta}</div>
      <div class="versions">${f.versions.map((x) => html`<button class="ver${x.isFinal ? ' final' : ''}" data-action="file-view" data-id="${x.id}" aria-label="${t('Open {file} {version}', { file: f.name, version: verLabel(x) })}">${verLabel(x)}</button>`)}</div>
    </div>
    <div class="btn-row" style="justify-content:flex-end">
      ${['active', 'in_review', 'revision_requested'].includes(p.status) && ['drafts', 'review'].includes(f.folder) ? html`<button class="btn btn-secondary btn-sm" data-action="file-review" data-id="${f.id}">${t('Send for review')}</button>` : ''}
      <button class="icon-btn" data-action="file-view" data-id="${v?.id}" aria-label="${t('Preview')}">${icon('eye', 16)}</button>
      <button class="icon-btn" data-action="file-download" data-id="${v?.id}" aria-label="${t('Download')}">${icon('download', 16)}</button>
      <button class="icon-btn" data-action="file-menu" data-id="${f.id}" aria-label="${t('More actions for {file}', { file: f.name })}">${icon('more', 16)}</button>
    </div>
  </div>`;
}

function fileMenuModal(fileId) {
  const f = db.get('files', fileId);
  const p = db.get('projects', f.projectId);
  const v = latestVersion(fileId);
  const nextNum = db.count('fileVersions', (x) => x.fileId === f.id) + 1;
  return html`${modalHead(f.name, `${v ? verLabel(v) : ''} · ${folderName(f.folder)}`)}
    <form class="form-stack" data-form="file-rename"><input type="hidden" name="id" value="${f.id}">
      <div class="btn-row" style="align-items:flex-end;flex-wrap:nowrap">${field({ label: t('Rename'), name: 'name', value: f.name, required: true })}<button class="btn btn-secondary" type="submit">${t('Save')}</button></div></form>
    <form class="form-stack" data-form="file-move" style="margin-top:14px"><input type="hidden" name="id" value="${f.id}">
      <div class="btn-row" style="align-items:flex-end;flex-wrap:nowrap">${field({ label: t('Move to folder'), name: 'folder', type: 'select', value: f.folder, options: folderOptions() })}<button class="btn btn-secondary" type="submit">${t('Move')}</button></div></form>
    <form class="form-stack" data-form="file-version" style="margin-top:14px"><input type="hidden" name="id" value="${f.id}"><input type="hidden" name="projectId" value="${p.id}">
      <label class="field"><span>${t('Upload a new version ({version})', { version: `v${String(nextNum).padStart(2, '0')}` })}</span><input type="file" name="files"></label>
      ${v?.isFinal ? html`<label class="check"><input type="checkbox" name="confirmFinal" data-bool> ${t('The latest version is Final. I want to add a new version on top of it.')}</label>` : ''}
      <div class="upload-progress" hidden><span></span></div>
      <div><button class="btn btn-secondary" type="submit">${icon('upload', 16)} ${t('Upload version')}</button></div></form>
    <div class="divider"></div>
    <div class="btn-row">
      ${v && !v.isFinal ? html`<button class="btn btn-secondary btn-sm" data-action="file-final" data-id="${v.id}">${t('Mark {version} as Final', { version: verLabel(v) })}</button>` : ''}
      ${['active', 'in_review', 'revision_requested'].includes(p.status) && v ? html`<button class="btn btn-secondary btn-sm" data-action="approval-new" data-id="${p.id}" data-version="${v.id}">${t('Request final approval')}</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-inline-start:auto" data-action="file-delete" data-id="${f.id}">${icon('trash', 14)} ${t('Delete file')}</button>
    </div>`;
}

async function uploadWithProgress(form, projectId, fileList, opts) {
  const bar = form.querySelector('.upload-progress');
  const status = form.querySelector('[data-upload-status]');
  if (!fileList?.length) throw new UserError(t('Choose a file to upload.'));
  bar.hidden = false;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (status) status.textContent = t('Uploading {file} ({n} of {total})…', { file: file.name, n: i + 1, total: fileList.length });
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
      <nav class="filters" style="margin:0">${[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']].map(([id, l]) => html`<a href="${href(`/projects/${p.id}/feedback?show=${id}`)}" class="${show === id ? 'active' : ''}">${t(l)} (${id === 'all' ? all.length : all.filter((x) => x.status === id).length})</a>`)}</nav>
      <span class="btn-row"><button class="btn btn-secondary btn-sm" data-action="feedback-summary" data-id="${p.id}">${icon('sparkles', 14)} ${t('Summarize')}</button><button class="btn btn-secondary btn-sm" data-action="feedback-note" data-id="${p.id}">${icon('plus', 14)} ${t('Add note')}</button></span></div>
    ${items.length ? [...byVersion.entries()].map(([vid, list]) => {
      const v = vid !== 'general' ? db.get('fileVersions', vid) : null;
      const f = v ? db.get('files', v.fileId) : null;
      return html`<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>${f ? `${f.name} · ${verLabel(v)}` : t('General comments')}</h3>${v ? html`<button class="btn btn-ghost btn-sm" data-action="file-view" data-id="${v.id}">${icon('eye', 14)} ${t('Open viewer')}</button>` : ''}</div>
        <div class="stack" style="gap:8px">${list.map((c) => html`<div class="comment${c.status === 'resolved' ? ' resolved' : ''}"><div class="comment-meta"><span><b>${c.authorName}</b> · ${fmtDateTime(c.createdAt)}${c.revisionRoundId ? ` · ${t('revision {n}', { n: db.get('revisionRounds', c.revisionRoundId)?.number })}` : ''}</span>
          <span>${c.timecode != null ? html`<span class="tc" dir="ltr">${fmtTimecode(c.timecode)}</span>` : ''}${c.pinX != null ? html`<span class="tc">${t('pinned')}</span>` : ''}${c.reference ? html`<span class="tc">${c.reference}</span>` : ''}</span></div>
          <div>${c.comment}</div><div class="btn-row" style="justify-content:space-between;margin-top:6px"><span class="small muted">${c.status === 'open' ? t('Open') : t('Resolved')}</span><button class="link-btn small" data-action="fb-status" data-id="${c.id}" data-status="${c.status === 'open' ? 'resolved' : 'open'}">${c.status === 'open' ? t('Mark resolved') : t('Reopen')}</button></div></div>`)}</div></div>`;
    }) : empty({ title: show === 'open' ? t('No open feedback') : t('No feedback'), body: t('When the client comments on a shared version — with timestamps on video or pins on images — it appears here.') })}`;
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
        const meta = [t('Requested by {name} · {date}', { name: r.requestedBy, date: fmtDateTime(r.requestedAt) }), t('{n} linked comment(s)', { n: fbCount }), r.deliveredAt ? t('delivered {date}', { date: fmtShortDate(r.deliveredAt) }) : '', co ? t('change order {status}', { status: t(co.status === 'approved' ? 'approved' : co.status === 'declined' ? 'declined' : 'pending') }) : ''].filter(Boolean).join(' · ');
        return html`<div class="list-row" style="grid-template-columns:minmax(0,1fr) auto">
          <div><div class="cell-title">${t('Revision {n} / {max}', { n: r.number, max: p.revisionsIncluded })}${r.isExtra ? html` <span class="pill pill-red"><span class="dot"></span>${t('Additional revision')}</span>` : ''}</div>
            <div class="small" style="margin:4px 0">${r.summary || t('No summary')}${r.loggedByFreelancer ? ` ${t('(logged by freelancer)')}` : ''}</div>
            <div class="cell-sub">${meta}</div>
            ${r.isExtra && !r.changeOrderId ? html`<div class="notice notice-warn small" style="margin-top:8px">${t('This round is beyond the included allowance. Create a change order before starting — nothing is charged automatically.')} <a href="${href(`/projects/${p.id}/scope`)}">${t('Create change order')}</a></div>` : ''}</div>
          <div class="btn-row">${pill(ROUND_STATUSES, r.status)}${r.status === 'requested' ? html`<button class="btn btn-secondary btn-sm" data-action="round-start" data-id="${r.id}">${t('Start work')}</button>` : ''}${r.status !== 'delivered' ? html`<a class="btn btn-primary btn-sm" href="${href(`/projects/${p.id}/files?folder=drafts`)}">${t('Upload revision')}</a>` : ''}</div>
        </div>`;
      })}</div>` : empty({ title: t('No revisions yet'), body: t('When the client requests changes after a review, a revision round is created and counted against the allowance.') })}
    </div>
    <aside class="stack">
      <div class="card"><div class="muted small">${t('Revision rounds')}</div><div class="big-figure">${used} / ${p.revisionsIncluded}</div>
        <p class="small muted" style="margin:6px 0 0">${used > p.revisionsIncluded ? t('Allowance exceeded — additional rounds should be covered by change orders.') : t('{n} included round(s) remaining.', { n: p.revisionsIncluded - used })}</p></div>
      ${!open && ['in_review', 'awaiting_approval', 'active'].includes(p.status) ? html`<form class="card form-stack" data-form="round-log"><input type="hidden" name="id" value="${p.id}">
        <h2>${t('Log a revision request')}</h2><p class="small muted" style="margin:0">${t('Client asked by email or phone? Record it here so it counts.')}</p>
        <textarea name="summary" rows="3" aria-label="${t('What should change')}" placeholder="${t('What should change?')}" required></textarea>
        <button class="btn btn-secondary" type="submit">${t('Create revision round')}</button></form>` : ''}
    </aside>
  </div>`;
}

// ---------------- Approvals ----------------
export function approvalsTab(p) {
  const list = listApprovals(p.id);
  const canRequest = ['active', 'in_review', 'revision_requested'].includes(p.status) && !list.some((a) => a.status === 'pending');
  const files = listFiles(p.id).filter((f) => f.latest && ['review', 'final', 'drafts'].includes(f.folder));
  return html`${canRequest ? html`<form class="card form-grid" data-form="approval-create" style="margin-bottom:20px"><input type="hidden" name="id" value="${p.id}">
      <div class="full"><h2>${t('Request final approval')}</h2><p class="small muted" style="margin:4px 0 0">${t('The client sees “Final Approval Required” with Approve and Request Changes.')}</p></div>
      ${files.length ? html`${field({ label: t('Version to approve'), name: 'fileVersionId', type: 'select', options: files.flatMap((f) => f.versions.slice().reverse().map((v) => [v.id, `${f.name} · ${verLabel(v)}`])), full: true })}
        ${field({ label: t('Message (optional)'), name: 'message', type: 'textarea', rows: 2, full: true, value: t('This version is ready for final approval.') })}
        <div class="form-actions full"><button class="btn btn-primary" type="submit">${t('Send for approval')}</button></div>`
        : html`<p class="full muted">${t('Upload a version in Files first.')}</p>`}</form>` : ''}
    ${list.length ? html`<div class="stack">${list.map((a) => html`<div class="card"><div class="card-head"><h3>${a.fileName} · ${a.versionLabel === 'Final' ? t('Final') : a.versionLabel}</h3>${pill(APPROVAL_STATUSES, a.status)}</div>
      ${a.status === 'approved' ? html`<div class="notice notice-ok"><b>${t('✓ Approved')}</b><dl class="kv" style="margin-top:8px"><dt>${t('Client')}</dt><dd>${a.clientName}</dd><dt>${t('Date & time')}</dt><dd>${fmtDateTime(a.respondedAt)}</dd><dt>${t('Version')}</dt><dd>${a.fileName} ${a.versionLabel}</dd>${a.note ? html`<dt>${t('Note')}</dt><dd>${a.note}</dd>` : ''}</dl><p class="small" style="margin:8px 0 0">${t('This approval is a permanent part of the project record.')}</p></div>`
        : a.status === 'changes_requested' ? html`<p>${t('{name} requested changes {when}:', { name: a.clientName, when: fmtRelative(a.respondedAt) })}</p><p class="prose muted">${a.note}</p>`
        : a.status === 'pending' ? html`<p class="muted">${t('Sent {date}. Waiting for the client.', { date: fmtDateTime(a.requestedAt) })}</p><button class="btn btn-ghost btn-sm" data-action="approval-withdraw" data-id="${a.id}">${t('Withdraw request')}</button>`
        : html`<p class="muted">${t('Withdrawn.')}</p>`}
      <button class="btn btn-ghost btn-sm" data-action="file-view" data-id="${a.fileVersionId}">${icon('eye', 14)} ${t('View version')}</button></div>`)}</div>`
      : !canRequest ? empty({ title: t('No approvals yet'), body: p.status === 'draft' || p.status === 'awaiting_deposit' ? t('Final approval can be requested once work has started.') : t('Approval requests will appear here.') }) : ''}`;
}

// ---------------- Handlers ----------------
onAction({
  'file-view': (el) => { if (el.dataset.id) openViewer(el.dataset.id); return false; },
  'file-download': async (el) => { if (el.dataset.id) await download(el.dataset.id); return false; },
  'file-menu': (el) => { openModal(fileMenuModal(el.dataset.id)); return false; },
  'file-final': async (el) => {
    if (!(await confirmDialog({ title: t('Mark as Final?'), body: t('This version will be labelled Final. Future uploads to this file will ask for confirmation first.'), confirm: t('Mark as Final') }))) return false;
    markFinal(el.dataset.id); toast(t('Marked as Final.'));
  },
  'file-review': async (el) => { sendForReview(el.dataset.id); toast(t('Shared with the client for review.')); },
  'file-delete': async (el) => {
    closeModal();
    const f = db.get('files', el.dataset.id);
    const hasFinal = db.find('fileVersions', (v) => v.fileId === f.id && v.isFinal);
    if (!(await confirmDialog({ title: t('Delete {file}?', { file: f.name }), body: `${t('All versions are permanently deleted.')}${hasFinal ? ` ${t('This file includes a Final version.')}` : ''}`, confirm: t('Delete'), tone: 'danger', requireText: hasFinal ? 'DELETE' : '' }))) return false;
    await deleteFile(f.id, { confirmFinal: true }); toast(t('File deleted.'));
  },
  'fb-status': (el) => { setFeedbackStatus(el.dataset.id, el.dataset.status); },
  'feedback-note': (el) => {
    openModal(html`${modalHead(t('Add a note'), t('General comment on the project, visible to the client in the portal feedback.'))}<form class="form-stack" data-form="feedback-note"><input type="hidden" name="id" value="${el.dataset.id}"><textarea name="comment" rows="4" required aria-label="${t('Comment')}"></textarea><div class="form-actions"><button class="btn btn-primary" type="submit">${t('Add')}</button></div></form>`);
    return false;
  },
  'feedback-summary': async (el) => {
    const p = getProject(el.dataset.id);
    const r = await runAI('feedback', { ctx: { project: p.name, feedback: listFeedback(p.id).filter((f) => f.status === 'open').map((f) => ({ comment: f.comment, at: f.timecode != null ? fmtTimecode(f.timecode) : f.reference || '' })) } });
    openModal(html`${modalHead(t('Feedback summary'), r.provider === 'anthropic' ? t('Suggested by Claude — review before using.') : t('Suggested by the local assistant — review before using.'))}<textarea class="ai-out" rows="14" aria-label="${t('Summary')}">${r.text}</textarea><div class="modal-actions"><button class="btn btn-secondary" data-action="copy-ai">${t('Copy')}</button><button class="btn btn-primary" data-action="modal-close">${t('Done')}</button></div>`, { size: 'lg' });
    return false;
  },
  'copy-ai': async () => { const txt = document.querySelector('.modal textarea')?.value || ''; try { await navigator.clipboard.writeText(txt); toast(t('Copied.')); } catch { toast(t('Select the text and copy it.')); } return false; },
  'round-start': (el) => {
    const r = db.get('revisionRounds', el.dataset.id);
    if (r.isExtra && !r.changeOrderId) toast(t('Heads up: this round is beyond the allowance and has no approved change order.'), 'error');
    startRound(el.dataset.id);
  },
  'approval-new': (el) => { closeModal(); go(`/projects/${el.dataset.id}/approvals`); return false; },
  'approval-withdraw': async (el) => { if (await confirmDialog({ title: t('Withdraw approval request?'), body: t('The client will no longer see it.'), confirm: t('Withdraw') })) withdrawApproval(el.dataset.id); },
  deliver: async (el) => {
    const p = getProject(el.dataset.id);
    const locked = p.lockDeliveryUntilPaid && financials(p).balance > 0;
    if (!(await confirmDialog({ title: t('Deliver final files?'), body: locked ? t('Files in 06 Deliverables become downloadable for the client once the balance is paid. A final invoice is drafted for any remaining balance.') : t('Files in 06 Deliverables become downloadable for the client. A final invoice is drafted for any remaining balance.'), confirm: t('Deliver') }))) return false;
    const inv = deliverFinal(p.id);
    toast(inv ? t('Delivered. Final invoice {number} is ready to send.', { number: inv.number }) : t('Final files delivered.'));
  },
});

onForm({
  'files-upload': async (v, form) => {
    await uploadWithProgress(form, v.id, v.files, { folder: v.folder });
    toast(v.files.length > 1 ? t('{n} files uploaded.', { n: v.files.length }) : t('File uploaded.'));
  },
  'file-version': async (v, form) => {
    await uploadWithProgress(form, v.projectId, v.files, { fileId: v.id, confirmFinalOverwrite: !!v.confirmFinal });
    closeModal(); toast(t('New version uploaded.'));
  },
  'file-rename': (v) => { renameFile(v.id, v.name); closeModal(); toast(t('Renamed.')); },
  'file-move': (v) => { moveFile(v.id, v.folder); closeModal(); toast(t('Moved.')); },
  'feedback-note': (v) => { addFeedback(v.id, { comment: v.comment }); closeModal(); },
  'round-log': (v) => { logRevisionRequest(v.id, v.summary); toast(t('Revision round created.')); },
  'approval-create': (v) => { requestApproval(v.id, v); toast(t('Sent to the client for final approval.')); },
});
