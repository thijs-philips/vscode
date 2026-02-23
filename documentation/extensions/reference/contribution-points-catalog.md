# VS Code Contribution Points Reference

Complete reference of all contribution points available in VS Code, organized by category. Each entry lists the extension point name, location in the codebase, activation events it generates, and a brief description.

---

## Core Extension API

### `commands`
- **Description:** Register commands visible in the Command Palette
- **Schema location:** `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`
- **Activation events:** `onCommand:<commandId>`
- **Required fields:** `command`, `title`
- **Optional fields:** `category`, `icon`, `enablement`, `shortTitle`

### `menus`
- **Description:** Place commands in specific menus and context menus
- **Schema location:** `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`
- **Available locations:** `commandPalette`, `editor/context`, `editor/title`, `explorer/context`, `view/title`, `view/item/context`, `scm/title`, `debug/callstack/context`, and more

### `submenus`
- **Description:** Define submenu items
- **Schema location:** `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`
- **Required fields:** `id`, `label`

### `keybindings`
- **Description:** Register keyboard shortcuts
- **Schema location:** `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`
- **Required fields:** `command`, `key`
- **Optional fields:** `mac`, `linux`, `win`, `when`

### `configuration`
- **Description:** Declare extension settings
- **Schema location:** `src/vs/workbench/api/common/configurationExtensionPoint.ts`
- **Required fields:** `properties` (object with setting definitions)

### `configurationDefaults`
- **Description:** Override default values for settings
- **Schema location:** `src/vs/workbench/api/common/configurationExtensionPoint.ts`

---

## Views & UI

### `viewsContainers`
- **Description:** Register custom sidebar/panel containers
- **Schema location:** `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
- **Container locations:** `activitybar`, `panel`, `secondarySidebar`
- **Required fields:** `id`, `title`, `icon`

### `views`
- **Description:** Register tree views and webview views
- **Schema location:** `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
- **Activation events:** `onView:<viewId>`
- **Dependencies:** Depends on `viewsContainers` extension point
- **Required fields:** `id`, `name`
- **Optional fields:** `when`, `icon`, `contextualTitle`, `type` (`tree` or `webview`)

### `viewsWelcome`
- **Description:** Add welcome content to empty views
- **Schema location:** `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
- **Required fields:** `view`, `contents`
- **Optional fields:** `when`, `group`, `enablement`

### `statusBarItems`
- **Description:** Contribute items to the status bar
- **Schema location:** `src/vs/workbench/api/browser/statusBarExtensionPoint.ts`

---

## Languages & Grammars

### `languages`
- **Description:** Declare language support
- **Schema location:** `src/vs/workbench/services/language/common/languageService.ts`
- **Activation events:** `onLanguage:<languageId>`
- **Required fields:** `id`
- **Optional fields:** `aliases`, `extensions`, `filenames`, `filenamePatterns`, `configuration`, `mimetypes`, `firstLine`, `icon`

### `grammars`
- **Description:** Contribute TextMate grammars for syntax highlighting
- **Schema location:** `src/vs/workbench/services/textMate/common/TMGrammars.ts`
- **Required fields:** `scopeName`, `path`
- **Optional fields:** `language`, `embeddedLanguages`, `tokenTypes`, `injectTo`, `balancedBracketScopes`, `unbalancedBracketScopes`

### `semanticTokenTypes`
- **Description:** Define semantic token types
- **Schema location:** `src/vs/workbench/api/common/extHostTypes.ts` (area)

### `semanticTokenModifiers`
- **Description:** Define semantic token modifiers
- **Schema location:** Similar to `semanticTokenTypes`

### `semanticTokenScopes`
- **Description:** Map semantic token types to TextMate scopes
- **Schema location:** Similar to `semanticTokenTypes`

---

## Themes & Styling

### `themes`
- **Description:** Contribute color themes
- **Schema location:** `src/vs/workbench/services/themes/common/themeExtensionPoints.ts`
- **Required fields:** `label`, `uiTheme`, `path`

### `iconThemes`
- **Description:** Contribute file icon themes
- **Schema location:** `src/vs/workbench/services/themes/common/themeExtensionPoints.ts`
- **Required fields:** `id`, `label`, `path`

### `productIconThemes`
- **Description:** Contribute product icon themes (UI icons)
- **Schema location:** `src/vs/workbench/services/themes/common/themeExtensionPoints.ts`
- **Required fields:** `id`, `label`, `path`

### `colors`
- **Description:** Define new color customization points
- **Schema location:** `src/vs/workbench/services/themes/common/colorExtensionPoint.ts`
- **Required fields:** `id`, `description`, `defaults` (with `dark`, `light`, `highContrast`)

### `icons`
- **Description:** Register icon definitions
- **Schema location:** `src/vs/workbench/services/themes/common/iconExtensionPoint.ts`

### `css`
- **Description:** Contribute CSS styling
- **Schema location:** `src/vs/workbench/services/themes/`

---

## Debugging

### `debuggers`
- **Description:** Register debug adapters
- **Schema location:** `src/vs/workbench/contrib/debug/common/debugSchemas.ts`
- **Activation events:** `onDebugResolve:<type>`, `onDebugAdapterProtocolTracker:<type>`
- **Default extension kind:** `workspace`
- **Required fields:** `type`, `label`
- **Optional fields:** `program`, `runtime`, `configurationAttributes`, `initialConfigurations`, `configurationSnippets`, `languages`

### `breakpoints`
- **Description:** Contribute breakpoint types
- **Schema location:** `src/vs/workbench/contrib/debug/common/debugSchemas.ts`
- **Required fields:** `language`

### `debugVisualizers`
- **Description:** Register debug value visualizers
- **Schema location:** `src/vs/workbench/contrib/debug/common/debugSchemas.ts`

---

## Tasks & Problems

### `taskDefinitions`
- **Description:** Define task types
- **Schema location:** `src/vs/workbench/contrib/tasks/common/taskDefinitionRegistry.ts`
- **Activation events:** `onTaskType:<taskType>`
- **Required fields:** `type`
- **Optional fields:** `required`, `properties`

### `problemMatchers`
- **Description:** Define problem matchers for build output
- **Schema location:** `src/vs/workbench/contrib/tasks/common/problemMatcher.ts`

### `problemPatterns`
- **Description:** Define problem patterns
- **Schema location:** `src/vs/workbench/contrib/tasks/common/problemMatcher.ts`

---

## Notebooks

### `notebooks`
- **Description:** Register notebook serializers
- **Schema location:** `src/vs/workbench/contrib/notebook/browser/notebookExtensionPoint.ts`
- **Activation events:** `onNotebook:<notebookType>`
- **Required fields:** `type`, `displayName`, `selector`

### `notebookRenderer`
- **Description:** Register notebook output renderers
- **Schema location:** `src/vs/workbench/contrib/notebook/browser/notebookExtensionPoint.ts`
- **Activation events:** `onRenderer:<rendererId>`
- **Required fields:** `id`, `displayName`, `mimeTypes`, `entrypoint`

### `notebookPreload`
- **Description:** Register notebook preload scripts
- **Schema location:** `src/vs/workbench/contrib/notebook/browser/notebookExtensionPoint.ts`

---

## Chat & AI Features

### `chatParticipants`
- **Description:** Register AI chat participants
- **Schema location:** `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`
- **Activation events:** `onChatParticipant:<name>`
- **Required fields:** `id`, `name`
- **Optional fields:** `fullName`, `description`, `isSticky`, `commands`, `disambiguation`

### `chatContext`
- **Description:** Register chat context providers
- **Activation events:** `onChatContextProvider:<id>`

### `chatViewsWelcome`
- **Description:** Welcome content for chat views
- **Schema location:** `src/vs/workbench/contrib/chat/`

### `languageModelTools`
- **Description:** Register tools callable by language models
- **Schema location:** `src/vs/workbench/contrib/chat/common/tools/languageModelToolsContribution.ts`
- **Activation events:** `onLanguageModelTool:<toolName>`
- **Required fields:** `name`, `displayName`, `modelDescription`
- **Optional fields:** `inputSchema`, `canBeReferencedInPrompt`, `tags`, `toolReferenceName`
- **Name pattern:** `^(?!copilot_|vscode_)[\\w-]+$`

### `languageModelToolSets`
- **Description:** Register sets of language model tools

### `languageModelChatProviders`
- **Description:** Register language model providers
- **Activation events:** `onLanguageModelChatProvider:<id>`

---

## Editors & Documents

### `customEditors`
- **Description:** Register custom editor types
- **Schema location:** `src/vs/workbench/contrib/customEditor/browser/customEditors.ts`
- **Activation events:** `onCustomEditor:<viewType>`
- **Required fields:** `viewType`, `displayName`, `selector`
- **Optional fields:** `priority` (`default`, `option`, `builtin`)

### `jsonValidation`
- **Description:** Associate JSON schemas with file patterns
- **Schema location:** `src/vs/workbench/api/common/jsonValidationExtensionPoint.ts`
- **Required fields:** `fileMatch`, `url`

---

## Authentication & Remote

### `authentication`
- **Description:** Register authentication providers
- **Schema location:** `src/vs/workbench/services/authentication/browser/authenticationExtensionPoint.ts`
- **Activation events:** `onAuthenticationRequest:<providerId>`
- **Required fields:** `id`, `label`

### `remoteHelp`
- **Description:** Provide help information for remote connections
- **Schema location:** `src/vs/workbench/services/remote/common`

---

## Terminal

### `terminal`
- **Description:** Register terminal profiles
- **Schema location:** `src/vs/workbench/contrib/terminal/browser/terminalExtensionPoints.ts`
- **Activation events:** `onTerminalProfile:<profileId>`

### `terminalQuickFixes`
- **Description:** Register terminal quick fix suggestions
- **Activation events:** `onTerminalQuickFixRequest:<id>`

---

## Other

### `snippets`
- **Description:** Contribute code snippets
- **Schema location:** `src/vs/workbench/contrib/snippets/browser/snippetsFile.ts`
- **Required fields:** `language`, `path`

### `walkthroughs`
- **Description:** Contribute Getting Started walkthroughs
- **Schema location:** `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedExtensionPoint.ts`
- **Activation events:** `onWalkthrough:<walkthroughId>`
- **Required fields:** `id`, `title`, `description`, `steps`

### `localizations`
- **Description:** Contribute localizations (language packs)
- **Schema location:** `src/vs/workbench/contrib/localization/`

### `resourceLabelFormatters`
- **Description:** Format resource labels (file paths)
- **Schema location:** `src/vs/workbench/services/label/common/labelService.ts`

### `speechProviders`
- **Description:** Contribute speech recognition/synthesis providers
- **Schema location:** `src/vs/workbench/contrib/speech/`

### `mcpServerDefinitionProviders`
- **Description:** Register MCP (Model Context Protocol) server definitions
- **Activation events:** `onMcpCollection:<id>`

### `continueEditSession`
- **Description:** Continue edit sessions across environments
- **Schema location:** `src/vs/workbench/contrib/editSessions/`

---

## How Contribution Points Work

### Registration Pattern
```typescript
const extensionPoint = ExtensionsRegistry.registerExtensionPoint<InterfaceType>({
    extensionPoint: 'name',              // Key in package.json "contributes"
    jsonSchema: schemaDefinition,         // JSON Schema for validation
    deps: [otherExtensionPoint],          // Dependencies (optional)
    defaultExtensionKind: ['workspace'],  // Where to run (optional)
    activationEventsGenerator: function*(contributions) {
        for (const c of contributions) {
            yield `onSomething:${c.id}`;
        }
    }
});
```

### Handler Pattern
```typescript
extensionPoint.setHandler((extensions, delta) => {
    for (const ext of delta.added) {
        for (const contrib of ext.value) {
            // Validate with ext.collector.error/warn/info
            // Register with service
        }
    }
    for (const ext of delta.removed) {
        // Unregister
    }
});
```

### Validation Messages
```typescript
extension.collector.error('Error: something is wrong');   // Blocks contribution
extension.collector.warn('Warning: something is off');     // Allows contribution
extension.collector.info('Info: FYI message');              // Informational
```

---

## Further Reading

- [Extension API Guide](./extension-api-guide.md) — Extension developer guide
- [Learnings & Guidelines](../guidelines.md) — Architecture and implementation patterns
