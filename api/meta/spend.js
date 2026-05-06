// Vercel Serverless Function: /api/meta/spend
// Fetches ad spend from Meta Marketing API for a given date range

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
    return res.status(400).json({ error: 'since and until query params required (YYYY-MM-DD)' });
  }

  try {
    // Fetch campaign-level insights
    const accountId = META_AD_ACCOUNT_ID.startsWith('act_')
      ? META_AD_ACCOUNT_ID
      : `act_${META_AD_ACCOUNT_ID}`;

    const fields = 'campaign_name,campaign_id,spend,impressions,clicks,actions,cost_per_action_type,purchase_roas';
    const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=${fields}&time_range={"since":"${since}","until":"${until}"}&level=${level}&limit=500&access_token=${META_ACCESS_TOKEN}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errData = await response.json();
      return res.status(response.status).json({
        error: `Meta API error: ${errData.error?.message || JSON.stringify(errData)}`,
      });
    }

    const data = await response.json();
    const campaigns = data.data || [];

    // Process into clean summary
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;

    const campaignBreakdown = campaigns.map((c) => {
      const spend = parseFloat(c.spend || 0);
      totalSpend += spend;
      totalImpressions += parseInt(c.impressions || 0);
      totalClicks += parseInt(c.clicks || 0);

      // Extract purchases from actions
      const purchases = c.actions?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );
      const purchaseCount = purchases ? parseInt(purchases.value || 0) : 0;
      totalPurchases += purchaseCount;

      // Extract cost per purchase
      const cpp = c.cost_per_action_type?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
      );

      return {
        campaignName: c.campaign_name,
        campaignId: c.campaign_id,
        spend,
        impressions: parseInt(c.impressions || 0),
        clicks: parseInt(c.clicks || 0),
        purchases: purchaseCount,
        costPerPurchase: cpp ? parseFloat(cpp.value) : spend / (purchaseCount || 1),
        roas: c.purchase_roas?.[0]?.value ? parseFloat(c.purchase_roas[0].value) : 0,
      };
    });

    return res.status(200).json({
      summary: {
        totalSpend,
        totalImpressions,
        totalClicks,
        totalPurchases,
        avgCPP: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      },
      campaigns: campaignBreakdown,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
