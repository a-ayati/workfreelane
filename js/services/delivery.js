// Files & versions, feedback, revision rounds, approvals, delivery, completion.
import { db, blobs } from '../core/store.js';
import { mailer, appLink } from '../core/mailer.js';
import { t, tl } from '../core/i18n.js';
import { UserError, ForbiddenError, req, opt, dateStr, uid, nowISO, todayISO, addDays, clock, fmtTimecode } from '../core/util.js';
import { myBusiness, requireProject, requireOwned, logActivity, freelancerActor, clientActor, notifyOwner, notifyClientSide, portalProject, portalGuard, touchClient, clientLang, can, access } from './context.js';
import { financials, createProject } from './core.js';
import { insertInvoice, lineText } from './billing.js';
import { FOLDERS, CLIENT_FOLDERS } from './constants.js';

export const MAX_FILE_BYTES = 250 * 1024 * 1024;
const clientOf = (p) => db.get('clients', p.clientId);
const folderLabel = (id) => FOLDERS.find((f) => f.id === id)?.label || id;
// Emails to the client, in the client's language.
function mailClient(p, { subject, body, vars = {}, message = '', section, linkLabel }) {
  notifyClientSide(p, { type: 'action', title: subject, body, vars, section });
  const c = clientOf(p);
  if (!c?.email) return;
  const L = clientLang(p);
  mailer.send({
    to: c.email, subject: `${tl(L, subject, vars)} — ${db.get('businesses', p.businessId).name}`,
    body: `${tl(L, 'Hi {name},', { name: c.name })}\n\n${tl(L, body, vars)}${message ? `\n\n"${opt(message, 500)}"` : ''}`,
    link: appLink(`/client/${p.id}/${section}?t=${p.portalToken}`), linkLabel: tl(L, linkLabel),
  });
}

// ---------- Files ----------
export function versionsOf(fileId) { return db.all('fileVersions', (v) => v.fileId === fileId).sort((a, z) => a.number - z.number); }
export function latestVersion(fileId) { const v = versionsOf(fileId); return v[v.length - 1] || null; }
export const labelFor = (n) => `v${String(n).padStart(2, '0')}`;

export function listFiles(projectId, { folder } = {}) {
  return db.all('files', (f) => f.projectId === projectId && (!folder || f.folder === folder))
    .map((f) => ({ ...f, versions: versionsOf(f.id), latest: latestVersion(f.id) }))
    .sort((a, z) => (z.latest?.createdAt || z.createdAt).localeCompare(a.latest?.createdAt || a.createdAt));
}
export function listAllFiles() {
  const b = myBusiness();
  return db.all('files', (f) => f.businessId === b.id && can(db.get('projects', f.projectId), 'files.view')).map((f) => ({ ...f, latest: latestVersion(f.id), versions: versionsOf(f.id) }))
    .sort((a, z) => (z.latest?.createdAt || '').localeCompare(a.latest?.createdAt || ''));
}

function readWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    r.onload = () => { onProgress?.(1); resolve(new Blob([r.result], { type: file.type || 'application/octet-stream' })); };
    r.onerror = () => reject(new UserError(t('Something went wrong while reading the file. Please try again.')));
    r.readAsArrayBuffer(file);
  });
}

const kindOf = (mime = '', name = '') => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'other';
};
export const fileKind = (v) => kindOf(v?.mime, v?.originalName);

async function storeVersion(project, fileRow, file, { uploaderType, uploaderName, onProgress, note = '' }) {
  if (file.size > MAX_FILE_BYTES) throw new UserError(t('This file is larger than 250 MB. Please upload a smaller or compressed version.'));
  const blob = await readWithProgress(file, onProgress);
  const blobId = uid();
  try { await blobs.put(blobId, blob); } catch (e) {
    console.error(e);
    throw new UserError(t('Something went wrong while saving the file — your browser storage may be full. Free up space and try again.'));
  }
  const number = versionsOf(fileRow.id).length + 1;
  return db.insert('fileVersions', {
    fileId: fileRow.id, projectId: project.id, number, label: labelFor(number), blobId, size: file.size, mime: file.type || 'application/octet-stream',
    originalName: file.name, isFinal: false, uploaderType, uploaderName, note: opt(note, 500),
  });
}

export async function uploadFile(projectId, { folder, file, fileId, onProgress, confirmFinalOverwrite = false, note }) {
  const p = requireProject(projectId, 'files.upload');
  if (!fileId && !FOLDERS.some((f) => f.id === folder)) throw new UserError(t('Choose a folder.'));
  if (!file) throw new UserError(t('Choose a file to upload.'));
  let fileRow;
  if (fileId) {
    fileRow = requireOwned('files', fileId, 'file', 'files.upload');
    const last = latestVersion(fileId);
    if (last?.isFinal && !confirmFinalOverwrite) throw new UserError(t('The latest version is marked Final. Confirm that you want to add a new version on top of it.'));
  } else {
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled';
    fileRow = db.insert('files', { projectId: p.id, businessId: p.businessId, folder, name: base, uploadedBy: 'freelancer', sharedAt: null });
  }
  const v = await storeVersion(p, fileRow, file, { uploaderType: 'freelancer', uploaderName: freelancerActor().name, onProgress, note });
  db.update('files', fileRow.id, {});
  logActivity(p, freelancerActor(), 'file.uploaded', '{file} {version} uploaded to {folder_t}', { file: fileRow.name, version: v.label, folder_t: folderLabel(fileRow.folder) });
  return { file: db.get('files', fileRow.id), version: v };
}

export function renameFile(fileId, name) {
  const f = requireOwned('files', fileId, 'file', 'files.upload');
  const clean = req(name, 'File name', 'name', 120);
  db.update('files', fileId, { name: clean });
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.renamed', 'File renamed from "{from}" to "{to}"', { from: f.name, to: clean });
}
export function moveFile(fileId, folder) {
  requireOwned('files', fileId, 'file', 'files.upload');
  if (!FOLDERS.some((x) => x.id === folder)) throw new UserError(t('Choose a folder.'));
  db.update('files', fileId, { folder });
}
export async function deleteFile(fileId, { confirmFinal = false } = {}) {
  const f = requireOwned('files', fileId, 'file', 'files.upload');
  const vs = versionsOf(fileId);
  if (vs.some((v) => v.isFinal) && !confirmFinal) throw new UserError(t('This file has a Final version. Confirm to delete it.'));
  if (db.find('approvals', (a) => vs.some((v) => v.id === a.fileVersionId) && a.status === 'approved')) throw new UserError(t('This file has an approved version. Approved work is kept as part of the project record.'));
  for (const v of vs) { await blobs.remove(v.blobId); db.remove('fileVersions', v.id); }
  db.remove('files', fileId);
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.deleted', 'File "{file}" deleted', { file: f.name });
}
export function markFinal(versionId) {
  const v = requireOwned('fileVersions', versionId, 'file version', 'files.upload');
  versionsOf(v.fileId).filter((x) => x.isFinal).forEach((x) => db.update('fileVersions', x.id, { isFinal: false, label: labelFor(x.number) }));
  db.update('fileVersions', versionId, { isFinal: true, label: 'Final' });
  const f = db.get('files', v.fileId);
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.final', '{file} {version} marked as Final', { file: f.name, version: labelFor(v.number) });
}

export function sendForReview(fileId, message = '') {
  const f = requireOwned('files', fileId, 'file', 'files.upload');
  const p = db.get('projects', f.projectId);
  if (!['active', 'in_review', 'revision_requested'].includes(p.status)) {
    throw new UserError(p.status === 'awaiting_deposit' ? t('Work starts once the deposit is received.') : t('Drafts can be shared for review while the project is active.'));
  }
  const v = latestVersion(fileId);
  if (!v) throw new UserError(t('Upload a version first.'));
  if (!CLIENT_FOLDERS.includes(f.folder)) db.update('files', fileId, { folder: 'review' });
  db.update('files', fileId, { sharedAt: nowISO() });
  const open = db.all('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered');
  open.forEach((r) => db.update('revisionRounds', r.id, { status: 'delivered', deliveredAt: nowISO(), deliveredVersionId: v.id }));
  db.update('projects', p.id, { status: 'in_review' });
  if (open.length) logActivity(p, freelancerActor(), 'file.shared', '{file} {version} shared for review (revision {rounds} delivered)', { file: f.name, version: v.label, rounds: open.map((r) => r.number).join(', ') }, { versionId: v.id });
  else logActivity(p, freelancerActor(), 'file.shared', '{file} {version} shared for review', { file: f.name, version: v.label }, { versionId: v.id });
  mailClient(p, { subject: 'New version ready: {file}', body: '{file} {version} is ready for your review.', vars: { file: f.name, version: v.label }, message, section: 'files', linkLabel: 'Review now' });
  touchClient(p.clientId);
}

export async function blobURLFor(versionId, { projectId, token } = {}) {
  const v = db.get('fileVersions', versionId);
  if (!v) throw new UserError(t('File not found.'));
  const f = db.get('files', v.fileId);
  const side = access(db.get('projects', f?.projectId))?.side;
  if (token || side === 'client') {
    const p = portalProject(projectId || f.projectId, token);
    if (f.projectId !== p.id || !portalCanSee(p, f)) throw new ForbiddenError(t('This file is not shared with you.'));
  } else requireProject(f.projectId, 'files.view');
  const blob = await blobs.get(v.blobId);
  if (!blob) throw new UserError(t('The file content is missing from this device.'));
  return URL.createObjectURL(blob);
}

// ---------- Client portal: files ----------
function portalCanSee(p, f) {
  if (!CLIENT_FOLDERS.includes(f.folder)) return false;
  if (f.folder === 'review' && !f.sharedAt) return false;
  if (f.folder === 'deliverables') return !!p.deliveredAt && !deliveryLocked(p);
  return true;
}
export function deliveryLocked(p) { return !!p.lockDeliveryUntilPaid && financials(p).balance > 0.001; }
export function portalFiles(projectId, token) {
  const p = portalProject(projectId, token);
  return db.all('files', (f) => f.projectId === p.id && portalCanSee(p, f))
    .map((f) => ({ ...f, versions: versionsOf(f.id), latest: latestVersion(f.id) }))
    .sort((a, z) => (z.latest?.createdAt || '').localeCompare(a.latest?.createdAt || ''));
}
export async function portalUpload(projectId, token, file, { onProgress, name }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'files.upload');
  if (!file) throw new UserError(t('Choose a file to upload.'));
  const base = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled';
  const fileRow = db.insert('files', { projectId: p.id, businessId: p.businessId, folder: 'brand', name: base, uploadedBy: 'client', sharedAt: nowISO() });
  try {
    await storeVersion(p, fileRow, file, { uploaderType: 'client', uploaderName: clientActor(p, name).name, onProgress });
  } catch (e) { db.remove('files', fileRow.id); throw e; }
  logActivity(p, clientActor(p, name), 'file.uploaded', 'Client uploaded {file} to {folder_t}', { file: base, folder_t: folderLabel('brand') });
  notifyOwner(p, { type: 'client_action', title: 'Client uploaded a file', body: '{file} was added to {project}.', vars: { file: base, project: p.name }, link: `/projects/${p.id}/files` });
}
export function portalDownloaded(projectId, token, versionId) {
  const p = portalProject(projectId, token);
  const v = db.get('fileVersions', versionId);
  const f = v && db.get('files', v.fileId);
  if (f?.folder === 'deliverables') logActivity(p, clientActor(p), 'file.downloaded', 'Client downloaded {file}', { file: f.name });
}

// ---------- Feedback ----------
export function listFeedback(projectId, { versionId } = {}) {
  return db.all('feedback', (x) => x.projectId === projectId && (!versionId || x.fileVersionId === versionId)).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
}
function cleanFeedback(data) {
  const comment = req(data.comment, 'Comment', 'comment', 3000);
  const timecode = data.timecode === '' || data.timecode == null ? null : Math.max(0, Number(data.timecode));
  const pinX = data.pinX === '' || data.pinX == null ? null : Math.min(100, Math.max(0, Number(data.pinX)));
  const pinY = data.pinY === '' || data.pinY == null ? null : Math.min(100, Math.max(0, Number(data.pinY)));
  return { comment, timecode: Number.isFinite(timecode) ? timecode : null, pinX: Number.isFinite(pinX) ? pinX : null, pinY: Number.isFinite(pinY) ? pinY : null, reference: opt(data.reference, 120) };
}
function versionFor(p, versionId) {
  if (!versionId) return null;
  const v = db.get('fileVersions', versionId);
  if (!v || v.projectId !== p.id) throw new UserError(t('That file version was not found.'));
  return v;
}
// A reply joins a top-level comment's thread and inherits its file/version.
function parentFor(p, parentId) {
  if (!parentId) return null;
  const parent = db.get('feedback', parentId);
  if (!parent || parent.projectId !== p.id) throw new UserError(t('That comment was not found.'));
  if (parent.parentId) throw new UserError(t('You can only reply to a top-level comment.'));
  return parent;
}
function feedbackRow(p, data, authorType, authorName) {
  const parent = parentFor(p, data.parentId);
  if (parent) {
    return { projectId: p.id, fileId: parent.fileId, fileVersionId: parent.fileVersionId, authorType, authorName, status: parent.status, revisionRoundId: parent.revisionRoundId, parentId: parent.id, comment: req(data.comment, 'Comment', 'comment', 3000), timecode: null, pinX: null, pinY: null, reference: '' };
  }
  const v = versionFor(p, data.fileVersionId);
  return { projectId: p.id, fileId: v?.fileId || null, fileVersionId: v?.id || null, authorType, authorName, status: 'open', revisionRoundId: null, parentId: null, ...cleanFeedback(data), _version: v };
}
export function addFeedback(projectId, data) {
  const p = requireProject(projectId, 'feedback.write');
  const { _version, ...row } = feedbackRow(p, data, 'freelancer', freelancerActor().name);
  return db.insert('feedback', row);
}
export function portalAddFeedback(projectId, token, data) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'feedback.write');
  if (['completed', 'cancelled'].includes(p.status)) throw new UserError(t('This project is closed.'));
  const actor = clientActor(p, data.name);
  const { _version: v, ...row } = feedbackRow(p, data, 'client', actor.name);
  if (row.fileId) { const f = db.get('files', row.fileId); if (!portalCanSee(p, f)) throw new ForbiddenError(t('This file is not shared with you.')); }
  const fb = db.insert('feedback', row);
  if (fb.parentId) logActivity(p, actor, 'feedback.replied', 'Client replied to a comment');
  else if (v) {
    const vars = { file: db.get('files', v.fileId).name, version: v.label, at: fb.timecode != null ? fmtTimecode(fb.timecode) : '' };
    if (fb.timecode != null) logActivity(p, actor, 'feedback.added', 'Client left feedback on {file} {version} at {at}', vars);
    else if (fb.pinX != null) logActivity(p, actor, 'feedback.added', 'Client left feedback on {file} {version} (pinned)', vars);
    else logActivity(p, actor, 'feedback.added', 'Client left feedback on {file} {version}', vars);
  } else logActivity(p, actor, 'feedback.added', 'Client left feedback');
  notifyOwner(p, { type: 'client_action', title: fb.parentId ? 'New reply' : 'New feedback', body: '{name}: "{comment}"', vars: { name: actor.name, comment: fb.comment.slice(0, 120) }, link: `/projects/${p.id}/feedback` });
  return fb;
}
export function setFeedbackStatus(id, status) {
  const fb = requireOwned('feedback', id, 'feedback', 'feedback.write');
  if (!['open', 'resolved'].includes(status)) throw new UserError(t('Unknown status.'));
  const root = fb.parentId ? db.get('feedback', fb.parentId) : fb;
  // Resolving acts on the whole thread.
  db.all('feedback', (x) => x.id === root.id || x.parentId === root.id).forEach((x) => db.update('feedback', x.id, { status }));
}

// ---------- Revision rounds ----------
export const listRounds = (projectId) => db.all('revisionRounds', (r) => r.projectId === projectId).sort((a, z) => a.number - z.number);
function openRound(p, actor, summary, loggedByFreelancer = false) {
  if (db.find('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered')) throw new UserError(t('A revision round is already in progress.'));
  const number = listRounds(p.id).length + 1;
  const isExtra = number > (p.revisionsIncluded || 0);
  const round = db.insert('revisionRounds', { projectId: p.id, number, status: 'requested', isExtra, summary: opt(summary, 3000), loggedByFreelancer, requestedBy: actor.name, requestedAt: nowISO(), deliveredAt: null, deliveredVersionId: null, changeOrderId: null });
  db.all('feedback', (f) => f.projectId === p.id && f.status === 'open' && !f.revisionRoundId).forEach((f) => db.update('feedback', f.id, { revisionRoundId: round.id })); // replies follow their thread
  db.update('projects', p.id, { status: 'revision_requested' });
  const vars = { n: number, max: p.revisionsIncluded };
  if (isExtra) logActivity(p, actor, 'revision.requested', 'Revision {n} requested — exceeds the {max} included round(s)', vars);
  else logActivity(p, actor, 'revision.requested', 'Revision {n} requested ({n} of {max})', vars);
  notifyOwner(p, {
    type: 'revision', title: isExtra ? 'Additional revision requested' : 'Revision requested',
    body: isExtra ? '{name} requested revision {n} on {project}. This is beyond the included rounds — consider a change order.' : '{name} requested revision {n} on {project}.',
    vars: { name: actor.name, n: number, project: p.name }, link: `/projects/${p.id}/revisions`,
  });
  return round;
}
export function portalRequestRevision(projectId, token, { summary, name }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'revisions.request');
  if (!['in_review', 'awaiting_approval'].includes(p.status)) throw new UserError(t('Revisions can be requested once a version has been shared for review.'));
  req(summary, 'What should change', 'summary', 3000);
  if (p.status === 'awaiting_approval') {
    const pending = db.find('approvals', (a) => a.projectId === p.id && a.status === 'pending');
    if (pending) db.update('approvals', pending.id, { status: 'changes_requested', respondedAt: nowISO(), clientName: clientActor(p, name).name, note: opt(summary, 2000) });
  }
  return openRound(p, clientActor(p, name), summary);
}
export function logRevisionRequest(projectId, summary) {
  const p = requireProject(projectId, 'revisions.manage');
  if (!['in_review', 'awaiting_approval', 'active'].includes(p.status)) throw new UserError(t('Revisions can be logged once a version has been shared for review.'));
  return openRound(p, freelancerActor(), req(summary, 'Summary', 'summary', 3000), true);
}
export function startRound(id) {
  const r = requireOwned('revisionRounds', id, 'revision round', 'revisions.manage');
  if (r.status !== 'requested') throw new UserError(t('This round has already started.'));
  db.update('revisionRounds', id, { status: 'in_progress' });
  logActivity(db.get('projects', r.projectId), freelancerActor(), 'revision.started', 'Started work on revision {n}', { n: r.number });
}

// ---------- Approvals ----------
export const listApprovals = (projectId) => db.all('approvals', (a) => a.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
export function requestApproval(projectId, { fileVersionId, message }) {
  const p = requireProject(projectId, 'approvals.request');
  if (!['active', 'in_review', 'revision_requested'].includes(p.status)) throw new UserError(t('Final approval can be requested while the project is active or in review.'));
  if (db.find('approvals', (a) => a.projectId === p.id && a.status === 'pending')) throw new UserError(t('An approval request is already waiting for the client.'));
  const v = versionFor(p, fileVersionId);
  if (!v) throw new UserError(t('Choose the version to approve.'));
  const f = db.get('files', v.fileId);
  if (!CLIENT_FOLDERS.includes(f.folder) || f.folder === 'deliverables') db.update('files', f.id, { folder: 'final' });
  db.update('files', f.id, { sharedAt: f.sharedAt || nowISO() });
  db.all('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered').forEach((r) => db.update('revisionRounds', r.id, { status: 'delivered', deliveredAt: nowISO(), deliveredVersionId: v.id }));
  const a = db.insert('approvals', { projectId: p.id, fileId: f.id, fileVersionId: v.id, fileName: f.name, versionLabel: v.label, message: opt(message, 1000), status: 'pending', requestedAt: nowISO(), respondedAt: null, clientName: '', note: '' });
  db.update('projects', p.id, { status: 'awaiting_approval' });
  logActivity(p, freelancerActor(), 'approval.requested', 'Final approval requested for {file} {version}', { file: f.name, version: v.label });
  mailClient(p, { subject: 'Final approval required', body: '{file} {version} is ready for your final approval.', vars: { file: f.name, version: v.label }, section: 'approval', linkLabel: 'Review and approve' });
  touchClient(p.clientId);
  return a;
}
export function withdrawApproval(id) {
  const a = requireOwned('approvals', id, 'approval', 'approvals.request');
  if (a.status !== 'pending') throw new UserError(t('Only pending approvals can be withdrawn.'));
  db.update('approvals', id, { status: 'withdrawn', respondedAt: nowISO() });
  const p = db.get('projects', a.projectId);
  db.update('projects', p.id, { status: 'in_review' });
  logActivity(p, freelancerActor(), 'approval.withdrawn', 'Approval request for {file} {version} withdrawn', { file: a.fileName, version: a.versionLabel });
}
export function portalRespondApproval(projectId, token, approvalId, { decision, name, note }) {
  const p = portalProject(projectId, token);
  portalGuard(p, 'approvals.respond');
  const a = db.get('approvals', approvalId);
  if (!a || a.projectId !== p.id || a.status !== 'pending') throw new UserError(t('This approval request is no longer open.'));
  const signer = req(name, 'Your name', 'name', 120);
  const actor = clientActor(p, signer);
  if (decision === 'approve') {
    const at = nowISO();
    db.update('approvals', a.id, { status: 'approved', respondedAt: at, clientName: signer, note: opt(note, 1000) });
    db.update('projects', p.id, { status: 'approved', approvedAt: at });
    logActivity(p, actor, 'approval.approved', 'Final version approved by {name}: {file} {version}', { name: signer, file: a.fileName, version: a.versionLabel }, { approvalId: a.id, versionId: a.fileVersionId, at });
    notifyOwner(p, { type: 'client_action', title: 'Final approval received', body: '{name} approved {file} {version}.', vars: { name: signer, file: a.fileName, version: a.versionLabel }, link: `/projects/${p.id}/approvals` });
  } else if (decision === 'changes') {
    req(note, 'What should change', 'note', 2000);
    db.update('approvals', a.id, { status: 'changes_requested', respondedAt: nowISO(), clientName: signer, note: opt(note, 2000) });
    db.update('projects', p.id, { status: 'in_review' });
    openRound(db.get('projects', p.id), actor, note);
  } else throw new UserError(t('Unknown response.'));
}

// ---------- Delivery & completion ----------
export function deliverFinal(projectId, message = '') {
  const p = requireProject(projectId, 'delivery.manage');
  if (p.status !== 'approved') throw new UserError(t('Final files are delivered after the client approves the final version.'));
  const files = db.all('files', (f) => f.projectId === p.id && f.folder === 'deliverables');
  if (!files.length) throw new UserError(t('Upload the final files to "06 Deliverables" first.'));
  db.update('projects', p.id, { deliveredAt: nowISO() });
  files.forEach((f) => db.update('files', f.id, { sharedAt: nowISO() }));
  if (p.lockDeliveryUntilPaid) logActivity(p, freelancerActor(), 'delivery.sent', 'Final delivery: {n} file(s) released (downloads unlock when paid in full)', { n: files.length });
  else logActivity(p, freelancerActor(), 'delivery.sent', 'Final delivery: {n} file(s) released', { n: files.length });
  const f = financials(db.get('projects', p.id));
  let inv = null;
  if (f.uninvoiced > 0.001) {
    inv = insertInvoice(p, { kind: 'final', items: [{ description: lineText(p, 'Final payment — {project}', { project: p.name }), quantity: 1, unitPrice: f.uninvoiced }] });
    logActivity(p, freelancerActor(), 'invoice.created', 'Final invoice {number} drafted for the remaining balance', { number: inv.number });
  }
  mailClient(p, { subject: 'Your final files are ready', body: 'The final files for {project} have been delivered.', vars: { project: p.name }, message, section: 'files', linkLabel: 'Download files' });
  return inv;
}

export function completeProject(projectId, { force = false } = {}) {
  const p = requireProject(projectId, 'delivery.manage');
  if (p.status !== 'approved') throw new UserError(t('A project can be completed after final approval.'));
  if (!p.deliveredAt && !force) throw new UserError(t('Final files have not been delivered yet.'));
  const f = financials(p);
  if (f.balance > 0.001 && !force) throw new UserError(t('There is still a balance outstanding on this project.'));
  db.update('projects', p.id, { status: 'completed', completedAt: nowISO() });
  if (f.balance > 0.001) logActivity(p, freelancerActor(), 'project.completed', 'Project completed with a balance outstanding');
  else logActivity(p, freelancerActor(), 'project.completed', 'Project completed');
}

// ---------- Follow-up reminders ----------
export function createReminder({ clientId, projectId, dueDate, note }) {
  const b = myBusiness();
  if (projectId) requireProject(projectId);
  const c = requireOwned('clients', clientId, 'client');
  return db.insert('reminders', { businessId: b.id, clientId: c.id, projectId: projectId || null, dueDate: dateStr(dueDate, 'Date', 'dueDate', true), note: req(note, 'Note', 'note', 500), doneAt: null });
}
export function completeReminder(id) { requireOwned('reminders', id, 'reminder'); db.update('reminders', id, { doneAt: nowISO() }); }
export function deleteReminder(id) { requireOwned('reminders', id, 'reminder'); db.remove('reminders', id); }
export function listReminders({ open = true } = {}) {
  const b = myBusiness();
  return db.all('reminders', (r) => r.businessId === b.id && (!open || !r.doneAt)).sort((a, z) => a.dueDate.localeCompare(z.dueDate));
}
export const defaultFollowUpDate = (days = 30) => addDays(clock.now(), days).toISOString().slice(0, 10);
export { todayISO, createProject };
