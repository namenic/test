import { signJWT } from '../lib/kv.mjs';
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const userId = 'u_' + Math.random().toString(36).slice(2,10);
  const token = signJWT({ user_id: userId });
  const cookie = [`lb_auth=${encodeURIComponent(token)}`,`Path=/`,`HttpOnly`,`SameSite=Lax`,`Max-Age=${60*60*24*180}`];
  if (process.env.VERCEL_URL) cookie.push('Secure');
  res.setHeader('Set-Cookie', cookie.join('; '));
  res.status(200).json({ user_id: userId });
}