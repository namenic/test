import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } },
});
const plaid = new PlaidApi(config);
export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) return res.status(500).json({ error: 'Missing PLAID env vars' });
    const country_codes = (process.env.PLAID_COUNTRY_CODES || 'US,CA').split(',').map(s=>s.trim());
    const redirect_uri = process.env.PLAID_REDIRECT_URI;
    const body = { user:{ client_user_id:'web-'+Math.random().toString(36).slice(2,10) }, client_name:'Local Budget', products:['transactions'], country_codes, language:'en' };
    if (redirect_uri) body.redirect_uri = redirect_uri;
    const resp = await plaid.linkTokenCreate(body);
    res.status(200).json({ link_token: resp.data.link_token });
  } catch(e){ res.status(500).json({ error: e.response?.data || e.message }); }
}