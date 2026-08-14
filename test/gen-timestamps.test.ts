import { MongoMemoryServer } from "mongodb-memory-server";
import M from "mongoose";
import { z } from "zod";
import { zodgooseError, genTimestampsSchema, toMongooseSchema } from "../src/index.js";

describe("Generate timestamps schema helper", () => {
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

  it("Does not include `createdAt`/`updatedAt` fields if both arguments are set to null", () => {
    const Schema = toMongooseSchema(genTimestampsSchema(null, null).mongoose());

    expect(Schema.paths.createdAt).toBeUndefined();
    expect(Schema.paths.updatedAt).toBeUndefined();

    expect((Schema as any).options.timestamps).toEqual({
      createdAt: false,
      updatedAt: false,
    });
  });

  it("Sets provided custom names for `createdAt`/`updatedAt` fields", () => {
    const Schema = toMongooseSchema(genTimestampsSchema("cd", "ud").mongoose());

    expect(Schema.paths.createdAt).toBeUndefined();
    expect(Schema.paths.updatedAt).toBeUndefined();

    expect((Schema as any).options.timestamps).toEqual({
      createdAt: "cd",
      updatedAt: "ud",
    });
  });

  it("`createdAt` and `updatedAt` works as indended", async () => {
    const Schema = toMongooseSchema(genTimestampsSchema().mongoose());

    const Model = M.model("model", Schema);

    const doc = new Model();
    await doc.save();

    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.createdAt.getTime() / 1000).toBeCloseTo(doc.updatedAt.getTime() / 1000, 2);
  });

  it("`createdAt` and `updatedAt` works as indended (custom names)", async () => {
    const Schema = toMongooseSchema(genTimestampsSchema("cd", "ud").mongoose());

    const Model = M.model("model", Schema);

    const doc = new Model();
    await doc.save();

    expect(doc.cd).toBeInstanceOf(Date);
    expect(doc.ud).toBeInstanceOf(Date);
    expect(doc.cd.getTime() / 1000).toBeCloseTo(doc.ud.getTime() / 1000, 2);
    expect((doc as any).createdAt).toBeUndefined();
    expect((doc as any).uptdatedAt).toBeUndefined();
  });

  it("Allows to override schema options implicitly set by this helper", () => {
    const OUR_SCHEMA_OPTIONS = {
      collection: "test",
      timestamps: false,
    };
    const Schema = toMongooseSchema(
      genTimestampsSchema().mongoose({
        schemaOptions: {
          ...OUR_SCHEMA_OPTIONS,
        },
      }),
    );

    expect((Schema as any).options).toMatchObject(OUR_SCHEMA_OPTIONS);
  });

  it("Throws when the same name supplied both for `createdAt` and `updatedAt`", () => {
    let error: any;
    try {
      genTimestampsSchema("createdAt", "createdAt");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(zodgooseError);
    expect(error?.message).toEqual("`createdAt` and `updatedAt` fields must be different");
  });

  it("Does not throw after modifying a document with createdAt", async () => {
    const Schema = toMongooseSchema(
      genTimestampsSchema().extend({ username: z.string() }).mongoose(),
      { unknownKeys: "throw" },
    );

    const Model = M.model("model", Schema);

    const doc = new Model({ username: "mongo" });
    await doc.save();

    const doc2 = (await Model.findOne({ _id: doc._id }))!;
    doc2.username = "mongoose";
    await expect(doc2.save()).toBeTruthy();
  });

  it("populates the runtime shape with real timestamp fields", () => {
    expect(Object.keys(genTimestampsSchema("createdAt", "updatedAt").shape)).toEqual([
      "createdAt",
      "updatedAt",
    ]);
    expect(Object.keys(genTimestampsSchema("cd", "ud").shape)).toEqual(["cd", "ud"]);
    expect(Object.keys(genTimestampsSchema("createdAt", null).shape)).toEqual(["createdAt"]);
  });

  it("genTimestampsSchema().extend({...}) adds fields and auto-manages them", async () => {
    // The canonical merge: extend the returned schema object so the mongoose
    // `timestamps` schema option metadata survives, and the real date fields
    // are present in the resulting shape.
    const User = genTimestampsSchema().extend({ username: z.string() }).mongoose();
    const Model = M.model("TimestampsUser", toMongooseSchema(User));

    const doc = await Model.create({ username: "mongo" });

    expect(doc.username).toBe("mongo");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect((Model as any).schema.paths.createdAt).toBeDefined();
    expect((Model as any).schema.paths.updatedAt).toBeDefined();
  });

  it("extend(genTimestampsSchema().shape) yields typed, optional fields", async () => {
    // Regression for the reported broken `{ [x: string]: unknown }` shape:
    // the timestamp fields must be real, optional z.date() fields so they can
    // be merged and produce a usable type (not an index-signature fallback).
    const Timestamps = genTimestampsSchema("createdAt", "updatedAt");
    const User = z.object({ username: z.string() }).extend(Timestamps.shape).mongoose();
    const Model = M.model("TimestampsShapeUser", toMongooseSchema(User));

    const doc = await Model.create({ username: "mongo" });
    expect(doc.username).toBe("mongo");
    expect((Model as any).schema.paths.createdAt).toBeDefined();
    expect((Model as any).schema.paths.updatedAt).toBeDefined();

    // Optional: a doc with no explicit timestamps validates and saves.
    const doc2 = await Model.create({ username: "other" });
    expect(doc2.username).toBe("other");
  });
});
