import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { kv } from '@vercel/kv';
import { parseCookies, signJWT, getUserIdFromCookie, nsKey, nsHash } from '../lib/kv.mjs';

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
});
const plaid = new PlaidApi(config);

function ok(res, data){ res.status(200).json(data); }
function bad(res, code, msg){ res.status(code).json({ error: msg }); }

async function collectForUser(plaidClient, userId){
  const results = { added:[], modified:[], removed:[], cursors:{} };
  const pendingKey = nsHash(userId,'plaid:pending-tx');
  const pending = await kv.lrange(pendingKey,0,-1);
  if (pending && pending.length){
    await kv.del(pendingKey);
    const added = pending.map(p=>JSON.parse(p));
    const cursors = await kv.hgetall(nsHash(userId,'plaid:cursors')) || {};
    results.added.push(...added); results.cursors = { ...results.cursors, ...cursors };
  }
  const itemIds = await kv.smembers(nsHash(userId,'plaid:items'));
  const tokenMap = await kv.hgetall(nsHash(userId,'plaid:tokens'));
  for (const item_id of itemIds || []){
    const access_token = tokenMap?.[item_id]; if (!access_token) continue;
    let cursor = await kv.hget(nsHash(userId,'plaid:cursors'), item_id);
    let has_more = true;
    while (has_more){
      const resp = await plaidClient.transactionsSync({ access_token, cursor: cursor || undefined });
      results.added.push(...resp.data.added);
      results.modified.push(...resp.data.modified);
      results.removed.push(...resp.data.removed);
      cursor = resp.data.next_cursor; has_more = resp.data.has_more;
    }
    results.cursors[item_id] = cursor;
    await kv.hset(nsHash(userId,'plaid:cursors'), { [item_id]: cursor });
  }
  const manualKey = nsHash(userId, 'manual:tx');
  const manual = await kv.lrange(manualKey, 0, -1);
  if (manual && manual.length){
    const manualObjs = manual.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    results.added.push(...manualObjs);
  }
  return results;
}

export default async function handler(req, res){
  const url = new URL(req.url, 'http://localhost');
  const action = (req.body?.action) || url.searchParams.get('a') || 'diag';

  try{
    if (action === 'diag'){
      const mask = v => (v && String(v).length > 3 ? true : false);
      return ok(res, { ok:true, env:{
        PLAID_CLIENT_ID: mask(process.env.PLAID_CLIENT_ID),
        PLAID_SECRET: mask(process.env.PLAID_SECRET),
        PLAID_ENV: process.env.PLAID_ENV || null,
        PLAID_COUNTRY_CODES: process.env.PLAID_COUNTRY_CODES || null,
        JWT_SECRET: mask(process.env.JWT_SECRET),
        KV_REST_API_URL: mask(process.env.KV_REST_API_URL),
        KV_REST_API_TOKEN: mask(process.env.KV_REST_API_TOKEN)
      }});
    }

    if (action === 'auth_login'){
      const userId = 'u_' + Math.random().toString(36).slice(2,10);
      const token = signJWT({ user_id: userId });
      const cookie = [`lb_auth=${encodeURIComponent(token)}`,`Path=/`,`HttpOnly`,`SameSite=Lax`,`Max-Age=${60*60*24*180}`];
      if (process.env.VERCEL_URL) cookie.push('Secure');
      res.setHeader('Set-Cookie', cookie.join('; '));
      return ok(res, { user_id: userId });
    }

    // gated actions
    let userId;
    try { userId = getUserIdFromCookie(req); } catch { userId = null; }
    const needAuth = ['create_link_token','exchange_public_token','tx_sync','budget_get','budget_set','tx_import','share_create','share_join','presence_get','presence_ping','subscribe_email'];
    if (needAuth.includes(action) && !userId) return bad(res, 401, 'unauthorized');

    if (action === 'create_link_token'){
      const country_codes = (process.env.PLAID_COUNTRY_CODES || 'US,CA').split(',').map(s=>s.trim());
      const redirect_uri = process.env.PLAID_REDIRECT_URI;
      const body = { user:{ client_user_id:'web-'+Math.random().toString(36).slice(2,10) }, client_name:'Local Budget', products:['transactions'], country_codes, language:'en' };
      if (redirect_uri) body.redirect_uri = redirect_uri;
      const resp = await plaid.linkTokenCreate(body);
      return ok(res, { link_token: resp.data.link_token });
    }

    if (action === 'exchange_public_token'){
      const public_token = req.body?.public_token;
      if (!public_token) return bad(res, 400, 'missing public_token');
      const exchange = await plaid.itemPublicTokenExchange({ public_token });
      const access_token = exchange.data.access_token; const item_id = exchange.data.item_id;
      await kv.hset(nsHash(userId,'plaid:tokens'), { [item_id]: access_token });
      await kv.sadd(nsHash(userId,'plaid:items'), item_id);
      return ok(res, { item_id });
    }

    if (action === 'tx_sync'){
      const share = url.searchParams.get('share');
      if (!share){
        const r = await collectForUser(plaid, userId);
        return ok(res, r);
      } else {
        const isMember = await kv.sismember(`share:${share}:members`, userId);
        if (!isMember) return bad(res, 403, 'not a member of this share');
        const members = await kv.smembers(`share:${share}:members`) || [];
        const acc = { added:[], modified:[], removed:[], cursors:{} };
        for (const m of members){
          const r = await collectForUser(plaid, m);
          acc.added.push(...r.added); acc.modified.push(...r.modified); acc.removed.push(...r.removed);
          acc.cursors = { ...acc.cursors, ...r.cursors };
        }
        return ok(res, acc);
      }
    }

    if (action === 'budget_get' || action === 'budget_set'){
      const share = url.searchParams.get('share');
      const key = share ? `share:${share}:budget:state` : nsKey(userId,'budget:state');
      if (share){
        const isMember = await kv.sismember(`share:${share}:members`, userId);
        if (!isMember) return bad(res, 403, 'not a member of this shared budget');
      }
      if (action === 'budget_get'){
        const state = await kv.get(key);
        return ok(res, state || {});
      } else {
        const body = req.body || {};
        await kv.set(key, body);
        return ok(res, { ok:true });
      }
    }

    if (action === 'tx_import'){
      const rows = req.body?.rows || [];
      if (!Array.isArray(rows) || !rows.length) return bad(res, 400, 'rows[] required');
      const norm = rows.map(r => ({ date: r.date || r.Date || r.posted || null, name: r.name || r.description || r.payee || r.Name || '', merchant_name: r.merchant_name || undefined, amount: Math.abs(parseFloat(r.amount || r.Amount || 0)) || 0, _source: 'manual' }));
      const key = nsHash(userId, 'manual:tx');
      const payload = norm.map(o => JSON.stringify(o));
      await kv.lpush(key, ...payload);
      return ok(res, { ok:true, imported: norm.length });
    }

    if (action === 'share_create'){
      const share = 's_' + Math.random().toString(36).slice(2,10);
      await kv.sadd(`share:${share}:members`, userId);
      return ok(res, { share });
    }
    if (action === 'share_join'){
      const share = req.body?.share;
      if (!share) return bad(res, 400, 'share required');
      await kv.sadd(`share:${share}:members`, userId);
      return ok(res, { ok:true });
    }

    if (action === 'presence_ping'){
      const share = url.searchParams.get('share');
      if (!share) return bad(res, 400, 'share required');
      await kv.hset(`share:${share}:presence`, { [userId]: String(Date.now()) });
      return ok(res, { ok:true });
    }
    if (action === 'presence_get'){
      const share = url.searchParams.get('share');
      if (!share) return bad(res, 400, 'share required');
      const map = await kv.hgetall(`share:${share}:presence`) || {};
      const now = Date.now(); const online = [];
      for (const [u, ts] of Object.entries(map)){
        if (now - Number(ts) < 120000) online.push(u);
      }
      return ok(res, { online });
    }

    if (action === 'subscribe_email'){
      const email = req.body?.email;
      if (!email) return bad(res, 400, 'email required');
      await kv.set(nsKey(userId,'email'), email);
      return ok(res, { ok:true });
    }

    return bad(res, 404, 'Unknown action');
  } catch (e){
    return res.status(500).json({ error: e.response?.data || e.message || String(e) });
  }
}
