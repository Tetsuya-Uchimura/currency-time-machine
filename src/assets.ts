/**
 * Asset manifest. Everything visual is procedural or loaded by the bands
 * themselves (photos, map data); only the UIKitML hand panel is loaded here.
 */
import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'hand-panel': uikitml('hand-panel.uikitml', 'Hand Panel'),
});
