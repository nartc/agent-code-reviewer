import type { FileSummary } from '@agent-code-reviewer/shared';
import { buildFileTree, flattenTree } from './build-file-tree';

function makeFile(path: string, overrides?: Partial<FileSummary>): FileSummary {
    return {
        path,
        status: 'modified',
        additions: 1,
        deletions: 0,
        ...overrides,
    };
}

describe('buildFileTree', () => {
    it('should return empty array for empty input', () => {
        expect(buildFileTree([])).toEqual([]);
    });

    it('should handle a single root-level file', () => {
        const file = makeFile('single.ts');
        const tree = buildFileTree([file]);
        expect(tree).toEqual([{ name: 'single.ts', fullPath: 'single.ts', children: [], file }]);
    });

    it('should handle flat files with no directories', () => {
        const a = makeFile('a.ts');
        const b = makeFile('b.ts');
        const tree = buildFileTree([b, a]);
        expect(tree.map((n) => n.name)).toEqual(['a.ts', 'b.ts']);
        expect(tree.every((n) => n.children.length === 0)).toBe(true);
    });

    it('should group files under directory nodes', () => {
        const files = [makeFile('src/a.ts'), makeFile('src/b.ts'), makeFile('lib/c.ts')];
        const tree = buildFileTree(files);

        expect(tree.length).toBe(2);
        expect(tree[0].name).toBe('lib');
        expect(tree[1].name).toBe('src');
        expect(tree[0].children.length).toBe(1);
        expect(tree[1].children.length).toBe(2);
    });

    it('should handle deeply nested paths (3+ levels)', () => {
        const file = makeFile('a/b/c/d.ts');
        const tree = buildFileTree([file]);

        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('a');
        expect(tree[0].children[0].name).toBe('b');
        expect(tree[0].children[0].children[0].name).toBe('c');
        expect(tree[0].children[0].children[0].children[0].name).toBe('d.ts');
        expect(tree[0].children[0].children[0].children[0].file).toBeDefined();
    });

    it('should sort directories first, then files, both alphabetical', () => {
        const files = [makeFile('z-file.ts'), makeFile('src/index.ts'), makeFile('a-file.ts'), makeFile('lib/util.ts')];
        const tree = buildFileTree(files);

        // Directories first: lib, src; then files: a-file.ts, z-file.ts
        expect(tree.map((n) => n.name)).toEqual(['lib', 'src', 'a-file.ts', 'z-file.ts']);
    });

    it('should handle single file in a directory', () => {
        const file = makeFile('src/index.ts');
        const tree = buildFileTree([file]);

        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('src');
        expect(tree[0].file).toBeUndefined();
        expect(tree[0].children.length).toBe(1);
        expect(tree[0].children[0].name).toBe('index.ts');
    });

    it('should handle mixed root-level files and directories', () => {
        const files = [makeFile('README.md'), makeFile('src/app.ts'), makeFile('package.json')];
        const tree = buildFileTree(files);

        // src dir first, then files
        expect(tree[0].name).toBe('src');
        expect(tree[0].children[0].name).toBe('app.ts');
        expect(tree[1].name).toBe('package.json');
        expect(tree[2].name).toBe('README.md');
    });
});

describe('flattenTree', () => {
    it('should flatten tree with correct depths', () => {
        const files = [makeFile('src/a.ts'), makeFile('src/b.ts'), makeFile('root.ts')];
        const tree = buildFileTree(files);
        const flat = flattenTree(tree, new Set());

        expect(flat.length).toBe(4); // src, a.ts, b.ts, root.ts
        expect(flat[0]).toEqual(expect.objectContaining({ depth: 0, isDir: true }));
        expect(flat[0].node.name).toBe('src');
        expect(flat[1]).toEqual(expect.objectContaining({ depth: 1, isDir: false }));
        expect(flat[3]).toEqual(expect.objectContaining({ depth: 0, isDir: false }));
    });

    it('should hide children of collapsed directories', () => {
        const files = [makeFile('src/a.ts'), makeFile('src/b.ts'), makeFile('root.ts')];
        const tree = buildFileTree(files);
        const flat = flattenTree(tree, new Set(['src']));

        expect(flat.length).toBe(2); // src (collapsed), root.ts
        expect(flat[0].node.name).toBe('src');
        expect(flat[1].node.name).toBe('root.ts');
    });
});
