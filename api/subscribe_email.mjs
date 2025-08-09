import { kv } from '@vercel/kv';
import { getUserIdFromCookie, nsKey } from '../lib/kv.mjs';
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  let userId; try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error:'email required' });
  await kv.set(nsKey(userId,'email'), email);
  return res.status(200).json({ ok:true });
}