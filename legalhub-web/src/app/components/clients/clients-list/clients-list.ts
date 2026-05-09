import { Component, signal, OnInit, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Client } from '../../../models';
import { ClientService } from '../../../services/client.service';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './clients-list.html',
})
export class ClientsList implements OnInit {
  private clientService = inject(ClientService);
  private router        = inject(Router);

  readonly countryCodes = [
    { code: '+216', flag: '🇹🇳', name: 'Tunisie' },
    { code: '+213', flag: '🇩🇿', name: 'Algérie' },
    { code: '+212', flag: '🇲🇦', name: 'Maroc' },
    { code: '+20',  flag: '🇪🇬', name: 'Égypte' },
    { code: '+218', flag: '🇱🇾', name: 'Libye' },
    { code: '+33',  flag: '🇫🇷', name: 'France' },
    { code: '+1',   flag: '🇺🇸', name: 'USA/Canada' },
    { code: '+44',  flag: '🇬🇧', name: 'UK' },
    { code: '+49',  flag: '🇩🇪', name: 'Allemagne' },
    { code: '+39',  flag: '🇮🇹', name: 'Italie' },
    { code: '+34',  flag: '🇪🇸', name: 'Espagne' },
    { code: '+966', flag: '🇸🇦', name: 'Arabie Saoudite' },
    { code: '+971', flag: '🇦🇪', name: 'Émirats Arabes' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: '+91',  flag: '🇮🇳', name: 'Inde' },
  ];

  private splitPhone(full: string): { code: string; number: string } {
    const match = (full ?? '').match(/^(\+\d{1,4})\s*(.*)/);
    if (match) {
      const known = this.countryCodes.find(c => c.code === match[1]);
      if (known) return { code: match[1], number: match[2] };
    }
    return { code: '+216', number: full ?? '' };
  }

  searchQuery  = signal('');
  activeFilter = signal('All');
  filters      = ['All', 'Active', 'Inactive', 'Pending'];
  isLoading    = signal(false);
  error        = signal<string | null>(null);

  // Advanced filters
  showFilterPanel = signal(false);
  filterStatus    = signal('');
  filterType      = signal('');

  // Selection
  selectedIds = signal<Set<string>>(new Set());

  ngOnInit() { this.loadClients(); }

  private async loadClients() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await this.clientService.loadClients();
    } catch {
      this.error.set('Erreur lors du chargement des clients');
    } finally {
      this.isLoading.set(false);
    }
  }

  get stats() {
    const clients = this.clientService.clients();
    return {
      total:       clients.length,
      active:      clients.filter(c => c.status === 'Active').length,
      inactive:    clients.filter(c => c.status === 'Inactive').length,
      pending:     clients.filter(c => c.status === 'Pending').length,
      totalBilled: '$0',
    };
  }

  get clients(): Client[] { return this.clientService.clients(); }

  get filteredClients(): Client[] {
    return this.clientService.clients().filter(c => {
      const matchFilter = this.activeFilter() === 'All' || c.status === this.activeFilter();
      const q = this.searchQuery().toLowerCase();
      const matchSearch = !q
        || c.name.toLowerCase().includes(q)
        || c.company.toLowerCase().includes(q)
        || c.email.toLowerCase().includes(q);
      const matchStatus = !this.filterStatus() || c.status === this.filterStatus();
      const matchType   = !this.filterType()   || c.type === this.filterType();
      return matchFilter && matchSearch && matchStatus && matchType;
    });
  }

  get hasActiveFilters(): boolean {
    return !!this.filterStatus() || !!this.filterType();
  }

  clearFilters() { this.filterStatus.set(''); this.filterType.set(''); }

  setFilter(f: string)   { this.activeFilter.set(f); }
  goToDetail(id: string) { this.router.navigate(['/clients', id]); }
  

  // ── Selection ─────────────────────────────────────────────

  get allSelected(): boolean {
    const p = this.filteredClients;
    return p.length > 0 && p.every(c => this.selectedIds().has(c.id));
  }

  get selectedCount(): number { return this.selectedIds().size; }

  toggleSelectAll() {
    const ids = new Set(this.selectedIds());
    if (this.allSelected) {
      this.filteredClients.forEach(c => ids.delete(c.id));
    } else {
      this.filteredClients.forEach(c => ids.add(c.id));
    }
    this.selectedIds.set(ids);
  }

  toggleSelect(id: string) {
    const ids = new Set(this.selectedIds());
    ids.has(id) ? ids.delete(id) : ids.add(id);
    this.selectedIds.set(ids);
  }

  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  clearSelection() { this.selectedIds.set(new Set()); }

  // ── Delete ────────────────────────────────────────────────

  async deleteClient(id: string) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    try {
      await this.clientService.deleteClient(id);
    } catch {
      alert('Failed to delete client.');
    }
  }

  // ── Export CSV ────────────────────────────────────────────

  exportCsv() {
    const rows = [
      ['Name', 'Company', 'Email', 'Phone', 'Status', 'Type', 'Active Cases', 'Total Billed', 'Attorney', 'Since'],
      ...this.filteredClients.map(c => [
        c.name, c.company, c.email, c.phone, c.status, c.type,
        String(c.activeCases), c.totalBilled, c.attorney, c.since,
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'clients.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Edit Modal (3 steps — identique à client-detail) ────────

  showEditModal = signal(false);
  editStep      = signal<1|2|3>(1);
  isSaving      = signal(false);
  editingClient = signal<Client | null>(null);
  statusList    = ['Active', 'Pending', 'Inactive'];

  eF1 = signal({ name:'', email:'', phoneCode:'+216', phone:'', mobileCode:'+216', mobile:'', company:'', address:'', city:'', taxId:'' });
  eF2 = signal({ type:'', status:'', attorney:'', since:'', tags:'' });
  eF3 = signal({ notes:'', priority:'', preferredContact:'' });

  get editStep1Valid() {
    const f = this.eF1();
    return f.name.trim().length > 0 && f.email.trim().length > 0;
  }

  get editProgressPct() { return ((this.editStep() - 1) / 2) * 100; }

  get editStepLabels() {
    const s = this.editStep();
    return [
      { label: 'Identity',       active: s === 1, done: s > 1 },
      { label: 'Classification', active: s === 2, done: s > 2 },
      { label: 'Notes',          active: s === 3, done: s > 3 },
    ];
  }

  private initEditForm(c: Client) {
    const { code: phoneCode, number: phone } = this.splitPhone(c.phone);
    this.eF1.set({ name: c.name, email: c.email, phoneCode, phone, mobileCode: '+216', mobile: '', company: c.company, address: c.address ?? '', city: '', taxId: '' });
    this.eF2.set({ type: c.type, status: c.status, attorney: c.attorney, since: c.since, tags: c.tags.join(', ') });
    this.eF3.set({ notes: c.notes ?? '', priority: 'Normal', preferredContact: 'Email' });
  }

  openEditModal(c: Client) {
    this.editingClient.set(c);
    this.initEditForm(c);
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
    const c = this.editingClient();
    if (!c) return;
    this.isSaving.set(true);
    const f1 = this.eF1(); const f2 = this.eF2(); const f3 = this.eF3();
    const parts = f1.name.trim().split(' ');
    const clientTypeMap: Record<string, string> = {
      'Corporate Client': 'CORPORATE', 'Standard Client': 'INDIVIDUAL',
      'Premium Client': 'INDIVIDUAL', 'VIP Client': 'INDIVIDUAL',
    };
    const tagMap: Record<string, string> = { 'Active': 'ACTIVE', 'Inactive': 'INACTIVE', 'Pending': 'PENDING' };
    const payload: Record<string, unknown> = {
      first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '',
      email: f1.email, phone: `${f1.phoneCode} ${f1.phone}`.trim(),
    };
    if (f1.company && f1.company !== '—') payload['company_name'] = f1.company;
    const addr = [f1.address, f1.city].filter(Boolean).join(', ');
    if (addr) payload['address'] = addr;
    if (f2.type)   payload['client_type'] = clientTypeMap[f2.type]   ?? 'INDIVIDUAL';
    if (f2.status) payload['tag']         = tagMap[f2.status]        ?? 'ACTIVE';
    if (f3.notes)  payload['notes']       = f3.notes;
    try {
      await this.clientService.updateClient(c.id, payload);
      this.closeEditModal();
    } catch {
      // silent — user stays on modal
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Modal — New Client (3 steps) ──────────────────────────

  showModal    = signal(false);
  modalStep    = signal<1 | 2 | 3 | 4>(1);
  isSubmitting = signal(false);
  submitError  = signal<string | null>(null);
  private _newClientId = signal<string | null>(null);

  f1 = signal({ fullName:'', dob:'', gender:'', idNumber:'', nationality:'', occupation:'' });
  f2 = signal({ phoneCode:'+216', phone:'', phoneCode2:'+216', phone2:'', email:'', contactPref:'', waCode:'+216', whatsapp:'' });
  f3 = signal({
    address:'', city:'', state:'', zip:'', country:'USA',
    caseType:'', priority:'', caseDesc:'', referral:'',
    emergencyName:'', emergencyPhone:'', relationship:'', notes:'', tags:'',
    consentData:false, consentComm:false, consentTerms:false,
    clientType:'Standard Client', attorney:'',
  });

  attorneys   = ['Sarah Williams', 'Michael Chen', 'Jennifer Lopez', 'Robert Taylor'];
  clientTypes = ['Premium Client', 'Standard Client', 'VIP Client', 'Corporate Client'];

  get step1Valid() { return this.f1().fullName.trim().length > 0; }
  get step2Valid() { return this.f2().email.trim().length > 0 && this.f2().phone.trim().length > 0; }
  get step3Valid() { return true; }
  get progressPct() { return ((this.modalStep() - 1) / 3) * 100; }

  get stepLabels() {
    const s = this.modalStep();
    return [
      { label: 'Personal Info', active: s === 1, done: s > 1 },
      { label: 'Contact Info',  active: s === 2, done: s > 2 },
      { label: 'Additional',    active: s === 3, done: s > 3 },
    ];
  }

  updateConsent(key: string, value: boolean) {
    this.f3.update(v => ({ ...v, [key]: value }));
  }

  setGender(g: string)      { this.f1.update(v => ({ ...v, gender: g })); }
  setContactPref(p: string) { this.f2.update(v => ({ ...v, contactPref: p })); }
  setPriority(p: string)    { this.f3.update(v => ({ ...v, priority: p })); }

  getF3Bool(key: string): boolean {
    const f = this.f3();
    return !!f[key as 'consentData' | 'consentComm' | 'consentTerms'];
  }

  openModal() {
    this.submitError.set(null);
    this.f1.set({ fullName:'', dob:'', gender:'', idNumber:'', nationality:'', occupation:'' });
    this.f2.set({ phoneCode:'+216', phone:'', phoneCode2:'+216', phone2:'', email:'', contactPref:'', waCode:'+216', whatsapp:'' });
    this.f3.set({ address:'', city:'', state:'', zip:'', country:'USA', caseType:'', priority:'', caseDesc:'', referral:'', emergencyName:'', emergencyPhone:'', relationship:'', notes:'', tags:'', consentData:false, consentComm:false, consentTerms:false, clientType:'Standard Client', attorney:'' });
    this._newClientId.set(null);
    this.modalStep.set(1);
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  nextStep() {
    const s = this.modalStep();
    if (s < 3) this.modalStep.set((s + 1) as 1|2|3|4);
    else this.submitClient();
  }

  prevStep() {
    const s = this.modalStep();
    if (s > 1) this.modalStep.set((s - 1) as 1|2|3|4);
  }

  async submitClient() {
    this.isSubmitting.set(true);
    this.submitError.set(null);
    const f1 = this.f1(); const f2 = this.f2(); const f3 = this.f3();

    const parts      = f1.fullName.trim().split(' ');
    const first_name = parts[0] || '';
    const last_name  = parts.slice(1).join(' ') || undefined;

    const clientTypeMap: Record<string, string> = {
      'Standard Client': 'INDIVIDUAL',
      'Premium Client':  'INDIVIDUAL',
      'VIP Client':      'INDIVIDUAL',
    };

    const payload: Record<string, unknown> = {
      first_name,
      email: f2.email,
      client_type: clientTypeMap[f3.clientType] ?? 'INDIVIDUAL',
      tag: 'ACTIVE',
    };
    if (last_name)      payload['last_name']       = last_name;
    if (f2.phone)       payload['phone']           = `${f2.phoneCode} ${f2.phone}`.trim();
    if (f2.whatsapp)    payload['whatsapp_number'] = `${f2.waCode} ${f2.whatsapp}`;
    if (f1.dob)         payload['date_of_birth']   = f1.dob;
    if (f1.gender)      payload['gender']          = f1.gender;
    if (f1.idNumber)    payload['national_id']     = f1.idNumber;
    if (f1.nationality) payload['nationality']     = f1.nationality;
    if (f1.occupation)  payload['occupation']      = f1.occupation;
    if (f3.notes)       payload['notes']           = f3.notes;
    const addressParts = [f3.address, f3.city, f3.state, f3.zip, f3.country].filter(Boolean);
    if (addressParts.length) payload['address'] = addressParts.join(', ');

    try {
      const newClient = await this.clientService.addClient(payload);
      this._newClientId.set(newClient.id);
      this.modalStep.set(4);
    } catch (err: unknown) {
      const msg = (err as { error?: { detail?: string } })?.error?.detail
               ?? 'Erreur lors de la création du client';
      this.submitError.set(msg);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  goToNewClient() {
    const id = this._newClientId();
    this.closeModal();
    if (id) this.router.navigate(['/clients', id]);
  }
}
