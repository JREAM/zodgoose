import { z } from "zod";
import { addMongooseToZodPrototype, addMongooseTypeOptionsToZodPrototype } from "./zodgoose-prototype.js";

addMongooseToZodPrototype(z);
addMongooseTypeOptionsToZodPrototype(z);

export { zodgooseError } from "./zodgoose-error.js";
export {
  addMongooseTypeOptions,
  MongooseSchemaOptionsSymbol,
  MongooseTypeOptionsSymbol,
  toZodgooseSchema,
  z,
  Zodgoose,
} from "./zodgoose-prototype.js";
export { bufferMongooseGetter, genTimestampsSchema } from "./mongoose-types.js";
export type {
  DisableablePlugins,
  ZodgooseSetupOptions,
  ToZodgooseSchemaOptions,
  ZodUnknownKeysHandling,
} from "./zodgoose-options.js";
export { setup } from "./zodgoose-setup.js";
export { toMongooseSchema } from "./build-mongoose-schema.js";
export { zodgooseCustomType } from "./zod-walkers.js";
