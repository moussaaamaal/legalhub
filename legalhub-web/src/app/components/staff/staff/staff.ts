import { Component, signal, inject, OnInit } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffService, StaffMember } from '../../../services/staff.service';

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './staff.html',
})
export class Staff implements OnInit {
  private staffService = inject(StaffService);

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

  get staffMembers(): StaffMember[] { return this.staffService.staff(); }

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
  activeFilter = signal('All');
  filters      = ['All', 'Active', 'Pending', 'Inactive'];
  deptFilter   = signal('');
  roleFilter   = signal('');
  sortBy       = signal('Name A–Z');

  setFilter(f: string) { this.activeFilter.set(f); }

  get availableDepts(): string[] {
    return [...new Set(this.staffMembers.map(m => m.dept))].sort();
  }
  get availableRoles(): string[] {
    return [...new Set(this.staffMembers.map(m => m.roleLabel))].sort();
  }

  get filteredStaff(): StaffMember[] {
    let list = this.staffMembers;
    if (this.activeFilter() !== 'All')  list = list.filter(s => s.status === this.activeFilter());
    if (this.deptFilter())              list = list.filter(s => s.dept === this.deptFilter());
    if (this.roleFilter())              list = list.filter(s => s.roleLabel === this.roleFilter());
    const sort = this.sortBy();
    if      (sort === 'Name A–Z')    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'Name Z–A')    list = [...list].sort((a, b) => b.name.localeCompare(a.name));
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
      await this.staffService.updateMember(m.id, f.fullName, `${f.phoneCode} ${f.phone}`.trim(), f.role);
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

  // ── ADD STAFF modal ───────────────────────────────────
  showModal    = signal(false);
  modalStep    = signal<1|2|3|4>(1);
  isSubmitting = signal(false);
  errorMsg     = signal('');

  departments = ['Leadership','Civil Litigation','Estate Law','Corporate Law','Real Estate','Employment Law','Administration'];
  roles       = ['Senior Partner','Associate','Junior Associate','Paralegal','Secretary','Of Counsel','Management','Intern'];
  titles      = ['Managing Partner','Partner','Senior Associate','Junior Associate','Of Counsel','Paralegal','Legal Secretary','Office Manager'];

  f1 = signal({ firstName:'', lastName:'', dob:'', gender:'', phoneCode:'+216', phone:'', email:'', address:'', city:'' });
  f2 = signal({ title:'', role:'', dept:'', startDate:'', employeeId:'', barNumber:'', practiceAreas:'' });
  f3 = signal({ status:'Active', systemAccess:true, caseAccess:true, billingAccess:false, emergencyName:'', emergencyPhone:'', notes:'' });

  get step1Valid() {
    const f = this.f1();
    return f.firstName.trim().length > 0 && f.lastName.trim().length > 0 && f.email.trim().length > 0;
  }
  get step2Valid() {
    const f = this.f2();
    return f.role.length > 0 && f.dept.length > 0;
  }
  get progressPct() { return ((this.modalStep() - 1) / 3) * 100; }

  get stepLabels() {
    const s = this.modalStep();
    return [
      { label:'Personal Info',     active:s===1, done:s>1 },
      { label:'Professional',      active:s===2, done:s>2 },
      { label:'Access & Settings', active:s===3, done:s>3 },
    ];
  }

  setGender(g: string) { this.f1.update(v => ({ ...v, gender: g })); }

  getF3Bool(key: string): boolean {
    const f = this.f3();
    return !!f[key as 'systemAccess'|'caseAccess'|'billingAccess'];
  }
  setF3Bool(key: string, value: boolean) {
    const k = key as 'systemAccess'|'caseAccess'|'billingAccess';
    this.f3.update(v => ({ ...v, [k]: value }));
  }

  openModal() {
    this.f1.set({ firstName:'', lastName:'', dob:'', gender:'', phoneCode:'+216', phone:'', email:'', address:'', city:'' });
    this.f2.set({ title:'', role:'', dept:'', startDate:'', employeeId:'', barNumber:'', practiceAreas:'' });
    this.f3.set({ status:'Active', systemAccess:true, caseAccess:true, billingAccess:false, emergencyName:'', emergencyPhone:'', notes:'' });
    this.modalStep.set(1);
    this.errorMsg.set('');
    this.showModal.set(true);
  }
  closeModal() { this.showModal.set(false); }

  nextStep() {
    const s = this.modalStep();
    if (s < 3) this.modalStep.set((s + 1) as 1|2|3|4);
    else this.submitStaff();
  }
  prevStep() {
    const s = this.modalStep();
    if (s > 1) this.modalStep.set((s - 1) as 1|2|3|4);
  }

  async submitStaff() {
    this.isSubmitting.set(true);
    this.errorMsg.set('');
    try {
      const f1 = this.f1();
      await this.staffService.inviteStaff(f1.email, `${f1.firstName} ${f1.lastName}`.trim());
      this.modalStep.set(4);
    } catch (err: unknown) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.errorMsg.set(detail ?? 'Failed to invite staff member. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async ngOnInit() {
    await this.staffService.loadStaff();
  }
}
