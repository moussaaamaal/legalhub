import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../environments/environment';

// Shared refresh promise — deduplicates concurrent refresh calls
let refreshing: Promise<string | null> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  // Never inject auth headers on auth endpoints themselves
  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  return from(getValidToken()).pipe(
    switchMap(token => {
      const authReq = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;
      return next(authReq);
    }),
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        clearSession();
        router.navigate(['/auth']);
      }
      return throwError(() => err);
    }),
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/forgot-password')
  );
}

/** Returns a valid (non-expired) token, refreshing proactively when needed. */
async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresInMs = payload.exp * 1000 - Date.now();

    // Still valid for more than 60 seconds → use as-is
    if (expiresInMs > 60_000) return token;

    // Expires soon (or already expired) → refresh
    return await refreshAccessToken();
  } catch {
    // Malformed token — attempt the request anyway and let the 401 handler deal with it
    return token;
  }
}

/** Calls /api/auth/refresh and stores the new access_token.
 *  Concurrent callers share one in-flight request via the module-level promise. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;

  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    clearSession();
    return null;
  }

  refreshing = fetch(`${environment.apiUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(res => {
      if (!res.ok) throw new Error('refresh_failed');
      return res.json();
    })
    .then((data: { access_token: string }) => {
      localStorage.setItem('access_token', data.access_token);
      return data.access_token;
    })
    .catch(() => {
      clearSession();
      return null;
    })
    .finally(() => { refreshing = null; });

  return refreshing;
}

function clearSession(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('current_user');
}
