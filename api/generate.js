export const maxDuration = 60;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
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
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const response = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
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
            output_format: 'webp',
            output_quality: 90,
            num_inference_steps: 4
          }
        })
      }
    );

    const data = await response.json();
    console.log('Replicate response status:', response.status);
    console.log('Replicate response data:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        error: 'Replicate API error',
        status: response.status,
        detail: data
      });
    }

    if (data.output && data.output[0]) {
      return res.status(200).json({ url: data.output[0] });
    }

    if (data.id) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const pollData = await poll.json();
        console.log('Poll status:', pollData.status);
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
  } catch (e) {
    console.log('Exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
