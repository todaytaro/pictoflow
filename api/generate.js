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
    const { prompt, predictionId } = req.body || {};

    // Polling mode: client passes back the predictionId until succeeded.
    if (predictionId) {
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pollData = await poll.json();
      console.log('Generate poll status:', pollData.status);

      if (pollData.status === 'succeeded' && pollData.output?.[0]) {
        return res.status(200).json({ url: pollData.output[0] });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return res.status(500).json({
          error: 'Generation failed',
          detail: pollData.error || pollData.status,
        });
      }
      return res.status(202).json({ status: pollData.status, predictionId });
    }

    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const response = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'webp',
            output_quality: 90,
            num_inference_steps: 4,
          },
        }),
      }
    );

    const data = await response.json();
    console.log('Generate create status:', response.status, 'id:', data.id);

    if (!response.ok) {
      // Pass 429 through with retry_after so the client can wait + retry.
      if (response.status === 429) {
        return res.status(429).json({
          error: 'Rate limited',
          retry_after: data?.retry_after || 10,
          detail: data,
        });
      }
      return res.status(response.status === 422 ? 422 : 502).json({
        error: 'Replicate API error',
        status: response.status,
        detail: data,
      });
    }

    if (data.output?.[0]) {
      return res.status(200).json({ url: data.output[0] });
    }

    if (data.id) {
      return res.status(202).json({ predictionId: data.id });
    }

    return res.status(502).json({ error: 'No output from Replicate', raw: data });
  } catch (e) {
    console.log('Generate exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
