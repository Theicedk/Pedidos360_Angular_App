import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

export const routes: Routes = [
	{
		path: 'protegido',
		canActivate: [MsalGuard],
		loadComponent: () =>
			import('./protegido/protegido').then((module) => module.Protegido),
	},
	{
		path: 'catalog',
		canActivate: [MsalGuard],
		loadComponent: () =>
			import('./catalog/catalog').then((module) => module.Catalog),
	},
	{
		path: 'orders',
		canActivate: [MsalGuard],
		loadComponent: () =>
			import('./orders/orders').then((module) => module.Orders),
	},
	{ path: '', pathMatch: 'full', children: [] },
];
