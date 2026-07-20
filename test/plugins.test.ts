import { MongoMemoryServer } from "mongodb-memory-server";
import M from "mongoose";
import { z } from "zod";
import { toMongooseSchema } from "../src/index.js";
import { getSchemaPlugins, importModule } from "./shared.js";
import { setupState } from "../src/zodgoose-setup.js";

const TEST_USER = "zongoose-user";

describe("Zongoose Plugins", () => {
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
    // Reset setupState to prevent test pollution from setup.test.ts
    setupState.isSetUp = false;
    delete setupState.options;
    Object.keys(M.connection.models).forEach((modelName) => {
      delete (M.connection.models as any)[modelName];
    });
  });

  describe("mongoose-lean-virtuals", () => {
    it("auto-attaches when installed", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose());
      expect(getSchemaPlugins(Schema)).toContain(importModule("mongoose-lean-virtuals"));
    });

    it("can be disabled individually", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: { leanVirtuals: true },
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-virtuals"));
    });

    it("can be disabled via disablePlugins=true", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: true,
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-virtuals"));
    });

    it("makes virtuals available in lean queries", async () => {
      const UserModel = M.model(
        "ZogVirtualUser",
        toMongooseSchema(
          z.object({
            username: z.string(),
            displayName: z.string().optional(),
          }).mongoose({
            schemaOptions: {
              virtuals: {
                greeting: {
                  get() {
                    return `Hello, ${this.username}!`;
                  },
                },
              },
            },
          }),
        ),
      );

      await new UserModel({ username: TEST_USER }).save();
      const user = await UserModel.findOne({ username: TEST_USER }).lean();

      expect(user?.username).toBe(TEST_USER);
      expect((user as any)?.greeting).toBe(`Hello, ${TEST_USER}!`);
    });

    it("allows overriding virtuals: false in lean options", async () => {
      const UserModel = M.model(
        "ZogVirtualUserOverride",
        toMongooseSchema(
          z.object({ username: z.string() }).mongoose({
            schemaOptions: {
              virtuals: {
                welcome: {
                  get() {
                    return `Welcome, ${this.username}!`;
                  },
                },
              },
            },
          }),
        ),
      );

      await new UserModel({ username: TEST_USER }).save();
      const user = await UserModel.findOne({ username: TEST_USER }).lean({ virtuals: false });

      expect(user?.username).toBe(TEST_USER);
      expect((user as any)?.welcome).toBeUndefined();
    });
  });

  describe("mongoose-lean-defaults", () => {
    it("auto-attaches when installed", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose());
      expect(getSchemaPlugins(Schema)).toContain(
        (importModule("mongoose-lean-defaults") as { default?: unknown })?.default,
      );
    });

    it("can be disabled individually", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: { leanDefaults: true },
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-defaults"));
    });

    it("can be disabled via disablePlugins=true", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: true,
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-defaults"));
    });

    it("applies defaults in lean queries", async () => {
      const ProfileModel = M.model(
        "ZogDefaultProfile",
        toMongooseSchema(
          z.object({
            username: z.string(),
            isActive: z.boolean().default(true),
            role: z.string().default("member"),
          }).mongoose({ schemaOptions: { collection: "zog_defaults" } }),
        ),
      );

      await new ProfileModel({ username: TEST_USER }).save();
      const profile = await ProfileModel.findOne({ username: TEST_USER }).lean();

      expect(profile?.username).toBe(TEST_USER);
      expect(profile?.isActive).toBe(true);
      expect(profile?.role).toBe("member");
    });

    it("allows disabling defaults in lean options", async () => {
      const ProfileModel = M.model(
        "ZogNoDefaultProfile",
        toMongooseSchema(
          z.object({
            username: z.string(),
            isActive: z.boolean().default(true),
          }).mongoose({ schemaOptions: { collection: "zog_nodefaults" } }),
        ),
      );

      await new ProfileModel({ username: TEST_USER }).save();
      // Mongoose applies defaults during save, so we must $unset to properly
      // test that defaults: false prevents applying schema defaults to missing fields
      await ProfileModel.updateOne(
        { username: TEST_USER },
        { $unset: { isActive: "" } },
      );

      // With defaults: false, missing fields should remain undefined
      const profileNoDefaults = await ProfileModel.findOne({ username: TEST_USER }).lean({
        defaults: false,
      });
      expect(profileNoDefaults?.username).toBe(TEST_USER);
      expect(profileNoDefaults?.isActive).toBeUndefined();

      // With defaults: true (or no option), schema defaults should be applied
      const profileWithDefaults = await ProfileModel.findOne({ username: TEST_USER }).lean({
        defaults: true,
      });
      expect(profileWithDefaults?.username).toBe(TEST_USER);
      expect(profileWithDefaults?.isActive).toBe(true);
    });
  });

  describe("mongoose-lean-getters", () => {
    it("auto-attaches when installed", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose());
      expect(getSchemaPlugins(Schema)).toContain(importModule("mongoose-lean-getters"));
    });

    it("can be disabled individually", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: { leanGetters: true },
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-getters"));
    });

    it("can be disabled via disablePlugins=true", () => {
      const Schema = toMongooseSchema(z.object({}).mongoose(), {
        disablePlugins: true,
      });
      expect(getSchemaPlugins(Schema)).not.toContain(importModule("mongoose-lean-getters"));
    });

    it("applies getters in lean queries", async () => {
      const ArticleModel = M.model(
        "ZogArticle",
        toMongooseSchema(
          z.object({ title: z.string() }).mongoose({
            typeOptions: {
              title: {
                get(value: string) {
                  return value.toUpperCase();
                },
              },
            },
          }),
        ),
      );

      await new ArticleModel({ title: "zongoose introduction" }).save();
      const article = await ArticleModel.findOne({ title: /zongoose/i }).lean();

      expect(article?.title).toBe("ZONGOOSE INTRODUCTION");
    });

    it("allows disabling getters in lean options", async () => {
      const ArticleModel = M.model(
        "ZogNoGetterArticle",
        toMongooseSchema(
          z.object({ title: z.string() }).mongoose({
            typeOptions: {
              title: {
                get(value: string) {
                  return value.toUpperCase();
                },
              },
            },
          }),
        ),
      );

      await new ArticleModel({ title: "test title" }).save();
      const article = await ArticleModel.findOne({ title: /test/i }).lean({ getters: false });

      expect(article?.title).toBe("test title");
    });
  });

  describe("Version Key Behavior", () => {
    it("hides __v by default in lean queries", async () => {
      const ItemModel = M.model(
        "ZogItem",
        toMongooseSchema(z.object({ name: z.string() }).mongoose()),
      );

      await new ItemModel({ name: "test-item" }).save();
      const item = await ItemModel.findOne({ name: "test-item" }).lean();

      expect((item as any)?.__v).toBeUndefined();
    });

    it("allows enabling versionKey in lean options", async () => {
      const ItemModel = M.model(
        "ZogVersionedItem",
        toMongooseSchema(z.object({ name: z.string() }).mongoose()),
      );

      await new ItemModel({ name: "versioned-item" }).save();
      const item = await ItemModel.findOne({ name: "versioned-item" }).lean({ versionKey: true });

      expect((item as any)?.__v).toBe(0);
    });
  });
});
