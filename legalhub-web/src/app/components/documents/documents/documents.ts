import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UploadModalService } from '../../../shared/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/upload-modal/upload-modal';
import { DocumentService, RawDoc } from '../../../services/document.service';
import { CaseService } from '../../../services/case.service';
import { AuthService } from '../../../services/auth.service';

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
  isVoiceNote: boolean;
  transcribed: boolean;
  storageUrl:  string;
  rawCategory: string;
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
  imports: [NgClass, FormsModule, UploadModal],
  templateUrl: './documents.html',
})
export class Documents implements OnInit {
  upload      = inject(UploadModalService);
  private docService  = inject(DocumentService);
  private caseService = inject(CaseService);
  private auth        = inject(AuthService);

  searchQuery  = signal('');
  activeFilter = signal<'all' | 'by-case' | 'pending' | 'approved' | 'voice-notes'>('all');
  viewMode     = signal<'grid' | 'list'>('list');
  loading      = signal(false);
  error        = signal<string | null>(null);

  selectedDocs = signal<Set<string>>(new Set());
  showBulkBar  = computed(() => this.selectedDocs().size > 0);

  isRecording   = signal(false);
  recordSeconds = signal(0);
  private _recInterval: any;

  private _docs = signal<DocFile[]>([]);

  filters: { key: 'all'|'by-case'|'pending'|'approved'|'voice-notes'; label: string; icon: string }[] = [
    { key: 'all',         label: 'All Files',      icon: 'fa-solid fa-layer-group' },
    { key: 'by-case',     label: 'By Case',        icon: 'fa-solid fa-briefcase' },
    { key: 'pending',     label: 'Pending Review', icon: 'fa-solid fa-clock' },
    { key: 'approved',    label: 'Approved',       icon: 'fa-solid fa-circle-check' },
    { key: 'voice-notes', label: 'Voice Notes',    icon: 'fa-solid fa-microphone' },
  ];

  // ── Computed stats from real data ─────────────────────────
  stats = computed(() => {
    const docs       = this._docs();
    const uniqueCases = new Set(docs.map(d => d.caseId)).size;
    const pending    = docs.filter(d => d.status === 'Pending Review').length;
    const voiceNotes = docs.filter(d => d.isVoiceNote).length;
    return [
      { icon: 'fa-solid fa-folder',         iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   value: String(uniqueCases), label: 'Total Folders',   badge: '',       badgeColor: 'text-green-600 bg-green-100',   note: `${uniqueCases} case${uniqueCases !== 1 ? 's' : ''} organized` },
      { icon: 'fa-solid fa-file',           iconBg: 'bg-purple-100', iconColor: 'text-purple-600', value: String(docs.length), label: 'Total Documents', badge: '',       badgeColor: 'text-green-600 bg-green-100',   note: 'All uploaded files' },
      { icon: 'fa-solid fa-robot',          iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  value: '—',                 label: 'AI Summaries',    badge: 'AI',     badgeColor: 'text-purple-600 bg-purple-100', note: 'Auto-generated' },
      { icon: 'fa-solid fa-hourglass-half', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', value: String(pending),     label: 'Pending Review',  badge: 'Review', badgeColor: 'text-orange-600 bg-orange-100', note: 'Awaiting approval' },
      { icon: 'fa-solid fa-microphone',     iconBg: 'bg-pink-100',   iconColor: 'text-pink-600',   value: String(voiceNotes),  label: 'Voice Notes',     badge: 'New',    badgeColor: 'text-pink-600 bg-pink-100',     note: 'AI transcribed' },
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
  storageTotal  = 350; // GB plan limit
  storageUsedGB = computed(() => {
    const mb = this._docs().reduce((s, d) => s + d.fileSizeMb, 0);
    return parseFloat((mb / 1024).toFixed(2));
  });
  get storagePercent(): number {
    return Math.round((this.storageUsedGB() / this.storageTotal) * 100);
  }
  get storageColor(): { bar: string; text: string; badge: string } {
    const p = this.storagePercent;
    if (p >= 85) return { bar: 'bg-red-500',   text: 'text-red-600',   badge: 'text-red-600 bg-red-100' };
    if (p >= 65) return { bar: 'bg-amber-500', text: 'text-amber-600', badge: 'text-amber-600 bg-amber-100' };
    return             { bar: 'bg-green-500', text: 'text-green-600', badge: 'text-green-600 bg-green-100' };
  }

  // ── Filtered documents ────────────────────────────────────
  filteredDocuments = computed(() => {
    const f = this.activeFilter();
    const q = this.searchQuery().toLowerCase();
    let docs = this._docs();
    if (f === 'pending')     docs = docs.filter(d => d.status === 'Pending Review');
    if (f === 'approved')    docs = docs.filter(d => d.status === 'Approved');
    if (f === 'voice-notes') docs = docs.filter(d => d.isVoiceNote);
    if (q) docs = docs.filter(d => d.name.toLowerCase().includes(q) || d.case.toLowerCase().includes(q));
    return docs;
  });

  get pendingCount():  number { return this._docs().filter(d => d.status === 'Pending Review').length; }
  get voiceCount():    number { return this._docs().filter(d => d.isVoiceNote).length; }
  get allSelected():   boolean {
    const docs = this.filteredDocuments();
    return docs.length > 0 && docs.every(d => this.selectedDocs().has(d.id));
  }

  // ── Init ──────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.caseService.loadCases(),
      this._loadDocuments(),
    ]);
    this._wireUpload();
  }

  private async _loadDocuments(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const raw   = await this.docService.listDocuments();
      const cases = this.caseService.cases();
      const user  = this.auth.currentUser();
      this._docs.set(raw.map(r => this._mapDoc(r, cases, user)));
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? e?.message ?? 'Failed to load documents');
    } finally {
      this.loading.set(false);
    }
  }

  private _wireUpload(): void {
    this.upload.setCases(this.caseService.cases().map(c => ({ id: c.id, name: c.title })));
  }

  // Upload wrappers that set the real upload function each time
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
    const isVoice   = raw.category === 'VOICE_TRANSCRIPT';
    const style     = this.docService.getTypeStyle(isVoice ? 'OTHER' : raw.file_type);
    const caseTitle = cases.find(c => c.id === raw.case_id)?.title ?? `Case ${raw.case_id?.slice(0, 8) ?? ''}`;
    const isMine    = !!user && user.id === raw.uploaded_by;

    return {
      id:          raw.id,
      name:        raw.file_name,
      desc:        this._catDesc(raw.category),
      case:        caseTitle,
      caseId:      raw.case_id,
      type:        isVoice ? 'AUDIO' : raw.file_type,
      typeBg:      isVoice ? 'bg-pink-100'           : style.typeBg,
      typeColor:   isVoice ? 'text-pink-700'         : style.typeColor,
      iconBg:      isVoice ? 'bg-pink-100'           : style.iconBg,
      icon:        isVoice ? 'fa-solid fa-microphone': style.icon,
      iconColor:   isVoice ? 'text-pink-600'         : style.iconColor,
      size:        `${(raw.file_size_mb ?? 0).toFixed(1)} MB`,
      fileSizeMb:  raw.file_size_mb ?? 0,
      avatar:      isMine ? (user.avatar ?? '') : '',
      uploader:    isMine ? (user.name ?? 'Me') : 'Staff Member',
      modified:    this.docService.timeAgo(raw.created_at),
      status:      this._mapStatus(raw.status),
      isVoiceNote: isVoice,
      transcribed: isVoice && raw.status === 'APPROVED',
      storageUrl:  raw.storage_url,
      rawCategory: raw.category,
    };
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
      CONTRACT:         'Contract document',
      COURT_DOC:        'Court document',
      EVIDENCE:         'Evidence file',
      FINANCIAL:        'Financial document',
      CLIENT_DOC:       'Client document',
      VOICE_TRANSCRIPT: 'Voice note — transcription',
      OTHER:            'Document',
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

  async deleteDoc(id: string): Promise<void> {
    if (!confirm('Delete this document? This action cannot be undone.')) return;
    try {
      await this.docService.deleteDocument(id);
      this._docs.update(docs => docs.filter(d => d.id !== id));
      this.selectedDocs.update(s => { const n = new Set(s); n.delete(id); return n; });
    } catch { /* ignore */ }
  }

  async shareDoc(id: string): Promise<void> {
    try {
      await this.docService.shareDocument(id);
    } catch { /* ignore */ }
  }

  async aiSummarizeDoc(id: string): Promise<void> {
    try {
      const res = await this.docService.aiSummarize(id);
      alert(`AI Summary:\n\n${res.summary}`);
    } catch (e: any) {
      alert(e?.error?.detail ?? 'AI summarize failed. Check OpenAI configuration.');
    }
  }

  async bulkSummarize(): Promise<void> {
    const ids = [...this.selectedDocs()];
    for (const id of ids) {
      await this.aiSummarizeDoc(id);
    }
  }

  viewDoc(doc: DocFile): void {
    if (doc.storageUrl) window.open(doc.storageUrl, '_blank');
  }

  downloadDoc(doc: DocFile): void {
    this.docService.downloadFile({ name: doc.name, url: doc.storageUrl });
  }

  // ── Voice recording ───────────────────────────────────────
  startRecording(): void {
    this.isRecording.set(true);
    this.recordSeconds.set(0);
    this._recInterval = setInterval(() => this.recordSeconds.update(s => s + 1), 1000);
  }
  stopRecording(): void {
    this.isRecording.set(false);
    clearInterval(this._recInterval);
  }
  get recordTime(): string {
    const s = this.recordSeconds();
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
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

  setFilter(key: 'all'|'by-case'|'pending'|'approved'|'voice-notes'): void {
    this.activeFilter.set(key);
    this.clearSelection();
  }
  setView(mode: 'grid'|'list'): void { this.viewMode.set(mode); }
}
