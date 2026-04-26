export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'not configured' });
  return res.status(200).json({ token });
}
