// Vercel Serverless Function: /api/meta/campaigns
// Fetches detailed campaign + adset level data from Meta

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID } = process.env;
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return res.status(500).json({ error: 'Meta credentials not configured' });
  }

  const { since, until, level = 'campaign' } = req.query;
  if (!since || !until) {
    return res.status(400).json({ error: 'since and until required' });
  }

  const accountId = META_AD_ACCOUNT_ID.startsWith('act_') ? META_AD_ACCOUNT_ID : `act_${META_AD_ACCOUNT_ID}`;

  try {
    const allData = [];
    const fields = 'campaign_name,campaign_id,adset_name,adset_id,ad_name,ad_id,spend,impressions,clicks,actions,cost_per_action_type,purchase_roas,cpm,cpc,ctr';
    let url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=${level}&limit=500&access_token=${META_ACCESS_TOKEN}`;

    // Paginate
    while (url) {
      const resp = await fetch(url);
      if (!resp.ok) {
        const err = await resp.json();
        return res.status(resp.status).json({ error: `Meta API: ${err.error?.message || JSON.stringify(err)}` });
      }
      const json = await resp.json();
      allData.push(...(json.data || []));
      url = json.paging?.next || null;
    }

    // Process
    const rows = allData.map(r => {
      const spend = parseFloat(r.spend || 0);
      const impressions = parseInt(r.impressions || 0);
      const clicks = parseInt(r.clicks || 0);
      const purchaseAction = r.actions?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
      const purchases = purchaseAction ? parseInt(purchaseAction.value || 0) : 0;
      const atcAction = r.actions?.find(a => a.action_type === 'add_to_cart' || a.action_type === 'offsite_conversion.fb_pixel_add_to_cart');
      const atc = atcAction ? parseInt(atcAction.value || 0) : 0;
      const icAction = r.actions?.find(a => a.action_type === 'initiate_checkout' || a.action_type === 'offsite_conversion.fb_pixel_initiate_checkout');
      const ic = icAction ? parseInt(icAction.value || 0) : 0;
      const cpp = r.cost_per_action_type?.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
      const roas = r.purchase_roas?.[0]?.value ? parseFloat(r.purchase_roas[0].value) : 0;

      return {
        campaignName: r.campaign_name || '', campaignId: r.campaign_id || '',
        adsetName: r.adset_name || '', adsetId: r.adset_id || '',
        adName: r.ad_name || '', adId: r.ad_id || '',
        spend, impressions, clicks, purchases, atc, ic,
        ctr: impressions > 0 ? (clicks / impressions * 100) : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? spend / impressions * 1000 : 0,
        cpp: cpp ? parseFloat(cpp.value) : (purchases > 0 ? spend / purchases : 0),
        roas,
      };
    });

    return res.status(200).json({ data: rows, count: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
