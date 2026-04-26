export const maxDuration = 60;

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'API token not configured' });

  try {
    const { prompt, imageUrl, predictionId } = req.body;

    // ポーリングモード
    if (predictionId) {
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pollData = await poll.json();
      console.log('Kontext poll status:', pollData.status);
      if (pollData.status === 'succeeded' && pollData.output) {
        const output = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        return res.status(200).json({ url: output });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return res.status(500).json({ error: 'Generation failed', detail: pollData.error });
      }
      return res.status(202).json({ status: pollData.status, predictionId });
    }

    if (!prompt || !imageUrl) {
      return res.status(400).json({ error: 'prompt and imageUrl are required' });
    }

    console.log('Kontext request - prompt:', prompt.slice(0, 80), 'imageUrl:', imageUrl.slice(0, 80));

    const response = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: imageUrl,
            output_format: 'png',
            output_quality: 90,
            safety_tolerance: 2,
          }
        })
      }
    );

    const data = await response.json();
    console.log('Kontext status:', response.status, 'id:', data.id);

    if (!response.ok) {
      return res.status(500).json({ error: 'Kontext API error', detail: data });
    }

    if (data.output) {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      return res.status(200).json({ url: output });
    }

    if (data.id) {
      return res.status(202).json({ predictionId: data.id });
    }

    return res.status(500).json({ error: 'No output', raw: data });

  } catch (e) {
    console.log('Kontext error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
