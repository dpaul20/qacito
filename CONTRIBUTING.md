# Contributing

Thanks for contributing to QAcito.

## Development setup

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run tests: `npx playwright test`

## Pull request requirements

1. Keep changes focused and scoped.
2. Add or update tests with behavior changes.
3. Ensure build and tests pass.
4. Follow the existing architecture conventions:
   - Tool slices under `src/tools/{tool-name}/`
   - `schema.ts`, `handler.ts`, `index.ts` split
   - No MCP imports in `handler.ts`
5. Do not commit secrets, local logs, or machine-specific artifacts.

## Commit style

Use clear, imperative commit messages that describe user-visible or architectural impact.
