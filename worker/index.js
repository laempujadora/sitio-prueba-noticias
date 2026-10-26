/* ==========================================================================
   Panel de noticias — API
   Corre en Cloudflare junto al sitio estático. Solo atiende /api/*;
   todo lo demás lo sirve Cloudflare como archivos.

   Cada cambio que se guarda en el panel se escribe en GitHub como un commit
   (data/noticias.json + las fotos nuevas) y Cloudflare publica solo.

   Configuración (Cloudflare → Worker → Settings → Variables and Secrets):
     ADMIN_PASSWORD  (secreto)  contraseña del panel
     GITHUB_TOKEN    (secreto)  token de GitHub con permiso de escritura en el repo
     GITHUB_REPO     (variable) usuario/repo, ej. laempujadora/sitio-prueba-noticias
     GITHUB_BRANCH   (variable) rama que publica el sitio, ej. main
   ========================================================================== */

const DATA_PATH = 'data/noticias.json';
const IMG_DIR = 'img/noticias/';
const CATEGORIAS = ['Novedades', 'Proyectos', 'Agenda'];
const SESION_HORAS = 12;
const MAX_IMAGEN_BYTES = 3 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return json({ error: err.publico || 'Algo falló del lado del servidor. Probá de nuevo en unos segundos.' }, status);
    }
  }
};

/* ---- rutas ------------------------------------------------------------- */
async function api(request, env, url) {
  const ruta = url.pathname.replace(/\/+$/, '');
  const metodo = request.method;

  if (metodo !== 'GET' && !mismoOrigen(request, url)) throw fallo(403, 'Pedido rechazado.');

  if (ruta === '/api/sesion' && metodo === 'GET') {
    return json({ configurado: configurado(env), sesion: await sesionValida(request, env) });
  }
  if (ruta === '/api/login' && metodo === 'POST') return login(request, env);
  if (ruta === '/api/logout' && metodo === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }

  if (!configurado(env)) throw fallo(503, 'El panel todavía no está configurado. Falta cargar la contraseña y la clave de GitHub en Cloudflare.');
  if (!(await sesionValida(request, env))) throw fallo(401, 'Tu sesión venció. Volvé a entrar.');

  if (ruta === '/api/noticias' && metodo === 'GET') {
    const { noticias } = await leerEstado(env);
    return json({ noticias });
  }
  if (ruta === '/api/noticias' && metodo === 'POST') {
    const body = await leerJson(request);
    const resultado = await guardarNoticia(env, body);
    return json(resultado);
  }
  const borrar = /^\/api\/noticias\/([a-z0-9-]+)$/.exec(ruta);
  if (borrar && metodo === 'DELETE') {
    const resultado = await borrarNoticia(env, borrar[1]);
    return json(resultado);
  }
  throw fallo(404, 'Esa dirección no existe.');
}

/* ---- login y sesión ---------------------------------------------------- */
function configurado(env) {
  return !!(env.ADMIN_PASSWORD && env.GITHUB_TOKEN && env.GITHUB_REPO);
}

async function login(request, env) {
  if (!configurado(env)) throw fallo(503, 'El panel todavía no está configurado. Falta cargar la contraseña y la clave de GitHub en Cloudflare.');
  const { password } = await leerJson(request);
  const ok = typeof password === 'string' && await iguales(password, env.ADMIN_PASSWORD);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    throw fallo(401, 'La contraseña no es correcta.');
  }
  const vence = Date.now() + SESION_HORAS * 3600 * 1000;
  const token = vence + '.' + await firmar(env, String(vence));
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, SESION_HORAS * 3600) });
}

async function sesionValida(request, env) {
  if (!configurado(env)) return false;
  const m = /(?:^|;\s*)panel=([0-9]+)\.([A-Za-z0-9_-]+)/.exec(request.headers.get('Cookie') || '');
  if (!m || Number(m[1]) < Date.now()) return false;
  return iguales(m[2], await firmar(env, m[1]));
}

function cookie(valor, maxAge) {
  return `panel=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function firmar(env, texto) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_PASSWORD + '\n' + env.GITHUB_TOKEN));
  const key = await crypto.subtle.importKey('raw', base, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(texto));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function iguales(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function mismoOrigen(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

/* ---- operaciones sobre noticias ---------------------------------------- */
async function guardarNoticia(env, body) {
  const original = typeof body.original === 'string' ? body.original : null;
  const imagenes = Array.isArray(body.imagenes) ? body.imagenes : [];
  const archivos = imagenes.map(validarImagen);

  return commitConReintento(env, async (noticias) => {
    const existente = original ? noticias.find((n) => n.slug === original) : null;
    if (original && !existente) throw fallo(409, 'Esa noticia ya no existe: alguien la borró mientras editabas. Recargá el panel.');

    const item = await limpiarNoticia(body.noticia || {}, existente);
    const usados = new Set(noticias.filter((n) => n !== existente).map((n) => n.slug));
    if (!existente) {
      let base = slugify(item.slug || item.titulo) || 'noticia', slug = base, i = 2;
      while (usados.has(slug)) slug = `${base}-${i++}`;
      item.slug = slug;
    } else {
      item.slug = existente.slug;
    }

    const rutasNuevas = new Set(archivos.map((a) => '/' + a.path));
    const usadas = [item.portada, ...item.galeria, ...[...item.cuerpo.matchAll(/src="([^"]+)"/g)].map((m) => m[1])];
    const subir = archivos.filter((a) => usadas.includes('/' + a.path));
    const yaEstaban = existente ? JSON.stringify(existente) : '';
    for (const r of usadas) {
      if (r && !rutasNuevas.has(r) && !yaEstaban.includes(r) && !(await existeEnRepo(env, r))) {
        throw fallo(400, 'Una de las imágenes no se encontró. Volvé a subirla.');
      }
    }

    if (item.destacada) noticias.forEach((n) => { n.destacada = false; });
    let lista;
    if (existente) lista = noticias.map((n) => (n === existente ? { ...existente, ...item } : n));
    else lista = [item, ...noticias];

    const accion = existente ? (item.publicada === false && existente.publicada !== false ? 'oculta' : 'edita') : 'agrega';
    return { noticias: lista, archivos: subir, mensaje: `Noticias: ${accion} "${item.titulo}" (desde el panel)`, slug: item.slug };
  });
}

async function borrarNoticia(env, slug) {
  return commitConReintento(env, async (noticias) => {
    const n = noticias.find((x) => x.slug === slug);
    if (!n) throw fallo(404, 'Esa noticia ya no existe.');
    return { noticias: noticias.filter((x) => x !== n), archivos: [], mensaje: `Noticias: borra "${n.titulo}" (desde el panel)`, slug };
  });
}

async function limpiarNoticia(n, existente) {
  const texto = (v, max) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const titulo = texto(n.titulo, 160);
  if (!titulo) throw fallo(400, 'La noticia necesita un título.');
  const fecha = String(n.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha))) throw fallo(400, 'La fecha no es válida.');
  const categoria = CATEGORIAS.includes(n.categoria) ? n.categoria : (existente && existente.categoria) || CATEGORIAS[0];

  const ruta = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    const r = s.startsWith('/') ? s : '/' + s;
    if (!/^\/img\/noticias\/[a-z0-9._-]+\.(jpe?g|png|webp|gif)$/i.test(r)) throw fallo(400, 'Una de las imágenes tiene una ruta que no es válida.');
    return r;
  };
  const videos = (Array.isArray(n.videos) ? n.videos : []).map((v) => youtubeId(String(v))).filter(Boolean)
    .map((id) => `https://www.youtube.com/watch?v=${id}`);

  return {
    titulo,
    slug: existente ? existente.slug : texto(n.slug, 80),
    fecha,
    categoria,
    destacada: n.destacada === true,
    portada: ruta(n.portada),
    bajada: texto(n.bajada, 400),
    cuerpo: await limpiarHtml(String(n.cuerpo || '')),
    videos: [...new Set(videos)].slice(0, 10),
    galeria: (Array.isArray(n.galeria) ? n.galeria : []).map(ruta).filter(Boolean).slice(0, 24),
    publicada: n.publicada !== false
  };
}

function validarImagen(img) {
  const path = String(img && img.path || '');
  if (!/^img\/noticias\/[a-z0-9._-]+\.(jpe?g|png|webp)$/.test(path)) throw fallo(400, 'Una de las imágenes tiene un nombre que no es válido.');
  const data = String(img.data || '').replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw fallo(400, 'Una de las imágenes no se pudo leer. Volvé a subirla.');
  if (data.length * 0.75 > MAX_IMAGEN_BYTES) throw fallo(413, 'Una de las imágenes pesa demasiado. Probá con una más chica.');
  return { path, data };
}

/* HTML permitido en el cuerpo de la noticia */
const ETIQUETAS = new Set(['p', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'br']);
const ELIMINAR = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'template', 'noscript', 'head', 'title', 'meta', 'link']);

async function limpiarHtml(html) {
  const rw = new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (ELIMINAR.has(tag)) { el.remove(); return; }
        if (!ETIQUETAS.has(tag)) { el.removeAndKeepContent(); return; }
        const attrs = [...el.attributes];
        for (const [name] of attrs) el.removeAttribute(name);
        const get = (k) => (attrs.find(([n]) => n.toLowerCase() === k) || [])[1] || '';
        if (tag === 'b') el.tagName = 'strong';
        if (tag === 'i') el.tagName = 'em';
        if (tag === 'a') {
          const href = get('href').trim();
          if (/^(https?:|mailto:|\/)/i.test(href)) el.setAttribute('href', href);
          else el.removeAndKeepContent();
        }
        if (tag === 'img') {
          const src = get('src').trim();
          if (/^\/?img\/noticias\/[a-z0-9._-]+\.(jpe?g|png|webp|gif)$/i.test(src)) {
            el.setAttribute('src', src.startsWith('/') ? src : '/' + src);
            el.setAttribute('alt', get('alt').slice(0, 200));
          } else el.remove();
        }
      }
    })
    .onDocument({ comments(c) { c.remove(); }, doctype() {} });
  const out = await rw.transform(new Response(html)).text();
  return out.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim().slice(0, 60000);
}

/* ---- GitHub ------------------------------------------------------------ */
async function gh(env, metodo, path, body) {
  const base = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const res = await fetch(`${base}/repos/${env.GITHUB_REPO}${path}`, {
    method: metodo,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'panel-noticias-la-empujadora',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 || res.status === 403) {
    throw fallo(502, 'GitHub rechazó la clave del panel. Revisá que el token siga vigente y tenga permiso de escritura en el repo.');
  }
  return res;
}

async function ghJson(env, metodo, path, body) {
  const res = await gh(env, metodo, path, body);
  if (!res.ok) {
    const e = fallo(502, 'No pudimos hablar con GitHub. Probá de nuevo en unos segundos.');
    e.ghStatus = res.status;
    throw e;
  }
  return res.json();
}

const rama = (env) => env.GITHUB_BRANCH || 'main';

async function leerEstado(env) {
  const ref = await ghJson(env, 'GET', `/git/ref/heads/${encodeURIComponent(rama(env))}`);
  const commitSha = ref.object.sha;
  const commit = await ghJson(env, 'GET', `/git/commits/${commitSha}`);
  const file = await ghJson(env, 'GET', `/contents/${DATA_PATH}?ref=${commitSha}`);
  const bytes = Uint8Array.from(atob(String(file.content).replace(/\s/g, '')), (c) => c.charCodeAt(0));
  let noticias = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(noticias)) noticias = noticias.noticias || [];
  return { commitSha, treeSha: commit.tree.sha, noticias };
}

async function existeEnRepo(env, ruta) {
  const res = await gh(env, 'GET', `/contents/${ruta.replace(/^\//, '')}?ref=${encodeURIComponent(rama(env))}`);
  return res.ok;
}

async function commitConReintento(env, operar) {
  for (let intento = 0; intento < 3; intento++) {
    const estado = await leerEstado(env);
    const cambio = await operar(estado.noticias.map((n) => ({ ...n })));

    const tree = [];
    for (const a of cambio.archivos) {
      const blob = await ghJson(env, 'POST', '/git/blobs', { content: a.data, encoding: 'base64' });
      tree.push({ path: a.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    tree.push({ path: DATA_PATH, mode: '100644', type: 'blob', content: JSON.stringify(cambio.noticias, null, 2) + '\n' });

    const nuevoTree = await ghJson(env, 'POST', '/git/trees', { base_tree: estado.treeSha, tree });
    const commit = await ghJson(env, 'POST', '/git/commits', {
      message: cambio.mensaje,
      tree: nuevoTree.sha,
      parents: [estado.commitSha]
    });
    const res = await gh(env, 'PATCH', `/git/refs/heads/${encodeURIComponent(rama(env))}`, { sha: commit.sha, force: false });
    if (res.ok) return { ok: true, slug: cambio.slug, noticias: cambio.noticias, commit: commit.sha };
    if (res.status !== 422 && res.status !== 409) throw fallo(502, 'No pudimos guardar en GitHub. Probá de nuevo en unos segundos.');
    // Otro cambio entró justo antes: volvemos a leer y aplicamos de nuevo.
  }
  throw fallo(409, 'Hubo varios cambios al mismo tiempo y no pudimos guardar. Probá de nuevo.');
}

/* ---- utilidades -------------------------------------------------------- */
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '');
  return m ? m[1] : null;
}

async function leerJson(request) {
  try { return await request.json(); } catch { throw fallo(400, 'El pedido llegó incompleto. Probá de nuevo.'); }
}

function fallo(status, publico) {
  const e = new Error(publico);
  e.status = status;
  e.publico = publico;
  return e;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}
