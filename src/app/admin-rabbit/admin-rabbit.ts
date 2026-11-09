import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import {
	BindingRequest,
	ExchangeRequest,
	ExchangeType,
	QueueInfo,
	RabbitAdminService,
} from '../services/rabbit-admin.service';

type ResultadoOperacion = {
	tipo: 'ok' | 'error';
	mensaje: string;
};

type RegistroOperacion = {
	hora: string;
	operacion: string;
	estado: 'OK' | 'ERROR';
	detalle: string;
};

type BindingPreset = BindingRequest & {
	etiqueta: string;
};

@Component({
	selector: 'app-admin-rabbit',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './admin-rabbit.html',
	styleUrl: './admin-rabbit.css',
})
export class AdminRabbit {
	private readonly rabbitAdminService = inject(RabbitAdminService);

	readonly colasConocidas = [
		'q.cmd.email',
		'q.cmd.kitchen',
		'q.cmd.invoice',
		'q.cmd.email.dlq',
		'q.cmd.kitchen.dlq',
		'q.cmd.invoice.dlq',
	];

	readonly exchangesConocidos = ['cmd.direct', 'cmd.topic', 'cmd.dead.dlx'];

	readonly tiposExchange: ExchangeType[] = ['direct', 'topic', 'fanout', 'headers'];

	readonly bindingsConocidos: BindingPreset[] = [
		{ etiqueta: 'q.cmd.email → cmd.direct', queue: 'q.cmd.email', exchange: 'cmd.direct', routingKey: 'email.send' },
		{ etiqueta: 'q.cmd.kitchen → cmd.direct', queue: 'q.cmd.kitchen', exchange: 'cmd.direct', routingKey: 'kitchen.ticket' },
		{ etiqueta: 'q.cmd.invoice → cmd.direct', queue: 'q.cmd.invoice', exchange: 'cmd.direct', routingKey: 'invoice.gen' },
		{ etiqueta: 'q.cmd.email → cmd.topic', queue: 'q.cmd.email', exchange: 'cmd.topic', routingKey: 'email.#' },
		{ etiqueta: 'q.cmd.email.dlq → cmd.dead.dlx', queue: 'q.cmd.email.dlq', exchange: 'cmd.dead.dlx', routingKey: 'email.send' },
	];

	ocupado = signal(false);
	resultado = signal<ResultadoOperacion | null>(null);
	historial = signal<RegistroOperacion[]>([]);

	colaNombre = 'q.demo';
	colaDurable = true;
	colaInfo = signal<QueueInfo | null>(null);

	exchangeNombre = 'ex.demo';
	exchangeTipo: ExchangeType = 'direct';
	exchangeDurable = true;

	bindingQueue = 'q.demo';
	bindingExchange = 'ex.demo';
	bindingRoutingKey = 'demo.key';
	bindingPreset = '';

	crearCola(): void {
		this.ejecutar(
			'Crear cola',
			this.rabbitAdminService.crearCola({
				name: this.colaNombre.trim(),
				durable: this.colaDurable,
			}),
			(info) => {
				this.colaInfo.set(info);
				return `cola ${info.name} creada (mensajes=${info.messages}, consumidores=${info.consumers})`;
			},
		);
	}

	consultarCola(): void {
		const nombre = this.colaNombre.trim();
		if (!nombre) {
			this.resultado.set({ tipo: 'error', mensaje: 'Consulta de cola: ingresa un nombre.' });
			return;
		}

		this.ejecutar(
			'Consultar cola',
			this.rabbitAdminService.obtenerCola(nombre),
			(info) => {
				this.colaInfo.set(info);
				return `${info.name}: mensajes=${info.messages}, consumidores=${info.consumers}`;
			},
		);
	}

	eliminarCola(): void {
		const nombre = this.colaNombre.trim();
		if (!nombre) {
			this.resultado.set({ tipo: 'error', mensaje: 'Eliminar cola: ingresa un nombre.' });
			return;
		}

		this.ejecutar(
			'Eliminar cola',
			this.rabbitAdminService.eliminarCola(nombre),
			() => {
				this.colaInfo.set(null);
				return `cola ${nombre} eliminada (HTTP 204)`;
			},
		);
	}

	verificarCola(nombre: string): void {
		this.colaNombre = nombre;
		this.consultarCola();
	}

	usarExchange(nombre: string): void {
		this.exchangeNombre = nombre;
	}

	crearExchange(): void {
		const request: ExchangeRequest = {
			name: this.exchangeNombre.trim(),
			type: this.exchangeTipo,
			durable: this.exchangeDurable,
		};

		this.ejecutar(
			'Crear exchange',
			this.rabbitAdminService.crearExchange(request),
			() => `exchange ${request.name} (${request.type}) creado (HTTP 201)`,
		);
	}

	eliminarExchange(): void {
		const nombre = this.exchangeNombre.trim();
		if (!nombre) {
			this.resultado.set({ tipo: 'error', mensaje: 'Eliminar exchange: ingresa un nombre.' });
			return;
		}

		this.ejecutar(
			'Eliminar exchange',
			this.rabbitAdminService.eliminarExchange(nombre),
			() => `exchange ${nombre} eliminado (HTTP 204)`,
		);
	}

	seleccionarPreset(etiqueta: string): void {
		this.bindingPreset = etiqueta;

		const preset = this.bindingsConocidos.find((item) => item.etiqueta === etiqueta);
		if (!preset) {
			return;
		}

		this.bindingQueue = preset.queue;
		this.bindingExchange = preset.exchange;
		this.bindingRoutingKey = preset.routingKey;
	}

	crearBinding(): void {
		const request = this.bindingActual();
		if (!request) {
			return;
		}

		this.ejecutar(
			'Crear binding',
			this.rabbitAdminService.crearBinding(request),
			() => `${request.queue} → ${request.exchange} (${request.routingKey || 'sin routing key'}) creado (HTTP 201)`,
		);
	}

	eliminarBinding(): void {
		const request = this.bindingActual();
		if (!request) {
			return;
		}

		this.ejecutar(
			'Eliminar binding',
			this.rabbitAdminService.eliminarBinding(request),
			() => `${request.queue} → ${request.exchange} (${request.routingKey || 'sin routing key'}) eliminado (HTTP 204)`,
		);
	}

	limpiarHistorial(): void {
		this.historial.set([]);
		this.resultado.set(null);
	}

	private bindingActual(): BindingRequest | null {
		const queue = this.bindingQueue.trim();
		const exchange = this.bindingExchange.trim();

		if (!queue || !exchange) {
			this.resultado.set({
				tipo: 'error',
				mensaje: 'Binding: queue y exchange son obligatorios.',
			});
			return null;
		}

		return {
			queue,
			exchange,
			routingKey: this.bindingRoutingKey.trim(),
		};
	}

	private ejecutar<T>(
		operacion: string,
		peticion$: Observable<T>,
		alCompletar: (valor: T) => string,
	): void {
		if (this.ocupado()) {
			return;
		}

		this.ocupado.set(true);
		this.resultado.set(null);

		peticion$.subscribe({
			next: (valor) => {
				const detalle = alCompletar(valor);
				this.resultado.set({ tipo: 'ok', mensaje: `${operacion}: ${detalle}` });
				this.registrar(operacion, 'OK', detalle);
				this.ocupado.set(false);
			},
			error: (error: unknown) => {
				const detalle = this.mensajeError(error);
				this.resultado.set({ tipo: 'error', mensaje: `${operacion}: ${detalle}` });
				this.registrar(operacion, 'ERROR', detalle);
				this.ocupado.set(false);
			},
		});
	}

	private registrar(operacion: string, estado: 'OK' | 'ERROR', detalle: string): void {
		const entrada: RegistroOperacion = {
			hora: new Date().toLocaleTimeString(),
			operacion,
			estado,
			detalle,
		};

		this.historial.update((actual) => [entrada, ...actual].slice(0, 20));
	}

	private mensajeError(error: unknown): string {
		if (typeof error === 'object' && error !== null) {
			const respuesta = error as { status?: unknown; error?: unknown; message?: unknown };
			const estado = typeof respuesta.status === 'number' ? respuesta.status : null;
			const cuerpo = respuesta.error;

			if (typeof cuerpo === 'string' && cuerpo.trim()) {
				return `HTTP ${estado ?? '?'} · ${cuerpo}`;
			}

			if (typeof cuerpo === 'object' && cuerpo !== null) {
				const detalle = cuerpo as Record<string, unknown>;
				const mensaje = detalle['error'] ?? detalle['message'] ?? detalle['detail'];

				if (typeof mensaje === 'string' && mensaje.trim()) {
					return `HTTP ${estado ?? '?'} · ${mensaje}`;
				}
			}

			if (estado !== null) {
				return `HTTP ${estado} · no se pudo completar la operación`;
			}

			if (typeof respuesta.message === 'string' && respuesta.message.trim()) {
				return respuesta.message;
			}
		}

		return 'No se pudo completar la operación.';
	}
}
