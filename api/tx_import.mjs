import { kv } from '@vercel/kv';
import { getUserIdFromCookie, nsHash } from '../lib/kv.mjs';
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  let userId;
  try { userId = getUserIdFromCookie(req); } catch { return res.status(401).json({ error:'unauthorized' }); }
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length){ return res.status(400).json({ error:'rows[] required' }); }
  const norm = rows.map(r => ({ date: r.date || r.Date || r.posted || null, name: r.name || r.description || r.payee || r.Name || '', merchant_name: r.merchant_name || undefined, amount: Math.abs(parseFloat(r.amount || r.Amount || 0)) || 0, _source: 'manual' }));
  const key = nsHash(userId, 'manual:tx');
  const payload = norm.map(o => JSON.stringify(o));
  await kv.lpush(key, ...payload);
  return res.status(200).json({ ok:true, imported: norm.length });
}