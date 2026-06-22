import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { NgClass, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UploadModalService } from '../../../shared/modals/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/modals/upload-modal/upload-modal';
import { RequestDocModal } from '../../../shared/modals/request-doc-modal/request-doc-modal';
import { DocumentService, DocumentRequest, RawDoc } from '../../../services/document.service';
import { CaseService } from '../../../services/case.service';
import { AuthService } from '../../../services/auth.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { SearchNavigatorService } from '../../../shared/services/search-navigator.service';
import { AiSummaryModal } from '../../../shared/modals/ai-summary-modal/ai-summary-modal';

type DocStatus = 'Pending Review' | 'Approved' | 'Rejected';

interface DocFile {
  id:          string;
  name:        string;
  desc:        string;
  case:        string;
  caseId:      string;
  type:        string;
  typeBg:      string;
  typeColor:   string;
  iconBg:      string;
  icon:        string;
  iconColor:   string;
  size:        string;
  fileSizeMb:  number;
  avatar:      string;
  uploader:    string;
  modified:    string;
  status:      DocStatus;
  storageUrl:         string;
  rawCategory:        string;
  isClientDoc:        boolean;
  isSharedWithClient: boolean;
  uploaderId:         string;
}

interface Folder {
  caseId:      string;
  name:        string;
  type:        string;
  files:       string;
  size:        string;
  folderBg:    string;
  folderColor: string;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [NgClass, DatePipe, FormsModule, UploadModal, RequestDocModal, HighlightPipe, AiSummaryModal],
  templateUrl: './documents.html',
})
export class Documents implements OnInit {
  @ViewChild(RequestDocModal) requestDocModal!: RequestDocModal;
  @ViewChild(AiSummaryModal) aiSummaryModal!: AiSummaryModal;

  upload      = inject(UploadModalService);
  private docService  = inject(DocumentService);
  private caseService = inject(CaseService);
  private auth        = inject(AuthService);
  searchNav           = inject(SearchNavigatorService);

  searchQuery        = signal('');
  _searchDebounced = signal('');
  private _debounceTimer: any;
  activeFilter = signal<'all' | 'by-case' | 'pending' | 'approved' | 'shared'>('all');
  viewMode     = signal<'grid' | 'list'>('list');
  loading      = signal(false);
  error        = signal<string | null>(null);

  selectedDocs   = signal<Set<string>>(new Set());
  showBulkBar    = computed(() => this.selectedDocs().size > 0);
  selectedCaseId = signal<string | null>(null);

  private _docs     = signal<DocFile[]>([]);
  private _requests = signal<DocumentRequest[]>([]);
  loadingRequests   = signal(false);

  docRequests = computed(() => this._requests());
  get pendingRequestsCount(): number { return this._requests().filter(r => r.status === 'PENDING').length; }

  filters: { key: 'all'|'by-case'|'pending'|'approved'|'shared'; label: string; icon: string }[] = [
    { key: 'all',      label: 'All',               icon: 'fa-solid fa-layer-group' },
    { key: 'by-case',  label: 'By Case',           icon: 'fa-solid fa-briefcase' },
    { key: 'pending',  label: 'Pending Review',    icon: 'fa-solid fa-clock' },
    { key: 'approved', label: 'Approved',          icon: 'fa-solid fa-circle-check' },
    { key: 'shared',   label: 'Shared with Client',  icon: 'fa-solid fa-share-nodes' },
  ];

  // ── Computed stats from real data ─────────────────────────
  stats = computed(() => {
    const docs        = this._docs();
    const uniqueCases = new Set(docs.map(d => d.caseId)).size;
    const pending     = docs.filter(d => d.status === 'Pending Review').length;
    return [
      { icon: 'fa-solid fa-folder',         iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   value: String(uniqueCases), label: 'Total Folders',   badge: '',       badgeColor: 'text-green-600 bg-green-100',   note: `${uniqueCases} case${uniqueCases !== 1 ? 's' : ''} organized` },
      { icon: 'fa-solid fa-file',           iconBg: 'bg-purple-100', iconColor: 'text-purple-600', value: String(docs.length), label: 'Total Documents', badge: '',       badgeColor: 'text-green-600 bg-green-100',   note: 'All uploaded files' },
      { icon: 'fa-solid fa-robot',          iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  value: '—',                 label: 'AI Summaries',    badge: 'AI',     badgeColor: 'text-purple-600 bg-purple-100', note: 'Auto-generated' },
      { icon: 'fa-solid fa-hourglass-half', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', value: String(pending),     label: 'Pending Review',  badge: 'Review', badgeColor: 'text-orange-600 bg-orange-100', note: 'Awaiting approval' },
    ];
  });

  // ── Folders grouped by case ───────────────────────────────
  folders = computed(() => {
    const docs   = this._docs();
    const cases  = this.caseService.cases();
    const colors = [
      { bg: 'bg-blue-100',   color: 'text-blue-600' },
      { bg: 'bg-green-100',  color: 'text-green-600' },
      { bg: 'bg-amber-100',  color: 'text-amber-600' },
      { bg: 'bg-purple-100', color: 'text-purple-600' },
      { bg: 'bg-red-100',    color: 'text-red-600' },
      { bg: 'bg-indigo-100', color: 'text-indigo-600' },
      { bg: 'bg-pink-100',   color: 'text-pink-600' },
      { bg: 'bg-teal-100',   color: 'text-teal-600' },
    ];
    const map = new Map<string, { count: number; totalMb: number }>();
    for (const doc of docs) {
      const e = map.get(doc.caseId) ?? { count: 0, totalMb: 0 };
      e.count++;
      e.totalMb += doc.fileSizeMb;
      map.set(doc.caseId, e);
    }
    return Array.from(map.entries()).map(([caseId, data], i) => {
      const c   = cases.find(c => c.id === caseId);
      const col = colors[i % colors.length];
      return {
        caseId,
        name:        c?.title ?? `Case ${caseId.slice(0, 8)}`,
        type:        c?.type  ?? 'Case',
        files:       `${data.count} file${data.count !== 1 ? 's' : ''}`,
        size:        this._fmtSize(data.totalMb),
        folderBg:    col.bg,
        folderColor: col.color,
      } as Folder;
    });
  });

  // ── Categories computed from real docs ────────────────────
  categories = computed(() => {
    const docs  = this._docs();
    const total = docs.length || 1;
    const defs = [
      { key: 'CONTRACT',   icon: 'fa-solid fa-file-contract', iconBg: 'bg-red-100',    iconColor: 'text-red-600',    label: 'Contracts',        unit: 'documents' },
      { key: 'COURT_DOC',  icon: 'fa-solid fa-gavel',         iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   label: 'Court Documents',  unit: 'documents' },
      { key: 'EVIDENCE',   icon: 'fa-solid fa-image',         iconBg: 'bg-purple-100', iconColor: 'text-purple-600', label: 'Evidence',         unit: 'files' },
      { key: 'FINANCIAL',  icon: 'fa-solid fa-file-invoice',  iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  label: 'Financial Docs',   unit: 'documents' },
      { key: 'CLIENT_DOC', icon: 'fa-solid fa-user',          iconBg: 'bg-green-100',  iconColor: 'text-green-600',  label: 'Client Documents', unit: 'documents' },
    ];
    return defs.map(d => {
      const count = docs.filter(doc => doc.rawCategory === d.key).length;
      return { ...d, count: String(count), pct: Math.round((count / total) * 100) };
    });
  });

  // ── Storage computed from real doc sizes ──────────────────
  readonly storageTotal   = 350;             // GB plan limit
  readonly storageTotalMb = 350 * 1024;      // MB equivalent

  storageUsedMb = computed(() =>
    this._docs().reduce((s, d) => s + d.fileSizeMb, 0)
  );

  storageUsedLabel = computed(() => {
    const mb = this.storageUsedMb();
    return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
  });

  storageRemainingLabel = computed(() => {
    const mb = this.storageTotalMb - this.storageUsedMb();
    return mb < 1024 ? `${mb.toFixed(0)} MB` : `${(mb / 1024).toFixed(0)} GB`;
  });

  storageBreakdown = computed(() => {
    const docs    = this._docs();
    const totalMb = this.storageUsedMb();
    return [
      { type: 'PDF',   label: 'PDF',    barColor: 'bg-red-500',    textColor: 'text-red-600'    },
      { type: 'WORD',  label: 'Word',   barColor: 'bg-blue-500',   textColor: 'text-blue-600'   },
      { type: 'IMAGE', label: 'Images', barColor: 'bg-purple-500', textColor: 'text-purple-600' },
      { type: 'OTHER', label: 'Other',  barColor: 'bg-gray-400',   textColor: 'text-gray-500'   },
    ].map(t => {
      const items = docs.filter(d =>
        t.type === 'OTHER'
          ? !['PDF', 'WORD', 'IMAGE'].includes((d.type || '').toUpperCase())
          : (d.type || '').toUpperCase() === t.type
      );
      const mb        = items.reduce((s, d) => s + d.fileSizeMb, 0);
      const pct       = totalMb > 0 ? Math.round((mb / totalMb) * 100) : 0;
      const sizeLabel = mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
      return { ...t, count: items.length, pct, sizeLabel };
    });
  });

  get storagePercent(): number {
    const pct = (this.storageUsedMb() / this.storageTotalMb) * 100;
    if (pct === 0) return 0;
    return Math.max(1, Math.round(pct));
  }
  get storageColor(): { bar: string; text: string; badge: string } {
    const p = this.storagePercent;
    if (p >= 85) return { bar: 'bg-red-500',   text: 'text-red-600',   badge: 'text-red-600 bg-red-100' };
    if (p >= 65) return { bar: 'bg-amber-500', text: 'text-amber-600', badge: 'text-amber-600 bg-amber-100' };
    return             { bar: 'bg-green-500', text: 'text-green-600', badge: 'text-green-600 bg-green-100' };
  }

  // ── Filtered documents ────────────────────────────────────
  filteredDocuments = computed(() => {
    const f      = this.activeFilter();
    const q      = this._searchDebounced().toLowerCase().trim();
    const caseId = this.selectedCaseId();
    let docs = this._docs();
    if (f === 'pending')           docs = docs.filter(d => d.isClientDoc && d.status === 'Pending Review');
    if (f === 'approved')          docs = docs.filter(d => d.isClientDoc && d.status === 'Approved');
    if (f === 'shared')            docs = docs.filter(d => !d.isClientDoc && d.isSharedWithClient);
    if (f === 'by-case' && caseId) docs = docs.filter(d => d.caseId === caseId);
    if (q) docs = docs.filter(d =>
      d.name.toLowerCase().includes(q)     ||
      d.case.toLowerCase().includes(q)     ||
      d.type.toLowerCase().includes(q)     ||
      d.desc.toLowerCase().includes(q)     ||
      d.uploader.toLowerCase().includes(q) ||
      d.status.toLowerCase().includes(q)
    );
    return docs;
  });

  get isSearching(): boolean { return this._searchDebounced().trim().length > 0; }

  setSearch(value: string): void {
    this.searchQuery.set(value);
    clearTimeout(this._debounceTimer);
    if (!value) { this.searchNav.reset(); this._searchDebounced.set(''); return; }
    this._debounceTimer = setTimeout(() => {
      this._searchDebounced.set(value);
      setTimeout(() => this.searchNav.scan(), 50);
    }, 300);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this._searchDebounced.set('');
    clearTimeout(this._debounceTimer);
    this.searchNav.reset();
  }

  selectFolder(caseId: string): void { this.selectedCaseId.set(caseId || null); }

  get selectedFolderName(): string {
    const id = this.selectedCaseId();
    return this.folders().find(f => f.caseId === id)?.name ?? '';
  }

  get pendingCount(): number { return this._docs().filter(d => d.isClientDoc && d.status === 'Pending Review').length; }
  get allSelected():   boolean {
    const docs = this.filteredDocuments();
    return docs.length > 0 && docs.every(d => this.selectedDocs().has(d.id));
  }

  // ── Init ──────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.caseService.loadCases(),
      this._loadDocuments(),
      this._loadRequests(),
    ]);
    this._wireUpload();
  }

  async _loadDocuments(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw   = await this.docService.listDocuments();
      const cases = this.caseService.cases();
      const user  = this.auth.currentUser();
      this._docs.set(raw.filter(r => r.category !== 'VOICE_TRANSCRIPT').map(r => this._mapDoc(r, cases, user)));
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? e?.message ?? 'Failed to load documents');
    } finally {
      this.loading.set(false);
    }
  }

  async _loadRequests(): Promise<void> {
    this.loadingRequests.set(true);
    try {
      const reqs = await this.docService.listDocumentRequests();
      this._requests.set(reqs);
    } catch { /* ignore */ } finally {
      this.loadingRequests.set(false);
    }
  }

  async onRequestSent(): Promise<void> {
    await Promise.all([this._loadDocuments(), this._loadRequests()]);
  }

  async cancelRequest(id: string): Promise<void> {
    if (!confirm('Cancel this document request?')) return;
    try {
      await this.docService.cancelDocumentRequest(id);
      this._requests.update(r => r.filter(req => req.id !== id));
    } catch { /* ignore */ }
  }

  private _wireUpload(): void {
    this.upload.setCases(this.caseService.cases().map(c => ({ id: c.id, name: c.title })));
  }

  // Upload wrappers that set the real upload function each time
  openRequestDoc(): void { this.requestDocModal.openModal(); }

  openUpload(accept = '*'): void {
    this.upload.openWithUpload(accept, async (file: File) => {
      const caseId = this.upload.getSelectedCaseId();
      if (!caseId) throw new Error('Please select a case');
      const raw   = await this.docService.uploadFile(file, caseId);
      const cases = this.caseService.cases();
      const user  = this.auth.currentUser();
      this._docs.update(docs => [this._mapDoc(raw, cases, user), ...docs]);
    });
  }

  // ── Document mapper ───────────────────────────────────────
  private _mapDoc(raw: RawDoc, cases: any[], user: any): DocFile {
    const style       = this.docService.getTypeStyle(raw.file_type);
    const caseTitle   = cases.find(c => c.id === raw.case_id)?.title ?? `Case ${raw.case_id?.slice(0, 8) ?? ''}`;
    const uploaderName   = raw.uploader_name ?? (!!user && user.id === raw.uploaded_by ? (user.name ?? 'Me') : 'Staff Member');
    const uploaderAvatar = raw.uploader_avatar_url ?? (!!user && user.id === raw.uploaded_by ? (user.avatar ?? '') : '');

    return {
      id:          raw.id,
      name:        raw.file_name,
      desc:        this._catDesc(raw.category),
      case:        caseTitle,
      caseId:      raw.case_id,
      type:        raw.file_type,
      typeBg:      style.typeBg,
      typeColor:   style.typeColor,
      iconBg:      style.iconBg,
      icon:        style.icon,
      iconColor:   style.iconColor,
      size:        `${(raw.file_size_mb ?? 0).toFixed(1)} MB`,
      fileSizeMb:  raw.file_size_mb ?? 0,
      avatar:      uploaderAvatar,
      uploader:    uploaderName,
      modified:    this.docService.timeAgo(raw.created_at),
      status:             this._mapStatus(raw.status),
      storageUrl:         raw.storage_url,
      rawCategory:        raw.category,
      isClientDoc:        raw.category === 'CLIENT_DOC',
      isSharedWithClient: raw.is_shared_with_client ?? false,
      uploaderId:         raw.uploaded_by ?? '',
    };
  }

  isCurrentUserUploader(doc: DocFile): boolean {
    return doc.uploaderId === (this.auth.currentUser()?.id ?? '');
  }

  private _mapStatus(s: string): DocStatus {
    const map: Record<string, DocStatus> = {
      PENDING_REVIEW: 'Pending Review',
      APPROVED:       'Approved',
      REJECTED:       'Rejected',
    };
    return map[s] ?? 'Pending Review';
  }

  private _catDesc(cat: string): string {
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

  private _fmtSize(mb: number): string {
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  // ── Selection ─────────────────────────────────────────────
  toggleDoc(id: string): void {
    this.selectedDocs.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  isSelected(id: string): boolean { return this.selectedDocs().has(id); }
  toggleAll(): void {
    const docs = this.filteredDocuments();
    const all  = docs.every(d => this.selectedDocs().has(d.id));
    this.selectedDocs.set(all ? new Set() : new Set(docs.map(d => d.id)));
  }
  clearSelection(): void { this.selectedDocs.set(new Set()); }

  // ── Actions ───────────────────────────────────────────────
  async approveDoc(id: string): Promise<void> {
    try {
      await this.docService.updateStatus(id, 'APPROVED');
      this._docs.update(docs => docs.map(d => d.id === id ? { ...d, status: 'Approved' as DocStatus } : d));
    } catch { /* ignore */ }
  }

  async rejectDoc(id: string): Promise<void> {
    try {
      await this.docService.updateStatus(id, 'REJECTED');
      this._docs.update(docs => docs.map(d => d.id === id ? { ...d, status: 'Rejected' as DocStatus } : d));
    } catch { /* ignore */ }
  }

  downloadingDoc       = signal<string | null>(null);
  confirmDownloadDoc   = signal<DocFile | null>(null);

  confirmDownload(doc: DocFile): void  { this.confirmDownloadDoc.set(doc); }
  cancelDownload():             void   { this.confirmDownloadDoc.set(null); }

  docToDelete = signal<DocFile | null>(null);
  isDeleting  = signal(false);

  confirmDelete(doc: DocFile): void { this.docToDelete.set(doc); }
  cancelDelete():               void { this.docToDelete.set(null); }

  async confirmDeleteDoc(): Promise<void> {
    const doc = this.docToDelete();
    if (!doc) return;
    this.isDeleting.set(true);
    try {
      await this.docService.deleteDocument(doc.id);
      this._docs.update(docs => docs.filter(d => d.id !== doc.id));
      this.selectedDocs.update(s => { const n = new Set(s); n.delete(doc.id); return n; });
      this.docToDelete.set(null);
    } catch { /* ignore */ } finally {
      this.isDeleting.set(false);
    }
  }

  async shareDoc(id: string): Promise<void> {
    try {
      await this.docService.shareDocument(id);
      this._docs.update(docs => docs.map(d => d.id === id ? { ...d, isSharedWithClient: true } : d));
    } catch { /* ignore */ }
  }

  aiSummarizeDoc(id: string): void {
    const doc = this._docs().find(d => d.id === id);
    this.aiSummaryModal.open(id, doc?.name ?? 'Document');
  }

  async bulkSummarize(): Promise<void> {
    const ids = [...this.selectedDocs()];
    for (const id of ids) {
      this.aiSummarizeDoc(id);
    }
  }

  viewDoc(doc: DocFile): void {
    if (!doc.storageUrl) return;
    if (doc.type === 'WORD') {
      window.open(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.storageUrl)}`, '_blank');
    } else {
      window.open(doc.storageUrl, '_blank');
    }
  }

  async downloadDoc(doc: DocFile): Promise<void> {
    this.confirmDownloadDoc.set(null);
    this.downloadingDoc.set(doc.id);
    try { await this.docService.downloadFile({ name: doc.name, url: doc.storageUrl }); } catch {}
    setTimeout(() => this.downloadingDoc.set(null), 1800);
  }

  // ── Status helpers ────────────────────────────────────────
  getStatusCls(status: DocStatus): string {
    const map: Record<DocStatus, string> = {
      'Pending Review': 'bg-orange-100 text-orange-700',
      'Approved':       'bg-green-100 text-green-700',
      'Rejected':       'bg-red-100 text-red-700',
    };
    return map[status];
  }
  getStatusIcon(status: DocStatus): string {
    const map: Record<DocStatus, string> = {
      'Pending Review': 'fa-solid fa-clock',
      'Approved':       'fa-solid fa-circle-check',
      'Rejected':       'fa-solid fa-circle-xmark',
    };
    return map[status];
  }

  setFilter(key: 'all'|'by-case'|'pending'|'approved'|'shared'): void {
    this.activeFilter.set(key);
    this.selectedCaseId.set(null);
    this.clearSelection();
  }
  setView(mode: 'grid'|'list'): void { this.viewMode.set(mode); }
}
