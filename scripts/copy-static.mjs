import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");
const publicDir = resolve("public");

await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
