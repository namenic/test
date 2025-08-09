export default async function handler(req, res){
  const mask = v => (v && String(v).length > 3 ? true : false);
  res.status(200).json({ ok:true, environment: process.env.VERCEL_ENV || 'unknown', env:{
    PLAID_CLIENT_ID: mask(process.env.PLAID_CLIENT_ID),
    PLAID_SECRET: mask(process.env.PLAID_SECRET),
    PLAID_ENV: process.env.PLAID_ENV || null,
    PLAID_COUNTRY_CODES: process.env.PLAID_COUNTRY_CODES || null,
    JWT_SECRET: mask(process.env.JWT_SECRET),
    KV_REST_API_URL: mask(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: mask(process.env.KV_REST_API_TOKEN)
  }});
}