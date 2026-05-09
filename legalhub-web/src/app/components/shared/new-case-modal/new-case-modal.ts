import { Component, signal, inject, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseService } from '../../../services/case.service';
import { ClientService } from '../../../services/client.service';
import { Client } from '../../../models';

@Component({
  selector: 'app-new-case-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './new-case-modal.html',
})
export class NewCaseModal {
  private router        = inject(Router);
  private caseService   = inject(CaseService);
  private clientService = inject(ClientService);

  get clients(): Client[] { return this.clientService.clients(); }

  @Output() saved = new EventEmitter<void>();

  showModal     = signal(false);
  modalStep     = signal<1 | 2 | 3 | 4>(1);
  isSubmitting  = signal(false);
  createdCaseId = signal('');

  f1 = signal({ title: '', number: '', caseType: '', practiceArea: '', priority: '', description: '' });
  f2 = signal({
    clientId: '', opposingParty: '', opposingCounsel: '',
    courtName: '', courtLocation: '', judgeName: '',
    filingDate: '', hearingDate: '', statute: '',
  });
  f3 = signal({
    billingType: '', caseValue: '',
    notificationsEnabled: true, aiAnalysis: true, confidential: false,
  });

  caseTypes     = ['Criminal Law','Civil Law','Corporate Law','Family Law','Real Estate Law','Immigration Law','Personal Injury','Intellectual Property','Labor Law','Tax Law'];
  practiceAreas = ['Assault & Battery','Contract Disputes','Divorce & Custody','Estate Planning','Employment Law','Tax Law'];
  billingTypes  = ['Hourly Rate','Flat Fee','Contingency','Retainer'];

  get step1Valid() { return this.f1().title.trim().length > 0 && this.f1().caseType.length > 0; }
  get step2Valid() { return this.f2().clientId.trim().length > 0; }
  get progressPct() { return ((this.modalStep() - 1) / 3) * 100; }

  get stepLabels() {
    const s = this.modalStep();
    return [
      { label: 'Case Info',      active: s === 1, done: s > 1 },
      { label: 'Client & Court', active: s === 2, done: s > 2 },
      { label: 'Financial',      active: s === 3, done: s > 3 },
    ];
  }

  setPriority(p: string) { this.f1.update(v => ({ ...v, priority: p })); }

  getF3Bool(key: string): boolean {
    return !!this.f3()[key as 'notificationsEnabled' | 'aiAnalysis' | 'confidential'];
  }

  setF3Bool(key: string, value: boolean) {
    this.f3.update(v => ({ ...v, [key as 'notificationsEnabled' | 'aiAnalysis' | 'confidential']: value }));
  }

  openModal() {
    if (this.clientService.clients().length === 0) {
      this.clientService.loadClients().catch(() => {});
    }
    this.f1.set({ title: '', number: '', caseType: '', practiceArea: '', priority: '', description: '' });
    this.f2.set({ clientId: '', opposingParty: '', opposingCounsel: '', courtName: '', courtLocation: '', judgeName: '', filingDate: '', hearingDate: '', statute: '' });
    this.f3.set({ billingType: '', caseValue: '', notificationsEnabled: true, aiAnalysis: true, confidential: false });
    this.modalStep.set(1);
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  nextStep() {
    const s = this.modalStep();
    if (s < 3) this.modalStep.set((s + 1) as 1|2|3|4);
    else this.submitCase();
  }

  prevStep() {
    const s = this.modalStep();
    if (s > 1) this.modalStep.set((s - 1) as 1|2|3|4);
  }

  private readonly caseTypeMap: Record<string, string> = {
    'Criminal Law': 'CRIMINAL', 'Civil Law': 'CIVIL', 'Corporate Law': 'CORPORATE',
    'Family Law': 'FAMILY', 'Real Estate Law': 'REAL_ESTATE', 'Immigration Law': 'IMMIGRATION',
    'Personal Injury': 'PERSONAL_INJURY', 'Intellectual Property': 'IP',
    'Labor Law': 'LABOR', 'Tax Law': 'TAX',
  };

  private readonly billingTypeMap: Record<string, string> = {
    'Hourly Rate': 'HOURLY', 'Flat Fee': 'FLAT_FEE', 'Contingency': 'CONTINGENCY', 'Retainer': 'RETAINER',
  };

  private readonly priorityMap: Record<string, string> = {
    'Normal': 'NORMAL', 'Medium': 'MEDIUM', 'Urgent': 'URGENT',
  };

  async submitCase() {
    this.isSubmitting.set(true);
    try {
      const f1 = this.f1(); const f2 = this.f2(); const f3 = this.f3();
      const payload: Record<string, unknown> = {
        title:              f1.title,
        case_number:        f1.number || `CASE-${Date.now()}`,
        case_type:          this.caseTypeMap[f1.caseType] ?? 'CIVIL',
        practice_area:      f1.practiceArea || undefined,
        priority:           this.priorityMap[f1.priority] ?? 'NORMAL',
        description:        f1.description || undefined,
        client_id:          f2.clientId || undefined,
        opposing_party:     f2.opposingParty || undefined,
        opposing_counsel:   f2.opposingCounsel || undefined,
        court_name:         f2.courtName || undefined,
        court_location:     f2.courtLocation || undefined,
        judge_name:         f2.judgeName || undefined,
        filing_date:        f2.filingDate || undefined,
        first_hearing_date: f2.hearingDate || undefined,
        billing_type:       f3.billingType ? (this.billingTypeMap[f3.billingType] ?? undefined) : undefined,
        estimated_value:    f3.caseValue ? Number(f3.caseValue) : undefined,
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
      await this.caseService.addCase(payload);
      this.createdCaseId.set(this.caseService.cases()[0]?.id ?? '');
      this.modalStep.set(4);
      this.saved.emit();
    } catch (err) {
      console.error('Failed to create case:', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  goToNewCase() {
    this.closeModal();
    if (this.createdCaseId()) {
      this.router.navigate(['/cases', this.createdCaseId()]);
    }
  }
}
