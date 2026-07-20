import { z as originalZ } from "zod";
import { addMongooseToZodPrototype, addMongooseTypeOptionsToZodPrototype } from "./zodgoose-prototype.js";
import type { ZodgooseSetupOptions } from "./zodgoose-options.js";

export const setupState: {
  isSetUp: boolean;
  options?: ZodgooseSetupOptions;
} = { isSetUp: false };

export const setup = (options: ZodgooseSetupOptions = {}): void => {
  if (setupState.isSetUp) {
    return;
  }
  setupState.isSetUp = true;
  setupState.options = options;

  addMongooseToZodPrototype(null);
  addMongooseTypeOptionsToZodPrototype(null);
  if (options.z !== null) {
    addMongooseToZodPrototype(options.z || originalZ);
    addMongooseTypeOptionsToZodPrototype(options.z || originalZ);
  }
};
