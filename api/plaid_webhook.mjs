import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { kv } from '@vercel/kv';
const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
});
const plaid = new PlaidApi(config);
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  try{
    const body = req.body || {};
    const item_id = body.item_id;
    const webhook_type = body.webhook_type;
    const webhook_code = body.webhook_code;
    const userId = (req.query?.user_id) || 'public';
    if (!item_id) return res.status(200).json({ ok:true });
    await kv.hset(`user:${userId}:plaid:webhook:last`, { [item_id]: JSON.stringify({ webhook_type, webhook_code, ts: Date.now() }) });
    const tokens = await kv.hgetall(`user:${userId}:plaid:tokens`);
    const access_token = tokens?.[item_id]; if (!access_token) return res.status(200).json({ ok:true });
    let cursor = await kv.hget(`user:${userId}:plaid:cursors`, item_id);
    let has_more = true; const pendingKey = `user:${userId}:plaid:pending-tx`;
    while (has_more){
      const resp = await plaid.transactionsSync({ access_token, cursor: cursor || undefined });
      if (resp.data.added?.length){
        const txStrings = resp.data.added.map(t=>JSON.stringify(t));
        await kv.lpush(pendingKey, ...txStrings);
      }
      cursor = resp.data.next_cursor; has_more = resp.data.has_more;
    }
    if (cursor) await kv.hset(`user:${userId}:plaid:cursors`, { [item_id]: cursor });
    return res.status(200).json({ ok:true });
  } catch(e){ return res.status(200).json({ ok:true }); }
}