# First implementation status

## Included

The initial citizen-to-GRO path, React Native app, Next.js website, shared API/types, explicit migrations, optional private photographs, tracking/history and permission tests. All four categories can be registered for manual review; this does not imply a trained model for each category.

## Verification boundary

- Local API workflow tests: passed on isolated SQLite, with the PostGIS-only test skipped when no PostgreSQL test URL is provided.
- Shared API-client tests and both TypeScript checks: passed.
- Next.js production build: passed.
- Expo SDK dependency compatibility and Android Metro export: passed. No physical Android/emulator execution is claimed.
- Live PostGIS, browser results and GitHub check status are recorded after their respective runs; a workflow file alone is not proof of a successful run.
- Python dependency audit: no known advisories reported. Expo tooling has unresolved dependency warnings described in SECURITY.md.
- Live S3, Docker Compose startup, real-device permissions, TLS/hosting, backup recovery, load testing and real municipal use: not yet verified.

## Next implementation boundary

1. Confirm municipality, team deadline/resources and the four-category scope with the guide.
2. Complete manual department assignment/work orders, field evidence, responses and independent appeals. Current status notes are not a complete appeal subsystem.
3. Collect and independently review a local data pilot. Do not download public training datasets again without a selected preparation task.
4. Add image baselines and uncertain/disabled states, followed by reviewed incident-matching candidates.
5. Add explainable priority rules, officer overrides and report-versus-incident maps; only train/evaluate later models when suitable labels exist.

The main planned research comparison remains incident matching with text alone versus text/category/location/time. The interface currently provides no AI judgement, automatic duplicate merge or learned priority score.
