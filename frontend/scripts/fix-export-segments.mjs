/**
 * Postbuild fix for a Windows-only bug in Next.js's static export (16.3.8).
 *
 * For client-side prefetching, the browser requests each route segment's data
 * as one flat file, e.g. `out/app/__next.app.__PAGE__.txt`. The exporter builds
 * that name by replacing "/" with "." in the segment path, but on Windows the
 * path has "\" separators, so it writes nested folders instead
 * (`out/app/__next.app/__PAGE__.txt`) and every prefetch 404s. See
 * `convertSegmentPathToStaticExportFilename` and `collectSegmentPaths` in
 * node_modules/next/dist/export/index.js.
 *
 * This flattens any such folders back into the dotted file names. On Linux and
 * macOS there are none, so it does nothing. Remove it once Next.js fixes this.
 */
import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEGMENT_DIR = /^__next\./;

/** Every file under `dir`, as paths relative to it. */
async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/**
 * Flattens `__next.*` segment folders under `outDir` into dotted file names.
 * Returns the number of files moved.
 */
export async function fixExportSegments(outDir) {
  let moved = 0;
  const entries = await readdir(outDir, { withFileTypes: true, recursive: true });
  const segmentDirs = entries
    .filter((entry) => entry.isDirectory() && SEGMENT_DIR.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    // Skip folders nested inside another segment folder; the outer one covers them.
    .filter((dir, _, all) => !all.some((other) => dir.startsWith(other + path.sep)));

  for (const dir of segmentDirs) {
    for (const file of await filesUnder(dir)) {
      const flatName = [path.basename(dir), ...file.split(path.sep)].join(".");
      await rename(path.join(dir, file), path.join(path.dirname(dir), flatName));
      moved++;
    }
    await rm(dir, { recursive: true });
  }
  return moved;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(process.argv[2] ?? "out");
  const moved = await fixExportSegments(outDir);
  if (moved > 0) console.log(`fix-export-segments: flattened ${moved} segment file(s) in ${outDir}`);
}
