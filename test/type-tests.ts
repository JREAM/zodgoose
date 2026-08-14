/**
 * Static type-level regression tests for issues #2 and #3.
 *
 * These are NOT executed at runtime (bun strips types); they exist to be
 * verified with `tsc --noEmit`. Run:
 *   bunx tsc --noEmit --project tsconfig.json test/type-tests.ts
 *
 * They assert that:
 *  - `.mongoose()` is available on a ZodObject (issue #3: "Property 'mongoose'
 *    does not exist ...").
 *  - `.merge(genTimestampsSchema(...))` keeps typed field names (issue #2: the
 *    broken `{ [x: string]: unknown }` / corrupted output).
 *  - `z.infer<typeof userSchema>` yields the expected field types.
 */
import { z, genTimestampsSchema, toMongooseSchema } from "../src/index.js";

const userSchema = z
  .object({
    name: z.string().min(1),
    email: z.email(),
  })
  .merge(genTimestampsSchema("createdAt", "updatedAt"))
  .mongoose({
    schemaOptions: { collection: "users" },
    typeOptions: {
      email: { unique: true, index: true },
      name: { required: true },
    },
  });

// .mongoose() must exist and return a Zodgoose accepted by toMongooseSchema.
const schema = toMongooseSchema(userSchema);

// z.infer must produce the typed fields, not an index-signature/unknown.
type UserType = z.infer<typeof userSchema>;

const assertString = (value: string): void => {
  value satisfies string;
};

// name/email are string-ish; createdAt/updatedAt are optional Dates.
const user: UserType = {
  name: "Alice",
  email: z.email().parse("alice@example.com"),
  createdAt: new Date(),
  updatedAt: new Date(),
};
assertString(user.name);
assertString(user.email);

// `_root`-style field access must not be `unknown`.
const n: string = user.name;

void schema;
void n;
