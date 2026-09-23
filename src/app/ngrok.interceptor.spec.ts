import {
	HttpHandler,
	HttpHeaders,
	HttpRequest,
	HttpResponse,
} from '@angular/common/http';
import { of } from 'rxjs';
import { NgrokInterceptor } from './ngrok.interceptor';

describe('NgrokInterceptor', () => {
	it('adds the ngrok bypass header without removing existing headers', () => {
		const interceptor = new NgrokInterceptor();
		const request = new HttpRequest('GET', 'https://example.ngrok-free.app/api/orders', {
			headers: new HttpHeaders({ Authorization: 'Bearer token' }),
		});
		const next: HttpHandler = {
			handle: (forwardedRequest: HttpRequest<unknown>) => {
				expect(forwardedRequest.headers.get('ngrok-skip-browser-warning')).toBe('true');
				expect(forwardedRequest.headers.get('Authorization')).toBe('Bearer token');
				return of(new HttpResponse({ status: 200 }));
			},
		};

		interceptor.intercept(request, next);
	});
});