import M, { Schema as MongooseSchema, type SchemaOptions, type SchemaTypeOptions } from "mongoose";
import type { ZodSchema } from "zod";
import z from "zod";
import { zodgooseError } from "./zodgoose-error.js";
import { MongooseSchemaOptionsSymbol, isZodgoose, type Zodgoose } from "./zodgoose-prototype.js";
import { applyDiscriminators } from "./zodgoose-discriminator.js";
import {
  type MongooseSchemaTypeParameters,
  ZodgooseBoolean,
  ZodgooseDate,
  ZodgooseNumber,
  ZodgooseString,
  bufferMongooseGetter,
  registerCustomMongooseZodTypes,
} from "./mongoose-types.js";
import type {
  DisableablePlugins,
  ToZodgooseSchemaOptions,
  ZodUnknownKeysHandling,
} from "./zodgoose-options.js";
import { setupState } from "./zodgoose-setup.js";
import { tryImportModule } from "./zodgoose-utils.js";
import {
  type SchemaFeatures,
  isZodType,
  unwrapZodSchema,
  zodInstanceofOriginalClasses,
} from "./zod-walkers.js";

const { Mixed: MongooseMixed } = M.Schema.Types;

registerCustomMongooseZodTypes();

const mlvPlugin = tryImportModule("mongoose-lean-virtuals", import.meta);
const mldPlugin = tryImportModule("mongoose-lean-defaults", import.meta);
const mlgPlugin = tryImportModule("mongoose-lean-getters", import.meta);

// eslint-disable-next-line @typescript-eslint/ban-types
const getFixedOptionFn = (fn: Function) =>
  function (this: unknown, ...args: unknown[]): unknown {
    const thisFixed = this && this instanceof M.Document ? this : undefined;
    return fn.apply(thisFixed, args);
  };

const getStrictOptionValue = (
  unknownKeys: ZodUnknownKeysHandling | undefined,
  schemaFeatures: SchemaFeatures,
): boolean | "throw" => {
  const isStrictThrow =
    unknownKeys == null || unknownKeys === "throw" || schemaFeatures.unknownKeys === "strict";
  const isStrictFalse =
    unknownKeys === "strip-unless-overridden" && schemaFeatures.unknownKeys === "passthrough";
  return isStrictThrow ? "throw" : !isStrictFalse;
};

const addMongooseSchemaFields = (
  zodSchema: z.ZodSchema,
  monSchema: MongooseSchema,
  context: {
    unknownKeys?: ZodUnknownKeysHandling;
    fieldsStack?: string[];
    monSchemaOptions?: SchemaOptions;
    monTypeOptions?: SchemaTypeOptions<any>;
    typeKey?: string;
    visitedLazy?: WeakSet<object>;
  },
): void => {
  const {
    fieldsStack = [],
    monSchemaOptions,
    monTypeOptions: monTypeOptionsFromSchema,
    unknownKeys,
  } = context;

  const addToField = fieldsStack.at(-1);
  const fieldPath = fieldsStack.join(".");
  const isRoot = addToField == null;

  const throwError = (message: string, noPath?: boolean): never => {
    throw new zodgooseError(`${noPath ? "" : `Path \`${fieldPath}\`: `}${message}`);
  };

  let { schema: zodSchemaFinal, features: schemaFeatures } = unwrapZodSchema(zodSchema);

  // Handle ZodPipe (Zod 4.x validators/transformers) by unwrapping early
  while (isZodType(zodSchemaFinal, "ZodPipe")) {
    const pipeDef = zodSchemaFinal._zod.def as unknown as Record<string, unknown>;
    const pipeOut = pipeDef["out"] as Record<string, unknown> | undefined;
    if (pipeOut?.["def"] && (pipeOut["def"] as Record<string, unknown>)["type"] === "transform") {
      // Transforms change the type - not supported, but we still break to let the error be caught
      break;
    }
    if (Object.prototype.hasOwnProperty.call(pipeDef, "in")) {
      const { schema: pipeInnerSchema, features: pipeFeatures } = unwrapZodSchema(pipeDef["in"] as ZodSchema);
      Object.assign(schemaFeatures, pipeFeatures);
      zodSchemaFinal = pipeInnerSchema;
    } else {
      break;
    }
  }
  // Handle ZodCodec (Zod 4.x codec types like z.stringbool()) by unwrapping to output type
  if (isZodType(zodSchemaFinal, "ZodCodec")) {
    const codecDef = zodSchemaFinal._zod.def as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(codecDef, "out")) {
      const { schema: codecOutSchema, features: codecFeatures } = unwrapZodSchema(codecDef["out"] as ZodSchema);
      Object.assign(schemaFeatures, codecFeatures);
      zodSchemaFinal = codecOutSchema;
    }
  }
  // Handle standalone ZodTransform (separate class in Zod 4, not wrapped in ZodPipe)
  if (isZodType(zodSchemaFinal, "ZodTransform")) {
    throwError("ZodTransform is not supported");
  }

  const monMetadata = schemaFeatures.mongoose || {};

  const {
    mongooseTypeOptions: monTypeOptionsFromField,
    mongooseSchemaOptions: monSchemaOptionsFromField,
    unionSchemaType,
  } = schemaFeatures;
  const monTypeOptions = { ...monTypeOptionsFromField, ...monTypeOptionsFromSchema };

  const { isOptional, isNullable } = schemaFeatures;
  const isRequired = !isOptional;
  const isFieldArray = "array" in schemaFeatures;

  const mzOptions = [
    ["validate", monTypeOptions["mzValidate"]],
    ["required", monTypeOptions["mzRequired"]],
  ] as const;
  mzOptions.forEach(([origName]) => {
    const mzName = `mz${origName[0]?.toUpperCase()}${origName.slice(1)}`;
    const zgName = `zodgoose${origName[0]?.toUpperCase()}${origName.slice(1)}`;
    if (zgName in monTypeOptions) {
      if (origName in monTypeOptions) {
        throwError(`Can't have both "${zgName}" and "${origName}" set`);
      }
      monTypeOptions[origName] = monTypeOptions[zgName];
      delete monTypeOptions[zgName];
    }
    if (mzName in monTypeOptions) {
      if (origName in monTypeOptions) {
        throwError(`Can't have both "${mzName}" and "${origName}" set`);
      }
      monTypeOptions[origName] = monTypeOptions[mzName];
      delete monTypeOptions[mzName];
    }
  });

  const commonFieldOptions: SchemaTypeOptions<any> = {
    required: isRequired,
    ...("default" in schemaFeatures
      ? { default: schemaFeatures.default }
      : isFieldArray || isZodType(zodSchemaFinal, "ZodObject")
        ? { default: undefined }
        : {}),
    ...(isFieldArray && { castNonArrays: false }),
    ...monTypeOptions,
  };

  const [[, mzValidate], [, mzRequired]] = mzOptions;

  if (mzValidate != null) {
    let mzv = mzValidate;
    if (typeof mzv === "function") {
      mzv = getFixedOptionFn(mzv);
    } else if (!Array.isArray(mzv) && typeof mzv === "object" && !(mzv instanceof RegExp)) {
      mzv.validator = getFixedOptionFn(mzv.validator);
    } else if (Array.isArray(mzv) && !(mzv[0] instanceof RegExp && typeof mzv[1] === "string")) {
      const [firstElem, secondElem] = mzv;
      if (typeof firstElem === "function" && typeof secondElem === "string") {
        commonFieldOptions["mzValidate"] = [getFixedOptionFn(firstElem), secondElem];
      }
    }
    commonFieldOptions.validate = mzv;
  }
  if (mzRequired != null) {
    let mzr = mzRequired;
    if (typeof mzr === "function") {
      mzr = getFixedOptionFn(mzr);
    } else if (Array.isArray(mzr) && typeof mzr[0] === "function") {
      const [probablyFn] = mzr;
      if (typeof probablyFn === "function") {
        mzr[0] = getFixedOptionFn(probablyFn);
      }
    }
    commonFieldOptions.required = mzr;
  }

  if (isRequired) {
    if (commonFieldOptions.required !== true) {
      throwError("Can't have `required` set to anything but true if `.optional()` not used");
    }
  } else if (commonFieldOptions.required === true) {
    throwError("Can't have `required` set to true and `.optional()` used");
  }

  if (isNullable && !isRoot) {
    const origRequired = commonFieldOptions.required;
    commonFieldOptions.required = function () {
      return this[addToField] === null
        ? false
        : typeof origRequired === "function"
          ? origRequired.call(this)
          : isRequired;
    };
  }

  let mongooseFieldDef: unknown;
  let errMsgAddendum = "";

  const typeKey = (isRoot ? monSchemaOptions?.typeKey : context.typeKey) ?? "type";
  if (isZodType(zodSchemaFinal, "ZodObject")) {
    const relevantSchema = isRoot
      ? monSchema
      : new MongooseSchema(
          {},
          {
            strict: getStrictOptionValue(unknownKeys, schemaFeatures),
            ...monSchemaOptionsFromField,
            typeKey,
            ...((monMetadata as Record<string, unknown>)["schemaOptions"] as Record<string, unknown> | undefined),
          },
        );
    for (const [key, S] of Object.entries(zodSchemaFinal._zod.def.shape) as [string, ZodSchema][]) {
      const monTypeOptionsForField = (monMetadata as Record<string, unknown>)["typeOptions"] as Record<string, unknown> | undefined;
      const nextMonTypeOptions = monTypeOptionsForField?.[key] as SchemaTypeOptions<any> | undefined;
      const nextTypeKey = ((monMetadata as Record<string, unknown>)["schemaOptions"] as Record<string, unknown> | undefined)?.["typeKey"] as string | undefined ?? typeKey;
      addMongooseSchemaFields(S, relevantSchema, {
        ...context,
        fieldsStack: [...fieldsStack, key],
        ...(nextMonTypeOptions !== undefined ? { monTypeOptions: nextMonTypeOptions } : {}),
        typeKey: nextTypeKey,
      });
    }
    if (isRoot) {
      return;
    }
    if (!("_id" in commonFieldOptions)) {
      commonFieldOptions._id = false;
    }
    mongooseFieldDef = relevantSchema;
  } else if (isZodType(zodSchemaFinal, "ZodNumber") || unionSchemaType === "ZodNumber") {
    mongooseFieldDef = ZodgooseNumber;
  } else if (isZodType(zodSchemaFinal, "ZodString") || unionSchemaType === "ZodString") {
    mongooseFieldDef = ZodgooseString;
  } else if (isZodType(zodSchemaFinal, "ZodDate") || unionSchemaType === "ZodDate") {
    mongooseFieldDef = ZodgooseDate;
  } else if (isZodType(zodSchemaFinal, "ZodBoolean") || unionSchemaType === "ZodBoolean") {
    mongooseFieldDef = ZodgooseBoolean;
  } else if (isZodType(zodSchemaFinal, "ZodTemplateLiteral")) {
    // Template literals produce strings
    mongooseFieldDef = ZodgooseString;
  } else if (isZodType(zodSchemaFinal, "ZodNumberFormat")) {
    // Number format types (z.int(), z.float64(), etc.) are numbers with constraints
    mongooseFieldDef = ZodgooseNumber;
  } else if (
    isZodType(zodSchemaFinal, "ZodEmail") ||
    isZodType(zodSchemaFinal, "ZodUUID") ||
    isZodType(zodSchemaFinal, "ZodULID")
  ) {
    // String format types (z.email(), z.uuid(), z.ulid(), etc.) are strings
    mongooseFieldDef = ZodgooseString;
  } else if (
    (zodSchemaFinal as object).constructor.name === "ZodStringFormat" ||
    (zodSchemaFinal as object).constructor.name === "ZodNanoID" ||
    (zodSchemaFinal as object).constructor.name === "ZodCUID" ||
    (zodSchemaFinal as object).constructor.name === "ZodCUID2" ||
    (zodSchemaFinal as object).constructor.name === "ZodXID" ||
    (zodSchemaFinal as object).constructor.name === "ZodKSUID" ||
    (zodSchemaFinal as object).constructor.name === "ZodURL" ||
    (zodSchemaFinal as object).constructor.name === "ZodEmoji" ||
    (zodSchemaFinal as object).constructor.name === "ZodIPv4" ||
    (zodSchemaFinal as object).constructor.name === "ZodMAC" ||
    (zodSchemaFinal as object).constructor.name === "ZodIPv6" ||
    (zodSchemaFinal as object).constructor.name === "ZodCIDRv4" ||
    (zodSchemaFinal as object).constructor.name === "ZodCIDRv6" ||
    (zodSchemaFinal as object).constructor.name === "ZodBase64" ||
    (zodSchemaFinal as object).constructor.name === "ZodBase64URL" ||
    (zodSchemaFinal as object).constructor.name === "ZodE164" ||
    (zodSchemaFinal as object).constructor.name === "ZodJWT" ||
    (zodSchemaFinal as object).constructor.name === "ZodISODateTime" ||
    (zodSchemaFinal as object).constructor.name === "ZodISODate" ||
    (zodSchemaFinal as object).constructor.name === "ZodISOTime" ||
    (zodSchemaFinal as object).constructor.name === "ZodISODuration" ||
    (zodSchemaFinal as object).constructor.name === "ZodGUID"
  ) {
    // Catch-all for string format subtypes not covered by isZodType
    mongooseFieldDef = ZodgooseString;
  } else if (isZodType(zodSchemaFinal, "ZodLiteral")) {
    const literalValue = (zodSchemaFinal as any)._zod.def.values?.[0];
    const literalJsType = typeof literalValue;
    switch (literalJsType) {
      case "boolean": {
        mongooseFieldDef = ZodgooseBoolean;
        break;
      }
      case "number": {
        mongooseFieldDef = Number.isNaN(literalValue)
          ? MongooseMixed
          : Number.isFinite(literalValue)
            ? ZodgooseNumber
            : undefined;
        break;
      }
      case "string": {
        mongooseFieldDef = ZodgooseString;
        break;
      }
      case "object": {
        if (!literalValue) {
          mongooseFieldDef = MongooseMixed;
        }
        errMsgAddendum = "object literals are not supported";
        break;
      }
      default: {
        errMsgAddendum = "only boolean, number, string or null literals are supported";
      }
    }
  } else if (isZodType(zodSchemaFinal, "ZodEnum")) {
    const entries = (zodSchemaFinal as any)._zod.def.entries ?? {};
    // Filter out reverse mappings for TypeScript numeric enums
    // e.g., enum E { A = 1 } produces { '1': 'A', A: 1 } - we only want 'A': 1
    const enumKeys = Object.keys(entries).filter((k) => isNaN(Number(k)));
    const enumValues = enumKeys.map((k) => entries[k as keyof typeof entries]);
    const valuesJsTypes = [...new Set(enumValues.map((v) => typeof v))];
    if (valuesJsTypes.length === 1 && valuesJsTypes[0] === "string") {
      mongooseFieldDef = ZodgooseString;
    } else if (valuesJsTypes.length === 1 && valuesJsTypes[0] === "number") {
      mongooseFieldDef = ZodgooseNumber;
    } else if (
      valuesJsTypes.length === 2 &&
      (["string", "number"] as const).every((t) => valuesJsTypes.includes(t))
    ) {
      mongooseFieldDef = MongooseMixed;
    } else {
      errMsgAddendum = "only nonempty enums with string or number values are supported";
    }
  } else if (isZodType(zodSchema, "ZodNaN") || isZodType(zodSchema, "ZodNull")) {
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodBigInt") || isZodType(zodSchemaFinal, "ZodBigIntFormat")) {
    const instanceOfClass = zodInstanceofOriginalClasses.get(zodSchemaFinal);
    mongooseFieldDef = instanceOfClass || ZodgooseNumber;
  } else if (isZodType(zodSchemaFinal, "ZodMap")) {
    mongooseFieldDef = Map;
  } else if (isZodType(zodSchemaFinal, "ZodAny") || isZodType(zodSchemaFinal, "ZodCustom")) {
    const instanceOfClass = zodInstanceofOriginalClasses.get(zodSchemaFinal);
    mongooseFieldDef = instanceOfClass || MongooseMixed;
    if (instanceOfClass === M.Schema.Types.Buffer && !("get" in commonFieldOptions)) {
      commonFieldOptions.get = bufferMongooseGetter;
    }
  } else if (isZodType(zodSchemaFinal, "ZodEffects")) {
    if ((zodSchemaFinal as any)._zod.def.effect?.type !== "refinement") {
      errMsgAddendum = "only refinements are supported";
    }
  } else if (isZodType(zodSchemaFinal, "ZodSet")) {
    // ZodSet has no direct Mongoose equivalent; map to Mixed
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodLazy")) {
    const lazyGetter = (zodSchemaFinal as any)._zod.def.getter as (() => ZodSchema) | undefined;
    if (lazyGetter) {
      if (context.visitedLazy?.has(zodSchemaFinal as object)) {
        mongooseFieldDef = MongooseMixed;
      } else {
        const visited = context.visitedLazy ?? new WeakSet<object>();
        visited.add(zodSchemaFinal as object);
        const innerSchema = lazyGetter();
        addMongooseSchemaFields(innerSchema, monSchema, { ...context, visitedLazy: visited });
        return;
      }
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodCatch")) {
    const inner = (zodSchemaFinal as any)._zod.def.innerType ?? (zodSchemaFinal as any)._zod.def.inner ?? (zodSchemaFinal as any).innerType ?? (zodSchemaFinal as any).inner;
    if (inner) {
      addMongooseSchemaFields(inner, monSchema, context);
      return;
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodSuccess")) {
    const inner = (zodSchemaFinal as any)._zod.def.innerType ?? (zodSchemaFinal as any)._zod.def.inner ?? (zodSchemaFinal as any).innerType ?? (zodSchemaFinal as any).inner;
    if (inner) {
      addMongooseSchemaFields(inner, monSchema, context);
      return;
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodExactOptional")) {
    const inner = (zodSchemaFinal as any)._zod.def.innerType ?? (zodSchemaFinal as any)._zod.def.inner ?? (zodSchemaFinal as any).innerType ?? (zodSchemaFinal as any).inner;
    if (inner) {
      addMongooseSchemaFields(inner, monSchema, context);
      return;
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodPrefault")) {
    const inner = (zodSchemaFinal as any)._zod.def.innerType ?? (zodSchemaFinal as any)._zod.def.inner ?? (zodSchemaFinal as any).innerType ?? (zodSchemaFinal as any).inner;
    if (inner) {
      addMongooseSchemaFields(inner, monSchema, context);
      return;
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodNonOptional")) {
    const inner = (zodSchemaFinal as any)._zod.def.innerType ?? (zodSchemaFinal as any).innerType ?? (zodSchemaFinal as any)._zod.def.inner ?? (zodSchemaFinal as any).inner ?? (zodSchemaFinal as any).unwrap?.();
    if (inner) {
      addMongooseSchemaFields(inner, monSchema, context);
      return;
    }
    mongooseFieldDef = MongooseMixed;
  } else if (isZodType(zodSchemaFinal, "ZodSymbol")) {
    mongooseFieldDef = MongooseMixed;
  } else if (
    isZodType(zodSchemaFinal, "ZodUnknown") ||
    isZodType(zodSchemaFinal, "ZodRecord") ||
    isZodType(zodSchemaFinal, "ZodUnion") ||
    isZodType(zodSchemaFinal, "ZodTuple") ||
    isZodType(zodSchemaFinal, "ZodDiscriminatedUnion") ||
    isZodType(zodSchemaFinal, "ZodIntersection") ||
    isZodType(zodSchemaFinal, "ZodTypeAny") ||
    isZodType(zodSchemaFinal, "ZodType")
  ) {
    mongooseFieldDef = MongooseMixed;
  }

  if (isRoot) {
    throw new zodgooseError("You must provide object schema at root level");
  }

  if (mongooseFieldDef == null) {
    const typeName = zodSchemaFinal.constructor.name;
    throwError(`${typeName} type is not supported${errMsgAddendum ? ` (${errMsgAddendum})` : ""}`);
  }

  if (schemaFeatures.array) {
    for (let i = 0; i < schemaFeatures.array.wrapInArrayTimes; i++) {
      mongooseFieldDef = [mongooseFieldDef];
    }
  }

  monSchema.add({
    [addToField]: {
      ...commonFieldOptions,
      [typeKey]: mongooseFieldDef,
    },
  });

  monSchema.paths[addToField]?.validate(function (value: unknown) {
    let schemaToValidate: ZodSchema = schemaFeatures.array?.originalArraySchema || zodSchemaFinal;

    if (isZodType(schemaToValidate, "ZodObject")) {
      schemaToValidate = z.preprocess((obj) => {
        if (!obj || typeof obj !== "object") {
          return obj;
        }
        let objMaybeCopy = obj as Record<string, unknown>;
        for (const [k, v] of Object.entries(objMaybeCopy)) {
          if (v instanceof M.mongo.Binary) {
            if (objMaybeCopy === obj) {
              objMaybeCopy = { ...obj };
            }
            objMaybeCopy[k] = v.buffer;
          }
        }
        return objMaybeCopy;
      }, schemaToValidate);
    }

    if (isNullable) {
      schemaToValidate = z.nullable(schemaToValidate);
    }

    const valueToParse =
      value &&
      typeof value === "object" &&
      "toObject" in value &&
      typeof value.toObject === "function"
        ? value.toObject()
        : value;

    // Handle MongooseBuffer.toObject() which returns Binary, not { type: 'Buffer', data }
    // Also handle plain Binary instances from MongoDB
    let valueForParse = valueToParse;
    if (valueForParse instanceof M.mongo.Binary) {
      valueForParse = Buffer.from(valueForParse.buffer);
    } else if (
      valueForParse &&
      typeof valueForParse === "object" &&
      valueForParse["type"] === "Buffer" &&
      "data" in valueForParse
    ) {
      const data = (valueForParse as { type: string; data: Uint8Array }).data;
      valueForParse = Buffer.from(data);
    }

    schemaToValidate.parse(valueForParse);

    return true;
  });
};
const isPluginDisabled = (name: keyof DisableablePlugins, option?: DisableablePlugins | true): boolean =>
  option != null && (option === true || (option[name] ?? false));

const ALL_PLUGINS_DISABLED: Record<keyof DisableablePlugins, true> = {
  leanDefaults: true,
  leanGetters: true,
  leanVirtuals: true,
};

export const toMongooseSchema = <Schema extends Zodgoose<any, any>>(
  rootZodSchema: Schema,
  options: ToZodgooseSchemaOptions = {},
): MongooseSchema => {
  if (!isZodgoose(rootZodSchema as any)) {
    throw new zodgooseError("Root schema must be an instance of Zodgoose");
  }

  const globalOptions = setupState.options?.defaultToMongooseSchemaOptions || {};
  const optionsFinal: ToZodgooseSchemaOptions = {
    ...globalOptions,
    ...options,
    disablePlugins: {
      ...(globalOptions.disablePlugins === true
        ? { ...ALL_PLUGINS_DISABLED }
        : globalOptions.disablePlugins),
      ...(options.disablePlugins === true ? { ...ALL_PLUGINS_DISABLED } : options.disablePlugins),
    },
  };

  const { disablePlugins: dp, unknownKeys } = optionsFinal;

  const rootAny = rootZodSchema as any;
  const metadata = rootAny._zod.def;
  const schemaOptionsFromField = metadata.innerType._zod.def?.[MongooseSchemaOptionsSymbol];
  const { schemaOptions } = metadata.mongoose;

  const addMLVPlugin = mlvPlugin && !isPluginDisabled("leanVirtuals", dp);
  const addMLDPlugin = mldPlugin && !isPluginDisabled("leanDefaults", dp);
  const addMLGPlugin = mlgPlugin && !isPluginDisabled("leanGetters", dp);

  const schema = new MongooseSchema<
    z.infer<Schema>,
    any,
    MongooseSchemaTypeParameters<Schema, "InstanceMethods">,
    MongooseSchemaTypeParameters<Schema, "QueryHelpers">,
    Partial<MongooseSchemaTypeParameters<Schema, "TVirtuals">>,
    MongooseSchemaTypeParameters<Schema, "TStaticMethods">
  >(
    {},
    {
      id: false,
      minimize: false,
      strict: getStrictOptionValue(unknownKeys, unwrapZodSchema(rootAny).features),
      ...schemaOptionsFromField,
      ...schemaOptions,
      query: {
        lean(leanOptions?: Record<string, unknown> | boolean) {
          return M.Query.prototype.lean.call(
            this,
            typeof leanOptions === "object" || leanOptions == null
              ? {
                  ...(addMLVPlugin && { virtuals: true }),
                  ...(addMLDPlugin && { defaults: true }),
                  ...(addMLGPlugin && { getters: true }),
                  versionKey: false,
                  ...leanOptions,
                }
              : leanOptions,
          );
        },
        ...schemaOptions?.query,
      },
    },
  );

  addMongooseSchemaFields(rootAny, schema, { monSchemaOptions: schemaOptions, unknownKeys, visitedLazy: new WeakSet() } as any);

  addMLVPlugin && schema.plugin(mlvPlugin!.module as Parameters<typeof schema.plugin>[0]);
  addMLDPlugin &&
    schema.plugin(
      (mldPlugin!.module as { default?: Parameters<typeof schema.plugin>[0] })?.default ??
        (mldPlugin!.module as Parameters<typeof schema.plugin>[0]),
    );
  addMLGPlugin && schema.plugin(mlgPlugin!.module as Parameters<typeof schema.plugin>[0]);

  // Apply discriminators after building the base schema
  applyDiscriminators(rootAny as Zodgoose<any, any>, schema, toMongooseSchema);

  return schema;
};
