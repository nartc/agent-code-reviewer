// Re-export for explicit import if needed; actual migration logic is in client.ts
// Future: extract complex migration logic here when v2+ migrations are added

export { runMigrations } from './client.js';
