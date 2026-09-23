import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CatalogService, Product } from '../services/catalog.service';

@Component({
	selector: 'app-catalog',
	standalone: true,
	imports: [CommonModule],
	template: `
		<h2>Catálogo de productos</h2>
		@if (cargando()) {
			<p>Cargando productos...</p>
		} @else if (error()) {
			<p role="alert">{{ error() }}</p>
		} @else {
			<ul>
				@for (product of productos(); track product.id ?? product.name) {
					<li>
						<strong>{{ product.name }}</strong> - {{ product.price | currency }}
						(Stock: {{ product.stock }})
					</li>
				} @empty {
					<li>No hay productos disponibles.</li>
				}
			</ul>
		}
	`,
})
export class Catalog implements OnInit {
	private readonly catalogService = inject(CatalogService);
	productos = signal<Product[]>([]);
	cargando = signal(true);
	error = signal('');

	ngOnInit(): void {
		this.catalogService.listarProductos().subscribe({
			next: (products) => {
				this.productos.set(products);
				this.cargando.set(false);
			},
			error: (error: unknown) => {
				console.error('Error al cargar el catálogo:', error);
				this.error.set('No se pudo cargar el catálogo.');
				this.cargando.set(false);
			},
		});
	}
}