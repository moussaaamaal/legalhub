import { Component, OnInit, signal, inject, effect, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CaseService } from '../../../services/case.service';
import { Case } from '../../../models';
import { UploadModalService } from '../../../shared/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/upload-modal/upload-modal';
import { DocumentService, DocEntry } from '../../../services/document.service';
import { TaskService, RawTask, RawNote } from '../../../services/task.service';
import { VoiceNoteModal } from '../../../shared/voice-note-modal/voice-note-modal';

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
  createdAt: string;
  isVoice:   boolean;
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
  imports: [NgClass, FormsModule, UploadModal, VoiceNoteModal],
  templateUrl: './case-detail.html',
})
export class CaseDetail implements OnInit {
  @ViewChild(VoiceNoteModal) voiceModal!: VoiceNoteModal;

  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private caseService = inject(CaseService);
  upload              = inject(UploadModalService);
  private docService  = inject(DocumentService);
  private taskService = inject(TaskService);
  _caseId     = '';

  activeTab = signal('Overview');
  tabs = ['Overview', 'Timeline', 'Documents', 'Tasks', 'Notes', 'Billing'];

  case      = signal<Case | null>(null);
  timeline  = signal<TimelineEntry[]>([]);
  isLoading = signal(false);
  errorMsg  = signal('');

  documents = signal<DocEntry[]>([]);

  // ── Document Actions ──────────────────────────────────────

  previewDoc     = signal<DocEntry | null>(null);
  downloadingDoc = signal<string | null>(null);
  deletingDoc    = signal<DocEntry | null>(null);

  openPreview(doc: DocEntry)  { this.previewDoc.set(doc); }
  closePreview()              { this.previewDoc.set(null); }

  async downloadDoc(doc: DocEntry) {
    this.downloadingDoc.set(doc.id);
    try { await this.docService.downloadFile(doc); } catch {}
    setTimeout(() => this.downloadingDoc.set(null), 1800);
  }

  confirmDelete(doc: DocEntry) { this.deletingDoc.set(doc); }
  cancelDelete()               { this.deletingDoc.set(null); }

  async deleteDoc() {
    const doc = this.deletingDoc();
    if (!doc) return;
    try {
      await this.docService.deleteDocument(doc.id);
      this.documents.update(arr => arr.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
    this.deletingDoc.set(null);
  }

  async loadDocuments(caseId: string) {
    try {
      const docs = await this.docService.listForCase(caseId);
      this.documents.set(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }

  openUploadModal() {
    const c = this.case();
    if (!c || !this._caseId) { this.upload.open(); return; }
    this.upload.openForCase(
      c.title,
      async (file: File) => { await this.docService.uploadFile(file, this._caseId); },
      () => this.loadDocuments(this._caseId),
    );
  }

  tasks         = signal<Task[]>([]);
  tasksLoading  = signal(false);

  notes            = signal<Note[]>([]);
  showAddNoteModal = signal(false);
  newNoteTitle     = signal('');
  newNoteContent   = signal('');
  isSavingNote     = signal(false);
  editingNoteId    = signal<string | null>(null);
  editNoteTitle    = signal('');
  editNoteContent  = signal('');
  deletingNoteId   = signal<string | null>(null);

  billingEntries: BillingEntry[] = [
    { date:'Nov 15, 2024', attorney:'—', desc:'Discovery document review', hours:'4.5', rate:'$350/hr', amount:'$1,575.00' },
    { date:'Nov 14, 2024', attorney:'—', desc:'Client consultation',       hours:'2.0', rate:'$450/hr', amount:'$900.00' },
    { date:'Nov 13, 2024', attorney:'—', desc:'Motion preparation',        hours:'6.0', rate:'$350/hr', amount:'$2,100.00' },
  ];

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

  formatDate(date: Date | undefined): string {
    if (!date) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatTimelineDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  get totalBilled(): string {
    const total = this.billingEntries.reduce((sum, e) => {
      const n = parseFloat(e.amount.replace(/[$,]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
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
    try {
      const [c, tl, docs, rawTasks, rawNotes] = await Promise.all([
        this.caseService.fetchCaseById(id),
        this.caseService.fetchTimeline(id),
        this.docService.listForCase(id),
        this.taskService.listTasks({ case_id: id }),
        this.taskService.listNotes({ case_id: id }),
      ]);
      this.case.set(c);
      this.timeline.set(tl as unknown as TimelineEntry[]);
      this.documents.set(docs);
      this.tasks.set(rawTasks.map(r => this._mapTask(r)));
      this.notes.set(rawNotes.map(r => this._mapNote(r)));
      this.initEditForm();
    } catch {
      this.errorMsg.set('Could not load case. It may not exist or the backend is unavailable.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(t: string) { this.activeTab.set(t); }
  goBack()          { this.router.navigate(['/cases']); }

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
      createdAt: raw.created_at,
      isVoice:   raw.is_voice_note ?? false,
    };
  }

  openVoiceNoteModal() {
    this.voiceModal.openModal();
  }

  async onVoiceNoteSaved(): Promise<void> {
    const rawNotes = await this.taskService.listNotes({ case_id: this._caseId }).catch(() => []);
    this.notes.set(rawNotes.map(r => this._mapNote(r)));
  }

  openAddNoteModal() {
    this.newNoteTitle.set('');
    this.newNoteContent.set('');
    this.showAddNoteModal.set(true);
  }

  closeAddNoteModal() { this.showAddNoteModal.set(false); }

  async saveNote(): Promise<void> {
    const content = this.newNoteContent().trim();
    if (!content) return;
    this.isSavingNote.set(true);
    try {
      const raw = await this.taskService.createNote({
        case_id: this._caseId,
        title:   this.newNoteTitle().trim() || undefined,
        content,
      });
      this.notes.update(arr => [this._mapNote(raw), ...arr]);
      this.newNoteTitle.set('');
      this.newNoteContent.set('');
      this.closeAddNoteModal();
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      this.isSavingNote.set(false);
    }
  }

  startEditNote(note: Note) {
    this.editingNoteId.set(note.id);
    this.editNoteTitle.set(note.title ?? '');
    this.editNoteContent.set(note.content);
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
      const raw = await this.taskService.updateNote(id, this.editNoteTitle().trim() || undefined, content);
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

  // ── Favorite ──────────────────────────────────────────────

  isFavorite = signal(false);
  toggleFavorite() { this.isFavorite.update(v => !v); }

  // ── Share / copy link ─────────────────────────────────────

  copied = signal(false);
  copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
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
