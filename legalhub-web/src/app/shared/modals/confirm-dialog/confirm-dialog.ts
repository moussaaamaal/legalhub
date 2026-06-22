import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [NgClass],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  @Input() title        = 'Are you sure?';
  @Input() message      = '';
  @Input() confirmLabel = 'Confirm';
  @Input() type: 'danger' | 'warning' = 'danger';

  @Output() confirmed = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  get iconBg()    { return this.type === 'danger' ? 'bg-red-100'    : 'bg-orange-100'; }
  get iconColor() { return this.type === 'danger' ? 'text-red-500'  : 'text-orange-500'; }
  get icon()      { return this.type === 'danger' ? 'fa-solid fa-trash' : 'fa-solid fa-ban'; }
  get btnCls()    { return this.type === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-orange-500 hover:bg-orange-600 text-white'; }
}
