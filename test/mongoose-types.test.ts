import { MongoMemoryServer } from "mongodb-memory-server";
import M from "mongoose";
import { z } from "zod";
import { zodgooseCustomType, toMongooseSchema } from "../src/index.js";

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
});
