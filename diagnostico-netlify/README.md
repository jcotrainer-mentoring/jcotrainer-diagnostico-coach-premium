# Diagnóstico Coach Premium — JCOTRAINER

Sitio independiente. No comparte nada con `matriz-10-estrategias-mentoring`.

## Estructura

```
public/index.html                 → frontend (el diagnóstico completo)
netlify/functions/diagnostico.js  → llama a la API de Claude (server-side, con tu API key)
netlify/functions/registro.js     → guarda/lee los diagnósticos del equipo (Netlify Blobs)
```

## Variables de entorno (Netlify → Project configuration → Environment variables)

- `ANTHROPIC_API_KEY` = tu API key de console.anthropic.com
- `COACH_PIN` = la clave del panel coach. Mínimo 8 caracteres. **No se escribe en ningún archivo del repo.**

Si cambias cualquiera de las dos, haz un deploy nuevo para que tome efecto.

## Panel coach

5 toques en el wordmark del pie de página (pantalla de inicio) → ingresar la clave.
La clave la valida el servidor contra `COACH_PIN`. Después de 5 intentos fallidos desde la misma conexión, se bloquea 15 minutos.
El botón de exportar descarga un CSV directo — ábrelo con Google Sheets o súbelo a Drive manualmente.

## Almacenamiento (Netlify Blobs)

- Store `diagnosticos`: cada diagnóstico se guarda como su propia entrada (`d/<id>`). La entrada antigua `registro` (lista de antes del cambio) se sigue leyendo para no perder diagnósticos previos.
- Store `limites`: contadores de uso por IP (diagnósticos por hora, guardados por hora e intentos fallidos de clave).

## Límites

- 30 diagnósticos por hora por conexión (generoso a propósito: en un taller en vivo todos comparten el wifi).
- Recomendado: fijar además un límite de gasto mensual en console.anthropic.com como respaldo.
