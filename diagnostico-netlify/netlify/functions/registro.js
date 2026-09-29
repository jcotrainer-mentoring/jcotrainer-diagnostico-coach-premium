// netlify/functions/registro.js
//
// POST /api/registro  → guarda un diagnóstico (público, con límite por IP).
// GET  /api/registro  → lista todos los diagnósticos. Sólo para el mentor:
//                       exige la clave en el header `x-coach-pin`, que se
//                       compara contra la variable de entorno COACH_PIN.
//
// Cada diagnóstico se guarda como su propia entrada (`d/<id>`) en vez de
// una lista única: así, si 10 alumnos terminan a la vez en una sesión en
// vivo, ninguno pisa el registro de otro.

import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'crypto';

// Lista antigua (antes de este cambio todo vivía en una sola entrada).
// Se sigue leyendo para no perder los diagnósticos ya hechos.
const KEY_LEGADO = 'registro';
const PREFIJO = 'd/';

const NIVELES = new Set(['Iniciado', 'En desarrollo', 'Cerca de Premium', 'Coach Premium']);
const CUELLOS = new Set([
  'captación de clientes nuevos',
  'cierre de ventas y manejo de objeciones de precio',
  'retención de clientes actuales',
  'subir tarifas sin perder clientes',
  'organización del tiempo y del negocio',
]);

const MAX_GUARDADOS_POR_HORA = 30;   // por IP; una sala de taller comparte wifi
const MAX_FALLOS_CLAVE = 5;          // intentos fallidos por IP...
const VENTANA_FALLOS_MIN = 15;       // ...en esta ventana

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

// Contador simple por ventana de tiempo. No es atómico, pero alcanza para
// frenar abuso: un script no puede disparar miles de peticiones.
async function conteoActual(clave, ventanaMin) {
  const store = getStore('limites');
  const dato = await store.get(clave, { type: 'json' });
  if (dato && Date.now() - dato.inicio < ventanaMin * 60 * 1000) return dato;
  return null;
}

async function sumarUno(clave, ventanaMin) {
  const store = getStore('limites');
  const dato = await conteoActual(clave, ventanaMin);
  if (dato) await store.setJSON(clave, { inicio: dato.inicio, conteo: dato.conteo + 1 });
  else await store.setJSON(clave, { inicio: Date.now(), conteo: 1 });
}

function claveLimite(tipo, ip) {
  return `${tipo}/${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// Compara sin filtrar por tiempo de respuesta cuántos caracteres acertó.
function claveCorrecta(recibida) {
  const a = createHash('sha256').update(String(recibida)).digest();
  const b = createHash('sha256').update(String(process.env.COACH_PIN)).digest();
  return timingSafeEqual(a, b);
}

function esPuntaje(n) {
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

export default async (req, context) => {
  const store = getStore('diagnosticos');
  const ip = ipDe(req, context);

  if (req.method === 'GET') {
    if (!process.env.COACH_PIN) {
      console.error('Falta la variable de entorno COACH_PIN.');
      return json(500, { error: 'pin_no_configurado' });
    }

    const claveFallos = claveLimite('fallos-pin', ip);
    const fallos = await conteoActual(claveFallos, VENTANA_FALLOS_MIN);
    if (fallos && fallos.conteo >= MAX_FALLOS_CLAVE) {
      return json(429, { error: 'demasiados_intentos' });
    }

    const recibida = req.headers.get('x-coach-pin') || '';
    if (!recibida || !claveCorrecta(recibida)) {
      await sumarUno(claveFallos, VENTANA_FALLOS_MIN);
      return json(401, { error: 'clave_incorrecta' });
    }

    const legado = (await store.get(KEY_LEGADO, { type: 'json' })) || [];
    const { blobs } = await store.list({ prefix: PREFIJO });
    const nuevos = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));

    return json(200, [...legado, ...nuevos.filter(Boolean)]);
  }

  if (req.method === 'POST') {
    const claveGuardados = claveLimite('guardados', ip);
    const guardados = await conteoActual(claveGuardados, 60);
    if (guardados && guardados.conteo >= MAX_GUARDADOS_POR_HORA) {
      return json(429, { error: 'demasiadas_solicitudes' });
    }

    let entry;
    try {
      entry = await req.json();
    } catch (e) {
      return json(400, { error: 'invalid_body' });
    }

    // Sólo se guardan los campos conocidos y con valores válidos: nada de
    // texto arbitrario que después termine en tu panel o en el CSV.
    const nombre = String(entry?.nombre ?? '').trim().slice(0, 60) || 'Anónimo';
    const campos = ['global', 'fundamentos', 'marca', 'oferta', 'ventas'];
    if (
      !campos.every((c) => esPuntaje(entry?.[c])) ||
      !NIVELES.has(entry?.nivel) ||
      !CUELLOS.has(entry?.bottleneck)
    ) {
      return json(400, { error: 'datos_invalidos' });
    }

    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const limpio = {
      id,
      nombre,
      nivel: entry.nivel,
      global: entry.global,
      fundamentos: entry.fundamentos,
      marca: entry.marca,
      oferta: entry.oferta,
      ventas: entry.ventas,
      bottleneck: entry.bottleneck,
      fecha: new Date().toISOString(),
    };

    await store.setJSON(PREFIJO + id, limpio);
    await sumarUno(claveGuardados, 60);

    return json(200, { ok: true });
  }

  return json(405, { error: 'method_not_allowed' });
};

export const config = { path: '/api/registro' };
