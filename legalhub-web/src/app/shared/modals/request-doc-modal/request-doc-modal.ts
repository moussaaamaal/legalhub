import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../services/document.service';
import { CaseService } from '../../../services/case.service';
import { Case } from '../../../models';

@Component({
  selector: 'app-request-doc-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './request-doc-modal.html',
})
export class RequestDocModal {
  private docService  = inject(DocumentService);
  private caseService = inject(CaseService);

  /** When set, the case is pre-locked (case-detail mode) */
  @Input() lockedCaseId    = '';
  @Input() lockedCaseTitle = '';

  @Output() sent = new EventEmitter<void>();

  showModal   = signal(false);
  description = signal('');
  isSending   = signal(false);
  selectedId  = signal('');

  get cases(): Case[] { return this.caseService.cases(); }

  get isLocked(): boolean { return !!this.lockedCaseId; }

  get activeCaseId(): string {
    return this.isLocked ? this.lockedCaseId : this.selectedId();
  }

  get isValid(): boolean {
    return !!this.activeCaseId && this.description().trim().length > 0;
  }

  openModal() {
    this.description.set('');
    this.selectedId.set('');
    if (!this.isLocked && this.caseService.cases().length === 0) {
      this.caseService.loadCases().catch(() => {});
    }
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  async send(): Promise<void> {
    if (!this.isValid) return;
    this.isSending.set(true);
    try {
      await this.docService.createDocumentRequest({
        case_id:     this.activeCaseId,
        description: this.description().trim(),
      });
      this.sent.emit();
      this.closeModal();
    } catch (err: any) {
      alert(err?.error?.detail ?? 'Could not send request.');
    } finally {
      this.isSending.set(false);
    }
  }
}
