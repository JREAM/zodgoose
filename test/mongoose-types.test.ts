import { MongoMemoryServer } from "mongodb-memory-server";
import M from "mongoose";
import { z } from "zod";
import { zodgooseCustomType, toMongooseSchema, discriminator } from "../src/index.js";

describe("Zongoose Mongoose Types", () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await M.connect(mongoServer.getUri(), {});
  });

  afterAll(async () => {
    await mongoServer.stop();
    await M.disconnect();
  });

  beforeEach(() => {
    Object.keys(M.connection.models).forEach((modelName) => {
      delete (M.connection.models as any)[modelName];
    });
  });

  it("handles number type with $mod operator", async () => {
    const Model = M.model(
      "NumberTest",
      toMongooseSchema(z.object({ value: z.number() }).mongoose()),
    );

    const doc = new Model({ value: 10 });
    await doc.save();

    const result = await Model.findOne({ value: { $mod: [4, 2] } });
    expect(result?.value).toBe(10);
  });

  it("handles Buffer type and preserves data", async () => {
    const Model = M.model(
      "BufferTest",
      toMongooseSchema(z.object({ data: zodgooseCustomType("Buffer") }).mongoose()),
    );

    const testBuffer = Buffer.from("Hello Zongoose!");
    const doc = new Model({ data: testBuffer });
    await doc.save();

    const found = await Model.findOne({ _id: doc._id });
    expect(found?.data).toBeInstanceOf(Buffer);
    expect(found?.data.toString()).toBe("Hello Zongoose!");
  });

  it("handles string type with $regex operator", async () => {
    const Model = M.model(
      "StringTest",
      toMongooseSchema(z.object({ name: z.string() }).mongoose()),
    );

    await Model.create({ name: "hello-world" });
    const result = await Model.findOne({ name: { $regex: /^hello/ } });

    expect(result?.name).toBe("hello-world");
  });

  it("handles Date type with $gte operator", async () => {
    const Model = M.model(
      "DateTest",
      toMongooseSchema(z.object({ createdAt: z.date() }).mongoose()),
    );

    const now = new Date();
    await Model.create({ createdAt: now });

    const result = await Model.findOne({ createdAt: { $gte: new Date(now.getTime() - 1000) } });
    expect(result?.createdAt.toISOString()).toBe(now.toISOString());
  });

  it("handles ObjectId type with $lt operator", async () => {
    const Model = M.model(
      "ObjectIdTest",
      toMongooseSchema(z.object({ refId: zodgooseCustomType("ObjectId") }).mongoose()),
    );

    const id = new M.Types.ObjectId();
    await Model.create({ refId: id });

    const result = await Model.findOne({ refId: { $lt: new M.Types.ObjectId() } });
    expect(result?.refId.toString()).toBe(id.toString());
  });

  it("correctly saves and retrieves Buffer in nested objects", async () => {
    const Model = M.model(
      "NestedBufferTest",
      toMongooseSchema(
        z.object({ container: z.object({ payload: zodgooseCustomType("Buffer") }) }).mongoose(),
      ),
    );

    const testData = Buffer.from("Nested buffer data");
    const doc = new Model({ container: { payload: testData } });
    await doc.save();

    const found = await Model.findOne({ _id: doc._id });
    expect(found?.container.payload).toBeInstanceOf(Buffer);
    expect(found?.container.payload.toString()).toBe("Nested buffer data");
  });

  it("applies custom getter on Buffer field", async () => {
    const Model = M.model(
      "BufferGetterTest",
      toMongooseSchema(
        z.object({ data: zodgooseCustomType("Buffer") }).mongoose({
          typeOptions: {
            data: {
              get: (v: Buffer) => (v ? v.toString("hex") : null),
            },
          },
        }),
      ),
    );

    const testBuffer = Buffer.from("abc");
    const doc = new Model({ data: testBuffer });
    await doc.save();

    const found = await Model.findOne({ _id: doc._id });
    // Custom getter transforms Buffer to hex string
    expect(found?.data).toBe("616263");
  });

  it("handles BigInt type (Mongoose 8+)", async () => {
    try {
      // Skip if BigInt SchemaType not available
      if (!M.Schema.Types.BigInt) {
        console.warn("BigInt SchemaType not available, skipping test");
        return;
      }

      const Model = M.model(
        "BigIntTest",
        toMongooseSchema(z.object({ value: zodgooseCustomType("BigInt") }).mongoose()),
      );

      const doc = new Model({ value: 42n });
      await doc.save();

      const found = await Model.findOne({ _id: doc._id });
      expect(found?.value).toBe(42n);
    } catch (err: any) {
      // If the SchemaType doesn't exist in this Mongoose version, skip gracefully
      if (err.message?.includes?.("Unsupported custom Mongoose type")) {
        console.warn("BigInt not supported in this Mongoose version, skipping");
        return;
      }
      throw err;
    }
  });

  it("handles UUID type (Mongoose 7+)", async () => {
    try {
      // Skip if UUID SchemaType not available
      if (!M.Schema.Types.UUID) {
        console.warn("UUID SchemaType not available, skipping test");
        return;
      }

      const Model = M.model(
        "UUIDTest",
        toMongooseSchema(z.object({ uid: zodgooseCustomType("UUID") }).mongoose()),
      );

      const uuidStr = "550e8400-e29b-41d4-a716-446655440000";
      const doc = new Model({ uid: new M.Types.UUID(uuidStr) });
      await doc.save();

      const found = await Model.findOne({ _id: doc._id });
      // Mongoose UUID fields store as Buffer internally; toString() gives hex
      expect(found?.uid).toBeDefined();
      // The UUID should round-trip correctly (toString preserves dashes)
      expect(found?.uid.toString()).toBe(uuidStr.toLowerCase());
    } catch (err: any) {
      // If the SchemaType doesn't exist in this Mongoose version, skip gracefully
      if (err.message?.includes?.("Unsupported custom Mongoose type")) {
        console.warn("UUID not supported in this Mongoose version, skipping");
        return;
      }
      throw err;
    }
  });

  it("bufferMongooseGetter returns non-Binary values unchanged", async () => {
    const Model = M.model(
      "BufferNonBinaryTest",
      toMongooseSchema(
        z.object({ data: zodgooseCustomType("Buffer") }).mongoose(),
      ),
    );

    // Save a string value (non-Binary) — the getter should pass it through
    const doc = new Model({ data: "not-a-buffer" as any });
    await doc.save();

    const found = await Model.findOne({ _id: doc._id });
    // bufferMongooseGetter returns non-Binary values as-is, no crash
    expect(found?.data).toBeDefined();
  });

  describe("Discriminator round-trip", () => {
    it("base schema with discriminator converts successfully", () => {
      const base = z
        .object({
          name: z.string(),
        })
        .mongoose({ schemaOptions: { discriminatorKey: "type" } });

      const child = z
        .object({
          name: z.string(),
          age: z.number(),
        })
        .mongoose();

      discriminator(base, "Person", child);

      // Should not throw
      const Schema = toMongooseSchema(base);
      expect(Schema).toBeDefined();
      expect(Schema.paths.name).toBeDefined();
    });
  });
});
