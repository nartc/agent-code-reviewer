import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
    lucideArrowLeft,
    lucideChevronDown,
    lucideChevronLeft,
    lucideChevronRight,
    lucideChevronsLeft,
    lucideChevronsRight,
    lucideFile,
    lucideFolderClosed,
    lucideFolderOpen,
    lucideMessageSquare,
    lucidePlus,
} from '@ng-icons/lucide';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes, withComponentInputBinding()),
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideIcons({
            lucideChevronsRight,
            lucideChevronsLeft,
            lucideChevronLeft,
            lucideChevronRight,
            lucideChevronDown,
            lucideMessageSquare,
            lucidePlus,
            lucideArrowLeft,
            lucideFolderOpen,
            lucideFolderClosed,
            lucideFile,
        }),
    ],
};
