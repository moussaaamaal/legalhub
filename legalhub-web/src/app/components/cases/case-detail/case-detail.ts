import { Component, OnInit, signal, computed, inject, effect, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CaseService } from '../../../services/case.service';
import { Case } from '../../../models';
import { BillingService, InvoiceRaw } from '../../../services/billing.service';
import { UploadModalService } from '../../../shared/modals/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/modals/upload-modal/upload-modal';
import { DocumentService, RawDoc } from '../../../services/document.service';
import { TaskService, RawTask, RawNote } from '../../../services/task.service';
import { StaffService, ROLE_MAP } from '../../../services/staff.service';
import { AuthService } from '../../../services/auth.service';
import { VoiceNoteModal } from '../../../shared/modals/voice-note-modal/voice-note-modal';
import { NewNoteModal } from '../../../shared/modals/new-note-modal/new-note-modal';
import { NewInvoiceModal } from '../../../shared/modals/new-invoice-modal/new-invoice-modal';
import { InvoiceViewModal } from '../../../shared/modals/invoice-view-modal/invoice-view-modal';
import { RequestDocModal } from '../../../shared/modals/request-doc-modal/request-doc-modal';
import { ConfirmDialog } from '../../../shared/modals/confirm-dialog/confirm-dialog';
import { AiSummaryModal } from '../../../shared/modals/ai-summary-modal/ai-summary-modal';
import { AiChatModal } from '../../../shared/modals/ai-chat-modal/ai-chat-modal';

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

interface FirmMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

interface TimelineEntry {
  action: string;
  created_at: string;
  performed_by?: string;
}

interface Task {
  id:        string;
  label:     string;
  due:       string;
  dueColor:  string;
  done:      boolean;
  priority:  string;
  category?: string;
}

interface Note {
  id:        string;
  title?:    string;
  content:   string;
  author:    string;
  lawyerId:  string;
  createdAt: string;
  isVoice:   boolean;
}

type CaseDocStatus = 'Pending Review' | 'Approved' | 'Rejected';

interface CaseDocFile {
  id:                 string;
  name:               string;
  desc:               string;
  type:               string;
  typeBg:             string;
  typeColor:          string;
  iconBg:             string;
  icon:               string;
  iconColor:          string;
  size:               string;
  avatar:             string;
  uploader:           string;
  modified:           string;
  status:             CaseDocStatus;
  storageUrl:         string;
  isClientDoc:        boolean;
  isSharedWithClient: boolean;
  uploaderId:         string;
}

interface BillingEntry {
  date: string;
  attorney: string;
  desc: string;
  hours: string;
  rate: string;
  amount: string;
}


@Component({
  selector: 'app-case-detail',
  standalone: true,
  imports: [NgClass, FormsModule, UploadModal, VoiceNoteModal, NewNoteModal, NewInvoiceModal, RequestDocModal, InvoiceViewModal, ConfirmDialog, AiSummaryModal, AiChatModal],
  templateUrl: './case-detail.html',
})
export class CaseDetail implements OnInit {
  @ViewChild(VoiceNoteModal)  voiceModal!:      VoiceNoteModal;
  @ViewChild(NewNoteModal)    noteModal!:       NewNoteModal;
  @ViewChild(NewInvoiceModal) invoiceModal!:    NewInvoiceModal;
  @ViewChild(RequestDocModal) requestDocModal!: RequestDocModal;
  @ViewChild(AiSummaryModal)  aiSummaryModal!:  AiSummaryModal;
  @ViewChild(AiChatModal)     aiChatModal!:     AiChatModal;

  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private caseService    = inject(CaseService);
  private billingService = inject(BillingService);
  upload              = inject(UploadModalService);
  private docService  = inject(DocumentService);
  private taskService  = inject(TaskService);
  private staffService = inject(StaffService);
  private authService  = inject(AuthService);
  _caseId     = '';

  get currentUserId(): string { return this.authService.currentUser()?.id ?? ''; }
  isCurrentUserUploader(doc: CaseDocFile): boolean { return doc.uploaderId === this.currentUserId; }

  activeTab = signal('Overview');
  tabs = ['Overview', 'Timeline', 'Documents', 'Tasks', 'Notes', 'Billing', 'Team'];

  case      = signal<Case | null>(null);
  timeline  = signal<TimelineEntry[]>([]);
  isLoading = signal(false);
  errorMsg  = signal('');

  documents     = signal<CaseDocFile[]>([]);
  docFilter     = signal<'all' | 'pending' | 'approved' | 'shared'>('all');
  selectedDocs  = signal<Set<string>>(new Set());
  showBulkBar   = computed(() => this.selectedDocs().size > 0);

  filteredCaseDocs = computed(() => {
    const f    = this.docFilter();
    const docs = this.documents();
    if (f === 'pending')  return docs.filter(d => d.isClientDoc && d.status === 'Pending Review');
    if (f === 'approved') return docs.filter(d => d.isClientDoc && d.status === 'Approved');
    if (f === 'shared')   return docs.filter(d => !d.isClientDoc && d.isSharedWithClient);
    return docs;
  });

  get docPendingCount(): number {
    return this.documents().filter(d => d.isClientDoc && d.status === 'Pending Review').length;
  }

  get docAllSelected(): boolean {
    const docs = this.filteredCaseDocs();
    return docs.length > 0 && docs.every(d => this.selectedDocs().has(d.id));
  }

  isDocSelected(id: string): boolean { return this.selectedDocs().has(id); }

  toggleDoc(id: string): void {
    this.selectedDocs.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  toggleAllDocs(): void {
    const docs = this.filteredCaseDocs();
    const all  = docs.every(d => this.selectedDocs().has(d.id));
    this.selectedDocs.set(all ? new Set() : new Set(docs.map(d => d.id)));
  }

  clearDocSelection(): void { this.selectedDocs.set(new Set()); }

  bulkSummarizeDocs(): void {
    for (const id of [...this.selectedDocs()]) {
      this.aiSummarizeDoc(id);
    }
  }

  // ── Document Actions ──────────────────────────────────────

  previewDoc           = signal<CaseDocFile | null>(null);
  downloadingDoc       = signal<string | null>(null);
  confirmDownloadDoc   = signal<CaseDocFile | null>(null);
  deletingDoc          = signal<CaseDocFile | null>(null);
  docIsDeleting        = signal(false);

  openPreview(doc: CaseDocFile) { this.previewDoc.set(doc); }
  closePreview()                { this.previewDoc.set(null); }

  confirmDownload(doc: CaseDocFile): void { this.confirmDownloadDoc.set(doc); }
  cancelDownload():                  void { this.confirmDownloadDoc.set(null); }

  viewDoc(doc: CaseDocFile): void {
    if (!doc.storageUrl) return;
    if (doc.type === 'WORD') {
      window.open(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.storageUrl)}`, '_blank');
    } else {
      window.open(doc.storageUrl, '_blank');
    }
  }

  openRequestDocModal() { this.requestDocModal.openModal(); }

  async downloadDoc(doc: CaseDocFile) {
    this.confirmDownloadDoc.set(null);
    this.downloadingDoc.set(doc.id);
    try { await this.docService.downloadFile({ name: doc.name, url: doc.storageUrl }); } catch {}
    setTimeout(() => this.downloadingDoc.set(null), 1800);
  }

  confirmDelete(doc: CaseDocFile) { this.deletingDoc.set(doc); }
  cancelDelete()                  { this.deletingDoc.set(null); }

  async deleteDoc() {
    const doc = this.deletingDoc();
    if (!doc) return;
    this.docIsDeleting.set(true);
    try {
      await this.docService.deleteDocument(doc.id);
      this.documents.update(arr => arr.filter(d => d.id !== doc.id));
      this.deletingDoc.set(null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      this.docIsDeleting.set(false);
    }
  }

  async approveDoc(id: string): Promise<void> {
    try {
      await this.docService.updateStatus(id, 'APPROVED');
      this.documents.update(docs => docs.map(d => d.id === id ? { ...d, status: 'Approved' as CaseDocStatus } : d));
    } catch { }
  }

  async rejectDoc(id: string): Promise<void> {
    try {
      await this.docService.updateStatus(id, 'REJECTED');
      this.documents.update(docs => docs.map(d => d.id === id ? { ...d, status: 'Rejected' as CaseDocStatus } : d));
    } catch { }
  }

  async shareDoc(id: string): Promise<void> {
    try {
      await this.docService.shareDocument(id);
      this.documents.update(docs => docs.map(d => d.id === id ? { ...d, isSharedWithClient: true } : d));
    } catch { }
  }

  aiSummarizeDoc(id: string): void {
    const doc = this.documents().find(d => d.id === id);
    this.aiSummaryModal.open(id, doc?.name ?? 'Document');
  }

  getDocStatusCls(status: CaseDocStatus): string {
    const map: Record<CaseDocStatus, string> = {
      'Pending Review': 'bg-orange-100 text-orange-700',
      'Approved':       'bg-green-100 text-green-700',
      'Rejected':       'bg-red-100 text-red-700',
    };
    return map[status];
  }

  getDocStatusIcon(status: CaseDocStatus): string {
    const map: Record<CaseDocStatus, string> = {
      'Pending Review': 'fa-solid fa-clock',
      'Approved':       'fa-solid fa-circle-check',
      'Rejected':       'fa-solid fa-circle-xmark',
    };
    return map[status];
  }

  async loadDocuments(caseId: string) {
    try {
      const raw = await this.docService.listDocuments({ case_id: caseId });
      this.documents.set(raw.filter(r => r.category !== 'VOICE_TRANSCRIPT').map(r => this._mapCaseDoc(r)));
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }

  private _mapCaseDoc(raw: RawDoc): CaseDocFile {
    const style = this.docService.getTypeStyle(raw.file_type);
    return {
      id:          raw.id,
      name:        raw.file_name,
      desc:        this._caseDocDesc(raw.category),
      type:        raw.file_type,
      typeBg:      style.typeBg,
      typeColor:   style.typeColor,
      iconBg:      style.iconBg,
      icon:        style.icon,
      iconColor:   style.iconColor,
      size:        `${(raw.file_size_mb ?? 0).toFixed(1)} MB`,
      avatar:      raw.uploader_avatar_url ?? '',
      uploader:    raw.uploader_name ?? 'Staff Member',
      modified:    this.docService.timeAgo(raw.created_at),
      status:      this._mapCaseDocStatus(raw.status),
      storageUrl:  raw.storage_url,
      isClientDoc:        raw.category === 'CLIENT_DOC',
      isSharedWithClient: raw.is_shared_with_client ?? false,
      uploaderId:         raw.uploaded_by ?? '',
    };
  }

  private _mapCaseDocStatus(s: string): CaseDocStatus {
    const map: Record<string, CaseDocStatus> = {
      PENDING_REVIEW: 'Pending Review',
      APPROVED:       'Approved',
      REJECTED:       'Rejected',
    };
    return map[s] ?? 'Pending Review';
  }

  private _caseDocDesc(cat: string): string {
    const map: Record<string, string> = {
      CONTRACT:   'Contract document',
      COURT_DOC:  'Court document',
      EVIDENCE:   'Evidence file',
      FINANCIAL:  'Financial document',
      CLIENT_DOC: 'Client document',
      OTHER:      'Document',
    };
    return map[cat] ?? 'Document';
  }

  openUploadModal() {
    const c = this.case();
    if (!c || !this._caseId) { this.upload.open(); return; }
    this.upload.openForCase(
      c.title,
      async (file: File) => {
        const raw = await this.docService.uploadFile(file, this._caseId);
        this.documents.update(docs => [this._mapCaseDoc(raw), ...docs]);
      },
      () => {},
    );
  }

  tasks         = signal<Task[]>([]);
  tasksLoading  = signal(false);

  notes            = signal<Note[]>([]);
  editingNoteId    = signal<string | null>(null);
  editNoteTitle    = signal('');
  editNoteContent  = signal('');
  deletingNoteId   = signal<string | null>(null);

  // ── Team ─────────────────────────────────────────────────

  team             = signal<TeamMember[]>([]);
  firmMembers      = signal<FirmMember[]>([]);
  showTeamModal    = signal(false);
  isLoadingFirm    = signal(false);
  isAddingMember   = signal<string | null>(null);
  isRemovingMember = signal<string | null>(null);
  teamSearch       = signal('');
  confirmRemoveMember = signal<TeamMember | null>(null);

  openConfirmRemove(m: TeamMember) { this.confirmRemoveMember.set(m); }
  cancelConfirmRemove()            { this.confirmRemoveMember.set(null); }

  async confirmAndRemove(): Promise<void> {
    const m = this.confirmRemoveMember();
    if (!m) return;
    this.confirmRemoveMember.set(null);
    await this.removeTeamMember(m.user_id);
  }

  filteredFirmMembers = computed(() => {
    const teamIds = new Set(this.team().map(m => m.user_id));
    const q = this.teamSearch().toLowerCase();
    return this.firmMembers().filter(m =>
      !teamIds.has(m.id) &&
      (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
    );
  });

  async loadTeam(): Promise<void> {
    try {
      const raw = await this.caseService.fetchTeam(this._caseId);
      this.team.set(raw.map(r => {
        const u = r['app_user'] as Record<string, unknown> | null;
        return {
          id:         String(r['id']),
          user_id:    String(r['user_id']),
          full_name:  String(u?.['full_name'] ?? ''),
          email:      String(u?.['email']     ?? ''),
          role:       String(u?.['role']      ?? ''),
          avatar_url: u?.['avatar_url'] ? String(u['avatar_url']) : null,
        } as TeamMember;
      }));
    } catch { this.team.set([]); }
  }

  async openTeamModal(): Promise<void> {
    this.teamSearch.set('');
    this.showTeamModal.set(true);
    this.isLoadingFirm.set(true);
    try {
      this.firmMembers.set(await this.staffService.fetchFirmTeam());
    } catch (err) {
      console.error('Failed to load firm members:', err);
    } finally { this.isLoadingFirm.set(false); }
  }

  closeTeamModal() { this.showTeamModal.set(false); }

  async addTeamMember(userId: string): Promise<void> {
    const member = this.firmMembers().find(m => m.id === userId);
    if (!member) return;
    this.isAddingMember.set(userId);
    try {
      await this.caseService.addTeamMember(this._caseId, userId);
      this.team.update(arr => [...arr, {
        id: userId, user_id: userId,
        full_name: member.full_name, email: member.email,
        role: member.role, avatar_url: member.avatar_url,
      }]);
    } catch (err) {
      console.error('Failed to add team member:', err);
    } finally { this.isAddingMember.set(null); }
  }

  async removeTeamMember(userId: string): Promise<void> {
    this.isRemovingMember.set(userId);
    try {
      await this.caseService.removeTeamMember(this._caseId, userId);
      this.team.update(arr => arr.filter(m => m.user_id !== userId));
    } catch (err) {
      console.error('Failed to remove team member:', err);
    } finally { this.isRemovingMember.set(null); }
  }

  memberInitials(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  get lastUpdatedLabel(): string {
    const entries = this.timeline();
    const latest = entries.length > 0 ? new Date(entries[0].created_at) : this.case()?.openDate;
    if (!latest) return '—';
    const diff = Date.now() - latest.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return latest.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  memberRoleLabel(role: string): string {
    return ROLE_MAP[role]?.label ?? role;
  }

  memberRoleCls(role: string): string {
    return (ROLE_MAP[role]?.cls ?? 'bg-gray-100 text-gray-700');
  }

  billingEntries: BillingEntry[] = [
    { date:'Nov 15, 2024', attorney:'—', desc:'Discovery document review', hours:'4.5', rate:'$350/hr', amount:'$1,575.00' },
    { date:'Nov 14, 2024', attorney:'—', desc:'Client consultation',       hours:'2.0', rate:'$450/hr', amount:'$900.00' },
    { date:'Nov 13, 2024', attorney:'—', desc:'Motion preparation',        hours:'6.0', rate:'$350/hr', amount:'$2,100.00' },
  ];

  // ── Case Invoices (Drafts) ────────────────────────────
  caseInvoices       = signal<InvoiceRaw[]>([]);
  invoicesLoading    = signal(false);
  sendingInvoiceId   = signal<string | null>(null);
  sendingReminderId  = signal<string | null>(null);
  markingCasePaidId  = signal<string | null>(null);
  deletingInvoiceId   = signal<string | null>(null);
  cancellingInvoiceId = signal<string | null>(null);

  pendingConfirm = signal<{
    title: string; message: string; confirmLabel: string;
    type: 'danger' | 'warning'; onConfirm: () => void;
  } | null>(null);

  confirmPending() { this.pendingConfirm()?.onConfirm(); this.pendingConfirm.set(null); }
  dismissConfirm() { this.pendingConfirm.set(null); }
  viewingInvoice     = signal<InvoiceRaw | null>(null);
  invoiceFilter      = signal<'all' | 'paid' | 'pending' | 'overdue' | 'draft' | 'cancelled'>('all');

  filteredSentInvoices = computed(() => {
    const f   = this.invoiceFilter();
    const all = this.caseInvoices();
    if (f === 'paid')      return all.filter(inv => inv.status === 'PAID');
    if (f === 'pending')   return all.filter(inv => inv.status === 'PENDING');
    if (f === 'overdue')   return all.filter(inv => inv.status === 'OVERDUE');
    if (f === 'draft')     return all.filter(inv => inv.status === 'DRAFT');
    if (f === 'cancelled') return all.filter(inv => inv.status === 'CANCELLED');
    return all;
  });

  get overdueInvoiceCount(): number {
    return this.caseInvoices().filter(inv => inv.status === 'OVERDUE').length;
  }

  invStatusBadgeCls(status: string): string {
    const map: Record<string, string> = {
      DRAFT:     'bg-slate-100 text-slate-600',
      PENDING:   'bg-amber-100 text-amber-700',
      PAID:      'bg-green-100 text-green-700',
      OVERDUE:   'bg-red-100 text-red-700',
      CANCELLED: 'bg-gray-100 text-gray-500',
    };
    return map[status] ?? 'bg-gray-100 text-gray-600';
  }

  invStatusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'Draft', PENDING: 'Pending', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled',
    };
    return map[status] ?? status;
  }

  isInvoiceOwner(inv: any): boolean {
    const user = this.authService.currentUser();
    return user?.role === 'admin' || inv.lawyer_id === this.currentUserId;
  }

  async loadCaseInvoices(): Promise<void> {
    this.invoicesLoading.set(true);
    try {
      const list = await this.billingService.listForCase(this._caseId);
      const uid = this.currentUserId;
      const isAdmin = this.authService.currentUser()?.role === 'admin';
      this.caseInvoices.set(
        list.filter(inv => isAdmin || !['DRAFT', 'CANCELLED'].includes(inv.status) || inv.lawyer_id === uid)
      );
    } catch { /* silent */ } finally {
      this.invoicesLoading.set(false);
    }
  }

  fmtInvoiceAmount(inv: InvoiceRaw): string {
    const sym = inv.currency === 'USD' ? '$' : inv.currency + ' ';
    return sym + inv.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  fmtInvoiceDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getInvDueNote(inv: any): { text: string; cls: string } {
    if (inv.status === 'PAID')      return { text: 'Paid',      cls: 'text-green-600' };
    if (inv.status === 'CANCELLED') return { text: 'Cancelled', cls: 'text-gray-400'  };
    if (!inv.due_date)              return { text: '',          cls: ''               };
    const diff = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0)  return { text: `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`, cls: 'text-red-600'   };
    if (diff === 0) return { text: 'Due today',                                                      cls: 'text-amber-600' };
    return              { text: `Due in ${diff} day${diff > 1 ? 's' : ''}`,                         cls: 'text-gray-500'  };
  }

  openViewInvoice(inv: InvoiceRaw) { this.viewingInvoice.set(inv); }
  closeViewInvoice()               { this.viewingInvoice.set(null); }

  printInvoice(inv: InvoiceRaw) {
    const c          = this.case();
    const client     = inv.client;
    const clientName = client ? `${client.first_name} ${client.last_name}`.trim() : '—';
    const caseTitle  = inv.case_file?.title ?? c?.title ?? '—';
    const caseNum    = inv.case_file?.case_number ?? c?.caseNumber ?? '';
    const sym        = inv.currency === 'USD' ? '$' : (inv.currency ?? '') + ' ';
    const fmt        = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const fmtDate    = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const statusLabels: Record<string, string> = { DRAFT: 'Draft', PENDING: 'Pending', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' };

    const itemRows = (inv.invoice_item ?? []).map(it =>
      `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${it.description}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#374151">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#374151">${fmt(it.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#111827">${fmt(it.total)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af">No items</td></tr>';

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${inv.invoice_number}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111827;background:#f3f4f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:780px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}.hdr{background:linear-gradient(135deg,#d97706,#f59e0b);padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}.hdr-brand{color:#fff;font-size:22px;font-weight:800}.hdr-brand span{opacity:.8;font-weight:400}.hdr-right{text-align:right}.hdr-num{color:#fff;font-size:20px;font-weight:700}.hdr-badge{display:inline-block;margin-top:5px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,.25);color:#fff}.body{padding:28px 36px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px}.box{background:#f9fafb;border-radius:8px;padding:14px;border:1px solid #e5e7eb}.box h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:7px}.box .val{font-size:13px;font-weight:600;color:#111827}.box .sub{font-size:12px;color:#6b7280;margin-top:2px}.sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#374151;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-bottom:20px}thead tr{background:#fef3c7}thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e}thead th:nth-child(2){text-align:center}thead th:nth-child(3),thead th:nth-child(4){text-align:right}.totals{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;max-width:260px;margin-left:auto}.tr{display:flex;justify-content:space-between;font-size:13px;color:#374151;padding:3px 0}.ttotal{font-size:15px;font-weight:700;color:#d97706;border-top:1px solid #e5e7eb;padding-top:9px;margin-top:5px;display:flex;justify-content:space-between}.notes{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px}.notes h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#92400e;margin-bottom:5px}.notes p{font-size:13px;color:#374151}@media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}}</style></head><body>
<div class="page"><div class="hdr"><div><div class="hdr-brand">Legal<span>Hub</span></div><div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:3px">Professional Legal Services</div></div><div class="hdr-right"><div class="hdr-num">${inv.invoice_number}</div><div class="hdr-badge">${statusLabels[inv.status] ?? inv.status}</div></div></div>
<div class="body"><div class="grid3"><div class="box"><h3>Client</h3><div class="val">${clientName}</div><div class="sub">${client?.email ?? '—'}</div></div><div class="box"><h3>Case</h3><div class="val">${caseTitle}</div>${caseNum ? `<div class="sub"># ${caseNum}</div>` : ''}</div><div class="box"><h3>Dates</h3><div class="val">Issued: ${fmtDate(inv.issue_date)}</div><div class="sub">Due: ${fmtDate(inv.due_date)}</div></div></div>
<div class="sec">Invoice Items</div><table><thead><tr><th style="width:50%">Description</th><th style="width:12%;text-align:center">Qty</th><th style="width:19%;text-align:right">Unit Price</th><th style="width:19%;text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<div class="totals"><div class="tr"><span>Subtotal</span><span>${fmt(inv.subtotal)}</span></div><div class="tr"><span>Tax (${inv.tax_rate}%)</span><span>${fmt(inv.tax_amount)}</span></div><div class="ttotal"><span>Total</span><span>${fmt(inv.total_amount)}</span></div></div>
${inv.notes ? `<div class="notes"><h3>Notes</h3><p>${inv.notes}</p></div>` : ''}</div></div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  async sendCaseReminder(inv: InvoiceRaw): Promise<void> {
    if (this.sendingReminderId()) return;
    this.sendingReminderId.set(inv.id);
    try {
      await this.billingService.sendReminder(inv.id);
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send reminder.');
    } finally {
      this.sendingReminderId.set(null);
    }
  }

  async markCaseInvoicePaid(inv: InvoiceRaw): Promise<void> {
    if (this.markingCasePaidId()) return;
    this.markingCasePaidId.set(inv.id);
    try {
      await this.billingService.markAsPaidViaSadad(inv.id);
      this.caseInvoices.update(list =>
        list.map(i => i.id === inv.id ? { ...i, status: 'PAID' } : i)
      );
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to mark as paid.');
    } finally {
      this.markingCasePaidId.set(null);
    }
  }

  async sendCaseInvoice(inv: InvoiceRaw): Promise<void> {
    if (this.sendingInvoiceId()) return;
    this.sendingInvoiceId.set(inv.id);
    try {
      await this.billingService.sendInvoice(inv.id);
      this.caseInvoices.update(list =>
        list.map(i => i.id === inv.id ? { ...i, status: 'PENDING' } : i)
      );
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to send invoice.');
    } finally {
      this.sendingInvoiceId.set(null);
    }
  }

  deleteCaseInvoice(inv: InvoiceRaw): void {
    this.pendingConfirm.set({
      title: 'Delete Invoice?',
      message: `Invoice ${inv.invoice_number} will be permanently deleted. This action cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'danger',
      onConfirm: () => this._doDeleteCaseInvoice(inv),
    });
  }

  private async _doDeleteCaseInvoice(inv: InvoiceRaw): Promise<void> {
    this.deletingInvoiceId.set(inv.id);
    try {
      await this.billingService.deleteInvoice(inv.id);
      this.caseInvoices.update(list => list.filter(i => i.id !== inv.id));
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to delete invoice.');
    } finally {
      this.deletingInvoiceId.set(null);
    }
  }

  cancelCaseInvoice(inv: InvoiceRaw): void {
    this.pendingConfirm.set({
      title: 'Cancel Invoice?',
      message: `Invoice ${inv.invoice_number} will be marked as Cancelled.`,
      confirmLabel: 'Cancel Invoice',
      type: 'warning',
      onConfirm: () => this._doCancelCaseInvoice(inv),
    });
  }

  private async _doCancelCaseInvoice(inv: InvoiceRaw): Promise<void> {
    this.cancellingInvoiceId.set(inv.id);
    try {
      await this.billingService.cancelInvoice(inv.id);
      this.caseInvoices.update(list =>
        list.map(i => i.id === inv.id ? { ...i, status: 'CANCELLED' } : i)
      );
    } catch (e: any) {
      alert(e?.error?.detail ?? 'Failed to cancel invoice.');
    } finally {
      this.cancellingInvoiceId.set(null);
    }
  }

  // ── CSS / label helpers ───────────────────────────────────

  typeBg(type: string): string {
    const map: Record<string, string> = {
      CRIMINAL: 'bg-red-100', CIVIL: 'bg-blue-100', CORPORATE: 'bg-cyan-100',
      FAMILY: 'bg-pink-100', REAL_ESTATE: 'bg-purple-100', IMMIGRATION: 'bg-teal-100',
      PERSONAL_INJURY: 'bg-orange-100', IP: 'bg-indigo-100', LABOR: 'bg-emerald-100', TAX: 'bg-yellow-100',
    };
    return map[type] ?? 'bg-gray-100';
  }

  typeColor(type: string): string {
    const map: Record<string, string> = {
      CRIMINAL: 'text-red-700', CIVIL: 'text-blue-700', CORPORATE: 'text-cyan-700',
      FAMILY: 'text-pink-700', REAL_ESTATE: 'text-purple-700', IMMIGRATION: 'text-teal-700',
      PERSONAL_INJURY: 'text-orange-700', IP: 'text-indigo-700', LABOR: 'text-emerald-700', TAX: 'text-yellow-700',
    };
    return map[type] ?? 'text-gray-700';
  }

  typeLabel(type: string): string {
    const map: Record<string, string> = {
      CRIMINAL: 'Criminal', CIVIL: 'Civil', CORPORATE: 'Corporate',
      FAMILY: 'Family', REAL_ESTATE: 'Real Estate', IMMIGRATION: 'Immigration',
      PERSONAL_INJURY: 'Personal Injury', IP: 'Intellectual Property', LABOR: 'Labor', TAX: 'Tax',
    };
    return map[type] ?? type;
  }

  statusBg(status: string): string {
    const map: Record<string, string> = {
      NEW: 'bg-gray-100', INVESTIGATION: 'bg-blue-100', PRE_TRIAL: 'bg-amber-100',
      TRIAL: 'bg-orange-100', APPEAL: 'bg-purple-100', SETTLED: 'bg-green-100', CLOSED: 'bg-gray-200',
    };
    return map[status] ?? 'bg-gray-100';
  }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      NEW: 'text-gray-700', INVESTIGATION: 'text-blue-700', PRE_TRIAL: 'text-amber-700',
      TRIAL: 'text-orange-700', APPEAL: 'text-purple-700', SETTLED: 'text-green-700', CLOSED: 'text-gray-500',
    };
    return map[status] ?? 'text-gray-700';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      NEW: 'New', INVESTIGATION: 'Investigation', PRE_TRIAL: 'Pre-Trial',
      TRIAL: 'Trial', APPEAL: 'Appeal', SETTLED: 'Settled', CLOSED: 'Closed',
    };
    return map[status] ?? status;
  }

  priorityClasses(priority: string): string {
    const map: Record<string, string> = {
      URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-red-100 text-red-700',
      MEDIUM: 'bg-amber-100 text-amber-700', NORMAL: 'bg-green-100 text-green-700', LOW: 'bg-blue-100 text-blue-700',
    };
    return map[priority] ?? 'bg-gray-100 text-gray-700';
  }

  priorityLabel(priority: string): string {
    const map: Record<string, string> = { URGENT:'Urgent', HIGH:'High', MEDIUM:'Medium', NORMAL:'Normal', LOW:'Low' };
    return map[priority] ?? priority;
  }

  readonly lifecycleSteps = [
    { key: 'NEW',           label: 'New' },
    { key: 'INVESTIGATION', label: 'Investigation' },
    { key: 'PRE_TRIAL',     label: 'Pre-Trial' },
    { key: 'TRIAL',         label: 'Trial' },
    { key: 'APPEAL',        label: 'Appeal' },
    { key: 'SETTLED',       label: 'Settled' },
    { key: 'CLOSED',        label: 'Closed' },
  ];

  lifecycleIndex(status: string): number {
    const map: Record<string, number> = {
      NEW: 0, INVESTIGATION: 1, PRE_TRIAL: 2, TRIAL: 3, APPEAL: 4, SETTLED: 5, CLOSED: 6,
    };
    return map[status] ?? 0;
  }

  private readonly validTransitions: Record<string, string[]> = {
    NEW:           ['INVESTIGATION', 'CLOSED'],
    INVESTIGATION: ['PRE_TRIAL', 'CLOSED'],
    PRE_TRIAL:     ['TRIAL', 'CLOSED'],
    TRIAL:         ['APPEAL', 'SETTLED', 'CLOSED'],
    APPEAL:        ['SETTLED', 'CLOSED'],
    SETTLED:       [],
    CLOSED:        [],
  };

  canTransitionTo(stepKey: string): boolean {
    const current = this.case()?.status ?? '';
    return (this.validTransitions[current] ?? []).includes(stepKey);
  }

  isUpdatingStatus  = signal(false);
  updatingToStep    = signal<string | null>(null);
  confirmStepKey    = signal<string | null>(null);

  requestLifecycleChange(stepKey: string): void {
    if (!this.canTransitionTo(stepKey) || this.isUpdatingStatus()) return;
    this.confirmStepKey.set(stepKey);
  }

  cancelLifecycleChange(): void { this.confirmStepKey.set(null); }

  async confirmLifecycleChange(): Promise<void> {
    const stepKey = this.confirmStepKey();
    const c = this.case();
    if (!stepKey || !c) return;
    this.confirmStepKey.set(null);
    this.isUpdatingStatus.set(true);
    this.updatingToStep.set(stepKey);
    try {
      await this.caseService.updateCaseStatus(c.id, stepKey);
      this.case.update(curr => curr ? { ...curr, status: stepKey } : curr);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      this.isUpdatingStatus.set(false);
      this.updatingToStep.set(null);
    }
  }

  confirmStepLabel(): string {
    return this.lifecycleSteps.find(s => s.key === this.confirmStepKey())?.label ?? '';
  }

  formatDate(date: Date | undefined): string {
    if (!date) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatTimelineDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  get filteredInvoiceTotalFormatted(): string {
    const total = this.filteredSentInvoices().reduce((s, inv) => s + inv.total_amount, 0);
    const cur   = this.caseInvoices()[0]?.currency ?? 'USD';
    const sym   = cur === 'USD' ? '$' : cur + ' ';
    return sym + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get totalBilled(): string {
    const total = this.caseInvoices()
      .filter(inv => inv.status !== 'DRAFT' && inv.status !== 'CANCELLED')
      .reduce((sum: number, inv: InvoiceRaw) => sum + inv.total_amount, 0);
    return '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  // ── Lifecycle ─────────────────────────────────────────────

  constructor() {
    effect(() => {
      if (this.upload.isDone() && this._caseId) {
        this.loadDocuments(this._caseId);
      }
    });
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/cases']); return; }

    this._caseId = id;
    this.isLoading.set(true);
    const cachedCase = this.caseService.getCaseById(id);
    if (cachedCase) this.case.set(cachedCase);
    try {
      const [fetchedCase, tl, rawDocs, rawTasks, rawNotes] = await Promise.all([
        this.caseService.fetchCaseById(id).catch(() => null),
        this.caseService.fetchTimeline(id),
        this.docService.listDocuments({ case_id: id }),
        this.taskService.listTasks({ case_id: id }),
        this.taskService.listNotes({ case_id: id }),
      ]);
      const c = fetchedCase ?? cachedCase;
      if (!c) { this.errorMsg.set('Could not load case.'); return; }
      if (fetchedCase && !fetchedCase.clientAvatarUrl && cachedCase?.clientAvatarUrl) {
        fetchedCase.clientAvatarUrl = cachedCase.clientAvatarUrl;
      }
      this.case.set(c);
      if (c.status === 'CLOSED') {
        const stored = localStorage.getItem(`lh_archived_from_${id}`);
        if (stored) this.archivedFromStatus.set(stored);
      }
      this.timeline.set(tl as unknown as TimelineEntry[]);
      this.documents.set(rawDocs.filter(r => r.category !== 'VOICE_TRANSCRIPT').map(r => this._mapCaseDoc(r)));
      this.tasks.set(rawTasks.map(r => this._mapTask(r)));
      this.notes.set(rawNotes.map(r => this._mapNote(r)));
      this.initEditForm();
      this.loadTeam();
      this.loadCaseInvoices();
    } catch {
      if (!cachedCase) this.errorMsg.set('Could not load case. It may not exist or the backend is unavailable.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(t: string) { this.activeTab.set(t); }
  goBack()          { this.router.navigate(['/cases']); }
  goToClient()      { const id = this.case()?.clientId; if (id) this.router.navigate(['/clients', id]); }

  async toggleTask(task: Task): Promise<void> {
    const newStatus = task.done ? 'PENDING' : 'COMPLETED';
    try {
      await this.taskService.updateStatus(task.id, newStatus);
      this.tasks.update(arr => arr.map(t =>
        t.id === task.id ? { ...t, done: !t.done } : t
      ));
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  }

  private _mapTask(raw: RawTask): Task {
    let due = 'No due date';
    let dueColor = 'text-gray-600';
    if (raw.due_date) {
      const today    = new Date(); today.setHours(0, 0, 0, 0);
      const datePart = raw.due_date.split('T')[0]; // keep only "YYYY-MM-DD"
      const dueD     = new Date(datePart + 'T00:00:00');
      const diff     = Math.round((dueD.getTime() - today.getTime()) / 86_400_000);
      if (diff < 0)        { due = 'Overdue';      dueColor = 'text-red-600'; }
      else if (diff === 0) { due = 'Due today';    dueColor = 'text-red-600'; }
      else if (diff === 1) { due = 'Due tomorrow'; dueColor = 'text-amber-600'; }
      else { due = `Due ${dueD.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}`; dueColor = 'text-gray-600'; }
    }
    return {
      id:       raw.id,
      label:    raw.title,
      due,
      dueColor,
      done:     raw.status === 'COMPLETED',
      priority: raw.priority,
      category: raw.category ?? undefined,
    };
  }

  // ── Notes ────────────────────────────────────────────────

  private _mapNote(raw: RawNote): Note {
    return {
      id:        raw.id,
      title:     raw.title ?? undefined,
      content:   raw.content,
      author:    raw.app_user?.full_name ?? 'Unknown',
      lawyerId:  raw.lawyer_id,
      createdAt: raw.created_at,
      isVoice:   raw.is_voice_note ?? false,
    };
  }

  isMyNote(note: Note): boolean {
    return note.lawyerId === this.authService.currentUser()?.id;
  }

  openVoiceNoteModal() {
    this.voiceModal.openModal();
  }

  async onVoiceNoteSaved(): Promise<void> {
    const rawNotes = await this.taskService.listNotes({ case_id: this._caseId }).catch(() => []);
    this.notes.set(rawNotes.map(r => this._mapNote(r)));
  }

  openAddNoteModal() { this.noteModal.openModal(); }

  onNoteSaved() {
    this.taskService.listNotes({ case_id: this._caseId })
      .then(raws => this.notes.set(raws.map(r => this._mapNote(r))))
      .catch(() => {});
  }

  startEditNote(note: Note) {
    this.editingNoteId.set(note.id);
    this.editNoteTitle.set(this.getNoteTitle(note));
    this.editNoteContent.set(this.getNoteBody(note));
  }

  cancelEditNote() {
    this.editingNoteId.set(null);
    this.editNoteTitle.set('');
    this.editNoteContent.set('');
  }

  async saveEditNote(id: string): Promise<void> {
    const content = this.editNoteContent().trim();
    if (!content) return;
    try {
      const raw = await this.taskService.updateNote(id, content);
      this.notes.update(arr => arr.map(n => n.id === id ? this._mapNote(raw) : n));
      this.cancelEditNote();
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  }

  async deleteNote(id: string): Promise<void> {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      await this.taskService.deleteNote(id);
      this.notes.update(arr => arr.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  private _stripMd(text: string): string {
    return text.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
  }

  getNoteTitle(note: Note): string {
    if (note.title?.trim()) return this._stripMd(note.title);
    const firstLine = note.content?.split('\n')[0]?.trim() ?? '';
    const clean = this._stripMd(firstLine);
    return clean.length > 80 ? clean.slice(0, 80) + '…' : clean;
  }

  getNoteBody(note: Note): string {
    if (note.title?.trim()) return note.content ?? '';
    const lines = note.content?.split('\n') ?? [];
    return lines.slice(1).join('\n').trim();
  }

  formatNoteDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  // ── AI Assistant (RAG) ───────────────────────────────────

  openAiChat(): void {
    const c = this.case();
    if (!c) return;
    this.aiChatModal.open(c.id, c.title ?? 'Case', c.caseNumber ?? '');
  }

  // ── Archive ───────────────────────────────────────────────

  confirmArchive    = signal(false);
  archivedFromStatus = signal<string | null>(null);

  private archivedFromKey(): string { return `lh_archived_from_${this._caseId}`; }

  requestArchive(): void {
    if (this.case()?.status === 'CLOSED') return;
    this.confirmArchive.set(true);
  }

  cancelArchive(): void { this.confirmArchive.set(false); }

  async confirmAndArchive(): Promise<void> {
    const c = this.case();
    if (!c) return;
    const prevStatus = c.status;
    this.confirmArchive.set(false);
    this.isUpdatingStatus.set(true);
    this.updatingToStep.set('CLOSED');
    try {
      await this.caseService.updateCaseStatus(c.id, 'CLOSED');
      localStorage.setItem(this.archivedFromKey(), prevStatus);
      this.archivedFromStatus.set(prevStatus);
      this.case.update(curr => curr ? { ...curr, status: 'CLOSED' } : curr);
    } catch (err) {
      console.error('Failed to archive case:', err);
    } finally {
      this.isUpdatingStatus.set(false);
      this.updatingToStep.set(null);
    }
  }

  // ── Stepper step-state helpers ────────────────────────────

  stepState(i: number): 'done' | 'current' | 'archived-from' | 'skipped' | 'upcoming' {
    const status       = this.case()?.status ?? '';
    const currentIdx   = this.lifecycleIndex(status);
    const archivedFrom = this.archivedFromStatus();
    const fromIdx      = archivedFrom ? this.lifecycleIndex(archivedFrom) : -1;

    if (i === currentIdx) return 'current';
    if (status === 'CLOSED' && fromIdx >= 0) {
      if (i === fromIdx)                       return 'archived-from';
      if (i < fromIdx)                         return 'done';
      if (i > fromIdx && i < currentIdx)       return 'skipped';
    }
    if (i < currentIdx) return 'done';
    return 'upcoming';
  }

  stepCircleCls(i: number): string {
    const s = this.stepState(i);
    if (s === 'done')          return 'bg-green-500 border-green-500 text-white';
    if (s === 'archived-from') return 'bg-amber-400 border-amber-400 text-white';
    if (s === 'skipped')       return 'bg-gray-100 border-gray-200 text-gray-300';
    if (s === 'current')       return 'bg-amber-500 border-amber-500 text-white ring-4 ring-amber-100';
    return 'bg-white border-gray-300 text-gray-400';
  }

  stepLabelCls(i: number): string {
    const s = this.stepState(i);
    if (s === 'done')          return 'text-green-600';
    if (s === 'archived-from') return 'text-amber-500 font-bold';
    if (s === 'skipped')       return 'text-gray-300';
    if (s === 'current')       return 'text-amber-600';
    return 'text-gray-400';
  }

  connectorCls(i: number): string {
    const s = this.stepState(i);
    if (s === 'done')          return 'bg-green-400';
    if (s === 'archived-from') return 'bg-amber-300';
    if (s === 'skipped')       return 'bg-gray-100';
    return 'bg-gray-200';
  }

  // ── Restore ───────────────────────────────────────────────

  confirmRestore  = signal(false);
  isRestoring     = signal(false);

  requestRestore(): void  { this.confirmRestore.set(true); }
  cancelRestore():  void  { this.confirmRestore.set(false); }

  async confirmAndRestore(): Promise<void> {
    this.confirmRestore.set(false);
    this.isRestoring.set(true);
    try {
      const restored = await this.caseService.restoreCase(this._caseId);
      localStorage.removeItem(this.archivedFromKey());
      this.archivedFromStatus.set(null);
      this.case.set(restored);
    } catch (err) {
      console.error('Failed to restore case:', err);
    } finally {
      this.isRestoring.set(false);
    }
  }

  // ── Add Task Modal ────────────────────────────────────────

  showAddTaskModal = signal(false);
  isAddingTask     = signal(false);
  taskPriority     = signal<'Low' | 'Medium' | 'High'>('Medium');
  taskReminders    = signal({ dayBefore: false, threeHours: false, oneHour: false });

  taskForm = signal({
    title: '', category: '', dueDate: '', dueTime: '', assignTo: 'Myself', description: '',
  });

  categories = ['Court Filing', 'Document Review', 'Client Meeting', 'Research', 'Correspondence', 'Discovery', 'Other'];

  get taskFormValid(): boolean {
    return this.taskForm().title.trim().length > 0 && this.taskForm().dueDate.length > 0;
  }

  getReminder(key: string): boolean {
    const r = this.taskReminders();
    return !!r[key as keyof typeof r];
  }

  setReminder(key: string, value: boolean) {
    this.taskReminders.update(r => ({ ...r, [key]: value }));
  }

  openAddTaskModal() {
    this.taskForm.set({ title: '', category: '', dueDate: '', dueTime: '', assignTo: 'Myself', description: '' });
    this.taskPriority.set('Medium');
    this.taskReminders.set({ dayBefore: false, threeHours: false, oneHour: false });
    this.showAddTaskModal.set(true);
  }

  closeAddTaskModal() { this.showAddTaskModal.set(false); }

  async addTask(): Promise<void> {
    const f = this.taskForm();
    if (!f.title.trim()) return;
    this.isAddingTask.set(true);

    const priorityMap: Record<string, string> = { Low: 'LOW', Medium: 'MEDIUM', High: 'HIGH' };
    const categoryMap: Record<string, string> = {
      'Court Filing':    'COURT_FILING',
      'Document Review': 'DOC_REVIEW',
      'Client Meeting':  'CLIENT_MEETING',
      'Research':        'RESEARCH',
      'Correspondence':  'CORRESPONDENCE',
      'Discovery':       'DISCOVERY',
      'Other':           'OTHER',
    };

    try {
      const raw = await this.taskService.createTask({
        title:       f.title.trim(),
        case_id:     this._caseId || undefined,
        description: f.description.trim() || undefined,
        category:    f.category ? (categoryMap[f.category] ?? f.category) : undefined,
        priority:    priorityMap[this.taskPriority()] ?? 'MEDIUM',
        due_date:    f.dueDate || undefined,
      });
      this.tasks.update(arr => [this._mapTask(raw), ...arr]);
      this.closeAddTaskModal();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      this.isAddingTask.set(false);
    }
  }

  // ── Log Time ──────────────────────────────────────────────

  showLogTimeModal = signal(false);
  isSavingTime     = signal(false);
  logTimeForm      = signal({ date: '', description: '', hours: '', rate: '' });

  openLogTimeModal() {
    const today = new Date().toISOString().split('T')[0];
    this.logTimeForm.set({ date: today, description: '', hours: '', rate: '' });
    this.showLogTimeModal.set(true);
  }

  openNewInvoiceModal() {
    const c = this.case();
    if (c) this.invoiceModal.openModalForCase(c.clientId, c.id, c.client, c.title);
    else   this.invoiceModal.openModal();
  }

  closeLogTimeModal() { this.showLogTimeModal.set(false); }

  get logTimeValid(): boolean {
    const f = this.logTimeForm();
    return f.date.length > 0 && f.description.trim().length > 0 && parseFloat(f.hours) > 0;
  }

  saveLogTime() {
    if (!this.logTimeValid) return;
    this.isSavingTime.set(true);
    const f = this.logTimeForm();
    const hours  = parseFloat(f.hours);
    const rate   = parseFloat(f.rate);
    const amount = f.rate ? `$${(hours * rate).toFixed(2)}` : '—';
    const entry: BillingEntry = {
      date:     new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      attorney: '—',
      desc:     f.description,
      hours:    f.hours,
      rate:     f.rate ? `$${f.rate}/hr` : '—',
      amount,
    };
    this.billingEntries = [entry, ...this.billingEntries];
    this.isSavingTime.set(false);
    this.closeLogTimeModal();
    this.setTab('Billing');
  }

  // ── AI Summary ────────────────────────────────────────────

  showAiSummary    = signal(false);
  aiSummaryLoading = signal(false);
  aiSummaryText    = signal('');

  generateAiSummary() {
    const c = this.case();
    if (!c) return;
    this.showAiSummary.set(true);
    this.aiSummaryLoading.set(true);
    setTimeout(() => {
      this.aiSummaryText.set(
        `This is a ${this.typeLabel(c.type)} case currently in ${this.statusLabel(c.status)} status ` +
        `with ${this.priorityLabel(c.priority)} priority.` +
        (c.court ? ` The case is being heard at ${c.court}.` : '') +
        (c.nextHearing ? ` Next hearing is scheduled for ${this.formatDate(c.nextHearing)}.` : '') +
        ` There are ${this.tasks().filter(t => !t.done).length} pending tasks and ${this.documents().length} documents on file.` +
        ` Recommendation: ensure all documentation is up to date and review relevant case precedents before the next hearing.`
      );
      this.aiSummaryLoading.set(false);
    }, 1500);
  }

  // ── Edit Modal (2 steps) ──────────────────────────────────

  showEditModal = signal(false);
  editStep      = signal<1|2>(1);
  isSaving      = signal(false);

  caseTypes    = ['Criminal Law','Civil Law','Corporate Law','Family Law','Real Estate Law','Immigration Law','Personal Injury','Intellectual Property','Labor Law','Tax Law'];
  statusList   = ['NEW','INVESTIGATION','PRE_TRIAL','TRIAL','APPEAL','SETTLED','CLOSED'];
  priorityList = ['NORMAL','MEDIUM','HIGH','URGENT'];
  billingTypes = ['Hourly Rate','Flat Fee','Contingency','Retainer'];

  editF1 = signal({ title: '', caseType: '', status: '', priority: '', description: '' });
  editF2 = signal({ courtName: '', courtLocation: '', judgeName: '', hearingDate: '', billingType: '', caseValue: '' });

  get editStep1Valid() {
    const f = this.editF1();
    return f.title.trim().length > 0 && f.caseType.length > 0 && f.status.length > 0;
  }

  get editStepLabels() {
    const s = this.editStep();
    return [
      { label: 'Case Details', active: s === 1, done: s > 1 },
      { label: 'Court & More', active: s === 2, done: s > 2 },
    ];
  }

  initEditForm() {
    const c = this.case();
    if (!c) return;
    this.editF1.set({
      title:       c.title,
      caseType:    this.caseTypeLabelMap[c.type] ?? c.type,
      status:      c.status,
      priority:    c.priority,
      description: c.description ?? '',
    });
    this.editF2.set({
      courtName:    c.court ?? '',
      courtLocation: '',
      judgeName:    '',
      hearingDate:  c.nextHearing ? c.nextHearing.toISOString().split('T')[0] : '',
      billingType:  '',
      caseValue:    '',
    });
  }

  exportPdf() {
    const c = this.case();
    if (!c) return;
    const taskRows = this.tasks().map(t =>
      `<tr><td>${t.label}</td><td>${t.due}</td><td>${t.priority}</td><td>${t.done ? 'Done' : 'Pending'}</td></tr>`
    ).join('') || '<tr><td colspan="4" style="color:#9ca3af;text-align:center">No tasks</td></tr>';
    const billingRows = this.billingEntries.map(e =>
      `<tr><td>${e.date}</td><td>${e.desc}</td><td>${e.hours}h</td><td>${e.rate}</td><td>${e.amount}</td></tr>`
    ).join('') || '<tr><td colspan="5" style="color:#9ca3af;text-align:center">No billing entries</td></tr>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Case Report — ${c.title}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6b7280; font-size: 11px; margin-bottom: 20px; }
  .badges { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .badge { padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; }
  .field label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; display: block; margin-bottom: 2px; }
  .field span { font-size: 12px; }
  .desc { background:#f9fafb; border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; font-size: 12px; line-height: 1.6; }
  h2 { font-size: 13px; font-weight: 700; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f59e0b; color: #fff; padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { color:#9ca3af; font-size: 10px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${c.title}</h1>
<div class="sub">Case #${c.caseNumber} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
<div class="badges">
  <span class="badge" style="background:#dbeafe;color:#1d4ed8">${this.typeLabel(c.type)}</span>
  <span class="badge" style="background:#fef3c7;color:#92400e">${this.statusLabel(c.status)}</span>
  <span class="badge" style="background:#fee2e2;color:#991b1b">${this.priorityLabel(c.priority)}</span>
</div>
<div class="grid">
  <div class="field"><label>Client</label><span>${c.client || '—'}</span></div>
  <div class="field"><label>Court</label><span>${c.court || '—'}</span></div>
  <div class="field"><label>Next Hearing</label><span>${this.formatDate(c.nextHearing)}</span></div>
  <div class="field"><label>Documents</label><span>${this.documents().length}</span></div>
</div>
${c.description ? `<div class="desc">${c.description}</div>` : ''}
<h2>Tasks (${this.tasks().length})</h2>
<table><thead><tr><th>Title</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
<tbody>${taskRows}</tbody></table>
<h2>Billing — Total: ${this.totalBilled}</h2>
<table><thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead>
<tbody>${billingRows}</tbody></table>
<div class="footer">LegalHub — Confidential case report</div>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  openEditModal()  { this.initEditForm(); this.editStep.set(1); this.showEditModal.set(true); }
  closeEditModal() { this.showEditModal.set(false); }

  editNextStep() {
    if (this.editStep() === 1) this.editStep.set(2);
    else this.saveCase();
  }

  editPrevStep() { if (this.editStep() === 2) this.editStep.set(1); }

  private readonly caseTypeMap: Record<string, string> = {
    'Criminal Law': 'CRIMINAL', 'Civil Law': 'CIVIL', 'Corporate Law': 'CORPORATE',
    'Family Law': 'FAMILY', 'Real Estate Law': 'REAL_ESTATE', 'Immigration Law': 'IMMIGRATION',
    'Personal Injury': 'PERSONAL_INJURY', 'Intellectual Property': 'IP',
    'Labor Law': 'LABOR', 'Tax Law': 'TAX',
  };

  private readonly caseTypeLabelMap: Record<string, string> = {
    CRIMINAL: 'Criminal Law', CIVIL: 'Civil Law', CORPORATE: 'Corporate Law',
    FAMILY: 'Family Law', REAL_ESTATE: 'Real Estate Law', IMMIGRATION: 'Immigration Law',
    PERSONAL_INJURY: 'Personal Injury', IP: 'Intellectual Property',
    LABOR: 'Labor Law', TAX: 'Tax Law',
  };

  private readonly billingTypeMap: Record<string, string> = {
    'Hourly Rate': 'HOURLY', 'Flat Fee': 'FLAT_FEE', 'Contingency': 'CONTINGENCY', 'Retainer': 'RETAINER',
  };

  async saveCase() {
    const c = this.case();
    if (!c) return;
    this.isSaving.set(true);
    try {
      const f1 = this.editF1(); const f2 = this.editF2();
      const payload: Record<string, unknown> = {
        title:              f1.title,
        case_type:          this.caseTypeMap[f1.caseType] ?? f1.caseType,
        priority:           f1.priority,
        description:        f1.description || undefined,
        court_name:         f2.courtName || undefined,
        court_location:     f2.courtLocation || undefined,
        judge_name:         f2.judgeName || undefined,
        first_hearing_date: f2.hearingDate || undefined,
        billing_type:       f2.billingType ? (this.billingTypeMap[f2.billingType] ?? undefined) : undefined,
        estimated_value:    f2.caseValue ? Number(f2.caseValue) : undefined,
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await this.caseService.updateCase(c.id, payload);

      if (f1.status !== c.status) {
        await this.caseService.updateCaseStatus(c.id, f1.status);
      }

      const updated = await this.caseService.fetchCaseById(c.id);
      this.case.set(updated);
      this.closeEditModal();
    } catch (err) {
      console.error('Failed to save case:', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
