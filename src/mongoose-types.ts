import M from "mongoose";
import { z } from "zod";
import { zodgooseError } from "./zodgoose-error.js";
import { MongooseSchemaOptionsSymbol, type Zodgoose } from "./zodgoose-prototype.js";

type StringLiteral<T> = T extends string ? (string extends T ? never : T) : never;

export const genTimestampsSchema = <CrAt = "createdAt", UpAt = "updatedAt">(
  createdAtField: StringLiteral<CrAt | "createdAt"> | null = "createdAt",
  updatedAtField: StringLiteral<UpAt | "updatedAt"> | null = "updatedAt",
): z.ZodObject<any> => {
  if (createdAtField != null && updatedAtField != null && createdAtField === updatedAtField) {
    throw new zodgooseError("`createdAt` and `updatedAt` fields must be different");
  }

  const schema = z.object({
  } as {
    [_ in StringLiteral<NonNullable<CrAt | UpAt>>]: z.ZodDate;
  });
  (schema._zod.def as any)[MongooseSchemaOptionsSymbol] = {
    ...(schema._zod.def as any)[MongooseSchemaOptionsSymbol],
    timestamps: {
      createdAt: createdAtField == null ? false : createdAtField,
      updatedAt: updatedAtField == null ? false : updatedAtField,
    },
  };
  return schema;
};

export type MongooseSchemaTypeParameters<
  T,
  Parameter extends "InstanceMethods" | "QueryHelpers" | "TStaticMethods" | "TVirtuals",
> =
  T extends Zodgoose<
    any,
    any,
    infer InstanceMethods,
    infer QueryHelpers,
    infer TStaticMethods,
    infer TVirtuals
  >
    ? {
        InstanceMethods: InstanceMethods;
        QueryHelpers: QueryHelpers;
        TStaticMethods: TStaticMethods;
        TVirtuals: TVirtuals;
      }[Parameter]
    : {};

const noCastFn = (value: unknown): unknown => value;

export class ZodgooseBoolean extends M.SchemaTypes.Boolean {
  static schemaName = "ZodgooseBoolean" as "Boolean";
  cast = noCastFn;
}

export class ZodgooseDate extends M.SchemaTypes.Date {
  static schemaName = "ZodgooseDate" as "Date";
  cast = noCastFn;
}

export class ZodgooseNumber extends M.SchemaTypes.Number {
  static schemaName = "ZodgooseNumber" as "Number";
  cast = noCastFn;
}

export class ZodgooseString extends M.SchemaTypes.String {
  static schemaName = "ZodgooseString" as "String";
  cast = noCastFn;
}

export const registerCustomMongooseZodTypes = (): void => {
  Object.assign(M.Schema.Types, {
    ZodgooseBoolean,
    ZodgooseDate,
    ZodgooseNumber,
    ZodgooseString,
  });
};

export const bufferMongooseGetter = (value: unknown): unknown =>
  value instanceof M.mongo.Binary ? value.buffer : value;
