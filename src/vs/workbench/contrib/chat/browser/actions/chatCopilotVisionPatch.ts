/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IExtensionManagementService, InstallOperation } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { localize } from '../../../../../nls.js';

const COPILOT_CHAT_EXTENSION_ID = 'github.copilot-chat';

const VISION_RETRY_SENTINEL = '/* __vision_retry_patched__ */';

const PATCHES: { exact: string; replacement: string; regex: RegExp }[] = [
	{
		exact: 'isEditorPreviewFeaturesEnabled(){return this.getTokenValue("editor_preview_features")!=="0"}',
		replacement: 'isEditorPreviewFeaturesEnabled(){return!0}',
		regex: /isEditorPreviewFeaturesEnabled\(\)\{return[^}]*?\}/g,
	},
	{
		exact: '!this.promptEndpoint.supportsVision||!this.authService.copilotToken?.isEditorPreviewFeaturesEnabled()',
		replacement: '!1',
		regex: /!this\.promptEndpoint\.supportsVision\|\|!this\.authService\.copilotToken\?\.isEditorPreviewFeaturesEnabled\(\)/g,
	},
	{
		exact: 'this.supportsVision=!!e.capabilities.supports.vision',
		replacement: 'this.supportsVision=!0',
		regex: /this\.supportsVision=!!e\.capabilities\.supports\.vision/g,
	},
	{
		// Remove the Copilot-Vision-Request header that triggers server-side org policy check
		exact: '',
		replacement: '',
		regex: /\w+\.messages\?\.\s*some\(\w+=>\s*Array\.isArray\(\w+\.content\)\?\w+\.content\.some\(\w+=>"image_url"\s*in\s*\w+\):!1\)&&\w+\.supportsVision&&\(\w+\["Copilot-Vision-Request"\]="true"\)/g,
	},
];

// Patch 5: Wrap fetchMany to retry without images when server rejects with vision error
const VISION_RETRY_REGEX = /async fetchMany\((\w+),(\w+)\)\{let\{debugName:(\w+),endpoint:(\w+),finishedCb:(\w+),location:(\w+),messages:(\w+),requestOptions:(\w+),/g;

export class CopilotVisionPatchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.copilotVisionPatch';

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		// Patch on startup for any already-installed but unpatched bundles
		this.patchInstalledExtensions();

		// Patch after extension install/update
		this._register(this.extensionManagementService.onDidInstallExtensions(results => {
			for (const { identifier, operation, local } of results) {
				if (areSameExtensions(identifier, { id: COPILOT_CHAT_EXTENSION_ID })
					&& (operation === InstallOperation.Install || operation === InstallOperation.Update)
					&& local) {
					const bundleUri = URI.joinPath(local.location, 'dist', 'extension.js');
					this.patchBundle(bundleUri, true);
				}
			}
		}));
	}

	private async patchInstalledExtensions(): Promise<void> {
		try {
			const installed = await this.extensionManagementService.getInstalled();
			for (const ext of installed) {
				if (areSameExtensions(ext.identifier, { id: COPILOT_CHAT_EXTENSION_ID })) {
					const bundleUri = URI.joinPath(ext.location, 'dist', 'extension.js');
					await this.patchBundle(bundleUri, false);
				}
			}
		} catch (err) {
			this.logService.warn('[CopilotVisionPatch] Failed to scan installed extensions:', err);
		}
	}

	private async patchBundle(bundleUri: URI, promptReload: boolean): Promise<void> {
		try {
			if (!await this.fileService.exists(bundleUri)) {
				this.logService.info(`[CopilotVisionPatch] Bundle not found: ${bundleUri.toString()}`);
				return;
			}

			const raw = await this.fileService.readFile(bundleUri);
			let content = raw.value.toString();
			let changed = false;

			for (const patch of PATCHES) {
				if (content.includes(patch.exact)) {
					content = content.split(patch.exact).join(patch.replacement);
					changed = true;
				} else if (patch.regex.test(content)) {
					// Reset regex lastIndex after test()
					patch.regex.lastIndex = 0;
					content = content.replace(patch.regex, patch.replacement);
					changed = true;
				}
			}

			// Patch 5: Wrap fetchMany to retry without images on server-side vision rejection
			if (!content.includes(VISION_RETRY_SENTINEL)) {
				VISION_RETRY_REGEX.lastIndex = 0;
				const retryPatched = content.replace(VISION_RETRY_REGEX,
					(_match: string, p1: string, p2: string, p3: string, p4: string, p5: string, p6: string, p7: string, p8: string) =>
						`${VISION_RETRY_SENTINEL}async fetchMany(${p1},${p2}){` +
						`let _vr=await this._fetchManyOrigVR(${p1},${p2});` +
						`if(_vr.type==="failed"&&_vr.reason&&/vision/i.test(_vr.reason)){` +
						`let _sm=${p1}.messages;` +
						`if(_sm&&_sm.some(_m=>Array.isArray(_m.content)&&_m.content.some(_p=>"imageUrl"in _p))){` +
						`let _sl=_sm.map(_m=>Array.isArray(_m.content)?{..._m,content:_m.content.filter(_p=>!("imageUrl"in _p))}:_m);` +
						`return this._fetchManyOrigVR({...${p1},messages:_sl},${p2})}}` +
						`return _vr}` +
						`async _fetchManyOrigVR(${p1},${p2}){let{debugName:${p3},endpoint:${p4},finishedCb:${p5},location:${p6},messages:${p7},requestOptions:${p8},`
				);
				if (retryPatched !== content) {
					content = retryPatched;
					changed = true;
				}
			}

			if (!changed) {
				this.logService.info(`[CopilotVisionPatch] Bundle already patched or patterns not found: ${bundleUri.toString()}`);
				return;
			}

			await this.fileService.writeFile(bundleUri, VSBuffer.fromString(content));
			this.logService.info(`[CopilotVisionPatch] Successfully patched: ${bundleUri.toString()}`);

			if (promptReload) {
				this.notificationService.prompt(
					Severity.Info,
					localize('copilotVisionPatch.reload', "Copilot Chat extension has been patched to enable vision. Please reload to apply."),
					[{
						label: localize('copilotVisionPatch.reloadNow', "Reload Now"),
						run: () => this.hostService.reload()
					}]
				);
			}
		} catch (err) {
			this.logService.warn(`[CopilotVisionPatch] Failed to patch bundle ${bundleUri.toString()}:`, err);
		}
	}
}
