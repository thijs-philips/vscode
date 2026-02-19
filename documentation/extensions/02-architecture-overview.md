# VS Code Extension Architecture Overview

This document describes the internal architecture VS Code uses to expose APIs to extensions. Understanding this architecture is essential for anyone modifying VS Code core to add new extension points.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Multi-Process Model](#multi-process-model)
- [RPC Communication Layer](#rpc-communication-layer)
- [The Proxy Pattern](#the-proxy-pattern)
- [Extension Host Variants](#extension-host-variants)
- [Service Layer and Dependency Injection](#service-layer-and-dependency-injection)
- [Contribution Point System](#contribution-point-system)
- [API Versioning (Stable vs Proposed)](#api-versioning-stable-vs-proposed)
- [Type Conversion Layer](#type-conversion-layer)
- [Key Source Files Reference](#key-source-files-reference)

---

## High-Level Architecture

VS Code's extension system is built on a **multi-process, message-passing architecture** that isolates extension code from the core UI for stability, security, and performance.

```
┌──────────────────────────────────────────────────────────────────┐
│                    VS Code Main Process (UI)                      │
│                                                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Workbench        │  │  Editor           │  │  Platform      │  │
│  │  Services         │  │  Services         │  │  Services      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬────────┘  │
│           │                     │                     │            │
│  ┌────────▼─────────────────────▼─────────────────────▼────────┐  │
│  │                   MainThread* Classes                        │  │
│  │  MainThreadCommands │ MainThreadDocuments │ MainThread...    │  │
│  │  (@extHostNamedCustomer decorated)                           │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
└───────────────────────────────┼────────────────────────────────────┘
                                │  RPC / IPC
                                │  (rpcProtocol.ts)
                                │  Typed Proxies
┌───────────────────────────────┼────────────────────────────────────┐
│                               │                                    │
│  ┌────────────────────────────▼─────────────────────────────────┐  │
│  │                   ExtHost* Classes                            │  │
│  │  ExtHostCommands │ ExtHostDocuments │ ExtHost...              │  │
│  │  (State management, API factories)                            │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│  ┌────────────────────────────▼─────────────────────────────────┐  │
│  │              extHost.api.impl.ts                              │  │
│  │  Creates the `vscode` namespace object                        │  │
│  │  (the API that extensions import)                             │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                    │
│  ┌────────────────────────────▼─────────────────────────────────┐  │
│  │              Extension Code                                   │  │
│  │  import * as vscode from 'vscode';                            │  │
│  │  vscode.commands.registerCommand(...)                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│                    Extension Host Process                           │
│                    (Node.js / Web Worker)                           │
└────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Process Isolation** — Extensions run in a separate process so a misbehaving extension cannot crash VS Code
2. **Typed RPC** — All cross-process communication uses typed proxy interfaces for compile-time safety
3. **Unidirectional Data Flow** — Extensions call ExtHost → RPC → MainThread → Services. Events flow back via the same RPC channel.
4. **Lazy Activation** — Extensions are loaded only when needed, based on activation events
5. **Disposable Lifecycle** — Everything is disposable, ensuring clean resource management

---

## Multi-Process Model

### Main Process (UI Thread)

The main process hosts the VS Code workbench UI and all core services. It:

- Renders the editor, sidebar, panels, and all UI
- Manages workbench services (file system, configuration, authentication, etc.)
- Contains **MainThread\*** classes that handle RPC calls from extensions
- Has full access to the DOM and Electron APIs (desktop) or browser APIs (web)

**Location:** `src/vs/workbench/api/browser/mainThread*.ts`

### Extension Host Process

The extension host is a **separate process** that runs extension JavaScript/TypeScript code. It:

- Loads and activates extensions
- Contains **ExtHost\*** classes that expose the `vscode` API
- Communicates with the main process exclusively via RPC
- Has **no access** to the DOM or VS Code's UI layer

**Location:** `src/vs/workbench/api/common/extHost*.ts`

### Communication Flow

```
Extension calls vscode.commands.registerCommand('myCmd', handler)
  │
  ▼
ExtHostCommands.registerCommand('myCmd', handler)
  │  (stores handler locally, generates handle ID)
  │
  ▼
this._proxy.$registerCommand('myCmd')    ←── RPC call via proxy
  │
  ▼ (serialized, sent over IPC)
  │
MainThreadCommands.$registerCommand('myCmd')
  │
  ▼
CommandService.registerCommand('myCmd', ...)   ←── Registers with workbench service
```

When the command is executed from the UI:

```
User triggers command 'myCmd' from palette
  │
  ▼
CommandService.executeCommand('myCmd')
  │
  ▼
MainThreadCommands dispatches to extension host
  │
  ▼ (RPC call back to extension host)
  │
ExtHostCommands.$executeContributedCommand('myCmd')
  │
  ▼
Calls the handler registered by the extension
```

---

## RPC Communication Layer

### Protocol Definition

All RPC interfaces are defined in a single file:

**`src/vs/workbench/api/common/extHost.protocol.ts`**

This file contains:

1. **DTO interfaces** — Data Transfer Objects for serializable data crossing process boundaries
2. **MainThread\*Shape interfaces** — Methods the ExtHost can call on the MainThread
3. **ExtHost\*Shape interfaces** — Methods the MainThread can call on the ExtHost
4. **Proxy identifier registrations** — Identity tokens for the RPC system

```typescript
// DTO example — must be serializable (no functions, no class instances)
export interface IDocumentDto {
    uri: UriComponents;
    versionId: number;
    lines: string[];
    eol: string;
}

// MainThread shape — called BY extension host
export interface MainThreadCommandsShape extends IDisposable {
    $registerCommand(id: string): void;
    $unregisterCommand(id: string): void;
    $executeCommand<T>(id: string, args: any[]): Promise<T | undefined>;
}

// ExtHost shape — called BY main thread
export interface ExtHostCommandsShape {
    $executeContributedCommand<T>(id: string, ...args: any[]): Promise<T>;
}
```

### Proxy Identifiers

At the bottom of `extHost.protocol.ts`, proxy identifiers register each RPC pair:

```typescript
export const MainContext = {
    MainThreadCommands:       createProxyIdentifier<MainThreadCommandsShape>('MainThreadCommands'),
    MainThreadDocuments:      createProxyIdentifier<MainThreadDocumentsShape>('MainThreadDocuments'),
    MainThreadLanguages:      createProxyIdentifier<MainThreadLanguagesShape>('MainThreadLanguages'),
    // ... 50+ more
};

export const ExtHostContext = {
    ExtHostCommands:          createProxyIdentifier<ExtHostCommandsShape>('ExtHostCommands'),
    ExtHostDocuments:         createProxyIdentifier<ExtHostDocumentsShape>('ExtHostDocuments'),
    ExtHostLanguages:         createProxyIdentifier<ExtHostLanguagesShape>('ExtHostLanguages'),
    // ... 50+ more
};
```

### RPC Protocol Implementation

**`src/vs/workbench/services/extensions/common/rpcProtocol.ts`**

The RPC protocol:
- Serializes method calls and arguments
- Sends them over IPC (MessagePort, process.send, etc.)
- Deserializes on the receiving end
- Returns Promise results back to the caller
- Handles cancellation tokens across process boundaries

Key methods:
```typescript
interface IRPCProtocol {
    getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T>;
    set<T>(identifier: ProxyIdentifier<T>, value: T): T;
    drain(): Promise<void>;
}
```

---

## The Proxy Pattern

### How Proxies Work

When you call `rpcProtocol.getProxy(MainContext.MainThreadCommands)`, you get a **proxy object** that:

1. Intercepts all method calls (methods must start with `$`)
2. Serializes the method name and arguments
3. Sends them as an RPC message to the other process
4. Returns a `Promise` that resolves when the other side responds

```typescript
// In extension host:
const proxy = rpcProtocol.getProxy(MainContext.MainThreadCommands);

// This call is intercepted and sent via RPC:
await proxy.$registerCommand('myCommand');
// ↓ equivalent to sending:
// { type: 'call', identifier: 'MainThreadCommands', method: '$registerCommand', args: ['myCommand'] }
```

### Bidirectional Communication

Some APIs require **bidirectional** communication:

```
ExtHost ──$register──► MainThread     (Extension registers a provider)
ExtHost ◄──$provide─── MainThread     (Main thread requests data from provider)
```

Example: Language providers

```typescript
// ExtHost registers provider with MainThread
this._proxy.$registerHoverProvider(handle, selector);

// MainThread calls back to ExtHost when hover is needed
// (ExtHostLanguagesShape interface)
$provideHover(handle: number, resource: URI, position: Position): Promise<Hover>;
```

### The `@extHostNamedCustomer` Decorator

MainThread classes use this decorator to automatically register with the RPC system:

```typescript
@extHostNamedCustomer(MainContext.MainThreadCommands)
export class MainThreadCommands extends Disposable implements MainThreadCommandsShape {
    constructor(
        extHostContext: IExtHostContext,
        @ICommandService private readonly _commandService: ICommandService,
    ) {
        super();
        // Get proxy to call back into extension host
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostCommands);
    }
}
```

The decorator:
- Registers the class as the handler for `MainContext.MainThreadCommands`
- Creates one instance per extension host connection
- Disposes the instance when the extension host disconnects

All MainThread customer registrations are imported in:
**`src/vs/workbench/api/browser/extensionHost.contribution.ts`**

---

## Extension Host Variants

VS Code supports multiple extension host types:

| Variant | Process Type | Use Case | Location |
|---------|-------------|----------|----------|
| `LocalProcessExtensionHost` | Node.js child process | Desktop VS Code | `src/vs/workbench/services/extensions/electron-sandbox/` |
| `WebWorkerExtensionHost` | Web Worker | VS Code for Web (vscode.dev) | `src/vs/workbench/services/extensions/browser/` |
| `RemoteExtensionHost` | Remote Node.js process | SSH, Containers, WSL | `src/vs/workbench/services/extensions/common/` |

Each variant implements the same RPC protocol, making the extension API consistent across all environments. The `ExtensionKind` property on extension points controls where an extension can run:

```typescript
registerExtensionPoint({
    extensionPoint: 'debuggers',
    defaultExtensionKind: ['workspace'],  // Runs on remote side preferentially
});
```

---

## Service Layer and Dependency Injection

### How Services Work

VS Code uses a **constructor-based dependency injection** system. Services are:

1. **Defined** as interfaces with a `createDecorator` identifier
2. **Implemented** as classes
3. **Registered** as singletons
4. **Injected** via constructor parameters with `@` decorators

```typescript
// 1. Define interface
export const IMyService = createDecorator<IMyService>('myService');
export interface IMyService {
    readonly _serviceBrand: undefined;
    doSomething(input: string): Promise<string>;
}

// 2. Implement
export class MyService implements IMyService {
    declare readonly _serviceBrand: undefined;

    constructor(
        @IConfigurationService private readonly _config: IConfigurationService,
    ) {}

    async doSomething(input: string): Promise<string> {
        return this._config.getValue<string>('myExtension.prefix') + input;
    }
}

// 3. Register
registerSingleton(IMyService, MyService, InstantiationType.Delayed);
```

### Service Layers

Services follow the VS Code layer hierarchy:

```
src/vs/base/          ← Foundation utilities (no services)
src/vs/platform/      ← Platform services (available everywhere)
src/vs/editor/        ← Editor services
src/vs/workbench/     ← Workbench services (full app only)
```

**MainThread classes inject workbench services** to bridge the gap between extensions and VS Code's service layer:

```typescript
@extHostNamedCustomer(MainContext.MainThreadMyFeature)
export class MainThreadMyFeature extends Disposable implements MainThreadMyFeatureShape {
    constructor(
        extHostContext: IExtHostContext,
        @IMyService private readonly _myService: IMyService,    // workbench service
        @ILogService private readonly _logService: ILogService, // platform service
    ) {
        super();
    }

    $doSomething(input: string): Promise<string> {
        return this._myService.doSomething(input);
    }
}
```

---

## Contribution Point System

### Overview

Contribution points are **static declarations** in an extension's `package.json` that extend VS Code's functionality. They are separate from the runtime Extension API.

### How Contribution Points Are Registered

**`src/vs/workbench/services/extensions/common/extensionsRegistry.ts`**

```typescript
const myExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IMyContribution[]>({
    extensionPoint: 'myFeature',                    // Name in package.json contributes
    jsonSchema: myFeatureSchema,                     // JSON schema for validation
    deps: [otherExtensionPoint],                     // Dependencies (optional)
    defaultExtensionKind: ['workspace'],             // Where extension should run
    activationEventsGenerator: function*(contribs) { // Auto-generate activation events
        for (const contrib of contribs) {
            yield `onMyFeature:${contrib.id}`;
        }
    }
});
```

### How Contributions Are Processed

1. **Extension Scan** — Extensions are discovered and their `package.json` files parsed
2. **Schema Validation** — `contributes.myFeature` is validated against the registered JSON schema
3. **Handler Invocation** — The extension point handler receives validated contributions

```typescript
myExtensionPoint.setHandler((extensions, delta) => {
    // delta.added — newly registered extensions
    for (const extension of delta.added) {
        for (const contribution of extension.value) {
            // Validate programmatically
            if (!isValid(contribution)) {
                extension.collector.error('Invalid contribution: ...');
                continue;
            }
            // Register with appropriate service
            service.register(contribution);
        }
    }

    // delta.removed — extensions being unloaded
    for (const extension of delta.removed) {
        service.unregister(extension.description.identifier);
    }
});
```

### Implicit Activation Events

**`src/vs/platform/extensionManagement/common/implicitActivationEvents.ts`**

Activation events are automatically generated from contribution points. When an extension declares:

```json
{ "contributes": { "views": { "explorer": [{ "id": "myView" }] } } }
```

The system automatically generates `onView:myView` as an activation event, so the extension doesn't need to declare it explicitly in `activationEvents`.

---

## API Versioning (Stable vs Proposed)

### Stable API

- **File:** `src/vscode-dts/vscode.d.ts` (~21,000+ lines)
- **Guarantees:** Backward-compatible, versioned, available to all extensions
- **Versioning:** Extensions declare minimum VS Code version via `engines.vscode`

### Proposed APIs

- **Files:** `src/vscode-dts/vscode.proposed.*.d.ts` (160+ files)
- **Purpose:** Experimental features under development
- **Access:** Must be explicitly enabled in `package.json`:

```json
{
    "enabledApiProposals": ["chatParticipantAdditions"]
}
```

- **Gating in code:**

```typescript
// In extHost.api.impl.ts
createStatusItem(): vscode.ChatStatusItem {
    checkProposedApiEnabled(extension, 'chatStatusItem');
    return extHostChatStatus.createChatStatusItem(extension);
}
```

### API Lifecycle

```
Proposed API (vscode.proposed.*.d.ts)
    │
    ▼  (iterate with feedback)
Proposed API (refined)
    │
    ▼  (stable, documented, tested)
Finalized into vscode.d.ts
    │
    ▼  (remove proposed file)
Delete vscode.proposed.*.d.ts
```

---

## Type Conversion Layer

### Why Type Converters Exist

Extension API types (e.g., `vscode.Position`, `vscode.Range`) are **different objects** from internal types (e.g., `IPosition`, `IRange`). Type converters translate between them at the process boundary.

**`src/vs/workbench/api/common/extHostTypeConverters.ts`**

```typescript
// Convert from API type to internal type
export namespace Position {
    export function from(position: vscode.Position): IPosition {
        return { lineNumber: position.line + 1, column: position.character + 1 };
    }
    export function to(position: IPosition): vscode.Position {
        return new types.Position(position.lineNumber - 1, position.column - 1);
    }
}

export namespace Range {
    export function from(range: vscode.Range): IRange {
        return {
            startLineNumber: range.start.line + 1,
            startColumn: range.start.character + 1,
            endLineNumber: range.end.line + 1,
            endColumn: range.end.character + 1,
        };
    }
}
```

### API Types

Extension API types are defined in:
**`src/vs/workbench/api/common/extHostTypes.ts`**

These are class implementations of the types that extensions use (e.g., `Position`, `Range`, `Uri`, `Diagnostic`, `CompletionItem`).

---

## Key Source Files Reference

### Core Extension Infrastructure

| File | Purpose |
|------|---------|
| `src/vs/workbench/api/common/extHost.protocol.ts` | All RPC interfaces, DTOs, and proxy identifiers |
| `src/vs/workbench/api/common/extHost.api.impl.ts` | Creates the `vscode` namespace and wires up all APIs |
| `src/vs/workbench/api/browser/extensionHost.contribution.ts` | Imports all MainThread implementations |
| `src/vs/workbench/services/extensions/common/rpcProtocol.ts` | RPC communication implementation |
| `src/vs/workbench/services/extensions/common/proxyIdentifier.ts` | Proxy identity system |
| `src/vs/workbench/services/extensions/common/extensionsRegistry.ts` | Contribution point registry |
| `src/vs/platform/extensionManagement/common/implicitActivationEvents.ts` | Activation event generation |

### Extension Service & Lifecycle

| File | Purpose |
|------|---------|
| `src/vs/workbench/services/extensions/common/abstractExtensionService.ts` | Extension loading, activation orchestration |
| `src/vs/workbench/services/extensions/browser/extensionService.ts` | Browser-specific extension service |
| `src/vs/workbench/services/extensions/common/extensions.ts` | Extension interfaces, `checkProposedApiEnabled()` |

### Type System

| File | Purpose |
|------|---------|
| `src/vscode-dts/vscode.d.ts` | Stable Extension API type definitions |
| `src/vscode-dts/vscode.proposed.*.d.ts` | Proposed API type definitions |
| `src/vs/workbench/api/common/extHostTypes.ts` | API type class implementations |
| `src/vs/workbench/api/common/extHostTypeConverters.ts` | Converts between API and internal types |

### Example MainThread/ExtHost Pairs

| Feature | MainThread | ExtHost |
|---------|-----------|---------|
| Commands | `mainThreadCommands.ts` | `extHostCommands.ts` |
| Documents | `mainThreadDocuments.ts` | `extHostDocumentData.ts` |
| Languages | `mainThreadLanguageFeatures.ts` | `extHostLanguageFeatures.ts` |
| Tree Views | `mainThreadTreeViews.ts` | `extHostTreeViews.ts` |
| Chat Status | `mainThreadChatStatus.ts` | `extHostChatStatus.ts` |
| LM Tools | `mainThreadLanguageModelTools.ts` | `extHostLanguageModelTools.ts` |

---

## Further Reading

- [Using Extension Points](./01-using-extension-points.md) — How extensions use existing APIs
- [Implementation Guide](./03-implementation-guide.md) — Step-by-step guide to adding new extension points
- [Contribution Points Reference](./04-contribution-points-reference.md) — Complete list of all contribution points
- [Testing Extension APIs](./05-testing-extension-apis.md) — How to test new extension APIs
