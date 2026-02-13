import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { SessionStore } from './session-store';
import { ApiClient } from '../services/api-client';
import { SseConnection } from '../services/sse-connection';
import type { SessionWithRepo, SnapshotSummary, Snapshot, FileSummary } from '@agent-code-reviewer/shared';

const mockSession: SessionWithRepo = {
    id: 's1',
    repo_id: 'r1',
    branch: 'main',
    base_branch: null,
    is_watching: false,
    created_at: '2025-01-01',
    repo: { id: 'r1', remote_url: null, name: 'test', base_branch: 'main', created_at: '2025-01-01' },
    repo_path: { id: 'rp1', repo_id: 'r1', path: '/test', last_accessed_at: null, created_at: '2025-01-01' },
};

const mockFiles: FileSummary[] = [
    { path: 'a.ts', status: 'modified', additions: 5, deletions: 2 },
    { path: 'b.ts', status: 'added', additions: 10, deletions: 0 },
    { path: 'c.ts', status: 'deleted', additions: 0, deletions: 8 },
];

const mockSnapshot: Snapshot = {
    id: 'snap1',
    session_id: 's1',
    raw_diff: 'diff...',
    files_summary: mockFiles,
    head_commit: 'abc123',
    trigger: 'manual',
    changed_files: ['a.ts', 'b.ts', 'c.ts'],
    has_review_comments: false,
    created_at: '2025-01-01',
};

const mockSnapshots: SnapshotSummary[] = [
    { id: 'snap3', session_id: 's1', files_summary: [], head_commit: null, trigger: 'manual', changed_files: null, has_review_comments: false, created_at: '2025-01-03' },
    { id: 'snap2', session_id: 's1', files_summary: [], head_commit: null, trigger: 'manual', changed_files: null, has_review_comments: false, created_at: '2025-01-02' },
    { id: 'snap1', session_id: 's1', files_summary: [], head_commit: null, trigger: 'manual', changed_files: null, has_review_comments: false, created_at: '2025-01-01' },
];

describe('SessionStore', () => {
    let store: SessionStore;
    let httpMock: HttpTestingController;
    let apiSpy: { getSession: ReturnType<typeof vi.fn>; listSnapshots: ReturnType<typeof vi.fn> };
    let sseSpy: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        apiSpy = {
            getSession: vi.fn().mockReturnValue(of({ session: mockSession })),
            listSnapshots: vi.fn().mockReturnValue(of({ snapshots: mockSnapshots })),
        };
        sseSpy = {
            connect: vi.fn().mockReturnValue(of()),
            disconnect: vi.fn(),
        };

        TestBed.configureTestingModule({
            providers: [
                provideZonelessChangeDetection(),
                provideHttpClient(),
                provideHttpClientTesting(),
                { provide: ApiClient, useValue: apiSpy },
                { provide: SseConnection, useValue: sseSpy },
            ],
        });
        store = TestBed.inject(SessionStore);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    async function loadSessionAndFlush() {
        store.loadSession('s1');
        // First tick: triggers rxResource effects (session + snapshots resolve via of())
        // linkedSignal picks up snapshots and sets activeSnapshotId to snap3
        TestBed.tick();
        // Drain microtasks from rxResource async loadEffect
        await new Promise((r) => setTimeout(r, 0));
        // Second tick: rxResource state resolves; httpResource for diff reacts to activeSnapshotId, schedules HTTP request
        TestBed.tick();
        httpMock.expectOne('/api/snapshots/snap3/diff').flush({ snapshot: mockSnapshot });
        // Drain microtasks from httpResource async loadEffect
        await new Promise((r) => setTimeout(r, 0));
        // Third tick: process the HTTP response, update resource value
        TestBed.tick();
    }

    it('loadSession sets session, snapshots, and activeSnapshotId', async () => {
        await loadSessionAndFlush();
        expect(store.currentSession()).toEqual(mockSession);
        expect(store.snapshots().length).toBe(3);
        expect(store.activeSnapshotId()).toBe('snap3');
    });

    it('diff resource sets currentDiff, files', async () => {
        await loadSessionAndFlush();
        expect(store.currentDiff()).toEqual(mockSnapshot);
        expect(store.files().length).toBe(3);
        expect(store.activeFileIndex()).toBe(0);
    });

    it('nextFile wraps around', async () => {
        await loadSessionAndFlush();
        expect(store.activeFileIndex()).toBe(0);
        store.nextFile();
        expect(store.activeFileIndex()).toBe(1);
        store.nextFile();
        expect(store.activeFileIndex()).toBe(2);
        store.nextFile();
        expect(store.activeFileIndex()).toBe(0);
    });

    it('prevFile wraps around', async () => {
        await loadSessionAndFlush();
        expect(store.activeFileIndex()).toBe(0);
        store.prevFile();
        expect(store.activeFileIndex()).toBe(2);
    });

    it('setActiveFile clamps out-of-range index', async () => {
        await loadSessionAndFlush();
        store.setActiveFile(10);
        expect(store.activeFileIndex()).toBe(2);
    });

    it('setActiveFile clamps negative index', async () => {
        await loadSessionAndFlush();
        store.setActiveFile(-5);
        expect(store.activeFileIndex()).toBe(0);
    });

    it('computed activeSnapshot returns correct snapshot', async () => {
        await loadSessionAndFlush();
        expect(store.activeSnapshot()?.id).toBe('snap3');
    });

    it('computed isViewingLatest is true when viewing first snapshot', async () => {
        await loadSessionAndFlush();
        expect(store.isViewingLatest()).toBe(true);
    });

    it('computed hasNewChanges is false when viewing latest', async () => {
        await loadSessionAndFlush();
        expect(store.hasNewChanges()).toBe(false);
    });

    it('nextFile/prevFile are no-ops with empty files', () => {
        expect(store.files().length).toBe(0);
        store.nextFile();
        expect(store.activeFileIndex()).toBe(0);
        store.prevFile();
        expect(store.activeFileIndex()).toBe(0);
    });

    it('computed activeFile returns correct file', async () => {
        await loadSessionAndFlush();
        expect(store.activeFile()?.path).toBe('a.ts');
    });

    it('computed totalFiles returns files length', async () => {
        await loadSessionAndFlush();
        expect(store.totalFiles()).toBe(3);
    });
});
