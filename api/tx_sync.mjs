import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { kv } from '@vercel/kv';
import { getUserIdFromCookie, nsHash } from '../lib/kv.mjs';
const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
});
const plaid = new PlaidApi(config);
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  let userId; try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  try{
    const pendingKey = nsHash(userId,'plaid:pending-tx');
    const pending = await kv.lrange(pendingKey,0,-1);
    if (pending && pending.length){
      await kv.del(pendingKey);
      const added = pending.map(p=>JSON.parse(p));
      const cursors = await kv.hgetall(nsHash(userId,'plaid:cursors')) || {};
      return res.status(200).json({ added, modified:[], removed:[], cursors });
    }
    const clientCursors = req.body?.cursors || {};
    const results = { added:[], removed:[], modified:[], cursors:{ ...clientCursors } };
    const itemIds = await kv.smembers(nsHash(userId,'plaid:items'));
    const tokenMap = await kv.hgetall(nsHash(userId,'plaid:tokens'));
    for (const item_id of itemIds || []){
      const access_token = tokenMap?.[item_id]; if (!access_token) continue;
      let cursor = clientCursors[item_id] || await kv.hget(nsHash(userId,'plaid:cursors'), item_id);
      let has_more = true;
      while (has_more){
        const resp = await plaid.transactionsSync({ access_token, cursor: cursor || undefined });
        results.added.push(...resp.data.added);
        results.modified.push(...resp.data.modified);
        results.removed.push(...resp.data.removed);
        cursor = resp.data.next_cursor; has_more = resp.data.has_more;
      }
      results.cursors[item_id] = cursor;
      await kv.hset(nsHash(userId,'plaid:cursors'), { [item_id]: cursor });
    }
    res.status(200).json(results);
  } catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
}