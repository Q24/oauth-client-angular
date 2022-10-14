[![npm](https://img.shields.io/npm/v/@hawaii-framework/ngx-oidc-implicit.svg?style=flat-square)](https://www.npmjs.com/package/@hawaii-framework/ngx-oidc-implicit)

# OAuth client for Angular

A wrapper for use with Angular on the [OIDC Oauth Core package](https://www.npmjs.com/package/@ilionx/oauth-client-core). This package uses the static methods from that library and wraps them with Observables where neccessary.

## Features

- For use with Angular 6 onwards
- Supports OpenID Connect Implicit Flow
- Support Code flow with PKCE
- Multiple Provider ID's possible in one browser window (scoped tokens)
- AOT build
- CSRF Tokens

## Installation

```sh
npm install @ilionx/oauth-client-core @ilionx/oauth-client-angular
```

## Config

Create a constants file (with an Injection Token) within the src dir somewhere with the following code:

```typescript
import { OAuthClientConfig } from '@ilionx/oauth-client-angular';
import { InjectionToken } from '@angular/core';

export let OIDC_CONFIG_CONSTANTS = new InjectionToken<OAuthClientConfig>(
  'sso-config.constants',
);

export const OidcConfigDefaults: OAuthClientConfig = {
    client_id: '{{ CLIENT ID }}',
    response_type: 'id_token token',
    redirect_uri: `{{ DEFAULT REDIRECT URI }}`,
    scope: '{{ SCOPES }}',
    issuer: `{{ AUTHORISATION URL }}`,
    ...
};
```

## Implementation


### `auth.guard.ts`

In your scaffolded setup, add a Guard. If you're using multiple lazy loaded modules, make sure you add the guard to your Shared Module

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private _oidcService: OidcService,
    @Inject(OIDC_CONFIG_CONSTANTS) private _ssoConfigConstants: OidcConfig,
    @Inject(APP_CONSTANTS) private _appConstants: AppConstantsModel,
    private _pls: PathLocationStrategy,
    private _router: Router,
  ) {
    this._oidcService.config = this._ssoConfigConstants;
  }

    canActivate(
        next: ActivatedRouteSnapshot,
        state: RouterStateSnapshot,
    ): Observable<boolean> {
        return new Observable((observer) => {
            const port: string = window.location.port;
            const protocol: string = window.location.protocol;
            const hostname: string = window.location.hostname;
            const baseRedirectUri = `${protocol}//${hostname}${
                port ? `:${port}` : ''
            }`;
            const localToken = this._oidcService.getStoredAuthResult();

            // Set the redirect uri in this instance
            this._oidcService.config.redirect_uri = `${baseRedirectUri}${this._pls.getBaseHref()}${
                state.url
            }`;

            // Do the session check
            this._oidcService.checkSession().subscribe(
                (authenticated: boolean) => {
                    // Check if the token expires in the next (x) seconds,
                    // if so, set trigger a silent refresh of the Access Token in the OIDC Service.
                    if (
                        localToken &&
                        localToken.expires -
                        Math.round(new Date().getTime() / 1000.0) <
                        300
                    ) {
                        this._oidcService.silentRefresh().subscribe();
                    }
                    
                    observer.next(authenticated);
                    observer.complete();
                },
                () => {
                    // Do your error stuff
                },
            );
        });
    }
}
```

### `someModule-routing.modules.ts`

Use the guard on routes:

```ts
const routes: Routes = [
  {
    path: '',
    component: SomeComponent,
    canActivate: [AuthGuard],
  },
];
```

### adding the bearer token to rest-calls

Example of adding Bearer header to rest calls. I use a service wrapper for this:

```ts
@Injectable()
export class RestService {
  private _headers = new HttpHeaders();

  constructor(
    private _http: HttpClient,
    @Inject(OIDC_CONFIG_CONSTANTS) private _ssoConfigConstants: OidcConfig,
    private _oidcService: OidcService,
  ) {
    // Set the config according to globals set for this app
    this._oidcService.config = this._ssoConfigConstants;

    // Append the JSON content type header
    this._headers = this._headers.set('Content-Type', 'application/json');
  }

  public get(
    url: string,
    requiresAuthHeaders: boolean,
    queryParams?: object | undefined,
  ): Observable<any> {
    const options: any = {};

    if (requiresAuthHeaders) {
      this._setAuthHeader();
    }

    let params = new HttpParams();
    if (queryParams) {
      Object.keys(queryParams).map((key) => {
        params = params.set(key, queryParams[key]);
      });

      options.params = params;
    }

    options.headers = this._headers;

    return this._http.get(url, options).pipe(
      catchError((err: HttpErrorResponse) => {
        return observableThrowError(err.error);
      }),
    );
  }

    /**
     * Sets the Authentication header we the access token as Bearer header.
     * It also checks if a token is about to expire, if so a session storage item will be set,
     * that will trigger a token refresh on the next route change, so flows will not be interrupted
     * by browser redirects to SSO Authority.
     * @private
     */
    private _setAuthHeader(): Observable<boolean> {
        return this.authGuardService.authenticatedStatus$.pipe(
            skipWhile((status) => status === AuthenticatedStatus.initial),
            take(1),
            switchMap((authStatus) => {
                if (authStatus === AuthenticatedStatus.authenticated) {
                    return this._oidcService.checkSession();
                }
                // Wait for a max of 3 seconds for a redirect. This is because
                // using location.href = is not synchronous; And thus doesn't
                // prevent further code from executing. It should however take
                // very little time. If we wait for 3 whole seconds, we know
                // something must be very wrong if the error Not authenticated
                // still occurs.
                return timer(3000).pipe(
                    switchMap(() => observableThrowError('Not authenticated')),
                );
            }),
            tap(() => {
                const localToken = this._oidcService.getStoredAuthResult();
                // Check if local token is there
                // Set the header
                this._headers = this._headers.set(
                    'Authorization',
                    this._oidcService.getAuthHeader(),
                );

                // Check if the token expires in the next (x) seconds,
                // if so, set trigger a silent refresh of the Access Token in the OIDC Service
                if (
                    localToken.expires -
                    Math.round(new Date().getTime() / 1000.0) <
                    this._envService.env.sso.token_almost_expired_threshold
                ) {
                    this._oidcService.silentRefresh().subscribe();
                }
            }),
        );
    }
}
```

### custom login page

You can configure a custom login page, that's part of the angular stack, therefore there is a login endpoint in the config.
Make sure you point the OIDC config to the proper URL within the angular stack. After that a login page is pretty straight forward.
The form should (for security purposes) be a classic form HTTP POST.

Here is the bare basics:

#### `login.component.html`

```html
<form ngNoForm action="{{ login endpoint }}" method="post">
  <fieldset>
    <legend>Log In</legend>

    <!-- Email or username -->
    <input
      type="email"
      id="j_username"
      [formControl]="j_username"
      name="j_username"
    />

    <!-- Password-->
    <input
      type="password"
      id="j_password"
      [formControl]="j_password"
      name="j_password"
      autocomplete="off"
    />

    <!-- Submit -->
    <button>Log In</button>
  </fieldset>
</form>
```

#### `login.component.ts`

```typescript
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit, OnDestroy {
  /**
   * CSRF token
   * @type {FormControl}
   * @private
   */
  public _csrf: FormControl = new FormControl('', Validators.required);
  /**
   * Username or E-mail address
   * @type {FormControl}
   */
  public j_username: FormControl = new FormControl('', Validators.required);

  /**
   * Password form
   * @type {FormControl}
   */
  public j_password: FormControl = new FormControl('', Validators.required);

  constructor(
    public oidcService: OidcService,
    @Inject(OIDC_CONFIG_CONSTANTS) private _ssoConfigConstants: OidcConfig,
  ) {
    this.oidcService.config = this._ssoConfigConstants;
  }

  ngOnInit() {
 
  }
}
```

## Publishing

Publishing is done via CI with a gitflow action: https://github.com/Q24/oauth-client-angular/actions
