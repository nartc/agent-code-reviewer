import { RelativeTime } from './relative-time';

describe('RelativeTime', () => {
    let pipe: RelativeTime;

    beforeEach(() => {
        pipe = new RelativeTime();
    });

    it('returns empty string for null', () => {
        expect(pipe.transform(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
        expect(pipe.transform(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
        expect(pipe.transform('not-a-date')).toBe('');
    });

    it('returns "just now" for 30 seconds ago', () => {
        const date = new Date(Date.now() - 30_000);
        expect(pipe.transform(date)).toBe('just now');
    });

    it('returns "5m ago" for 5 minutes ago', () => {
        const date = new Date(Date.now() - 5 * 60_000);
        expect(pipe.transform(date)).toBe('5m ago');
    });

    it('returns "1m ago" for exactly 60 seconds ago', () => {
        const date = new Date(Date.now() - 60_000);
        expect(pipe.transform(date)).toBe('1m ago');
    });

    it('returns "2h ago" for 2 hours ago', () => {
        const date = new Date(Date.now() - 2 * 3_600_000);
        expect(pipe.transform(date)).toBe('2h ago');
    });

    it('returns "3d ago" for 3 days ago', () => {
        const date = new Date(Date.now() - 3 * 86_400_000);
        expect(pipe.transform(date)).toBe('3d ago');
    });

    it('returns formatted date for 10 days ago', () => {
        const date = new Date(Date.now() - 10 * 86_400_000);
        const result = pipe.transform(date);
        // Should be in "Mon DD" format like "Jan 15"
        expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('accepts string input', () => {
        const date = new Date(Date.now() - 30_000).toISOString();
        expect(pipe.transform(date)).toBe('just now');
    });

    it('accepts Date object input', () => {
        const date = new Date(Date.now() - 30_000);
        expect(pipe.transform(date)).toBe('just now');
    });
});
