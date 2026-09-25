import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { of } from 'rxjs';
import { App } from './app';
import { CatalogService } from './services/catalog.service';
import { OrdersService } from './services/orders.service';

const msalServiceMock = {
  initialize: () => of(undefined),
  handleRedirectObservable: () => of(null),
  instance: {
    getActiveAccount: () => null,
    getAllAccounts: () => [],
    setActiveAccount: () => undefined,
  },
};

const msalBroadcastServiceMock = {
  inProgress$: of('none'),
};

const catalogServiceMock = {
  listarProductos: () => of([]),
};

const ordersServiceMock = {
  listarPedidos: () => of([]),
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: MsalService, useValue: msalServiceMock },
        { provide: MsalBroadcastService, useValue: msalBroadcastServiceMock },
        { provide: CatalogService, useValue: catalogServiceMock },
        { provide: OrdersService, useValue: ordersServiceMock },
      ],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Pedidos360');
  });
});
