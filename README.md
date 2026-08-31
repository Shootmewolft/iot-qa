# ThingSpeak QA

Herramienta interna para poblar y auditar el canal de ThingSpeak del proyecto
IoT de temperatura y humedad, sin depender de mantener la simulación de Wokwi
corriendo durante horas.

El ESP32 envía una medición cada 20 segundos. Reunir 10.000 así son **55 horas**
con el navegador abierto. Esta herramienta hace lo mismo en **dos minutos y
medio**, usando el Bulk Write de ThingSpeak.

La simulación sigue siendo la evidencia de que el hardware funciona. Esto es la
herramienta de QA que la acompaña.

---

## Empezar

```bash
bun install
cp .env.example .env.local     # rellena APP_PASSWORD y SESSION_SECRET
bun run dev
```

Abre http://localhost:3000. Te pedirá la contraseña que pusiste en
`APP_PASSWORD`.

Mínimo para arrancar: `APP_PASSWORD`, `SESSION_SECRET` (32+ caracteres) y
`THINGSPEAK_CHANNEL_ID`. El resto se explica en [`.env.example`](.env.example).

---

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Dashboard** | Series, dispersión, estadísticas descriptivas y correlación de Pearson, con filtros por rango. |
| **Datasets** | Conjuntos guardados en el navegador. Exportar, duplicar, cargar. |
| **Generar** | Hasta 10.000 mediciones realistas y reproducibles a partir de una semilla. |
| **Importar** | CSV o XLSX con mapeo de columnas e informe de errores por fila. |
| **Trabajos** | Carga masiva por lotes, con pausa, reanudación y verificación. |
| **Reportes** | Informe imprimible a PDF con observaciones editables. |
| **Mantenimiento** | Respaldo del canal y vaciado. |
| **Configuración** | Diagnóstico de variables y conectividad. |

---

## Lo que hay que saber antes de usarla

Cinco cosas que no son obvias y que causan sorpresas:

**`bulk_update` es asíncrono.** ThingSpeak responde `202 Accepted` y escribe las
filas después: medimos entre 11 segundos y 5 minutos. Por eso la aplicación
distingue filas *encoladas* de *confirmadas*, y solo las segundas cuentan como
prueba. La barra de progreso mide confirmadas.

**Un timestamp repetido descarta la fila en silencio.** ThingSpeak devuelve
`success: true` igual. Antes de cargar, la aplicación consulta el canal y avisa
si hay colisiones; sin eso, la carga fallaría sin decir por qué.

**La pestaña debe permanecer abierta.** El navegador controla la espera de 15
segundos entre lotes, así que el envío se detiene al cerrar la pestaña o al
salir de la pantalla de trabajos. Al volver, «Reanudar» sigue desde el último
lote enviado, sin repetir ninguno.

**Un solo operador a la vez.** El bloqueo entre pestañas funciona dentro de un
navegador, no entre máquinas. Dos personas cargando o vaciando el mismo canal a
la vez lo corrompen.

**Los datasets viven en tu navegador** (IndexedDB). Borrar los datos del
navegador los elimina. Exporta lo que importe.

---

## Desarrollo

```bash
bun run dev        # servidor de desarrollo
bun run verify     # lint → typecheck → tests → build → escaneo de secretos
bun run e2e        # 44 pruebas en Chromium: hidratación, accesibilidad, aceptación
```

`verify` es el pipeline completo y debe pasar antes de desplegar. Incluye
`check:secrets`, que compila y busca los valores reales de tus variables dentro
de `.next/static`; si alguno aparece, falla y nombra el archivo.

### Cómo está organizado

```
src/
├── app/(auth)/          login
├── app/(protected)/     todo lo que exige sesión
├── app/api/             auth y proxy hacia ThingSpeak
├── components/          ui/ es código vendido de shadcn, excluido del lint
├── db/                  Dexie: datasets y trabajos de carga
├── hooks/               use-upload-runner: orquestador de la carga
├── lib/                 dominio puro, sin React (aquí viven los tests)
└── proxy.ts             protección de rutas
```

El dominio vive en `src/lib` y no importa React. Es lo que hace que 288 pruebas
corran en menos de cinco segundos.

### Decisiones que sorprenden al leer el código

| Decisión | Por qué |
|---|---|
| `proxy.ts`, no `middleware.ts` | Next 16 renombró la convención. El runtime es Node.js y no es configurable, que es lo que permite usar `jose`. |
| La sesión expira por el claim `exp` | El `maxAge` de la cookie es una sugerencia al navegador. Sin `exp` verificado en servidor, un token copiado vale para siempre. |
| El navegador orquesta la carga | Una función de Vercel no debe esperar 15 segundos entre lotes. Cada petición envía un lote y termina. |
| El downsampling conserva máximos y mínimos | Tomar uno de cada N se come justo los puntos anómalos, que es lo que la gráfica existe para mostrar. |
| `src/components/ui` fuera del lint | Es código del registro de shadcn. No mantenemos su formato ni sus decisiones de accesibilidad. |
| ExcelJS y no SheetJS | El paquete `xlsx` de npm lleva congelado en 0.18.5 desde marzo de 2022. |

---

## Despliegue

Ver [`DESPLIEGUE.md`](DESPLIEGUE.md) para la guía completa.

Lo esencial: **crea un `.vercelignore` que excluya `.env`**. La CLI de Vercel no
respeta el `.gitignore` para las subidas, y sin ese archivo tu `.env` local
acaba dentro del despliegue y sus valores se convierten en la configuración de
la aplicación.

---

## Alcance

**Incluido:** login, generación, importación, carga masiva reanudable, dashboard,
informe PDF, respaldo y vaciado del canal.

**Fuera:** registro de usuarios, roles, base de datos remota, ejecución con el
navegador cerrado, coordinación entre operadores, borrado parcial de registros
(ThingSpeak solo permite vaciar el canal entero).

---

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui · Dexie ·
Zod · Recharts · ExcelJS · Papa Parse · jose · Vitest · Playwright · Biome
