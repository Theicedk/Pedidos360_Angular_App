import { Component } from '@angular/core';

@Component({
  selector: 'app-protegido',
  standalone: true,
  template: `
    <div>
      <h2>Área Protegida por MsalGuard</h2>
      <p>Si puedes ver este mensaje, MsalGuard validó que tu sesión está activa en Microsoft Entra ID.</p>
    </div>
  `,
})
export class Protegido {}
