export const maxDuration = 60;

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
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
    const { prompt, input_image, predictionId } = req.body || {};

    console.log('[kontext] request received', {
      hasPrompt: !!prompt,
      promptLen: prompt ? prompt.length : 0,
      hasInputImage: !!input_image,
      inputImageKind: input_image
        ? (input_image.startsWith('data:') ? 'dataUri' : 'url')
        : 'none',
      inputImageBytes: input_image ? input_image.length : 0,
      predictionId: predictionId || null,
    });

    // ----- Polling phase -----
    if (predictionId) {
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const pollData = await poll.json();
      console.log('[kontext] poll', {
        predictionId,
        replicateStatus: pollData.status,
        hasOutput: !!pollData.output,
      });

      if (pollData.status === 'succeeded' && pollData.output) {
        const output = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        return res.status(200).json({ url: output });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return res.status(500).json({
          error: 'Generation failed',
          detail: pollData.error || pollData.status,
        });
      }
      return res.status(202).json({ status: pollData.status, predictionId });
    }

    // ----- Create phase -----
    if (!prompt || !input_image) {
      return res.status(400).json({ error: 'prompt and input_image are required' });
    }

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
            input_image,
            output_format: 'png',
            output_quality: 90,
            safety_tolerance: 2,
            prompt_upsampling: true,
          }
        })
      }
    );

    const data = await response.json();
    console.log('[kontext] create response', {
      httpStatus: response.status,
      predictionId: data.id,
      replicateStatus: data.status,
      hasError: !!data.error,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({
          error: 'Rate limited',
          retry_after: data?.retry_after || 10,
          detail: data,
        });
      }
      return res.status(response.status === 422 ? 422 : 502).json({
        error: 'Kontext API error',
        status: response.status,
        detail: data,
      });
    }

    if (data.output) {
      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      return res.status(200).json({ url: output });
    }

    if (data.id) {
      return res.status(202).json({ predictionId: data.id });
    }

    return res.status(502).json({ error: 'No output from Replicate', raw: data });
  } catch (e) {
    console.log('[kontext] exception:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
