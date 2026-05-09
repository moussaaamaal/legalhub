// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { Layout } from './shared/layout/layout';

export const routes: Routes = [
  // ────────────────────────────────────────────────
  // Page de login → première page affichée
  // ────────────────────────────────────────────────
  {
    path: 'auth',
    loadComponent: () => import('./components/auth/auth/auth')
      .then(m => m.Auth)
  },

  // ────────────────────────────────────────────────
  // Toutes les pages protégées (avec sidebar)
  // ────────────────────────────────────────────────
  {
    path: '',
    component: Layout,                     // ← contient <app-sidebar> + <router-outlet>
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./components/dashboard/dashboard/dashboard')
          .then(m => m.Dashboard)
      },

      {
        path: 'cases',
        loadChildren: () => import('./components/cases/cases.routes')
          .then(m => m.casesRoutes)
      },
      {
        path: 'clients',
        loadChildren: () => import('./components/clients/clients.routes')
          .then(m => m.clientsRoutes)
      },

      {
        path: 'calendar',
        loadComponent: () => import('./components/calendar/calendar/calendar')
          .then(m => m.Calendar)
      },

      {
        path: 'documents',
        loadComponent: () => import('./components/documents/documents/documents')
          .then(m => m.Documents)
      },

      {
        path: 'billing',
        loadComponent: () => import('./components/billing/billing/billing')
          .then(m => m.Billing)
      },

      {
        path: 'ai-assistant',
        loadComponent: () => import('./components/ai-assistant/ai-assistant/ai-assistant')
          .then(m => m.AiAssistant)
      },

      {
        path: 'staff',
        loadComponent: () => import('./components/staff/staff/staff')
          .then(m => m.Staff)
      },

      {
        path: 'notifications',
        loadComponent: () => import('./components/notifications/notifications/notifications')
          .then(m => m.Notifications)
      },

      {
        path: 'settings',
        loadComponent: () => import('./components/settings/settings/settings')
          .then(m => m.Settings)
      },
            
      {
        path: 'help',
        loadComponent: () => import('./components/help/help/help')
          .then(m => m.Help)
      },

      {
        path: 'profile',
        loadComponent: () => import('./components/profile/profile')
          .then(m => m.Profile)
      },
    ]
      
  },

  // En cas d'URL inconnue → retour vers login
  {
    path: '**',
    redirectTo: 'auth'
  }
];