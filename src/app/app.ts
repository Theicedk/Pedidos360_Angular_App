import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MsalService } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import { catchError, finalize, of, switchMap, timeout } from 'rxjs';
import { environment } from '../environments/environtment';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  user: AccountInfo | null = null;
  sesionCargada = signal(false);
  accessTokenPreview = '';
  respuestaApi = signal<unknown | null>(null);
  errorApi = signal('');
  cargandoPedidos = signal(false);

  constructor(
    private readonly authService: MsalService,
    private readonly http: HttpClient,
  ) {}

  ngOnInit(): void {
    setTimeout(() => {
      if (!this.sesionCargada()) {
        this.actualizarUsuario();
        this.sesionCargada.set(true);
      }
    }, 10000);

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

  obtenerAccessToken(): void {
    const account = this.authService.instance.getActiveAccount();
    if (!account) {
      return;
    }

    this.authService.acquireTokenSilent({
      account,
      scopes: [environment.msal.apiScope],
    }).subscribe({
      next: (result) => {
        this.accessTokenPreview = result.accessToken;
      },
      error: () => {
        this.authService.acquireTokenRedirect({
          scopes: [environment.msal.apiScope],
        });
      },
    });
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
