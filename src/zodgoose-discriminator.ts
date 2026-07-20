/**
 * Discriminator support for zodgoose.
 *
 * Mongoose discriminators allow storing multiple schemas in the same MongoDB collection,
 * differentiated by a `discriminatorKey` field (e.g. `kind`).
 *
 * Usage:
 * ```ts
 * const baseSchema = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: 'kind' } });
 * const childSchema = z.object({ name: z.string(), age: z.number() });
 *
 * const discriminatorEntry = discriminator(baseSchema, 'Adult', childSchema);
 *
 * const BaseModel = mongoose.model('Person', toMongooseSchema(discriminatorEntry).schema);
 * const AdultModel = mongoose.model('Adult', toMongooseSchema(discriminatorEntry, { discriminators: [] }).schema);
 * // Or use getDiscriminators() to extract discriminator entries from the base schema.
 * ```
 *
 * The discriminator entries are stored on the Zodgoose schema via a Symbol, and
 * `toMongooseSchema()` applies them to the Mongoose schema when converting.
 */

import type { Zodgoose } from "./zodgoose-prototype.js";
import type { Schema } from "mongoose";

// TBase is only used for documentation purposes (type-level only)
export interface DiscriminatorEntry<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TBase = any,
  TChild = any,
> {
  /** Mongoose discriminator name — must match the value stored in the discriminatorKey field */
  name: string;
  /** Child Zodgoose schema (must be Zodgoose-wrapped ZodObject) */
  schema: Zodgoose<any, TChild>;
  /** Optional Mongoose discriminator options (e.g. { value: 'adult' }) */
  options?: Record<string, unknown> | undefined;
}

/** Symbol used to store discriminator entries on a Zodgoose schema */
export const ZODGOOSE_DISCRIMINATORS_SYMBOL = Symbol("zodgooseDiscriminators");

/**
 * Attach a discriminator to a base Zodgoose schema.
 *
 * Returns the base schema with the discriminator entry stored on it.
 * Pass the returned schema to `toMongooseSchema()` which will apply all
 * stored discriminator entries to the resulting Mongoose schema.
 *
 * @param baseSchema - A Zodgoose-wrapped Zod schema (created via `.mongoose()`)
 * @param name - Discriminator name (used as Mongoose model name suffix)
 * @param childSchema - A Zodgoose-wrapped child Zod schema
 * @param options - Optional Mongoose discriminator options (e.g. `{ value: 'adult' }`)
 */
export function discriminator<
  TBase extends Zodgoose<any, any>,
  TChild extends Zodgoose<any, any>,
>(
  baseSchema: TBase,
  name: string,
  childSchema: TChild,
  options?: Record<string, unknown>,
): TBase & { _zodgooseDiscriminators: DiscriminatorEntry[] } {
  const discriminators: DiscriminatorEntry[] =
    (baseSchema as any)[ZODGOOSE_DISCRIMINATORS_SYMBOL] ?? [];
  discriminators.push({ name, schema: childSchema, options });
  (baseSchema as any)[ZODGOOSE_DISCRIMINATORS_SYMBOL] = discriminators;
  return baseSchema as TBase & { _zodgooseDiscriminators: DiscriminatorEntry[] };
}

/**
 * Retrieve all discriminator entries attached to a Zodgoose schema.
 */
export function getDiscriminators(
  schema: Zodgoose<any, any>,
): DiscriminatorEntry[] {
  return (schema as any)[ZODGOOSE_DISCRIMINATORS_SYMBOL] ?? [];
}

/**
 * Apply all stored discriminator entries to a Mongoose schema.
 * Called internally by `toMongooseSchema()`.
 *
 * @param rootZodSchema - The Zodgoose schema to extract discriminators from
 * @param schema - The already-built Mongoose schema
 * @param toMongooseSchemaFn - Reference to `toMongooseSchema` for recursive conversion
 */
export function applyDiscriminators(
  rootZodSchema: Zodgoose<any, any>,
  schema: Schema,
  // eslint-disable-next-line @typescript-eslint/ban-types
  toMongooseSchemaFn: Function,
): void {
  const discriminators = getDiscriminators(rootZodSchema);
  for (const disc of discriminators) {
    const childMonSchema = toMongooseSchemaFn(
      disc.schema,
      {},
    ) as Schema;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schema as any).discriminator(disc.name, childMonSchema, disc.options);
  }
}
