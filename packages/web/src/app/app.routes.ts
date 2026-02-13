import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
    },
    {
        path: 'review/:sessionId',
        loadComponent: () => import('./features/review/review').then((m) => m.Review),
    },
    {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    },
];
