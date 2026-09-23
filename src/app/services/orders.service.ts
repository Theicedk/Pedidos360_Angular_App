import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environtment';

export interface OrderItem {
	productId: number;
	quantity: number;
	unitPrice: number;
}

export interface Order {
	id?: number;
	clientId?: string;
	clientName?: string;
	status?: string;
	totalAmount?: number;
	items: OrderItem[];
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
	private readonly http = inject(HttpClient);
	private readonly apiUrl = `${environment.apiBaseUrl}/api/orders`;

	listarPedidos(): Observable<Order[]> {
		return this.http.get<unknown>(this.apiUrl).pipe(
			map((response) => this.extraerPedidos(response)),
		);
	}

	listarPedidosPorCliente(clientId: string): Observable<Order[]> {
		const params = new HttpParams().set('clientId', clientId);
		return this.http.get<unknown>(this.apiUrl, { params }).pipe(
			map((response) => this.extraerPedidos(response)),
		);
	}

	crearPedido(order: Order): Observable<Order> {
		return this.http.post<Order>(this.apiUrl, order);
	}

	cambiarEstado(id: number, status: string): Observable<Order> {
		return this.http.put<Order>(`${this.apiUrl}/${id}/status`, { status });
	}

	private extraerPedidos(response: unknown): Order[] {
		if (Array.isArray(response)) {
			return response as Order[];
		}

		if (typeof response === 'object' && response !== null) {
			const body = response as Record<string, unknown>;
			const collection = body['pedidos'] ?? body['orders'] ?? body['data'] ?? body['content'] ?? body['items'];

			if (Array.isArray(collection)) {
				return collection as Order[];
			}
		}

		console.warn('La API de pedidos no devolvió una colección:', response);
		return [];
	}
}