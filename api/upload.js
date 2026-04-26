export const config = {
  api: { bodyParser: false },
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
    const contentType = req.headers['content-type'] || '';

    // multipart/form-dataを手動でパース
    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) return res.status(400).json({ error: 'No boundary in multipart' });

      // リクエストボディを読み込む
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);

      // boundaryでファイル部分を抽出
      const boundaryBuf = Buffer.from('--' + boundary);
      const parts = splitBuffer(body, boundaryBuf);

      let fileBuffer = null;
      let mimeType = 'image/jpeg';

      for (const part of parts) {
        const headerEnd = findSequence(part, Buffer.from('\r\n\r\n'));
        if (headerEnd === -1) continue;
        const header = part.slice(0, headerEnd).toString();
        if (!header.includes('filename')) continue;

        // Content-Typeを取得
        const ctMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
        if (ctMatch) mimeType = ctMatch[1].trim();

        // ファイルデータ（末尾の\r\nを除く）
        fileBuffer = part.slice(headerEnd + 4, part.length - 2);
        break;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: 'No file found in multipart' });
      }

      console.log('Uploading to Replicate, size:', fileBuffer.length, 'mime:', mimeType);

      const uploadRes = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': mimeType,
        },
        body: fileBuffer,
      });

      const uploadData = await uploadRes.json();
      console.log('Upload response:', uploadRes.status, JSON.stringify(uploadData).slice(0, 200));

      if (!uploadRes.ok) {
        return res.status(500).json({ error: 'Upload failed', detail: uploadData });
      }

      const imageUrl = uploadData.urls?.get || uploadData.url;
      return res.status(200).json({ imageUrl });
    }

    return res.status(400).json({ error: 'Expected multipart/form-data' });

  } catch (e) {
    console.log('Upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  let idx;
  while ((idx = findSequence(buf, delimiter, start)) !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buf.slice(start));
  return parts.filter(p => p.length > 2);
}

function findSequence(buf, seq, start = 0) {
  outer: for (let i = start; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}
