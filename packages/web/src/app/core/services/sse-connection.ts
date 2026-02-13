import { Injectable } from '@angular/core';
import { Observable, share } from 'rxjs';
import type { SseEvent } from '@agent-code-reviewer/shared';

const SSE_EVENT_TYPES = ['connected', 'snapshot', 'comment-update', 'watcher-status', 'heartbeat'] as const;

@Injectable({ providedIn: 'root' })
export class SseConnection {
    #eventSource: EventSource | null = null;
    #reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    #shouldReconnect = false;
    #currentObservable: Observable<SseEvent> | null = null;

    connect(sessionId: string): Observable<SseEvent> {
        if (this.#eventSource) {
            this.disconnect();
        }

        this.#shouldReconnect = true;

        this.#currentObservable = new Observable<SseEvent>((subscriber) => {
            let delay = 1000;

            const open = () => {
                const url = `/api/sse/sessions/${sessionId}`;
                const es = new EventSource(url);
                this.#eventSource = es;

                for (const type of SSE_EVENT_TYPES) {
                    es.addEventListener(type, (event: MessageEvent) => {
                        try {
                            const data = JSON.parse(event.data);
                            subscriber.next({ type, data } as SseEvent);
                            if (type === 'connected') {
                                delay = 1000;
                            }
                        } catch {
                            console.warn(`[SseConnection] Malformed JSON for event "${type}":`, event.data);
                        }
                    });
                }

                es.onerror = () => {
                    es.close();
                    this.#eventSource = null;

                    if (this.#shouldReconnect) {
                        this.#reconnectTimeout = setTimeout(() => {
                            this.#reconnectTimeout = null;
                            if (this.#shouldReconnect) {
                                open();
                            }
                        }, delay);
                        delay = Math.min(delay * 2, 30000);
                    }
                };
            };

            open();

            return () => {
                this.disconnect();
            };
        }).pipe(share());

        return this.#currentObservable;
    }

    disconnect(): void {
        this.#shouldReconnect = false;

        if (this.#reconnectTimeout !== null) {
            clearTimeout(this.#reconnectTimeout);
            this.#reconnectTimeout = null;
        }

        if (this.#eventSource) {
            this.#eventSource.close();
            this.#eventSource = null;
        }

        this.#currentObservable = null;
    }
}
