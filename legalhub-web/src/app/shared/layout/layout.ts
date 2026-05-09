// src/app/shared/layout/layout.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar'

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, Sidebar],
  template: `
    <div class="flex h-screen overflow-hidden">
      <app-sidebar></app-sidebar>
      <main class="flex-1 overflow-auto bg-gray-50">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: []
})
export class Layout {}

