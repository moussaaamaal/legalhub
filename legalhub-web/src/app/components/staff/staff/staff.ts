import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffService, StaffMember } from '../../../services/staff.service';
import { AuthService } from '../../../services/auth.service';
import { CaseService } from '../../../services/case.service';
import { SettingsService } from '../../../services/settings.service';
import { HighlightPipe } from '../../../shared/pipes/highlight.pipe';
import { SearchNavigatorService } from '../../../shared/services/search-navigator.service';

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [NgClass, FormsModule, HighlightPipe],
  templateUrl: './staff.html',
})
export class Staff implements OnInit {
  private staffService    = inject(StaffService);
  private authService     = inject(AuthService);
  private caseService     = inject(CaseService);
  private settingsService = inject(SettingsService);
  searchNav               = inject(SearchNavigatorService);

  currentUser = this.authService.currentUser;
  isAdmin     = computed(() => this.currentUser()?.role === 'admin');

  searchQuery = signal('');

  onSearch(q: string): void {
    this.searchQuery.set(q);
    if (!q) { this.searchNav.reset(); return; }
    setTimeout(() => this.searchNav.scan(), 50);
  }

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

  get staffMembers(): StaffMember[] {
    const countMap = new Map<string, number>();
    for (const c of this.caseService.cases()) {
      if (c.assignedTo) countMap.set(c.assignedTo, (countMap.get(c.assignedTo) ?? 0) + 1);
    }
    return this.staffService.staff().map(m => ({ ...m, cases: countMap.get(m.id) ?? 0 }));
  }

  get stats() {
    const members    = this.staffMembers;
    const lawyers    = members.filter(m => m.role === 'LAWYER').length;
    const admins     = members.filter(m => m.role === 'FIRM_ADMIN').length;
    const active     = members.filter(m => m.is_active).length;
    const pending    = members.filter(m => !m.is_active).length;
    const totalCases = members.reduce((sum, m) => sum + m.cases, 0);
    return [
      { icon:'fa-solid fa-users',      iconBg:'bg-blue-100',   iconColor:'text-blue-600',   label:'Total Staff',     value:String(members.length), note:`${lawyers} lawyers, ${admins} admins`, badgeCls:'bg-blue-100 text-blue-700',    badge:'All'      },
      { icon:'fa-solid fa-user-tie',   iconBg:'bg-amber-100',  iconColor:'text-amber-600',  label:'Senior Partners', value:String(admins),          note:'Managing the firm',                   badgeCls:'bg-amber-100 text-amber-700',  badge:'Partners' },
      { icon:'fa-solid fa-user-check', iconBg:'bg-green-100',  iconColor:'text-green-600',  label:'Active Members',  value:String(active),          note:`${pending} pending/inactive`,         badgeCls:'bg-green-100 text-green-700',  badge:'Active'   },
      { icon:'fa-solid fa-building',   iconBg:'bg-purple-100', iconColor:'text-purple-600', label:'Departments',     value:'2',                     note:'Leadership & Legal',                  badgeCls:'bg-purple-100 text-purple-700', badge:'Depts'    },
      { icon:'fa-solid fa-briefcase',  iconBg:'bg-red-100',    iconColor:'text-red-600',    label:'Active Cases',    value:String(totalCases),      note:`Across ${active} active members`,     badgeCls:'bg-red-100 text-red-700',      badge:'Cases'    },
    ];
  }

  // ── Filters ───────────────────────────────────────────
  showFilterPanel = signal(false);
  filterStatus    = signal('');
  deptFilter      = signal('');
  roleFilter      = signal('');
  sortBy          = signal('Name A–Z');
  tableFilters    = ['All', 'Active', 'Pending', 'Inactive'];

  setTableFilter(f: string) { this.filterStatus.set(f === 'All' ? '' : f); }

  get hasActiveFilters(): boolean {
    return !!(this.filterStatus() || this.deptFilter() || this.roleFilter());
  }

  clearFilters() {
    this.filterStatus.set('');
    this.deptFilter.set('');
    this.roleFilter.set('');
  }

  get availableDepts(): string[] {
    return [...new Set(this.staffMembers.map(m => m.dept))].sort();
  }
  get availableRoles(): string[] {
    return [...new Set(this.staffMembers.map(m => m.roleLabel))].sort();
  }

  get filteredStaff(): StaffMember[] {
    let list = this.staffMembers;
    if (this.filterStatus()) list = list.filter(s => s.status === this.filterStatus());
    if (this.deptFilter())   list = list.filter(s => s.dept === this.deptFilter());
    if (this.roleFilter())   list = list.filter(s => s.roleLabel === this.roleFilter());
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.dept.toLowerCase().includes(q) ||
      s.roleLabel.toLowerCase().includes(q)
    );
    const sort = this.sortBy();
    if      (sort === 'Name A–Z')     list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'Name Z–A')     list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === 'Newest First') list = [...list].reverse();
    return list;
  }

  // ── Selected member (shared across modals) ────────────
  private selectedMember = signal<StaffMember | null>(null);

  // ── VIEW modal ────────────────────────────────────────
  private _showView = signal(false);
  get viewMember(): StaffMember | null { return this._showView() ? this.selectedMember() : null; }

  openView(m: StaffMember) { this.selectedMember.set(m); this._showView.set(true); }
  closeView() { this._showView.set(false); }

  // ── EDIT modal ────────────────────────────────────────
  private _showEdit = signal(false);
  editForm   = signal({ fullName: '', phoneCode: '+216', phone: '', role: '' });
  isSaving   = signal(false);
  editError  = signal('');

  get editMember(): StaffMember | null { return this._showEdit() ? this.selectedMember() : null; }

  openEdit(m: StaffMember) {
    this.selectedMember.set(m);
    const { code: phoneCode, number: phone } = this.splitPhone(m.phone);
    this.editForm.set({ fullName: m.name, phoneCode, phone, role: m.role });
    this.editError.set('');
    this._showEdit.set(true);
  }
  closeEdit() { this._showEdit.set(false); }

  async saveEdit() {
    const m = this.selectedMember();
    if (!m) return;
    this.isSaving.set(true);
    this.editError.set('');
    try {
      const f = this.editForm();
      // Only role updates are supported by the backend (no general updateMember endpoint)
      await this.staffService.updateRole(m.id, f.role);
      this._showEdit.set(false);
    } catch (err: unknown) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.editError.set(detail ?? 'Failed to update. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── DELETE modal ──────────────────────────────────────
  private _showDelete = signal(false);
  isDeleting  = signal(false);
  deleteError = signal('');

  get deleteMember(): StaffMember | null { return this._showDelete() ? this.selectedMember() : null; }

  openDelete(m: StaffMember) {
    this.selectedMember.set(m);
    this.deleteError.set('');
    this._showDelete.set(true);
  }
  closeDelete() { this._showDelete.set(false); }

  async confirmDelete() {
    const m = this.selectedMember();
    if (!m) return;
    this.isDeleting.set(true);
    this.deleteError.set('');
    try {
      await this.staffService.deactivate(m.id);
      this._showDelete.set(false);
    } catch (err: unknown) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.deleteError.set(detail ?? 'Failed to deactivate. Please try again.');
    } finally {
      this.isDeleting.set(false);
    }
  }

  // ── Office code ────────────────────────────────────────
  officeCode      = signal('');
  codeCopied      = signal(false);
  showShareModal  = signal(false);

  openShareModal()  { this.showShareModal.set(true); }
  closeShareModal() { this.showShareModal.set(false); }

  async copyCode() {
    const code = this.officeCode();
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.codeCopied.set(true);
    setTimeout(() => this.codeCopied.set(false), 2000);
  }

  shareViaWhatsApp() {
    const code = this.officeCode();
    const text = encodeURIComponent(`Join our firm on LegalHub with the office code: ${code}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  shareViaGmail() {
    const code = this.officeCode();
    const subject = encodeURIComponent('LegalHub — Office Invitation');
    const body = encodeURIComponent(
      `Hi,\n\nYou have been invited to join our firm on LegalHub.\n\nUse the following office code to create your account:\n\nOffice Code: ${code}\n\nVisit the LegalHub platform or download the app and enter this code to get started.`
    );
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  }


  // ── INVITE modal ───────────────────────────────────────
  showInviteModal = signal(false);
  inviteForm      = signal({ fullName: '', email: '' });
  isInviting      = signal(false);
  inviteError     = signal('');
  inviteSuccess   = signal(false);

  get inviteValid() {
    const f = this.inviteForm();
    return f.fullName.trim().length > 0 && f.email.trim().length > 0;
  }

  openInviteModal() {
    this.inviteForm.set({ fullName: '', email: '' });
    this.inviteError.set('');
    this.inviteSuccess.set(false);
    this.showInviteModal.set(true);
  }
  closeInviteModal() { this.showInviteModal.set(false); }

  async submitInvite() {
    this.isInviting.set(true);
    this.inviteError.set('');
    try {
      const f = this.inviteForm();
      await this.staffService.inviteStaff(f.email, f.fullName.trim());
      this.inviteSuccess.set(true);
    } catch (err: unknown) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.inviteError.set(detail ?? 'Failed to send invitation. Please try again.');
    } finally {
      this.isInviting.set(false);
    }
  }

  async ngOnInit() {
    await Promise.all([
      this.staffService.loadStaff(),
      this.caseService.cases().length === 0 ? this.caseService.loadCases() : Promise.resolve(),
      this.settingsService.getOfficeCode().then(c => this.officeCode.set(c ?? '')).catch(() => {}),
    ]);
  }
}
