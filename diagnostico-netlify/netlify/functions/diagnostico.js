const MODULOS = [
  "Diagnóstico y fundamentos",
  "Marca personal",
  "Oferta y precios premium",
  "Ventas y retención",
  "Plan de acción"
];

const SYSTEM_PROMPT = `Eres el motor de análisis del "Diagnóstico Coach Premium" de JCOTRAINER, marca de mentoría de negocio para entrenadores personales.
Tono de marca: directo y concreto, como un consultor que ya recorrió el camino, nunca como un influencer motivacional. Prohibido usar frases genéricas ("¡tú puedes lograrlo!", "el éxito está en ti", "eres increíble") o superlativos vacíos ("el mejor", "la fórmula mágica"). Prefiere cifras, pasos concretos y observaciones accionables sobre promesas abstractas.
Los 5 módulos del taller "De Entrenador a Coach Premium" son exactamente estos (usa el nombre exacto de uno de ellos en modulo_recomendado): ${MODULOS.map(m => `"${m}"`).join(', ')}.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin backticks, con esta forma exacta:
{
  "diagnostico": "2-3 frases evaluando el momento actual del entrenador según sus puntajes, en tono directo, citando qué pilar es su fuerte y cuál su debilidad principal.",
  "brecha": "1-2 frases describiendo concretamente qué le falta para operar como Coach Premium, conectado con su cuello de botella declarado.",
  "modulo_recomendado": "uno de los 5 nombres exactos de módulo listados arriba",
  "por_que": "1 frase explicando por qué ese módulo es el punto de partida correcto para este perfil específico.",
  "siguientes_pasos": ["paso 1, empieza con verbo en infinitivo, concreto y accionable", "paso 2, empieza con verbo en infinitivo, concreto y accionable", "paso 3, empieza con verbo en infinitivo, concreto y accionable"]
}`;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing_api_key' }), { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 });
  }

  const { scores, bottleneck } = body || {};
  if (!scores || typeof bottleneck !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
  }

  const userPrompt = `Puntajes (0-100, entre más alto mejor):
- Fundamentos: ${scores.fundamentos}
- Marca personal: ${scores.marca}
- Oferta y precios: ${scores.oferta}
- Ventas y retención: ${scores.ventas}
- Global: ${scores.global}
- Nivel calculado: ${scores.nivel}

Cuello de botella que el entrenador declaró como su principal problema hoy: "${bottleneck}"

Genera el JSON del diagnóstico personalizado.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: 'anthropic_error', detail: errText }), { status: 502 });
    }

    const data = await anthropicRes.json();
    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
    const clean = textBlocks.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'parse_error', raw: clean }), { status: 502 });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(err) }), { status: 500 });
  }
};

export const config = { path: '/api/diagnostico' };
