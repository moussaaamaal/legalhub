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
    { code: '+216', flag: '🇹🇳', name: 'Tunisia' },
    { code: '+213', flag: '🇩🇿', name: 'Algeria' },
    { code: '+212', flag: '🇲🇦', name: 'Morocco' },
    { code: '+20',  flag: '🇪🇬', name: 'Egypt' },
    { code: '+218', flag: '🇱🇾', name: 'Libya' },
    { code: '+33',  flag: '🇫🇷', name: 'France' },
    { code: '+1',   flag: '🇺🇸', name: 'USA/Canada' },
    { code: '+44',  flag: '🇬🇧', name: 'UK' },
    { code: '+49',  flag: '🇩🇪', name: 'Germany' },
    { code: '+39',  flag: '🇮🇹', name: 'Italy' },
    { code: '+34',  flag: '🇪🇸', name: 'Spain' },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
    { code: '+971', flag: '🇦🇪', name: 'UAE' },
    { code: '+974', flag: '🇶🇦', name: 'Qatar' },
    { code: '+91',  flag: '🇮🇳', name: 'India' },
  ];

  @Output() saved = new EventEmitter<void>();

  showModal    = signal(false);
  modalStep    = signal<1 | 2 | 3 | 4>(1);
  isSubmitting = signal(false);
  submitError  = signal<string | null>(null);
  private _newClientId = signal<string | null>(null);
  _inviteToken = signal<string | null>(null);
  copied       = signal(false);
  emailSent    = signal(false);

  // Step 1 — Personal Info (mirrors mobile Step 1)
  f1 = signal({
    firstName: '', lastName: '', dob: '', gender: '',
    idNumber: '', nationality: '', occupation: '', clientType: 'Individual',
  });

  // Step 2 — Contact Info
  f2 = signal({
    phoneCode: '+216', phone: '', waCode: '+216', whatsapp: '',
    email: '', contactPref: '',
  });

  // Step 3 — Additional
  f3 = signal({
    address: '', city: '', state: '', caseType: '', referral: '', notes: '',
  });

  clientTypes = ['Individual', 'Company', 'NGO', 'Government'];

  get step1Valid() { return this.f1().firstName.trim().length > 0; }
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

  setGender(g: string)      { this.f1.update(v => ({ ...v, gender: g })); }
  setClientType(t: string)  { this.f1.update(v => ({ ...v, clientType: t })); }
  setContactPref(p: string) { this.f2.update(v => ({ ...v, contactPref: p })); }

  openModal() {
    this.submitError.set(null);
    this.f1.set({ firstName: '', lastName: '', dob: '', gender: '', idNumber: '', nationality: '', occupation: '', clientType: 'Individual' });
    this.f2.set({ phoneCode: '+216', phone: '', waCode: '+216', whatsapp: '', email: '', contactPref: '' });
    this.f3.set({ address: '', city: '', state: '', caseType: '', referral: '', notes: '' });
    this._newClientId.set(null);
    this._inviteToken.set(null);
    this.copied.set(false);
    this.emailSent.set(false);
    this.modalStep.set(1);
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  nextStep() {
    const s = this.modalStep();
    if (s < 3) this.modalStep.set((s + 1) as 1 | 2 | 3 | 4);
    else this.submitClient();
  }

  prevStep() {
    const s = this.modalStep();
    if (s > 1) this.modalStep.set((s - 1) as 1 | 2 | 3 | 4);
  }

  async submitClient() {
    this.isSubmitting.set(true);
    this.submitError.set(null);
    const f1 = this.f1(); const f2 = this.f2(); const f3 = this.f3();

    const payload: Record<string, unknown> = {
      first_name:  f1.firstName.trim(),
      last_name:   f1.lastName.trim() || '',
      email:       f2.email.trim(),
      client_type: f1.clientType.toUpperCase(),
      tag:         'ACTIVE',
    };

    if (f2.phone)       payload['phone']           = `${f2.phoneCode} ${f2.phone}`.trim();
    if (f2.whatsapp)    payload['whatsapp_number']  = `${f2.waCode} ${f2.whatsapp}`.trim();
    if (f2.contactPref) payload['preferred_contact'] = f2.contactPref;
    if (f1.dob)         payload['date_of_birth']   = f1.dob;
    if (f1.gender)      payload['gender']           = f1.gender.toUpperCase();
    if (f1.idNumber)    payload['national_id']      = f1.idNumber;
    if (f1.nationality) payload['nationality']      = f1.nationality;
    if (f1.occupation)  payload['occupation']       = f1.occupation;
    if (f3.notes)       payload['notes']            = f3.notes;

    const addressParts = [f3.address, f3.city, f3.state].filter(Boolean);
    if (addressParts.length) payload['address'] = addressParts.join(', ');

    try {
      const newClient = await this.clientService.addClient(payload);
      this._newClientId.set(newClient.id);
      try {
        const inviteRes = await this.clientService.inviteClient(newClient.id);
        this._inviteToken.set(inviteRes.invite_token);
      } catch { /* token optional */ }
      this.modalStep.set(4);
      this.saved.emit();
    } catch (err: unknown) {
      const msg = (err as { error?: { detail?: string } })?.error?.detail ?? 'Failed to create client';
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

  async handleShareLink() {
    const token     = this._inviteToken();
    const firstName = this.f1().firstName || 'you';
    const message   = `Hi ${firstName}! You've been invited to LegalHub.\n\nUse this token to create your account: ${token ?? '(unavailable)'}\n\nOpen the app and enter the token manually.`;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: 'LegalHub Invitation', text: message }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(message);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    }
  }

  handleShareEmail() {
    this.emailSent.set(true);
    setTimeout(() => this.emailSent.set(false), 3000);
  }

  async handleCopyToken() {
    const token = this._inviteToken();
    if (!token) return;
    await navigator.clipboard.writeText(token);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }
}
