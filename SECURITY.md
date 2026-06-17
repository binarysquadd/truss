# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately via **GitHub Security Advisories** — the "Report a vulnerability"
button under the repo's **Security** tab — or email **security@binarysquad.org**.

Include: affected version/commit, a description, reproduction steps, and impact.
We aim to acknowledge within 72 hours and to ship a fix or mitigation for confirmed
high/critical issues promptly. Please give us a reasonable window before public disclosure.

## Scope

Truss self-hosts a Postgres/auth/storage stack. When reporting, note that:
- The SQL workbench is **read-only** (enforced via a read-only transaction). A working
  write/DDL bypass is in scope.
- Auth/authorization bypass, tenant/data isolation, SSRF, secret exposure, and RCE are in scope.
- Misconfiguration of *your own* deployment (e.g. not setting `CORS_ALLOWED_ORIGINS`,
  weak `ENCRYPTION_KEY`) is out of scope — see the README hardening notes.

## Supported versions

Security fixes target the latest release on `main`.
