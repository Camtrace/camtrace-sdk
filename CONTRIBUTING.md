# Contributing

Thank you for your interest in the CamTrace Integration SDK.

## How this repository works

This repository is a **one-way mirror** of a private monorepo: each release is
published here as a snapshot commit by the CamTrace team. Day-to-day development
happens in the private repository.

Practical consequences:

- **Issues are welcome** — bug reports, integration questions, and feature
  requests are read and triaged by the CamTrace team.
- **Pull requests are welcome too**, with one caveat: accepted changes are
  applied to the private repository first and appear here in the next release
  snapshot, credited in the release notes rather than merged directly. Your PR
  may therefore be closed as "applied internally".
- The commit history here is intentionally shallow (one commit per release).

## Development setup

```bash
npm install                                # installs all workspaces
npm run build --workspace packages/api     # build the API client
npm run build --workspace packages/decoder # build the protocol decoder
cd apps/demo && npm run dev                # start the demo (http://localhost:8080)
```

Requirements: Node 18+, npm 8+, a modern browser, and a reachable CamTrace
server (v1.2 API) to test against.

## Code style

- Plain JavaScript (ES2020), no TypeScript.
- Match the style of the file you are editing (indentation, naming, comment
  density).
- `packages/web-video-decoder` is consumed **as sources** by the bundler of the
  consuming app — do not add a build step to it.

## Reporting security issues

Please do not open public issues for security problems. Contact
[dev@camtrace.com](mailto:dev@camtrace.com) directly.
