import { Injectable, signal } from '@angular/core';

export interface UploadedFile {
  file: File;
  name: string;
  size: string;
  type: 'pdf' | 'word' | 'image' | 'other';
  progress: number;
  done: boolean;
  error: boolean;
}

@Injectable({ providedIn: 'root' })
export class UploadModalService {

  // ── UI state ─────────────────────────────────────────────
  showModal    = signal(false);
  isUploading  = signal(false);
  isDone       = signal(false);
  isDragging   = signal(false);

  // ── Form ─────────────────────────────────────────────────
  selectedCase      = signal('');
  selectedCategory  = signal('');
  selectedAttorney  = signal('');
  description       = signal('');
  files             = signal<UploadedFile[]>([]);

  // ── Real-upload callbacks ─────────────────────────────────
  uploadFn      = signal<((file: File) => Promise<void>) | null>(null);
  afterUploadFn = signal<(() => void) | null>(null);

  // When true: case is pre-locked (openForCase mode), hide dropdown
  caseLocked = signal(false);

  // ── Lookups ──────────────────────────────────────────────
  // Populated dynamically via setCases(); empty by default
  cases: string[] = [];
  private _caseIds: string[] = [];

  readonly categories = [
    'Contracts', 'Pleadings', 'Depositions', 'Financial',
    'Evidence', 'Medical', 'Correspondence', 'Court Orders', 'Other',
  ];
  readonly attorneys = [
    'Sarah Williams', 'Michael Chen',
    'Jennifer Lopez', 'Robert Taylor',
  ];

  // ── Accept filter per upload type ────────────────────────
  private _acceptFilter = signal('*');
  get acceptFilter() { return this._acceptFilter(); }

  // ── Case helpers ──────────────────────────────────────────
  setCases(list: { id: string; name: string }[]): void {
    this.cases    = list.map(c => c.name);
    this._caseIds = list.map(c => c.id);
  }

  getSelectedCaseId(): string {
    const idx = this.cases.indexOf(this.selectedCase());
    return idx >= 0 ? this._caseIds[idx] : '';
  }

  // ── Open helpers ─────────────────────────────────────────
  open(accept = '*') {
    this._acceptFilter.set(accept);
    this.selectedCase.set('');
    this.selectedCategory.set('');
    this.selectedAttorney.set('');
    this.description.set('');
    this.files.set([]);
    this.isUploading.set(false);
    this.isDone.set(false);
    this.isDragging.set(false);
    this.caseLocked.set(false);
    this.uploadFn.set(null);
    this.afterUploadFn.set(null);
    this.showModal.set(true);
  }

  openForCase(caseName: string, fn: (file: File) => Promise<void>, afterFn?: () => void) {
    this._acceptFilter.set('*');
    this.selectedCase.set(caseName);
    this.selectedCategory.set('');
    this.selectedAttorney.set('');
    this.description.set('');
    this.files.set([]);
    this.isUploading.set(false);
    this.isDone.set(false);
    this.isDragging.set(false);
    this.caseLocked.set(true);
    this.uploadFn.set(fn);
    this.afterUploadFn.set(afterFn ?? null);
    this.showModal.set(true);
  }

  // Opens modal with case dropdown + real upload function
  openWithUpload(accept: string, fn: (file: File) => Promise<void>, afterFn?: () => void) {
    this._acceptFilter.set(accept);
    this.selectedCase.set('');
    this.selectedCategory.set('');
    this.selectedAttorney.set('');
    this.description.set('');
    this.files.set([]);
    this.isUploading.set(false);
    this.isDone.set(false);
    this.isDragging.set(false);
    this.caseLocked.set(false);
    this.uploadFn.set(fn);
    this.afterUploadFn.set(afterFn ?? null);
    this.showModal.set(true);
  }

  openPdf()    { this.open('.pdf'); }
  openWord()   { this.open('.doc,.docx'); }
  openImage()  { this.open('.jpg,.jpeg,.png,.gif,.webp'); }
  openFolder() { this.open('*'); }

  close() { this.showModal.set(false); }

  // ── File handling ────────────────────────────────────────
  addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    const mapped: UploadedFile[] = arr.map(f => ({
      file: f,
      name: f.name,
      size: this.formatSize(f.size),
      type: this.detectType(f),
      progress: 0,
      done: false,
      error: false,
    }));
    this.files.update(existing => [...existing, ...mapped]);
  }

  removeFile(index: number) {
    this.files.update(f => f.filter((_, i) => i !== index));
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private detectType(f: File): UploadedFile['type'] {
    if (f.type === 'application/pdf') return 'pdf';
    if (f.type.includes('word') || f.name.endsWith('.doc') || f.name.endsWith('.docx')) return 'word';
    if (f.type.startsWith('image/')) return 'image';
    return 'other';
  }

  get typeIcon(): Record<UploadedFile['type'], string> {
    return {
      pdf:   'fa-solid fa-file-pdf text-red-500',
      word:  'fa-solid fa-file-word text-blue-500',
      image: 'fa-solid fa-file-image text-purple-500',
      other: 'fa-solid fa-file text-gray-500',
    };
  }

  get isValid() {
    return this.files().length > 0 && this.selectedCase() !== '';
  }

  async upload() {
    if (!this.isValid) return;
    this.isUploading.set(true);

    const fn = this.uploadFn();
    if (fn) {
      const files = this.files();
      for (let i = 0; i < files.length; i++) {
        try {
          this.files.update(arr => arr.map((f, idx) => idx === i ? { ...f, progress: 50 } : f));
          await fn(files[i].file);
          this.files.update(arr => arr.map((f, idx) => idx === i ? { ...f, progress: 100, done: true } : f));
        } catch (err) {
          console.error('Upload failed for', files[i].name, err);
          this.files.update(arr => arr.map((f, idx) => idx === i ? { ...f, error: true } : f));
        }
      }
      this.isUploading.set(false);
      this.isDone.set(true);
      const afterFn = this.afterUploadFn();
      if (afterFn) afterFn();
    } else {
      // Fake animation fallback
      const total = this.files().length;
      let completed = 0;
      this.files().forEach((_, idx) => {
        const duration = 800 + Math.random() * 1200;
        const start = Date.now();
        const tick = () => {
          const pct = Math.min(100, Math.round(((Date.now() - start) / duration) * 100));
          this.files.update(arr =>
            arr.map((f, i) => i === idx ? { ...f, progress: pct } : f)
          );
          if (pct < 100) {
            requestAnimationFrame(tick);
          } else {
            this.files.update(arr =>
              arr.map((f, i) => i === idx ? { ...f, done: true } : f)
            );
            completed++;
            if (completed === total) {
              this.isUploading.set(false);
              this.isDone.set(true);
            }
          }
        };
        requestAnimationFrame(tick);
      });
    }
  }
}
