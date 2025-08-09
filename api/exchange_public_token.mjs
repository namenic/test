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
    const { public_token } = req.body || {}; if (!public_token) return res.status(400).json({ error:'missing public_token' });
    const exchange = await plaid.itemPublicTokenExchange({ public_token });
    const access_token = exchange.data.access_token; const item_id = exchange.data.item_id;
    await kv.hset(nsHash(userId,'plaid:tokens'), { [item_id]: access_token });
    await kv.sadd(nsHash(userId,'plaid:items'), item_id);
    res.status(200).json({ item_id });
  } catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
}