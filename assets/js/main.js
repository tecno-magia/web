/* Tecno Magia — interacciones: tema, header, video, menú, carrusel mobile, FAB, reveal.
   Todo lo específico de mobile está gateado con matchMedia('(max-width: 900px)').
   En desktop no se ejecuta nada nuevo. */
(function () {
  "use strict";

  var root = document.documentElement;
  var mqMobile = window.matchMedia("(max-width: 900px)");
  var mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- Tema claro/oscuro --- */
  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (ev) {
    var stored = null;
    try { stored = localStorage.getItem("theme"); } catch (e) {}
    if (stored !== "dark" && stored !== "light") {
      root.dataset.theme = ev.matches ? "dark" : "light";
    }
  });

  /* --- Header: fondo al scrollear --- */
  var header = document.getElementById("site-header");
  function onScrollHeader() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* --- Video del hero: desktop 1080p, mobile 720p --- */
  var video = document.getElementById("hero-video");
  if (video) {
    var heroSrc = mqMobile.matches
      ? (video.dataset.srcMobile || video.dataset.srcDesktop)
      : video.dataset.srcDesktop;
    if (heroSrc) {
      /* mientras el video no reproduce, en mobile se ve el gradiente SIN el
         overlay oscuro (que lo aplastaba a negro); la clase habilita el overlay
         recién cuando hay frames. En desktop la clase no tiene efecto. */
      video.addEventListener("playing", function () {
        var hero = video.closest(".hero");
        if (hero) hero.classList.add("hero-video-on");
      }, { once: true });
      video.src = heroSrc;
      video.muted = true;
      video.play().catch(function () {});
    }
  }

  /* --- Menú: hamburguesa, acordeón de Servicios (tap), scroll lock --- */
  var navToggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("site-nav");

  function closeMenu() {
    if (!nav) return;
    nav.classList.remove("open");
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Abrir menú");
    }
    document.body.classList.remove("nav-open");
  }

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      document.body.classList.toggle("nav-open", open && mqMobile.matches);
    });

    /* tap en el scrim (fuera del panel) cierra el menú */
    nav.addEventListener("click", function (e) {
      if (e.target === nav) closeMenu();
    });

    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function (e) {
        var item = a.parentElement;
        var isAccordionParent = item && item.classList.contains("nav-item") &&
          a.nextElementSibling && a.nextElementSibling.classList.contains("dropdown");
        if (mqMobile.matches && isAccordionParent) {
          e.preventDefault();
          item.classList.toggle("open");
          return;
        }
        closeMenu();
      });
    });
  }

  /* --- Carruseles (servicios + testimonios), solo mobile --- */
  var carousels = [];

  function buildCarousel(track, dotsWrap, section) {
    var items = Array.prototype.filter.call(track.children, function (el) { return el.nodeType === 1; });
    if (!items.length) return null;
    var current = 0, timer = null, inView = true, touching = false, raf = null;

    dotsWrap.innerHTML = "";
    var dots = items.map(function (_, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Ir a " + (i + 1));
      b.addEventListener("click", function () { goTo(i); });
      dotsWrap.appendChild(b);
      return b;
    });

    function setActive(i) {
      current = i;
      dots.forEach(function (d, di) { d.setAttribute("aria-current", di === i ? "true" : "false"); });
    }
    /* easeOutQuint == cubic-bezier(0.22, 1, 0.36, 1): salida rápida-a-suave */
    function ease(p) { return 1 - Math.pow(1 - p, 5); }

    /* Desliz propio con requestAnimationFrame: suave SIEMPRE, incluso con
       prefers-reduced-motion (el scroll nativo "smooth" se ignora bajo reduced-motion;
       setear scrollLeft a mano por frame, NO). Se usa en auto-avance y dots. */
    function slideTo(target) {
      if (raf) cancelAnimationFrame(raf);
      var max = track.scrollWidth - track.clientWidth;
      var to = Math.max(0, Math.min(target, max));
      var from = track.scrollLeft;
      var dist = to - from;
      if (Math.abs(dist) < 2) { track.scrollLeft = to; return; }
      track.style.scrollSnapType = "none"; /* que el snap no pelee con la animación */
      var t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / 520, 1);
        track.scrollLeft = from + dist * ease(p);
        if (p < 1) { raf = requestAnimationFrame(step); }
        else { raf = null; track.style.scrollSnapType = ""; } /* restaura snap para el swipe */
      }
      raf = requestAnimationFrame(step);
    }

    function goTo(i) {
      var el = items[i];
      setActive(i); /* current es autoritativo: el autoplay avanza sí o sí, no depende del observer */
      slideTo(el.offsetLeft - (track.clientWidth - el.clientWidth) / 2);
    }
    setActive(0);

    var itemIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          var idx = items.indexOf(e.target);
          if (idx >= 0) setActive(idx);
        }
      });
    }, { root: track, threshold: [0.6] });
    items.forEach(function (el) { itemIO.observe(el); });

    function tick() { goTo((current + 1) % items.length); }
    function start() {
      /* OJO: antes había un `mqReduced.matches` acá que impedía arrancar el interval
         cuando el sistema tiene animaciones reducidas (típico en Windows debloateado).
         Ese era el bug: el auto-avance nunca corría. Ahora avanza igual y el desliz
         (slideTo, por rAF) es suave para todos, incluido reduced-motion. */
      if (timer || touching || !inView || !mqMobile.matches) return;
      timer = setInterval(tick, 4000);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    /* pausa mientras el dedo toca; retoma al soltar. Si tocás en medio de un desliz,
       cancelo la animación y restauro el snap para que el swipe nativo tome el control. */
    track.addEventListener("touchstart", function () {
      touching = true; stop();
      if (raf) { cancelAnimationFrame(raf); raf = null; track.style.scrollSnapType = ""; }
    }, { passive: true });
    track.addEventListener("touchend", function () { touching = false; setTimeout(start, 600); }, { passive: true });

    if (section) {
      var sectionIO = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView) start(); else stop();
      }, { threshold: 0.2 });
      sectionIO.observe(section);
    }
    start();

    return {
      destroy: function () {
        stop();
        itemIO.disconnect();
        if (section) sectionIO.disconnect();
        dotsWrap.innerHTML = "";
      }
    };
  }

  function initCarousel() {
    if (carousels.length) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-carousel-track]"), function (track) {
      var name = track.getAttribute("data-carousel-track");
      var dots = document.querySelector('[data-carousel-dots="' + name + '"]');
      if (!dots) return;
      var c = buildCarousel(track, dots, track.closest("section"));
      if (c) carousels.push(c);
    });
  }

  function destroyCarousel() {
    carousels.forEach(function (c) { c.destroy(); });
    carousels = [];
  }

  /* --- Init mobile + reacción a cruzar el breakpoint ---
     El FAB de WhatsApp es siempre visible en mobile (display:none en desktop, vía CSS). */
  if (mqMobile.matches) initCarousel();

  mqMobile.addEventListener("change", function (e) {
    if (e.matches) {
      initCarousel();
    } else {
      closeMenu();
      destroyCarousel();
    }
  });

  /* --- Aparición de secciones al hacer scroll ---
     Con animaciones reducidas solo se omite en DESKTOP: en mobile la entrada
     escalonada es parte del diseño (mismo criterio que el carrusel). */
  var items = document.querySelectorAll(".reveal");
  if ((mqReduced.matches && !mqMobile.matches) || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  items.forEach(function (el) { revealIO.observe(el); });
})();
