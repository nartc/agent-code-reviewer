import type { FileSummary } from '@agent-code-reviewer/shared';

export interface TreeNode {
    name: string;
    fullPath: string;
    children: TreeNode[];
    file?: FileSummary;
}

export interface FlatTreeEntry {
    node: TreeNode;
    depth: number;
    isDir: boolean;
}

export function buildFileTree(files: FileSummary[]): TreeNode[] {
    if (files.length === 0) return [];

    const root: TreeNode[] = [];

    for (const file of files) {
        const segments = file.path.split('/');
        let currentChildren = root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const fullPath = segments.slice(0, i + 1).join('/');
            const isLeaf = i === segments.length - 1;

            let existing = currentChildren.find((n) => n.name === segment);
            if (!existing) {
                existing = {
                    name: segment,
                    fullPath,
                    children: [],
                    ...(isLeaf ? { file } : {}),
                };
                currentChildren.push(existing);
            }

            if (isLeaf) {
                existing.file = file;
            }

            currentChildren = existing.children;
        }
    }

    sortTree(root);
    return root;
}

function sortTree(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
        const aIsDir = a.children.length > 0 || !a.file;
        const bIsDir = b.children.length > 0 || !b.file;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
        if (node.children.length > 0) {
            sortTree(node.children);
        }
    }
}

export function flattenTree(nodes: TreeNode[], collapsedPaths: Set<string>, depth = 0): FlatTreeEntry[] {
    const result: FlatTreeEntry[] = [];
    for (const node of nodes) {
        const isDir = node.children.length > 0;
        result.push({ node, depth, isDir });
        if (isDir && !collapsedPaths.has(node.fullPath)) {
            result.push(...flattenTree(node.children, collapsedPaths, depth + 1));
        }
    }
    return result;
}
