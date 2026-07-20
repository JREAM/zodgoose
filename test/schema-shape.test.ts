import M from "mongoose";
import { z } from "zod";
import { zodgooseError, zodgooseCustomType, toMongooseSchema, registerCustomType, discriminator, getDiscriminators } from "../src/index.js";

enum TestStringEnum {
  a = "A",
  b = "B",
}

enum TestNumericEnum {
  a = 1,
  b = 2,
}

enum TestMixedEnum {
  a = "A",
  b = 2,
}

describe("Schema shape replication", () => {
  it("Creates a mongoose schema based on fields provided in a Zod schema", () => {
    const zodSchema = z
      .object({
        username: z.string(),
        registered: z.boolean(),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Object.keys(Schema.paths).sort()).toEqual(["_id", "username", "registered"].sort());
  });

  it("Does not allow the root schema not to be called with .mongoose()", () => {
    const zodSchema = z.object({ username: z.string() });

    expect(() => {
      toMongooseSchema(zodSchema as any);
    }).toThrow(zodgooseError);
  });

  it("Does not allow the root schema to be anything but an object", () => {
    const zodSchema = z.string();

    expect(() => {
      toMongooseSchema(zodSchema as any);
    }).toThrow(zodgooseError);
  });

  it("Creates sub-schemas for fields with object type", () => {
    const zodSchema = z
      .object({
        username: z.string(),
        friends: z.object({
          ids: z.number().int().array(),
          count: z.number().int(),
        }),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.friends).toBeInstanceOf(M.SchemaTypes.Subdocument);
    expect(Object.keys((Schema as any).singleNestedPaths).sort()).toEqual(
      ["friends.ids", "friends.count", "friends.ids.$"].sort(),
    );
    expect(Object.keys(Schema.childSchemas[0]?.schema.paths || {}).sort()).toEqual(
      ["ids", "count"].sort(),
    );
  });

  it("Creates sub-schemas from z.strictObject()", () => {
    const zodSchema = z
      .strictObject({
        a: z.string(),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.a).toBeInstanceOf(M.SchemaTypes.ZodgooseString);
  });

  it("Creates sub-schemas from z.looseObject()", () => {
    const zodSchema = z
      .looseObject({
        a: z.string(),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.a).toBeInstanceOf(M.SchemaTypes.ZodgooseString);
  });

  it.each([
    // Basic types
    { zodType: "number", schema: z.number(), type: "Number" },
    { zodType: "string", schema: z.string(), type: "String" },
    { zodType: "date", schema: z.date(), type: "Date" },
    { zodType: "boolean", schema: z.boolean(), type: "Boolean" },
    // Literals
    { zodType: "string literal", schema: z.literal("hi"), type: "String" },
    { zodType: "number literal", schema: z.literal(42), type: "Number" },
    { zodType: "boolean literal", schema: z.literal(false), type: "Boolean" },
    // Enum
    { zodType: "zod enum", schema: z.enum(["a", "b", "c"]), type: "String" },
    { zodType: "string native enum", schema: z.nativeEnum(TestStringEnum), type: "String" },
    { zodType: "numeric native enum", schema: z.nativeEnum(TestNumericEnum), type: "Number" },
    // Brand
    { zodType: "branded string", schema: z.string().brand(), type: "String" },
    // Optional/nullable
    { zodType: "nullable string", schema: z.string().nullable(), type: "String" },
    { zodType: "optional string", schema: z.string().optional(), type: "String" },
    {
      zodType: "nullable optional string",
      schema: z.string().nullable().optional(),
      type: "String",
    },
    { zodType: "nullish string", schema: z.string().nullish(), type: "String" },
    // Unions
    {
      zodType: "union of numbers",
      schema: z.union([z.number().min(5), z.number().max(1)]),
      type: "Number",
    },
    {
      zodType: "union of strings",
      schema: z.union([z.string().min(5), z.string().max(1)]),
      type: "String",
    },
    {
      zodType: "union of dates",
      schema: z.union([z.date().min(new Date(5)), z.date().min(new Date(1))]),
      type: "Date",
    },
    {
      zodType: "union of booleans",
      schema: z.union([z.boolean(), z.boolean()]),
      type: "Boolean",
    },
    // Lazy (unwraps to inner type)
    { zodType: "lazy string", schema: z.lazy(() => z.string()), type: "String" },
    { zodType: "lazy number", schema: z.lazy(() => z.number()), type: "Number" },
    // Pipe with same type (no transform) - unwraps to inner schema
    { zodType: "pipe string", schema: z.string().pipe(z.string()), type: "String" },
    { zodType: "pipe number", schema: z.number().pipe(z.number()), type: "Number" },
    // Zod 4 new types
    { zodType: "template literal", schema: z.templateLiteral([z.string(), z.literal('.')], z.string()), type: "String" },
    { zodType: "stringbool", schema: z.stringbool(), type: "Boolean" },
    { zodType: "readonly string", schema: z.string().readonly(), type: "String" },
    { zodType: "int", schema: z.int(), type: "Number" },
    { zodType: "float64", schema: z.float64(), type: "Number" },
    { zodType: "email", schema: z.email(), type: "String" },
    { zodType: "uuid", schema: z.uuid(), type: "String" },
    { zodType: "ulid", schema: z.ulid(), type: "String" },
    { zodType: "int64", schema: z.int64(), type: "Number" },
    { zodType: "uint64", schema: z.uint64(), type: "Number" },
    { zodType: "nanoid", schema: z.nanoid(), type: "String" },
  ])("Assigns `Zodgoose$type` mongoose type if zod type is $zodType", ({ schema, type }) => {
    const Schema = toMongooseSchema(z.object({ prop: schema }).mongoose());
    expect(Schema.paths.prop).toBeInstanceOf(
      (M.Schema.Types as Record<string, unknown>)[`Zodgoose${type}`],
    );
  });

  describe("Zod 4.x unwrap types", () => {
    it("ZodCatch unwraps to inner type", () => {
      const s = z.string().catch("fallback");
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.String);
    });

    it("ZodSuccess unwraps to inner type", () => {
      if (typeof z.success !== "function") return;
      const s = z.success(z.string());
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.String);
    });

    it("ZodExactOptional unwraps to inner type", () => {
      const s = (z.string() as any).exactOptional?.();
      if (!s) return;
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.String);
    });

    it("ZodPrefault unwraps to inner type", () => {
      if (typeof (z.string() as any).prefault !== "function") return;
      const s = (z.string() as any).prefault();
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.String);
    });

    it("ZodNonOptional unwraps to inner type", () => {
      const s = (z.string().optional() as any).nonoptional?.();
      if (!s) return;
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.String);
    });

    it("ZodSymbol maps to Mixed", () => {
      const s = z.symbol();
      const Schema = toMongooseSchema(z.object({ prop: s }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.Mixed);
    });
  });

  it("Assigns Mixed type for complex types", () => {
    const typesProducingMixedType = [
      z.nativeEnum(TestMixedEnum),
      z.nan(),
      z.literal(Number.NaN),
      z.null(),
      z.any(),
      z.unknown(),
      z.record(z.number()),
      z.tuple([z.string(), z.string(), z.boolean()]),
      z.union([z.string(), z.number().array()]),
      z.intersection(z.string(), z.number()),
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({ type: z.literal("b"), b: z.string() }),
      ]),
      z.set(z.string()),
      z.symbol(),
      z.xor(z.string(), z.number()),
      z.file(),
    ];

    typesProducingMixedType.forEach((zodSchema) => {
      const Schema = toMongooseSchema(z.object({ prop: zodSchema }).mongoose());
      expect(Schema.paths.prop).toBeInstanceOf(M.Schema.Types.Mixed);
    });
  });

  it("Assigns Array type for fields of ZodArray type", () => {
    const zodSchema = z
      .object({
        friends: z.number().array(),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.friends).toBeInstanceOf(M.Schema.Types.Array);
    expect((Schema.paths.friends as any).$embeddedSchemaType).not.toBeInstanceOf(
      M.Schema.Types.Array,
    );
  });

  it("Correctly handles multidimensional arrays", () => {
    const zodSchema = z
      .object({
        friendsFriends: z.number().array().array(),
        matrices: z.number().array().array().array().optional(),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.friendsFriends).toBeInstanceOf(M.Schema.Types.Array);
    expect((Schema.paths.friendsFriends as any).$embeddedSchemaType).toBeInstanceOf(
      M.Schema.Types.Array,
    );
    expect(
      (Schema.paths.friendsFriends as any).$embeddedSchemaType.$embeddedSchemaType,
    ).not.toBeInstanceOf(M.Schema.Types.Array);
    expect((Schema.paths.matrices as any).$embeddedSchemaType.$embeddedSchemaType).toBeInstanceOf(
      M.Schema.Types.Array,
    );
  });

  it("Assigns Map type for fields of ZodMap type", () => {
    const zodSchema = z
      .object({
        dict: z.map(z.number(), z.object({ a: z.number() })),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.dict).toBeInstanceOf(M.Schema.Types.Map);
  });

  it("Assigns custom built-in Buffer type when set with `zodgooseCustomType()`", () => {
    const zodSchema = z
      .object({
        data: zodgooseCustomType("Buffer"),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.data).toBeInstanceOf(M.Schema.Types.Buffer);
  });

  it("Assigns custom external Long type when set with `zodgooseCustomType()`", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mongooseLong = require("mongoose-long");
    mongooseLong(M);

    // Register the Long type so zodgooseCustomType recognizes it
    registerCustomType("Long", {
      instanceClass: (M.Types as any).Long,
      schemaType: (M.Schema.Types as any).Long,
    });

    const zodSchema = z
      .object({
        data: zodgooseCustomType("Long"),
      })
      .mongoose();

    const Schema = toMongooseSchema(zodSchema);

    expect(Schema.paths.data).toBeInstanceOf((M.Schema.Types as Record<string, unknown>).Long);
  });

  it("Throws when unsupported zod type is used", () => {
    const unsupportedZodSchemas = [
      z.enum([] as any),
      z.enum([1, "2"] as any),
      z.nativeEnum({ a: true, b: 2 } as any),
      z.literal(Number.POSITIVE_INFINITY),
      z.literal(Number.NEGATIVE_INFINITY),
      z.literal(undefined),
      z.literal(1n),
      z.literal(Symbol.for("") as any),
      z.undefined(),
      z.void(),
      z.never(),
      z.promise(z.number()),
      z.function(),
      z.preprocess(String, z.string()),
      z.string().transform((val) => val.length),
      new (z as any).ZodTransform({}),
    ];

    unsupportedZodSchemas.forEach((zodSchema) => {
      expect(() => {
        toMongooseSchema(z.object({ prop: zodSchema }).mongoose());
      }).toThrow(zodgooseError);
    });
  });

  it("Throws with 'only refinements are supported' for non-refinement ZodEffects", () => {
    // Create a fake ZodEffects with a non-refinement effect type
    const fakeZodEffects = {
      constructor: { name: "ZodEffects" },
      _zod: {
        def: {
          effect: { type: "transform" },
        },
      },
    } as any;

    expect(() => {
      toMongooseSchema(z.object({ prop: fakeZodEffects }).mongoose());
    }).toThrow(/only refinements are supported/);
  });

  it("Throws with 'ZodTransform is not supported' for standalone ZodTransform", () => {
    expect(() => {
      toMongooseSchema(
        z
          .object({ prop: new (z as any).ZodTransform({}) })
          .mongoose(),
      );
    }).toThrow(/ZodTransform is not supported/);
  });

  it("Resolves ZodLazy via getter to inner type", () => {
    const Schema = toMongooseSchema(
      z.object({ prop: z.lazy(() => z.string()) }).mongoose(),
    );
    expect(Schema.paths.prop).toBeInstanceOf(
      (M.Schema.Types as Record<string, unknown>).ZodgooseString,
    );
  });
});

describe("Discriminator support", () => {
  it("getDiscriminators returns empty array for schema with no discriminators", () => {
    const base = z.object({ name: z.string() }).mongoose();
    expect(getDiscriminators(base)).toEqual([]);
  });

  it("discriminator attaches a discriminator entry to the base schema", () => {
    const base = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: "kind" } });
    const child = z.object({ name: z.string(), age: z.number() }).mongoose();
    const result = discriminator(base, "Adult", child);
    expect(getDiscriminators(result)).toHaveLength(1);
    expect(getDiscriminators(result)[0].name).toBe("Adult");
  });

  it("discriminator chains multiple entries", () => {
    const base = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: "kind" } });
    const child1 = z.object({ name: z.string(), age: z.number() }).mongoose();
    const child2 = z.object({ name: z.string(), weight: z.number() }).mongoose();
    discriminator(base, "Adult", child1);
    discriminator(base, "Child", child2);
    const disc = getDiscriminators(base);
    expect(disc).toHaveLength(2);
    expect(disc[0].name).toBe("Adult");
    expect(disc[1].name).toBe("Child");
  });

  it("toMongooseSchema applies discriminator to the built schema", () => {
    const base = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: "kind" } });
    const child = z.object({ name: z.string(), age: z.number() }).mongoose();
    discriminator(base, "Adult", child);
    const Schema = toMongooseSchema(base);
    // Schema builds successfully with discriminator applied
    expect(Schema.paths.name).toBeDefined();
    expect(typeof Schema.discriminator).toBe("function");
  });
});
