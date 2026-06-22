import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { environment } from '../environments/environment';

/** Set to true on requests that should NOT trigger a /auth redirect on 401. */
export const SKIP_AUTH_REDIRECT = new HttpContextToken<boolean>(() => false);

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
      const skipRedirect = req.context.get(SKIP_AUTH_REDIRECT);
      return next(authReq).pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 401) {
            return from(refreshAccessToken()).pipe(
              switchMap(newToken => {
                if (!newToken) {
                  if (!skipRedirect) { clearSession(); router.navigate(['/auth']); }
                  return throwError(() => err);
                }
                const retryReq = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
                return next(retryReq).pipe(
                  catchError((retryErr: HttpErrorResponse) => {
                    if (retryErr.status === 401 && !skipRedirect) {
                      clearSession();
                      router.navigate(['/auth']);
                    }
                    return throwError(() => retryErr);
                  }),
                );
              }),
            );
          }
          return throwError(() => err);
        }),
      );
    }),
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthEndpoint(url: string): boolean {
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/2fa/login',
    '/api/auth/oauth/token',
    '/api/auth/refresh',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
  ];
  return publicPaths.some(path => {
    const idx = url.indexOf(path);
    if (idx === -1) return false;
    const after = url[idx + path.length];
    return after === undefined || after === '?' || after === '&';
  });
}

/** Read a session key from whichever storage holds the current session. */
function getSessionItem(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

/** Write a session key back to whichever storage already holds the session. */
function setSessionItem(key: string, value: string): void {
  if (sessionStorage.getItem('access_token') !== null || sessionStorage.getItem('refresh_token') !== null) {
    sessionStorage.setItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }
}

/** Returns a valid (non-expired) token, refreshing proactively when needed. */
async function getValidToken(): Promise<string | null> {
  const token = getSessionItem('access_token');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresInMs = payload.exp * 1000 - Date.now();

    // Still valid for more than 5 minutes → use as-is
    if (expiresInMs > 300_000) return token;

    // Expires soon (or already expired) → refresh
    return await refreshAccessToken();
  } catch {
    return token;
  }
}

/** Calls /api/auth/refresh and stores the new access_token.
 *  Concurrent callers share one in-flight request via the module-level promise. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;

  const refreshToken = getSessionItem('refresh_token');
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
      setSessionItem('access_token', data.access_token);
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
  ['access_token', 'refresh_token', 'current_user'].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  window.dispatchEvent(new CustomEvent('lh:session-cleared'));
}
