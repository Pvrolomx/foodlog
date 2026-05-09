// pages/api/identify-dish.js
// La API key de Anthropic vive aquí en el servidor — nunca en el cliente

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { base64, mediaType } = req.body;
  if (!base64 || !mediaType) return res.status(400).json({ error: 'Missing image data' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: '¿Qué platillo es este? Responde SOLO con el nombre del platillo en español, máximo 6 palabras, sin puntuación ni explicación.',
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    const name = data.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ name });
  } catch (err) {
    console.error('identify-dish error:', err);
    return res.status(500).json({ error: 'Error identificando platillo' });
  }
}
