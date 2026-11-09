import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, forkJoin, of, switchMap, timer } from 'rxjs';
import { environment } from '../../environments/environtment';

export interface RabbitMqOverview {
	status: string;
	version: string;
	node: string;
	queues: number;
	consumers: number;
	messagesReady: number;
	messagesUnacked: number;
	publishRate: number;
	ackRate: number;
	deliverRate: number;
	memoryUsed: number;
	memoryLimit: number;
	diskFree: number;
	diskFreeLimit: number;
	dlqMessages: number;
	alarms: string[];
	timestamp: string;
}

export interface RabbitQueueMetrics {
	name: string;
	ready: number;
	unacked: number;
	consumers: number;
	incomingRate: number;
	deliverRate: number;
}

export interface RabbitDlqMessage {
	queue: string;
	reference: string;
	messageId: string;
	exchange: string;
	routingKey: string;
	reason: string;
	deathCount: number;
	failedAt: string;
	payload: string;
	payloadEncoding: string;
	redelivered: boolean;
	headers: Record<string, unknown>;
	xDeath: Array<Record<string, unknown>>;
}

export interface RabbitMqSnapshot {
	overview: RabbitMqOverview;
	queues: RabbitQueueMetrics[];
	dlq: RabbitDlqMessage[];
}

export interface RabbitDlqRequeueRequest {
	queue: string;
	reference: string;
}

export interface RabbitDlqRequeueResponse {
	requeued: boolean;
	queue: string;
	reference: string;
	targetExchange: string;
	targetRoutingKey: string;
	message: string;
}

@Injectable({ providedIn: 'root' })
export class RabbitMqMonitorService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.apiBaseUrl}/api/admin/metrics/rabbitmq`;

	readonly overview = signal<RabbitMqOverview | null>(null);
	readonly queues = signal<RabbitQueueMetrics[]>([]);
	readonly dlqMessages = signal<RabbitDlqMessage[]>([]);
	readonly loading = signal(false);
	readonly refreshing = signal(false);
	readonly polling = signal(false);
	readonly error = signal('');
	readonly lastUpdated = signal<Date | null>(null);
	readonly intervalMs = signal(5000);

	private subscription?: Subscription;

	start(intervalMs = this.intervalMs()): void {
		this.stop();
		this.intervalMs.set(intervalMs);
		this.polling.set(true);
		this.loading.set(this.overview() === null);

		this.subscription = timer(0, intervalMs)
			.pipe(switchMap(() => this.fetchSnapshot()))
			.subscribe((snapshot) => {
				if (snapshot) {
					this.apply(snapshot);
				}
			});
	}

	stop(): void {
		this.subscription?.unsubscribe();
		this.subscription = undefined;
		this.polling.set(false);
	}

	refresh(): void {
		this.refreshing.set(true);
		this.fetchSnapshot().subscribe((snapshot) => {
			if (snapshot) {
				this.apply(snapshot);
			}
		});
	}

	requeue(request: RabbitDlqRequeueRequest): Observable<RabbitDlqRequeueResponse> {
		return this.http.post<RabbitDlqRequeueResponse>(`${this.baseUrl}/dlq/requeue`, request);
	}

	private fetchSnapshot(): Observable<RabbitMqSnapshot | null> {
		return forkJoin({
			overview: this.http.get<RabbitMqOverview>(`${this.baseUrl}/overview`),
			queues: this.http.get<RabbitQueueMetrics[]>(`${this.baseUrl}/queues`),
			dlq: this.http.get<RabbitDlqMessage[]>(`${this.baseUrl}/dlq/messages`),
		}).pipe(
			catchError((error: unknown) => {
				this.error.set(this.mensajeError(error));
				this.loading.set(false);
				this.refreshing.set(false);
				return of(null);
			}),
		);
	}

	private apply(snapshot: RabbitMqSnapshot): void {
		this.overview.set(snapshot.overview);
		this.queues.set(snapshot.queues);
		this.dlqMessages.set(snapshot.dlq);
		this.error.set('');
		this.lastUpdated.set(new Date());
		this.loading.set(false);
		this.refreshing.set(false);
	}

	private mensajeError(error: unknown): string {
		if (typeof error === 'object' && error !== null) {
			const respuesta = error as { status?: unknown; error?: unknown; message?: unknown };
			const estado = typeof respuesta.status === 'number' ? respuesta.status : null;
			const cuerpo = respuesta.error;

			if (typeof cuerpo === 'object' && cuerpo !== null) {
				const detalle = cuerpo as Record<string, unknown>;
				const mensaje = detalle['error'] ?? detalle['message'];

				if (typeof mensaje === 'string' && mensaje.trim()) {
					return `HTTP ${estado ?? '?'} · ${mensaje}`;
				}
			}

			if (typeof cuerpo === 'string' && cuerpo.trim()) {
				return `HTTP ${estado ?? '?'} · ${cuerpo}`;
			}

			if (estado === 401 || estado === 403) {
				return 'No autorizado. Inicia sesión con un usuario administrador.';
			}

			if (estado !== null) {
				return `HTTP ${estado} · no se pudieron obtener las métricas.`;
			}
		}

		return 'No se pudieron obtener las métricas de RabbitMQ.';
	}
}
