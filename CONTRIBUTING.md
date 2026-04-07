# Contributing to Invariance MCP

Thanks for your interest in contributing!

## Getting started

1. Fork the repository
2. Clone your fork and create a branch: `git checkout -b my-feature`
3. Install dependencies: `pnpm install`
4. Make your changes
5. Run checks: `pnpm lint && pnpm typecheck && pnpm test`
6. Add a changeset: `pnpm changeset`
7. Push your branch and open a Pull Request

## Requirements

- Node.js 20+
- pnpm 9+

## Guidelines

- All PRs must pass CI (lint, typecheck, tests, build)
- Include a changeset for any user-facing change
- Follow the existing code style (enforced by eslint + prettier)
- Add tests for new tools or features

## Changesets

We use [changesets](https://github.com/changesets/changesets) for versioning. Run `pnpm changeset` to describe your change before opening a PR.

## Code of conduct

Be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
