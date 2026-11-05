import { Predicate } from "effect";
import type { Schema } from "effect";

const secret = /key|secret|token|password|credential/iu;

const hidden = "••••";

const scalar = (
  value: Schema.Json
): value is string | number | boolean | null =>
  value === null ||
  Predicate.isString(value) ||
  Predicate.isNumber(value) ||
  Predicate.isBoolean(value);

const isList = (value: Schema.Json): value is Schema.JsonArray =>
  Array.isArray(value);

export const redact = (config: Schema.Json, hide = false): Schema.Json => {
  if (isList(config)) {
    return config.map((item) => redact(item, hide));
  }

  if (scalar(config)) {
    return hide && Predicate.isString(config) ? hidden : config;
  }

  return Object.fromEntries(
    Object.entries(config).map(([name, value]) => [
      name,
      redact(value, secret.test(name) && (scalar(value) || isList(value))),
    ])
  );
};
