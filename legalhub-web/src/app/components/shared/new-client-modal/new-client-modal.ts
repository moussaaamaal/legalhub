import { Component, signal, inject, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientService } from '../../../services/client.service';

@Component({
  selector: 'app-new-client-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './new-client-modal.html',
})
export class NewClientModal {
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

  @Output() saved = new EventEmitter<void>();

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
      'Standard Client': 'INDIVIDUAL', 'Premium Client': 'INDIVIDUAL', 'VIP Client': 'INDIVIDUAL',
    };
    const payload: Record<string, unknown> = {
      first_name, email: f2.email,
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
      this.saved.emit();
    } catch (err: unknown) {
      const msg = (err as { error?: { detail?: string } })?.error?.detail ?? 'Erreur lors de la création du client';
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
