/* ==========================================================================
   Panel de noticias — interfaz
   Habla con /api/* (worker/index.js). No guarda nada en el navegador:
   cada "Guardar y publicar" se escribe en GitHub y Cloudflare publica solo.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MAX_LADO = 1600;

  var estado = {
    noticias: [],
    editando: null,      // slug original o null si es nueva
    pendientes: {},      // ruta "/img/noticias/x.jpg" -> dataURL (fotos nuevas sin subir)
    recientes: {},       // fotos ya subidas que el sitio todavía no publicó (para verlas en el panel)
    portada: '',
    galeria: [],
    guardando: false,
    sucio: false
  };

  /* ---- utilidades ------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  }
  function hoy() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fechaCorta(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '');
    return m ? (+m[3]) + ' ' + MESES[+m[2] - 1] + ' ' + m[1] : '';
  }
  function youtubeId(url) {
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '');
    return m ? m[1] : null;
  }
  function src(ruta) {
    var r = String(ruta || '');
    if (r && !/^(\/|data:|https?:)/.test(r)) r = '/' + r;
    return estado.pendientes[r] || estado.recientes[r] || r;
  }

  function mostrar(vista) {
    ['cargando', 'config', 'login', 'lista', 'editor'].forEach(function (v) { $('vista-' + v).hidden = v !== vista; });
    window.scrollTo(0, 0);
  }

  var toastTimer;
  function toast(html, tipo) {
    var t = $('toast');
    t.innerHTML = html;
    t.className = 'toast' + (tipo ? ' toast--' + tipo : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, tipo === 'error' ? 9000 : 7000);
  }

  function api(metodo, ruta, body) {
    return fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && ruta !== '/api/login') { mostrar('login'); $('btn-salir').hidden = true; }
        if (!r.ok) {
          var e = new Error(data.error || 'No pudimos completar la acción. Probá de nuevo.');
          e.status = r.status;
          throw e;
        }
        return data;
      });
    }, function () {
      throw new Error('No hay conexión. Revisá internet y probá de nuevo.');
    });
  }

  /* ---- inicio y login -------------------------------------------------- */
  function iniciar() {
    api('GET', '/api/sesion').then(function (s) {
      if (!s.configurado) return mostrar('config');
      if (!s.sesion) return mostrar('login');
      entrar();
    }).catch(function (e) {
      $('vista-cargando').innerHTML = '<p class="panel-error">' + esc(e.message) + '</p>';
    });
  }

  function entrar() {
    $('btn-salir').hidden = false;
    mostrar('cargando');
    return cargarLista().then(function () { mostrar('lista'); });
  }

  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('login-error');
    var btn = e.target.querySelector('button');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    api('POST', '/api/login', { password: $('login-pass').value }).then(function () {
      $('login-pass').value = '';
      return entrar();
    }).catch(function (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    });
  });

  $('btn-salir').addEventListener('click', function () {
    if (estado.sucio && !confirmarSalida()) return;
    api('POST', '/api/logout').catch(function () {}).then(function () {
      estado.sucio = false;
      $('btn-salir').hidden = true;
      mostrar('login');
    });
  });

  /* ---- listado --------------------------------------------------------- */
  function cargarLista() {
    return api('GET', '/api/noticias').then(function (d) {
      estado.noticias = d.noticias || [];
      pintarLista();
    }).catch(function (e) {
      toast(esc(e.message), 'error');
      throw e;
    });
  }

  function pintarLista() {
    var q = slugify($('lista-buscar').value).replace(/-/g, ' ');
    var lista = estado.noticias.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    var visibles = lista.filter(function (n) { return !q || slugify(n.titulo).replace(/-/g, ' ').indexOf(q) >= 0; });
    var publicadas = lista.filter(function (n) { return n.publicada !== false; }).length;
    $('lista-resumen').textContent = lista.length + (lista.length === 1 ? ' noticia' : ' noticias') + ' · ' + publicadas + ' publicadas';

    if (!lista.length) {
      $('lista').innerHTML = '<li class="panel-empty">Todavía no hay noticias. Tocá <strong>Nueva noticia</strong> para cargar la primera.</li>';
      return;
    }
    if (!visibles.length) {
      $('lista').innerHTML = '<li class="panel-empty">No hay noticias con ese título.</li>';
      return;
    }
    $('lista').innerHTML = visibles.map(function (n) {
      var oculta = n.publicada === false;
      return '<li class="row' + (oculta ? ' row--off' : '') + '" data-slug="' + esc(n.slug) + '">' +
        '<div class="row-thumb">' + (n.portada ? '<img src="' + esc(src(n.portada)) + '" alt="" loading="lazy">' : '') + '</div>' +
        '<div class="row-info">' +
          '<p class="label row-meta"><span class="c-blue">' + esc(n.categoria || '') + '</span> · ' + esc(fechaCorta(n.fecha)) + '</p>' +
          '<button type="button" class="row-title" data-acc="editar">' + esc(n.titulo) + '</button>' +
          '<p class="row-tags">' +
            (oculta ? '<span class="tag tag--off">Oculta</span>' : '<span class="tag tag--on">Publicada</span>') +
            (n.destacada ? '<span class="tag tag--star">Destacada</span>' : '') +
          '</p>' +
        '</div>' +
        '<div class="row-actions">' +
          '<button type="button" class="pill-btn" data-acc="editar">Editar</button>' +
          '<button type="button" class="pill-btn" data-acc="' + (oculta ? 'mostrar' : 'ocultar') + '">' + (oculta ? 'Publicar' : 'Ocultar') + '</button>' +
          (oculta ? '' : '<a class="pill-btn" href="/noticia.html?n=' + encodeURIComponent(n.slug) + '" target="_blank" rel="noopener">Ver</a>') +
          '<button type="button" class="pill-btn pill-btn--danger" data-acc="borrar">Borrar</button>' +
        '</div>' +
        '<div class="row-confirm" hidden>' +
          '<p>¿Borrar <strong>' + esc(n.titulo) + '</strong>? Se saca del sitio y no se puede deshacer desde el panel.</p>' +
          '<button type="button" class="pill-btn pill-btn--danger" data-acc="borrar-si">Sí, borrar</button>' +
          '<button type="button" class="pill-btn" data-acc="borrar-no">No</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  $('lista-buscar').addEventListener('input', pintarLista);

  $('lista').addEventListener('click', function (e) {
    var b = e.target.closest('[data-acc]');
    if (!b) return;
    var row = b.closest('.row');
    var slug = row.getAttribute('data-slug');
    var n = estado.noticias.filter(function (x) { return x.slug === slug; })[0];
    var acc = b.getAttribute('data-acc');
    if (acc === 'editar') return abrirEditor(n);
    if (acc === 'borrar') { row.querySelector('.row-confirm').hidden = false; row.querySelector('[data-acc="borrar-si"]').focus(); return; }
    if (acc === 'borrar-no') { row.querySelector('.row-confirm').hidden = true; return; }
    if (acc === 'borrar-si') {
      bloquearFila(row);
      return api('DELETE', '/api/noticias/' + encodeURIComponent(slug)).then(function (d) {
        estado.noticias = d.noticias;
        pintarLista();
        toast('Borramos <strong>' + esc(n.titulo) + '</strong>. En uno o dos minutos desaparece del sitio.');
      }).catch(function (ex) { toast(esc(ex.message), 'error'); cargarLista(); });
    }
    if (acc === 'ocultar' || acc === 'mostrar') {
      bloquearFila(row);
      var cambio = Object.assign({}, n, { publicada: acc === 'mostrar' });
      return api('POST', '/api/noticias', { original: slug, noticia: cambio, imagenes: [] }).then(function (d) {
        estado.noticias = d.noticias;
        pintarLista();
        toast(acc === 'ocultar'
          ? 'Ocultamos <strong>' + esc(n.titulo) + '</strong>. Queda guardada acá para volver a publicarla.'
          : 'Publicamos <strong>' + esc(n.titulo) + '</strong>. En uno o dos minutos se ve en el sitio.');
      }).catch(function (ex) { toast(esc(ex.message), 'error'); cargarLista(); });
    }
  });

  function bloquearFila(row) {
    row.classList.add('row--busy');
    row.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  }

  $('btn-nueva').addEventListener('click', function () { abrirEditor(null); });

  /* ---- editor ---------------------------------------------------------- */
  function abrirEditor(n) {
    estado.editando = n ? n.slug : null;
    estado.pendientes = {};
    estado.portada = n && n.portada ? (/^\//.test(n.portada) ? n.portada : '/' + n.portada) : '';
    estado.galeria = n ? (n.galeria || []).map(function (g) { return /^\//.test(g) ? g : '/' + g; }) : [];
    $('editor-titulo').textContent = n ? 'Editar noticia' : 'Nueva noticia';
    $('f-titulo').value = n ? n.titulo : '';
    $('f-bajada').value = n ? (n.bajada || '') : '';
    $('f-fecha').value = n ? n.fecha : hoy();
    $('f-categoria').value = n && n.categoria ? n.categoria : 'Novedades';
    $('f-publicada').checked = n ? n.publicada !== false : true;
    $('f-destacada').checked = n ? !!n.destacada : false;
    $('f-cuerpo').innerHTML = n ? (n.cuerpo || '') : '<p><br></p>';
    $('f-cuerpo').querySelectorAll('img').forEach(function (img) {
      var r = img.getAttribute('src');
      var ver = src(r);
      if (ver !== r) { img.setAttribute('data-ruta', /^\//.test(r) ? r : '/' + r); img.setAttribute('src', ver); }
    });
    $('videos').innerHTML = '';
    (n && n.videos || []).forEach(function (v) { agregarVideo(v); });
    $('editor-error').hidden = true;
    contarBajada();
    pintarPortada();
    pintarGaleria();
    estado.sucio = false;
    mostrar('editor');
    $('f-titulo').focus();
  }

  function confirmarSalida() {
    return window.confirm('Tenés cambios sin guardar. ¿Salir igual?');
  }

  function volver() {
    if (estado.sucio && !confirmarSalida()) return;
    estado.sucio = false;
    mostrar('lista');
  }
  $('btn-volver').addEventListener('click', volver);
  $('btn-cancelar').addEventListener('click', volver);
  $('form-noticia').addEventListener('input', function () { estado.sucio = true; });
  window.addEventListener('beforeunload', function (e) {
    if (estado.sucio && !$('vista-editor').hidden) { e.preventDefault(); e.returnValue = ''; }
  });

  function contarBajada() { $('bajada-cuenta').textContent = $('f-bajada').value.length + ' / 400'; }
  $('f-bajada').addEventListener('input', contarBajada);

  /* ---- fotos ----------------------------------------------------------- */
  function procesarFoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Ese archivo no es una imagen.'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var esc1 = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * esc1), h = Math.round(img.naturalHeight * esc1);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', 0.82);
        var base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'foto';
        var ruta = '/img/noticias/' + base + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '.jpg';
        estado.pendientes[ruta] = dataUrl;
        estado.sucio = true;
        resolve(ruta);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa imagen. Probá con un JPG o PNG.')); };
      img.src = url;
    });
  }

  function pintarPortada() {
    $('portada').innerHTML = estado.portada
      ? '<img src="' + esc(src(estado.portada)) + '" alt="Portada"><button type="button" class="thumb-x" id="portada-x" aria-label="Quitar portada">×</button>'
      : '<p class="cover-empty">Sin foto de portada</p>';
    var x = $('portada-x');
    if (x) x.addEventListener('click', function () { estado.portada = ''; estado.sucio = true; pintarPortada(); });
  }

  $('f-portada').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    procesarFoto(f).then(function (ruta) { estado.portada = ruta; pintarPortada(); })
      .catch(function (ex) { toast(esc(ex.message), 'error'); });
  });

  function pintarGaleria() {
    $('galeria').innerHTML = estado.galeria.map(function (r, i) {
      return '<div class="thumb"><img src="' + esc(src(r)) + '" alt="">' +
        '<button type="button" class="thumb-x" data-i="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">×</button></div>';
    }).join('');
  }
  $('galeria').addEventListener('click', function (e) {
    var b = e.target.closest('.thumb-x');
    if (!b) return;
    estado.galeria.splice(+b.getAttribute('data-i'), 1);
    estado.sucio = true;
    pintarGaleria();
  });
  $('f-galeria').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    e.target.value = '';
    files.reduce(function (p, f) {
      return p.then(function () { return procesarFoto(f).then(function (r) { estado.galeria.push(r); pintarGaleria(); }); });
    }, Promise.resolve()).catch(function (ex) { toast(esc(ex.message), 'error'); });
  });

  ['portada', 'galeria'].forEach(function (k) {
    var drop = $('f-' + k).closest('.drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drop--over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('drop--over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('drop--over');
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (k === 'portada' && files[0]) procesarFoto(files[0]).then(function (r) { estado.portada = r; pintarPortada(); }).catch(function (ex) { toast(esc(ex.message), 'error'); });
      if (k === 'galeria') files.reduce(function (p, f) {
        return p.then(function () { return procesarFoto(f).then(function (r) { estado.galeria.push(r); pintarGaleria(); }); });
      }, Promise.resolve()).catch(function (ex) { toast(esc(ex.message), 'error'); });
    });
  });

  /* ---- videos ---------------------------------------------------------- */
  function agregarVideo(valor) {
    var row = document.createElement('div');
    row.className = 'video-row';
    row.innerHTML = '<input type="url" placeholder="https://www.youtube.com/watch?v=…" aria-label="Link del video">' +
      '<button type="button" class="thumb-x thumb-x--inline" aria-label="Quitar video">×</button>';
    row.querySelector('input').value = valor || '';
    row.querySelector('button').addEventListener('click', function () { row.remove(); estado.sucio = true; });
    $('videos').appendChild(row);
    return row.querySelector('input');
  }
  $('btn-video').addEventListener('click', function () { agregarVideo('').focus(); });

  /* ---- editor de texto ------------------------------------------------- */
  var area = $('f-cuerpo');
  var rangoGuardado = null;

  function guardarRango() {
    var s = window.getSelection();
    if (s.rangeCount && area.contains(s.anchorNode)) rangoGuardado = s.getRangeAt(0).cloneRange();
  }
  function restaurarRango() {
    area.focus();
    if (!rangoGuardado) return;
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(rangoGuardado);
  }
  area.addEventListener('keyup', guardarRango);
  area.addEventListener('mouseup', guardarRango);
  area.addEventListener('input', function () { estado.sucio = true; guardarRango(); });

  document.execCommand('defaultParagraphSeparator', false, 'p');

  function bloqueActual() {
    var s = window.getSelection();
    var n = s.anchorNode;
    while (n && n !== area) {
      if (n.nodeType === 1 && /^(H2|H3|BLOCKQUOTE|P)$/.test(n.tagName)) return n.tagName.toLowerCase();
      n = n.parentNode;
    }
    return 'p';
  }

  /* Inserta un bloque propio (video o foto) después del párrafo donde está el cursor */
  function insertarBloque(nodo) {
    restaurarRango();
    var s = window.getSelection();
    var n = s.rangeCount ? s.getRangeAt(0).endContainer : null;
    while (n && n.parentNode !== area) n = n.parentNode;
    var siguiente = document.createElement('p');
    siguiente.innerHTML = '<br>';
    if (n && n.parentNode === area) {
      area.insertBefore(nodo, n.nextSibling);
      if (n.nodeType === 1 && !n.textContent.trim() && !n.querySelector('img')) n.remove();
    } else {
      area.appendChild(nodo);
    }
    area.insertBefore(siguiente, nodo.nextSibling);
    var r = document.createRange();
    r.setStart(siguiente, 0);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
    guardarRango();
    estado.sucio = true;
  }

  var pop = $('rte-pop'), popModo = null;
  function abrirPop(modo) {
    guardarRango();
    popModo = modo;
    $('rte-pop-label').textContent = modo === 'link' ? 'Pegá el link' : 'Pegá el link del video de YouTube';
    $('rte-pop-input').value = '';
    $('rte-pop-input').placeholder = modo === 'link' ? 'https://' : 'https://www.youtube.com/watch?v=…';
    pop.hidden = false;
    $('rte-pop-input').focus();
  }
  function cerrarPop() { pop.hidden = true; popModo = null; }
  $('rte-pop-cancel').addEventListener('click', function () { cerrarPop(); restaurarRango(); });
  $('rte-pop-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('rte-pop-ok').click(); }
    if (e.key === 'Escape') { cerrarPop(); restaurarRango(); }
  });
  $('rte-pop-ok').addEventListener('click', function () {
    var v = $('rte-pop-input').value.trim();
    if (!v) return cerrarPop();
    if (popModo === 'video') {
      var id = youtubeId(v);
      if (!id) { toast('Ese link no es de un video de YouTube.', 'error'); return; }
      cerrarPop();
      var pv = document.createElement('p');
      pv.textContent = 'https://www.youtube.com/watch?v=' + id;
      insertarBloque(pv);
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(v)) v = 'https://' + v;
    cerrarPop();
    restaurarRango();
    var s = window.getSelection();
    if (s.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + esc(v) + '">' + esc(v) + '</a>');
    else document.execCommand('createLink', false, v);
    estado.sucio = true;
  });

  document.querySelector('.rte-bar').addEventListener('mousedown', function (e) {
    if (e.target.closest('button')) e.preventDefault();
  });
  document.querySelector('.rte-bar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cmd]');
    if (!b) return;
    var cmd = b.getAttribute('data-cmd');
    if (cmd === 'link' || cmd === 'video') return abrirPop(cmd);
    if (cmd === 'img') { guardarRango(); return $('f-imgcuerpo').click(); }
    restaurarRango();
    if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
    if (cmd === 'ul') document.execCommand('insertUnorderedList');
    if (cmd === 'h2') document.execCommand('formatBlock', false, bloqueActual() === 'h2' ? 'p' : 'h2');
    if (cmd === 'p') document.execCommand('formatBlock', false, 'p');
    if (cmd === 'quote') document.execCommand('formatBlock', false, bloqueActual() === 'blockquote' ? 'p' : 'blockquote');
    guardarRango();
    estado.sucio = true;
  });

  $('f-imgcuerpo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    procesarFoto(f).then(function (ruta) {
      var pi = document.createElement('p');
      var img = document.createElement('img');
      img.src = estado.pendientes[ruta];
      img.setAttribute('data-ruta', ruta);
      img.alt = '';
      pi.appendChild(img);
      insertarBloque(pi);
    }).catch(function (ex) { toast(esc(ex.message), 'error'); });
  });

  /* Pegar: solo texto, separado en párrafos */
  area.addEventListener('paste', function (e) {
    var t = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!t) return;
    e.preventDefault();
    var html = t.replace(/\r/g, '').split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).filter(function (p) { return p !== '<p></p>'; }).join('');
    document.execCommand('insertHTML', false, html);
  });

  /* Cuerpo listo para guardar: fotos nuevas con su ruta final */
  function cuerpoParaGuardar() {
    var tmp = document.createElement('div');
    tmp.innerHTML = area.innerHTML;
    tmp.querySelectorAll('img').forEach(function (img) {
      var r = img.getAttribute('data-ruta');
      if (r) { img.setAttribute('src', r); img.removeAttribute('data-ruta'); }
    });
    tmp.querySelectorAll('div').forEach(function (d) {
      var p = document.createElement('p');
      p.innerHTML = d.innerHTML;
      d.replaceWith(p);
    });
    return tmp.innerHTML;
  }

  /* ---- guardar --------------------------------------------------------- */
  $('form-noticia').addEventListener('submit', function (e) {
    e.preventDefault();
    if (estado.guardando) return;
    var err = $('editor-error');
    err.hidden = true;

    var titulo = $('f-titulo').value.trim();
    if (!titulo) { err.textContent = 'Falta el título.'; err.hidden = false; $('f-titulo').focus(); return; }
    if (!$('f-fecha').value) { err.textContent = 'Falta la fecha.'; err.hidden = false; $('f-fecha').focus(); return; }

    var videos = [];
    var malos = 0;
    $('videos').querySelectorAll('input').forEach(function (i) {
      var v = i.value.trim();
      if (!v) return;
      if (youtubeId(v)) videos.push(v); else malos++;
    });
    if (malos) { err.textContent = 'Uno de los videos no es un link de YouTube. Corregilo o quitalo.'; err.hidden = false; return; }

    var cuerpo = cuerpoParaGuardar();
    var original = estado.editando ? estado.noticias.filter(function (n) { return n.slug === estado.editando; })[0] : null;
    var noticia = Object.assign({}, original || {}, {
      titulo: titulo,
      fecha: $('f-fecha').value,
      categoria: $('f-categoria').value,
      publicada: $('f-publicada').checked,
      destacada: $('f-destacada').checked,
      portada: estado.portada,
      bajada: $('f-bajada').value.trim(),
      cuerpo: cuerpo,
      videos: videos,
      galeria: estado.galeria.slice()
    });
    var usadas = [estado.portada].concat(estado.galeria, Object.keys(estado.pendientes).filter(function (r) { return cuerpo.indexOf(r) >= 0; }));
    var imagenes = Object.keys(estado.pendientes).filter(function (r) { return usadas.indexOf(r) >= 0; }).map(function (r) {
      return { path: r.replace(/^\//, ''), data: estado.pendientes[r] };
    });

    var btn = $('btn-guardar');
    estado.guardando = true;
    btn.disabled = true;
    btn.textContent = imagenes.length ? 'Subiendo fotos y publicando…' : 'Publicando…';

    api('POST', '/api/noticias', { original: estado.editando, noticia: noticia, imagenes: imagenes }).then(function (d) {
      imagenes.forEach(function (i) { estado.recientes['/' + i.path] = i.data; });
      estado.noticias = d.noticias;
      estado.sucio = false;
      pintarLista();
      mostrar('lista');
      var visible = noticia.publicada;
      toast((estado.editando ? 'Guardamos los cambios.' : 'Cargamos la noticia.') +
        (visible ? ' En uno o dos minutos se ve en el sitio. <a href="/noticia.html?n=' + encodeURIComponent(d.slug) + '" target="_blank" rel="noopener">Ver noticia</a>' : ' Quedó oculta: no se ve en el sitio hasta que la publiques.'), 'ok');
    }).catch(function (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }).then(function () {
      estado.guardando = false;
      btn.disabled = false;
      btn.textContent = 'Guardar y publicar';
    });
  });

  iniciar();
})();
