import type { ZodTypeAny } from "zod";

// Doesn't produce `& Partial<{}>` in resulting type if T has no keys
export type PartialLaconic<T> = {} extends T ? {} : Partial<T>;

export type ZodUnknownKeysHandling = "throw" | "strip" | "strip-unless-overridden";

export interface DisableablePlugins {
  leanVirtuals?: boolean;
  leanDefaults?: boolean;
  leanGetters?: boolean;
}

export interface ToZodgooseSchemaOptions {
  disablePlugins?: DisableablePlugins | true;
  unknownKeys?: ZodUnknownKeysHandling;
}

export interface ZodgooseSetupOptions {
  z?: typeof import("zod").z | null;
  defaultToMongooseSchemaOptions?: ToZodgooseSchemaOptions;
}

export interface SchemaFeatures {
  default?: unknown;
  isOptional?: boolean;
  isNullable?: boolean;
  unknownKeys?: "strict" | "passthrough";
  unionSchemaType?: string;
  array?: {
    wrapInArrayTimes: number;
    originalArraySchema: ZodTypeAny;
  };
  mongoose?: Record<string, unknown>;
  mongooseTypeOptions?: Record<string, unknown>;
  mongooseSchemaOptions?: Record<string, unknown>;
}
