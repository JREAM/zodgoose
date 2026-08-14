# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-08-14

### Added

- **Document-level validation.** `toMongooseSchema()` now registers a
  `post('validate')` hook that parses the whole document through the root Zod
  schema. This is what makes root-level `.refine()` / `.superRefine()`
  actually fire, which they previously never did (only per-path `validate`
  functions existed, so the Zod root never got a validator).
  - Applies to `new Model().save()`, `Model.create()`, and `insertMany()`.
  - Follows vanilla Mongoose (and `@nullix/zod-mongoose`) behavior: update
    operations only validate when `runValidators: true` is passed, and even
    then a root refinement sees the pre-update snapshot, not the `$set` values.
  - Failures reject with a `MongooseError.ValidationError`, matching the error
    type per-path validators already produce. All Zod issues are collapsed onto
    a single `_root` path whose message joins the Zod messages.
  - New `skipDocumentValidation` option on `toMongooseSchema()` (and the
    `defaultToMongooseSchemaOptions` setup path) to disable the hook.

### Fixed

- **`.strict()` roots now save.** `this.toObject()` injects the Mongoose
  internal `_id`, `__v`, and `id` keys, which a strict Zod root rejected as
  unknown keys, breaking every save on strict schemas. The document hook now
  strips those injected keys unless the user explicitly declared them in their
  shape.
- **`genTimestampsSchema()` no longer yields a broken shape.** It used to
  return an empty `z.object({})`, so `.extend(genTimestampsSchema().shape)`
  produced a useless `{ [x: string]: unknown }` type with no runtime fields.
  It now returns real, optional `z.date()` fields for each configured name, so
  merging works correctly. `genTimestampsSchema().extend({...})` also now adds
  the fields and keeps auto-managed timestamps.
- **Buffer fields in the document hook.** MongoDB `Binary` values returned by
  `toObject()` are converted back to Node.js `Buffer`s (recursively) before
  parsing, so `z.instanceof(Buffer)` fields validate in the document hook the
  same way they do in per-path validators.
- **Discriminator child schemas inherit the document-validation opt-out.**
  When `skipDocumentValidation` is set on the base schema, recursively
  converted discriminator children honor it too.

### Changed

- `applyDiscriminators()` now accepts and forwards options (specifically the
  `skipDocumentValidation` flag) to recursively converted child schemas.
- README timestamp examples use `.extend(...shape)` instead of the deprecated
  Zod 4.x `.merge()`.
- **CI runs tests + coverage on every push.** The GitHub Actions workflow now
  runs on pushes to any branch and uploads coverage to Codecov via
  `codecov/codecov-action@v4`. Coverage is emitted as `lcov` into `coverage/`
  with `--coverage-reporter=lcov`.
- **Committed `bun.lock`** so `bun install --frozen-lockfile` is reproducible
  in CI (previously the workflow referenced a lockfile that did not exist).
- **README badges** for the CI workflow and Codecov coverage were added.

### Notes

- `z.transform(...)` remains unsupported and throws at schema-build time with
  the message `ZodPipe type is not supported`. A transform changes a field's
  runtime type, which zodgoose cannot map to a stable Mongoose type, so it is
  rejected up front rather than silently mis-validated. This is now asserted in
  tests and documented in the README.
