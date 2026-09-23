import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { AccountInfo, AuthenticationResult, InteractionStatus } from '@azure/msal-browser';
import { catchError, filter, finalize, of, switchMap, timeout } from 'rxjs';
import { environment } from '../environments/environtment';
import { CatalogService, Product } from './services/catalog.service';

type TokenClaims = {
  roles?: unknown;
  role?: unknown;
};

type EstadoDespacho = 'Pendiente' | 'En preparación' | 'Despachado' | 'Entregado';

type PedidoOperador = {
  id: number;
  cliente: string;
  total: number;
  estado: EstadoDespacho;
};

type ProductoAdministrador = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet],
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
  cargandoCatalogo = signal(false);
  errorCatalogo = signal('');
  creandoProducto = signal(false);
  errorCrearProducto = signal('');
  nuevoProducto: Product = this.crearProductoVacio();
  productoParaEliminar = signal<ProductoAdministrador | null>(null);
  errorEliminarProducto = signal('');
  eliminandoProducto = signal(false);
  productoParaEditar = signal<ProductoAdministrador | null>(null);
  productoEditado: Product = this.crearProductoVacio();
  guardandoEdicion = signal(false);
  errorEditarProducto = signal('');
  pedidosOperador = signal<PedidoOperador[]>([
    { id: 1001, cliente: 'Ana López', total: 125.5, estado: 'Pendiente' },
    { id: 1002, cliente: 'Carlos Pérez', total: 89.99, estado: 'En preparación' },
    { id: 1003, cliente: 'María García', total: 240, estado: 'Despachado' },
  ]);
  estadosDespacho: EstadoDespacho[] = [
    'Pendiente',
    'En preparación',
    'Despachado',
    'Entregado',
  ];
  productosAdministrador = signal<ProductoAdministrador[]>([]);

  constructor(
    private readonly authService: MsalService,
    private readonly msalBroadcastService: MsalBroadcastService,
    private readonly http: HttpClient,
    private readonly catalogService: CatalogService,
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

  esCliente(): boolean {
    const rol = this.rolUsuario().trim().toLowerCase().replace(/^role_/, '');
    return rol === 'cliente' || rol === 'client' || rol === 'customer';
  }

  esOperador(): boolean {
    const rol = this.rolUsuario().trim().toLowerCase().replace(/^role_/, '');
    return rol === 'operador' || rol === 'operator';
  }

  esAdministrador(): boolean {
    const rol = this.rolUsuario().trim().toLowerCase().replace(/^role_/, '');
    return rol === 'administrador' || rol === 'admin' || rol === 'administrator';
  }

  private cargarCatalogoAdministrador(): void {
    if (!this.esAdministrador() || this.cargandoCatalogo() || this.productosAdministrador().length > 0) {
      return;
    }

    this.errorCatalogo.set('');
    this.cargandoCatalogo.set(true);
    this.catalogService.listarProductos().subscribe({
      next: (productos) => {
        this.productosAdministrador.set(productos.map((producto) => this.mapearProducto(producto)));
        this.cargandoCatalogo.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar el catálogo:', error);
        this.errorCatalogo.set('No se pudo cargar el catálogo desde el backend.');
        this.cargandoCatalogo.set(false);
      },
    });
  }

  private mapearProducto(producto: Product): ProductoAdministrador {
    return {
      id: producto.id ?? 0,
      nombre: producto.name,
      descripcion: producto.description,
      precio: producto.price,
      stock: producto.stock,
    };
  }

  crearProducto(): void {
    this.errorCrearProducto.set('');
    this.creandoProducto.set(true);

    this.catalogService.crearProducto(this.nuevoProducto).subscribe({
      next: (producto) => {
        this.productosAdministrador.update((productos) => [
          ...productos,
          this.mapearProducto(producto),
        ]);
        this.nuevoProducto = this.crearProductoVacio();
        this.creandoProducto.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al crear el producto:', error);
        this.errorCrearProducto.set('No se pudo crear el producto.');
        this.creandoProducto.set(false);
      },
    });
  }

  private crearProductoVacio(): Product {
    return {
      name: '',
      description: '',
      price: 0,
      stock: 0,
    };
  }

  abrirModalEditar(producto: ProductoAdministrador): void {
    this.productoParaEditar.set(producto);
    this.productoEditado = {
      id: producto.id,
      name: producto.nombre,
      description: producto.descripcion,
      price: producto.precio,
      stock: producto.stock,
    };
    this.errorEditarProducto.set('');
  }

  cerrarModalEditar(): void {
    this.productoParaEditar.set(null);
    this.errorEditarProducto.set('');
  }

  guardarEdicion(): void {
    const producto = this.productoParaEditar();
    if (!producto || producto.id === 0) {
      return;
    }

    this.errorEditarProducto.set('');
    this.guardandoEdicion.set(true);
    this.catalogService.actualizarProducto(producto.id, this.productoEditado).subscribe({
      next: (productoActualizado) => {
        this.productosAdministrador.update((productos) =>
          productos.map((item) => item.id === producto.id
            ? this.mapearProducto(productoActualizado)
            : item),
        );
        this.guardandoEdicion.set(false);
        this.cerrarModalEditar();
      },
      error: (error: unknown) => {
        console.error('Error al editar el producto:', error);
        this.errorEditarProducto.set('No se pudo editar el producto.');
        this.guardandoEdicion.set(false);
      },
    });
  }

  abrirModalEliminar(producto: ProductoAdministrador): void {
    this.productoParaEliminar.set(producto);
    this.errorEliminarProducto.set('');
  }

  cerrarModalEliminar(): void {
    this.productoParaEliminar.set(null);
    this.errorEliminarProducto.set('');
  }

  confirmarEliminacion(): void {
    const producto = this.productoParaEliminar();

    if (!producto) {
      return;
    }

    this.errorEliminarProducto.set('');
    this.eliminandoProducto.set(true);
    this.catalogService.borrarProducto(producto.id).subscribe({
      next: () => {
        this.productosAdministrador.update((productos) =>
          productos.filter((item) => item.id !== producto.id),
        );
        this.eliminandoProducto.set(false);
        this.cerrarModalEliminar();
      },
      error: (error: unknown) => {
        console.error('Error al borrar el producto:', error);
        this.errorEliminarProducto.set('No se pudo borrar el producto.');
        this.eliminandoProducto.set(false);
      },
    });
  }

  actualizarEstadoDespacho(id: number, event: Event): void {
    const estado = (event.target as HTMLSelectElement).value as EstadoDespacho;
    this.pedidosOperador.update((pedidos) =>
      pedidos.map((pedido) => pedido.id === id ? { ...pedido, estado } : pedido),
    );
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
      this.cargarCatalogoAdministrador();
      return;
    }

    if (accessToken) {
      const tokenRole = this.extraerRol(this.decodificarToken(accessToken));
      if (tokenRole) {
        this.rolUsuario.set(tokenRole);
        this.cargarCatalogoAdministrador();
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
        this.cargarCatalogoAdministrador();
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
