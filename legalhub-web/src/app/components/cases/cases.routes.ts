// src/app/components/clients/clients.routes.ts
import { Routes } from '@angular/router';

import { CasesList } from './cases-list/cases-list';
import { CaseDetail } from './case-detail/case-detail';

export const casesRoutes: Routes = [
  // /cases → affiche la liste des cases
  {
    path: '',
    component: CasesList
  },

  // /cases/:id → détail d'un case
  {
    path: ':id',
    component: CaseDetail
  },

  // /cases/new → création d'un nouveau case
  // (on réutilise souvent le même composant detail en mode "création")
  {
    path: 'new',
    component: CaseDetail,
    data: { isNew: true }   // optionnel : flag pour savoir qu'on est en création
  },

  // Optionnel : édition explicite (si tu préfères séparer new et edit)
  // {
  //   path: ':id/edit',
  //   component: CaseDetail,
  //   data: { isEdit: true }
  // }
];