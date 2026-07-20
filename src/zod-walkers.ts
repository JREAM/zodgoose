/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import M from "mongoose";
import type { ZodSchema, ZodTypeAny } from "zod";
import { z } from "zod";
import {
  isZodgoose,
  MongooseSchemaOptionsSymbol,
  MongooseTypeOptionsSymbol,
} from "./zodgoose-prototype.js";
import { type SchemaFeatures } from "./zodgoose-options.js";

export type { SchemaFeatures };

export interface ZodTypes {
  ZodAny: z.ZodAny;
  ZodArray: z.ZodArray<any>;
  ZodBigInt: z.ZodBigInt;
  ZodBoolean: z.ZodBoolean;
  ZodDate: z.ZodDate;
  ZodDefault: z.ZodDefault<any>;
  ZodEnum: z.ZodEnum<any>;
  ZodFunction: z.ZodFunction<any, any>;
  ZodIntersection: z.ZodIntersection<any, any>;
  ZodLazy: z.ZodLazy<any>;
  ZodLiteral: z.ZodLiteral<any>;
  ZodMap: z.ZodMap;
  ZodNaN: z.ZodNaN;
  ZodNull: z.ZodNull;
  ZodNullable: z.ZodNullable<any>;
  ZodNumber: z.ZodNumber;
  ZodObject: z.ZodObject<any>;
  ZodOptional: z.ZodOptional<any>;
  ZodUndefined: z.ZodUndefined;
  ZodPromise: z.ZodPromise<any>;
  ZodRecord: z.ZodRecord;
  ZodSet: z.ZodSet;
  ZodSchema: z.ZodSchema;
  ZodString: z.ZodString;
  ZodTuple: z.ZodTuple<any>;
  ZodUnion: z.ZodUnion<any>;
  ZodDiscriminatedUnion: z.ZodDiscriminatedUnion<any, any>;
  ZodUnknown: z.ZodUnknown;
  ZodVoid: z.ZodVoid;
  ZodType: z.ZodType;
  ZodTypeAny: z.ZodTypeAny;
}

export const isZodType = <TypeName extends string>(
  schema: object,
  typeName: TypeName,
): schema is TypeName extends keyof ZodTypes ? ZodTypes[TypeName] : object => {
  return schema.constructor.name === typeName;
};

export const unwrapZodSchema = (
  schema: ZodSchema,
  options: { doNotUnwrapArrays?: boolean } = {},
  _features: SchemaFeatures = {},
): { schema: ZodSchema; features: SchemaFeatures } => {
  const schemaDef = (schema._zod?.def ?? (schema as any)._def ?? {}) as Record<string | symbol, any>;
  const monTypeOptions = schemaDef[MongooseTypeOptionsSymbol];
  _features.mongooseTypeOptions ||= monTypeOptions;
  const monSchemaOptions = schemaDef[MongooseSchemaOptionsSymbol];
  _features.mongooseSchemaOptions ||= monSchemaOptions;

  if (
    isZodType(schema, "ZodNull") ||
    (isZodType(schema, "ZodLiteral") && schema._zod.def.values?.[0] === null)
  ) {
    _features.isNullable = true;
  }

  if (isZodType(schema, "ZodNullable")) {
    return unwrapZodSchema(schema._zod.def.innerType, options, {
      ..._features,
      isNullable: true,
    });
  }

  if (isZodType(schema, "ZodUnion")) {
    const unionSchemas = schema._zod.def.options as z.ZodSchema[];
    const unwrappedSchemas = unionSchemas.map((s) =>
      unwrapZodSchema(s, { doNotUnwrapArrays: true }),
    );

    _features.isNullable ||= unwrappedSchemas.some(({ features }) => features.isNullable);
    _features.isOptional ||= unwrappedSchemas.some(({ features }) => features.isOptional);

    if (!("default" in _features)) {
      const lastSchemaWithDefaultValue = unwrappedSchemas
        .filter((v) => "default" in v.features)
        .at(-1);
      if (lastSchemaWithDefaultValue) {
        _features.default = lastSchemaWithDefaultValue.features.default;
      }
    }

    const uniqueUnionSchemaTypes = [
      ...new Set(unionSchemas.map((v) => v.constructor.name as keyof ZodTypes)),
    ];
    if (uniqueUnionSchemaTypes.length === 1) {
      if (uniqueUnionSchemaTypes[0] !== undefined) _features.unionSchemaType = uniqueUnionSchemaTypes[0];
    }
  }

  if (isZodgoose(schema)) {
    const def = schema._zod.def as any;
    return unwrapZodSchema(def.innerType, options, {
      ..._features,
      mongoose: def.mongoose,
    });
  }

  if (isZodType(schema, "ZodObject")) {
    const catchall = schema._zod.def.catchall;
    const catchallType = catchall?._zod?.def?.type;
    if (catchallType === "never" || catchallType === "unknown") {
      return unwrapZodSchema(schema.strip(), options, { ..._features, unknownKeys: catchallType === "never" ? "strict" : "passthrough" });
    }
  }

  if (isZodType(schema, "ZodOptional")) {
    return unwrapZodSchema(schema.unwrap(), options, { ..._features, isOptional: true });
  }

  if (isZodType(schema, "ZodDefault")) {
    return unwrapZodSchema(
      schema._zod.def.innerType,
      options,
      "default" in _features ? _features : { ..._features, default: schema._zod.def.defaultValue },
    );
  }

  if (isZodType(schema, "ZodNullable")) {
    return unwrapZodSchema(schema.unwrap(), options, { ..._features });
  }

  if (isZodType(schema, "ZodArray") && !options.doNotUnwrapArrays) {
    const wrapInArrayTimes = Number(_features.array?.wrapInArrayTimes || 0) + 1;
    const def = schema._zod.def as any;
    const innerType = def.element ?? def.type ?? def.innerType;
    return unwrapZodSchema(innerType, options, {
      ..._features,
      array: {
        ..._features.array,
        wrapInArrayTimes,
        originalArraySchema: _features.array?.originalArraySchema || schema,
      },
    });
  }

  return { schema, features: _features };
};

export const zodInstanceofOriginalClasses = new WeakMap<ZodTypeAny, new (...args: any[]) => any>();

export const zodgooseCustomType = <T extends keyof typeof M.Types & keyof typeof M.Schema.Types>(
  typeName: T,
  params?: { message?: string },
): z.ZodType<InstanceType<T extends "Buffer" ? BufferConstructor : (typeof M.Types)[T]>> => {
  const instanceClass = typeName === "Buffer" ? Buffer : M.Types[typeName];
  const typeClass = M.Schema.Types[typeName];

  type TFixed = T extends "Buffer" ? BufferConstructor : (typeof M.Types)[T];

  const result = z.instanceof(instanceClass, params) as z.ZodType<InstanceType<TFixed>>;
  const innerSchema = (result as any)._zod?.def?.schema ?? result;
  zodInstanceofOriginalClasses.set(innerSchema, typeClass);

  return result;
};
