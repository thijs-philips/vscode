/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/issues/XXXXX — Global toolbar strip

// This proposal allows extensions to contribute toolbar actions to the global
// toolbar strip located directly below the title/menu bar via the
// `window/toolbar` menu contribution point.
//
// Usage in `package.json`:
// ```json
// "contributes": {
//   "menus": {
//     "window/toolbar": [
//       { "command": "myExtension.myCommand", "group": "navigation" }
//     ]
//   }
// }
// ```
