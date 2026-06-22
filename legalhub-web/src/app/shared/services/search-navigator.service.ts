import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SearchNavigatorService {
  private marks: HTMLElement[] = [];

  total        = signal(0);
  currentIndex = signal(-1);

  scan(): void {
    this.marks.forEach(m => m.classList.remove('search-active'));
    this.marks = Array.from(
      document.querySelectorAll<HTMLElement>('mark[data-search-mark]')
    );
    this.total.set(this.marks.length);
    if (this.marks.length > 0) {
      this.scrollTo(0);
    } else {
      this.currentIndex.set(-1);
    }
  }

  next(): void {
    if (!this.marks.length) return;
    this.scrollTo((this.currentIndex() + 1) % this.marks.length);
  }

  prev(): void {
    if (!this.marks.length) return;
    this.scrollTo((this.currentIndex() - 1 + this.marks.length) % this.marks.length);
  }

  reset(): void {
    this.marks.forEach(m => m.classList.remove('search-active'));
    this.marks = [];
    this.total.set(0);
    this.currentIndex.set(-1);
  }

  private scrollTo(index: number): void {
    this.marks.forEach((m, i) => m.classList.toggle('search-active', i === index));
    this.currentIndex.set(index);
    this.marks[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
