import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

@Pipe({ name: 'relativeTime' })
export class RelativeTime implements PipeTransform {
    transform(value: string | Date | null | undefined): string {
        if (value == null) return '';

        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return '';

        const diffMs = Date.now() - date.getTime();

        if (diffMs < MINUTE) return 'just now';
        if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)}m ago`;
        if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}h ago`;
        if (diffMs < WEEK) return `${Math.floor(diffMs / DAY)}d ago`;

        return dateFormatter.format(date);
    }
}
