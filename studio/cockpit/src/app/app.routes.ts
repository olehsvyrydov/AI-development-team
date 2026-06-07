import { Routes } from '@angular/router';

/**
 * Cockpit routes. The launcher is the index; entering a project navigates to its shell by id.
 * Feature views are lazy-loaded so the launcher's initial payload stays small (the Workflow
 * canvas and other panels — later tickets — will load only when their routes activate).
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./projects/projects-home.component').then((m) => m.ProjectsHomeComponent),
  },
  {
    path: 'projects/:id',
    loadComponent: () => import('./shell/project-shell.component').then((m) => m.ProjectShellComponent),
  },
  { path: '**', redirectTo: '' },
];
