import jwt from 'jsonwebtoken';
export function parseCookies(req){ const h=req.headers.cookie||''; const c={}; h.split(';').forEach(p=>{const [k,...r]=p.trim().split('='); if(!k)return; c[k]=decodeURIComponent(r.join('='));}); return c; }
export function signJWT(payload){ return jwt.sign(payload, process.env.JWT_SECRET, { algorithm:'HS256', expiresIn:'180d' }); }
export function verifyJWT(token){ return jwt.verify(token, process.env.JWT_SECRET); }
export function getUserIdFromCookie(req){ const t=parseCookies(req)['lb_auth']; if(!t) throw new Error('missing cookie'); return verifyJWT(t).user_id; }
export const nsKey=(u,k)=>`user:${u}:${k}`; export const nsHash=(u,b)=>`user:${u}:${b}`;