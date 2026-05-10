import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthSessionService } from '../auth/auth-session.service';

export interface PrometheusSocketEvent {
  type: string;
  data: unknown;
}

@Injectable({ providedIn: 'root' })
export class PrometheusSocketService implements OnDestroy {
  private socket: Socket | null = null;
  private socketEndpoint = '';
  private socketToken = '';
  private readonly notifySubject = new Subject<PrometheusSocketEvent>();

  readonly notify$: Observable<PrometheusSocketEvent> = this.notifySubject.asObservable();

  constructor(private readonly session: AuthSessionService) {}

  connect(): void {
    const token = this.session.token;
    const endpoint = this.resolveSocketEndpoint();

    if (!token) {
      this.disconnect();
      return;
    }

    if (this.socket && this.socketToken === token && this.socketEndpoint === endpoint && !this.socket.disconnected) {
      return;
    }

    this.disconnect();
    this.socketToken = token;
    this.socketEndpoint = endpoint;

    this.socket = io(endpoint, {
      auth: {
        token: `Bearer ${token}`,
      },
    });

    this.socket.on('notify', (event: PrometheusSocketEvent) => {
      this.notifySubject.next(event);
    });
  }

  disconnect(): void {
    this.socket?.off('notify');
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.socketToken = '';
    this.socketEndpoint = '';
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.notifySubject.complete();
  }

  private resolveSocketEndpoint(): string {
    const apiBaseUrl = environment.apiBaseUrl.trim();

    try {
      const baseUrl = /^https?:\/\//i.test(apiBaseUrl)
        ? new URL(apiBaseUrl)
        : new URL(apiBaseUrl || '/', this.browserOrigin());

      return baseUrl.origin;
    } catch {
      return apiBaseUrl.replace(/\/+$/, '');
    }
  }

  private browserOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    return 'http://localhost';
  }
}
