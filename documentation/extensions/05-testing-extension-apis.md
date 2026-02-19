# Testing Extension APIs in VS Code

This document covers testing patterns and utilities for extension API implementations, including ExtHost tests, MainThread tests, service tests, and integration tests.

## Table of Contents

- [Test Infrastructure Overview](#test-infrastructure-overview)
- [Test File Locations](#test-file-locations)
- [Disposable Leak Detection](#disposable-leak-detection)
- [Testing ExtHost Classes](#testing-exthost-classes)
- [Testing MainThread Classes](#testing-mainthread-classes)
- [Testing Services](#testing-services)
- [Integration Tests](#integration-tests)
- [Common Test Utilities](#common-test-utilities)
- [Running Tests](#running-tests)

---

## Test Infrastructure Overview

VS Code has multiple test suites:

| Suite | Location | Purpose | Runner |
|-------|----------|---------|--------|
| Unit tests | `src/vs/**/test/` | Test individual classes/functions | `scripts/test.bat` |
| Integration tests | `*.integrationTest.ts` | Test full workbench integration | `scripts/test-integration.bat` |
| Extension API tests | `extensions/vscode-api-tests/` | Test public extension API | Extension host test runner |

Tests use:
- **Mocha** as the test framework (`suite`, `test`, `setup`, `teardown`)
- **`assert`** module for assertions (prefer `assert.deepStrictEqual` for snapshots)
- **Custom utilities** for disposable tracking, mocking, and DI

---

## Test File Locations

```
src/vs/workbench/
├── api/
│   └── test/
│       ├── browser/                          ← ExtHost & MainThread tests
│       │   ├── extHostCommands.test.ts
│       │   ├── extHostTreeViews.test.ts
│       │   ├── mainThreadCommands.test.ts
│       │   └── ...
│       └── common/
│           ├── testRPCProtocol.ts            ← Test RPC utilities
│           └── ...
│
├── services/<area>/
│   └── test/
│       └── browser/
│           └── <service>.test.ts             ← Service tests
│
└── contrib/<area>/
    └── test/
        └── browser/
            └── <feature>.test.ts             ← Feature/contribution tests

extensions/
└── vscode-api-tests/
    └── src/
        └── singlefolder-tests/
            ├── commands.test.ts              ← Public API integration tests
            ├── languages.test.ts
            └── ...
```

---

## Disposable Leak Detection

**Every test suite must use `ensureNoDisposablesAreLeakedInTestSuite()`.**

This utility tracks all disposables created during tests and fails if any are not properly disposed.

```typescript
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('My Feature Tests', () => {
    // MANDATORY: Add at the top of every suite
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('example', () => {
        // Track disposables with store.add()
        const service = store.add(new MyService());
        const subscription = store.add(service.onDidChange(() => {}));

        // store automatically disposes everything after the test
    });
});
```

### Rules

- **Always** call `ensureNoDisposablesAreLeakedInTestSuite()` at suite level
- **Store all disposables** using `store.add(disposable)`
- **Don't create disposables without tracking** — the test will fail
- **If a function returns an `IDisposable`**, track it with `store.add()`

---

## Testing ExtHost Classes

ExtHost classes communicate with MainThread via RPC proxies. In tests, mock the MainThread shape.

### Basic Pattern

```typescript
import * as assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { MainThreadMyFeatureShape } from '../../common/extHost.protocol.js';
import { ExtHostMyFeature } from '../../common/extHostMyFeature.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ExtHostMyFeature', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    let extHost: ExtHostMyFeature;
    let mainThread: MainThreadMyFeatureShape;

    setup(() => {
        // Create a mock MainThread implementation
        mainThread = mock<MainThreadMyFeatureShape>();

        // Create RPC protocol with single proxy
        const rpcProtocol = SingleProxyRPCProtocol(mainThread);

        // Create ExtHost instance
        extHost = new ExtHostMyFeature(rpcProtocol);
    });

    test('should create widget', () => {
        // Mock extension descriptor
        const extension = {
            identifier: { value: 'test.ext' },
            enabledApiProposals: ['myFeature']
        };

        const widget = store.add(extHost.createWidget(extension as any, {
            title: 'Test Widget'
        }));

        assert.strictEqual(widget.title, 'Test Widget');
    });

    test('should call $createWidget on MainThread', () => {
        let calledWith: any;
        mainThread.$createWidget = (id, dto) => { calledWith = dto; };

        const extension = {
            identifier: { value: 'test.ext' },
            enabledApiProposals: ['myFeature']
        };

        store.add(extHost.createWidget(extension as any, {
            title: 'Test'
        }));

        assert.strictEqual(calledWith.title, 'Test');
    });
});
```

### Testing with `TestRPCProtocol`

For more complex scenarios with bidirectional RPC:

```typescript
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { MainContext, ExtHostContext } from '../../common/extHost.protocol.js';

suite('ExtHostMyFeature - bidirectional', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('handles callback from MainThread', async () => {
        const rpcProtocol = new TestRPCProtocol();

        // Set up ExtHost side
        const extHost = new ExtHostMyFeature(rpcProtocol);
        rpcProtocol.set(ExtHostContext.ExtHostMyFeature, extHost);

        // Set up MainThread mock
        const mainThread = mock<MainThreadMyFeatureShape>();
        rpcProtocol.set(MainContext.MainThreadMyFeature, mainThread);

        // Test bidirectional call
        extHost.$onDidChangeWidget('id', { id: 'id', title: 'Changed' });

        // Verify the event was fired
        // ...
    });
});
```

### Mocking ExtHost Dependencies

```typescript
import { NullLogService } from '../../../../platform/log/common/log.js';
import { mock } from '../../../../base/test/common/mock.js';

// Mock a service
const logService = new NullLogService();

// Mock with custom implementations
const mockService = new class extends mock<IMyService>() {
    override doSomething(input: string) {
        return Promise.resolve('mocked: ' + input);
    }
};
```

---

## Testing MainThread Classes

MainThread classes are typically tested with full DI, using `workbenchInstantiationService()`.

### Basic Pattern

```typescript
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { MainThreadMyFeature } from '../../browser/mainThreadMyFeature.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IMyFeatureService } from '../../../services/myArea/common/myFeatureService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MainThreadMyFeature', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    let mainThread: MainThreadMyFeature;
    let myFeatureService: IMyFeatureService;

    setup(() => {
        // Create mock service
        myFeatureService = store.add(new class extends mock<IMyFeatureService>() {
            override createWidget(id: string, data: any) {
                return { dispose: () => {} };
            }
            override updateWidget(id: string, data: any) {}
        });

        // Create instantiation service with overrides
        const instantiationService = workbenchInstantiationService({
            // Override specific services
        }, store);

        // Create mock ExtHost context
        const extHostContext = new class extends mock<IExtHostContext>() {
            override getProxy<T>(identifier: any): T {
                return mock<any>();
            }
        };

        // Create MainThread instance
        mainThread = store.add(
            instantiationService.createInstance(MainThreadMyFeature, extHostContext)
        );
    });

    test('$createWidget delegates to service', () => {
        let createdId: string | undefined;
        myFeatureService.createWidget = (id) => {
            createdId = id;
            return { dispose: () => {} };
        };

        mainThread.$createWidget('test-id', { id: 'test-id', title: 'Test' });

        assert.strictEqual(createdId, 'test-id');
    });
});
```

---

## Testing Services

### Basic Service Test

```typescript
import * as assert from 'assert';
import { MyFeatureService } from '../../browser/myFeatureService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('MyFeatureService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('createWidget fires onDidChangeWidget', () => {
        const service = store.add(new MyFeatureService());
        const events: any[] = [];
        store.add(service.onDidChangeWidget(e => events.push(e)));

        store.add(service.createWidget('w1', {
            id: 'w1',
            title: 'Widget 1',
            tooltip: undefined,
            isVisible: false,
        }));

        assert.deepStrictEqual(events, [{
            id: 'w1',
            title: 'Widget 1',
            tooltip: undefined,
            isVisible: false,
        }]);
    });

    test('updateWidget fires event with updated data', () => {
        const service = store.add(new MyFeatureService());
        store.add(service.createWidget('w1', {
            id: 'w1',
            title: 'Original',
            tooltip: undefined,
            isVisible: false,
        }));

        const events: any[] = [];
        store.add(service.onDidChangeWidget(e => events.push(e)));

        service.updateWidget('w1', { title: 'Updated' });

        assert.strictEqual(events[0].title, 'Updated');
    });
});
```

### Service Test with DI

```typescript
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('MyFeatureService with dependencies', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();

    test('uses configuration service', () => {
        const instantiationService = workbenchInstantiationService({}, store);
        const service = store.add(
            instantiationService.createInstance(MyFeatureService)
        );

        // Test with full DI
        const widget = store.add(service.createWidget('test', { ... }));
        assert.ok(widget);
    });
});
```

---

## Integration Tests

Integration tests run in a full VS Code environment. They test the API from the extension's perspective.

### Location

- Extension API tests: `extensions/vscode-api-tests/src/singlefolder-tests/`
- File naming: `*.test.ts` (for single-folder tests)

### Pattern

```typescript
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('MyFeature API', () => {
    test('createWidget returns widget', async () => {
        const widget = vscode.myFeature.createWidget({
            title: 'Test Widget'
        });

        assert.strictEqual(widget.title, 'Test Widget');
        widget.dispose();
    });

    test('onDidChangeWidget fires on title change', async () => {
        const widget = vscode.myFeature.createWidget({ title: 'Original' });

        const changePromise = new Promise<vscode.WidgetChangeEvent>(resolve => {
            vscode.myFeature.onDidChangeWidget(resolve);
        });

        widget.title = 'Changed';

        const event = await changePromise;
        assert.strictEqual(event.widget.title, 'Changed');

        widget.dispose();
    });
});
```

### Running Integration Tests

```bash
# Windows
.\scripts\test-integration.bat

# macOS/Linux
./scripts/test-integration.sh
```

---

## Common Test Utilities

### `mock<T>()`

Creates an empty mock that throws for any unimplemented method:

```typescript
import { mock } from '../../../../base/test/common/mock.js';

// Basic mock
const mockService = mock<IMyService>();

// Mock with overrides
const mockService = new class extends mock<IMyService>() {
    override doSomething() { return 'mocked'; }
};
```

### `SingleProxyRPCProtocol`

Creates a simplified RPC protocol with a single proxy target:

```typescript
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

const mainThreadMock = mock<MainThreadMyFeatureShape>();
const rpc = SingleProxyRPCProtocol(mainThreadMock);
// Any getProxy() call returns mainThreadMock
```

### `TestRPCProtocol`

Full bidirectional RPC protocol for testing:

```typescript
import { TestRPCProtocol } from '../common/testRPCProtocol.js';

const rpc = new TestRPCProtocol();
rpc.set(MainContext.MainThreadFoo, mainThreadImpl);
rpc.set(ExtHostContext.ExtHostFoo, extHostImpl);
```

### `workbenchInstantiationService`

Creates a full DI container with default test services:

```typescript
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

const instaService = workbenchInstantiationService({}, store);
const service = store.add(instaService.createInstance(MyService));
```

### `NullLogService`

A no-op logger for tests:

```typescript
import { NullLogService } from '../../../../platform/log/common/log.js';
const logService = new NullLogService();
```

### Event Testing Helpers

```typescript
import { Event } from '../../../../base/common/event.js';

// Collect events
const events: MyEventType[] = [];
store.add(service.onDidChange(e => events.push(e)));

// Wait for an event
const event = await Event.toPromise(service.onDidChange);

// Assert event count
assert.strictEqual(events.length, 1);
```

### CancellationToken

```typescript
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';

test('handles cancellation', async () => {
    const cts = new CancellationTokenSource();
    const promise = service.doWork(cts.token);
    cts.cancel();

    await assert.rejects(promise, /cancelled/);
    cts.dispose();
});
```

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
.\scripts\test.bat

# Run tests matching a pattern
.\scripts\test.bat --grep "MyFeature"

# Run tests in a specific file
.\scripts\test.bat --run src/vs/workbench/api/test/browser/extHostMyFeature.test.ts
```

### Integration Tests

```bash
# Run integration tests
.\scripts\test-integration.bat

# Run specific integration test
.\scripts\test-integration.bat --grep "MyFeature API"
```

### Before Running Tests

1. **Check for compilation errors** — Run the `VS Code - Build` task and check output
2. **Never run tests with compilation errors** — Fix all TypeScript errors first
3. **Validate layer dependencies** — Run `npm run valid-layers-check`

---

## Test Quality Guidelines

1. **Minimize assertions** — Prefer one `assert.deepStrictEqual` snapshot over many small assertions
2. **Test disposable cleanup** — Verify that `dispose()` properly cleans up resources
3. **Test cancellation** — If the API accepts `CancellationToken`, test cancellation behavior
4. **Test error paths** — Verify that invalid inputs produce appropriate errors
5. **Don't add tests to wrong suite** — Check the test belongs in the right `suite()` block
6. **Follow existing patterns** — Match the testing style of nearby test files
7. **Always track disposables** — Use `store.add()` for every disposable created in tests

---

## Further Reading

- [Using Extension Points](./01-using-extension-points.md) — Extension developer guide
- [Architecture Overview](./02-architecture-overview.md) — Internal architecture
- [Implementation Guide](./03-implementation-guide.md) — Adding new extension points
- [Contribution Points Reference](./04-contribution-points-reference.md) — All contribution points
