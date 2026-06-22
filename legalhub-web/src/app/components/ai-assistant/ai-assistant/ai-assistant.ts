import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { RagService, RagSource, FirmIndexStatus } from '../../../services/rag.service';
import { CaseService } from '../../../services/case.service';
import { AuthService } from '../../../services/auth.service';

type DocType   = 'contract' | 'letter' | 'motion';
type QuickTask = 'contract' | 'letter' | 'action' | 'summarize' | null;
type ToneT     = 'formal' | 'professional' | 'plain';
type DetailT   = 'brief' | 'standard' | 'detailed';
type FormatT   = 'docx' | 'pdf' | 'both';

interface HistoryEntry {
  id: number; icon: string; iconBg: string; title: string;
  time: string; caseRef: string; docType: string; active: boolean;
}
interface Suggestion { label: string; desc: string; priority: 'high' | 'medium' | 'low'; }

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: RagSource[];
  timestamp: string;
}

// Same structure as AiFirmChatModal — shared localStorage storage
interface Session {
  id:        string;
  name:      string;
  createdAt: string;
  updatedAt: string;
  msgCount:  number;
}

interface ContractTypeDef {
  key: string; icon: string; color: string; bg: string; label: string; sub: string;
}
type ContractStep = 'config' | 'questions' | 'generating' | 'preview';
type ContractLang  = 'en' | 'fr' | 'ar';

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './ai-assistant.html',
  styles: [`
    @keyframes pulse-slow {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.035); opacity: 0.98; }
    }
    .animate-pulse-slow { animation: pulse-slow 2.8s ease-in-out infinite; }
    .quick-active { transform: scale(1.045); box-shadow: 0 12px 30px -8px rgba(0,0,0,0.22); }
    .doctype-active { transform: scale(1.04); box-shadow: 0 8px 20px -4px rgba(245, 158, 11, 0.35); }
  `]
})
export class AiAssistant implements OnInit {
  private http      = inject(HttpClient);
  private api       = environment.apiUrl;
  private ragSvc    = inject(RagService);
  private caseSvc   = inject(CaseService);
  private sanitizer = inject(DomSanitizer);
  private authSvc   = inject(AuthService);

  // ─── RAG Chat (firm-wide) ──────────────────────────────────────────────────
  // Keys match AiFirmChatModal (namespaced by user ID) so sessions are shared
  // between dashboard and this page but isolated per user.
  private readonly MAX_HISTORY  = 6;

  private get sessionsKey(): string {
    return `ai_firm_sessions_${this.authSvc.currentUser()?.id ?? 'anon'}`;
  }

  private msgsKey(sessionId: string): string {
    return `ai_firm_msgs_${this.authSvc.currentUser()?.id ?? 'anon'}_${sessionId}`;
  }

  readonly CHAT_SUGGESTIONS = [
    'What cases are currently open?',
    'Which clients have unpaid invoices?',
    'Are there any upcoming hearings?',
    'Which tasks are overdue?',
    "Summarize my firm's current workload",
    'What are the highest priority cases?',
  ];

  chatMessages      = signal<ChatMsg[]>([]);
  chatInput         = signal('');
  isChatLoading     = signal(false);
  firmIndexed       = signal<boolean | null>(null);
  isIndexing        = signal(false);
  chatSessions      = signal<Session[]>([]);
  activeSession     = signal<Session | null>(null);
  expandedSources   = signal<Set<string>>(new Set());
  firmStatus        = signal<FirmIndexStatus | null>(null);
  ragUnavailable    = signal(false);

  // Rename / delete
  renameTarget = signal<Session | null>(null);
  draftName    = signal('');
  deleteTarget = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this._loadSessions();
    await Promise.all([this.checkFirmIndex(), this._loadDocuments()]);
  }

  // ─── Document Analyzer ─────────────────────────────────────────────────────
  docList           = signal<{ id: string; name: string }[]>([]);
  selectedDocId     = signal<string>('');
  analysisResult    = signal<string | null>(null);
  isAnalyzing       = signal(false);
  analyzeError      = signal<string | null>(null);
  analysisType      = signal<'summary' | 'deadlines' | 'issues'>('summary');

  analysisOptions: { value: 'summary' | 'deadlines' | 'issues'; label: string; icon: string }[] = [
    { value: 'summary',   label: 'Full Summary',         icon: 'fa-solid fa-file-lines'           },
    { value: 'deadlines', label: 'Extract Deadlines',    icon: 'fa-solid fa-calendar-check'       },
    { value: 'issues',    label: 'Deep Analysis',     icon: 'fa-solid fa-microscope'           },
  ];

  private async _loadDocuments(): Promise<void> {
    try {
      const docs = await firstValueFrom(
        this.http.get<any[]>(`${this.api}/api/documents`)
      );
      this.docList.set(
        (docs || []).map(d => ({
          id:   d.id,
          name: d.title || d.original_name || d.file_name || `Document ${d.id.slice(0, 6)}`,
        }))
      );
    } catch { /* ignore – documents list is best-effort */ }
  }

  async analyzeSelectedDoc(): Promise<void> {
    const docId = this.selectedDocId();
    if (!docId) return;
    this.isAnalyzing.set(true);
    this.analyzeError.set(null);
    this.analysisResult.set(null);

    const endpointMap = { summary: 'summarize', deadlines: 'extract', issues: 'analyze' };
    const endpoint = endpointMap[this.analysisType()];

    try {
      const res = await firstValueFrom(
        this.http.post<any>(`${this.api}/api/ai/${endpoint}`, { document_id: docId })
      );
      this.analysisResult.set(res.summary ?? res.result ?? JSON.stringify(res));
    } catch (e: any) {
      this.analyzeError.set(e?.error?.detail ?? 'Analysis failed. Please try again.');
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  resetAnalyzer(): void {
    this.selectedDocId.set('');
    this.analysisResult.set(null);
    this.analyzeError.set(null);
  }

  private _loadSessions(): void {
    try {
      const stored = localStorage.getItem(this.sessionsKey);
      const sessions: Session[] = stored ? JSON.parse(stored) : [];
      this.chatSessions.set(sessions);
    } catch { this.chatSessions.set([]); }
  }

  private _saveSessions(): void {
    localStorage.setItem(this.sessionsKey, JSON.stringify(this.chatSessions()));
  }

  private _applySession(session: Session): void {
    try {
      const stored = localStorage.getItem(this.msgsKey(session.id));
      this.chatMessages.set(stored ? JSON.parse(stored) : []);
    } catch { this.chatMessages.set([]); }
    this.activeSession.set(session);
  }

  private _saveCurrentMessages(): void {
    const session = this.activeSession();
    if (!session) return;
    const msgs = this.chatMessages();
    localStorage.setItem(this.msgsKey(session.id), JSON.stringify(msgs));
    // Keep updatedAt and msgCount in sync with the modal
    const updated = { ...session, updatedAt: new Date().toISOString(), msgCount: msgs.length };
    this.activeSession.set(updated);
    this.chatSessions.update(list =>
      list.map(s => s.id === session.id ? updated : s)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    );
    this._saveSessions();
  }

  startNewChat(): void {
    const now = new Date().toISOString();
    const session: Session = { id: Date.now().toString(), name: 'New conversation', createdAt: now, updatedAt: now, msgCount: 0 };
    this.chatSessions.update(s => [session, ...s]);
    this._saveSessions();
    this.chatMessages.set([]);
    this.activeSession.set(session);
  }

  selectSession(session: Session): void { this._applySession(session); }

  openRename(session: Session): void {
    this.renameTarget.set(session);
    this.draftName.set(session.name);
  }

  confirmRename(): void {
    const target = this.renameTarget();
    if (!target || !this.draftName().trim()) return;
    this._updateSessionMeta(target.id, { name: this.draftName().trim() });
    this.renameTarget.set(null);
  }

  cancelRename(): void { this.renameTarget.set(null); }

  deleteSession(sessionId: string): void { this.deleteTarget.set(sessionId); }

  confirmDelete(): void {
    const sessionId = this.deleteTarget();
    if (!sessionId) return;
    this.deleteTarget.set(null);
    localStorage.removeItem(this.msgsKey(sessionId));
    const next = this.chatSessions().filter(s => s.id !== sessionId);
    this.chatSessions.set(next);
    this._saveSessions();
    if (this.activeSession()?.id === sessionId) {
      if (next.length > 0) this._applySession(next[0]);
      else { this.chatMessages.set([]); this.activeSession.set(null); }
    }
  }

  cancelDelete(): void { this.deleteTarget.set(null); }

  private _updateSessionMeta(sessionId: string, updates: Partial<Session>): void {
    const next = this.chatSessions()
      .map(s => s.id === sessionId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    this.chatSessions.set(next);
    this._saveSessions();
    if (this.activeSession()?.id === sessionId)
      this.activeSession.set(next.find(s => s.id === sessionId) ?? null);
  }

  questionCount(session: Session): number { return Math.floor((session.msgCount || 0) / 2); }

  formatSessionDate(session: Session): string {
    const d = new Date(session.updatedAt || session.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  async checkFirmIndex(): Promise<void> {
    this.firmIndexed.set(null);
    try {
      const status = await this.ragSvc.getFirmIndexStatus();
      this.ragUnavailable.set(false);
      this.firmIndexed.set(status.is_indexed);
      this.firmStatus.set(status);
      if (!status.is_indexed) this._triggerAndPollIngest();
    } catch {
      this.firmIndexed.set(false);
      this.ragUnavailable.set(true);
    }
  }

  private async _triggerAndPollIngest(): Promise<void> {
    this.isIndexing.set(true);
    try {
      await this.ragSvc.ingestFirm();
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const s = await this.ragSvc.getFirmIndexStatus();
        this.firmStatus.set(s);
        if (s.is_indexed) { this.firmIndexed.set(true); this.isIndexing.set(false); return; }
      }
    } catch { /* ignore */ }
    this.isIndexing.set(false);
  }

  async sendChatMessage(): Promise<void> {
    const q = this.chatInput().trim();
    if (!q || this.isChatLoading()) return;
    if (!this.activeSession()) this.startNewChat();

    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: q, timestamp: new Date().toISOString() };
    this.chatMessages.update(msgs => [...msgs, userMsg]);
    this.chatInput.set('');
    this.isChatLoading.set(true);

    const history = this.chatMessages()
      .slice(-this.MAX_HISTORY)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const res = await this.ragSvc.askFirm(q, history);
      const assistantMsg: ChatMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        timestamp: new Date().toISOString(),
      };
      this.chatMessages.update(msgs => [...msgs, assistantMsg]);
      this._scrollChatToBottom();

      const session = this.activeSession();
      if (session?.name === 'New conversation') this._generateTitle(q, res.answer);
    } catch (e: any) {
      const isServerError = (e?.status ?? 0) >= 500;
      const errorMsg = isServerError
        ? 'The knowledge base service (Milvus) is currently unavailable. Please start the Milvus server and re-index.'
        : (e?.error?.detail ?? 'Unable to reach the AI assistant. Please check your connection.');
      this.ragUnavailable.set(isServerError);
      this.chatMessages.update(msgs => [...msgs, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMsg,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      this.isChatLoading.set(false);
      this._saveCurrentMessages();
    }
  }

  private async _generateTitle(question: string, answer: string): Promise<void> {
    try {
      const title = await this.ragSvc.generateSessionTitle(question, answer);
      if (title) {
        const session = this.activeSession();
        if (session) {
          const updated = { ...session, name: title.trim(), updatedAt: new Date().toISOString() };
          this.activeSession.set(updated);
          this.chatSessions.update(sessions => sessions.map(s => s.id === session.id ? updated : s));
          this._saveSessions();
        }
      }
    } catch { /* ignore */ }
  }

  useSuggestion(text: string): void {
    this.chatInput.set(text);
    this.sendChatMessage();
  }

  toggleSources(msgId: string): void {
    const set = new Set(this.expandedSources());
    if (set.has(msgId)) set.delete(msgId); else set.add(msgId);
    this.expandedSources.set(set);
  }

  getSourceColor(sourceType: string): string {
    const map: Record<string, string> = {
      document: 'bg-blue-100 text-blue-700',
      timeline: 'bg-purple-100 text-purple-700',
      tasks:    'bg-amber-100 text-amber-700',
      notes:    'bg-green-100 text-green-700',
      invoices: 'bg-red-100 text-red-700',
      events:   'bg-indigo-100 text-indigo-700',
      case_meta:'bg-slate-100 text-slate-700',
      client:   'bg-teal-100 text-teal-700',
      lawyer:   'bg-orange-100 text-orange-700',
    };
    return map[sourceType] ?? 'bg-gray-100 text-gray-600';
  }

  renderMarkdown(text: string): SafeHtml {
    const lines = (text || '').split('\n');
    const html = lines.map(line => {
      if (line.startsWith('#### ')) return `<strong style="font-size:13px">${this._inline(line.slice(5))}</strong>`;
      if (line.startsWith('### '))  return `<strong style="font-size:14px">${this._inline(line.slice(4))}</strong>`;
      if (line.startsWith('## '))   return `<strong style="font-size:15px">${this._inline(line.slice(3))}</strong>`;
      if (line.startsWith('# '))    return `<strong style="font-size:16px">${this._inline(line.slice(2))}</strong>`;
      if (line.startsWith('- ') || line.startsWith('• ')) return `• ${this._inline(line.slice(2))}`;
      if (/^\d+\.\s/.test(line)) {
        const m = line.match(/^(\d+\.\s)(.*)/);
        return m ? `${m[1]}${this._inline(m[2])}` : this._inline(line);
      }
      return this._inline(line);
    }).join('<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private _inline(text: string): string {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#F3F4F6;padding:1px 4px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>');
  }

  onChatKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendChatMessage(); }
  }

  autoResize(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  private _scrollChatToBottom(): void {
    setTimeout(() => {
      const el = document.getElementById('chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // ─── History Panel ─────────────────────────────────────────────────────────
  showHistoryPanel = signal(false);
  historySearch    = signal('');

  history: HistoryEntry[] = [];

  filteredHistory = computed(() => {
    const q = this.historySearch().toLowerCase();
    if (!q) return this.history;
    return this.history.filter(h =>
      h.title.toLowerCase().includes(q) ||
      h.caseRef.toLowerCase().includes(q) ||
      h.docType.toLowerCase().includes(q)
    );
  });

  loadHistoryEntry(entry: HistoryEntry): void {
    this.history.forEach(h => h.active = h.id === entry.id);
    this.showHistoryPanel.set(false);
  }

  // ─── Settings Panel ────────────────────────────────────────────────────────
  showSettingsPanel = signal(false);

  aiTone         = signal<ToneT>('formal');
  aiLanguage     = signal('English');
  aiJurisdiction = signal('California, USA');
  aiAutoLink     = signal(true);
  aiIncludeDiscl = signal(true);
  aiJurisClause  = signal(true);
  aiOutputFormat = signal<FormatT>('docx');
  aiDetailLevel  = signal<DetailT>('standard');

  toneOptions = [
    { value: 'formal'       as const, label: 'Formal',       icon: 'fa-solid fa-gavel'      },
    { value: 'professional' as const, label: 'Professional', icon: 'fa-solid fa-briefcase'  },
    { value: 'plain'        as const, label: 'Plain',        icon: 'fa-solid fa-align-left' },
  ];

  detailOptions = [
    { value: 'brief'    as const, label: 'Brief',    icon: 'fa-solid fa-bolt'        },
    { value: 'standard' as const, label: 'Standard', icon: 'fa-solid fa-layer-group' },
    { value: 'detailed' as const, label: 'Detailed', icon: 'fa-solid fa-list-ul'     },
  ];

  formatOptions = [
    { value: 'docx' as const, icon: 'fa-solid fa-file-word' },
    { value: 'pdf'  as const, icon: 'fa-solid fa-file-pdf'  },
    { value: 'both' as const, icon: 'fa-solid fa-files'     },
  ];

  languages     = ['English', 'French', 'Arabic', 'Spanish', 'German', 'Portuguese'];
  jurisdictions = ['California, USA', 'New York, USA', 'Texas, USA', 'Federal (USA)',
                   'England & Wales', 'Ontario, Canada', 'France', 'Tunisia'];

  setAiTone(v: string):         void { this.aiTone.set(v as ToneT); }
  setAiDetailLevel(v: string):  void { this.aiDetailLevel.set(v as DetailT); }
  setAiOutputFormat(v: string): void { this.aiOutputFormat.set(v as FormatT); }
  saveSettings(): void { this.showSettingsPanel.set(false); }

  // ─── Quick Actions ─────────────────────────────────────────────────────────
  activeQuickTask = signal<QuickTask>(null);

  quickActions = [
    {
      key: 'contract' as const, icon: 'fa-solid fa-file-contract', label: 'Draft Contract', sub: 'Generate legal contracts',
      activeCls: 'bg-white border-white shadow-2xl quick-active', glowCls: 'bg-purple-400',
      iconActiveCls: 'bg-purple-700', iconActiveText: 'text-white', labelCls: 'text-purple-950 font-bold', subCls: 'text-purple-800', scrollTo: 'section-generator'
    },
    {
      key: 'letter' as const, icon: 'fa-solid fa-envelope', label: 'Legal Letter', sub: 'Create formal letters',
      activeCls: 'bg-blue-50 border-blue-300 shadow-2xl quick-active', glowCls: 'bg-blue-400',
      iconActiveCls: 'bg-blue-700', iconActiveText: 'text-white', labelCls: 'text-blue-950 font-bold', subCls: 'text-blue-800', scrollTo: 'section-generator'
    },
    {
      key: 'action' as const, icon: 'fa-solid fa-lightbulb', label: 'Next Steps', sub: 'Suggest procedural actions',
      activeCls: 'bg-amber-50 border-amber-300 shadow-2xl quick-active', glowCls: 'bg-amber-400',
      iconActiveCls: 'bg-amber-700', iconActiveText: 'text-white', labelCls: 'text-amber-950 font-bold', subCls: 'text-amber-800', scrollTo: 'section-action'
    },
    {
      key: 'summarize' as const, icon: 'fa-solid fa-file-lines', label: 'Summarize', sub: 'Extract key points',
      activeCls: 'bg-green-50 border-green-300 shadow-2xl quick-active', glowCls: 'bg-green-400',
      iconActiveCls: 'bg-green-700', iconActiveText: 'text-white', labelCls: 'text-green-950 font-bold', subCls: 'text-green-800', scrollTo: 'section-action'
    }
  ];

  selectQuickTask(key: QuickTask): void {
    this.activeQuickTask.set(key);
    if (key === 'contract') { this.contractStep.set('config'); this.contractType.set(''); this.setDocType('contract'); }
    if (key === 'letter')   { this.contractStep.set('config'); this.contractType.set('prestation_service'); this.setDocType('letter'); }
    setTimeout(() => this._scrollTo(this.quickActions.find(q => q.key === key)?.scrollTo ?? 'section-generator'), 120);
  }

  // ─── Document Type ─────────────────────────────────────────────────────────
  selectedDocType = signal<DocType>('contract');

  docTypeOptions = [
    { key: 'contract' as const, icon: 'fa-solid fa-file-contract', iconBg: 'bg-purple-100', iconColor: 'text-purple-700', label: 'Contract', sub: 'Legal agreement'  },
    { key: 'letter'   as const, icon: 'fa-solid fa-envelope',      iconBg: 'bg-blue-100',   iconColor: 'text-blue-700',   label: 'Letter',   sub: 'Formal letter'    },
    { key: 'motion'   as const, icon: 'fa-solid fa-file-invoice',  iconBg: 'bg-green-100',  iconColor: 'text-green-700',  label: 'Motion',   sub: 'Court filing'     },
  ];

  setDocType(t: string): void { this.selectedDocType.set(t as DocType); }

  // ─── Templates & Cases ─────────────────────────────────────────────────────
  selectedTemplate = signal('Employment Agreement');
  templates = [
    'Employment Agreement', 'Non-Disclosure Agreement (NDA)', 'Service Agreement',
    'Purchase Agreement', 'Partnership Agreement', 'Lease Agreement',
    'Consulting Agreement', 'Settlement Agreement',
  ];

  selectedCase = signal('');
  linkedCase   = computed(() => this.selectedCase() || null);

  get cases(): string[] {
    return this.caseSvc.cases().map(c => c.title || c.caseNumber || c.id);
  }

  // ─── Form fields ───────────────────────────────────────────────────────────
  requirements = signal('');
  partyA       = signal('');
  partyB       = signal('');

  private _opt1 = signal(true);
  private _opt2 = signal(true);
  private _opt3 = signal(false);
  private _opt4 = signal(false);

  docOptions = [
    { label: 'Standard legal disclaimers',    value: () => this._opt1(), set: (v: boolean) => this._opt1.set(v) },
    { label: 'Jurisdiction-specific clauses', value: () => this._opt2(), set: (v: boolean) => this._opt2.set(v) },
    { label: 'Termination conditions',        value: () => this._opt3(), set: (v: boolean) => this._opt3.set(v) },
    { label: 'Arbitration clause',            value: () => this._opt4(), set: (v: boolean) => this._opt4.set(v) },
  ];

  get charCount(): number { return this.requirements().length; }

  isGenerating  = signal(false);
  generatedDoc  = signal<string | null>(null);
  ragError      = signal<string | null>(null);

  async generateDocument(): Promise<void> {
    if (!this.requirements().trim()) return;
    this.isGenerating.set(true);
    this.ragError.set(null);
    try {
      const question = `Generate a ${this.selectedDocType()} (${this.selectedTemplate()}).`
        + (this.linkedCase() ? ` Case: ${this.linkedCase()}.` : '')
        + ` Requirements: ${this.requirements()}`;
      const result = await firstValueFrom(
        this.http.post<{ answer: string }>(`${this.api}/api/rag/firm/ask`, { question, chat_history: [] })
      );
      this.generatedDoc.set(result.answer);
      this.history.unshift({ id: Date.now(), icon: 'fa-solid fa-file-contract', iconBg: 'bg-purple-600', title: this.selectedTemplate(), time: 'Just now', caseRef: this.linkedCase() || 'No case linked', docType: 'Contract', active: true });
    } catch (e: any) {
      this.ragError.set(e?.error?.detail ?? 'RAG service unavailable. Please ensure the knowledge base is indexed.');
    } finally {
      this.isGenerating.set(false);
    }
  }

  resetForm(): void {
    this.requirements.set('');
    this.partyA.set('');
    this.partyB.set('');
    this.selectedCase.set('');
    this.generatedDoc.set(null);
  }

  // ─── Legal Action Suggester ────────────────────────────────────────────────
  suggesterCase       = signal('');
  situation           = signal('');
  isSuggesting        = signal(false);
  suggestionsShown    = signal(false);
  ragSuggestionsText  = signal<string | null>(null);

  suggestions: Suggestion[] = [];

  async suggestActions(): Promise<void> {
    if (!this.situation().trim()) return;
    this.isSuggesting.set(true);
    this.ragError.set(null);
    this.ragSuggestionsText.set(null);
    try {
      const result = await firstValueFrom(
        this.http.post<{ answer: string }>(`${this.api}/api/rag/firm/ask`, {
          question: `Case: ${this.suggesterCase()}. Situation: ${this.situation()}. What are the recommended next legal actions?`,
          chat_history: [],
        })
      );
      this.ragSuggestionsText.set(result.answer);
      this.suggestionsShown.set(true);
    } catch (e: any) {
      this.ragError.set(e?.error?.detail ?? 'RAG service unavailable.');
    } finally {
      this.isSuggesting.set(false);
    }
  }

  getPriorityBadge(p: string): string {
    const map = {
      high:   'bg-red-100 text-red-800 border border-red-300',
      medium: 'bg-amber-100 text-amber-800 border border-amber-300',
      low:    'bg-green-100 text-green-800 border border-green-300',
    };
    return map[p as keyof typeof map] || 'bg-gray-100 text-gray-700';
  }

  recentAnalyzed: string[] = [];

  // ─── Templates Library ─────────────────────────────────────────────────────
  docTemplates = [
    { icon:'fa-solid fa-file-contract',  iconBg:'bg-purple-100', iconColor:'text-purple-600', hoverBorder:'hover:border-purple-400', iconHoverBg:'group-hover:bg-purple-500', btnColor:'text-purple-600', title:'Employment Agreement',    desc:'Standard employment contract',     badge:'Popular',  badgeColor:'bg-purple-100 text-purple-700', uses:247 },
    { icon:'fa-solid fa-shield-halved',  iconBg:'bg-blue-100',   iconColor:'text-blue-600',   hoverBorder:'hover:border-blue-400',   iconHoverBg:'group-hover:bg-blue-500',   btnColor:'text-blue-600',   title:'Non-Disclosure Agreement', desc:'Protect confidential information',  badge:'Essential',badgeColor:'bg-blue-100 text-blue-700',   uses:189 },
    { icon:'fa-solid fa-handshake',      iconBg:'bg-green-100',  iconColor:'text-green-600',  hoverBorder:'hover:border-green-400',  iconHoverBg:'group-hover:bg-green-500',  btnColor:'text-green-600',  title:'Service Agreement',        desc:'Professional services contract',    badge:undefined,  badgeColor:undefined,                      uses:156 },
    { icon:'fa-solid fa-house',          iconBg:'bg-amber-100',  iconColor:'text-amber-600',  hoverBorder:'hover:border-amber-400',  iconHoverBg:'group-hover:bg-amber-500',  btnColor:'text-amber-600',  title:'Lease Agreement',          desc:'Property lease contract',           badge:'New',      badgeColor:'bg-amber-100 text-amber-700',  uses:134 },
    { icon:'fa-solid fa-scale-balanced', iconBg:'bg-red-100',    iconColor:'text-red-600',    hoverBorder:'hover:border-red-400',    iconHoverBg:'group-hover:bg-red-500',    btnColor:'text-red-600',    title:'Settlement Agreement',     desc:'Resolve disputes',                  badge:undefined,  badgeColor:undefined,                      uses:98  },
    { icon:'fa-solid fa-users',          iconBg:'bg-indigo-100', iconColor:'text-indigo-600', hoverBorder:'hover:border-indigo-400', iconHoverBg:'group-hover:bg-indigo-500', btnColor:'text-indigo-600', title:'Partnership Agreement',    desc:'Roles and profit sharing',          badge:undefined,  badgeColor:undefined,                      uses:87  },
    { icon:'fa-solid fa-briefcase',      iconBg:'bg-pink-100',   iconColor:'text-pink-600',   hoverBorder:'hover:border-pink-400',   iconHoverBg:'group-hover:bg-pink-500',   btnColor:'text-pink-600',   title:'Consulting Agreement',     desc:'Independent contractor services',   badge:undefined,  badgeColor:undefined,                      uses:76  },
    { icon:'fa-solid fa-cart-shopping',  iconBg:'bg-teal-100',   iconColor:'text-teal-600',   hoverBorder:'hover:border-teal-400',   iconHoverBg:'group-hover:bg-teal-500',   btnColor:'text-teal-600',   title:'Purchase Agreement',       desc:'Buy or sell goods or property',     badge:undefined,  badgeColor:undefined,                      uses:65  },
  ];

  useTemplate(title: string): void {
    const typeMap: Record<string, string> = {
      'Employment Agreement':           'travail_cdi',
      'Non-Disclosure Agreement (NDA)': 'nda',
      'Service Agreement':              'prestation_service',
      'Purchase Agreement':             'vente',
      'Partnership Agreement':          'partenariat',
      'Lease Agreement':                'bail',
      'Consulting Agreement':           'prestation_service',
      'Settlement Agreement':           'partenariat',
    };
    this.contractType.set(typeMap[title] ?? 'prestation_service');
    this.contractStep.set('config');
    this.activeQuickTask.set('contract');
    setTimeout(() => this._scrollTo('section-generator'), 80);
  }

  // ─── Re-index ──────────────────────────────────────────────────────────────
  async reindexFirm(): Promise<void> {
    if (this.isIndexing()) return;
    await this._triggerAndPollIngest();
  }

  // ─── Contract Drafting ─────────────────────────────────────────────────────
  readonly CONTRACT_TYPES: ContractTypeDef[] = [
    { key: 'bail',               icon: 'fa-solid fa-house',        color: 'bg-purple-600', bg: 'bg-purple-50', label: 'Lease',          sub: 'Property lease'     },
    { key: 'travail_cdi',        icon: 'fa-solid fa-user-tie',     color: 'bg-blue-700',   bg: 'bg-blue-50',   label: 'Employment CDI', sub: 'Permanent contract' },
    { key: 'travail_cdd',        icon: 'fa-solid fa-user-clock',   color: 'bg-blue-500',   bg: 'bg-blue-50',   label: 'Employment CDD', sub: 'Fixed-term'         },
    { key: 'prestation_service', icon: 'fa-solid fa-handshake',    color: 'bg-indigo-600', bg: 'bg-indigo-50', label: 'Service Agmt',   sub: 'Services contract'  },
    { key: 'nda',                icon: 'fa-solid fa-lock',         color: 'bg-emerald-600',bg: 'bg-emerald-50',label: 'NDA',            sub: 'Confidentiality'    },
    { key: 'societe',            icon: 'fa-solid fa-building',     color: 'bg-teal-600',   bg: 'bg-teal-50',   label: 'Company',        sub: 'Company formation'  },
    { key: 'vente',              icon: 'fa-solid fa-right-left',   color: 'bg-amber-600',  bg: 'bg-amber-50',  label: 'Sale',           sub: 'Sale agreement'     },
    { key: 'partenariat',        icon: 'fa-solid fa-people-group', color: 'bg-rose-600',   bg: 'bg-rose-50',   label: 'Partnership',    sub: 'Partnership'        },
    { key: 'pret',               icon: 'fa-solid fa-coins',        color: 'bg-emerald-500',bg: 'bg-emerald-50',label: 'Loan',           sub: 'Loan agreement'     },
    { key: 'franchise',          icon: 'fa-solid fa-store',        color: 'bg-indigo-500', bg: 'bg-indigo-50', label: 'Franchise',      sub: 'Franchise'          },
  ];

  readonly CONTRACT_LANGUAGES = [
    { key: 'en' as ContractLang, label: 'English' },
    { key: 'fr' as ContractLang, label: 'Français' },
    { key: 'ar' as ContractLang, label: 'العربية' },
  ];

  readonly CONTRACT_COUNTRIES = [
    { code: 'TN', label: 'Tunisie' },       { code: 'DZ', label: 'Algérie' },
    { code: 'MA', label: 'Maroc' },         { code: 'EG', label: 'Égypte' },
    { code: 'FR', label: 'France' },        { code: 'US', label: 'United States' },
    { code: 'SA', label: 'Saudi Arabia' },  { code: 'AE', label: 'UAE' },
    { code: 'GB', label: 'United Kingdom' },{ code: 'QA', label: 'Qatar' },
  ];

  contractStep           = signal<ContractStep | null>(null);
  contractType           = signal<string>('');
  contractLang           = signal<ContractLang>('en');
  contractCountry        = signal<string>('TN');
  contractSessionId      = signal<string | null>(null);
  contractQuestions      = signal<string[]>([]);
  contractAnswers        = signal<Record<string, string>>({});
  contractCurrentAnswers = signal<Record<string, string>>({});
  contractText           = signal<string | null>(null);
  contractRisks          = signal<string | null>(null);
  contractPdfUrl         = signal<string | null>(null);
  isContractLoading      = signal(false);
  isRiskLoading          = signal(false);
  isPdfLoading           = signal(false);
  contractRiskTab        = signal<'contract' | 'risks'>('contract');
  contractError          = signal<string | null>(null);

  allCurrentAnswered = computed(() =>
    this.contractQuestions().length > 0 &&
    this.contractQuestions().every(q => (this.contractCurrentAnswers()[q] || '').trim().length > 0)
  );

  hasCollectedAnswers = computed(() => Object.keys(this.contractAnswers()).length > 0);

  collectedAnswerEntries = computed(() =>
    Object.entries(this.contractAnswers()).map(([key, value]) => ({ key, value }))
  );

  getContractAnswer(q: string): string { return this.contractCurrentAnswers()[q] || ''; }

  async startContractDraft(): Promise<void> {
    if (!this.contractType()) return;
    this.isContractLoading.set(true);
    this.contractError.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ session_id: string; questions: string[] }>(
          `${this.api}/api/contracts/session/start`,
          { contract_type: this.contractType(), lang: this.contractLang(), country_code: this.contractCountry() }
        )
      );
      this.contractSessionId.set(res.session_id);
      this.contractQuestions.set(res.questions);
      this.contractAnswers.set({});
      this.contractCurrentAnswers.set({});
      this.contractStep.set('questions');
    } catch (e: any) {
      this.contractError.set(e?.error?.detail ?? 'Failed to start session');
    } finally {
      this.isContractLoading.set(false);
    }
  }

  async answerContractStep(): Promise<void> {
    const sessionId = this.contractSessionId();
    if (!sessionId || !this.allCurrentAnswered()) return;
    this.isContractLoading.set(true);
    this.contractError.set(null);
    try {
      const merged = { ...this.contractAnswers(), ...this.contractCurrentAnswers() };
      const res = await firstValueFrom(
        this.http.post<{ complete: boolean; questions: string[] }>(
          `${this.api}/api/contracts/session/answer`,
          { session_id: sessionId, answers: this.contractCurrentAnswers() }
        )
      );
      this.contractAnswers.set(merged);
      this.contractCurrentAnswers.set({});
      if (res.complete) {
        this.contractStep.set('generating');
        await this._generateContractNow(sessionId);
      } else {
        this.contractQuestions.set(res.questions);
      }
    } catch (e: any) {
      this.contractError.set(e?.error?.detail ?? 'Failed to submit answers');
    } finally {
      this.isContractLoading.set(false);
    }
  }

  private async _generateContractNow(sessionId: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ contract_text: string }>(`${this.api}/api/contracts/generate`, { session_id: sessionId })
      );
      this.contractText.set(res.contract_text);
      this.contractStep.set('preview');
    } catch (e: any) {
      this.contractError.set(e?.error?.detail ?? 'Contract generation failed');
      this.contractStep.set('questions');
    } finally {
      this.isContractLoading.set(false);
    }
  }

  async fetchContractRisks(): Promise<void> {
    if (this.contractRisks()) { this.contractRiskTab.set('risks'); return; }
    const sessionId = this.contractSessionId();
    if (!sessionId) return;
    this.isRiskLoading.set(true);
    this.contractRiskTab.set('risks');
    try {
      const res = await firstValueFrom(
        this.http.post<{ risk_analysis: string }>(`${this.api}/api/contracts/${sessionId}/risks`, {})
      );
      this.contractRisks.set(res.risk_analysis);
    } catch (e: any) {
      this.contractError.set(e?.error?.detail ?? 'Risk analysis failed');
      this.contractRiskTab.set('contract');
    } finally {
      this.isRiskLoading.set(false);
    }
  }

  async exportContractPdf(): Promise<void> {
    const sessionId = this.contractSessionId();
    if (!sessionId) return;
    this.isPdfLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ pdf_url: string }>(`${this.api}/api/contracts/${sessionId}/export-pdf`, {})
      );
      this.contractPdfUrl.set(res.pdf_url);
      if (res.pdf_url) window.open(res.pdf_url, '_blank');
    } catch (e: any) {
      this.contractError.set(e?.error?.detail ?? 'PDF export failed');
    } finally {
      this.isPdfLoading.set(false);
    }
  }

  resetContractDraft(): void {
    this.contractStep.set(null);
    this.contractType.set('');
    this.contractSessionId.set(null);
    this.contractQuestions.set([]);
    this.contractAnswers.set({});
    this.contractCurrentAnswers.set({});
    this.contractText.set(null);
    this.contractRisks.set(null);
    this.contractPdfUrl.set(null);
    this.contractError.set(null);
    this.contractRiskTab.set('contract');
  }

  setContractCurrentAnswer(q: string, value: string): void {
    this.contractCurrentAnswers.update(a => ({ ...a, [q]: value }));
  }

  copyContractToClipboard(): void {
    const text = this.contractText();
    if (text) navigator.clipboard.writeText(text).catch(() => {});
  }

  // ─── Scroll helper ─────────────────────────────────────────────────────────
  private _scrollTo(id: string): void {
    const target = document.getElementById(id);
    if (!target) return;
    let container: HTMLElement | null = target.parentElement;
    while (container && container !== document.body) {
      const ov = getComputedStyle(container).overflowY;
      if (ov === 'auto' || ov === 'scroll') break;
      container = container.parentElement;
    }
    const headerOffset = 80;
    if (container && container !== document.body) {
      const top = target.offsetTop - (container as HTMLElement).offsetTop - headerOffset;
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
