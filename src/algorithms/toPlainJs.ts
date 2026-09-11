/**
 * Built-ins are TypeScript. Strips the annotations so the source runs as
 * plain JS in the custom-code editor's "start from a built-in" flow.
 *
 * This is a structural, not a semantic, stripper — it does not parse
 * TypeScript. It targets the two shapes the built-in algorithms actually
 * use:
 *
 *   1. A `(params)` group with no nested parens, immediately followed by an
 *      optional `: ReturnType` and then `=>` or `{` — i.e. an actual
 *      function/arrow signature, wherever it appears (the top-level `sort`,
 *      or a typed closure declared inside it, with any number of params in
 *      any position). Anchoring on that exact shape — not just any
 *      "identifier: word" — is what keeps this out of object literals like
 *      `{ left: null, right: null }`, which use the same syntax but are
 *      never followed by `=>`/`{`.
 *   2. `let`/`const`/`var` declarator annotations (`let root: Node | null
 *      = null`), a generic type argument on a call (`new Array<number>(10)`),
 *      and `as Type` assertions (`stack.pop() as Node`).
 *
 * Every registered algorithm is proved to survive this conversion — compiles
 * as plain JS *and* actually sorts when run through the real custom-code
 * path (`compileCustom` + `runSort`) — by `conformance.test.ts`, so any
 * future algorithm added to `impl/` is automatically checked as a
 * user-editable starting point, not just as internal code.
 */
export function toPlainJs(source: string): string {
  let out = source.replace(
    /\(([^()]*)\)(?:\s*:\s*[^{=]+?)?(\s*(?:=>|\{))/g,
    (_match, params: string, tail: string) =>
      `(${params.replace(/([A-Za-z_$][\w$]*)\s*:\s*[^,]+/g, '$1')})${tail}`,
  )
  // Generic type arguments on a call, e.g. `new Array<number>(10)`.
  out = out.replace(/\b([A-Za-z_$][\w$]*)<[^<>()]+>(?=\()/g, '$1')
  // `as Type` assertions, e.g. `stack.pop() as Node`.
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$]*(?:\s*\|\s*[A-Za-z_$][\w$]*)*/g, '')
  // `let`/`const`/`var` declarator annotations: `let root: Node | null = null`.
  out = out.replace(/\b(let|const|var)(\s+[A-Za-z_$][\w$]*)\s*:\s*[^=;]+?(?=\s*=)/g, '$1$2')
  return out
}
