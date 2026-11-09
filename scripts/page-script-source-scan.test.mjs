// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("../packages/page-script/src/source-scan.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const exports = {};
runInNewContext(code, { exports, require: () => ({}) });
const { sourceDoctypeOf } = exports;

test("finds the leading doctype after whitespace and comments", () => {
  // `runInNewContext` gives the result the VM realm's prototypes, which
  // `assert.deepEqual` from `node:assert/strict` rejects, so copy it here.
  assert.deepEqual(
    { ...sourceDoctypeOf("<!doctype html>") },
    {
      markup: "<!DOCTYPE html>",
      end: 15,
    },
  );
  assert.deepEqual(
    { ...sourceDoctypeOf('  <!-- a -->\n<!DOCTYPE html PUBLIC "x">') },
    {
      markup: '<!DOCTYPE html PUBLIC "x">',
      end: 39,
    },
  );
});

test("a comment body may contain an earlier -->", () => {
  // The regex this replaced let the lazy comment body run past the first -->.
  assert.equal(sourceDoctypeOf("<!-- a --> x --><!doctype html>")?.markup, "<!DOCTYPE html>");
  assert.equal(
    sourceDoctypeOf("<!-- a --> x --><!-- b --><!doctype html>")?.markup,
    "<!DOCTYPE html>",
  );
});

test("rejects a prolog that is not whitespace and comments", () => {
  assert.equal(sourceDoctypeOf("<html>"), null);
  assert.equal(sourceDoctypeOf("x <!doctype html>"), null);
  assert.equal(sourceDoctypeOf("<!doctypes>"), null);
});

test("a long comment prolog stays linear", () => {
  const html = "<!-- build step -->\n".repeat(20_000) + "<html>";
  const start = Date.now();
  assert.equal(sourceDoctypeOf(html), null);
  assert.ok(Date.now() - start < 250, "the prolog scan must not backtrack exponentially");
});

test("many doctype candidates in one prolog stay linear", () => {
  // Each candidate used to rescan the leading whitespace, which made this quadratic: 176k
  // characters took over 700 ms.
  const html = " ".repeat(16_000) + "x" + "<!doctype>".repeat(16_000);
  const start = Date.now();
  assert.equal(sourceDoctypeOf(html), null);
  assert.ok(Date.now() - start < 250, "the prolog scan must not rescan the leading whitespace");
});
