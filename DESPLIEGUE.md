# Despliegue en Vercel

Guía operativa para poner esta herramienta en producción. Sigue el orden: los
pasos posteriores asumen los anteriores.

## 1. Antes de desplegar

Ejecuta el pipeline completo en local. Debe pasar entero.

```bash
bun run verify   # lint → typecheck → tests → build → escaneo de secretos
bun run e2e      # navegador real: hidratación, accesibilidad, aceptación
```

`verify` incluye `check:secrets`, que compila y luego busca los valores reales
de tus variables dentro de `.next/static`. Si alguno aparece, falla y te dice
en qué archivo.

## 2. Variables de entorno en Vercel

Project Settings → Environment Variables. **Ninguna lleva el prefijo
`NEXT_PUBLIC_`**: ese prefijo publica el valor en el navegador.

| Variable | Obligatoria | Notas |
|---|---|---|
| `APP_PASSWORD` | Sí | Contraseña compartida del grupo. |
| `SESSION_SECRET` | Sí | Mínimo 32 caracteres. `openssl rand -base64 48`. |
| `APP_ORIGIN` | En producción | URL real del despliegue. Sin ella no se valida el origen de las escrituras. |
| `THINGSPEAK_CHANNEL_ID` | Sí | Id numérico del canal. |
| `THINGSPEAK_BASE_URL` | No | Solo si usas un proxy propio. |
| `THINGSPEAK_READ_API_KEY` | Si el canal es privado | El canal público no la necesita. |
| `THINGSPEAK_WRITE_API_KEY` | Para cargar | Sin ella no se puede hacer Bulk Write. |
| `THINGSPEAK_USER_API_KEY` | Para vaciar | **Puede vaciar cualquier canal de la cuenta.** Defínela solo cuando vayas a usar mantenimiento. |

Cambiar `APP_PASSWORD` exige un redespliegue para que surta efecto.

## 3. Canales por entorno

La licencia gratuita de ThingSpeak permite **4 canales**. La especificación
pide development, preview, production y uno aparte para pruebas destructivas:
son exactamente 4, sin margen. Decide de antemano cuál es cuál y no apuntes
Preview al canal de producción.

## 4. Comprobaciones después del primer despliegue

```bash
# Sustituye por tu dominio real
BASE=https://tu-proyecto.vercel.app

curl -s $BASE/robots.txt                        # User-Agent: * / Disallow: /
curl -sI $BASE/login | grep -i x-robots-tag     # noindex, nofollow, ...
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/thingspeak/status   # 401
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $BASE/dashboard  # 307 → /login
```

Los cuatro están cubiertos por `e2e/acceptance.spec.ts`; esto solo confirma
que el despliegue real se comporta igual que local.

## 5. Qué NO hace esta herramienta

Conviene que el grupo lo sepa antes de confiar en ella:

- **La pestaña debe permanecer abierta durante una carga.** El navegador
  controla la espera de 15 segundos entre lotes; cerrarla detiene el envío.
  Al volver, el trabajo se reanuda desde el último lote enviado.
- **Un solo operador activo a la vez.** El bloqueo entre pestañas funciona
  dentro de un navegador, no entre máquinas. Dos personas cargando o vaciando
  el mismo canal a la vez lo corrompen.
- **`bulk_update` es asíncrono.** ThingSpeak responde `202 Accepted` y escribe
  las filas segundos o minutos después. Por eso la aplicación distingue
  *encoladas* de *confirmadas*, y solo las segundas son prueba.
- **Vaciar el canal es irreversible** y ThingSpeak no borra registros sueltos.
  El respaldo previo es la única copia.
- **Los datasets viven en el navegador** (IndexedDB). Borrar los datos del
  navegador los elimina. Exporta lo que importe.
