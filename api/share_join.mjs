import { kv } from '@vercel/kv';
import { getUserIdFromCookie } from '../lib/kv.mjs';
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  let userId; try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const { share } = req.body || {};
  if (!share) return res.status(400).json({ error:'share required' });
  await kv.sadd(`share:${share}:members`, userId);
  return res.status(200).json({ ok:true });
}