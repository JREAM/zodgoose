<div align="center">
  <img src="https://raw.githubusercontent.com/JREAM/zodgoose/refs/heads/main/assets/zodgoose.webp" alt="zodgoose" width="700">
</div>

---

**Zodgoose** — Create Mongoose Schemas with Zod
- [Mongoose](https://github.com/Automattic/mongoose) 7.x+
- [Zod](https://github.com/colinhacks/zod) 4.x+

Originally created by [Andrew Kazakov](https://github.com/andreww2012) ([mongoose-zod](https://github.com/andreww2012/mongoose-zod)). Maintained by [Jesse Boyer](https://jream.com).

---

## Install

```sh
npm install @jream/zodgoose
pnpm add @jream/zodgoose
yarn add @jream/zodgoose
bun add @jream/zodgoose
```

**Peer dependencies:** `mongoose@>=7.0.0`, `zod@>=4.0.0`

## Quick Start

```ts
import mongoose from 'mongoose';
import { z } from 'zod';
import { toMongooseSchema, zodgooseCustomType, genTimestampsSchema } from '@jream/zodgoose';

// Define a reusable address schema
const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string(),
  country: z.string().default('US'),
});

// Define the user schema with nested fields, timestamps, and custom types
const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  uid: z.string().uuid(),
  age: z.number().int().positive().optional(),
  bio: z.string().max(500).optional(),
  role: z.enum(['admin', 'user', 'moderator']).default('user'),
  address: addressSchema,
  tags: z.array(z.string()).optional(),
  avatar: zodgooseCustomType('Buffer').optional(),
  owner: zodgooseCustomType('ObjectId'),
})
  .merge(genTimestampsSchema('createdAt', 'updatedAt'))
  .mongoose({
    schemaOptions: { collection: 'users' },
    typeOptions: {
      email: { unique: true, index: true },
      name: { required: true },
    },
  });

const UserSchema = toMongooseSchema(userSchema);
const User = mongoose.model('User', UserSchema);

const user = new User({
  name: 'Alice',
  email: 'alice@example.com',
  password: 'securepass123',
  uid: '550e8400-e29b-41d4-a716-446655440000',
  address: { street: '123 Main St', city: 'Springfield', zip: '12345', country: 'US' },
  tags: ['typescript', 'mongodb'],
  owner: new mongoose.Types.ObjectId(),
});
console.log(user.name);
```

## Schema Options

Use `.mongoose()` for Mongoose-specific options like `schemaOptions` (collection, timestamps, etc.) and `typeOptions` (unique, index, required, etc.):

```ts
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
}).mongoose({
  schemaOptions: {
    collection: 'users',
    optimisticConcurrency: true,
  },
  typeOptions: {
    email: { unique: true, index: true },
    name: { required: true, zgValidate: (v: string) => v.length > 0 },
  },
});
```

## Special Types

```ts
import { zodgooseCustomType, genTimestampsSchema } from '@jream/zodgoose';

// Buffer, ObjectId, Decimal128, etc.
z.object({
  avatar: zodgooseCustomType('Buffer'),
  owner: zodgooseCustomType('ObjectId'),
}).mongoose();

// Timestamps
z.object({ name: z.string() })
  .merge(genTimestampsSchema('createdAt', 'updatedAt'))
  .mongoose();
```

## Custom Type Registry

Register custom Mongoose types for use with `zodgooseCustomType()`:

```ts
import { registerCustomType, isRegisteredCustomType, listRegisteredCustomTypes } from '@jream/zodgoose';

registerCustomType('MyType', () => mongoose.Schema.Types.Mixed);
console.log(isRegisteredCustomType('MyType')); // true
console.log(listRegisteredCustomTypes()); // ['Buffer', 'ObjectId', 'Decimal128', 'UUID', 'BigInt', 'Double', 'Int32', 'MyType']
```

## Discriminator Support

Use the `discriminator()` helper for Mongoose schema inheritance:

```ts
import { discriminator, getDiscriminators } from '@jream/zodgoose';

const base = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: 'kind' } });
const child = z.object({ name: z.string(), age: z.number() }).mongoose();

discriminator(base, 'Adult', child);

const Schema = toMongooseSchema(base);
// Schema now has the 'Adult' discriminator registered
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

const user = new User({ email: 'test@example.com', name: 'Test' });
```

## Safety Defaults

Zodgoose removes problematic Mongoose defaults:

| Issue | Mongoose | Zodgoose |
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

### `zodgooseCustomType(typeName)`

Use special Mongoose types.

```ts
z.object({
  avatar: zodgooseCustomType('Buffer'),
  ref: zodgooseCustomType('ObjectId'),
});
```

### `genTimestampsSchema(createdAt, updatedAt)`

Generate timestamp fields.

```ts
z.object({ name: z.string() })
  .merge(genTimestampsSchema('createdAt', 'updatedAt'))
  .mongoose();
```

### `zgValidate` / `zgRequired`

Type-safe alternatives to Mongoose's `validate` and `required`.

```ts
z.string().mongooseTypeOptions({
  validate: zgValidate((value) => value.length > 0),
});
```

### `discriminator(baseSchema, name, childSchema, options?)`

Attach a Mongoose discriminator to a Zodgoose schema.

```ts
const base = z.object({ name: z.string() }).mongoose({ schemaOptions: { discriminatorKey: 'kind' } });
const child = z.object({ name: z.string(), age: z.number() }).mongoose();
discriminator(base, 'Adult', child);
```

### `getDiscriminators(schema)`

Retrieve discriminator entries from a Zodgoose schema.

```ts
const discs = getDiscriminators(baseSchema);
```

### `registerCustomType(name, getter)`

Register a custom Mongoose type for use with `zodgooseCustomType()`.

```ts
registerCustomType('MyType', () => mongoose.Schema.Types.Mixed);
```

### `isRegisteredCustomType(name)`

Check if a custom type is registered.

### `listRegisteredCustomTypes()`

List all registered custom type names.

## Zod 4.x Type Support

Zodgoose supports all Zod 4.x types:

| Zod Type | Mongoose Type | Notes |
|----------|--------------|-------|
| `z.string()` | `String` | |
| `z.number()` | `Number` | |
| `z.boolean()` | `Boolean` | |
| `z.date()` | `Date` | |
| `z.object({...})` | `Schema` | Nested schemas |
| `z.array(z.string())` | `[String]` | |
| `z.enum(['a', 'b'])` | `String` enum | |
| `z.literal(x)` | Inferred type | |
| `z.union([...])` | `Mixed` | |
| `z.intersection(a, b)` | `Mixed` | |
| `z.discriminatedUnion(...)` | `Mixed` | |
| `z.record(z.number())` | `Mixed` | |
| `z.tuple([...])` | `Mixed` | |
| `z.any()` / `z.unknown()` | `Mixed` | |
| `z.nan()` / `z.null()` | `Mixed` | |
| `z.never()` | `Mixed` | |
| `z.map(z.number(), z.string())` | `Map` | |
| `z.set(z.string())` | `Mixed` | No Mongoose equivalent |
| `z.symbol()` | `Mixed` | |
| `z.xor(a, b)` | `Mixed` | |
| `z.file()` | `Mixed` | |
| `z.email()` | `String` | |
| `z.uuid()` | `String` | |
| `z.ulid()` | `String` | |
| `z.nanoid()` | `String` | |
| `z.cuid()` / `z.cuid2()` | `String` | |
| `z.url()` | `String` | |
| `z.emoji()` | `String` | |
| `z.ip()` / `z.ipv4()` / `z.ipv6()` | `String` | |
| `z.mac()` | `String` | |
| `z.cidr()` | `String` | |
| `z.base64()` / `z.base64url()` | `String` | |
| `z.e164()` | `String` | |
| `z.jwt()` | `String` | |
| `z.isoDateTime()` / `z.isoDate()` / `z.isoTime()` | `String` | |
| `z.isoDuration()` | `String` | |
| `z.guid()` | `String` | |
| `z.int()` / `z.float64()` | `Number` | |
| `z.int64()` / `z.uint64()` | `Number` | |
| `z.bigint()` | `Number` | |
| `z.stringbool()` | `String` | Codec unwrap |
| `z.string().catch(x)` | Inner type | Unwraps to string |
| `z.string().prefault()` | Inner type | Unwraps to string |
| `z.string().optional().nonOptional()` | Inner type | Unwraps to string |
| `z.readonly()` | Inner type | Unwraps |
| `z.lazy(() => ...)` | Inner type | Cycle-safe |
| `z.pipe(a, b)` | Inner type | Unwraps through pipe |
| `z.transform(...)` | Error | Not supported |
| `z.object({...}).mongoose()` | Schema | With `.mongoose()` metadata |

## License

MIT License - see [LICENSE.md](./LICENSE.md)

---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://static.jream.com/logo.svg">
  <img alt="JREAM" src="https://static.jream.com/logo-black.svg" height="40" align="center">
</picture>
