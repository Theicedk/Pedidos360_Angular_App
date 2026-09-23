import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environtment';

export interface Product {
	id?: number;
	name: string;
	description: string;
	price: number;
	stock: number;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
	private readonly http = inject(HttpClient);
	private readonly apiUrl = `${environment.apiBaseUrl}/api/catalog/products`;

	listarProductos(): Observable<Product[]> {
		return this.http.get<Product[]>(this.apiUrl);
	}

	crearProducto(product: Product): Observable<Product> {
		return this.http.post<Product>(this.apiUrl, product);
	}

	actualizarProducto(id: number, product: Product): Observable<Product> {
		return this.http.put<Product>(`${this.apiUrl}/${id}`, product);
	}
}