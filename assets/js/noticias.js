/* ==========================================================================
   Noticias — lee data/noticias.json y arma el listado y el detalle.
   El diseño vive acá y en site.css; el contenido vive solo en el JSON.
   ========================================================================== */
(function () {
  'use strict';

  var DATA_URL = 'data/noticias.json';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var CHEV = '<svg class="chev" viewBox="0 0 120 80" aria-hidden="true"><polyline points="14,12 54,40 14,68" fill="none" stroke="currentColor" stroke-width="16"/><polyline points="58,12 98,40 58,68" fill="none" stroke="currentColor" stroke-width="16"/></svg>';

  /* ---- utilidades ------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  function parseFecha(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fechaLarga(f) {
    var d = parseFecha(f);
    return d ? d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() : '';
  }
  /* Pages CMS guarda rutas como "/img/...": las dejamos relativas para que funcionen igual en cualquier carpeta */
  function ruta(src) { return String(src || '').replace(/^\/(?!\/)/, ''); }

  function fechaCorta(f) {
    var d = parseFecha(f);
    return d ? d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() : '';
  }
  function youtubeId(url) {
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '');
    return m ? m[1] : null;
  }

  /* Markdown simple, por si el cuerpo llega en markdown en vez de HTML */
  function mdToHtml(md) {
    var lines = String(md).replace(/\r/g, '').split('\n');
    var out = [], para = [], list = null;
    function inline(t) {
      return esc(t)
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    }
    function flush() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
      if (list) { out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; }
    }
    lines.forEach(function (l) {
      var h = /^(#{1,3})\s+(.*)/.exec(l), ul = /^\s*[-*]\s+(.*)/.exec(l), ol = /^\s*\d+\.\s+(.*)/.exec(l), bq = /^>\s?(.*)/.exec(l);
      if (!l.trim()) { flush(); return; }
      if (h) { flush(); var lvl = Math.min(h[1].length + 1, 3); out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>'); return; }
      if (ul || ol) {
        var tag = ul ? 'ul' : 'ol';
        if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
        if (list && list.tag !== tag) flush();
        if (!list) list = { tag: tag, items: [] };
        list.items.push((ul || ol)[1]); return;
      }
      if (bq) { flush(); out.push('<blockquote>' + inline(bq[1]) + '</blockquote>'); return; }
      if (list) flush();
      para.push(l.trim());
    });
    flush();
    return out.join('');
  }

  function videoHtml(url) {
    var id = youtubeId(url);
    if (!id) return '';
    return '<div class="video" data-yt="' + id + '">' +
      '<button type="button" class="video-facade" style="background-image:url(https://i.ytimg.com/vi/' + id + '/hqdefault.jpg)" aria-label="Reproducir video">' +
      '<span class="video-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l15 8-15 8z" fill="currentColor"/></svg></span></button>' +
      '<a class="video-link" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">Ver en YouTube</a></div>';
  }

  /* Cuerpo: acepta HTML o markdown; un link de YouTube solo en un párrafo se convierte en video */
  function cuerpoHtml(cuerpo) {
    var html = String(cuerpo || '').trim();
    if (html && html.charAt(0) !== '<') html = mdToHtml(html);
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script, style, iframe:not([src*="youtube"])').forEach(function (n) { n.remove(); });
    tmp.querySelectorAll('p').forEach(function (p) {
      var txt = p.textContent.trim();
      var soloLink = p.children.length === 0 || (p.children.length === 1 && p.firstElementChild.tagName === 'A' && p.firstElementChild.textContent.trim() === txt);
      if (soloLink && /^https?:\/\/\S+$/.test(txt) && youtubeId(txt)) {
        var w = document.createElement('div'); w.innerHTML = videoHtml(txt);
        p.replaceWith(w.firstElementChild);
      }
    });
    tmp.querySelectorAll('iframe[src*="youtube"]').forEach(function (f) {
      var id = youtubeId(f.getAttribute('src'));
      if (id) { var w = document.createElement('div'); w.innerHTML = videoHtml('https://youtu.be/' + id); f.replaceWith(w.firstElementChild); }
    });
    tmp.querySelectorAll('img').forEach(function (i) { i.setAttribute('src', ruta(i.getAttribute('src'))); i.loading = 'lazy'; if (!i.alt) i.alt = ''; });
    tmp.querySelectorAll('a[href^="http"]').forEach(function (a) { a.target = '_blank'; a.rel = 'noopener'; });
    return tmp.innerHTML;
  }

  function activarVideos(root) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.video-facade');
      if (!b) return;
      var box = b.closest('.video');
      var id = box.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      f.title = 'Video de YouTube';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      b.replaceWith(f);
    });
  }

  /* ---- datos ----------------------------------------------------------- */
  function normalizar(lista) {
    var usados = {};
    return (lista || []).filter(function (n) { return n && n.titulo && n.publicada !== false; }).map(function (n) {
      var slug = slugify(n.slug || n.titulo) || 'noticia';
      while (usados[slug]) slug += '-2';
      usados[slug] = true;
      return {
        slug: slug,
        titulo: n.titulo,
        fecha: n.fecha || '',
        categoria: n.categoria || '',
        destacada: !!n.destacada,
        portada: ruta(n.portada),
        bajada: n.bajada || '',
        cuerpo: n.cuerpo || '',
        videos: (n.videos || []).map(function (v) { return typeof v === 'string' ? v : (v && (v.url || v.video)); }).filter(Boolean),
        galeria: (n.galeria || []).map(function (g) { return ruta(typeof g === 'string' ? g : (g && (g.imagen || g.src))); }).filter(Boolean)
      };
    }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
  }

  function cargar() {
    return fetch(DATA_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { return normalizar(Array.isArray(d) ? d : d.noticias); });
  }

  function tarjeta(n, featured) {
    return '<a class="card' + (featured ? ' card--featured' : '') + '" href="noticia.html?n=' + encodeURIComponent(n.slug) + '#' + encodeURIComponent(n.slug) + '">' +
      (n.portada ? '<img class="card-img" src="' + esc(n.portada) + '" alt="" loading="lazy">' : '') +
      '<div class="card-body">' +
      (featured ? '<span class="badge-new">Lo último</span>' : '') +
      '<p class="label card-meta">' + (n.categoria ? '<span class="cat">' + esc(n.categoria) + '</span><span aria-hidden="true">·</span>' : '') + '<time datetime="' + esc(n.fecha) + '">' + esc(featured ? fechaLarga(n.fecha) : fechaCorta(n.fecha)) + '</time></p>' +
      '<h3 class="heading">' + esc(n.titulo) + '</h3>' +
      (n.bajada ? '<p>' + esc(n.bajada) + '</p>' : '') +
      '<span class="card-more">Leer noticia ' + CHEV + '</span>' +
      '</div></a>';
  }

  /* ---- listado (home) -------------------------------------------------- */
  function initListado() {
    var grid = document.getElementById('news-grid');
    if (!grid) return;
    var filtros = document.getElementById('news-filters');
    cargar().then(function (todas) {
      if (!todas.length) { grid.innerHTML = '<p class="empty">Todavía no hay noticias publicadas.</p>'; return; }
      var cats = [];
      todas.forEach(function (n) { if (n.categoria && cats.indexOf(n.categoria) < 0) cats.push(n.categoria); });
      var actual = '';
      function pintar() {
        var lista = actual ? todas.filter(function (n) { return n.categoria === actual; }) : todas;
        var dest = actual ? null : (lista.filter(function (n) { return n.destacada; })[0] || lista[0]);
        var resto = lista.filter(function (n) { return n !== dest; });
        grid.innerHTML = (dest ? tarjeta(dest, true) : '') + resto.map(function (n) { return tarjeta(n, false); }).join('');
      }
      if (filtros && cats.length > 1) {
        filtros.innerHTML = ['<button type="button" data-cat="" aria-pressed="true">Todas</button>']
          .concat(cats.map(function (c) { return '<button type="button" data-cat="' + esc(c) + '" aria-pressed="false">' + esc(c) + '</button>'; })).join('');
        filtros.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          actual = b.getAttribute('data-cat');
          filtros.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          pintar();
        });
      }
      pintar();
    }).catch(function () {
      grid.innerHTML = '<p class="empty">No pudimos cargar las noticias. Si abriste el archivo directo desde tu computadora, probalo desde un servidor (por ejemplo, ya publicado en Cloudflare Pages).</p>';
    });
  }

  /* ---- detalle --------------------------------------------------------- */
  function initDetalle() {
    var root = document.getElementById('article');
    if (!root) return;
    var params = new URLSearchParams(location.search);
    var slug = params.get('n') || decodeURIComponent(location.hash.replace(/^#/, ''));
    cargar().then(function (todas) {
      var n = todas.filter(function (x) { return x.slug === slug; })[0];
      if (!n) {
        root.innerHTML = '<div class="empty"><p>No encontramos esa noticia. Puede que la hayan sacado o cambiado de nombre.</p><p><a class="btn" href="index.html#noticias">Ver todas las noticias</a></p></div>';
        return;
      }
      document.title = n.titulo + ' · La Empujadora';
      var html = '<header class="article-head">' +
        '<p class="label meta">' + (n.categoria ? '<span class="cat">' + esc(n.categoria) + '</span>' : '') + '<time datetime="' + esc(n.fecha) + '">' + esc(fechaLarga(n.fecha)) + '</time></p>' +
        '<h1 class="display">' + esc(n.titulo) + '</h1>' +
        (n.bajada ? '<p class="lead">' + esc(n.bajada) + '</p>' : '') +
        '</header>';
      if (n.portada) html += '<figure class="article-cover" style="margin-inline:0"><img src="' + esc(n.portada) + '" alt=""></figure>';
      html += '<div class="prose">' + cuerpoHtml(n.cuerpo) + '</div>';
      if (n.videos.length) {
        html += '<h2 class="display block-title" style="font-size:2rem">' + (n.videos.length > 1 ? 'Videos' : 'Video') + '</h2><div class="prose">' + n.videos.map(videoHtml).join('') + '</div>';
      }
      if (n.galeria.length) {
        html += '<h2 class="display block-title" style="font-size:2rem">Galería</h2><div class="gallery">' +
          n.galeria.map(function (src, i) { return '<button type="button" data-src="' + esc(src) + '" aria-label="Ampliar imagen ' + (i + 1) + '"><img src="' + esc(src) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>';
      }
      var otras = todas.filter(function (x) { return x !== n; }).slice(0, 2);
      if (otras.length) {
        html += '<section class="more"><h2 class="display" style="font-size:clamp(2rem,5vw,3rem);margin-bottom:1.25rem">Más noticias</h2><div class="news-grid">' + otras.map(function (o) { return tarjeta(o, false); }).join('') + '</div></section>';
      }
      root.innerHTML = html;
      activarVideos(root);
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.gallery button'); if (!b) return;
        abrirLightbox(b.getAttribute('data-src'));
      });
      window.scrollTo(0, 0);
    }).catch(function () {
      root.innerHTML = '<p class="empty">No pudimos cargar la noticia. Probá recargar la página.</p>';
    });
  }

  function abrirLightbox(src) {
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Imagen ampliada');
    box.innerHTML = '<img src="' + esc(src) + '" alt=""><button type="button" class="btn btn--light">Cerrar</button>';
    function cerrar() { box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') cerrar(); }
    box.addEventListener('click', function (e) { if (e.target === box || e.target.tagName === 'BUTTON') cerrar(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    box.querySelector('button').focus();
  }

  /* ---- contacto (demo) ------------------------------------------------- */
  function initContacto() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var ok = document.getElementById('contact-ok');
      ok.hidden = false;
      ok.textContent = '¡Gracias, ' + (form.nombre.value.split(' ')[0] || '') + '! Esto es un sitio de prueba: el formulario todavía no envía mensajes. En el sitio real lo conectamos con Brevo y te llega al mail.';
      form.reset();
    });
  }

  /* ---- menú activo ----------------------------------------------------- */
  function initNav() {
    var links = document.querySelectorAll('.nav a[data-section]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('data-section') === en.target.id)); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (a) { var s = document.getElementById(a.getAttribute('data-section')); if (s) io.observe(s); });
  }

  function init() { initListado(); initDetalle(); initContacto(); initNav(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
