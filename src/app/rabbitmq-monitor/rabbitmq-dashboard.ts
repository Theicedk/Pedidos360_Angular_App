import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
	RabbitDlqMessage,
	RabbitMqMonitorService,
} from '../services/rabbit-mq-monitor.service';

@Component({
	selector: 'app-rabbitmq-dashboard',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './rabbitmq-dashboard.html',
	styleUrl: './rabbitmq-dashboard.css',
})
export class RabbitMqDashboardComponent implements OnInit, OnDestroy {
	readonly monitor = inject(RabbitMqMonitorService);

	readonly colasDlq = [
		'q.cmd.email.dlq',
		'q.cmd.kitchen.dlq',
		'q.cmd.invoice.dlq',
	];

	readonly intervalos = [5000, 10000, 30000];

	readonly filtroDlq = signal('');
	readonly mensajeSeleccionado = signal<RabbitDlqMessage | null>(null);
	readonly reencolando = signal(false);
	readonly accionOk = signal('');
	readonly accionError = signal('');

	readonly estadoBroker = computed(() =>
		this.monitor.overview()?.status === 'UP' ? 'UP' : 'DOWN',
	);

	readonly alarmas = computed(() => this.monitor.overview()?.alarms ?? []);

	readonly totalReady = computed(() =>
		this.monitor.queues().reduce((total, cola) => total + cola.ready, 0),
	);

	readonly totalUnacked = computed(() =>
		this.monitor.queues().reduce((total, cola) => total + cola.unacked, 0),
	);

	readonly totalConsumers = computed(() =>
		this.monitor.queues().reduce((total, cola) => total + cola.consumers, 0),
	);

	readonly colasSinConsumidor = computed(() =>
		this.monitor.queues().filter((cola) => cola.consumers === 0 && cola.ready > 0).length,
	);

	readonly dlqTotal = computed(() => {
		const overview = this.monitor.overview();
		return overview ? overview.dlqMessages : this.monitor.dlqMessages().length;
	});

	readonly mensajesDlq = computed(() => {
		const filtro = this.filtroDlq();
		return filtro
			? this.monitor.dlqMessages().filter((mensaje) => mensaje.queue === filtro)
			: this.monitor.dlqMessages();
	});

	ngOnInit(): void {
		this.monitor.start(5000);
	}

	ngOnDestroy(): void {
		this.monitor.stop();
	}

	actualizar(): void {
		this.monitor.refresh();
	}

	alternarPolling(event: Event): void {
		const activo = (event.target as HTMLInputElement).checked;

		if (activo) {
			this.monitor.start(this.monitor.intervalMs());
		} else {
			this.monitor.stop();
		}
	}

	cambiarIntervalo(event: Event): void {
		const valor = Number((event.target as HTMLSelectElement).value);
		this.monitor.start(Number.isFinite(valor) && valor > 0 ? valor : 5000);
	}

	seleccionarIntervalo(valor: number): void {
		this.monitor.start(Number(valor) > 0 ? Number(valor) : 5000);
	}

	cambiarFiltro(event: Event): void {
		this.filtroDlq.set((event.target as HTMLSelectElement).value);
	}

	seleccionarFiltro(valor: string): void {
		this.filtroDlq.set(valor);
	}

	abrirInspeccion(mensaje: RabbitDlqMessage): void {
		this.mensajeSeleccionado.set(mensaje);
		this.accionOk.set('');
		this.accionError.set('');
	}

	cerrarInspeccion(): void {
		this.mensajeSeleccionado.set(null);
	}

	reintentar(mensaje: RabbitDlqMessage): void {
		if (this.reencolando()) {
			return;
		}

		this.reencolando.set(true);
		this.accionOk.set('');
		this.accionError.set('');

		this.monitor.requeue({ queue: mensaje.queue, reference: mensaje.reference }).subscribe({
			next: (respuesta) => {
				this.reencolando.set(false);
				this.accionOk.set(
					`Mensaje reencolado hacia ${respuesta.targetExchange} (${respuesta.targetRoutingKey}).`,
				);
				this.mensajeSeleccionado.set(null);
				this.monitor.refresh();
			},
			error: (error: unknown) => {
				this.reencolando.set(false);
				this.accionError.set(this.errorTexto(error));
			},
		});
	}

	claseEspera(ready: number): string {
		if (ready > 100) {
			return 'rabbit-pill rabbit-pill--danger';
		}
		if (ready > 10) {
			return 'rabbit-pill rabbit-pill--warn';
		}
		return 'rabbit-pill rabbit-pill--ok';
	}

	etiquetaCola(cola: { consumers: number; ready: number }): string {
		if (cola.consumers === 0 && cola.ready > 0) {
			return 'Sin consumidor';
		}
		if (cola.ready > 100) {
			return 'Saturada';
		}
		if (cola.ready > 10) {
			return 'Acumulando';
		}
		return 'Normal';
	}

	claseCola(cola: { consumers: number; ready: number }): string {
		if ((cola.consumers === 0 && cola.ready > 0) || cola.ready > 100) {
			return 'rabbit-pill rabbit-pill--danger';
		}
		if (cola.ready > 10) {
			return 'rabbit-pill rabbit-pill--warn';
		}
		return 'rabbit-pill rabbit-pill--ok';
	}

	porcentajeMemoria(): number {
		const overview = this.monitor.overview();
		if (!overview || overview.memoryLimit <= 0) {
			return 0;
		}
		return Math.round((overview.memoryUsed / overview.memoryLimit) * 100);
	}

	formatearBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) {
			return '0 B';
		}

		const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
		const indice = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
		const valor = bytes / Math.pow(1024, indice);
		return `${valor.toFixed(indice === 0 ? 0 : 1)} ${unidades[indice]}`;
	}

	formatearFecha(valor: string): string {
		if (!valor) {
			return '—';
		}

		const numero = Number(valor);
		const fecha = Number.isFinite(numero) && valor.trim() !== ''
			? new Date(numero * 1000)
			: new Date(valor);

		return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleString();
	}

	formatearPayload(mensaje: RabbitDlqMessage): string {
		try {
			return JSON.stringify(JSON.parse(mensaje.payload), null, 2);
		} catch {
			return mensaje.payload || '—';
		}
	}

	formatearJson(valor: unknown): string {
		try {
			return JSON.stringify(valor, null, 2);
		} catch {
			return String(valor);
		}
	}

	private errorTexto(error: unknown): string {
		if (typeof error === 'object' && error !== null) {
			const respuesta = error as { status?: unknown; error?: unknown };
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

			if (estado !== null) {
				return `HTTP ${estado} · no se pudo reencolar el mensaje.`;
			}
		}

		return 'No se pudo reencolar el mensaje.';
	}
}
