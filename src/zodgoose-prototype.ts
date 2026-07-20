/* eslint-disable @typescript-eslint/prefer-function-type */
import type { SchemaOptions, SchemaTypeOptions } from "mongoose";
import { type ZodObject, z, core } from "zod";


export const MongooseTypeOptionsSymbol = Symbol.for("MongooseTypeOptions");
export const MongooseSchemaOptionsSymbol = Symbol.for("MongooseSchemaOptions");

export interface MongooseMetadata<
  DocType,
  TInstanceMethods extends {} = {},
  QueryHelpers extends {} = {},
  TStaticMethods extends {} = {},
  TVirtuals extends {} = {},
> {
  typeOptions?: {
    [Field in keyof DocType]?: SchemaTypeOptions<DocType[Field], DocType>;
  };
  schemaOptions?: Omit<
    SchemaOptions<any, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>,
    "castNonArrays"
  >;
}

export interface ZodgooseDef<
  ZodType extends z.ZodTypeAny,
  DocType,
  TInstanceMethods extends {} = {},
  QueryHelpers extends {} = {},
  TStaticMethods extends {} = {},
  TVirtuals extends {} = {},
> {
  innerType: ZodType;
  mongoose: MongooseMetadata<DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>;
}

function createZodgooseBase<
  ZodType extends z.ZodTypeAny,
  DocType,
  TInstanceMethods extends {} = {},
  QueryHelpers extends {} = {},
  TStaticMethods extends {} = {},
  TVirtuals extends {} = {},
>(_def: ZodgooseDef<ZodType, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>) {
  const ZodgooseType = core.$constructor(
    "Zodgoose",
    (inst: z.ZodTypeAny, instanceDef: ZodgooseDef<ZodType, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>) => {
      core.$ZodType.init(inst, instanceDef as any);
      inst._zod.def = { ...instanceDef, type: "zodgoose" } as any;
      (inst._zod as any).parse = (input: unknown) => {
        return input;
      };
    },
    { type: "zodgoose" } as any,
  );

  return ZodgooseType;
}

export const isZodgoose = (schema: object): schema is Zodgoose<any, any> => {
  return (schema as any)._zod?.def?.type === "zodgoose";
};

export type Zodgoose<
  ZodType extends z.ZodTypeAny,
  DocType,
  TInstanceMethods extends {} = {},
  QueryHelpers extends {} = {},
  TStaticMethods extends {} = {},
  TVirtuals extends {} = {},
> = ReturnType<typeof createZodgooseBase<ZodType, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>>;

export const Zodgoose = {
  create<
    ZodType extends z.ZodObject<any>,
    DocType,
    TInstanceMethods extends {} = {},
    QueryHelpers extends {} = {},
    TStaticMethods extends {} = {},
    TVirtuals extends {} = {},
  >(def: ZodgooseDef<ZodType, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>) {
    const ZodgooseType = createZodgooseBase(def);
    return new (ZodgooseType as any)(def) as Zodgoose<ZodType, DocType, TInstanceMethods, QueryHelpers, TStaticMethods, TVirtuals>;
  }
};

declare module "zod" {
  interface ZodTypeDef {
    [MongooseTypeOptionsSymbol]?: SchemaTypeOptions<any>;
    [MongooseSchemaOptionsSymbol]?: SchemaOptions;
  }

  interface ZodSchema {
    mongooseTypeOptions: <T extends ZodSchema>(
      this: T,
      options: SchemaTypeOptions<T["_output"]>,
    ) => T;
  }
}

export const toZodgooseSchema = function <
  ZO extends ZodObject<any>,
  TInstanceMethods extends {} = {},
  QueryHelpers extends {} = {},
  TStaticMethods extends {} = {},
  TVirtuals extends {} = {},
>(
  zObject: ZO,
  metadata: MongooseMetadata<
    ZO["_output"],
    TInstanceMethods,
    QueryHelpers,
    TStaticMethods,
    TVirtuals
  > = {},
) {
  return Zodgoose.create({ mongoose: metadata, innerType: zObject });
};

export const addMongooseToZodPrototype = (toZ: typeof z | null): void => {
  if (toZ === null) {
    if ((z.ZodObject.prototype as any).mongoose !== undefined) {
      delete (z.ZodObject.prototype as any).mongoose;
    }
  } else if ((toZ.ZodObject.prototype as any).mongoose === undefined) {
    (toZ.ZodObject.prototype as any).mongoose = function (metadata = {}) {
      return toZodgooseSchema(this, metadata);
    };
  }
};

export const addMongooseTypeOptions = function <T extends z.ZodSchema>(
  zObject: T,
  options: SchemaTypeOptions<T["_output"]>,
): T {
  const def = zObject._zod.def as Record<string | symbol, any>;
  def[MongooseTypeOptionsSymbol] = {
    ...def[MongooseTypeOptionsSymbol],
    ...options,
  };
  return zObject;
};

export const addMongooseTypeOptionsToZodPrototype = (toZ: typeof z | null): void => {
  if (toZ === null) {
    if ((z.ZodType.prototype as any).mongooseTypeOptions !== undefined) {
      delete (z.ZodType.prototype as any).mongooseTypeOptions;
    }
  } else if (toZ.ZodType.prototype.mongooseTypeOptions === undefined) {
    toZ.ZodType.prototype.mongooseTypeOptions = function (options: SchemaTypeOptions<any, any>) {
      return addMongooseTypeOptions(this, options);
    };
  }
};

declare module "mongoose" {
  interface MZValidateFn<T, ThisType> {
    (this: ThisType, value: T): boolean;
  }

  interface MZLegacyAsyncValidateFn<T, ThisType> {
    (this: ThisType, value: T, done: (result: boolean) => void): void;
  }

  interface MZAsyncValidateFn<T, ThisType> {
    (this: ThisType, value: T): Promise<boolean>;
  }

  interface MZValidateOpts<T, ThisType> {
    msg?: string;
    message?: string | ValidatorMessageFn;
    type?: string;
    validator:
      | MZValidateFn<T, ThisType>
      | MZLegacyAsyncValidateFn<T, ThisType>
      | MZAsyncValidateFn<T, ThisType>;
  }

  type MZSchemaValidator<T, ThisType> =
    | RegExp
    | [RegExp, string]
    | MZValidateFn<T, ThisType>
    | [MZValidateFn<T, ThisType>, string]
    | MZValidateOpts<T, ThisType>;

  interface MZRequiredFn<ThisType> {
    (this: ThisType): boolean;
  }
}

export { z } from "zod";
