import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiClient } from './api-client';

describe('ApiClient', () => {
    let api: ApiClient;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        api = TestBed.inject(ApiClient);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('listRepos makes GET /api/repos', () => {
        const mockResponse = { repos: [] };
        api.listRepos().subscribe((res) => {
            expect(res).toEqual(mockResponse);
        });
        const req = httpMock.expectOne('/api/repos');
        expect(req.request.method).toBe('GET');
        req.flush(mockResponse);
    });

    it('createRepo makes POST /api/repos', () => {
        const body = { path: '/test' };
        api.createRepo(body).subscribe();
        const req = httpMock.expectOne('/api/repos');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush({ repo: {}, repo_path: {}, is_new: true });
    });

    it('updateRepo makes PATCH /api/repos/:id', () => {
        const body = { base_branch: 'develop' };
        api.updateRepo('r1', body).subscribe();
        const req = httpMock.expectOne('/api/repos/r1');
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual(body);
        req.flush({ repo: {} });
    });

    it('deleteRepo makes DELETE /api/repos/:id', () => {
        api.deleteRepo('r1').subscribe();
        const req = httpMock.expectOne('/api/repos/r1');
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
    });

    it('getSession makes GET /api/sessions/:id', () => {
        api.getSession('s1').subscribe();
        const req = httpMock.expectOne('/api/sessions/s1');
        expect(req.request.method).toBe('GET');
        req.flush({ session: {} });
    });

    it('createSession makes POST /api/sessions', () => {
        const body = { repo_id: 'r1', path: '/test' };
        api.createSession(body).subscribe();
        const req = httpMock.expectOne('/api/sessions');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush({ session: {}, snapshot: {} });
    });

    it('updateSession makes PATCH /api/sessions/:id', () => {
        api.updateSession('s1', { base_branch: 'main' }).subscribe();
        const req = httpMock.expectOne('/api/sessions/s1');
        expect(req.request.method).toBe('PATCH');
        req.flush({ session: {} });
    });

    it('startWatching makes POST /api/sessions/:id/watch', () => {
        api.startWatching('s1').subscribe();
        const req = httpMock.expectOne('/api/sessions/s1/watch');
        expect(req.request.method).toBe('POST');
        req.flush({ message: 'ok' });
    });

    it('stopWatching makes DELETE /api/sessions/:id/watch', () => {
        api.stopWatching('s1').subscribe();
        const req = httpMock.expectOne('/api/sessions/s1/watch');
        expect(req.request.method).toBe('DELETE');
        req.flush({ message: 'ok' });
    });

    it('listSnapshots makes GET with query params', () => {
        api.listSnapshots('s1', { limit: '10', before: 'abc' }).subscribe();
        const req = httpMock.expectOne((r) => r.url === '/api/sessions/s1/snapshots');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('limit')).toBe('10');
        expect(req.request.params.get('before')).toBe('abc');
        req.flush({ snapshots: [] });
    });

    it('listSnapshots without params omits query string', () => {
        api.listSnapshots('s1').subscribe();
        const req = httpMock.expectOne('/api/sessions/s1/snapshots');
        expect(req.request.params.keys().length).toBe(0);
        req.flush({ snapshots: [] });
    });

    it('getSnapshotDiff makes GET /api/snapshots/:id/diff', () => {
        api.getSnapshotDiff('snap1').subscribe();
        const req = httpMock.expectOne('/api/snapshots/snap1/diff');
        expect(req.request.method).toBe('GET');
        req.flush({ snapshot: {} });
    });

    it('captureSnapshot makes POST /api/sessions/:id/snapshots', () => {
        api.captureSnapshot('s1').subscribe();
        const req = httpMock.expectOne('/api/sessions/s1/snapshots');
        expect(req.request.method).toBe('POST');
        req.flush({ snapshot: {} });
    });

    it('listComments makes GET /api/comments with query params', () => {
        api.listComments({ session_id: 's1', snapshot_id: 'snap1', status: 'draft' }).subscribe();
        const req = httpMock.expectOne((r) => r.url === '/api/comments');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('session_id')).toBe('s1');
        expect(req.request.params.get('snapshot_id')).toBe('snap1');
        expect(req.request.params.get('status')).toBe('draft');
        req.flush({ comments: [] });
    });

    it('createComment makes POST /api/comments', () => {
        const body = { session_id: 's1', snapshot_id: 'snap1', file_path: 'a.ts', content: 'test' };
        api.createComment(body).subscribe();
        const req = httpMock.expectOne('/api/comments');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush({ comment: {} });
    });

    it('updateComment makes PATCH /api/comments/:id', () => {
        api.updateComment('c1', { content: 'updated' }).subscribe();
        const req = httpMock.expectOne('/api/comments/c1');
        expect(req.request.method).toBe('PATCH');
        req.flush({ comment: {} });
    });

    it('deleteComment makes DELETE /api/comments/:id', () => {
        api.deleteComment('c1').subscribe();
        const req = httpMock.expectOne('/api/comments/c1');
        expect(req.request.method).toBe('DELETE');
        req.flush(null);
    });

    it('sendComments makes POST /api/comments/send', () => {
        const body = { comment_ids: ['c1'], target_id: 't1', transport_type: 'tmux' as const };
        api.sendComments(body).subscribe();
        const req = httpMock.expectOne('/api/comments/send');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(body);
        req.flush({ comments: [] });
    });

    it('resolveComment makes POST /api/comments/:id/resolve', () => {
        api.resolveComment('c1').subscribe();
        const req = httpMock.expectOne('/api/comments/c1/resolve');
        expect(req.request.method).toBe('POST');
        req.flush({ comment: {} });
    });

    it('replyToComment makes POST /api/comments/:id/reply', () => {
        api.replyToComment('c1', { content: 'reply text' }).subscribe();
        const req = httpMock.expectOne('/api/comments/c1/reply');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ content: 'reply text' });
        req.flush({ comment: {} });
    });

    it('listTargets makes GET /api/transport/targets', () => {
        api.listTargets().subscribe();
        const req = httpMock.expectOne('/api/transport/targets');
        expect(req.request.method).toBe('GET');
        req.flush({ targets: [] });
    });

    it('getTransportStatus makes GET /api/transport/status', () => {
        api.getTransportStatus().subscribe();
        const req = httpMock.expectOne('/api/transport/status');
        expect(req.request.method).toBe('GET');
        req.flush({ statuses: [] });
    });

    it('getTransportConfig makes GET /api/transport/config', () => {
        api.getTransportConfig().subscribe();
        const req = httpMock.expectOne('/api/transport/config');
        expect(req.request.method).toBe('GET');
        req.flush({ active_transport: 'clipboard', last_target_id: null, settings: null });
    });

    it('updateTransportConfig makes PUT /api/transport/config', () => {
        const body = { active_transport: 'tmux' as const, last_target_id: 't1' };
        api.updateTransportConfig(body).subscribe();
        const req = httpMock.expectOne('/api/transport/config');
        expect(req.request.method).toBe('PUT');
        expect(req.request.body).toEqual(body);
        req.flush({ message: 'ok' });
    });

    it('getGitInfo makes GET /api/git/info with path param', () => {
        api.getGitInfo('/some/path').subscribe();
        const req = httpMock.expectOne((r) => r.url === '/api/git/info');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('path')).toBe('/some/path');
        req.flush({
            is_git_repo: true,
            remote_url: null,
            current_branch: 'main',
            default_branch: 'main',
            repo_name: 'test',
        });
    });

    it('getBranches makes GET /api/git/branches with path param', () => {
        api.getBranches('/some/path').subscribe();
        const req = httpMock.expectOne((r) => r.url === '/api/git/branches');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('path')).toBe('/some/path');
        req.flush({ branches: ['main', 'develop'] });
    });
});
