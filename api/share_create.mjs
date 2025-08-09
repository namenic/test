import { kv } from '@vercel/kv';
import { getUserIdFromCookie } from '../lib/kv.mjs';
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  let userId; try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const share = 's_' + Math.random().toString(36).slice(2,10);
  await kv.sadd(`share:${share}:members`, userId);
  return res.status(200).json({ share });
}