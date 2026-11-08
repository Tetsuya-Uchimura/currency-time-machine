/**
 * Asset manifest. Everything visual is procedural; only the two UIKitML
 * panels are loaded from public/ui/.
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
  'caption-panel': uikitml('caption.uikitml', 'Caption Panel'),
  'hand-panel': uikitml('hand-panel.uikitml', 'Hand Panel'),
});
