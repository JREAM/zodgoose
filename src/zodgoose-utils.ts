import { createRequire } from "node:module";

export const getValidEnumValues = (obj: unknown): unknown[] => {
  const keys = Object.keys(obj as Record<string, unknown>);
  const validKeys = keys.filter(
    (k) =>
      typeof (obj as Record<string, unknown>)[(obj as Record<string, unknown>)[k] as string] !==
      "number",
  );
  const filtered: Record<string, unknown> = {};
  for (const k of validKeys) {
    filtered[k] = (obj as Record<string, unknown>)[k];
  }
  return Object.values(filtered);
};

export const tryImportModule = (id: string, importMeta: ImportMeta): { module: unknown } | null => {
  try {
    const require = createRequire(new URL(importMeta.url));
    const modulePath = require.resolve(id);
    return { module: require(modulePath) };
  } catch {
    return null;
  }
};
