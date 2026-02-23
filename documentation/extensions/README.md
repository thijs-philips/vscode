# VS Code Extension API Documentation

This documentation covers both the **standard VS Code extension API** and the **custom extension points** we have added to the editor.

## Documentation Structure

### Reference

Standard extension API documentation, adapted from the official VS Code documentation.

- [Extension API Guide](./reference/extension-api-guide.md) — How to build extensions using existing APIs: contribution points, runtime APIs, activation events, and common patterns.
- [Contribution Points Catalog](./reference/contribution-points-catalog.md) — Complete catalog of every `contributes.*` entry in `package.json`, organized by category with schema locations and required/optional fields.

### Learnings & Guidelines

What we learned while adding new APIs and extension points to VS Code core.

- [Learnings & Guidelines](./guidelines.md) — Architecture essentials, implementation patterns, testing strategies, and pitfalls to avoid when extending VS Code's extension system.

### Feature Documentation

One folder per custom extension point we have added. Each contains three documents:

1. **vs-code-changes.md** — Which files were changed/created in VS Code core and why
2. **extension-api-description.md** — The proposed API surface in the style of the official docs
3. **sample-usage.md** — A working extension demonstrating the feature

| Feature | Description | Proposed API |
|---------|-------------|--------------|
| [Pulldown Menu API](./features/pulldown-menu/) | Programmatic access to read and modify VS Code menus at runtime | `menuAccess` |
| [Toolbar Strip](./features/toolbar-strip/) | A global toolbar row below the title bar, populated via `contributes.menus` | `contribGlobalToolbar` |
