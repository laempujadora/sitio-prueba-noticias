# Sitio de prueba — Noticias editables con Pages CMS y Claude

Sitio estático con tres secciones (Home, Noticias, Contacto) y una página de detalle por noticia.
Todas las noticias salen de `data/noticias.json`. El HTML no se toca para cargar contenido.

```
admin/                Panel de noticias propio (/admin)
worker/               API del panel: login y guardado en GitHub
index.html            Home + listado de noticias + contacto
noticia.html          Detalle de cada noticia (noticia.html?n=<slug>)
data/noticias.json    El contenido (lo único que cambia)
img/noticias/         Imágenes de las noticias
assets/               CSS, JS, fuentes y logo (diseño fijo)
.pages.yml            Configuración del panel de Pages CMS
CLAUDE.md             Reglas para que Claude edite noticias sin romper nada
```

## 1. Subirlo a GitHub

1. Creá un repo nuevo (puede ser privado), por ejemplo `sitio-prueba-noticias`.
2. Subí todo el contenido de esta carpeta a la raíz del repo, incluidos los archivos que empiezan con punto (`.pages.yml`).

## 2. Publicarlo en Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** → elegí el repo.
2. Framework preset: **None**. Build command: vacío. Build output directory: `/`.
3. Deploy. Desde ahí, cada commit en `main` publica solo, y cada rama nueva genera una URL de vista previa.

## 3. Probar Pages CMS (el panel)

1. Entrá a https://app.pagescms.org y logueate con GitHub.
2. Instalá la GitHub App de Pages CMS y dale acceso a este repo.
3. Abrí el repo: en el menú aparece **Noticias** con el formulario armado.
4. Agregá una noticia, subí una foto, guardá. En un minuto debería aparecer en el sitio.
5. Para darle acceso al cliente, sumalo como colaborador del repo (o desde la configuración de Pages CMS, si te deja invitar por mail).

## 4. Probar Claude directo (el chat)

1. Abrí Claude con acceso al repo de GitHub (Claude Code, en la web o en la app de escritorio).
2. Claude lee `CLAUDE.md` y sabe qué puede tocar y cómo publicar.
3. Pedidos para probar:
   - "Subí una noticia: el sábado 8 de noviembre hacemos una jornada abierta en la sede, de 10 a 13. Categoría Agenda."
   - "A la noticia del taller sumale este video: https://www.youtube.com/watch?v=..."
   - "Marcá como destacada la noticia del sitio para la escuela."
   - "Ocultá la noticia de la campaña de reels."
   - Pegarle un mail o un PDF y pedirle: "Convertí esto en una noticia".
4. Claude trabaja en una rama, te pasa la URL de vista previa de Cloudflare y publica cuando le confirmás.

## 5. Panel propio (/admin)

Un panel con la marca del sitio para cargar, editar, ocultar y borrar noticias, con login por contraseña.
Cada vez que se guarda, el panel escribe en GitHub y Cloudflare publica solo.

Configuración (una sola vez):

1. **Clave de GitHub.** En GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Repository access: **Only select repositories** → este repo.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Expiración: la que prefieras (al vencer hay que generar otra y reemplazarla).
2. **Cargar los secretos en Cloudflare.** Worker → Settings → **Variables and Secrets** → Add:
   - `GITHUB_TOKEN` (tipo Secret): la clave del paso 1.
   - `ADMIN_PASSWORD` (tipo Secret): la contraseña del panel, larga y difícil.
   - `GITHUB_REPO` y `GITHUB_BRANCH` ya vienen en `wrangler.jsonc`.
3. Entrar a `/admin` en el sitio y loguearse.

Para un cliente con dominio propio conviene sumar **Cloudflare Access** (login por mail con código) delante de `/admin` y `/api`.

## Probarlo en tu compu

Las noticias se cargan con `fetch`, así que abrir `index.html` con doble clic no alcanza. Desde esta carpeta:

```
python3 -m http.server 8000
```

y entrá a http://localhost:8000

## Cosas a tener en cuenta

- El formulario de contacto es de prueba: muestra un mensaje pero no envía nada. En un sitio real se conecta a Brevo.
- Las noticias se arman con JavaScript, así que Google las indexa peor que un HTML fijo. Para una sección de novedades suele alcanzar; si el SEO de las noticias importa mucho, el paso siguiente es sumar un generador liviano (por ejemplo, Eleventy) que arme el HTML en cada deploy.
- Las dos vías (panel y chat) escriben en el mismo archivo. Si alguien edita desde el panel mientras Claude trabaja en una rama, puede haber un conflicto al hacer merge: Claude lo puede resolver, pero conviene no editar en paralelo.
