import { kv } from '@vercel/kv';
import { getUserIdFromCookie } from '../lib/kv.mjs';

export default async function handler(req, res){
  let userId; try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const share = req.query?.share;
  if (!share) return res.status(400).json({ error:'share required' });
  if (req.method === 'POST'){
    await kv.hset(`share:${share}:presence`, { [userId]: String(Date.now()) });
    return res.status(200).json({ ok:true });
  }
  if (req.method === 'GET'){
    const map = await kv.hgetall(`share:${share}:presence`) || {};
    const now = Date.now(); const online = [];
    for (const [u, ts] of Object.entries(map)){
      if (now - Number(ts) < 120000) online.push(u); // 2 min
    }
    return res.status(200).json({ online });
  }
  return res.status(405).json({ error:'Method not allowed' });
}