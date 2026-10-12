export default {
  "*.{js,mjs,ts,tsx}": ["prettier --write --ignore-unknown", "eslint --fix"],
  "*.rs": () => [
    "cargo fmt --all -- --check",
    "cargo clippy --workspace --all-targets --locked -- -D warnings",
  ],
};
