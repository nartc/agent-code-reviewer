<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.

<!-- nx configuration end-->

# Angular Conventions

These are the project's Angular authoring conventions. Follow them for all frontend work.

## File & Class Naming

- No type suffixes in filenames — `user-list.ts` not `user-list.component.ts`, `api-client.ts` not `api.service.ts`
- No suffixes on class names — `UserList`, `RelativeTime`, `ApiClient`
- Name services by responsibility — `ApiClient`, `SseConnection`, `ThemeSwitcher`, never generic `*Service`
- No barrel exports (index.ts) — always import directly from the file

## Folder Structure

- Flat within feature folders, create sub-directory only when a sub-feature has >1 file
- Example: `features/review/diff-viewer/` only if diff-viewer has multiple files

## Component Authoring

- Inline template (`template:`), no `styles`/`styleUrl` (Tailwind/DaisyUI only, except `@pierre/diffs` edge cases)
- Omit `standalone: true` (default in Angular 19+)
- `changeDetection: ChangeDetectionStrategy.OnPush` (provideZonelessChangeDetection already configured)
- Selector prefix: `acr-`
- `host: {}` in component metadata for host bindings/listeners
- `imports: []` — only list what's actually used, no shared modules

## Template Patterns

- New control flow: `@if`, `@for`, `@switch`, `@let`
- All data in templates should be signals (convert observables before template)

## Signals & Reactivity

- `input()`, `input.required()`, `model()`, `output()` — all functional/signal API
- `viewChild()`, `viewChildren()`, `contentChild()`, `contentChildren()` — signal queries
- Prefer `linkedSignal`, `computed`, `resource` over imperative `effect()`
- `afterNextRender` / `afterRenderEffect` with correct phases for DOM work
- `effect()` only when no better declarative option exists

## Dependency Injection

- `inject()` only — no constructor injection
- `providedIn: 'root'` for global services
- Route `providers: []` for feature-scoped
- Component `providers: []` for component-scoped

## State Management (ngrx/signals)

- `@Injectable()` class
- Private `#state = signalState({...})`
- Expose deep signals as public `readonly` properties

## Data Fetching

- `resource()` / `rxResource()` / `httpResource()` for reads (GET-style)
- `HttpClient` for mutations (POST/PATCH/DELETE)
- RxJS where it fits (HttpClient, SSE/streams), always convert to signals before template

## Routing

- `withComponentInputBinding()` for route params → component `input()`
- `loadComponent` for leaf routes, `loadChildren` for features with sub-routes

## Styling

- DaisyUI classes directly on elements, no wrapper components
- Tailwind 4 CSS-first config, no `tailwind.config.js`
