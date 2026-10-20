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

Si el mismo correo tiene un diagnóstico "inicio" y uno "cierre", el panel los
parea automáticamente en "Progreso pareado" y muestra el delta de puntaje y
de tarifa — hay un botón aparte para descargar ese CSV de progreso.

## Comparación inicio/cierre

Cada diagnóstico se guarda con `email` y, además de las 9 preguntas de
siempre, un bloque de 5 números del negocio (clientes activos, tarifa
promedio, ingreso mensual, horas semanales, % de retención a 3 meses). Esos
números no afectan el puntaje por pilar — son el dato aparte que permite
mostrar "de $X a $Y" cuando el entrenador vuelve a responder al cerrar el
taller.

El `momento` ('inicio' o 'cierre') lo decide `registro.js`, nunca el
navegador: si ya existe un diagnóstico guardado con ese correo, el nuevo es
"cierre", y la pantalla de resultado muestra el progreso contra el primero
automáticamente.

## Almacenamiento (Netlify Blobs)

- Store `diagnosticos`: cada diagnóstico se guarda como su propia entrada (`d/<id>`). La entrada antigua `registro` (lista de antes del cambio) se sigue leyendo para no perder diagnósticos previos. Las entradas de antes de la comparación inicio/cierre no tienen `email`/`momento`/`kpis` — el panel y el CSV los tratan como vacíos, no rompen.
- Store `limites`: contadores de uso por IP (diagnósticos por hora, guardados por hora e intentos fallidos de clave).

## Límites

- 30 diagnósticos por hora por conexión (generoso a propósito: en un taller en vivo todos comparten el wifi).
- Recomendado: fijar además un límite de gasto mensual en console.anthropic.com como respaldo.
