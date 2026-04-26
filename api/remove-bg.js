/**
 * /api/remove-bg
 * 商品画像の背景をRemove.bg APIで除去する
 * 
 * POST multipart/form-data
 *   image_file: File
 * 
 * Response JSON
 *   { imageBase64: string }  // base64 PNG
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'REMOVE_BG_API_KEY が設定されていません' });
  }

  try {
    // Vercel Serverless ではreq.bodyがBufferになるため、
    // Content-Typeヘッダーをそのままproxyする
    const contentType = req.headers['content-type'];

    // Remove.bg APIに直接転送
    const removeBgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': contentType,
      },
      body: req, // Node.js stream として転送
    });

    if (!removeBgRes.ok) {
      const errText = await removeBgRes.text();
      console.error('Remove.bg error:', errText);

      // API残高不足の場合
      if (removeBgRes.status === 402) {
        return res.status(402).json({ error: 'Remove.bg APIのクレジットが不足しています' });
      }
      // レート制限
      if (removeBgRes.status === 429) {
        return res.status(429).json({ error: 'リクエストが多すぎます。しばらく待ってから再試行してください' });
      }

      return res.status(removeBgRes.status).json({
        error: `背景除去に失敗しました (${removeBgRes.status})`
      });
    }

    // PNG バイナリを取得
    const buffer = await removeBgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    return res.status(200).json({
      imageBase64: dataUrl,
      // Remove.bg の残クレジットをログ（デバッグ用）
      creditsCharged: removeBgRes.headers.get('X-Credits-Charged'),
      creditsRemaining: removeBgRes.headers.get('X-Credits-Total-Used'),
    });

  } catch (err) {
    console.error('remove-bg handler error:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました: ' + err.message });
  }
}

// Vercel の bodyParser を無効化（multipart/form-data をそのまま転送するため）
export const config = {
  api: {
    bodyParser: false,
  },
};
