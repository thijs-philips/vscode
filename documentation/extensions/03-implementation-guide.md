# Adding New Extension Points to VS Code — Implementation Guide

This document is a step-by-step guide for modifying VS Code core to expose new APIs to extensions. It covers both **runtime APIs** (the `vscode.*` namespace) and **contribution points** (`package.json` declarations).

## Table of Contents

- [Overview: What Needs to Change](#overview-what-needs-to-change)
- [Step 1: Design the API Surface](#step-1-design-the-api-surface)
- [Step 2: Define the Proposed API](#step-2-define-the-proposed-api)
- [Step 3: Define Protocol Shapes and DTOs](#step-3-define-protocol-shapes-and-dtos)
- [Step 4: Create the Workbench Service](#step-4-create-the-workbench-service)
- [Step 5: Implement MainThread Handler](#step-5-implement-mainthread-handler)
- [Step 6: Implement ExtHost Handler](#step-6-implement-exthost-handler)
- [Step 7: Expose the API](#step-7-expose-the-api)
- [Step 8: Add a Contribution Point (Optional)](#step-8-add-a-contribution-point-optional)
- [Step 9: Register MainThread Customer](#step-9-register-mainthread-customer)
- [Step 10: Write Tests](#step-10-write-tests)
- [Step 11: Finalize API to Stable](#step-11-finalize-api-to-stable)
- [Complete File Checklist](#complete-file-checklist)
- [Real-World Examples](#real-world-examples)

---

## Overview: What Needs to Change

Adding a new extension API typically involves creating or modifying **8–12 files**:

```
src/
├── vscode-dts/
│   └── vscode.proposed.<feature>.d.ts          ← NEW: API type definitions
│
└── vs/workbench/
    ├── api/
    │   ├── browser/
    │   │   ├── mainThread<Feature>.ts           ← NEW: MainThread handler
    │   │   └── extensionHost.contribution.ts    ← MODIFY: Import MainThread
    │   └── common/
    │       ├── extHost<Feature>.ts              ← NEW: ExtHost handler
    │       ├── extHost.protocol.ts              ← MODIFY: Add shapes + proxies
    │       └── extHost.api.impl.ts              ← MODIFY: Expose API
    │
    ├── services/<area>/
    │   ├── common/
    │   │   └── <feature>Service.ts              ← NEW (if needed): Service interface
    │   └── browser/
    │       └── <feature>Service.ts              ← NEW (if needed): Service impl
    │
    └── contrib/<area>/                          ← Optional: Contribution point
        └── <feature>Contribution.ts
```

---

## Step 1: Design the API Surface

Before writing code, design the API that extensions will use. Consider:

### Questions to Answer

1. **What operations do extensions need?** (register, create, update, delete, query)
2. **Is it a provider pattern?** (extension provides data, VS Code requests it)
3. **Is it a factory pattern?** (extension creates objects via API)
4. **Do extensions need events?** (`onDid...` events)
5. **Is a contribution point needed?** (static declarations in `package.json`)
6. **What types need to cross the process boundary?** (design DTOs)

### API Design Principles

- **Use provider pattern** for data that VS Code needs on-demand (hover, completion, etc.)
- **Use factory pattern** for objects owned by extensions (status items, tree views)
- **Return `Disposable`** from registration methods
- **Use events** (not callbacks) for asynchronous notifications
- **Keep DTOs minimal** — only serializable data crosses the process boundary
- **Follow naming conventions** — `register*Provider`, `create*`, `onDid*`

### Example API Design

```typescript
// Factory pattern
vscode.myFeature.createWidget(options: WidgetOptions): Widget;

// Provider pattern
vscode.languages.registerMyProvider(selector: DocumentSelector, provider: MyProvider): Disposable;

// Event pattern
vscode.myFeature.onDidChangeWidget: Event<WidgetChangeEvent>;
```

---

## Step 2: Define the Proposed API

Create a new proposed API definition file.

**File:** `src/vscode-dts/vscode.proposed.<featureName>.d.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

    // https://github.com/microsoft/vscode/issues/XXXXX

    /**
     * Options for creating a widget.
     */
    export interface WidgetOptions {
        /** Human-readable title for the widget */
        title: string;
        /** Optional tooltip text */
        tooltip?: string;
    }

    /**
     * A widget that can display information.
     */
    export interface Widget {
        /** The title of the widget */
        title: string;
        /** The tooltip text */
        tooltip: string | undefined;
        /** Show the widget */
        show(): void;
        /** Hide the widget */
        hide(): void;
        /** Dispose the widget and free resources */
        dispose(): void;
    }

    /**
     * Event fired when a widget changes.
     */
    export interface WidgetChangeEvent {
        /** The widget that changed */
        readonly widget: Widget;
    }

    export namespace myFeature {
        /**
         * Create a new widget.
         *
         * @param options Configuration for the widget
         * @returns A new widget instance
         */
        export function createWidget(options: WidgetOptions): Widget;

        /**
         * An event that fires when a widget changes.
         */
        export const onDidChangeWidget: Event<WidgetChangeEvent>;
    }
}
```

### Rules for Proposed APIs

- Always include the **Microsoft copyright header**
- Always include an **issue link** (`// https://github.com/microsoft/vscode/issues/XXXXX`)
- Use `declare module 'vscode'` to augment the vscode namespace
- **Do not add** `@proposed` tags — the file name indicates proposed status
- All user-facing strings should be documented for localization

---

## Step 3: Define Protocol Shapes and DTOs

Modify `src/vs/workbench/api/common/extHost.protocol.ts` to add:

### 3a. Add DTOs (Data Transfer Objects)

DTOs must be **serializable** — no functions, class instances, or circular references.

```typescript
// Add near the other DTO definitions (around line 100-2000)

export interface IWidgetDto {
    id: string;
    title: string;
    tooltip: string | undefined;
    isVisible: boolean;
}
```

### 3b. Add MainThread Shape Interface

```typescript
// Add near the other MainThread shapes (around line 2000-3400)

export interface MainThreadMyFeatureShape extends IDisposable {
    $createWidget(id: string, options: IWidgetDto): void;
    $updateWidget(id: string, dto: Partial<IWidgetDto>): void;
    $deleteWidget(id: string): void;
    $showWidget(id: string): void;
    $hideWidget(id: string): void;
}
```

### 3c. Add ExtHost Shape Interface (if bidirectional)

```typescript
// Only needed if MainThread needs to call back into ExtHost

export interface ExtHostMyFeatureShape {
    $onDidChangeWidget(id: string, dto: IWidgetDto): void;
}
```

### 3d. Register Proxy Identifiers

```typescript
// Add to MainContext object (around line 3520)
export const MainContext = {
    // ... existing entries
    MainThreadMyFeature: createProxyIdentifier<MainThreadMyFeatureShape>('MainThreadMyFeature'),
};

// Add to ExtHostContext object (around line 3580) — only if bidirectional
export const ExtHostContext = {
    // ... existing entries
    ExtHostMyFeature: createProxyIdentifier<ExtHostMyFeatureShape>('ExtHostMyFeature'),
};
```

### Important Rules

- **Method names must start with `$`** — this is the RPC convention
- **DTOs must be interfaces, not classes** — they are serialized over IPC
- **Use `UriComponents` instead of `URI`** — URIs need special serialization
- **Use `IPosition`, `IRange`** instead of `Position`, `Range` for internal types

---

## Step 4: Create the Workbench Service

If a backing service doesn't exist, create one.

### 4a. Service Interface

**File:** `src/vs/workbench/services/<area>/common/<feature>Service.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const IMyFeatureService = createDecorator<IMyFeatureService>('myFeatureService');

export interface IWidgetData {
    readonly id: string;
    title: string;
    tooltip: string | undefined;
    isVisible: boolean;
}

export interface IMyFeatureService {
    readonly _serviceBrand: undefined;

    /**
     * Event fires when a widget changes.
     */
    readonly onDidChangeWidget: Event<IWidgetData>;

    /**
     * Create a new widget.
     */
    createWidget(id: string, data: IWidgetData): IDisposable;

    /**
     * Update an existing widget.
     */
    updateWidget(id: string, data: Partial<IWidgetData>): void;

    /**
     * Show a widget.
     */
    showWidget(id: string): void;

    /**
     * Hide a widget.
     */
    hideWidget(id: string): void;
}
```

### 4b. Service Implementation

**File:** `src/vs/workbench/services/<area>/browser/<feature>Service.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMyFeatureService, IWidgetData } from '../common/myFeatureService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class MyFeatureService extends Disposable implements IMyFeatureService {
    declare readonly _serviceBrand: undefined;

    private readonly _widgets = new Map<string, IWidgetData>();

    private readonly _onDidChangeWidget = this._register(new Emitter<IWidgetData>());
    readonly onDidChangeWidget: Event<IWidgetData> = this._onDidChangeWidget.event;

    createWidget(id: string, data: IWidgetData) {
        this._widgets.set(id, data);
        this._onDidChangeWidget.fire(data);
        return toDisposable(() => {
            this._widgets.delete(id);
        });
    }

    updateWidget(id: string, data: Partial<IWidgetData>): void {
        const existing = this._widgets.get(id);
        if (existing) {
            Object.assign(existing, data);
            this._onDidChangeWidget.fire(existing);
        }
    }

    showWidget(id: string): void {
        this.updateWidget(id, { isVisible: true });
    }

    hideWidget(id: string): void {
        this.updateWidget(id, { isVisible: false });
    }
}

registerSingleton(IMyFeatureService, MyFeatureService, InstantiationType.Delayed);
```

---

## Step 5: Implement MainThread Handler

**File:** `src/vs/workbench/api/browser/mainThreadMyFeature.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadMyFeatureShape, IWidgetDto } from '../common/extHost.protocol.js';
import { IMyFeatureService } from '../../services/<area>/common/myFeatureService.js';

@extHostNamedCustomer(MainContext.MainThreadMyFeature)
export class MainThreadMyFeature extends Disposable implements MainThreadMyFeatureShape {

    private readonly _widgets = this._register(new DisposableMap<string>());

    constructor(
        extHostContext: IExtHostContext,
        @IMyFeatureService private readonly _myFeatureService: IMyFeatureService,
    ) {
        super();
    }

    $createWidget(id: string, dto: IWidgetDto): void {
        const disposable = this._myFeatureService.createWidget(id, {
            id: dto.id,
            title: dto.title,
            tooltip: dto.tooltip,
            isVisible: dto.isVisible,
        });
        this._widgets.set(id, disposable);
    }

    $updateWidget(id: string, dto: Partial<IWidgetDto>): void {
        this._myFeatureService.updateWidget(id, dto);
    }

    $deleteWidget(id: string): void {
        this._widgets.deleteAndDispose(id);
    }

    $showWidget(id: string): void {
        this._myFeatureService.showWidget(id);
    }

    $hideWidget(id: string): void {
        this._myFeatureService.hideWidget(id);
    }
}
```

### MainThread Implementation Rules

- **Extend `Disposable`** — register all child disposables
- **Use `@extHostNamedCustomer` decorator** with the proxy identifier
- **Inject services** via constructor `@IServiceName` decorators
- **Service parameters come after `extHostContext`** in constructor
- **Use `DisposableMap` or `DisposableStore`** for tracking disposable objects
- **Methods start with `$`** — these are RPC endpoints
- **Convert DTOs to service types** if they differ

---

## Step 6: Implement ExtHost Handler

**File:** `src/vs/workbench/api/common/extHostMyFeature.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { MainContext, MainThreadMyFeatureShape, IWidgetDto } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { Emitter } from '../../../base/common/event.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { Disposable as DisposableValue } from './extHostTypes.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';

export class ExtHostMyFeature {

    private readonly _proxy: MainThreadMyFeatureShape;
    private readonly _widgets = new Map<string, WidgetImpl>();

    private readonly _onDidChangeWidget = new Emitter<vscode.WidgetChangeEvent>();
    readonly onDidChangeWidget = this._onDidChangeWidget.event;

    constructor(
        @IExtHostRpcService rpc: IExtHostRpcService,
    ) {
        this._proxy = rpc.getProxy(MainContext.MainThreadMyFeature);
    }

    createWidget(extension: IExtensionDescription, options: vscode.WidgetOptions): vscode.Widget {
        checkProposedApiEnabled(extension, 'myFeature');

        const id = generateUuid();
        const widget = new WidgetImpl(id, options, this._proxy);
        this._widgets.set(id, widget);

        // Sync initial state to MainThread
        this._proxy.$createWidget(id, widget.toDto());

        return widget;
    }

    // Called by MainThread (if bidirectional)
    $onDidChangeWidget(id: string, dto: IWidgetDto): void {
        const widget = this._widgets.get(id);
        if (widget) {
            widget._update(dto);
            this._onDidChangeWidget.fire({ widget });
        }
    }
}

/**
 * Internal implementation of the Widget API type.
 * This class is what extensions actually interact with.
 */
class WidgetImpl extends DisposableValue implements vscode.Widget {
    private _title: string;
    private _tooltip: string | undefined;
    private _isVisible: boolean = false;

    constructor(
        private readonly _id: string,
        options: vscode.WidgetOptions,
        private readonly _proxy: MainThreadMyFeatureShape,
    ) {
        super(() => {
            this._proxy.$deleteWidget(this._id);
        });
        this._title = options.title;
        this._tooltip = options.tooltip;
    }

    get title(): string {
        return this._title;
    }

    set title(value: string) {
        this._title = value;
        this._proxy.$updateWidget(this._id, { title: value });
    }

    get tooltip(): string | undefined {
        return this._tooltip;
    }

    set tooltip(value: string | undefined) {
        this._tooltip = value;
        this._proxy.$updateWidget(this._id, { tooltip: value });
    }

    show(): void {
        this._isVisible = true;
        this._proxy.$showWidget(this._id);
    }

    hide(): void {
        this._isVisible = false;
        this._proxy.$hideWidget(this._id);
    }

    toDto(): IWidgetDto {
        return {
            id: this._id,
            title: this._title,
            tooltip: this._tooltip,
            isVisible: this._isVisible,
        };
    }

    /** @internal */
    _update(dto: IWidgetDto): void {
        this._title = dto.title;
        this._tooltip = dto.tooltip;
        this._isVisible = dto.isVisible;
    }
}
```

### ExtHost Implementation Rules

- **Store the MainThread proxy** — `rpc.getProxy(MainContext.MainThread<Feature>)`
- **Track extension-created objects** in a `Map<string, Implementation>`
- **Generate UUIDs** for object IDs (`generateUuid()`)
- **Use `checkProposedApiEnabled()`** for proposed APIs
- **Sync state to MainThread** on every property change
- **Implement `dispose()`** to clean up both local state and MainThread state
- **Internal API classes** should extend `DisposableValue` from `extHostTypes.ts`

---

## Step 7: Expose the API

Modify `src/vs/workbench/api/common/extHost.api.impl.ts` to wire the API into the `vscode` namespace.

### 7a. Instantiate and Register ExtHost Class

Near the top of `createApiFactoryAndRegisterActors()` (around line 200-250), add:

```typescript
const extHostMyFeature = rpcProtocol.set(
    ExtHostContext.ExtHostMyFeature,
    new ExtHostMyFeature(rpcProtocol)
);
```

> **Note:** If ExtHost doesn't need to receive calls from MainThread (unidirectional), skip the `rpcProtocol.set()` and just instantiate directly.

### 7b. Add to the API Object

In the returned API factory function, add the new namespace:

```typescript
// Inside the return statement of createApiFactoryAndRegisterActors
const myFeature: typeof vscode.myFeature = {
    createWidget(options: vscode.WidgetOptions): vscode.Widget {
        checkProposedApiEnabled(extension, 'myFeature');
        return extHostMyFeature.createWidget(extension, options);
    },
    get onDidChangeWidget(): vscode.Event<vscode.WidgetChangeEvent> {
        checkProposedApiEnabled(extension, 'myFeature');
        return extHostMyFeature.onDidChangeWidget;
    }
};

// Add to the returned object
return {
    // ... existing namespaces
    myFeature,
};
```

### Important Notes

- **Guard all proposed API calls** with `checkProposedApiEnabled(extension, 'featureName')`
- **Pass the `extension` argument** — it's used for API gating and telemetry
- **Use `get` accessors for events** — this avoids creating event objects eagerly
- **Freeze the namespace object** — VS Code freezes the returned API object

---

## Step 8: Add a Contribution Point (Optional)

If extensions need to declare static data in `package.json`, add a contribution point.

### 8a. Define Schema and Register Extension Point

**File:** `src/vs/workbench/contrib/<area>/browser/<feature>Contribution.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import { IMyFeatureService } from '../../services/<area>/common/myFeatureService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

// 1. Define contribution schema
export interface IWidgetContribution {
    id: string;
    title: string;
    tooltip?: string;
}

const widgetSchema: IJSONSchema = {
    type: 'array',
    items: {
        type: 'object',
        required: ['id', 'title'],
        properties: {
            id: {
                type: 'string',
                description: localize('widget.id', 'Unique identifier for the widget.'),
                pattern: '^[a-zA-Z0-9_-]+$'
            },
            title: {
                type: 'string',
                description: localize('widget.title', 'Display title for the widget.')
            },
            tooltip: {
                type: 'string',
                description: localize('widget.tooltip', 'Optional tooltip text.')
            }
        }
    }
};

// 2. Register extension point
const widgetExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IWidgetContribution[]>({
    extensionPoint: 'widgets',
    jsonSchema: widgetSchema,
    activationEventsGenerator: function* (contributions) {
        for (const contrib of contributions) {
            if (contrib.id) {
                yield `onWidget:${contrib.id}`;
            }
        }
    }
});

// 3. Handle contributions
class WidgetContributionHandler extends Disposable {
    static readonly ID = 'workbench.contrib.widgetContributionHandler';

    constructor(
        @IMyFeatureService private readonly _myFeatureService: IMyFeatureService,
    ) {
        super();

        widgetExtensionPoint.setHandler((extensions, delta) => {
            // Handle removed extensions
            for (const extension of delta.removed) {
                for (const contrib of extension.value) {
                    // Unregister from service
                }
            }

            // Handle added extensions
            for (const extension of delta.added) {
                for (const contrib of extension.value) {
                    // Validate
                    if (!contrib.id) {
                        extension.collector.error(
                            localize('missing.id', "'id' is required for widget contribution.")
                        );
                        continue;
                    }

                    if (!contrib.title) {
                        extension.collector.error(
                            localize('missing.title', "'title' is required for widget contribution.")
                        );
                        continue;
                    }

                    // Register with service
                    this._myFeatureService.createWidget(contrib.id, {
                        id: contrib.id,
                        title: contrib.title,
                        tooltip: contrib.tooltip,
                        isVisible: false,
                    });
                }
            }
        });
    }
}

// 4. Register as workbench contribution
registerWorkbenchContribution2(
    WidgetContributionHandler.ID,
    WidgetContributionHandler,
    WorkbenchPhase.BlockRestore
);
```

### Contribution Point Rules

- **Use `localize()`** for all user-facing strings in schemas
- **Provide `activationEventsGenerator`** to auto-create activation events from contributions
- **Handle both `added` and `removed`** in the delta handler
- **Use `extension.collector.error/warn/info`** for validation messages — not `console.log`
- **Register as a workbench contribution** with the appropriate lifecycle phase

---

## Step 9: Register MainThread Customer

Add the MainThread import to `src/vs/workbench/api/browser/extensionHost.contribution.ts`:

```typescript
// Add to the import list (alphabetical order)
import './mainThreadMyFeature.js';
```

This file is the central registry that ensures all MainThread implementations are loaded when an extension host connects.

---

## Step 10: Write Tests

### 10a. ExtHost Unit Tests

**File:** `src/vs/workbench/api/test/browser/extHostMyFeature.test.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtHostMyFeature } from '../../common/extHostMyFeature.js';
import { mock } from '../../../../base/test/common/mock.js';
import { MainThreadMyFeatureShape } from '../../common/extHost.protocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostMyFeature', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    let extHostMyFeature: ExtHostMyFeature;
    let mainThreadShape: MainThreadMyFeatureShape;

    setup(() => {
        mainThreadShape = mock<MainThreadMyFeatureShape>();
        const rpcProtocol = SingleProxyRPCProtocol(mainThreadShape);
        extHostMyFeature = new ExtHostMyFeature(rpcProtocol);
    });

    test('createWidget returns disposable widget', () => {
        const extension = { identifier: { value: 'test.extension' }, enabledApiProposals: ['myFeature'] };
        const widget = store.add(extHostMyFeature.createWidget(extension as any, { title: 'Test' }));
        assert.strictEqual(widget.title, 'Test');
    });

    test('widget.dispose() calls $deleteWidget', () => {
        const extension = { identifier: { value: 'test.extension' }, enabledApiProposals: ['myFeature'] };
        let deletedId: string | undefined;
        mainThreadShape.$deleteWidget = (id) => { deletedId = id; };

        const widget = extHostMyFeature.createWidget(extension as any, { title: 'Test' });
        widget.dispose();
        assert.ok(deletedId);
    });

    test('widget.title setter calls $updateWidget', () => {
        const extension = { identifier: { value: 'test.extension' }, enabledApiProposals: ['myFeature'] };
        let updatedTitle: string | undefined;
        mainThreadShape.$updateWidget = (id, dto) => { updatedTitle = dto.title; };

        const widget = store.add(extHostMyFeature.createWidget(extension as any, { title: 'Original' }));
        widget.title = 'Updated';
        assert.strictEqual(updatedTitle, 'Updated');
    });
});
```

### 10b. Service Tests

**File:** `src/vs/workbench/services/<area>/test/browser/<feature>Service.test.ts`

```typescript
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MyFeatureService } from '../../browser/myFeatureService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('MyFeatureService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('createWidget fires onDidChangeWidget', () => {
        const service = store.add(new MyFeatureService());
        let fired = false;
        store.add(service.onDidChangeWidget(() => { fired = true; }));

        store.add(service.createWidget('test', {
            id: 'test',
            title: 'Title',
            tooltip: undefined,
            isVisible: false,
        }));

        assert.ok(fired);
    });

    test('dispose removes widget', () => {
        const service = store.add(new MyFeatureService());
        const disposable = service.createWidget('test', {
            id: 'test',
            title: 'Title',
            tooltip: undefined,
            isVisible: false,
        });
        disposable.dispose();
        // Widget should be removed
    });
});
```

### Testing Rules

- **Always use `ensureNoDisposablesAreLeakedInTestSuite()`** — catches disposable leaks
- **Track disposables in `store`** — use `store.add()` for all created objects
- **Use `mock<T>()` or `new class extends mock<T>()` for mocking shapes**
- **Use `SingleProxyRPCProtocol`** for testing ExtHost with a mock MainThread
- **Use `workbenchInstantiationService()`** for testing with full DI
- **Prefer `assert.deepStrictEqual`** for snapshot-style assertions

---

## Step 11: Finalize API to Stable

When a proposed API is ready to become stable:

1. **Move the API types** from `vscode.proposed.<feature>.d.ts` into `vscode.d.ts`
2. **Delete** the proposed API file
3. **Remove** `checkProposedApiEnabled()` guards from `extHost.api.impl.ts`
4. **Remove** `enabledApiProposals` entries from built-in extensions that used it
5. **Update** the minimum `engines.vscode` version in documentation

---

## Complete File Checklist

| # | File | Action | Required? |
|---|------|--------|-----------|
| 1 | `src/vscode-dts/vscode.proposed.<feature>.d.ts` | Create | Yes (if proposed) |
| 2 | `src/vs/workbench/api/common/extHost.protocol.ts` | Modify: Add DTOs, shapes, proxy IDs | Yes |
| 3 | `src/vs/workbench/services/<area>/common/<feature>Service.ts` | Create: Service interface | If new service |
| 4 | `src/vs/workbench/services/<area>/browser/<feature>Service.ts` | Create: Service implementation | If new service |
| 5 | `src/vs/workbench/api/browser/mainThread<Feature>.ts` | Create: MainThread handler | Yes |
| 6 | `src/vs/workbench/api/common/extHost<Feature>.ts` | Create: ExtHost handler | Yes |
| 7 | `src/vs/workbench/api/common/extHost.api.impl.ts` | Modify: Expose API in vscode namespace | Yes |
| 8 | `src/vs/workbench/api/browser/extensionHost.contribution.ts` | Modify: Import MainThread | Yes |
| 9 | `src/vs/workbench/contrib/<area>/browser/<feature>Contribution.ts` | Create: Contribution point | If contribution point |
| 10 | `src/vs/workbench/api/test/browser/extHost<Feature>.test.ts` | Create: ExtHost tests | Recommended |
| 11 | `src/vs/workbench/services/<area>/test/browser/<feature>Service.test.ts` | Create: Service tests | Recommended |

---

## Real-World Examples

### Simple: Chat Status Item (33-line MainThread, 96-line ExtHost)

A minimal example of a factory-pattern API:
- Proposed API: `src/vscode-dts/vscode.proposed.chatStatusItem.d.ts`
- MainThread: `src/vs/workbench/api/browser/mainThreadChatStatus.ts`
- ExtHost: `src/vs/workbench/api/common/extHostChatStatus.ts`

### Medium: AI Related Information (Provider Pattern)

A provider-pattern API with bidirectional RPC:
- Proposed API: `src/vscode-dts/vscode.proposed.aiRelatedInformation.d.ts`
- MainThread: `src/vs/workbench/api/browser/mainThreadAiRelatedInformation.ts`
- ExtHost: `src/vs/workbench/api/common/extHostAiRelatedInformation.ts`

### Complex: Language Model Tools (Contribution Point + Streaming)

A full-featured API with contribution point, streaming, and token counting:
- API: `src/vscode-dts/vscode.d.ts` (finalized)
- Contribution: `src/vs/workbench/contrib/chat/common/tools/languageModelToolsContribution.ts`
- MainThread: `src/vs/workbench/api/browser/mainThreadLanguageModelTools.ts`
- ExtHost: `src/vs/workbench/api/common/extHostLanguageModelTools.ts`
- Tests: `src/vs/workbench/contrib/chat/test/browser/tools/languageModelToolsService.test.ts`

### Complex: Views (Contribution Point + Tree Data Provider)

Multiple contribution points with view containers and tree views:
- Extension Point: `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
- MainThread: `src/vs/workbench/api/browser/mainThreadTreeViews.ts`
- ExtHost: `src/vs/workbench/api/common/extHostTreeViews.ts`

---

## Further Reading

- [Architecture Overview](./02-architecture-overview.md) — How the extension system works
- [Contribution Points Reference](./04-contribution-points-reference.md) — All existing contribution points
- [Testing Extension APIs](./05-testing-extension-apis.md) — Testing patterns and utilities
