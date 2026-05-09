import { Component, signal, computed } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';

type DocType   = 'contract' | 'letter' | 'motion';
type AnalysisT = 'summary' | 'deadlines' | 'issues';
type QuickTask = 'contract' | 'letter' | 'action' | 'summarize' | null;
type ToneT     = 'formal' | 'professional' | 'plain';
type DetailT   = 'brief' | 'standard' | 'detailed';
type FormatT   = 'docx' | 'pdf' | 'both';

interface HistoryEntry {
  id: number; icon: string; iconBg: string; title: string;
  time: string; caseRef: string; docType: string; active: boolean;
}
interface Suggestion { label: string; desc: string; priority: 'high' | 'medium' | 'low'; }

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
    .animate-pulse-slow {
      animation: pulse-slow 2.8s ease-in-out infinite;
    }
    .quick-active {
      transform: scale(1.045);
      box-shadow: 0 12px 30px -8px rgba(0,0,0,0.22);
    }
    .doctype-active {
      transform: scale(1.04);
      box-shadow: 0 8px 20px -4px rgba(245, 158, 11, 0.35);
    }
  `]
})
export class AiAssistant {

  // ─── History Panel ─────────────────────────
  showHistoryPanel = signal(false);
  historySearch    = signal('');

  history: HistoryEntry[] = [
    { id:1, icon:'fa-solid fa-file-contract', iconBg:'bg-purple-600', title:'Employment Contract',   time:'2 hours ago', caseRef:'Johnson vs. State Corp',  docType:'Contract', active:true  },
    { id:2, icon:'fa-solid fa-envelope',      iconBg:'bg-blue-600',   title:'Demand Letter',         time:'Yesterday',   caseRef:'Martinez Family Trust',   docType:'Letter',   active:false },
    { id:3, icon:'fa-solid fa-file-invoice',  iconBg:'bg-green-600',  title:'Settlement Agreement',  time:'2 days ago',  caseRef:'Thompson Real Estate',    docType:'Contract', active:false },
    { id:4, icon:'fa-solid fa-file-lines',    iconBg:'bg-amber-600',  title:'NDA Document',          time:'3 days ago',  caseRef:'Anderson Employment',     docType:'Contract', active:false },
  ];

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

  // ─── Settings Panel ────────────────────────
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

  // ─── Quick Actions ─────────────────────────
  activeQuickTask = signal<QuickTask>(null);

  quickActions = [
    {
      key: 'contract' as const,
      icon: 'fa-solid fa-file-contract',
      label: 'Draft Contract',
      sub: 'Generate legal contracts',
      activeCls: 'bg-white border-white shadow-2xl quick-active',
      glowCls: 'bg-purple-400',
      iconActiveCls: 'bg-purple-700',
      iconActiveText: 'text-white',
      labelCls: 'text-purple-950 font-bold',
      subCls: 'text-purple-800',
      scrollTo: 'section-generator'
    },
    {
      key: 'letter' as const,
      icon: 'fa-solid fa-envelope',
      label: 'Legal Letter',
      sub: 'Create formal letters',
      activeCls: 'bg-blue-50 border-blue-300 shadow-2xl quick-active',
      glowCls: 'bg-blue-400',
      iconActiveCls: 'bg-blue-700',
      iconActiveText: 'text-white',
      labelCls: 'text-blue-950 font-bold',
      subCls: 'text-blue-800',
      scrollTo: 'section-generator'
    },
    {
      key: 'action' as const,
      icon: 'fa-solid fa-lightbulb',
      label: 'Next Steps',
      sub: 'Suggest procedural actions',
      activeCls: 'bg-amber-50 border-amber-300 shadow-2xl quick-active',
      glowCls: 'bg-amber-400',
      iconActiveCls: 'bg-amber-700',
      iconActiveText: 'text-white',
      labelCls: 'text-amber-950 font-bold',
      subCls: 'text-amber-800',
      scrollTo: 'section-action'
    },
    {
      key: 'summarize' as const,
      icon: 'fa-solid fa-file-lines',
      label: 'Summarize',
      sub: 'Extract key points',
      activeCls: 'bg-green-50 border-green-300 shadow-2xl quick-active',
      glowCls: 'bg-green-400',
      iconActiveCls: 'bg-green-700',
      iconActiveText: 'text-white',
      labelCls: 'text-green-950 font-bold',
      subCls: 'text-green-800',
      scrollTo: 'section-action'
    }
  ];

  selectQuickTask(key: QuickTask): void {
    this.activeQuickTask.set(key);
    if (key === 'contract') this.setDocType('contract');
    if (key === 'letter')   this.setDocType('letter');
    setTimeout(() => this._scrollTo(this.quickActions.find(q => q.key === key)?.scrollTo ?? 'section-generator'), 120);
  }

  // ─── Document Type ─────────────────────────
  selectedDocType = signal<DocType>('contract');

  docTypeOptions = [
    { key: 'contract' as const, icon: 'fa-solid fa-file-contract', iconBg: 'bg-purple-100', iconColor: 'text-purple-700', label: 'Contract', sub: 'Legal agreement'  },
    { key: 'letter'   as const, icon: 'fa-solid fa-envelope',      iconBg: 'bg-blue-100',   iconColor: 'text-blue-700',   label: 'Letter',   sub: 'Formal letter'    },
    { key: 'motion'   as const, icon: 'fa-solid fa-file-invoice',  iconBg: 'bg-green-100',  iconColor: 'text-green-700',  label: 'Motion',   sub: 'Court filing'     },
  ];

  setDocType(t: string): void { this.selectedDocType.set(t as DocType); }

  // ─── Templates & Cases ─────────────────────
  selectedTemplate = signal('Employment Agreement');
  templates = [
    'Employment Agreement', 'Non-Disclosure Agreement (NDA)', 'Service Agreement',
    'Purchase Agreement', 'Partnership Agreement', 'Lease Agreement',
    'Consulting Agreement', 'Settlement Agreement',
  ];

  selectedCase = signal('');
  linkedCase   = computed(() => this.selectedCase() || null);

  cases = [
    'Johnson vs. State Corp', 'Martinez Family Trust', 'Thompson Real Estate Deal',
    'Anderson Employment Case', 'Wilson Medical Malpractice', 'Greenfield Industries',
    "Patterson & Sons", 'Davis Divorce Case',
  ];

  // ─── Form fields ───────────────────────────
  requirements = signal('');
  partyA       = signal('');
  partyB       = signal('');

  private _opt1 = signal(true);
  private _opt2 = signal(true);
  private _opt3 = signal(false);
  private _opt4 = signal(false);

  docOptions = [
    { label: 'Standard legal disclaimers',        value: () => this._opt1(), set: (v: boolean) => this._opt1.set(v) },
    { label: 'Jurisdiction-specific clauses',     value: () => this._opt2(), set: (v: boolean) => this._opt2.set(v) },
    { label: 'Termination conditions',            value: () => this._opt3(), set: (v: boolean) => this._opt3.set(v) },
    { label: 'Arbitration clause',                value: () => this._opt4(), set: (v: boolean) => this._opt4.set(v) },
  ];

  get charCount(): number { return this.requirements().length; }

  isGenerating  = signal(false);
  generatedDoc  = signal<string | null>(null);

  generateDocument(): void {
    if (!this.requirements().trim()) return;
    this.isGenerating.set(true);
    setTimeout(() => {
      this.isGenerating.set(false);
      const label = `${this.selectedTemplate()} ${this.linkedCase() ? '→ ' + this.linkedCase() : ''}`;
      this.generatedDoc.set(label);

      this.history.unshift({
        id: Date.now(),
        icon: 'fa-solid fa-file-contract',
        iconBg: 'bg-purple-600',
        title: this.selectedTemplate(),
        time: 'Just now',
        caseRef: this.linkedCase() || 'No case linked',
        docType: 'Contract',
        active: true
      });
    }, 1600);
  }

  resetForm(): void {
    this.requirements.set('');
    this.partyA.set('');
    this.partyB.set('');
    this.selectedCase.set('');
    this.generatedDoc.set(null);
  }

  // ─── Legal Action Suggester ────────────────
  suggesterCase    = signal('Johnson vs. State Corp');
  situation        = signal('');
  isSuggesting     = signal(false);
  suggestionsShown = signal(false);

  suggestions: Suggestion[] = [
    { label: 'File motion for summary judgment', desc: 'Strong evidence supports immediate filing', priority: 'high'   },
    { label: 'Request mediation session',        desc: 'Consider settlement to reduce litigation cost', priority: 'medium' },
    { label: 'Gather additional witness statements', desc: '3 potential witnesses identified', priority: 'medium' },
    { label: 'Submit discovery request',         desc: 'Request financial records from defendant', priority: 'high'   },
    { label: 'Schedule expert witness consultation', desc: 'Medical expert needed for damages assessment', priority: 'low' },
  ];

  suggestActions(): void {
    this.isSuggesting.set(true);
    setTimeout(() => {
      this.isSuggesting.set(false);
      this.suggestionsShown.set(true);
    }, 1400);
  }

  getPriorityBadge(p: string): string {
    const map = {
      high:   'bg-red-100 text-red-800 border border-red-300',
      medium: 'bg-amber-100 text-amber-800 border border-amber-300',
      low:    'bg-green-100 text-green-800 border border-green-300',
    };
    return map[p as keyof typeof map] || 'bg-gray-100 text-gray-700';
  }

  // ─── Document Analyzer ─────────────────────
  analysisType = signal<AnalysisT>('summary');
  analysisOptions: { value: AnalysisT; label: string; sub: string }[] = [
    { value: 'summary',   label: 'Full Summary & Key Points', sub: 'Extract main arguments and conclusions'     },
    { value: 'deadlines', label: 'Extract Deadlines & Dates', sub: 'Find all dates and filing deadlines'        },
    { value: 'issues',    label: 'Identify Legal Issues',     sub: 'Flag risks and legal vulnerabilities'       },
  ];
  recentAnalyzed = ['Contract_Amendment_v3.pdf', 'Witness_Statement.docx', 'Settlement_Draft.pdf'];

  // ─── Templates Library ─────────────────────
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
    this.selectedTemplate.set(title);
    this.setDocType('contract');
    setTimeout(() => this._scrollTo('section-generator'), 80);
  }

  // ─── Scroll helper ─────────────────────────
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