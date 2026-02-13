import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
    selector: 'acr-resize-handle',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'block select-none',
        '[class.cursor-col-resize]': "direction() === 'horizontal'",
        '[class.cursor-row-resize]': "direction() === 'vertical'",
        '[class.w-1]': "direction() === 'horizontal'",
        '[class.h-1]': "direction() === 'vertical'",
        '(pointerdown)': 'onPointerDown($event)',
    },
    template: `<div class="divider m-0 h-full"></div>`,
})
export class ResizeHandle {
    readonly direction = input<'horizontal' | 'vertical'>('horizontal');
    readonly resized = output<number>();

    protected onPointerDown(event: PointerEvent): void {
        const target = event.target as Element;
        target.setPointerCapture(event.pointerId);

        let lastX = event.clientX;
        let lastY = event.clientY;
        const pointerId = event.pointerId;

        const onMove = (e: PointerEvent) => {
            if (e.pointerId !== pointerId) return;
            const delta = this.direction() === 'horizontal' ? e.clientX - lastX : e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            this.resized.emit(delta);
        };

        const onUp = (e: PointerEvent) => {
            if (e.pointerId !== pointerId) return;
            target.releasePointerCapture(pointerId);
            target.removeEventListener('pointermove', onMove as EventListener);
            target.removeEventListener('pointerup', onUp as EventListener);
            target.removeEventListener('pointercancel', onUp as EventListener);
        };

        target.addEventListener('pointermove', onMove as EventListener);
        target.addEventListener('pointerup', onUp as EventListener);
        target.addEventListener('pointercancel', onUp as EventListener);
    }
}
