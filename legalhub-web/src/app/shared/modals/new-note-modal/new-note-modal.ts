import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../../services/task.service';
import { CaseService } from '../../../services/case.service';
import { Case } from '../../../models';

@Component({
  selector: 'app-new-note-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './new-note-modal.html',
})
export class NewNoteModal {
  private taskService = inject(TaskService);
  private caseService = inject(CaseService);

  /** When set, the case is pre-locked (case-detail mode) */
  @Input() lockedCaseId    = '';
  @Input() lockedCaseTitle = '';

  @Output() saved = new EventEmitter<void>();

  showModal  = signal(false);
  title      = signal('');
  content    = signal('');
  isSaving   = signal(false);
  selectedId = signal('');

  get cases(): Case[] { return this.caseService.cases(); }

  get isLocked(): boolean { return !!this.lockedCaseId; }

  get activeCaseId(): string {
    return this.isLocked ? this.lockedCaseId : this.selectedId();
  }

  get isValid(): boolean {
    return !!this.activeCaseId && this.content().trim().length > 0;
  }

  openModal() {
    this.title.set('');
    this.content.set('');
    this.selectedId.set('');
    if (!this.isLocked && this.caseService.cases().length === 0) {
      this.caseService.loadCases().catch(() => {});
    }
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  async save(): Promise<void> {
    if (!this.isValid) return;
    this.isSaving.set(true);
    try {
      await this.taskService.createNote({
        case_id: this.activeCaseId,
        // Backend CreateNoteRequest: only case_id + content (prepend title manually)
        content: this.title().trim()
          ? `**${this.title().trim()}**\n${this.content().trim()}`
          : this.content().trim(),
      });
      this.saved.emit();
      this.closeModal();
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      this.isSaving.set(false);
    }
  }
}
