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
import { Order, OrdersService } from './services/orders.service';

type TokenClaims = {
  roles?: unknown;
  role?: unknown;
  oid?: unknown;
  sub?: unknown;
  clientId?: unknown;
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

type ProductoCarrito = ProductoAdministrador & {
  cantidad: number;
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
  cargandoPedidosOperador = signal(false);
  errorPedidosOperador = signal('');
  cargandoHistorialCliente = signal(false);
  errorHistorialCliente = signal('');
  pedidosCliente = signal<PedidoOperador[]>([]);
  catalogoCliente = signal<ProductoAdministrador[]>([]);
  carritoCliente = signal<ProductoCarrito[]>([]);
  productoParaComprar = signal(false);
  cargandoCatalogoCliente = signal(false);
  errorCatalogoCliente = signal('');
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
  pedidosOperador = signal<PedidoOperador[]>([]);
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
    private readonly ordersService: OrdersService,
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

  abrirModalCrearPedido(): void {
    this.productoParaComprar.set(true);
    this.cargarCatalogoCliente();
  }

  cerrarModalCrearPedido(): void {
    this.productoParaComprar.set(false);
  }

  private cargarCatalogoCliente(): void {
    if (this.cargandoCatalogoCliente() || this.catalogoCliente().length > 0) {
      return;
    }

    this.errorCatalogoCliente.set('');
    this.cargandoCatalogoCliente.set(true);
    this.catalogService.listarProductos().subscribe({
      next: (productos) => {
        this.catalogoCliente.set(productos.map((producto) => this.mapearProducto(producto)));
        this.cargandoCatalogoCliente.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar el catálogo para el cliente:', error);
        this.errorCatalogoCliente.set('No se pudo cargar el catálogo de productos.');
        this.cargandoCatalogoCliente.set(false);
      },
    });
  }

  agregarAlCarrito(producto: ProductoAdministrador): void {
    const productoEnCarrito = this.carritoCliente().find((item) => item.id === producto.id);
    const cantidadActual = productoEnCarrito?.cantidad ?? 0;

    if (cantidadActual >= producto.stock) {
      return;
    }

    this.carritoCliente.update((carrito) => {
      if (productoEnCarrito) {
        return carrito.map((item) => item.id === producto.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item);
      }

      return [...carrito, { ...producto, cantidad: 1 }];
    });
  }

  cantidadEnCarrito(productoId: number): number {
    return this.carritoCliente().find((item) => item.id === productoId)?.cantidad ?? 0;
  }

  cambiarCantidadCarrito(productoId: number, event: Event): void {
    const producto = this.catalogoCliente().find((item) => item.id === productoId);
    const cantidadSolicitada = Number((event.target as HTMLInputElement).value);
    if (!producto) {
      return;
    }

    const cantidad = Math.min(Math.max(Math.trunc(cantidadSolicitada) || 1, 1), producto.stock);
    this.carritoCliente.update((carrito) =>
      carrito.map((item) => item.id === productoId ? { ...item, cantidad } : item),
    );
  }

  quitarDelCarrito(productoId: number): void {
    this.carritoCliente.update((carrito) => carrito.filter((item) => item.id !== productoId));
  }

  totalCarrito(): number {
    return this.carritoCliente().reduce((total, item) => total + item.precio * item.cantidad, 0);
  }

  private cargarPedidosOperador(): void {
    if (!this.esOperador() || this.cargandoPedidosOperador() || this.pedidosOperador().length > 0) {
      return;
    }

    this.errorPedidosOperador.set('');
    this.cargandoPedidosOperador.set(true);
    this.ordersService.listarPedidos().subscribe({
      next: (pedidos) => {
        this.pedidosOperador.set(pedidos.map((pedido) => this.mapearPedido(pedido)));
        this.cargandoPedidosOperador.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar los pedidos del operador:', error);
        this.errorPedidosOperador.set('No se pudieron cargar los pedidos desde el backend.');
        this.cargandoPedidosOperador.set(false);
      },
    });
  }

  private cargarHistorialCliente(): void {
    if (!this.esCliente() || this.cargandoHistorialCliente() || this.pedidosCliente().length > 0) {
      return;
    }

    const clientId = this.obtenerIdCliente();
    if (!clientId) {
      this.errorHistorialCliente.set('No se encontró el identificador del cliente autenticado.');
      return;
    }

    this.errorHistorialCliente.set('');
    this.cargandoHistorialCliente.set(true);
    this.ordersService.listarPedidos().subscribe({
      next: (pedidos) => {
        const pedidosDelCliente = pedidos
          .filter((pedido) => pedido.clientId === clientId)
          .map((pedido) => this.mapearPedido(pedido));
        this.pedidosCliente.set(pedidosDelCliente);
        this.cargandoHistorialCliente.set(false);
      },
      error: (error: unknown) => {
        console.error('Error al cargar el historial del cliente:', error);
        this.errorHistorialCliente.set('No se pudo cargar el historial de pedidos.');
        this.cargandoHistorialCliente.set(false);
      },
    });
  }

  private obtenerIdCliente(): string | null {
    const account = this.authService.instance.getActiveAccount();
    const claims = account?.idTokenClaims as TokenClaims | undefined;
    const claimId = claims?.clientId ?? claims?.oid ?? claims?.sub;

    if (typeof claimId === 'string' && claimId.trim()) {
      return claimId.trim();
    }

    return account?.localAccountId ?? null;
  }

  private mapearPedido(pedido: Order): PedidoOperador {
    return {
      id: pedido.id ?? 0,
      cliente: pedido.clientName ?? pedido.clientId ?? 'Sin cliente',
      total: pedido.totalAmount ?? 0,
      estado: this.normalizarEstado(pedido.status),
    };
  }

  private normalizarEstado(status?: string): EstadoDespacho {
    switch (status?.trim().toLowerCase()) {
      case 'en preparación':
      case 'en preparacion':
        return 'En preparación';
      case 'despachado':
        return 'Despachado';
      case 'entregado':
        return 'Entregado';
      default:
        return 'Pendiente';
    }
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
      this.cargarPedidosOperador();
      this.cargarHistorialCliente();
      return;
    }

    if (accessToken) {
      const tokenRole = this.extraerRol(this.decodificarToken(accessToken));
      if (tokenRole) {
        this.rolUsuario.set(tokenRole);
        this.cargarCatalogoAdministrador();
        this.cargarPedidosOperador();
        this.cargarHistorialCliente();
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
        this.cargarPedidosOperador();
        this.cargarHistorialCliente();
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
