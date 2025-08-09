import { kv } from '@vercel/kv';
import fetch from 'node-fetch';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
});
const plaid = new PlaidApi(config);

export default async function handler(req, res){
  // Intended to be called by a Vercel Cron. No auth; not publicized.
  try{
    // naive: get all user IDs we know from a set (append on login not implemented). For demo, scan shares for members.
    const keys = await kv.keys('share:*:members');
    let totalNew = 0;
    for (const k of (keys||[])){
      const share = k.split(':')[1];
      const members = await kv.smembers(k) || [];
      for (const u of members){
        const itemIds = await kv.smembers(`user:${u}:plaid:items`) || [];
        const tokenMap = await kv.hgetall(`user:${u}:plaid:tokens`) || {};
        for (const item_id of itemIds){
          const access_token = tokenMap[item_id]; if (!access_token) continue;
          let cursor = await kv.hget(`user:${u}:plaid:cursors`, item_id);
          let has_more = true;
          while (has_more){
            const resp = await plaid.transactionsSync({ access_token, cursor: cursor || undefined });
            const added = resp.data.added || [];
            if (added.length){
              const pendingKey = `user:${u}:plaid:pending-tx`;
              await kv.lpush(pendingKey, ...added.map(t=>JSON.stringify(t)));
              totalNew += added.length;
            }
            cursor = resp.data.next_cursor; has_more = resp.data.has_more;
          }
          if (cursor) await kv.hset(`user:${u}:plaid:cursors`, { [item_id]: cursor });
        }
        // optional email if configured
        const email = await kv.get(`user:${u}:email`);
        if (email && process.env.RESEND_API_KEY){
          await fetch('https://api.resend.com/emails', {
            method:'POST',
            headers:{'Authorization':`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
            body: JSON.stringify({ from:'Budget <noreply@yourapp.dev>', to:[email], subject:'Nightly sync complete', html:`<p>New transactions processed: ${totalNew}</p>` })
          });
        }
      }
    }
    res.status(200).json({ ok:true, processed: totalNew });
  } catch(e){ res.status(500).json({ error: e.message || String(e) }); }
}