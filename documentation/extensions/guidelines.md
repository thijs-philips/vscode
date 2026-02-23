# Learnings & Guidelines for Adding Extension Points

This document captures what we learned while adding new APIs and extension points to VS Code. It distills the architecture, implementation patterns, and testing strategies into a practical reference.

For the full detailed references, see:
- [Architecture Overview (detailed)](https://code.visualstudio.com/api/advanced-topics/extension-host) — official docs on the extension host
- [Extension API Reference](https://code.visualstudio.com/api/references/vscode-api) — official runtime API reference

---

## Table of Contents

- [Architecture Essentials](#architecture-essentials)
- [The Implementation Checklist](#the-implementation-checklist)
- [Key Patterns](#key-patterns)
- [Contribution Points vs Runtime APIs](#contribution-points-vs-runtime-apis)
- [Proposed API Lifecycle](#proposed-api-lifecycle)
- [Testing Strategies](#testing-strategies)
- [Common Pitfalls](#common-pitfalls)
- [Key Source Files](#key-source-files)

---

## Architecture Essentials

### Multi-Process Model

VS Code extensions run in a **separate Extension Host process**, isolated from the UI. All communication is via **typed RPC** (remote procedure calls):

```
Extension Code  →  ExtHost* class  →  RPC  →  MainThread* class  →  Workbench Service
```

- **ExtHost\* classes** (`src/vs/workbench/api/common/extHost*.ts`): Live in the extension host process. They implement the `vscode.*` namespace that extensions import.
- **MainThread\* classes** (`src/vs/workbench/api/browser/mainThread*.ts`): Live in the main/UI process. They receive RPC calls from the ExtHost and delegate to workbench services.
- **Protocol** (`src/vs/workbench/api/common/extHost.protocol.ts`): Defines all RPC interfaces (shapes), DTOs, and proxy identifiers in one file.

### RPC Rules

1. All cross-process methods must start with `$` (e.g., `$createWidget`, `$onDidChange`)
2. All arguments must be **serializable** — no functions, class instances, or circular references
3. Use `UriComponents` (not `URI`), `IPosition` (not `Position`) for internal types
4. Use `createProxyIdentifier<Shape>()` to register each RPC pair in `MainContext` and `ExtHostContext`

### Service Layer

VS Code uses constructor-based dependency injection:

```typescript
export const IMyService = createDecorator<IMyService>('myService');

export interface IMyService {
    readonly _serviceBrand: undefined;
    doSomething(): void;
}

// Register as singleton
registerSingleton(IMyService, MyServiceImpl, InstantiationType.Delayed);
```

MainThread classes inject these services to bridge extensions to the workbench.

---

## The Implementation Checklist

Adding a new extension API typically involves **8–12 files**:

| # | File | Action |
|---|------|--------|
| 1 | `src/vscode-dts/vscode.proposed.<feature>.d.ts` | **Create**: Proposed API type definitions |
| 2 | `src/vs/platform/extensions/common/extensionsApiProposals.ts` | **Modify**: Register the proposal name |
| 3 | `src/vs/workbench/api/common/extHost.protocol.ts` | **Modify**: Add DTOs, shapes, proxy identifiers |
| 4 | `src/vs/workbench/api/common/extHost<Feature>.ts` | **Create**: ExtHost handler (extension-side) |
| 5 | `src/vs/workbench/api/browser/mainThread<Feature>.ts` | **Create**: MainThread handler (UI-side) |
| 6 | `src/vs/workbench/api/common/extHost.api.impl.ts` | **Modify**: Wire API into `vscode` namespace |
| 7 | `src/vs/workbench/api/browser/extensionHost.contribution.ts` | **Modify**: Import MainThread class |
| 8 | `src/vs/workbench/services/<area>/...` | **Create**: Backing workbench service (if needed) |
| 9 | Contribution point handler | **Create**: If extensions declare data in `package.json` |
| 10 | `src/vs/workbench/services/actions/common/menusExtensionPoint.ts` | **Modify**: If adding a new menu location |

---

## Key Patterns

### Pattern 1: Adding a Menu Location (Contribution Point Only)

The simplest kind of extension point — add a new menu location to the existing `contributes.menus` system:

1. **Define a `MenuId`** in `src/vs/platform/actions/common/actions.ts`:
   ```typescript
   static readonly MyNewMenu = new MenuId('MyNewMenu');
   ```

2. **Register in `apiMenus`** in `menusExtensionPoint.ts`:
   ```typescript
   { key: 'my/menu', id: MenuId.MyNewMenu, description: '...', proposed: 'myProposal' }
   ```

3. **Create UI that reads the menu** — use `IMenuService.createMenu(MenuId.MyNewMenu, contextKeyService)` and render actions with a `WorkbenchToolBar`.

4. **Create proposed API gate** — add `vscode.proposed.<name>.d.ts` and register in `extensionsApiProposals.ts`.

### Pattern 2: Runtime API (Factory Pattern)

Extension creates objects via API calls (e.g., status items, tree views):

```
vscode.myFeature.createWidget(options)
  → ExtHostMyFeature.createWidget() — stores locally, generates ID
    → proxy.$createWidget(id, dto) — RPC to main thread
      → MainThreadMyFeature.$createWidget() — delegates to workbench service
```

### Pattern 3: Runtime API (Provider Pattern)

Extension registers a data provider; VS Code calls it on demand:

```
vscode.languages.registerHoverProvider(selector, provider)
  → ExtHost registers with MainThread
    → MainThread calls back $provideHover when hover is needed
      → ExtHost invokes provider.provideHover()
```

### Pattern 4: Scoped Context Keys for When Clauses

If your UI needs to evaluate `when` clauses that reference **editor-scoped** context keys (like `editorLangId`), you cannot use the global `IContextKeyService`. Instead:

1. Create a **scoped context key service**: `contextKeyService.createScoped(element)`
2. **Re-parent** it to the active editor's scope when the editor changes:
   ```typescript
   const activePane = editorService.activeEditorPane;
   scopedCKS.updateParent(activePane?.scopedContextKeyService ?? contextKeyService);
   ```
3. Pass this scoped CKS to `menuService.createMenu(menuId, scopedCKS)`

This was a key lesson from the toolbar strip implementation — `editorLangId` is only set on the editor's child CKS, not the global root.

---

## Contribution Points vs Runtime APIs

Two mechanisms for extending VS Code:

| Aspect | Contribution Point | Runtime API |
|--------|-------------------|-------------|
| Declared in | `package.json` `"contributes"` | TypeScript code using `vscode.*` |
| When processed | At extension scan time (before activation) | After `activate()` is called |
| Use case | Static declarations (commands, menus, views, settings) | Dynamic behavior (providers, factories, events) |
| Implementation | `ExtensionsRegistry.registerExtensionPoint()` + schema + handler | ExtHost/MainThread RPC pair |

**You can combine both.** For example, the toolbar strip uses a contribution point (`contributes.menus` → `window/toolbar`) for static toolbar items, while the pulldown menu API uses a runtime API (`vscode.menus.addSubmenu()`) for dynamic menu manipulation.

---

## Proposed API Lifecycle

```
1. Create  vscode.proposed.<feature>.d.ts
2. Register in  extensionsApiProposals.ts
3. Guard with  checkProposedApiEnabled(extension, 'feature')
4. Extensions opt in via  "enabledApiProposals": ["feature"]  in package.json
5. Iterate and refine
6. When stable → move types to vscode.d.ts, delete proposed file, remove guards
```

### Rules for Proposed APIs

- Always include the Microsoft copyright header
- Always include an issue link (`// https://github.com/microsoft/vscode/issues/XXXXX`)
- Use `declare module 'vscode'` to augment the namespace
- Extensions using proposed APIs must declare them in `enabledApiProposals`
- Built-in extensions reference the `.d.ts` file in their `tsconfig.json`

---

## Testing Strategies

### Test Types

| Test Type | Location | Purpose | Command |
|-----------|----------|---------|---------|
| Unit (ExtHost) | `src/vs/workbench/api/test/browser/` | Test ExtHost with mock MainThread | `scripts\test.bat --grep "pattern"` |
| Unit (Service) | `src/vs/workbench/services/*/test/` | Test service logic in isolation | Same |
| Integration | `extensions/vscode-api-tests/` | Test from extension perspective | `scripts\test-integration.bat` |

### Mandatory: Disposable Leak Detection

Every test suite **must** include:

```typescript
const store = ensureNoDisposablesAreLeakedInTestSuite();
```

Track all disposables with `store.add()`. Tests fail if any are leaked.

### ExtHost Test Pattern

```typescript
const mainThreadMock = mock<MainThreadMyFeatureShape>();
const rpc = SingleProxyRPCProtocol(mainThreadMock);
const extHost = new ExtHostMyFeature(rpc);
// Test API calls, verify $method calls on mock
```

### MainThread Test Pattern

```typescript
const instantiationService = workbenchInstantiationService({}, store);
const mainThread = store.add(instantiationService.createInstance(MainThreadMyFeature, extHostContext));
// Test $method calls, verify service delegation
```

### Before Running Tests

1. Check `VS Code - Build` task output for compilation errors
2. **Never run tests with compilation errors**
3. Run `npm run valid-layers-check` for layering issues

---

## Common Pitfalls

1. **Startup crashes from undefined services**: During `initLayout()`, some services aren't ready. Use optional chaining (`?.`) and fallbacks.

2. **Context keys not evaluating**: Editor-scoped keys like `editorLangId` don't exist on the global CKS. You must scope and re-parent (see Pattern 4 above).

3. **Forgetting `extensionHost.contribution.ts`**: If you create a new MainThread class but don't import it in `extensionHost.contribution.ts`, it will never be instantiated.

4. **Non-serializable DTOs**: Functions, class instances, and circular references cannot cross the RPC boundary. Use plain interfaces.

5. **Disposable leaks**: Register disposables immediately after creation. Use `DisposableStore`, `DisposableMap`, or `MutableDisposable`. Don't register to a class-level store from a method called repeatedly.

6. **Wrong test suite location**: Put unit tests in `src/vs/**/test/`, integration tests in `extensions/`. Don't mix them.

7. **Missing `checkProposedApiEnabled()`**: Every proposed API entry point in `extHost.api.impl.ts` must be guarded.

8. **Eager vs Delayed instantiation**: Parts that must exist at startup use `InstantiationType.Eager`. Most services should use `InstantiationType.Delayed`.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/vs/workbench/api/common/extHost.protocol.ts` | All RPC interfaces, DTOs, proxy identifiers |
| `src/vs/workbench/api/common/extHost.api.impl.ts` | Creates the `vscode` namespace object |
| `src/vs/workbench/api/browser/extensionHost.contribution.ts` | Imports all MainThread implementations |
| `src/vs/workbench/services/extensions/common/extensionsRegistry.ts` | Contribution point registry |
| `src/vs/workbench/services/actions/common/menusExtensionPoint.ts` | Menu contribution point + `apiMenus` array |
| `src/vs/platform/actions/common/actions.ts` | `MenuId` definitions and `MenuRegistry` |
| `src/vs/platform/extensions/common/extensionsApiProposals.ts` | Proposed API registration |
| `src/vscode-dts/vscode.d.ts` | Stable extension API types |
| `src/vscode-dts/vscode.proposed.*.d.ts` | Proposed API types |

---

## Further Reading

- [Extension API Guide](./reference/extension-api-guide.md) — Standard extension API reference
- [Contribution Points Catalog](./reference/contribution-points-catalog.md) — Complete catalog
- Feature docs: [Pulldown Menu](./features/pulldown-menu/) · [Toolbar Strip](./features/toolbar-strip/)
