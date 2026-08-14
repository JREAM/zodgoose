import { MongoMemoryServer } from "mongodb-memory-server";
import type { Model as ModelType } from "mongoose";
import M from "mongoose";
import { z } from "zod";
import { zodgooseCustomType, toMongooseSchema } from "../src/index.js";

describe("Document-level validation", () => {
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

  const buildModel = <const T extends z.ZodObject<any>>(
    zodSchema: T,
    options?: Parameters<typeof toMongooseSchema>[1],
  ): ModelType<any> =>
    M.model("DocValidation", toMongooseSchema(zodSchema.mongoose(), options));

  it("throws when a root .refine() is violated on save", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
    );

    await expect(new Model({ a: "same", b: "same" }).save()).rejects.toBeInstanceOf(
      M.Error.ValidationError,
    );
  });

  it("persists when a root .refine() is satisfied on save", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
    );

    const doc = await new Model({ a: "one", b: "two" }).save();
    expect(doc.a).toBe("one");
  });

  it("throws when a root .superRefine() is violated on save", async () => {
    const Model = buildModel(
      z
        .object({ a: z.string().min(2), b: z.string().min(2) })
        .superRefine((o, ctx) => {
          if (o.a === o.b) ctx.addIssue({ code: "custom", message: "a and b must differ" });
        }),
    );

    await expect(new Model({ a: "same", b: "same" }).save()).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("does not enforce root refinements when skipDocumentValidation is true", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
      { skipDocumentValidation: true },
    );

    const doc = await new Model({ a: "same", b: "same" }).save();
    expect(doc.a).toBe("same");
  });

  it("does not enforce a root .refine() on update, even with runValidators", async () => {
    // Document-level refinements only fire on full-document operations
    // (save/create/insertMany). During an update, Mongoose validates against a
    // reconstructed document that does not yet reflect the $set values, so the
    // root refinement can't see them. This matches @nullix/zod-mongoose: root
    // .refine()/.superRefine() is a full-document concern; per-path validators
    // (which DO see the new value) remain your tool for updates.
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== "banned"),
    );

    const existing = await Model.create({ a: "one", b: "two" });

    // The update itself succeeds because the document-level refine runs
    // against the pre-update document (the $set value isn't applied when the
    // document hook fires).
    const result = await Model.updateOne(
      { _id: existing._id },
      { $set: { a: "banned" } },
      { runValidators: true },
    ).exec();
    expect(result.modifiedCount).toBe(1);
  });

  it("runs per-path validators on updates with runValidators", async () => {
    const Model = buildModel(z.object({ a: z.string().min(2) }));

    const existing = await Model.create({ a: "okay" });

    await expect(
      Model.updateOne({ _id: existing._id }, { $set: { a: "x" } }, { runValidators: true }).exec(),
    ).rejects.toBeInstanceOf(M.Error.ValidationError);
  });

  it("throws a clear message on save when refine fails", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
    );

    try {
      await new Model({ a: "same", b: "same" }).save();
      throw new Error("expected save to reject");
    } catch (e) {
      const ve = e as M.Error.ValidationError;
      expect(ve).toBeInstanceOf(M.Error.ValidationError);
    }
  });

  it("throws at schema-build time when a field uses z.transform()", () => {
    // transforms change the field's runtime type, which zodgoose cannot map to
    // a stable Mongoose type, so it is rejected up front rather than silently
    // mis-validated. This is a hard error, not a warning, so you won't discover
    // it at runtime.
    const zodSchema = z
      .object({ a: z.string().transform((value) => value.length) })
      .mongoose();

    expect(() => toMongooseSchema(zodSchema)).toThrow(/ZodPipe type is not supported/);
  });

  it("binds `this` to the document in the document-level hook", async () => {
    // On full-document operations the hook runs with `this` as the Mongoose
    // document, so refinements (or per-path validators) that rely on `this`
    // are fine here. During update operations Mongoose still passes a
    // document to the hook, but as shown above the update values aren't
    // applied yet.
    let seenThis: unknown = null;
    const zodSchema = z.object({ a: z.string().min(2) }).mongoose();
    const hook = toMongooseSchema(zodSchema);
    hook.post("validate", function () {
      seenThis = this;
    });

    const Model = M.model("ThisContext", hook);
    await new Model({ a: "ok" }).save();
    expect(seenThis).toBeInstanceOf(M.Document);
  });

  it("enforces a root .refine() on Model.create()", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
    );

    await expect(Model.create({ a: "same", b: "same" })).rejects.toBeInstanceOf(
      M.Error.ValidationError,
    );
  });

  it("enforces a root .refine() on insertMany()", async () => {
    const Model = buildModel(
      z.object({ a: z.string().min(2), b: z.string().min(2) }).refine((o) => o.a !== o.b),
    );

    await expect(
      Model.insertMany([{ a: "same", b: "same" }]),
    ).rejects.toBeInstanceOf(M.Error.ValidationError);
  });

  it("surfaces the Zod refine message in the emitted ValidationError", async () => {
    const Model = buildModel(
      z
        .object({ a: z.string(), b: z.string() })
        .superRefine((doc, ctx) => {
          if (doc.a === doc.b) {
            ctx.addIssue({ code: "custom", message: "must differ" });
          }
        }),
    );

    try {
      await new Model({ a: "same", b: "same" }).save();
      throw new Error("expected save to reject");
    } catch (e) {
      const ve = e as M.Error.ValidationError;
      expect(ve.errors._root).toBeDefined();
      expect(ve.errors._root.message).toContain("must differ");
    }
  });

  it("strips Mongoose-internal keys so .strict() roots still save", async () => {
    // toObject() injects `_id`, `__v`, and `id`; a .strict() root rejects
    // unknown keys, so the document hook must drop the injected keys that the
    // user did not declare.
    const Model = buildModel(z.object({ a: z.string() }).strict());

    const doc = await Model.create({ a: "ok" });
    expect(doc.a).toBe("ok");
  });

  it("keeps an explicitly declared _id field in the document parse", async () => {
    const Model = buildModel(z.object({ _id: z.string(), a: z.string() }).strict());

    const doc = await Model.create({ _id: "custom-id", a: "ok" });
    expect(doc._id).toBe("custom-id");
  });

  it("maps field-level Zod issues to their real path (not just _root)", async () => {
    // A superRefine that flags a specific nested path produces an error on that
    // path, while a document-level issue still lands on `_root`.
    const Model = buildModel(
      z
        .object({ a: z.string() })
        .superRefine((doc, ctx) => {
          ctx.addIssue({ code: "custom", path: ["a"], message: "bad a" });
        }),
    );

    try {
      await new Model({ a: "x" }).save();
      throw new Error("expected save to reject");
    } catch (e) {
      const ve = e as M.Error.ValidationError;
      expect(ve.errors.a).toBeDefined();
      expect(ve.errors.a.message).toContain("bad a");
      expect(ve.errors._root).toBeUndefined();
    }
  });

  it("merges multiple root refine issues into one _root error", async () => {
    const Model = buildModel(
      z
        .object({ a: z.string(), b: z.string() })
        .superRefine((doc, ctx) => {
          if (doc.a === "x") ctx.addIssue({ code: "custom", message: "a is x" });
          if (doc.b === "x") ctx.addIssue({ code: "custom", message: "b is x" });
        }),
    );

    try {
      await new Model({ a: "x", b: "x" }).save();
      throw new Error("expected save to reject");
    } catch (e) {
      const ve = e as M.Error.ValidationError;
      expect(ve.errors._root).toBeDefined();
      // both messages joined
      expect(ve.errors._root.message).toContain("a is x");
      expect(ve.errors._root.message).toContain("b is x");
    }
  });

  it("enforces a refine on a nested sub-schema", async () => {
    const inner = z
      .object({ x: z.number(), y: z.number() })
      .refine((o) => o.x !== o.y, "x must differ from y")
      .mongoose();
    const Model = buildModel(z.object({ inner: inner }));

    await expect(
      Model.create({ inner: { x: 1, y: 1 } }),
    ).rejects.toBeInstanceOf(M.Error.ValidationError);

    const ok = await Model.create({ inner: { x: 1, y: 2 } });
    expect(ok.inner.x).toBe(1);
  });

  it("rejects insertMany when one of several documents violates a refine", async () => {
    const Model = buildModel(
      z.object({ a: z.string(), b: z.string() }).refine((o) => o.a !== o.b),
    );

    await expect(
      Model.insertMany([
        { a: "same", b: "same" },
        { a: "p", b: "q" },
      ]),
    ).rejects.toBeInstanceOf(M.Error.ValidationError);
  });

  it("validateSync() does not fire document-level refinements (async-only hook)", () => {
    // The document hook is registered on `post('validate')`, which Mongoose
    // only runs during async validation ($validate/save). `validateSync()` is
    // a separate synchronous code path that runs per-path validators but not
    // post('validate') middlewares, so a root refine violation is NOT caught
    // by it. This documents the (intentional) async-only behavior.
    const Model = buildModel(
      z.object({ a: z.string(), b: z.string() }).refine((o) => o.a !== o.b),
    );

    const doc = new Model({ a: "same", b: "same" });
    const syncError = doc.validateSync();
    expect(syncError).toBeUndefined();
  });

  it("insertMany with validate:false still runs validators (matches vanilla Mongoose)", async () => {
    // Verified against mongoose internals: insertMany calls doc.$validate()
    // unconditionally, so both per-path and document-level validators run even
    // with `validate: false`. Vanilla path validators behave the same way, so
    // zodgoose is consistent with Mongoose — `validate: false` only skips the
    // sync pre-check in bulk-write construction.
    const Model = buildModel(
      z.object({ a: z.string(), b: z.string() }).refine((o) => o.a !== o.b),
    );

    await expect(
      Model.insertMany([{ a: "same", b: "same" }], { validate: false }),
    ).rejects.toBeInstanceOf(M.Error.ValidationError);
  });

  it("does not double-fire: document hook throws a ValidationError, not a ZodError", async () => {
    const Model = buildModel(
      z.object({ a: z.string(), b: z.string() }).refine((o) => o.a !== o.b),
    );

    try {
      await new Model({ a: "x", b: "x" }).save();
      throw new Error("expected save to reject");
    } catch (e) {
      // must be a Mongoose ValidationError, not a raw ZodError
      expect(e).toBeInstanceOf(M.Error.ValidationError);
      expect(e).not.toBeInstanceOf((z as any).ZodError);
    }
  });

  it("coerces Buffer fields back to Buffer so root refine sees them", async () => {
    // `doc.toObject()` returns a MongoDB Binary for Buffer fields; the
    // document hook must convert it back so `z.instanceof(Buffer)` and a root
    // refine that checks the buffer still work.
    const Model = buildModel(
      z
        .object({ data: zodgooseCustomType("Buffer") })
        .refine((o) => o.data instanceof Buffer, "data must be a Buffer"),
    );

    const doc = await Model.create({ data: Buffer.from("hello") });
    expect(doc.data).toBeInstanceOf(Buffer);
  });
});
