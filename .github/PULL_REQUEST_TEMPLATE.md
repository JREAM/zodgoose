## Description

<!-- What does this PR do and why? What problem does it solve? -->

## Type of change

The PR title / final commit message must follow Conventional Commits so the
release pipeline versions correctly.

- **feat:** new feature → minor release
- **fix:** bug fix → patch release
- **feat!:** or `BREAKING CHANGE:` → major release
- **chore / docs / style / refactor / test:** no npm release

Check the one that applies (and mark the title accordingly):

- [ ] feat: (new feature)
- [ ] fix: (bug fix)
- [ ] feat!: / BREAKING CHANGE (breaking change)
- [ ] docs / chore / style / refactor / test (no release)

## How has this been tested?

<!-- e.g. `bun test`, manual verification, coverage output -->

- [ ] Code is formatted (`bun run fmt`)
- [ ] Lint passes (`bun run lint`)
- [ ] Tests pass (`bun test`)

## Checklist

- [ ] My changes follow the [Contributing guide](./CONTRIBUTING.md)
- [ ] I have updated the README/CHANGELOG if the public API changed

Fixes #<!-- issue number -->
