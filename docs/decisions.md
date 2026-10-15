# Implementation boundary

The 16 October 2026 revised blueprint is the planning basis. This repository starts with the manual workflow rather than the earlier, broader presentation proposal.

- Supported reporting categories: road damage, garbage accumulation, road waterlogging and missing/broken manhole covers.
- One **simulated municipality**, clearly labelled until the team confirms a real jurisdiction and department directory.
- English-first; Android-first device testing.
- Public registration creates citizens only. Officer accounts are provisioned locally by an authorised operator.
- Citizens see only their own complaints. GRO review is restricted to its configured jurisdiction. Technical administration alone does not grant grievance disposal authority.
- Photographs are useful but never worth unsafe collection. Missing evidence goes to manual review; it does not prevent registration.
- Preserve the complaint and tracking ID before any later AI analysis. AI is explicitly disabled, not simulated.
- Initial priority rules, image classification, incident matching, maps and hotspot experiments follow the working manual lifecycle and reviewed data. Do not describe them as implemented yet.
- Incident matching is the planned research comparison: text alone versus text plus category/location/time, on reviewed same/different incident pairs.
- No automatic closure, AI-generated-image verdict, world-first claim or claim of replacing CPGRAMS.

## Why this structure

A modular FastAPI application gives both clients the same permissions and status rules. PostgreSQL/PostGIS is the intended shared database. SQLite is allowed for isolated tests and a lightweight local API demo only; it is not a replacement for PostGIS. Local private-file storage is a development adapter; private S3-compatible storage is the deployment path.

No raw datasets or earlier PDF/PPT submissions are copied into this repository. The image-colorization style is followed through short, meaningful commits, not invented history or backdated commits.
