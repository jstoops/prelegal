import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixExportSegments } from "@/scripts/fix-export-segments.mjs";

let out: string;

beforeEach(async () => {
  out = await mkdtemp(path.join(os.tmpdir(), "prelegal-export-"));
});
afterEach(() => rm(out, { recursive: true, force: true }));

async function write(relative: string, content = relative) {
  const file = path.join(out, ...relative.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** All files under `out`, as sorted "/"-separated paths. */
async function tree() {
  const entries = await readdir(out, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(out, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

describe("fixExportSegments", () => {
  it("flattens nested segment folders into the dotted names the browser requests", async () => {
    await write("app/__next.app/__PAGE__.txt", "dashboard");
    await write("app/nda/__next.app/nda/__PAGE__.txt", "nda");
    await write("_not-found/__next._not-found/__PAGE__.txt");

    expect(await fixExportSegments(out)).toBe(3);

    expect(await tree()).toEqual([
      "_not-found/__next._not-found.__PAGE__.txt",
      "app/__next.app.__PAGE__.txt",
      "app/nda/__next.app.nda.__PAGE__.txt",
    ]);
    expect(await readFile(path.join(out, "app", "nda", "__next.app.nda.__PAGE__.txt"), "utf8")).toBe(
      "nda",
    );
  });

  it("leaves a correct (Linux/macOS) export and other files untouched", async () => {
    const files = [
      "__next.__PAGE__.txt",
      "_next/static/chunks/main.js",
      "app/__next._tree.txt",
      "app/__next.app.__PAGE__.txt",
      "app/index.html",
      "index.html",
    ];
    for (const file of files) await write(file);

    expect(await fixExportSegments(out)).toBe(0);
    expect(await tree()).toEqual(files);
  });
});
