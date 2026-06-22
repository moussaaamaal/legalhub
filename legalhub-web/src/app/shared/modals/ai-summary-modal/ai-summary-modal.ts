import { Component, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DocumentService } from '../../../services/document.service';

@Component({
  selector: 'app-ai-summary-modal',
  standalone: true,
  imports: [NgClass],
  templateUrl: './ai-summary-modal.html',
})
export class AiSummaryModal {
  private docService = inject(DocumentService);
  private sanitizer  = inject(DomSanitizer);

  show    = signal(false);
  loading = signal(false);
  docName = signal('');
  cached  = signal(false);
  error   = signal('');
  private activeDocId  = '';
  private rawSummary   = signal('');

  get summaryHtml(): SafeHtml {
    const html = this.rawSummary()
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  async open(docId: string, docName: string): Promise<void> {
    this.activeDocId = docId;
    this.show.set(true);
    this.loading.set(true);
    this.docName.set(docName);
    this.error.set('');
    this.rawSummary.set('');
    this.cached.set(false);
    try {
      const res = await this.docService.aiSummarize(docId);
      this.rawSummary.set(res.summary);
      this.cached.set(res.cached);
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'AI summarize failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async regenerate(): Promise<void> {
    if (!this.activeDocId || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.rawSummary.set('');
    this.cached.set(false);
    try {
      const res = await this.docService.aiSummarize(this.activeDocId, true);
      this.rawSummary.set(res.summary);
      this.cached.set(res.cached);
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'AI summarize failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.show.set(false);
  }
}
