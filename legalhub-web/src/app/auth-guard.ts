// role.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

export const roleGuard = (allowedRole: string): CanActivateFn => async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const { data } = await auth.getSession();
  const role = data.session?.user?.role;
  if (role === allowedRole) return true;
  router.navigate(['/unauthorized']);
  return false;
};