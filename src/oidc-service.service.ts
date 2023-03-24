import { Injectable } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { Observable, Observer } from "rxjs";
import {
  OAuthClientConfig,
  config,
  configure,
  AuthResult,
  CsrfResult,
  getCsrfResult,
  getStoredCsrfToken,
  getStoredAuthResult,
  getAuthHeader,
  getIdTokenHint,
  cleanSessionStorage,
  deleteStoredAuthResults,
  isSessionAlive,
  obtainSession,
  lazyRefresh,
  silentLogout,
} from "@ilionx/oauth-client-core";

/**
 * Open ID Connect Implicit Flow Service for Angular
 */
@Injectable({ providedIn: "root" })
export class OidcService {
  get config(): OAuthClientConfig {
    return config;
  }

  set config(value: OAuthClientConfig) {
    configure(value);
  }

  getCsrfResult(): Observable<CsrfResult> {
    return new Observable<CsrfResult>((observer) => {
      getCsrfResult().then((csrfResult) => {
        observer.next(csrfResult);
        observer.complete();
      });
    });
  }

  getStoredCsrfToken(): string | null {
    return getStoredCsrfToken();
  }

  getStoredAuthResult(): AuthResult | null {
    return getStoredAuthResult();
  }

  getAuthHeader(): string | null {
    const authResult = this.getStoredAuthResult();
    if (authResult) {
      return getAuthHeader(authResult);
    }
    return null;
  }

  getIdTokenHint(options = { regex: false }): string | null {
    return getIdTokenHint(options);
  }

  cleanSessionStorage(): void {
    cleanSessionStorage();
  }

  deleteStoredAuthResults(): void {
    deleteStoredAuthResults();
  }

  isSessionAlive(): Observable<{ status: number }> {
    return new Observable<{ status: number }>(
      (observer: Observer<{ status: number }>) => {
        isSessionAlive().then(
          (status: { status: number }) => {
            observer.next(status);
            observer.complete();
          },
          (err: HttpErrorResponse) => observer.error(err)
        );
      }
    );
  }

  checkSession(): Observable<boolean> {
    return new Observable<boolean>((observer: Observer<boolean>) => {
      obtainSession().then(
        () => {
          observer.next(true);
          observer.complete();
        },
        () => {
          observer.next(false);
          observer.complete();
        }
      );
    });
  }

  silentRefresh(): Observable<boolean> {
    return new Observable<boolean>((observer: Observer<boolean>) => {
      const token = getStoredAuthResult();
      if (token) {
        lazyRefresh(token).then(
            (result) => {
              observer.next(result);
              observer.complete();
            },
            (err) => {
              observer.error(err);
              observer.complete();
            }
        );
      } else {
        observer.next(false);
        observer.complete();
      }
    });
  }

  silentLogout(): Observable<boolean> {
    return new Observable<boolean>((observer: Observer<boolean>) => {
      silentLogout().then(
        () => {
          observer.next(true);
          observer.complete();
        },
        () => {
          observer.next(false);
          observer.complete();
        }
      );
    });
  }
}
