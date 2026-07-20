import { MongoMemoryServer } from "mongodb-memory-server";
import M from "mongoose";
import { z } from "zod";
import { toMongooseSchema } from "../src/index.js";

describe("Type options provided by mongoose-zod", () => {
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

  describe("zgValidate", () => {
    it("Calls validators if a validation function passed to `zgValidate`", () => {
      let validateCalled = false;
      const validate = () => {
        validateCalled = true;
        return true;
      };
      const zodSchema = z.object({ username: z.string() }).mongoose({
        typeOptions: {
          username: {
            zgValidate: validate,
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      new Model({ username: "something" }).validateSync();

      expect(validateCalled).toBe(true);
    });

    it("Calls validators if a validation function passed to `zgValidate` on a sub schema", () => {
      let validateCalled = false;
      const validate = () => {
        validateCalled = true;
        return true;
      };
      const zodSchema = z
        .object({
          user: z.object({ username: z.string() }).mongoose({
            typeOptions: {
              username: {
                zgValidate: validate,
              },
            },
          }),
        })
        .mongoose();

      const Model = M.model("test", toMongooseSchema(zodSchema));
      new Model({ user: { username: "something" } }).validateSync();

      expect(validateCalled).toBe(true);
    });

    it("Calls validators if an object with a validation function passed to `zgValidate`", () => {
      let validateCalled = false;
      const validate = () => {
        validateCalled = true;
      };
      const zodSchema = z.object({ username: z.string() }).mongoose({
        typeOptions: {
          username: {
            zgValidate: {
              message: "any",
              validator: validate,
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      new Model({ username: "something" }).validateSync();

      expect(validateCalled).toBe(true);
    });

    it("Custom validation function has access to `this` in normal conditions", () => {
      let that: any;
      const zodSchema = z.object({ username: z.string() }).mongoose({
        typeOptions: {
          username: {
            zgValidate() {
              that = this;
              return true;
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      const doc = new Model({ username: "something" });
      doc.validateSync();

      expect(that).toEqual(doc);
    });

    it("Custom validation function passed to the validation properties object has access to `this` in normal conditions", () => {
      let that: any;
      const zodSchema = z.object({ username: z.string() }).mongoose({
        typeOptions: {
          username: {
            zgValidate: {
              validator() {
                that = this;
                return true;
              },
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      const doc = new Model({ username: "something" });
      doc.validateSync();

      expect(that).toEqual(doc);
    });

    it("Custom validation function has `this` set to undefined when validating in update operation", async () => {
      let that: any = null;
      const zodSchema = z.object({ username: z.string() }).mongoose({
        typeOptions: {
          username: {
            zgValidate() {
              that = this;
              return true;
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));

      await Model.updateOne(
        {},
        { username: "any" },
        {
          upsert: true,
          runValidators: true,
        },
      );

      expect(that).toEqual(undefined);
    });

    it("Custom validation function passed to the validation properties object has `this` set to undefined when validating in update operation", async () => {
      let that: any = null;
      const zodSchema = z.object({ username: z.string().optional() }).mongoose({
        typeOptions: {
          username: {
            zgValidate: {
              validator() {
                that = this;
                return true;
              },
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));

      await Model.updateOne(
        {},
        { username: "any" },
        {
          upsert: true,
          runValidators: true,
        },
      );

      expect(that).toEqual(undefined);
    });

    it("`zgValidate` validation works", () => {
      const zodSchema = z
        .object({
          email: z.string().email().optional(),
          registered: z.boolean().default(false),
        })
        .mongoose({
          typeOptions: {
            email: {
              zgValidate(value) {
                return !this || (Boolean(this.registered) && value.endsWith("gmail.com"));
              },
            },
          },
        });

      const Model = M.model("test", toMongooseSchema(zodSchema));

      expect(new Model({}).validateSync()).not.toBeInstanceOf(M.Error.ValidationError);
      expect(new Model({ email: "test@gmail.com" }).validateSync()).toBeInstanceOf(
        M.Error.ValidationError,
      );
      expect(new Model({ email: "test@test.com", registered: true }).validateSync()).toBeInstanceOf(
        M.Error.ValidationError,
      );
      expect(
        new Model({ email: "test@gmail.com", registered: true }).validateSync(),
      ).not.toBeInstanceOf(M.Error.ValidationError);
    });
  });

  describe("zgRequired", () => {
    it("Calls a function passed to `zgRequired`", () => {
      let requiredCalled = false;
      const required = () => {
        requiredCalled = true;
        return true;
      };
      const zodSchema = z.object({ username: z.string().optional() }).mongoose({
        typeOptions: {
          username: {
            zgRequired: required,
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      new Model({ username: "something" }).validateSync();

      expect(requiredCalled).toBe(true);
    });

    it("`zgRequired` has access to `this` in normal conditions", () => {
      let that: any;
      const zodSchema = z.object({ username: z.string().optional() }).mongoose({
        typeOptions: {
          username: {
            zgRequired() {
              that = this;
              return true;
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));
      const doc = new Model({ username: "something" });
      doc.validateSync();

      expect(that).toEqual(doc);
    });

    it("`zgRequired` has `this` set to undefined when validating in update operation", async () => {
      let that: any = null;
      const zodSchema = z.object({ username: z.string().optional() }).mongoose({
        typeOptions: {
          username: {
            zgRequired() {
              that = this;
              return true;
            },
          },
        },
      });

      const Model = M.model("test", toMongooseSchema(zodSchema));

      await Model.updateOne(
        {},
        { username: "any" },
        {
          upsert: true,
          runValidators: true,
        },
      );

      expect(that).toEqual(undefined);
    });

    it("`zgRequired` validator works", () => {
      const zodSchema = z
        .object({
          username: z.string(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
        })
        .mongoose({
          typeOptions: {
            lastName: {
              zgRequired() {
                return this ? Boolean(this.firstName) : false;
              },
            },
          },
        });

      const Model = M.model("test", toMongooseSchema(zodSchema));

      expect(new Model({ username: "any" }).validateSync()).not.toBeInstanceOf(
        M.Error.ValidationError,
      );
      expect(new Model({ username: "any", firstName: "fn" }).validateSync()).toBeInstanceOf(
        M.Error.ValidationError,
      );
      expect(
        new Model({ username: "any", firstName: "fn", lastName: "ln" }).validateSync(),
      ).not.toBeInstanceOf(M.Error.ValidationError);
    });
  });
});
