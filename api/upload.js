/**
 * /api/upload
 * フロントから受け取った画像バイナリをReplicateのFiles APIにアップロードしてURLを返す
 */

export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'API token not configured' });

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const mime = mimeType || 'image/jpeg';
    const imageBuffer = Buffer.from(base64Data, 'base64');

    console.log('Uploading to Replicate Files API, size:', imageBuffer.length, 'mime:', mime);

    const uploadRes = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': mime,
      },
      body: imageBuffer,
    });

    const uploadData = await uploadRes.json();
    console.log('Upload response:', uploadRes.status, JSON.stringify(uploadData).slice(0, 200));

    if (!uploadRes.ok) {
      return res.status(500).json({ error: 'Upload failed', detail: uploadData });
    }

    const imageUrl = uploadData.urls?.get || uploadData.url;
    return res.status(200).json({ imageUrl });

  } catch (e) {
    console.log('Upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
