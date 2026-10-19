import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("discovers TSX mockups, excluding private files and directories", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mockups = path.join(root, "src/components/mockups");
  const files = [
    "Landing.tsx",
    "nested/Detail.tsx",
    "_Private.tsx",
    "_private/Hidden.tsx",
    "nested/_private/Hidden.tsx",
    "nested/_Helper.tsx",
    "notes.ts",
  ];
  for (const file of files) {
    const target = path.join(mockups, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "export default function Example() { return null; }");
  }
  const plugin = mockupPreviewPlugin();
  plugin.configResolved({ root });
  await plugin.buildStart();
  const generatedPath = path.join(root, "src/.generated/mockup-components.ts");
  const generated = await readFile(generatedPath, "utf8");
  assert.match(generated, /"\.\/components\/mockups\/Landing\.tsx"/);
  assert.match(generated, /"\.\/components\/mockups\/nested\/Detail\.tsx"/);
  assert.match(generated, /import\("\.\.\/components\/mockups\/Landing\.tsx"\)/);
  assert.match(generated, /import\("\.\.\/components\/mockups\/nested\/Detail\.tsx"\)/);
  assert.equal((generated.match(/=> import\(/g) ?? []).length, 2);
  assert.doesNotMatch(generated, /Private|Hidden|Helper|notes/);

  // Subsequent scans must reflect additions and removals, not stale entries.
  await rm(path.join(mockups, "Landing.tsx"));
  await writeFile(path.join(mockups, "New.tsx"), "export default () => null;");
  await plugin.buildStart();
  const refreshed = await readFile(generatedPath, "utf8");
  assert.doesNotMatch(refreshed, /Landing/);
  assert.match(refreshed, /New\.tsx/);
  assert.match(refreshed, /nested\/Detail\.tsx/);
});

test("generates an empty module map when the mockups directory is missing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = mockupPreviewPlugin();
  plugin.configResolved({ root });
  await plugin.buildStart();
  const generated = await readFile(
    path.join(root, "src/.generated/mockup-components.ts"),
    "utf8",
  );
  assert.match(generated, /export const modules: ModuleMap = \{\n\n\};/);
});
