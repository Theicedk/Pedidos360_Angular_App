import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
		return this.http.get<Order[]>(this.apiUrl);
	}

	crearPedido(order: Order): Observable<Order> {
		return this.http.post<Order>(this.apiUrl, order);
	}

	cambiarEstado(id: number, status: string): Observable<Order> {
		return this.http.put<Order>(`${this.apiUrl}/${id}/status`, { status });
	}
}