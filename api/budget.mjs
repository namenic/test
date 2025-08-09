import { kv } from '@vercel/kv';
import { getUserIdFromCookie, nsKey } from '../lib/kv.mjs';

export default async function handler(req, res){
  let userId;
  try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const share = (req.query?.share)||null;
  const key = share ? `share:${share}:budget:state` : nsKey(userId, 'budget:state');

  if (share){
    const isMember = await kv.sismember(`share:${share}:members`, userId);
    if (!isMember) return res.status(403).json({ error:'not a member of this shared budget' });
  }

  if (req.method === 'GET'){
    const state = await kv.get(key);
    return res.status(200).json(state || {});
  }
  if (req.method === 'POST'){
    const body = req.body || {};
    await kv.set(key, body);
    return res.status(200).json({ ok:true });
  }
  return res.status(405).json({ error:'Method not allowed' });
}