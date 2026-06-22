import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'highlight', standalone: true })
export class HighlightPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string, query: string): SafeHtml {
    if (!query || !query.trim() || !text) return text;
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex   = new RegExp(`(${escaped})`, 'gi');
    const html    = String(text).replace(
      regex,
      '<mark data-search-mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">$1</mark>'
    );
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
