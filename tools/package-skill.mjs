#!/usr/bin/env node
/**
 * package-skill.mjs — produce a distributable arc.skill (zip) artifact.
 *
 * Validates first (via validate-skill.mjs), then archives the skill folder
 * with the folder name as the zip root, excluding build junk. The output name
 * carries the version from the root package.json, plus a stable arc.skill alias.
 *
 * Cross-platform: the ZIP is written with Node's built-in zlib (DEFLATE) — no
 * external `zip` binary and no npm dependencies, so it runs identically on
 * Windows, macOS, and Linux.
 *
 *   node tools/package-skill.mjs [--out dist]
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_PARENT = join(ROOT, "skill");   // archive paths are relative to here -> "arc/..."
const SKILL_DIR = join(SKILL_PARENT, "arc");
const outIdx = process.argv.indexOf("--out");
const OUT_DIR = resolve(outIdx > -1 ? process.argv[outIdx + 1] : join(ROOT, "dist"));

const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules"]);
const EXCLUDE_FILE = (name) => name === ".DS_Store" || name.endsWith(".pyc");

const rel = (p) => p.replace(ROOT + sep, "").split(sep).join("/");

// --- validate (throws on failure) -----------------------------------------
execFileSync("node", [join(ROOT, "tools", "validate-skill.mjs"), SKILL_DIR], { stdio: "inherit" });

// --- collect files ---------------------------------------------------------
function walk(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    if (EXCLUDE_DIRS.has(name) || EXCLUDE_FILE(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
const files = walk(SKILL_DIR).map((full) => ({
  full,
  // archive name uses forward slashes and is rooted at "arc/"
  name: relative(SKILL_PARENT, full).split(sep).join(posix.sep),
}));

// --- minimal ZIP writer (store/deflate, no deps) ---------------------------
// crc32 is available in node:zlib on Node 18+. Fall back if a runtime lacks it.
const crc = typeof crc32 === "function"
  ? (buf) => crc32(buf) >>> 0
  : (() => {
      const table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
      return (buf) => {
        let c = 0xffffffff;
        for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
      };
    })();

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n >>> 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

// DOS time/date — fixed, deterministic (1980-01-01 00:00) for reproducible builds
const DOS_TIME = u16(0);
const DOS_DATE = u16(0x0021);

const locals = [];
const centrals = [];
let offset = 0;

for (const { full, name } of files) {
  const data = readFileSync(full);
  const checksum = crc(data);
  const deflated = deflateRawSync(data);
  const useStore = deflated.length >= data.length;     // never inflate small files
  const method = useStore ? 0 : 8;
  const payload = useStore ? data : deflated;
  const nameBuf = Buffer.from(name, "utf8");

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(method), DOS_TIME, DOS_DATE,
    u32(checksum), u32(payload.length), u32(data.length),
    u16(nameBuf.length), u16(0),
  ]);
  locals.push(localHeader, nameBuf, payload);

  centrals.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), DOS_TIME, DOS_DATE,
    u32(checksum), u32(payload.length), u32(data.length),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
    u32(0), u32(offset), nameBuf,
  ]));

  offset += localHeader.length + nameBuf.length + payload.length;
}

const centralDir = Buffer.concat(centrals);
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0),
  u16(files.length), u16(files.length),
  u32(centralDir.length), u32(offset), u16(0),
]);

const zip = Buffer.concat([...locals, centralDir, eocd]);

// --- write outputs ---------------------------------------------------------
const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `arc-${version}.skill`);
const aliasFile = join(OUT_DIR, "arc.skill");

writeFileSync(outFile, zip);
copyFileSync(outFile, aliasFile);

console.log(`packaged  ${rel(outFile)}  (${files.length} files, ${zip.length} bytes)`);
console.log(`alias     ${rel(aliasFile)}`);
