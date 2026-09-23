import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Order, OrdersService } from '../services/orders.service';

@Component({
	selector: 'app-orders',
	standalone: true,
	imports: [CommonModule],
	template: `
		<h2>Pedidos</h2>
		@if (cargando()) {
			<p>Cargando pedidos...</p>
		} @else if (error()) {
			<p role="alert">{{ error() }}</p>
		} @else {
			<ul>
				@for (order of pedidos(); track order.id ?? $index) {
					<li>
						<strong>Pedido {{ order.id ?? 'sin identificador' }}</strong>
						<span>Estado: {{ order.status ?? 'sin estado' }}</span>
						<span>Total: {{ order.totalAmount ?? 0 | currency }}</span>
					</li>
				} @empty {
					<li>No hay pedidos disponibles.</li>
				}
			</ul>
		}
	`,
})
export class Orders implements OnInit {
	private readonly ordersService = inject(OrdersService);
	pedidos = signal<Order[]>([]);
	cargando = signal(true);
	error = signal('');

	ngOnInit(): void {
		this.ordersService.listarPedidos().subscribe({
			next: (orders) => {
				this.pedidos.set(orders);
				this.cargando.set(false);
			},
			error: (error: unknown) => {
				console.error('Error al cargar los pedidos:', error);
				this.error.set('No se pudieron cargar los pedidos.');
				this.cargando.set(false);
			},
		});
	}
}