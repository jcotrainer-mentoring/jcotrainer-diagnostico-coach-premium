// netlify/functions/diagnostico.js
//
// POST /api/diagnostico → recibe los puntajes y el cuello de botella,
// llama a la API de Claude con la API key del servidor y devuelve el JSON
// del diagnóstico.
//
// Protecciones:
// - Sólo acepta puntajes 0–100, un nivel conocido y uno de los 5 cuellos
//   de botella del formulario: nadie puede meter texto propio en el prompt.
// - Límite de diagnósticos por IP y por hora, para que un script no pueda
//   gastar el saldo de Anthropic.
// - Los errores internos se registran en los logs de Netlify, no se
//   devuelven al navegador.

import { getStore } from '@netlify/blobs';

const MODULOS = [
  "Diagnóstico y fundamentos",
  "Marca personal",
  "Oferta y precios premium",
  "Ventas y retención",
  "Plan de acción"
];

const NIVELES = new Set(['Iniciado', 'En desarrollo', 'Cerca de Premium', 'Coach Premium']);
const CUELLOS = new Set([
  'captación de clientes nuevos',
  'cierre de ventas y manejo de objeciones de precio',
  'retención de clientes actuales',
  'subir tarifas sin perder clientes',
  'organización del tiempo y del negocio',
]);

// Por IP y por hora. Generoso a propósito: en una sesión en vivo del taller
// todos los alumnos salen a internet por la misma IP del wifi.
const MAX_POR_HORA = 30;

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

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ipDe(req, context) {
  return (
    context?.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'desconocida'
  );
}

// Devuelve true si esta IP ya llegó al tope de la hora; si no, suma uno.
async function superaLimite(ip) {
  const store = getStore('limites');
  const clave = `diagnostico/${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const ahora = Date.now();
  const dato = await store.get(clave, { type: 'json' });
  if (dato && ahora - dato.inicio < 60 * 60 * 1000) {
    if (dato.conteo >= MAX_POR_HORA) return true;
    await store.setJSON(clave, { inicio: dato.inicio, conteo: dato.conteo + 1 });
    return false;
  }
  await store.setJSON(clave, { inicio: ahora, conteo: 1 });
  return false;
}

function esPuntaje(n) {
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta la variable de entorno ANTHROPIC_API_KEY.');
    return json(500, { error: 'missing_api_key' });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { error: 'invalid_body' });
  }

  const { scores, bottleneck } = body || {};
  const campos = ['fundamentos', 'marca', 'oferta', 'ventas', 'global'];
  if (
    !scores ||
    !campos.every((c) => esPuntaje(scores[c])) ||
    !NIVELES.has(scores.nivel) ||
    !CUELLOS.has(bottleneck)
  ) {
    return json(400, { error: 'datos_invalidos' });
  }

  // Se valida antes de llamar a la API: una petición inválida no gasta cupo.
  if (await superaLimite(ipDe(req, context))) {
    return json(429, { error: 'demasiadas_solicitudes' });
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
      console.error(`Anthropic respondió ${anthropicRes.status}: ${await anthropicRes.text()}`);
      return json(502, { error: 'anthropic_error' });
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
      console.error('La respuesta de la IA no es JSON válido:', clean);
      return json(502, { error: 'parse_error' });
    }

    // La pantalla de resultado espera esta forma; si viene incompleta es
    // mejor un error claro que una página rota.
    if (
      typeof parsed.diagnostico !== 'string' ||
      typeof parsed.brecha !== 'string' ||
      typeof parsed.modulo_recomendado !== 'string' ||
      typeof parsed.por_que !== 'string' ||
      !Array.isArray(parsed.siguientes_pasos)
    ) {
      console.error('Respuesta de la IA con forma inesperada:', clean);
      return json(502, { error: 'parse_error' });
    }

    return json(200, parsed);
  } catch (err) {
    console.error('Error llamando a Anthropic:', err);
    return json(500, { error: 'server_error' });
  }
};

export const config = { path: '/api/diagnostico' };
