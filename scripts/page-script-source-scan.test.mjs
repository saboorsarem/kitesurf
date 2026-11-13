// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const transpiled = ts.transpileModule(
  readFileSync(new URL("../packages/page-script/src/source-scan.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const moduleExports = {};
runInNewContext(transpiled, { exports: moduleExports, require: () => ({}) });
const { sourceDoctypeOf } = moduleExports;

// Results carry the VM realm's prototypes, which strict deepEqual rejects, so copy them here.
const doctypeOf = (html) => {
  const found = sourceDoctypeOf(html);
  return found && { ...found };
};

test("finds the leading doctype after whitespace and comments", () => {
  assert.deepEqual(doctypeOf("<!doctype html>"), {
    markup: "<!DOCTYPE html>",
    end: 15,
  });
  assert.deepEqual(doctypeOf('  <!-- a -->\n<!DOCTYPE html PUBLIC "x">'), {
    markup: '<!DOCTYPE html PUBLIC "x">',
    end: 39,
  });
});

test("a comment body may contain an earlier -->", () => {
  // A lazy comment body would run past the first -->.
  assert.equal(doctypeOf("<!-- a --> x --><!doctype html>")?.markup, "<!DOCTYPE html>");
  assert.equal(
    doctypeOf("<!-- a --> x --><!-- b --><!doctype html>")?.markup,
    "<!DOCTYPE html>",
  );
});

test("rejects a prolog that is not whitespace and comments", () => {
  assert.equal(doctypeOf("<html>"), null);
  assert.equal(doctypeOf("x <!doctype html>"), null);
  assert.equal(doctypeOf("<!doctypes>"), null);
});

test("a long comment prolog stays linear", () => {
  const html = "<!-- build step -->\n".repeat(20_000) + "<html>";
  const start = Date.now();

  assert.equal(doctypeOf(html), null);
  assert.ok(Date.now() - start < 250, "the prolog scan must not backtrack exponentially");
});

test("many doctype candidates in one prolog stay linear", () => {
  // A long whitespace run before many candidates: rescanning it per candidate is quadratic.
  const html = " ".repeat(16_000) + "x" + "<!doctype>".repeat(16_000);
  const start = Date.now();

  assert.equal(doctypeOf(html), null);
  assert.ok(Date.now() - start < 250, "the prolog scan must not rescan the leading whitespace");
});
