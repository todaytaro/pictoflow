export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'REMOVE_BG_API_KEY が設定されていません' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuffer = Buffer.concat(chunks);

    const removeBgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': req.headers['content-type'],
      },
      body: bodyBuffer,
    });

    if (!removeBgRes.ok) {
      if (removeBgRes.status === 402) return res.status(402).json({ error: 'Remove.bg のクレジットが不足しています' });
      if (removeBgRes.status === 429) return res.status(429).json({ error: 'リクエストが多すぎます。少し待ってから再試行してください' });
      return res.status(removeBgRes.status).json({ error: `背景除去に失敗しました (${removeBgRes.status})` });
    }

    const buffer = await removeBgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return res.status(200).json({
      imageBase64: `data:image/png;base64,${base64}`,
    });

  } catch (e) {
    console.error('remove-bg error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

export const config = {
  api: { bodyParser: false },
};
