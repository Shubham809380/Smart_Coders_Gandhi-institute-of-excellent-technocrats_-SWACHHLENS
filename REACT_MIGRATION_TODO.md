# React Migration TODO

The Vite + React shell is active. `src/components/LegacyRuntime.jsx` temporarily mounts the original DOM-rendered experience so no existing feature was lost during the migration. New work must be native React; this checklist tracks the remaining legacy surface that must be replaced.

## Migration rules

- Do not add new behavior to `src/app.js`; add it as React components and hooks instead.
- Keep API/Firebase access in services/hooks, not inside presentational components.
- Remove the matching legacy route and event handlers only after feature parity is verified.
- Delete `LegacyRuntime.jsx`, `src/app.js`, and legacy-only services only after all rows below are complete.

## Citizen experience

- [ ] App bootstrap, splash, onboarding, welcome, login, signup, password reset
- [ ] Home and notification experience
- [ ] Capture: camera/gallery/video, GPS, comment, permission prompts
- [ ] AI analysis progress and results review
- [ ] Report submission confirmation and report tracking timeline
- [ ] Explore map, hotspot filters, and report history
- [ ] Profile and user settings

## Authority and operations

- [ ] Admin dashboard and live metrics
- [ ] AI priority queue and complaint detail/review
- [ ] Smart dispatch and team assignment
- [ ] Worker task list, map, task-progress updates, and after-photo upload
- [ ] Cleanup verification and resolution/reopen workflow

## Cross-cutting

- [ ] Firebase Auth state provider and role-aware route guards
- [ ] Firestore realtime hooks for complaints, teams, alerts, and hotspots
- [ ] Firebase Storage upload hooks with progress/error state
- [ ] PWA offline/report-draft strategy and push-notification UX
- [ ] Replace legacy hash navigation with React Router routes and deep-link tests
- [ ] Remove the legacy runtime bridge
