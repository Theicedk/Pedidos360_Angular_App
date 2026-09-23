import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult, InteractionStatus } from '@azure/msal-browser';
import { catchError, filter, finalize, of, switchMap, timeout } from 'rxjs';
import { environment } from '../environments/environtment';

type TokenClaims = {
  roles?: unknown;
  role?: unknown;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  user: AccountInfo | null = null;
  sesionCargada = signal(false);
  rolUsuario = signal('No identificado');
  respuestaApi = signal<unknown | null>(null);
  errorApi = signal('');
  cargandoPedidos = signal(false);

  constructor(
    private readonly authService: MsalService,
    private readonly msalBroadcastService: MsalBroadcastService,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    this.msalBroadcastService.inProgress$
      .pipe(filter((status) => status === InteractionStatus.None))
      .subscribe(() => {
        this.actualizarUsuario();
        this.sesionCargada.set(true);
      });

    this.authService.initialize().pipe(
      switchMap(() => this.authService.handleRedirectObservable({
        navigateToLoginRequestUrl: false,
      })),
      timeout({ first: 10000 }),
      catchError((error: unknown) => {
        console.error('No se pudo inicializar MSAL:', error);
        return of(null);
      }),
      finalize(() => {
        this.actualizarUsuario();
        this.sesionCargada.set(true);
      }),
    ).subscribe({
      next: (result: AuthenticationResult | null) => {
        if (result?.account) {
          this.authService.instance.setActiveAccount(result.account);
        }
        this.actualizarUsuario();
        this.actualizarRol(result?.accessToken);
        this.sesionCargada.set(true);
      },
      error: (error: unknown) => {
        console.error('Error en MSAL:', error);
      },
    });
  }

  private actualizarUsuario(): void {
    const activeAccount = this.authService.instance.getActiveAccount();
    const accounts = this.authService.instance.getAllAccounts();

    if (activeAccount) {
      this.user = activeAccount;
    } else if (accounts.length > 0) {
      this.authService.instance.setActiveAccount(accounts[0]);
      this.user = accounts[0];
    } else {
      this.user = null;
    }

    this.actualizarRol();
  }

  login(): void {
    this.authService.loginRedirect({
      scopes: ['openid', 'profile', 'email', environment.msal.apiScope],
    });
  }

  logout(): void {
    this.authService.logoutRedirect({
      postLogoutRedirectUri: environment.msal.redirectUri,
    });
  }

  private actualizarRol(accessToken?: string): void {
    const account = this.authService.instance.getActiveAccount();
    if (!account) {
      this.rolUsuario.set('No identificado');
      return;
    }

    const accountClaims = account.idTokenClaims as TokenClaims | undefined;
    const accountRole = this.extraerRol(accountClaims);
    if (accountRole) {
      this.rolUsuario.set(accountRole);
      return;
    }

    if (accessToken) {
      const tokenRole = this.extraerRol(this.decodificarToken(accessToken));
      if (tokenRole) {
        this.rolUsuario.set(tokenRole);
        return;
      }
    }

    this.authService.acquireTokenSilent({
      account,
      scopes: [environment.msal.apiScope],
    }).subscribe({
      next: (result) => {
        const tokenRole = this.extraerRol(this.decodificarToken(result.accessToken));
        this.rolUsuario.set(tokenRole ?? 'No identificado');
      },
      error: () => {
        this.rolUsuario.set('No identificado');
      },
    });
  }

  private extraerRol(claims: TokenClaims | undefined): string | null {
    if (!claims) {
      return null;
    }

    const roles = Array.isArray(claims.roles) ? claims.roles : [claims.role];
    const role = roles.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return role?.trim() ?? null;
  }

  private decodificarToken(accessToken: string): TokenClaims | undefined {
    try {
      const payload = accessToken.split('.')[1];
      if (!payload) {
        return undefined;
      }

      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decodedPayload = atob(normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '='));
      return JSON.parse(decodedPayload) as TokenClaims;
    } catch {
      return undefined;
    }
  }

  consultarPedidos(): void {
    this.respuestaApi.set(null);
    this.errorApi.set('');
    this.cargandoPedidos.set(true);

    this.http.get(`${environment.apiBaseUrl}/api/pedidos`).subscribe({
      next: (respuesta) => {
        this.respuestaApi.set(respuesta);
        this.cargandoPedidos.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al consultar pedidos:', error);
        this.errorApi.set('No se pudieron consultar los pedidos.');
        this.cargandoPedidos.set(false);
      },
    });
  }
}
