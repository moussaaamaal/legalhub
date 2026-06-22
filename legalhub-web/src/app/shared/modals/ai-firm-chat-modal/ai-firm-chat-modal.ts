import {
  Component, signal, computed, inject, ElementRef, ViewChild,
  AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RagService, ChatMessage, AskResponse } from '../../../services/rag.service';
import { AuthService } from '../../../services/auth.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MsgSource {
  source_type: string;
  source_id?: string;
  relevance_score?: number;
  source_label?: string;
  excerpt?: string;
  case_id?: string;
}

interface ChatEntry {
  id:       string;
  role:     'user' | 'assistant';
  content:  string;
  sources?: MsgSource[];
  showSrc?: boolean;
}

interface Session {
  id:        string;
  name:      string;
  createdAt: string;
  updatedAt: string;
  msgCount:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIRM_SUGGESTIONS = [
  'What cases are currently open?',
  'Which clients have unpaid invoices?',
  'Are there any upcoming hearings?',
  'Which tasks are overdue?',
  "Summarize my firm's current workload",
  'What are the highest priority cases?',
];

const SOURCE_LABELS: Record<string, string> = {
  case_meta: 'Case Overview', document: 'Document', timeline: 'Timeline',
  tasks: 'Tasks', invoices: 'Invoices', events: 'Hearings',
  notes: 'Notes', client: 'Client', lawyer: 'Lawyer',
};

const SOURCE_COLORS: Record<string, string> = {
  case_meta: '#3B82F6', document: '#16A34A', timeline: '#9333EA',
  tasks: '#D97706', invoices: '#DC2626', events: '#0891B2',
  notes: '#7C3AED', client: '#EC4899', lawyer: '#1E40AF',
};

const genId    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MAX_MSGS = 60;

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector:    'app-ai-firm-chat-modal',
  standalone:  true,
  imports:     [FormsModule],
  templateUrl: './ai-firm-chat-modal.html',
})
export class AiFirmChatModal implements AfterViewChecked {
  @ViewChild('msgList') private msgList!: ElementRef<HTMLDivElement>;

  private ragService  = inject(RagService);
  private sanitizer   = inject(DomSanitizer);
  private authService = inject(AuthService);

  private get sessionsKey(): string {
    return `ai_firm_sessions_${this.authService.currentUser()?.id ?? 'anon'}`;
  }

  private msgsKey(sessionId: string): string {
    return `ai_firm_msgs_${this.authService.currentUser()?.id ?? 'anon'}_${sessionId}`;
  }

  // ── Modal state ─────────────────────────────────────────────────────────────
  show      = signal(false);
  activeTab = signal<'chat' | 'history'>('chat');

  // ── Index state ─────────────────────────────────────────────────────────────
  indexStatus = signal<{ is_indexed: boolean; total_chunks: number } | null>(null);
  indexing    = signal(false);

  // ── Session state ────────────────────────────────────────────────────────────
  sessions        = signal<Session[]>([]);
  activeSessionId = signal<string | null>(null);
  messages        = signal<ChatEntry[]>([]);

  // ── Chat state ───────────────────────────────────────────────────────────────
  question = signal('');
  loading  = signal(false);

  // ── Rename / delete state ────────────────────────────────────────────────────
  renameTarget = signal<Session | null>(null);
  draftName    = signal('');
  deleteTarget = signal<string | null>(null);

  private shouldScroll = false;

  readonly suggestions  = FIRM_SUGGESTIONS;
  readonly sourceLabels = SOURCE_LABELS;
  readonly sourceColors = SOURCE_COLORS;

  activeSession = computed(() =>
    this.sessions().find(s => s.id === this.activeSessionId()) ?? null
  );

  // ── Open / Close ─────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    this.show.set(true);
    this.activeTab.set('chat');
    this.loadStatus();

    const raw  = localStorage.getItem(this.sessionsKey);
    const list = raw ? (JSON.parse(raw) as Session[]) : [];
    this.sessions.set(list);
    this.activeSessionId.set(null);
    this.messages.set([]);
  }

  close(): void { this.show.set(false); }

  // ── Index ────────────────────────────────────────────────────────────────────

  async loadStatus(): Promise<void> {
    try {
      const s = await this.ragService.getFirmIndexStatus();
      this.indexStatus.set(s);
      if (!s.is_indexed) this.triggerIndex();
    } catch { /* ignore */ }
  }

  async triggerIndex(): Promise<void> {
    this.indexing.set(true);
    try { await this.ragService.ingestFirm(); } catch { this.indexing.set(false); return; }
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const s = await this.ragService.getFirmIndexStatus();
        this.indexStatus.set(s);
        if (s.is_indexed) { this.indexing.set(false); return; }
      } catch { /* ignore */ }
      if (attempts < 15) setTimeout(poll, 8000);
      else this.indexing.set(false);
    };
    setTimeout(poll, 8000);
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  private saveSessions(list: Session[]): void {
    localStorage.setItem(this.sessionsKey, JSON.stringify(list));
  }

  private saveMsgs(sessionId: string, msgs: ChatEntry[]): void {
    localStorage.setItem(this.msgsKey(sessionId), JSON.stringify(msgs.slice(-MAX_MSGS)));
  }

  createSession(currentList?: Session[]): string {
    const id = genId();
    const session: Session = {
      id, name: 'New conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      msgCount: 0,
    };
    const base = currentList ?? this.sessions();
    const next = [session, ...base];
    this.sessions.set(next);
    this.saveSessions(next);
    this.activeSessionId.set(id);
    this.messages.set([]);
    this.activeTab.set('chat');
    return id;
  }

  openSession(sessionId: string): void {
    const raw  = localStorage.getItem(this.msgsKey(sessionId));
    const msgs = raw ? (JSON.parse(raw) as ChatEntry[]) : [];
    this.messages.set(msgs);
    this.activeSessionId.set(sessionId);
    this.activeTab.set('chat');
    this.shouldScroll = true;
  }

  newSession(): void { this.createSession(); }

  deleteSession(sessionId: string): void { this.deleteTarget.set(sessionId); }

  confirmDelete(): void {
    const sessionId = this.deleteTarget();
    if (!sessionId) return;
    this.deleteTarget.set(null);
    localStorage.removeItem(this.msgsKey(sessionId));
    const next = this.sessions().filter(s => s.id !== sessionId);
    this.sessions.set(next);
    this.saveSessions(next);
    if (this.activeSessionId() === sessionId) {
      if (next.length > 0) this.openSession(next[0].id);
      else this.createSession(next);
    }
  }

  cancelDelete(): void { this.deleteTarget.set(null); }

  openRename(session: Session): void {
    this.renameTarget.set(session);
    this.draftName.set(session.name);
  }

  confirmRename(): void {
    const target = this.renameTarget();
    if (!target || !this.draftName().trim()) return;
    this.updateSessionMeta(target.id, { name: this.draftName().trim() });
    this.renameTarget.set(null);
  }

  cancelRename(): void { this.renameTarget.set(null); }

  private updateSessionMeta(sessionId: string, updates: Partial<Session>): void {
    const next = this.sessions()
      .map(s => s.id === sessionId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    this.sessions.set(next);
    this.saveSessions(next);
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  async send(text?: string): Promise<void> {
    const q = (text ?? this.question()).trim();
    if (!q || this.loading()) return;

    let sessionId = this.activeSessionId();
    if (!sessionId) sessionId = this.createSession();

    const isFirst = this.messages().length === 0;
    const userMsg: ChatEntry = { id: genId(), role: 'user', content: q };
    const newMsgs = [...this.messages(), userMsg];

    this.messages.set(newMsgs);
    this.saveMsgs(sessionId, newMsgs);
    this.question.set('');
    this.loading.set(true);
    this.shouldScroll = true;

    const history: ChatMessage[] = this.messages()
      .slice(-7, -1)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res: AskResponse = await this.ragService.askFirm(q, history);
      const aiMsg: ChatEntry = {
        id: genId(), role: 'assistant',
        content: res.answer,
        sources: (res.sources ?? []).map(s => ({
          source_type:     s.source_type,
          source_id:       s.source_id,
          relevance_score: s.relevance_score,
          source_label:    s.source_label,
          excerpt:         s.excerpt,
          case_id:         s.case_id,
        })),
        showSrc: false,
      };
      const finalMsgs = [...newMsgs, aiMsg];
      this.messages.set(finalMsgs);
      this.saveMsgs(sessionId, finalMsgs);

      if (isFirst) {
        const shortQ = q.length > 50 ? q.slice(0, 47) + '…' : q;
        this.ragService.generateSessionTitle(q, res.answer)
          .then(title => this.updateSessionMeta(sessionId!, { name: title?.trim() || shortQ, msgCount: finalMsgs.length }))
          .catch(() => this.updateSessionMeta(sessionId!, { name: shortQ, msgCount: finalMsgs.length }));
      } else {
        this.updateSessionMeta(sessionId, { msgCount: finalMsgs.length });
      }
    } catch {
      const errMsg: ChatEntry = {
        id: genId(), role: 'assistant',
        content: 'An error occurred. Please check your connection and try again.',
        sources: [],
      };
      const finalMsgs = [...newMsgs, errMsg];
      this.messages.set(finalMsgs);
      this.saveMsgs(sessionId, finalMsgs);
    } finally {
      this.loading.set(false);
      this.shouldScroll = true;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.send(); }
  }

  // ── Sources ───────────────────────────────────────────────────────────────────

  toggleSources(msg: ChatEntry): void {
    this.messages.update(msgs =>
      msgs.map(m => m.id === msg.id ? { ...m, showSrc: !m.showSrc } : m)
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  renderMarkdown(text: string): SafeHtml {
    const lines = (text || '').split('\n');
    const html = lines.map(line => {
      if (line.startsWith('#### ')) return `<strong style="font-size:13px">${this.inline(line.slice(5))}</strong>`;
      if (line.startsWith('### '))  return `<strong style="font-size:14px">${this.inline(line.slice(4))}</strong>`;
      if (line.startsWith('## '))   return `<strong style="font-size:15px">${this.inline(line.slice(3))}</strong>`;
      if (line.startsWith('# '))    return `<strong style="font-size:16px">${this.inline(line.slice(2))}</strong>`;
      if (line.startsWith('- ') || line.startsWith('• ')) return `• ${this.inline(line.slice(2))}`;
      if (/^\d+\.\s/.test(line)) {
        const m = line.match(/^(\d+\.\s)(.*)/);
        return m ? `${m[1]}${this.inline(m[2])}` : this.inline(line);
      }
      return this.inline(line);
    }).join('<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private inline(text: string): string {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#F3F4F6;padding:1px 4px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>');
  }

  sourceLabel(type: string): string { return SOURCE_LABELS[type] ?? type; }
  sourceColor(type: string): string { return SOURCE_COLORS[type] ?? '#9CA3AF'; }

  relevancePct(src: MsgSource): string {
    return src.relevance_score !== undefined ? Math.round(src.relevance_score * 100) + '%' : '';
  }

  sessionDate(session: Session): string {
    const d   = new Date(session.updatedAt || session.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  questionCount(session: Session): number {
    return Math.floor((session.msgCount || 0) / 2);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.msgList?.nativeElement) {
      this.shouldScroll = false;
      const el = this.msgList.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
