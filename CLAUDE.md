# Treck

Find the way through your code.

## Development

- `npm run dev` — watch mode
- `npm run build` — build
- `npm test` — run tests
- `npm run format` — format with biome
- This repo uses pnpm — do not commit `package-lock.json`

## Changesets

Every PR must include a changeset. Run `npx changeset` before committing.

- Default to `patch` for all changes
- If you believe a change warrants a `minor` or `major` bump (new features, breaking changes), pause and suggest it to the user — do not select minor/major without explicit approval

## Code style

- Don't re-export types from wrapper files — update imports to point to the source directly, unless there's a good reason not to
- All functions, classes, and exported constants must have a TSDoc (`/** ... */`) comment
  - First line: concise summary of what it does
  - Body (optional): explain behavior, side effects, or non-obvious details
  - Use `@param name - description` for parameters (with dash syntax)
  - Use `@returns` and `@throws` when the return value or error behavior isn't obvious from the signature
  - Keep it brief — don't restate what's clear from the name and types
