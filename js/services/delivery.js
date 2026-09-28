// Files & versions, feedback, revision rounds, approvals, delivery, completion.
import { db, blobs } from '../core/store.js';
import { mailer, appLink } from '../core/mailer.js';
import { UserError, ForbiddenError, req, opt, dateStr, uid, nowISO, todayISO, addDays, clock, fmtTimecode } from '../core/util.js';
import { myBusiness, requireProject, requireOwned, logActivity, freelancerActor, clientActor, notifyOwner, portalProject, touchClient } from './context.js';
import { financials, createProject } from './core.js';
import { insertInvoice } from './billing.js';
import { FOLDERS, CLIENT_FOLDERS } from './constants.js';

export const MAX_FILE_BYTES = 250 * 1024 * 1024;
const clientOf = (p) => db.get('clients', p.clientId);
function mailClient(p, subject, body, section, linkLabel) {
  const c = clientOf(p);
  if (!c?.email) return;
  mailer.send({ to: c.email, subject: `${subject} — ${db.get('businesses', p.businessId).name}`, body: `Hi ${c.name},\n\n${body}`, link: appLink(`/client/${p.id}/${section}?t=${p.portalToken}`), linkLabel });
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
  return db.all('files', (f) => f.businessId === b.id).map((f) => ({ ...f, latest: latestVersion(f.id), versions: versionsOf(f.id) }))
    .sort((a, z) => (z.latest?.createdAt || '').localeCompare(a.latest?.createdAt || ''));
}

function readWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    r.onload = () => { onProgress?.(1); resolve(new Blob([r.result], { type: file.type || 'application/octet-stream' })); };
    r.onerror = () => reject(new UserError('Something went wrong while reading the file. Please try again.'));
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
  if (file.size > MAX_FILE_BYTES) throw new UserError('This file is larger than 250 MB. Please upload a smaller or compressed version.');
  const blob = await readWithProgress(file, onProgress);
  const blobId = uid();
  try { await blobs.put(blobId, blob); } catch (e) {
    console.error(e);
    throw new UserError('Something went wrong while saving the file — your browser storage may be full. Free up space and try again.');
  }
  const number = versionsOf(fileRow.id).length + 1;
  return db.insert('fileVersions', {
    fileId: fileRow.id, projectId: project.id, number, label: labelFor(number), blobId, size: file.size, mime: file.type || 'application/octet-stream',
    originalName: file.name, isFinal: false, uploaderType, uploaderName, note: opt(note, 500),
  });
}

export async function uploadFile(projectId, { folder, file, fileId, onProgress, confirmFinalOverwrite = false, note }) {
  const p = requireProject(projectId);
  if (!fileId && !FOLDERS.some((f) => f.id === folder)) throw new UserError('Choose a folder.');
  if (!file) throw new UserError('Choose a file to upload.');
  let fileRow;
  if (fileId) {
    fileRow = requireOwned('files', fileId, 'file');
    const last = latestVersion(fileId);
    if (last?.isFinal && !confirmFinalOverwrite) throw new UserError('The latest version is marked Final. Confirm that you want to add a new version on top of it.');
  } else {
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled';
    fileRow = db.insert('files', { projectId: p.id, businessId: p.businessId, folder, name: base, uploadedBy: 'freelancer', sharedAt: null });
  }
  const v = await storeVersion(p, fileRow, file, { uploaderType: 'freelancer', uploaderName: freelancerActor().name, onProgress, note });
  db.update('files', fileRow.id, {});
  logActivity(p, freelancerActor(), 'file.uploaded', `${fileRow.name} ${v.label} uploaded to ${FOLDERS.find((f) => f.id === fileRow.folder).label}`);
  return { file: db.get('files', fileRow.id), version: v };
}

export function renameFile(fileId, name) {
  const f = requireOwned('files', fileId, 'file');
  const clean = req(name, 'File name', 'name', 120);
  db.update('files', fileId, { name: clean });
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.renamed', `File renamed from "${f.name}" to "${clean}"`);
}
export function moveFile(fileId, folder) {
  const f = requireOwned('files', fileId, 'file');
  if (!FOLDERS.some((x) => x.id === folder)) throw new UserError('Choose a folder.');
  db.update('files', fileId, { folder });
}
export async function deleteFile(fileId, { confirmFinal = false } = {}) {
  const f = requireOwned('files', fileId, 'file');
  const vs = versionsOf(fileId);
  if (vs.some((v) => v.isFinal) && !confirmFinal) throw new UserError('This file has a Final version. Confirm to delete it.');
  if (db.find('approvals', (a) => vs.some((v) => v.id === a.fileVersionId) && a.status === 'approved')) throw new UserError('This file has an approved version. Approved work is kept as part of the project record.');
  for (const v of vs) { await blobs.remove(v.blobId); db.remove('fileVersions', v.id); }
  db.remove('files', fileId);
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.deleted', `File "${f.name}" deleted`);
}
export function markFinal(versionId) {
  const v = requireOwned('fileVersions', versionId, 'file version');
  versionsOf(v.fileId).filter((x) => x.isFinal).forEach((x) => db.update('fileVersions', x.id, { isFinal: false, label: labelFor(x.number) }));
  db.update('fileVersions', versionId, { isFinal: true, label: 'Final' });
  const f = db.get('files', v.fileId);
  logActivity(db.get('projects', f.projectId), freelancerActor(), 'file.final', `${f.name} ${labelFor(v.number)} marked as Final`);
}

export function sendForReview(fileId, message = '') {
  const f = requireOwned('files', fileId, 'file');
  const p = db.get('projects', f.projectId);
  if (!['active', 'in_review', 'revision_requested'].includes(p.status)) {
    throw new UserError(p.status === 'awaiting_deposit' ? 'Work starts once the deposit is received.' : 'Drafts can be shared for review while the project is active.');
  }
  const v = latestVersion(fileId);
  if (!v) throw new UserError('Upload a version first.');
  if (!CLIENT_FOLDERS.includes(f.folder)) db.update('files', fileId, { folder: 'review' });
  db.update('files', fileId, { sharedAt: nowISO() });
  const open = db.all('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered');
  open.forEach((r) => db.update('revisionRounds', r.id, { status: 'delivered', deliveredAt: nowISO(), deliveredVersionId: v.id }));
  db.update('projects', p.id, { status: 'in_review' });
  logActivity(p, freelancerActor(), 'file.shared', `${f.name} ${v.label} shared for review${open.length ? ` (revision ${open.map((r) => r.number).join(', ')} delivered)` : ''}`, { versionId: v.id });
  mailClient(p, `New version ready: ${f.name}`, `${f.name} ${v.label} is ready for your review.${message ? `\n\n"${opt(message, 500)}"` : ''}`, 'files', 'Review now');
  touchClient(p.clientId);
}

export async function blobURLFor(versionId, { projectId, token } = {}) {
  const v = db.get('fileVersions', versionId);
  if (!v) throw new UserError('File not found.');
  if (token) {
    const p = portalProject(projectId, token);
    const f = db.get('files', v.fileId);
    if (f.projectId !== p.id || !portalCanSee(p, f)) throw new ForbiddenError('This file is not shared with you.');
  } else requireOwned('files', v.fileId, 'file');
  const blob = await blobs.get(v.blobId);
  if (!blob) throw new UserError('The file content is missing from this device.');
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
  if (!file) throw new UserError('Choose a file to upload.');
  const base = file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Untitled';
  const fileRow = db.insert('files', { projectId: p.id, businessId: p.businessId, folder: 'brand', name: base, uploadedBy: 'client', sharedAt: nowISO() });
  try {
    await storeVersion(p, fileRow, file, { uploaderType: 'client', uploaderName: clientActor(p, name).name, onProgress });
  } catch (e) { db.remove('files', fileRow.id); throw e; }
  logActivity(p, clientActor(p, name), 'file.uploaded', `Client uploaded ${base} to 02 Brand Assets`);
  notifyOwner(p, { type: 'client_action', title: 'Client uploaded a file', body: `${base} was added to ${p.name}.`, link: `/projects/${p.id}/files` });
}
export function portalDownloaded(projectId, token, versionId) {
  const p = portalProject(projectId, token);
  const v = db.get('fileVersions', versionId);
  const f = v && db.get('files', v.fileId);
  if (f?.folder === 'deliverables') logActivity(p, clientActor(p), 'file.downloaded', `Client downloaded ${f.name}`);
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
  if (!v || v.projectId !== p.id) throw new UserError('That file version was not found.');
  return v;
}
export function addFeedback(projectId, data) {
  const p = requireProject(projectId);
  const v = versionFor(p, data.fileVersionId);
  const fb = db.insert('feedback', { projectId: p.id, fileId: v?.fileId || null, fileVersionId: v?.id || null, authorType: 'freelancer', authorName: freelancerActor().name, status: 'open', revisionRoundId: null, ...cleanFeedback(data) });
  return fb;
}
export function portalAddFeedback(projectId, token, data) {
  const p = portalProject(projectId, token);
  if (['completed', 'cancelled'].includes(p.status)) throw new UserError('This project is closed.');
  const v = versionFor(p, data.fileVersionId);
  if (v) { const f = db.get('files', v.fileId); if (!portalCanSee(p, f)) throw new ForbiddenError('This file is not shared with you.'); }
  const actor = clientActor(p, data.name);
  const fb = db.insert('feedback', { projectId: p.id, fileId: v?.fileId || null, fileVersionId: v?.id || null, authorType: 'client', authorName: actor.name, status: 'open', revisionRoundId: null, ...cleanFeedback(data) });
  const where = fb.timecode != null ? ` at ${fmtTimecode(fb.timecode)}` : fb.pinX != null ? ' (pinned)' : '';
  logActivity(p, actor, 'feedback.added', `Client left feedback${v ? ` on ${db.get('files', v.fileId).name} ${v.label}` : ''}${where}`);
  notifyOwner(p, { type: 'client_action', title: 'New feedback', body: `${actor.name}: "${fb.comment.slice(0, 120)}"`, link: `/projects/${p.id}/feedback` });
  return fb;
}
export function setFeedbackStatus(id, status) {
  const fb = requireOwned('feedback', id, 'feedback');
  if (!['open', 'resolved'].includes(status)) throw new UserError('Unknown status.');
  db.update('feedback', fb.id, { status });
}

// ---------- Revision rounds ----------
export const listRounds = (projectId) => db.all('revisionRounds', (r) => r.projectId === projectId).sort((a, z) => a.number - z.number);
function openRound(p, actor, summary) {
  if (db.find('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered')) throw new UserError('A revision round is already in progress.');
  const number = listRounds(p.id).length + 1;
  const isExtra = number > (p.revisionsIncluded || 0);
  const round = db.insert('revisionRounds', { projectId: p.id, number, status: 'requested', isExtra, summary: opt(summary, 3000), requestedBy: actor.name, requestedAt: nowISO(), deliveredAt: null, deliveredVersionId: null, changeOrderId: null });
  db.all('feedback', (f) => f.projectId === p.id && f.status === 'open' && !f.revisionRoundId).forEach((f) => db.update('feedback', f.id, { revisionRoundId: round.id }));
  db.update('projects', p.id, { status: 'revision_requested' });
  logActivity(p, actor, 'revision.requested', `Revision ${number} requested${isExtra ? ` — exceeds the ${p.revisionsIncluded} included round(s)` : ` (${number} of ${p.revisionsIncluded})`}`);
  notifyOwner(p, { type: 'revision', title: isExtra ? 'Additional revision requested' : 'Revision requested', body: `${actor.name} requested revision ${number} on ${p.name}.${isExtra ? ' This is beyond the included rounds — consider a change order.' : ''}`, link: `/projects/${p.id}/revisions` });
  return round;
}
export function portalRequestRevision(projectId, token, { summary, name }) {
  const p = portalProject(projectId, token);
  if (!['in_review', 'awaiting_approval'].includes(p.status)) throw new UserError('Revisions can be requested once a version has been shared for review.');
  req(summary, 'What should change', 'summary', 3000);
  if (p.status === 'awaiting_approval') {
    const pending = db.find('approvals', (a) => a.projectId === p.id && a.status === 'pending');
    if (pending) db.update('approvals', pending.id, { status: 'changes_requested', respondedAt: nowISO(), clientName: clientActor(p, name).name, note: opt(summary, 2000) });
  }
  return openRound(p, clientActor(p, name), summary);
}
export function logRevisionRequest(projectId, summary) {
  const p = requireProject(projectId);
  if (!['in_review', 'awaiting_approval', 'active'].includes(p.status)) throw new UserError('Revisions can be logged once a version has been shared for review.');
  return openRound(p, freelancerActor(), `${req(summary, 'Summary', 'summary', 3000)} (logged by freelancer)`);
}
export function startRound(id) {
  const r = requireOwned('revisionRounds', id, 'revision round');
  if (r.status !== 'requested') throw new UserError('This round has already started.');
  if (r.isExtra && !r.changeOrderId) {
    // Allowed, but the UI warns: extra rounds should be covered by an approved change order.
  }
  db.update('revisionRounds', id, { status: 'in_progress' });
  logActivity(db.get('projects', r.projectId), freelancerActor(), 'revision.started', `Started work on revision ${r.number}`);
}

// ---------- Approvals ----------
export const listApprovals = (projectId) => db.all('approvals', (a) => a.projectId === projectId).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
export function requestApproval(projectId, { fileVersionId, message }) {
  const p = requireProject(projectId);
  if (!['active', 'in_review', 'revision_requested'].includes(p.status)) throw new UserError('Final approval can be requested while the project is active or in review.');
  if (db.find('approvals', (a) => a.projectId === p.id && a.status === 'pending')) throw new UserError('An approval request is already waiting for the client.');
  const v = versionFor(p, fileVersionId);
  if (!v) throw new UserError('Choose the version to approve.');
  const f = db.get('files', v.fileId);
  if (!CLIENT_FOLDERS.includes(f.folder) || f.folder === 'deliverables') db.update('files', f.id, { folder: 'final' });
  db.update('files', f.id, { sharedAt: f.sharedAt || nowISO() });
  db.all('revisionRounds', (r) => r.projectId === p.id && r.status !== 'delivered').forEach((r) => db.update('revisionRounds', r.id, { status: 'delivered', deliveredAt: nowISO(), deliveredVersionId: v.id }));
  const a = db.insert('approvals', { projectId: p.id, fileId: f.id, fileVersionId: v.id, fileName: f.name, versionLabel: v.label, message: opt(message, 1000), status: 'pending', requestedAt: nowISO(), respondedAt: null, clientName: '', note: '' });
  db.update('projects', p.id, { status: 'awaiting_approval' });
  logActivity(p, freelancerActor(), 'approval.requested', `Final approval requested for ${f.name} ${v.label}`);
  mailClient(p, 'Final approval required', `${f.name} ${v.label} is ready for your final approval.`, 'approval', 'Review and approve');
  touchClient(p.clientId);
  return a;
}
export function withdrawApproval(id) {
  const a = requireOwned('approvals', id, 'approval');
  if (a.status !== 'pending') throw new UserError('Only pending approvals can be withdrawn.');
  db.update('approvals', id, { status: 'withdrawn', respondedAt: nowISO() });
  const p = db.get('projects', a.projectId);
  db.update('projects', p.id, { status: 'in_review' });
  logActivity(p, freelancerActor(), 'approval.withdrawn', `Approval request for ${a.fileName} ${a.versionLabel} withdrawn`);
}
export function portalRespondApproval(projectId, token, approvalId, { decision, name, note }) {
  const p = portalProject(projectId, token);
  const a = db.get('approvals', approvalId);
  if (!a || a.projectId !== p.id || a.status !== 'pending') throw new UserError('This approval request is no longer open.');
  const signer = req(name, 'Your name', 'name', 120);
  const actor = clientActor(p, signer);
  if (decision === 'approve') {
    const at = nowISO();
    db.update('approvals', a.id, { status: 'approved', respondedAt: at, clientName: signer, note: opt(note, 1000) });
    db.update('projects', p.id, { status: 'approved', approvedAt: at });
    logActivity(p, actor, 'approval.approved', `Final version approved by ${signer}: ${a.fileName} ${a.versionLabel}`, { approvalId: a.id, versionId: a.fileVersionId, at });
    notifyOwner(p, { type: 'client_action', title: 'Final approval received', body: `${signer} approved ${a.fileName} ${a.versionLabel}.`, link: `/projects/${p.id}/approvals` });
  } else if (decision === 'changes') {
    req(note, 'What should change', 'note', 2000);
    db.update('approvals', a.id, { status: 'changes_requested', respondedAt: nowISO(), clientName: signer, note: opt(note, 2000) });
    db.update('projects', p.id, { status: 'in_review' });
    openRound(db.get('projects', p.id), actor, note);
  } else throw new UserError('Unknown response.');
}

// ---------- Delivery & completion ----------
export function deliverFinal(projectId, message = '') {
  const p = requireProject(projectId);
  if (p.status !== 'approved') throw new UserError('Final files are delivered after the client approves the final version.');
  const files = db.all('files', (f) => f.projectId === p.id && f.folder === 'deliverables');
  if (!files.length) throw new UserError('Upload the final files to "06 Deliverables" first.');
  db.update('projects', p.id, { deliveredAt: nowISO() });
  files.forEach((f) => db.update('files', f.id, { sharedAt: nowISO() }));
  logActivity(p, freelancerActor(), 'delivery.sent', `Final delivery: ${files.length} file(s) released${p.lockDeliveryUntilPaid ? ' (downloads unlock when paid in full)' : ''}`);
  const f = financials(db.get('projects', p.id));
  let inv = null;
  if (f.uninvoiced > 0.001) {
    inv = insertInvoice(p, { kind: 'final', items: [{ description: `Final payment — ${p.name}`, quantity: 1, unitPrice: f.uninvoiced }] });
    logActivity(p, freelancerActor(), 'invoice.created', `Final invoice ${inv.number} drafted for the remaining balance`);
  }
  mailClient(p, 'Your final files are ready', `The final files for ${p.name} have been delivered.${message ? `\n\n"${opt(message, 500)}"` : ''}`, 'files', 'Download files');
  return inv;
}

export function completeProject(projectId, { force = false } = {}) {
  const p = requireProject(projectId);
  if (p.status !== 'approved') throw new UserError('A project can be completed after final approval.');
  if (!p.deliveredAt && !force) throw new UserError('Final files have not been delivered yet.');
  const f = financials(p);
  if (f.balance > 0.001 && !force) throw new UserError('There is still a balance outstanding on this project.');
  db.update('projects', p.id, { status: 'completed', completedAt: nowISO() });
  logActivity(p, freelancerActor(), 'project.completed', `Project completed${f.balance > 0.001 ? ' with a balance outstanding' : ''}`);
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

// Start a repeat project for a client, copying nothing but the client.
export function repeatProject(clientId, name) { return createProject({ clientId, name }); }
export { todayISO };
