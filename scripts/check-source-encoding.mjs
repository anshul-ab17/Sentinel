import fs from "node:fs";
let count = 0;
function check(path) {
  for (const file of fs.readdirSync(path, { withFileTypes: true })) {
    if (["node_modules", ".next", "generated", "target"].includes(file.name)) continue;
    const name = path + "/" + file.name;
    if (file.isDirectory()) check(name);
    else if (/\.(ts|tsx|rs|mjs|json)$/.test(name)) {
      new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(name));
      count++;
    }
  }
}
for (const root of ["apps", "packages", "services", "scripts", "tests"]) check(root);

console.log(`Valid UTF-8: ${count} source files`);
