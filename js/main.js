/* Ebonee Crawford — cinematic scroll engine
 * Lenis smooth scroll + canvas frame scrub + scroll-driven scenes.
 */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- Lenis ---------- */
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.05 });
  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  /* ---------- kinetic name: split into letters ---------- */
  document.querySelectorAll(".hero__line").forEach((line) => {
    const word = line.dataset.word || "";
    line.innerHTML = [...word]
      .map((ch) => `<span class="ltr">${ch}</span>`)
      .join("");
  });
  const letters = [...document.querySelectorAll(".hero__line .ltr")];

  /* ---------- hero frame sequence ---------- */
  const canvas = document.getElementById("heroCanvas");
  const ctx = canvas.getContext("2d");
  const loaderEl = document.getElementById("loader");
  const loaderBar = document.getElementById("loaderBar");
  const loaderPct = document.getElementById("loaderPct");

  let frames = [];
  let frameCount = 0;
  let framesReady = false;
  let currentFrame = -1;
  let renderedOnce = false;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    currentFrame = -1; // force redraw
  }
  window.addEventListener("resize", () => {
    sizeCanvas();
    drawFrame(lastHeroIndex);
  });

  function drawFrame(i) {
    if (!framesReady || !frames[i]) return;
    if (frames[i] instanceof HTMLImageElement && !frames[i].complete) return;
    if (i === currentFrame && renderedOnce) return;
    currentFrame = i;
    renderedOnce = true;
    const img = frames[i];
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const ir = iw / ih;
    const cr = cw / ch;
    let dw, dh, dx, dy;
    if (cr > ir) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
    else { dh = ch; dw = ch * ir; dy = 0; dx = (cw - dw) / 2; }
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function hideLoader() {
    loaderEl.classList.add("done");
    document.getElementById("heroSub").classList.add("on");
  }

  function loadFrames() {
    return fetch("frames/hero/index.json")
      .then((r) => {
        if (!r.ok) throw new Error("no frame manifest");
        return r.json();
      })
      .then((manifest) => {
        frameCount = manifest.count;
        const pad = (n) => String(n).padStart(4, "0");
        const canBitmap = typeof createImageBitmap === "function";
        // Decode at the size the canvas actually needs (cover fit, 16:9 source)
        // so small screens don't hold full-res bitmaps in memory.
        const needW = Math.ceil(Math.max(canvas.width, (canvas.height * 16) / 9));
        const bmpOpts = needW < 1500 ? { resizeWidth: Math.max(480, needW), resizeQuality: "medium" } : undefined;
        let loaded = 0;
        const critical = Math.max(1, Math.floor(frameCount * 0.35));
        frames = new Array(frameCount).fill(null);

        return new Promise((resolve) => {
          const tally = () => {
            loaded++;
            const pct = Math.round((loaded / frameCount) * 100);
            loaderBar.style.width = pct + "%";
            loaderPct.textContent = pct + "%";
            if (loaded === critical || loaded === frameCount) {
              framesReady = true;
              drawFrame(currentFrame < 0 ? 0 : currentFrame);
              resolve();
            }
          };

          // Pre-decode into ImageBitmaps with limited concurrency so scrubbing
          // never pays JPEG decode cost mid-scroll.
          let next = 0;
          const workers = 6;
          const pump = () => {
            if (next >= frameCount) return;
            const i = next++;
            const url = `frames/hero/frame_${pad(i + 1)}.jpg`;
            const done = (asset) => {
              frames[i] = asset;
              tally();
              pump();
            };
            if (canBitmap) {
              fetch(url)
                .then((r) => r.blob())
                .then((b) => (bmpOpts ? createImageBitmap(b, bmpOpts) : createImageBitmap(b)))
                .then(done)
                .catch(() => {
                  const img = new Image();
                  img.onload = img.onerror = () => done(img);
                  img.src = url;
                });
            } else {
              const img = new Image();
              img.onload = img.onerror = () => done(img);
              img.src = url;
            }
          };
          for (let w = 0; w < workers; w++) pump();
        });
      })
      .catch(() => {
        // Frames not shipped yet — dark stage fallback so layout still works.
        framesReady = false;
        loaderBar.style.width = "100%";
        loaderPct.textContent = "100%";
      });
  }

  /* ---------- scene orchestration ---------- */
  const hero = document.getElementById("hero");
  const heroHint = document.getElementById("heroHint");
  const pillarsSection = document.getElementById("pillars");
  const pillars = [...document.querySelectorAll(".pillar")];
  const progressBar = document.getElementById("progressBar");
  const marqueeTrack = document.getElementById("marqueeTrack");
  const finale = document.querySelector(".finale");
  const heroSub = document.getElementById("heroSub");
  let lastHeroIndex = 0;

  // section progress: 0 when top hits viewport top, 1 when bottom leaves
  function stickyProgress(section) {
    const rect = section.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    return clamp(-rect.top / total, 0, 1);
  }

  function onScroll() {
    const scrollY = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (scrollY / docH) * 100 + "%";

    /* hero scrub */
    const hp = stickyProgress(hero);
    if (frameCount > 0) {
      const idx = Math.round(easeInOutRemap(hp) * (frameCount - 1));
      lastHeroIndex = idx;
      drawFrame(idx);
    }

    /* name letters: track in letter-by-letter across first 45% of hero */
    const n = letters.length;
    letters.forEach((el, i) => {
      const start = 0.03 + (i / n) * 0.3;
      const t = clamp((hp - start) / 0.12, 0, 1);
      const e = easeOut(t);
      el.style.opacity = e;
      el.style.transform = `translateY(${lerp(0.6, 0, e)}em) rotate(${lerp(6, 0, e)}deg)`;
    });

    /* fade name back out at the end of the orbit so the exit is clean */
    const typeEl = document.querySelector(".hero__type");
    const fadeOut = clamp((hp - 0.86) / 0.14, 0, 1);
    typeEl.style.opacity = 1 - fadeOut * 0.9;
    heroHint.style.opacity = clamp(1 - hp * 6, 0, 1);
    if (hp > 0.32) heroSub.classList.add("on");

    /* marquee: scroll-linked drift */
    if (marqueeTrack && !prefersReduced) {
      const half = marqueeTrack.scrollWidth / 2;
      const x = (scrollY * 0.55) % half;
      marqueeTrack.style.transform = `translateX(${-x}px)`;
    }

    /* pillars: three windows over the sticky run */
    const pp = stickyProgress(pillarsSection);
    pillars.forEach((el, i) => {
      const w0 = i / 3, w1 = (i + 1) / 3;
      const local = clamp((pp - w0) / (w1 - w0), 0, 1);
      // rise in over first 30%, hold, sink out over last 20% (except final pillar holds)
      const inT = easeOut(clamp(local / 0.3, 0, 1));
      const outT = i === 2 ? 0 : easeOut(clamp((local - 0.8) / 0.2, 0, 1));
      const vis = inT * (1 - outT);
      el.style.opacity = vis;
      el.style.transform = `translateY(${lerp(60, 0, inT) - 40 * outT}px)`;
      el.style.pointerEvents = vis > 0.5 ? "auto" : "none";
    });
  }

  // slight ease so the orbit lingers on the face at start/end
  function easeInOutRemap(t) {
    return t * t * (3 - 2 * t);
  }

  lenis.on("scroll", onScroll);

  /* ---------- stats count-up ---------- */
  const stats = [...document.querySelectorAll(".stat__num")];
  const statsIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        statsIO.unobserve(entry.target);
        const el = entry.target;
        const target = parseFloat(el.dataset.value);
        const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
        const t0 = performance.now();
        const dur = 1600;
        (function tick(now) {
          const t = clamp((now - t0) / dur, 0, 1);
          const v = Math.round(target * easeOut(t));
          el.textContent = prefix + v + suffix;
          if (t < 1) requestAnimationFrame(tick);
        })(t0);
      });
    },
    { threshold: 0.35 }
  );
  stats.forEach((s) => statsIO.observe(s));

  /* ---------- video sections: play when visible ---------- */
  [document.getElementById("pillarsVideo"), document.getElementById("workVideo")].forEach((vid) => {
    if (!vid) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) vid.play().catch(() => {});
          else vid.pause();
        }),
      { threshold: 0.05 }
    );
    io.observe(vid);
  });

  /* ---------- finale reveal ---------- */
  const finaleIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && finale.classList.add("on")),
    { threshold: 0.35 }
  );
  finaleIO.observe(finale);

  /* ---------- card glow follows cursor ---------- */
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (ev) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((ev.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--my", ((ev.clientY - r.top) / r.height) * 100 + "%");
    });
  });

  /* ---------- anchor links through Lenis ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.6 });
    });
  });

  /* ---------- boot ---------- */
  sizeCanvas();
  loadFrames().then(() => {
    hideLoader();
    onScroll();
  });
  // Safety: never trap the user behind the loader.
  setTimeout(hideLoader, 9000);
})();
