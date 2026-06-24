# Security Policy

## Supported versions

Spiny is pre-1.0 in practice; security fixes are applied to the latest `main` and
the most recent release.

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅        |
| < 1.0   | ❌        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately using GitHub's
[private vulnerability reporting](https://github.com/spiny/spiny/security/advisories/new)
("Security" → "Report a vulnerability"). This keeps the details confidential while
a fix is prepared.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce or a proof of concept.
- Affected version, platform, and device/OS where relevant.

## What to expect

- Acknowledgement of your report within a reasonable timeframe.
- An assessment and, if confirmed, a fix coordinated privately before disclosure.
- Credit for the report if you would like it.

## Scope notes

Spiny is local-first. Pay particular attention when reporting issues that involve:

- Stored sync credentials (encrypted with AES-256; key held in `expo-secure-store`).
- OAuth flows for the Google Drive provider (PKCE, user-supplied client id).
- Local SQLite data at rest.

Out of scope: vulnerabilities in third-party providers themselves (Google Drive,
SSH/SFTP hosts), and issues requiring a physically compromised, rooted device.
