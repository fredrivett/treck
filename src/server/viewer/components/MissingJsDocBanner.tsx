/** Subtle info card shown for trivial symbols where JSDoc isn't required. */
export function TrivialSymbolInfo() {
  return (
    <div className="rounded border border-blue-100 bg-blue-50/50 px-4 py-2.5 text-sm text-blue-700 my-3 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
      JSDoc not required — this is a trivial symbol with no logic.
    </div>
  );
}

/** Banner shown when a symbol is missing its JSDoc comment, with a collapsible agent prompt. */
export function MissingJsDocBanner() {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 my-3 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <div className="font-semibold mb-1">No JSDoc comment found</div>
      <p className="mb-2 text-amber-700 dark:text-amber-300">
        Generate JSDoc comments automatically by running:{' '}
        <code className="rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-xs">
          treck jsdoc --prompt
        </code>
      </p>
      <details className="text-xs text-amber-700 dark:text-amber-300">
        <summary className="cursor-pointer hover:text-amber-900 dark:hover:text-amber-100 font-medium">
          View agent prompt
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-amber-100/50 dark:bg-amber-900/30 p-3 text-[11px] leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
          {JSDOC_AGENT_PROMPT}
        </pre>
      </details>
    </div>
  );
}

const JSDOC_AGENT_PROMPT = `Your task is to add JSDoc comments to TypeScript source files until the project reaches 100% JSDoc coverage.

## What "symbols" means

Symbols are the TypeScript constructs that treck tracks: functions, classes, interfaces, type aliases, enums, and constants. Only **exported** symbols require a /** ... */ JSDoc comment directly above their declaration. Non-exported (file-private) symbols do not need JSDoc.

## Feedback loop

treck tells you what's missing. Run:

  npx treck jsdoc

to see current JSDoc coverage and the list of symbols still missing comments. Repeat until it reports 100%.

## Process

Work file by file, not symbol by symbol:

1. Run \`npx treck jsdoc --verbose\` to get the list of symbols missing JSDoc, grouped by file.
2. For each file in the list:
   a. Read the source file.
   b. Add a JSDoc comment above every exported symbol that is missing one. Skip non-exported symbols.
   c. If a symbol's purpose is unclear from its name, signature, and body, read its generated doc in \`_treck/\` for context on callers and callees.
   d. Do NOT change any code — only add JSDoc comments.
3. After all files are done, run the project's formatter and linter (e.g. \`npm run format\`).
4. Run \`npx treck sync\` to regenerate docs, then \`npx treck jsdoc\` to verify coverage.
5. If any symbols were missed, fix them and repeat step 4.
6. Commit with a message like: \`docs: add JSDoc comments across codebase\`

## Writing JSDoc comments

- First line: a concise summary of what the symbol does (imperative for functions, descriptive for types/constants).
- Body (optional): explain behavior, side effects, or non-obvious details. Omit if the name and signature make it clear.
- \`@param name - description\` — only for parameters whose purpose, constraints, or defaults are not obvious from their name and type. Do not repeat the type.
- \`@returns\` — only when the return value is non-obvious from the signature.
- \`@throws\` — only when the error behavior is meaningful to callers.
- \`@example\` — only when usage is non-obvious.
- Keep comments brief. Do not pad with filler. Engineers can read code — focus on WHY, not restating WHAT.
- Use inline code backticks for parameter names, types, and values in descriptions.
- Match the existing code style (check for single/double quotes, indent size, semicolons, etc.)

## Important

- Only add JSDoc comments. Do not modify function bodies, signatures, or any other code.
- If a symbol already has a JSDoc comment, skip it.
- If you're unsure what a function does, read its call graph in the treck output and the function body carefully before writing the comment.`;
