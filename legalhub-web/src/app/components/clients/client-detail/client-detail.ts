import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Client } from '../../../models';
import { ClientService } from '../../../services/client.service';
import { UploadModalService } from '../../../shared/upload-modal/upload-modal.sevice';
import { UploadModal } from '../../../shared/upload-modal/upload-modal';


@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [NgClass, DecimalPipe, FormsModule, UploadModal],
  templateUrl: './client-detail.html',
})
export class ClientDetail implements OnInit {
  private clientService = inject(ClientService);
  constructor(private route: ActivatedRoute, private router: Router) {}
  upload = inject(UploadModalService);

  activeTab = signal('Overview');
  tabs = ['Overview', 'Cases', 'Documents', 'Payments', 'Communication', 'Notes', 'Activity Log'];

  client    = signal<Client | null>(null);
  isLoading = signal(false);

  // Backend data signals
  backendCases     = signal<any[]>([]);
  backendInvoices  = signal<any[]>([]);
  backendDocuments = signal<any[]>([]);
  casesLoading     = signal(false);
  invoicesLoading  = signal(false);
  docsLoading      = signal(false);

  private loadedTabs = new Set<string>();

  // Computed stats from live backend data
  dynamicStats = computed(() => {
    const cases    = this.backendCases();
    const invoices = this.backendInvoices();
    const docs     = this.backendDocuments();

    const activeCases = cases.filter(c => !['CLOSED', 'SETTLED'].includes(c.status)).length;
    const closedCases = cases.filter(c =>  ['CLOSED', 'SETTLED'].includes(c.status)).length;
    const pendingAmt  = invoices
      .filter(i => ['PENDING', 'OVERDUE'].includes(i.status))
      .reduce((s, i) => s + (i.total_amount ?? 0), 0);
    const fmtAmt = pendingAmt >= 1000
      ? '$' + (pendingAmt / 1000).toFixed(1) + 'K'
      : '$' + pendingAmt.toFixed(0);

    return [
      { iconBg: 'bg-blue-100',   icon: 'fa-solid fa-briefcase',      iconColor: 'text-blue-600',
        value: cases.length    > 0 ? String(activeCases) : '—',
        label: 'Active Cases',    note: cases.length    > 0 ? `${closedCases} closed` : 'Loading…' },
      { iconBg: 'bg-green-100',  icon: 'fa-solid fa-check-circle',   iconColor: 'text-green-600',
        value: cases.length    > 0 ? String(closedCases) : '—',
        label: 'Closed Cases',    note: cases.length    > 0 ? `${Math.round(closedCases / Math.max(cases.length, 1) * 100)}% of total` : 'Loading…' },
      { iconBg: 'bg-purple-100', icon: 'fa-solid fa-folder',         iconColor: 'text-purple-600',
        value: docs.length     > 0 ? String(docs.length) : '—',
        label: 'Documents',       note: docs.length     > 0 ? 'All case documents' : 'Open Documents tab' },
      { iconBg: 'bg-amber-100',  icon: 'fa-solid fa-dollar-sign',    iconColor: 'text-amber-600',
        value: invoices.length > 0 ? fmtAmt : '—',
        label: 'Pending Payment', note: invoices.length > 0 ? `${invoices.filter(i => i.status === 'OVERDUE').length} overdue` : 'Loading…' },
      { iconBg: 'bg-red-100',    icon: 'fa-solid fa-calendar-check', iconColor: 'text-red-600',
        value: String(this.events.length),
        label: 'Upcoming Events', note: 'Next: Nov 18' },
    ];
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.isLoading.set(true);
    this.clientService.fetchClientById(id).then(client => {
      this.client.set(client);
      if (client) {
        this.initEditForm();
        this.loadCases(client.id);
        this.loadInvoices(client.id);
      }
    }).finally(() => this.isLoading.set(false));
  }

  setTab(t: string) {
    this.activeTab.set(t);
    const c = this.client();
    if (!c) return;
    if (t === 'Documents' && !this.loadedTabs.has('Documents')) {
      this.loadDocuments(c.id);
    }
  }

  goBack() { this.router.navigate(['/clients']); }

  private async loadCases(clientId: string) {
    this.casesLoading.set(true);
    const data = await this.clientService.fetchClientCases(clientId);
    this.backendCases.set(data);
    this.loadedTabs.add('Cases');
    this.casesLoading.set(false);
  }

  private async loadInvoices(clientId: string) {
    this.invoicesLoading.set(true);
    const data = await this.clientService.fetchClientInvoices(clientId);
    this.backendInvoices.set(data);
    this.loadedTabs.add('Payments');
    this.invoicesLoading.set(false);
  }

  private async loadDocuments(clientId: string) {
    this.docsLoading.set(true);
    const data = await this.clientService.fetchClientDocuments(clientId);
    this.backendDocuments.set(data);
    this.loadedTabs.add('Documents');
    this.docsLoading.set(false);
  }

  // ── Display helpers ───────────────────────────────────

  getCaseStatusInfo(status: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      NEW:           { label: 'New',           bg: 'bg-gray-100',   color: 'text-gray-700'   },
      INVESTIGATION: { label: 'Investigation', bg: 'bg-blue-100',   color: 'text-blue-700'   },
      PRE_TRIAL:     { label: 'Pre-Trial',     bg: 'bg-amber-100',  color: 'text-amber-700'  },
      TRIAL:         { label: 'Trial',         bg: 'bg-orange-100', color: 'text-orange-700' },
      APPEAL:        { label: 'Appeal',        bg: 'bg-purple-100', color: 'text-purple-700' },
      SETTLED:       { label: 'Settled',       bg: 'bg-green-100',  color: 'text-green-700'  },
      CLOSED:        { label: 'Closed',        bg: 'bg-gray-200',   color: 'text-gray-600'   },
    };
    return map[status] ?? { label: status, bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getCaseTypeInfo(type: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      CRIMINAL:        { label: 'Criminal',        bg: 'bg-red-100',    color: 'text-red-700'    },
      CIVIL:           { label: 'Civil',           bg: 'bg-blue-100',   color: 'text-blue-700'   },
      CORPORATE:       { label: 'Corporate',       bg: 'bg-purple-100', color: 'text-purple-700' },
      FAMILY:          { label: 'Family',          bg: 'bg-pink-100',   color: 'text-pink-700'   },
      REAL_ESTATE:     { label: 'Real Estate',     bg: 'bg-green-100',  color: 'text-green-700'  },
      IMMIGRATION:     { label: 'Immigration',     bg: 'bg-teal-100',   color: 'text-teal-700'   },
      PERSONAL_INJURY: { label: 'Personal Injury', bg: 'bg-orange-100', color: 'text-orange-700' },
      IP:              { label: 'IP',              bg: 'bg-indigo-100', color: 'text-indigo-700' },
      LABOR:           { label: 'Labor',           bg: 'bg-yellow-100', color: 'text-yellow-700' },
      TAX:             { label: 'Tax',             bg: 'bg-amber-100',  color: 'text-amber-700'  },
    };
    return map[type] ?? { label: type || '—', bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getInvoiceStatusInfo(status: string) {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      DRAFT:     { label: 'Draft',     bg: 'bg-gray-100',  color: 'text-gray-700'  },
      PENDING:   { label: 'Pending',   bg: 'bg-amber-100', color: 'text-amber-700' },
      PAID:      { label: 'Paid',      bg: 'bg-green-100', color: 'text-green-700' },
      OVERDUE:   { label: 'Overdue',   bg: 'bg-red-100',   color: 'text-red-700'   },
      CANCELLED: { label: 'Cancelled', bg: 'bg-gray-200',  color: 'text-gray-500'  },
    };
    return map[status] ?? { label: status, bg: 'bg-gray-100', color: 'text-gray-700' };
  }

  getDocIconInfo(fileType: string) {
    const map: Record<string, { icon: string; color: string; bg: string }> = {
      PDF:   { icon: 'fa-solid fa-file-pdf',   color: 'text-red-600',    bg: 'bg-red-100'    },
      WORD:  { icon: 'fa-solid fa-file-word',  color: 'text-blue-600',   bg: 'bg-blue-100'   },
      IMAGE: { icon: 'fa-solid fa-file-image', color: 'text-purple-600', bg: 'bg-purple-100' },
      OTHER: { icon: 'fa-solid fa-file',       color: 'text-gray-600',   bg: 'bg-gray-100'   },
    };
    return map[fileType] ?? { icon: 'fa-solid fa-file', color: 'text-gray-600', bg: 'bg-gray-100' };
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  formatAmount(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  }

  // ── Export PDF ────────────────────────────────────────
  exportPdf() {
    const c = this.client();
    if (!c) return;
    const cases    = this.backendCases();
    const invoices = this.backendInvoices();

    const rowCases = cases.length
      ? cases.map(cas => `<tr>
          <td>${cas.title || '—'}</td>
          <td>${this.getCaseTypeInfo(cas.case_type || '').label}</td>
          <td>${this.getCaseStatusInfo(cas.status || '').label}</td>
          <td>${this.formatDate(cas.created_at)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px">No cases found</td></tr>';

    const rowInvoices = invoices.length
      ? invoices.map(inv => `<tr>
          <td>${inv.invoice_number || '—'}</td>
          <td>${this.getInvoiceStatusInfo(inv.status || '').label}</td>
          <td>${this.formatAmount(inv.total_amount, inv.currency)}</td>
          <td>${this.formatDate(inv.due_date)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:16px">No invoices found</td></tr>';

    const win = window.open('', '_blank', 'width=900,height=650');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Client Report — ${c.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#fff;padding:32px}
  .logo{font-weight:800;color:#d97706;font-size:18px;letter-spacing:.05em}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #f59e0b}
  .badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:700}
  .green{background:#d1fae5;color:#065f46}.amber{background:#fef3c7;color:#92400e}.red{background:#fee2e2;color:#991b1b}
  h1{font-size:22px;color:#111827;margin-bottom:6px}
  .meta{text-align:right;font-size:12px;color:#6b7280;line-height:1.8}
  .section{margin:24px 0}
  .section-title{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
  .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .info-item label{display:block;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px}
  .info-item p{font-size:13px;color:#111827}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
  thead{background:#f9fafb}
  th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb}
  td{padding:9px 12px;border-bottom:1px solid #f3f4f6;color:#374151}
  .footer{margin-top:40px;text-align:center;font-size:11px;color:#9ca3af;padding-top:14px;border-top:1px solid #e5e7eb}
  @media print{@page{margin:1cm}body{padding:0}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">LegalHub</div>
    <h1>${c.name}</h1>
    <div style="margin-top:8px">
      <span class="badge ${c.status === 'Active' ? 'green' : c.status === 'Pending' ? 'amber' : 'red'}">${c.status}</span>
      &nbsp;<span style="font-size:12px;color:#6b7280">${c.type}</span>
    </div>
  </div>
  <div class="meta">
    <div>Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
    <div>Client Since: ${c.since}</div>
    <div>Attorney: ${c.attorney}</div>
  </div>
</div>
<div class="section">
  <div class="section-title">Contact Information</div>
  <div class="info-grid">
    <div class="info-item"><label>Email</label><p>${c.email || '—'}</p></div>
    <div class="info-item"><label>Phone</label><p>${c.phone || '—'}</p></div>
    <div class="info-item"><label>Company</label><p>${c.company || '—'}</p></div>
    <div class="info-item"><label>Address</label><p>${c.address || '—'}</p></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Cases (${cases.length} total)</div>
  <table>
    <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Date Opened</th></tr></thead>
    <tbody>${rowCases}</tbody>
  </table>
</div>
<div class="section">
  <div class="section-title">Invoices (${invoices.length} total)</div>
  <table>
    <thead><tr><th>Invoice #</th><th>Status</th><th>Amount</th><th>Due Date</th></tr></thead>
    <tbody>${rowInvoices}</tbody>
  </table>
</div>
<div class="footer">LegalHub · ${c.name} · Generated ${new Date().toLocaleString()}</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`);
    win.document.close();
  }

  // ── Static data (Communication, Notes, Activity Log, sidebar) ─

  documents = [
    { iconBg:'bg-red-100',    icon:'fa-solid fa-file-pdf',   iconColor:'text-red-600',    name:'Employment_Contract_Amendment.pdf', case:'Johnson vs. State Corp',  size:'2.4 MB',  when:'2 hours ago' },
    { iconBg:'bg-blue-100',   icon:'fa-solid fa-file-word',  iconColor:'text-blue-600',   name:'Trust_Agreement_Draft_v3.docx',     case:'Estate Planning',         size:'1.8 MB',  when:'5 hours ago' },
    { iconBg:'bg-green-100',  icon:'fa-solid fa-file-excel', iconColor:'text-green-600',  name:'Property_Financial_Analysis.xlsx',  case:'Real Estate Transaction', size:'3.2 MB',  when:'Yesterday' },
    { iconBg:'bg-purple-100', icon:'fa-solid fa-file-image', iconColor:'text-purple-600', name:'Evidence_Photos_Workplace.zip',     case:'Johnson vs. State Corp',  size:'15.7 MB', when:'2 days ago' },
    { iconBg:'bg-red-100',    icon:'fa-solid fa-file-pdf',   iconColor:'text-red-600',    name:'Purchase_Agreement_Commercial.pdf', case:'Real Estate Transaction', size:'4.1 MB',  when:'3 days ago' },
  ];

  communications = [
    { iconBg:'bg-blue-100',   icon:'fa-solid fa-envelope', iconColor:'text-blue-600',   title:'Email Sent: Case Update',                 by:'Sent by Sarah Williams',                             when:'2 hours ago', body:'Updated client on discovery progress. Discussed upcoming hearing preparation and witness list.',    tag:'Email',      tagBg:'bg-blue-100 text-blue-700',    case:'Johnson vs. State Corp'   },
    { iconBg:'bg-green-100',  icon:'fa-solid fa-phone',    iconColor:'text-green-600',  title:'Phone Call: Trust Agreement Discussion',  by:'Call with Michael Chen - Duration: 45 minutes',     when:'Yesterday',   body:'Discussed beneficiary designations and trust provisions. Client requested modifications.',          tag:'Phone Call', tagBg:'bg-green-100 text-green-700',  case:'Estate Planning'          },
    { iconBg:'bg-purple-100', icon:'fa-solid fa-users',    iconColor:'text-purple-600', title:'In-Person Meeting: Property Acquisition', by:'Meeting with Michael Chen - Office Conference Room', when:'2 days ago',  body:'Reviewed purchase agreement for commercial property. Client approved terms.',                       tag:'In-Person',  tagBg:'bg-purple-100 text-purple-700',case:'Real Estate Transaction'  },
    { iconBg:'bg-amber-100',  icon:'fa-solid fa-file-alt', iconColor:'text-amber-600',  title:'Document Received: Evidence Submission',  by:'Received from client via email',                     when:'3 days ago',  body:'Client submitted additional workplace documentation and witness contact information.',              tag:'Document',   tagBg:'bg-amber-100 text-amber-700',  case:'Johnson vs. State Corp'   },
  ];

  notes = [
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg', author:'Sarah Williams', when:'3 hours ago', body:'Client is very detail-oriented and prefers frequent updates. Responds quickly to emails.', tagBg:'bg-blue-100 text-blue-700',    tag:'Client Management'     },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', author:'Michael Chen',   when:'Yesterday',   body:'Client has complex estate planning needs with multiple business interests.',                tagBg:'bg-green-100 text-green-700',  tag:'Estate Planning'       },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', author:'Michael Chen',   when:'2 days ago',  body:'Client is considering additional commercial property investments.',                         tagBg:'bg-purple-100 text-purple-700',tag:'Business Development'  },
  ];

  timeline = [
    { bg:'bg-blue-500',   icon:'fa-solid fa-file-upload',   title:'Documents Uploaded',    desc:'Sarah Williams uploaded 3 files',                  when:'2 hours ago', tagBg:'bg-blue-100 text-blue-700',    tag:'Documents' },
    { bg:'bg-green-500',  icon:'fa-solid fa-check',         title:'Payment Received',       desc:'Invoice INV-2867 paid - $8,500.00',                when:'Yesterday',   tagBg:'bg-green-100 text-green-700',  tag:'Payment'   },
    { bg:'bg-purple-500', icon:'fa-solid fa-users',         title:'Meeting Completed',      desc:'In-person meeting with Michael Chen',              when:'2 days ago',  tagBg:'bg-purple-100 text-purple-700',tag:'Meeting'   },
    { bg:'bg-amber-500',  icon:'fa-solid fa-calendar-plus', title:'Hearing Scheduled',      desc:'Court hearing scheduled for November 16, 2024',    when:'3 days ago',  tagBg:'bg-amber-100 text-amber-700',  tag:'Calendar'  },
    { bg:'bg-red-500',    icon:'fa-solid fa-briefcase',     title:'Case Created',           desc:'New case opened: Real Estate Transaction',         when:'1 week ago',  tagBg:'bg-red-100 text-red-700',      tag:'Case'      },
    { bg:'bg-indigo-500', icon:'fa-solid fa-user-plus',     title:'Client Profile Created', desc:'Client added as new client',                       when:'',            tagBg:'bg-indigo-100 text-indigo-700',tag:'Client'    },
  ];

  team = [
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg', border:'border-blue-500',   name:'Sarah Williams',   role:'Lead Attorney'          },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', border:'border-green-500',  name:'Michael Chen',     role:'Estate Attorney'        },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg', border:'border-purple-500', name:'Michael Chen',     role:'Real Estate Attorney'   },
    { avatar:'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg', border:'border-gray-300',   name:'Jessica Martinez', role:'Paralegal'              },
  ];

  events = [
    { monthBg:'bg-red-100',   monthColor:'text-red-600',   dayColor:'text-red-700',   month:'Nov', day:'16', title:'Court Hearing',  sub:'Johnson vs. State Corp', time:'10:00 AM - Courtroom 4B'  },
    { monthBg:'bg-amber-100', monthColor:'text-amber-600', dayColor:'text-amber-700', month:'Nov', day:'18', title:'Client Meeting', sub:'Estate Planning Review', time:'2:00 PM - Office'         },
    { monthBg:'bg-blue-100',  monthColor:'text-blue-600',  dayColor:'text-blue-700',  month:'Nov', day:'25', title:'Document Review',sub:'Trust Agreement Final',   time:'11:00 AM - Video Call'    },
  ];

  // ── Avatar upload ─────────────────────────────────────────

  isUploadingAvatar = signal(false);
  avatarPreview     = signal<string | null>(null);

  triggerAvatarInput(input: HTMLInputElement) { input.click(); }

  async onAvatarSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    const c = this.client();
    if (!c) return;
    this.isUploadingAvatar.set(true);
    try {
      const updated = await this.clientService.uploadAvatar(c.id, file);
      this.client.set(updated);
      this.avatarPreview.set(null);
    } catch {
      this.avatarPreview.set(null);
    } finally {
      this.isUploadingAvatar.set(false);
      (event.target as HTMLInputElement).value = '';
    }
  }

  // ── Edit Modal ────────────────────────────────────────────
  showEditModal = signal(false);
  editStep      = signal<1|2|3>(1);
  isSaving      = signal(false);

  attorneys   = ['Sarah Williams','Michael Chen','Jennifer Lopez','Robert Taylor'];
  clientTypes = ['Premium Client','Standard Client','VIP Client','Corporate Client'];
  statusList  = ['Active','Pending','Inactive'];

  eF1 = signal({ name:'', email:'', phone:'', mobile:'', company:'', address:'', city:'', taxId:'' });
  eF2 = signal({ type:'', status:'', attorney:'', since:'', tags:'' });
  eF3 = signal({ notes:'', priority:'', preferredContact:'' });

  get editStep1Valid() {
    const f = this.eF1();
    return f.name.trim().length > 0 && f.email.trim().length > 0;
  }

  get editProgressPct() {
    return ((this.editStep() - 1) / 2) * 100;
  }

  get editStepLabels() {
    const s = this.editStep();
    return [
      { label: 'Identity',       active: s === 1, done: s > 1 },
      { label: 'Classification', active: s === 2, done: s > 2 },
      { label: 'Notes',          active: s === 3, done: s > 3 },
    ];
  }

  initEditForm() {
    const c = this.client();
    if (!c) return;
    this.eF1.set({
      name:    c.name,
      email:   c.email,
      phone:   c.phone,
      mobile:  '',
      company: c.company,
      address: c.address ?? '',
      city:    '',
      taxId:   '',
    });
    this.eF2.set({
      type:     c.type,
      status:   c.status,
      attorney: c.attorney,
      since:    c.since,
      tags:     c.tags.join(', '),
    });
    this.eF3.set({ notes: c.notes ?? '', priority: 'Normal', preferredContact: 'Email' });
  }

  openEditModal() {
    this.initEditForm();
    this.editStep.set(1);
    this.showEditModal.set(true);
  }

  closeEditModal() { this.showEditModal.set(false); }

  editNext() {
    const s = this.editStep();
    if (s < 3) this.editStep.set((s + 1) as 1|2|3);
    else this.saveClient();
  }

  editPrev() {
    const s = this.editStep();
    if (s > 1) this.editStep.set((s - 1) as 1|2|3);
  }

  async saveClient() {
    const c = this.client();
    if (!c) return;
    this.isSaving.set(true);

    const f1 = this.eF1(); const f2 = this.eF2(); const f3 = this.eF3();

    const parts      = f1.name.trim().split(' ');
    const first_name = parts[0] || '';
    const last_name  = parts.slice(1).join(' ') || '';

    const clientTypeMap: Record<string, string> = {
      'Corporate Client': 'CORPORATE',
      'Standard Client':  'INDIVIDUAL',
      'Premium Client':   'INDIVIDUAL',
      'VIP Client':       'INDIVIDUAL',
    };
    const tagMap: Record<string, string> = {
      'Active':   'ACTIVE',
      'Inactive': 'INACTIVE',
      'Pending':  'PENDING',
    };

    const payload: Record<string, unknown> = { first_name, last_name, email: f1.email, phone: f1.phone };
    if (f1.company && f1.company !== '—') payload['company_name'] = f1.company;
    const addr = [f1.address, f1.city].filter(Boolean).join(', ');
    if (addr) payload['address'] = addr;
    if (f2.type)   payload['client_type'] = clientTypeMap[f2.type]   ?? 'INDIVIDUAL';
    if (f2.status) payload['tag']         = tagMap[f2.status]        ?? 'ACTIVE';
    if (f3.notes)  payload['notes']       = f3.notes;

    try {
      const updated = await this.clientService.updateClient(c.id, payload);
      this.client.set(updated);
      this.closeEditModal();
    } catch {
      // Error handling can be added here
    } finally {
      this.isSaving.set(false);
    }
  }
}
