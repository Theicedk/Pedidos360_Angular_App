import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

export const routes: Routes = [
	{
		path: 'protegido',
		canActivate: [MsalGuard],
		loadComponent: () =>
			import('./protegido/protegido').then((module) => module.Protegido),
	},
];
