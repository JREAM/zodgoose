# Contributing to zodgoose

Thanks for wanting to contribute! This project uses an automated release
pipeline built on [Conventional Commits](https://www.conventionalcommits.org/)
and [semantic-release](https://semantic-release.org/), so the way you write
commit messages and open pull requests directly controls what gets published to
npm. Please read this before your first contribution.

## Development setup

This project uses [Bun](https://bun.sh). A Bun **canary** build is required
locally: it uses `node:v8` snapshot APIs (via `mongodb-memory-server`) that
stable 1.3.x doesn't implement.

```sh
bun install
```

Available scripts:

| Command            | Purpose                          |
| ------------------ | -------------------------------- |
| `bun test`         | Run the test suite               |
| `bun test --coverage` | Run tests with coverage output |
| `bun run lint`     | Lint with oxlint                 |
| `bun run lint:fix` | Auto-fix lint issues             |
| `bun run fmt`      | Format with oxfmt                |
| `bun run build`    | Build the dist bundles with tsdown |

A pre-commit hook runs the full test suite, and a commit-msg hook enforces
Conventional Commit format. Both run automatically via Husky; no extra setup.

## Branching and workflow

* `main` is the release branch. Direct pushes are blocked; all changes land via
  pull request and are protected by required CI checks.
* `dev` is where day-to-day work happens. Push commits there freely.

The normal flow:

1. Create a feature branch off `dev` (or commit to `dev` directly for quick
   fixes).
2. Commit with a valid Conventional Commit message (see below).
3. Push and open a pull request.
4. CI runs tests, lint, and coverage. Everything must pass.
5. Merge the PR (reference note: `main` enforces linear history, so merges
   rebase). When the merged commits reach `main`, semantic-release analyzes
   them: it bumps the version, rewrites `CHANGELOG.md`, creates a `vX.Y.Z` git
   tag, files a GitHub Release, and publishes to npm.

## Commit messages

Commit messages MUST use the Conventional Commits format, because the release
tool derives the next version from them:

```
<type>[optional scope]: <description>
```

* `feat: add support for X` → triggers a **minor** release (e.g. `0.3.0` → `0.4.0`)
* `fix: correct broken import` → triggers a **patch** release (e.g. `0.4.0` → `0.4.1`)
* `feat!: break the API` or adding a `BREAKING CHANGE:` footer → triggers a
  **major** release (e.g. `0.4.0` → `1.0.0`)

Types that do **not** trigger a release: `chore`, `docs`, `style`, `refactor`,
`test`, `perf`. Use these for changes that shouldn't produce a new npm version.

A bad message like `fixed stuff` is rejected by the commit-msg hook before it
reaches your history.

## Skipping a release

If a merge to `main` must not publish, choose a non-release type (`chore`,
`docs`, `style`, ...) for the commit that lands on main, or append `[skip ci]`
to the final commit/PR message to halt the workflow entirely.

## Opening a pull request

* Target `main` from a reviewed branch.
* Reference the issue the PR resolves.
* Keep changes focused; a PR that bundles many unrelated changes is harder to
  review and harder to release neatly.
* Make sure the commit messages on the branch follow Conventional Commits,
  since `main` enforces linear history and merges via rebase, so those messages
  land on `main` unchanged.

## Reporting issues

For bugs, include the zodgoose version, your Mongoose and Zod versions, a
minimal reproduction, and the expected vs. actual behavior.

## License

By contributing, you agree that your contributions are licensed under the same
[MIT License](./LICENSE.md) as the project.
