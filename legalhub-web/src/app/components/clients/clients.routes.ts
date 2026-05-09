// src/app/components/clients/clients.routes.ts
import { Routes } from '@angular/router';

import { ClientsList } from './clients-list/clients-list';
import { ClientDetail } from './client-detail/client-detail';

export const clientsRoutes: Routes = [
  // /clients → affiche la liste des clients
  {
    path: '',
    component: ClientsList
  },

  // /clients/:id → détail d'un client
  {
    path: ':id',
    component: ClientDetail
  },

  // /clients/new → création d'un nouveau client
  // (on réutilise souvent le même composant detail en mode "création")
  {
    path: 'new',
    component: ClientDetail,
    data: { isNew: true }   // optionnel : flag pour savoir qu'on est en création
  },

  // Optionnel : édition explicite (si tu préfères séparer new et edit)
  // {
  //   path: ':id/edit',
  //   component: ClientDetailComponent,
  //   data: { isEdit: true }
  // }
];