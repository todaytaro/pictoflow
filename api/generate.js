export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'API token not configured' });

  try {
    const { prompt, imageBase64, predictionId } = req.body;

    // ポーリングモード
    if (predictionId) {
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pollData = await poll.json();
      console.log('Poll status:', pollData.status);
      if (pollData.status === 'succeeded' && pollData.output?.[0]) {
        return res.status(200).json({ url: pollData.output[0] });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        console.log('Poll error:', JSON.stringify(pollData.error));
        return res.status(500).json({ error: 'Generation failed', detail: pollData.error });
      }
      return res.status(202).json({ status: pollData.status, predictionId });
    }

    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    if (imageBase64) {
      return await generateWithBria(token, prompt, imageBase64, res);
    } else {
      return await generateWithFlux(token, prompt, res);
    }

  } catch (e) {
    console.log('Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function generateWithBria(token, prompt, imageBase64, res) {
  // base64 → Replicateのファイルアップロードに変換
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Replicate Files APIにアップロード
  const uploadRes = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    console.log('Upload error:', JSON.stringify(err));
    return res.status(500).json({ error: 'Image upload failed', detail: err });
  }

  const uploadData = await uploadRes.json();
  const imageUrl = uploadData.urls?.get || uploadData.url;
  console.log('Uploaded image URL:', imageUrl);

  // Briaに画像URLで渡す
  const response = await fetch(
    'https://api.replicate.com/v1/models/bria/generate-background/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          image: imageUrl,
          prompt: prompt,
          num_results: 1,
        }
      })
    }
  );

  const data = await response.json();
  console.log('Bria status:', response.status);
  console.log('Bria prediction id:', data.id);

  if (!response.ok) {
    return res.status(500).json({ error: 'Bria API error', detail: data });
  }

  if (data.output && data.output[0]) {
    return res.status(200).json({ url: data.output[0] });
  }

  if (data.id) {
    return res.status(202).json({ predictionId: data.id });
  }

  return res.status(500).json({ error: 'No output', raw: data });
}

async function generateWithFlux(token, prompt, res) {
  const response = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: '1:1',
          output_format: 'png',
          output_quality: 90
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    return res.status(500).json({ error: 'Replicate API error', status: response.status, detail: data });
  }
  if (data.output && data.output[0]) {
    return res.status(200).json({ url: data.output[0] });
  }
  if (data.id) {
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pollData = await poll.json();
      if (pollData.status === 'succeeded' && pollData.output?.[0]) {
        return res.status(200).json({ url: pollData.output[0] });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return res.status(500).json({ error: 'Generation failed', detail: pollData.error });
      }
    }
    return res.status(500).json({ error: 'Timeout' });
  }
  return res.status(500).json({ error: 'No output', raw: data });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
