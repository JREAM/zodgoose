# Zongoose

Define Mongoose schemas with Zod. Full type safety, runtime validation, zero boilerplate.

## Install

```sh
npm install @jream/zongoose
pnpm add @jream/zongoose
yarn add @jream/zongoose
bun add @jream/zongoose
```

**Peer dependencies:** `mongoose@^7.0.0`, `zod@^3.0.0`

## Quick Start

```ts
import mongoose from 'mongoose';
import { z } from 'zod';
import { toMongooseSchema } from '@jream/zongoose';

// Define schema with Zod
const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().int().positive().optional(),
});

// Convert and create model
const UserSchema = toMongooseSchema(userSchema.mongoose());
const User = mongoose.model('User', UserSchema);

// Full type safety
const user = new User({ email: 'test@example.com', name: 'Test User' });
console.log(user.name); // Autocomplete works!
```

## Schema Options

Use `.mongoose()` for Mongoose-specific options:

```ts
const schema = z.object({
  nickname: z.string().min(1),
  avatar: z.string(), // uses mongooseZodCustomType('Buffer') for Buffer type
  friends: z.number().int().array().optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).mongoose({
  schemaOptions: {
    collection: 'users',
  },
  typeOptions: {
    nickname: { unique: true, index: true },
  },
});
```

## Special Types

```ts
import { mongooseZodCustomType, genTimestampsSchema } from '@jream/zongoose';

// Buffer, ObjectId, Decimal128, etc.
z.object({
  avatar: mongooseZodCustomType('Buffer'),
  owner: mongooseZodCustomType('ObjectId'),
}).mongoose();

// Timestamps
z.object({ name: z.string() })
  .merge(genTimestampsSchema('createdAt', 'updatedAt'))
  .mongoose();
```

## Type Inference

```ts
const userZodSchema = z.object({
  email: z.string().email(),
  name: z.string(),
}).mongoose();

type UserType = z.infer<typeof userZodSchema>;
// UserType === { email: string; name: string }

const UserSchema = toMongooseSchema(userZodSchema);
const User = mongoose.model('User', UserSchema);

// Mongoose model is fully typed
const user = new User({ email: 'test@example.com', name: 'Test' });
```

## Safety Defaults

Zongoose removes problematic Mongoose defaults:

| Issue | Mongoose | Zongoose |
|-------|----------|----------|
| Array defaults | `[]` | `undefined` |
| Root `id` virtual | Added | Not added |
| Empty object removal | Enabled | Disabled |
| Sub-schema `_id` | Added | Not added |
| Number/string casting | Enabled | Disabled |
| Extraneous fields | Silent strip | Throws error |

## Plugin Support

If installed, these plugins auto-enable on every schema:

- `mongoose-lean-virtuals`
- `mongoose-lean-defaults`
- `mongoose-lean-getters`

```ts
// .lean() automatically includes plugin options
const user = await User.findOne({ _id }).lean();
// Equivalent to:
const user = await User.findOne({ _id }).lean({
  virtuals: true,
  defaults: true,
  getters: true,
  versionKey: false,
});
```

Disable per-schema:
```ts
toMongooseSchema(schema, { disablePlugins: { leanVirtuals: true } });
```

## API

### `toMongooseSchema(zodSchema, options?)`

Converts a Zod schema to Mongoose schema.

```ts
const schema = toMongooseSchema(userZodSchema, {
  unknownKeys: 'strip', // 'throw' | 'strip' | 'strip-unless-overridden'
  disablePlugins: { leanVirtuals: true },
});
```

### `.mongoose(options?)`

Adds Mongoose options to a Zod schema.

```ts
z.object({ name: z.string() }).mongoose({
  schemaOptions: { collection: 'users' },
  typeOptions: { name: { required: true } },
});
```

### `mongooseZodCustomType(typeName)`

Use special Mongoose types.

```ts
z.object({
  avatar: mongooseZodCustomType('Buffer'),
  ref: mongooseZodCustomType('ObjectId'),
});
```

### `genTimestampsSchema(createdAt, updatedAt)`

Generate timestamp fields.

```ts
z.object({ name: z.string() })
  .merge(genTimestampsSchema('createdAt', 'updatedAt'))
  .mongoose();
```

### `mzValidate` / `mzRequired`

Type-safe alternatives to Mongoose's `validate` and `required`.

```ts
z.string().mongooseTypeOptions({
  validate: mzValidate((value) => value.length > 0),
});
```

## License

MIT
