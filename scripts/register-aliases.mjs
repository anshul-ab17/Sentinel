import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Reuse the exact tsconfig paths for native Node TypeScript execution (Node 24+).
const root = new URL("../", import.meta.url);
const {
  compilerOptions: { paths },
} = JSON.parse(readFileSync(new URL("tsconfig.json", root), "utf8"));
registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [alias, [target]] of Object.entries(paths)) {
      const prefix = alias.replace(/\*$/, "");
      if (!specifier.startsWith(prefix)) continue;
      const relative = target.replace(/\*$/, "") + specifier.slice(prefix.length);
      const url = new URL(relative, root);
      for (const suffix of ["", ".ts", ".mjs", "/index.ts"]) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
      throw new Error(`Cannot resolve alias: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
});
