import type {
    Comment,
    CreateCommentInput,
    CreateRepoRequest,
    CreateRepoResponse,
    CreateSessionRequest,
    CreateSessionResponse,
    GitBranchesResponse,
    GitInfoResponse,
    GitScanParams,
    ListCommentsParams,
    ListCommentsResponse,
    ListReposResponse,
    ListSessionsResponse,
    ListSnapshotsParams,
    ListSnapshotsResponse,
    ListTargetsResponse,
    ReplyToCommentRequest,
    Repo,
    ScannedRepo,
    SendCommentsRequest,
    SendCommentsResponse,
    Session,
    SessionWithRepo,
    Snapshot,
    SnapshotDiffResponse,
    TransportConfigResponse,
    TransportStatusResponse,
    UpdateCommentRequest,
    UpdateRepoRequest,
    UpdateSessionRequest,
    UpdateTransportConfigRequest,
} from '@agent-code-reviewer/shared';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiClient {
    readonly #http = inject(HttpClient);
    readonly #document = inject(DOCUMENT);
    readonly #window = this.#document.defaultView;

    listRepos(): Observable<ListReposResponse> {
        return this.#http.get<ListReposResponse>('/api/repos');
    }

    createRepo(body: CreateRepoRequest): Observable<CreateRepoResponse> {
        return this.#http.post<CreateRepoResponse>('/api/repos', body);
    }

    updateRepo(id: string, body: UpdateRepoRequest): Observable<{ repo: Repo }> {
        return this.#http.patch<{ repo: Repo }>(`/api/repos/${id}`, body);
    }

    deleteRepo(id: string): Observable<void> {
        return this.#http.delete<void>(`/api/repos/${id}`);
    }

    listSessions(repoId: string): Observable<ListSessionsResponse> {
        return this.#http.get<ListSessionsResponse>('/api/sessions', {
            params: new HttpParams().set('repo_id', repoId),
        });
    }

    getSession(id: string): Observable<SessionWithRepo> {
        return this.#http.get<SessionWithRepo>(`/api/sessions/${id}`);
    }

    createSession(body: CreateSessionRequest): Observable<CreateSessionResponse> {
        return this.#http.post<CreateSessionResponse>('/api/sessions', body);
    }

    updateSession(id: string, body: UpdateSessionRequest): Observable<{ session: Session }> {
        return this.#http.patch<{ session: Session }>(`/api/sessions/${id}`, body);
    }

    startWatching(sessionId: string): Observable<{ message: string }> {
        return this.#http.post<{ message: string }>(`/api/sessions/${sessionId}/watch`, null);
    }

    stopWatching(sessionId: string): Observable<{ message: string }> {
        return this.#http.delete<{ message: string }>(`/api/sessions/${sessionId}/watch`);
    }

    listSnapshots(sessionId: string, params?: ListSnapshotsParams): Observable<ListSnapshotsResponse> {
        let httpParams = new HttpParams();
        if (params?.limit) httpParams = httpParams.set('limit', params.limit);
        if (params?.before) httpParams = httpParams.set('before', params.before);
        return this.#http.get<ListSnapshotsResponse>(`/api/sessions/${sessionId}/snapshots`, { params: httpParams });
    }

    getSnapshotDiff(snapshotId: string): Observable<SnapshotDiffResponse> {
        return this.#http.get<SnapshotDiffResponse>(`/api/snapshots/${snapshotId}/diff`);
    }

    captureSnapshot(sessionId: string): Observable<{ snapshot: Snapshot }> {
        return this.#http.post<{ snapshot: Snapshot }>(`/api/sessions/${sessionId}/snapshots`, null);
    }

    listComments(params: ListCommentsParams): Observable<ListCommentsResponse> {
        let httpParams = new HttpParams().set('session_id', params.session_id);
        if (params.snapshot_id) httpParams = httpParams.set('snapshot_id', params.snapshot_id);
        if (params.status) httpParams = httpParams.set('status', params.status);
        return this.#http.get<ListCommentsResponse>('/api/comments', { params: httpParams });
    }

    createComment(body: CreateCommentInput): Observable<Comment> {
        return this.#http.post<Comment>('/api/comments', body);
    }

    updateComment(id: string, body: UpdateCommentRequest): Observable<Comment> {
        return this.#http.patch<Comment>(`/api/comments/${id}`, body);
    }

    deleteComment(id: string): Observable<void> {
        return this.#http.delete<void>(`/api/comments/${id}`);
    }

    sendComments(body: SendCommentsRequest): Observable<SendCommentsResponse> {
        return this.#http.post<SendCommentsResponse>('/api/comments/send', body);
    }

    resolveComment(id: string): Observable<Comment> {
        return this.#http.post<Comment>(`/api/comments/${id}/resolve`, null);
    }

    replyToComment(id: string, body: ReplyToCommentRequest): Observable<Comment> {
        return this.#http.post<Comment>(`/api/comments/${id}/reply`, body);
    }

    bulkResolveComments(body: {
        session_id: string;
        snapshot_id?: string;
        comment_ids?: string[];
    }): Observable<{ resolved_count: number }> {
        return this.#http.post<{ resolved_count: number }>('/api/comments/bulk-resolve', body);
    }

    listTargets(): Observable<ListTargetsResponse> {
        return this.#http.get<ListTargetsResponse>('/api/transport/targets');
    }

    getTransportStatus(): Observable<TransportStatusResponse> {
        return this.#http.get<TransportStatusResponse>('/api/transport/status');
    }

    getTransportConfig(): Observable<TransportConfigResponse> {
        return this.#http.get<TransportConfigResponse>('/api/transport/config');
    }

    updateTransportConfig(body: UpdateTransportConfigRequest): Observable<{ message: string }> {
        return this.#http.put<{ message: string }>('/api/transport/config', body);
    }

    getGitInfo(path: string): Observable<GitInfoResponse> {
        return this.#http.get<GitInfoResponse>('/api/git/info', { params: new HttpParams().set('path', path) });
    }

    getBranches(path: string): Observable<GitBranchesResponse> {
        return this.#http.get<GitBranchesResponse>('/api/git/branches', { params: new HttpParams().set('path', path) });
    }

    scanRepos(params?: GitScanParams): Observable<ScannedRepo> {
        return new Observable<ScannedRepo>((subscriber) => {
            const url = new URL('/api/git/scan', this.#window?.location?.origin ?? 'http://localhost');
            if (params?.roots) url.searchParams.set('roots', params.roots);
            if (params?.max_depth) url.searchParams.set('max_depth', params.max_depth);

            const abortController = new AbortController();

            fetch(url.toString(), { signal: abortController.signal })
                .then(async (response) => {
                    if (!response.ok || !response.body) {
                        subscriber.error(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop()!;
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) continue;
                            try {
                                subscriber.next(JSON.parse(trimmed) as ScannedRepo);
                            } catch {
                                // skip malformed lines
                            }
                        }
                    }
                    if (buffer.trim()) {
                        try {
                            subscriber.next(JSON.parse(buffer.trim()) as ScannedRepo);
                        } catch {
                            // skip malformed
                        }
                    }
                    subscriber.complete();
                })
                .catch((err) => {
                    if (!abortController.signal.aborted) {
                        subscriber.error(err);
                    }
                });

            return () => abortController.abort();
        });
    }
}
