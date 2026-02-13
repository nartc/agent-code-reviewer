import { Component } from '@angular/core';
import { Layout } from './shared/components/layout';

@Component({
    selector: 'app-root',
    imports: [Layout],
    template: `
        <acr-layout />
    `,
})
export class App {}
