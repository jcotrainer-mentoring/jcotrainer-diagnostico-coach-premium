# Diagnóstico Coach Premium — JCOTRAINER

Sitio independiente. No comparte nada con `matriz-10-estrategias-mentoring`.

## Estructura

```
public/index.html                 → frontend (el diagnóstico completo)
netlify/functions/diagnostico.js  → llama a la API de Claude (server-side, con tu API key)
netlify/functions/registro.js     → guarda/lee los diagnósticos del equipo (Netlify Blobs)
```

## Pasos para desplegar

1. **Crear un repo nuevo en GitHub** (ej. `jcotrainer-diagnostico-coach-premium`), separado del repo de la matriz.
2. Arrastra **la carpeta completa** de este proyecto al repo (para conservar la subcarpeta `netlify/functions`).
3. En Netlify: **Add new site → Import an existing project** → conecta ese repo nuevo.
   - Build command: dejar vacío (no hace falta build).
   - Publish directory: `public`
   - Functions directory: se detecta sola por `netlify.toml` (`netlify/functions`).
4. En **Site settings → Environment variables**, agrega:
   - `ANTHROPIC_API_KEY` = tu API key de console.anthropic.com
5. Deploy. Netlify instala `@netlify/blobs` automáticamente porque está en `package.json`.

## Panel coach

Mismo gesto que en el artifact: 5 toques en el wordmark del pie de página (pantalla de inicio) → PIN `2580`.
El botón de exportar ahora **descarga un CSV directo** (ya no depende del chat de Claude) — ábrelo con Google Sheets o súbelo a Drive manualmente.

## Notas

- El registro de diagnósticos vive en Netlify Blobs (`diagnosticos-registro`), aislado de cualquier otro sitio.
- Si más adelante quieres que el CSV se suba solo a Google Drive (sin paso manual), hay que agregar una función más con credenciales de Google (OAuth o cuenta de servicio) — avísame cuando quieras montarlo.
