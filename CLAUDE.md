# Instrucciones para Claude — Sitio de prueba de La Empujadora

Este repo es un sitio estático (HTML + CSS + JS) publicado en Cloudflare Pages.
Cada cambio que llega a la rama `main` se publica solo, en uno o dos minutos.

Tu trabajo acá es **cargar y editar noticias** a pedido del equipo.
No sos el diseñador del sitio: el diseño ya está hecho y no se toca.

## Qué podés tocar

- `data/noticias.json` — la lista de noticias. Es lo único que editás en el día a día.
- `img/noticias/` — las imágenes de las noticias (portadas, galerías e imágenes dentro del texto).

## Qué NO podés tocar

- `index.html`, `noticia.html`, `assets/` (CSS, JS, fuentes, logo) y `.pages.yml`.
- Si te piden un cambio de diseño, de estructura o de otra sección, no lo hagas:
  respondé que eso lo resuelve La Empujadora y sugerí escribirles.

## Formato de cada noticia

`data/noticias.json` es una lista (array). Cada noticia es un objeto así:

```json
{
  "titulo": "Taller abierto: contá tu proyecto en 30 segundos",
  "slug": "taller-contar-tu-proyecto-en-30-segundos",
  "fecha": "2026-10-08",
  "categoria": "Agenda",
  "destacada": false,
  "portada": "/img/noticias/taller-30-segundos.jpg",
  "bajada": "Una o dos oraciones que resumen la noticia.",
  "cuerpo": "<p>Párrafo.</p><h2>Subtítulo</h2><p>Otro párrafo.</p>",
  "videos": ["https://www.youtube.com/watch?v=XXXXXXXXXXX"],
  "galeria": ["/img/noticias/foto-1.jpg", "/img/noticias/foto-2.jpg"],
  "publicada": true
}
```

Reglas de cada campo:

- **titulo** (obligatorio): claro y corto, idealmente menos de 70 caracteres.
- **slug**: minúsculas, números y guiones, sin tildes ni ñ. Único en todo el archivo. No cambies el slug de una noticia ya publicada (rompe los links compartidos).
- **fecha** (obligatorio): formato `AAAA-MM-DD`. Si no te dicen la fecha, usá la de hoy.
- **categoria**: una de `Novedades`, `Proyectos`, `Agenda`. Si ninguna encaja, preguntá.
- **destacada**: `true` solo en una noticia a la vez. Si marcás una nueva como destacada, poné `false` en la anterior.
- **portada**: ruta a una imagen en `img/noticias/`. Horizontal.
- **bajada**: una o dos oraciones, sin HTML.
- **cuerpo**: HTML simple. Etiquetas permitidas: `p`, `h2`, `h3`, `strong`, `em`, `a`, `ul`, `ol`, `li`, `blockquote`, `img`. Nada de `style`, `class`, `script` ni `iframe`.
  - Para meter un video **en medio del texto**, poné el link de YouTube solo en un párrafo: `<p>https://www.youtube.com/watch?v=XXXXXXXXXXX</p>`. El sitio lo convierte en video.
  - Imágenes dentro del texto: `<img src="/img/noticias/archivo.jpg" alt="descripción breve">`.
- **videos**: lista de links de YouTube que se muestran al final. Puede quedar vacía `[]`.
- **galeria**: lista de rutas de imágenes. Puede quedar vacía `[]`.
- **publicada**: `false` para ocultar una noticia sin borrarla.

El orden en el archivo no importa: el sitio ordena por fecha, de la más nueva a la más vieja.

## Imágenes

- Guardalas en `img/noticias/` con nombre en minúsculas y guiones: `taller-octubre-portada.jpg`.
- Convertilas a JPG (o WebP), máximo 1600 px de ancho y que pesen menos de 300 KB.
- Escribí un `alt` breve y descriptivo para las imágenes dentro del cuerpo.

## Cómo escribir

- Español rioplatense, con voseo ("sumate", "contanos").
- Oraciones cortas y directas. Sin emojis.
- Si el equipo te pasa un texto desordenado, un mail o un PDF: armá vos título, bajada y cuerpo, y mostrales el resultado antes de publicar.
- No inventes datos (fechas, lugares, cupos, nombres). Si faltan, preguntá.

## Cómo publicar

1. Antes de guardar, verificá que `data/noticias.json` sea JSON válido.
2. Trabajá en una rama nueva (`noticia/<slug>`) y abrí un pull request contra `main`.
   Cloudflare Pages genera una URL de vista previa para esa rama: pasásela al equipo.
3. Solo hacé merge a `main` cuando la persona confirme que está bien.
4. Mensaje de commit: `Noticias: <qué hiciste>` (ej. `Noticias: agrega taller de octubre`).

Para borrar una noticia, preguntá antes si prefieren ocultarla (`"publicada": false`).
