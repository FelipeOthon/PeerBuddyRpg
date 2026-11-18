import { base64ToUint8, uint8ToBase64 } from '../net/chunker.js';
import { listAllAssets, loadKV, saveAssetBlob, saveKV } from './db.js';

/**
 * Exporta toda a campanha (cenas, mapas, tokens, fichas, PDFs, notas e assets) para JSON.
 */
export async function exportCampaignBundle() {
  const campaign = await loadKV('campaign_state', {});
  const assetsRaw = await listAllAssets();
  const assets = assetsRaw.map((a) => ({
    assetId: a.assetId,
    mime: a.mime,
    dataBase64: uint8ToBase64(new Uint8Array(a.bytes)),
  }));
  return {
    format: 'peerbuddy-campaign-v1',
    exportedAt: new Date().toISOString(),
    campaign,
    assets,
  };
}

export async function importCampaignBundle(bundle) {
  if (!bundle || bundle.format !== 'peerbuddy-campaign-v1') {
    throw new Error('Arquivo de backup de campanha inválido.');
  }
  if (Array.isArray(bundle.assets)) {
    for (const a of bundle.assets) {
      if (a.assetId && a.dataBase64) {
        await saveAssetBlob(a.assetId, a.mime || 'application/octet-stream', base64ToUint8(a.dataBase64));
      }
    }
  }
  if (bundle.campaign) {
    await saveKV('campaign_state', bundle.campaign);
  }
  return bundle.campaign;
}
