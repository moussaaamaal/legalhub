import { Component, inject, ElementRef, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UploadModalService } from './upload-modal.sevice';

@Component({
  selector: 'app-upload-modal',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './upload-modal.html',
})
export class UploadModal {
  svc = inject(UploadModalService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  onFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.svc.addFiles(input.files);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.svc.isDragging.set(false);
    if (event.dataTransfer?.files?.length) this.svc.addFiles(event.dataTransfer.files);
  }

  onDragOver(event: DragEvent) { event.preventDefault(); this.svc.isDragging.set(true); }
  onDragLeave()                { this.svc.isDragging.set(false); }
  openPicker()                 { this.fileInput.nativeElement.click(); }
}