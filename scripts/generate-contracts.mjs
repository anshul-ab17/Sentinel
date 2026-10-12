import fs from "node:fs";
const schema = JSON.parse(
  fs.readFileSync(new URL("../packages/contracts/event.schema.json", import.meta.url)),
);
const tsType = (p) =>
  p.const
    ? JSON.stringify(p.const)
    : p.enum
      ? p.enum.map((x) => JSON.stringify(x)).join(" | ")
      : Array.isArray(p.type)
        ? "number | null"
        : p.type === "array"
          ? p.items.type === "string"
            ? "string[]"
            : "number[]"
          : p.type === "string"
            ? "string"
            : "number";
const rustType = (p) =>
  Array.isArray(p.type)
    ? "Option<u8>"
    : p.type === "array"
      ? p.items.type === "string"
        ? "Vec<String>"
        : "Vec<u32>"
      : p.type === "string"
        ? "String"
        : "u64";
const files = [
  [
    "packages/contracts/event.ts",
    "// Generated from event.schema.json.\nexport type CanonicalEvent = {\n" +
      Object.entries(schema.properties)
        .map(([k, v]) => `  ${k}: ${tsType(v)};`)
        .join("\n") +
      "\n  [key: string]: unknown;\n};\n",
  ],
  [
    "services/engine/src/domain.rs",
    "// Generated from packages/contracts/event.schema.json.\n#[derive(serde::Serialize, serde::Deserialize, Debug)]\npub struct CanonicalEvent {\n" +
      Object.entries(schema.properties)
        .map(([k, v]) => `    pub ${k}: ${rustType(v)},`)
        .join("\n") +
      "\n    #[serde(flatten)]\n    pub extra: std::collections::BTreeMap<String, serde_json::Value>,\n}\n",
  ],
];
for (const [path, text] of files) {
  const target = new URL("../" + path, import.meta.url);
  if (process.argv.includes("--check")) {
    if (fs.readFileSync(target, "utf8") !== text)
      throw new Error("Stale generated contract: " + path);
  } else fs.writeFileSync(target, text);
}
