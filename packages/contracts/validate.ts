import Ajv from "ajv";

import schema from "./event.schema.json" with { type: "json" };

import type { CanonicalEvent } from "./event.ts";
const validator = new Ajv({ strict: true }).compile(schema);
export function validateEvent(value: unknown): asserts value is CanonicalEvent {
  if (!validator(value)) throw new Error("Canonical event violates sentinel.event.v1");
  const event = value as CanonicalEvent;
  if (BigInt(event.slot) > (1n << 64n) - 1n || BigInt(event.amount_raw) > (1n << 128n) - 1n)
    throw new Error("Canonical integer overflow");
}
