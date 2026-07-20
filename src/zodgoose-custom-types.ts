import M from "mongoose";
import { z } from "zod";

/**
 * Supported custom Mongoose SchemaType names for `zodgooseCustomType()`.
 *
 * Each entry maps a type name to:
 * - `instanceClass`: runtime constructor for `z.instanceof()` (or null if not applicable)
 * - `schemaType`: Mongoose SchemaType class used in schema definition
 * - `zodSchema`: optional custom Zod schema override (when instanceof doesn't work, e.g. BigInt)
 */
export interface CustomTypeEntry {
  instanceClass: (new (...args: any[]) => any) | null;
  schemaType: new (...args: any[]) => any;
  zodSchema?: z.ZodType;
}

const customTypeRegistry = new Map<string, CustomTypeEntry>();

function register(name: string, entry: CustomTypeEntry): void {
  customTypeRegistry.set(name, entry);
}

// --- Built-in registrations ---

// Buffer — always available
register("Buffer", {
  instanceClass: Buffer,
  schemaType: M.Schema.Types.Buffer,
});

// ObjectId — always available
register("ObjectId", {
  instanceClass: M.Types.ObjectId,
  schemaType: M.Schema.Types.ObjectId,
});

// Decimal128 — Mongoose 7+
if (M.Schema.Types.Decimal128) {
  register("Decimal128", {
    instanceClass: M.Types.Decimal128,
    schemaType: M.Schema.Types.Decimal128,
  });
}

// UUID — Mongoose 7+
// Mongoose stores UUID as Buffer internally, so z.instanceof(UUID) would reject
// stored values. Use a custom schema that accepts UUID instances, strings, or Buffers.
if (M.Schema.Types.UUID) {
  const uuidSchema = z.union([
    z.instanceof(M.Types.UUID),
    z.string().uuid(),
    z.instanceof(Buffer),
  ]);
  register("UUID", {
    instanceClass: M.Types.UUID,
    schemaType: M.Schema.Types.UUID,
    zodSchema: uuidSchema,
  });
}

// BigInt — Mongoose 8+
if (M.Schema.Types.BigInt) {
  register("BigInt", {
    instanceClass: null,
    schemaType: M.Schema.Types.BigInt,
    zodSchema: z.bigint(),
  });
}

// Double — Mongoose 8+ (if available)
if ((M.Schema.Types as any).Double) {
  register("Double", {
    instanceClass: null,
    schemaType: (M.Schema.Types as any).Double,
    zodSchema: z.number(),
  });
}

// Int32 — Mongoose (if available)
if ((M.Schema.Types as any).Int32) {
  register("Int32", {
    instanceClass: null,
    schemaType: (M.Schema.Types as any).Int32,
    zodSchema: z.number(),
  });
}

/**
 * Register a custom Mongoose type for use with `zodgooseCustomType()`.
 * Useful for third-party types like `mongoose-long`'s Long.
 */
export function registerCustomType(typeName: string, entry: CustomTypeEntry): void {
  register(typeName, entry);
}

/**
 * Check if a type name is registered as a supported custom Mongoose type.
 */
export function isRegisteredCustomType(typeName: string): boolean {
  return customTypeRegistry.has(typeName);
}

/**
 * Get the registered entry for a custom type name.
 * Throws if the type name is not registered.
 */
export function getCustomTypeEntry(typeName: string): CustomTypeEntry {
  const entry = customTypeRegistry.get(typeName);
  if (!entry) {
    throw new Error(
      `Unsupported custom Mongoose type: "${typeName}". ` +
        `Supported types: ${[...customTypeRegistry.keys()].join(", ")}`,
    );
  }
  return entry;
}

/**
 * Get the Zod schema for a registered custom type name.
 */
export function getCustomTypeZodSchema(typeName: string, params?: { message?: string }): z.ZodType {
  const entry = getCustomTypeEntry(typeName);
  if (entry.zodSchema) {
    return entry.zodSchema;
  }
  if (entry.instanceClass) {
    return z.instanceof(entry.instanceClass, params);
  }
  // Fallback — should not happen for registered types
  return z.any();
}

/**
 * Get the Mongoose SchemaType class for a registered custom type name.
 */
export function getCustomTypeSchemaClass(typeName: string): new (...args: any[]) => any {
  return getCustomTypeEntry(typeName).schemaType;
}

/**
 * Get the instance class for a registered custom type name (may be null).
 */
export function getCustomTypeInstanceClass(typeName: string): (new (...args: any[]) => any) | null {
  return getCustomTypeEntry(typeName).instanceClass;
}

/**
 * List all registered custom type names.
 */
export function listRegisteredCustomTypes(): string[] {
  return [...customTypeRegistry.keys()];
}
