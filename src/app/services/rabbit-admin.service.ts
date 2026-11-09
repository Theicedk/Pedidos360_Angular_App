import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environtment';

export type ExchangeType = 'direct' | 'topic' | 'fanout' | 'headers';

export interface QueueRequest {
	name: string;
	durable: boolean;
}

export interface QueueInfo {
	name: string;
	messages: number;
	consumers: number;
}

export interface ExchangeRequest {
	name: string;
	type: ExchangeType;
	durable: boolean;
}

export interface BindingRequest {
	queue: string;
	exchange: string;
	routingKey: string;
}

@Injectable({ providedIn: 'root' })
export class RabbitAdminService {
	private readonly http = inject(HttpClient);
	private readonly apiUrl = `${environment.apiBaseUrl}/api/admin/rabbit`;

	crearCola(request: QueueRequest): Observable<QueueInfo> {
		return this.http.post<QueueInfo>(`${this.apiUrl}/queues`, request);
	}

	obtenerCola(name: string): Observable<QueueInfo> {
		return this.http.get<QueueInfo>(`${this.apiUrl}/queues/${encodeURIComponent(name)}`);
	}

	eliminarCola(name: string): Observable<void> {
		return this.http.delete<void>(`${this.apiUrl}/queues/${encodeURIComponent(name)}`);
	}

	crearExchange(request: ExchangeRequest): Observable<void> {
		return this.http.post<void>(`${this.apiUrl}/exchanges`, request);
	}

	eliminarExchange(name: string): Observable<void> {
		return this.http.delete<void>(`${this.apiUrl}/exchanges/${encodeURIComponent(name)}`);
	}

	crearBinding(request: BindingRequest): Observable<void> {
		return this.http.post<void>(`${this.apiUrl}/bindings`, request);
	}

	eliminarBinding(request: BindingRequest): Observable<void> {
		const params = new HttpParams()
			.set('queue', request.queue)
			.set('exchange', request.exchange)
			.set('routingKey', request.routingKey ?? '');

		return this.http.delete<void>(`${this.apiUrl}/bindings`, { params });
	}
}
