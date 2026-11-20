(function () {
  "use strict";
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  /* Theme toggle: follows the system until the visitor chooses. */
  var themeBtn = $("#theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  /* Mobile menu */
  var menuBtn = $("#menu-toggle"), nav = $("#nav");
  if (menuBtn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  /* Current section in the nav */
  var links = $$(".nav a[href^='#']");
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        var a = byId[en.target.id];
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* Copy email */
  var copyBtn = $("#copy-email");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var text = copyBtn.getAttribute("data-copy"), label = copyBtn.textContent;
      var done = function () {
        copyBtn.textContent = "Copied";
        setTimeout(function () { copyBtn.textContent = label; }, 1800);
      };
      var fallback = function () {
        var r = document.createRange();
        r.selectNodeContents($("#email"));
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
    });
  }

  /* Evidence filter: one of the three strengths, or a city.
     A strength fades everything that is not evidence for it and jumps to Experience.
     A city also marks its roles (.hit), and the map caption and floating bar offer a jump to them. */
  var bar = $("#filter-bar"), barText = $("#filter-text");
  var state = { kind: null, value: null };
  var cityNotes = {
    all: "London, Milan, New York, South Bend and Boston, 2023 to 2026.",
    "London": "<b>London.</b> NEV Partners, an emerging-markets hedge fund, in 2023. ICBC Standard Bank Global Markets in June 2025.",
    "Milan": "<b>Milan.</b> Bocconi since 2024. Minerva Investment Management Society since 2025. Tradeweb's Milan office in summer 2025.",
    "New York": "<b>New York.</b> Tradeweb Markets, CFO Group: Investor Relations, Treasury and SEC Reporting, June to August 2026.",
    "South Bend": "<b>South Bend.</b> Exchange semester at Notre Dame's Mendoza College of Business, autumn 2026.",
    "Boston": "<b>Boston.</b> Student International Business Council travel team: an LBO model and pitch deck on a live investment for Audax Private Equity."
  };
  var plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  function showHits() {
    var hits = $$(".hit");
    if (hits.length) hits[0].scrollIntoView({ block: "center" });
  }
  function applyFilter(kind, value, name) {
    if (state.kind === kind && state.value === value) { kind = null; value = null; }
    state = { kind: kind, value: value };
    $$("[data-set-lens]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(kind === "lens" && b.getAttribute("data-set-lens") === value));
    });
    $$("[data-set-city]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(kind === "city" && b.getAttribute("data-set-city") === value));
    });
    var roleHits = 0;
    $$("[data-lens]").forEach(function (el) {
      var dim = false;
      if (kind === "lens") dim = el.getAttribute("data-lens").split(" ").indexOf(value) === -1;
      if (kind === "city") { var host = el.closest("[data-city]"); dim = !host || host.getAttribute("data-city").indexOf(value) === -1; }
      el.classList.toggle("dim", dim);
    });
    $$(".role").forEach(function (el) {
      var hit = kind === "city" && el.getAttribute("data-city").indexOf(value) !== -1;
      if (hit) roleHits++;
      el.classList.toggle("hit", hit);
      el.classList.toggle("dim", kind === "city" && !hit);
    });
    if (bar) {
      bar.classList.toggle("show", !!kind);
      if (kind === "lens") barText.textContent = "Highlighting: " + name;
      if (kind === "city") barText.textContent = name + ": " + plural(roleHits, "role", "roles") + " marked";
    }
    var detail = $("#map-detail");
    if (detail) {
      detail.innerHTML = kind === "city" ? cityNotes[value] : cityNotes.all;
      if (kind === "city" && roleHits) {
        var jump = document.createElement("button");
        jump.type = "button";
        jump.className = "jump";
        jump.textContent = "See " + (roleHits === 1 ? "the role" : "the " + roleHits + " roles") + " in the timeline ↓";
        jump.addEventListener("click", showHits);
        detail.appendChild(document.createTextNode(" "));
        detail.appendChild(jump);
      }
    }
    var stage = $(".map-stage");
    if (stage) stage.classList.toggle("has-pick", kind === "city");
    var showBtn = $("#filter-show");
    if (showBtn) showBtn.hidden = kind !== "city";
    if (kind === "lens") {
      var first = $("#experience");
      if (first) first.scrollIntoView({ block: "start" });
    }
  }
  $$("[data-set-lens]").forEach(function (b) {
    b.addEventListener("click", function () { applyFilter("lens", b.getAttribute("data-set-lens"), b.getAttribute("data-name")); });
  });
  $$("[data-set-city]").forEach(function (b) {
    b.addEventListener("click", function () { var c = b.getAttribute("data-set-city"); applyFilter("city", c, c); });
  });
  var clear = $("#filter-clear");
  if (clear) clear.addEventListener("click", function () { applyFilter(null, null); });
  var show = $("#filter-show");
  if (show) show.addEventListener("click", showHits);

  /* Equity theses: each row opens a short write-up beneath it. */
  $$(".thesis-row").forEach(function (row) {
    var btn = $(".row-toggle", row), panel = document.getElementById(btn.getAttribute("aria-controls"));
    var toggle = function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      row.classList.toggle("open", open);
      panel.hidden = !open;
    };
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    row.addEventListener("click", toggle);
  });

  /* Term explainers (e.g. UKMT): hover with a mouse, or tap. Esc or a tap elsewhere closes. */
  var terms = $$(".term");
  var closeTerms = function (except) {
    terms.forEach(function (t) {
      if (t === except) return;
      t.setAttribute("aria-expanded", "false");
      t.pinned = false;
      document.getElementById(t.getAttribute("aria-controls")).hidden = true;
    });
  };
  var place = function (pop) {
    pop.style.left = "0px";
    var edge = document.documentElement.clientWidth - 16, r = pop.getBoundingClientRect();
    if (r.right > edge) pop.style.left = (edge - r.right) + "px";
    r = pop.getBoundingClientRect();
    if (r.left < 16) pop.style.left = (parseFloat(pop.style.left) + 16 - r.left) + "px";
  };
  var openTerm = function (t) {
    closeTerms(t);
    var pop = document.getElementById(t.getAttribute("aria-controls"));
    t.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    place(pop);
  };
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  terms.forEach(function (t) {
    var wrap = t.closest(".term-wrap");
    t.addEventListener("click", function (e) {
      e.stopPropagation();
      if (t.pinned) { closeTerms(); return; }
      openTerm(t);
      t.pinned = true;
    });
    if (finePointer) {
      wrap.addEventListener("mouseenter", function () { if (t.getAttribute("aria-expanded") !== "true") openTerm(t); });
      wrap.addEventListener("mouseleave", function () { if (!t.pinned) closeTerms(); });
    }
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".term-wrap")) closeTerms(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeTerms(); });

  /* Count figures up when they scroll into view. The HTML already holds the final values. */
  var counters = $$("[data-count]");
  if (counters.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        co.unobserve(en.target);
        var el = en.target, end = +el.getAttribute("data-count"), dp = +el.getAttribute("data-dp"), t0 = null;
        var frame = function (t) {
          if (!t0) t0 = t;
          var k = Math.min(1, (t - t0) / 900), eased = 1 - Math.pow(1 - k, 3);
          el.textContent = (end * eased).toFixed(dp);
          if (k < 1) requestAnimationFrame(frame); else el.textContent = end.toFixed(dp);
        };
        requestAnimationFrame(frame);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { co.observe(c); });
  }

  /* Pointer-tracking highlight on cards */
  $$(".lens, .project").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* Project page: step through the agent graph */
  var flow = $("#flow");
  if (flow) {
    var caption = $("#flow-caption");
    var paths = {
      pass: [
        ["plan", "<b>Leader plans.</b> It picks four of eleven career lanes, balancing what the candidate wants against what they can get, and prefers lanes not searched recently."],
        ["lanes", "<b>Four searches run in parallel.</b> One focused web search per lane, each returning up to three postings."],
        ["gather", "<b>Code gathers.</b> It removes duplicates, including roles seen in earlier runs, and interleaves the lanes into one queue."],
        ["code", "<b>Code checks first.</b> Still open, posted within 30 days, right role type, start date, graduation year and location. This role passes."],
        ["llm", "<b>Then model checks.</b> Is it entry-level, and a real named vacancy? It fails only on evidence of a problem."],
        ["align", "<b>Alignment scores it.</b> Six rubric dimensions for want; CV match, crowding and edges for get. Code does the arithmetic."],
        ["review", "<b>Leader reviews.</b> It can reject a role that passes every gate, but it cannot accept one that fails a gate. Its feedback steers the next search."],
        ["final", "<b>Finalise.</b> Full-time first, then strong matches, then rank. The run writes a report and a trace of every model call and its cost."]
      ],
      fail: [
        ["plan", "<b>Leader plans.</b> It picks four of eleven career lanes for this run."],
        ["lanes", "<b>Four searches run in parallel.</b> One focused web search per lane."],
        ["gather", "<b>Code gathers.</b> Duplicates are removed and the lanes interleaved into one queue."],
        ["code", "<b>Code checks first.</b> This posting asks for three years of experience. It fails."],
        ["reject", "<b>Rejected in code.</b> No model call is made, so the rejection costs nothing. In the latest live run, 8 of 16 roles ended here."],
        ["gather", "<b>Back to the queue.</b> The loop takes the next candidate and carries on."]
      ]
    };
    var timer = null;
    var nodes = $$("[data-node]", flow);
    var reset = function () {
      clearTimeout(timer);
      nodes.forEach(function (n) { n.classList.remove("active", "done"); });
      flow.classList.remove("playing");
    };
    var play = function (key) {
      reset();
      flow.classList.add("playing");
      var steps = paths[key], i = 0;
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var tick = function () {
        nodes.forEach(function (n) { if (n.classList.contains("active")) { n.classList.remove("active"); n.classList.add("done"); } });
        if (i >= steps.length) { flow.classList.remove("playing"); return; }
        var step = steps[i++];
        $$("[data-node='" + step[0] + "']", flow).forEach(function (n) { n.classList.remove("done"); n.classList.add("active"); });
        caption.innerHTML = step[1];
        timer = setTimeout(tick, reduce ? 2600 : 2200);
      };
      tick();
    };
    $$("[data-play]").forEach(function (b) { b.addEventListener("click", function () { play(b.getAttribute("data-play")); }); });
    var resetBtn = $("#flow-reset");
    if (resetBtn) resetBtn.addEventListener("click", function () {
      reset();
      caption.innerHTML = "Choose a role to follow it through the graph, one step at a time.";
    });
  }
})();
