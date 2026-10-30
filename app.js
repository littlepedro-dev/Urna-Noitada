(() => {
  "use strict";

  const OFFICE = "Prefeito(a)";
  const STORE_KEY = "urnaLabVotes";
  const SOUND_KEY = "urnaLabSound";
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const candidates = [
    { number: "67", name: "Cafe of Duty", party: "PDV — Partido da Viadagem", bg: "#f2a65a", skin: "#8d5a3c", hair: "#1d1512", shirt: "#2d4a6b", style: 0 },
    { number: "44", name: "Kaue 002", party: "MDE — Ministro da Economia", bg: "#6ea8d9", skin: "#e3b48f", hair: "#4a3426", shirt: "#c0463b", style: 1 },
    { number: "45", name: "JBZIN.", party: "PAC — Partido do ADM Comunista", bg: "#c77dba", skin: "#5e3a28", hair: "#1a120e", shirt: "#f2c230", style: 2 },
    { number: "24", name: "Micael ", party: "IDG - Inimigo Da Gameplay Coletiva", bg: "#8fc06b", skin: "#c98f66", hair: "#5a5550", shirt: "#2f6f5e", style: 3 },
    { number: "69", name: "Viadovanni", party: "PRL — Partido do Rocket League", bg: "#f2a65a", skin: "#8d5a3c", hair: "#1d1512", shirt: "#2d4a6b", style: 0 },
    { number: "22", name: "Miguel ", party: "PDR — Partido dos Rodoviários", bg: "#f2a65a", skin: "#8d5a3c", hair: "#1d1512", shirt: "#2d4a6b", style: 0 }
  ];

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const config = window.URNALAB_CONFIG || {};
  const connected = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const db = connected ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  const state = { digits: [], blank: false, locked: false, done: false };
  let runId = 0;
  let doneTimer;
  let toastTimer;
  let lastPhoto = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { /* sem storage */ }


  function portrait(c) {
    const { bg, skin, hair, shirt, style } = c;
    const ink = "#14201f";
    let back = "";
    let front = "";
    let mouth = ink;
    if (style === 0) {
      back = `<path d="M25 58C20 20 40 14 50 14s31 6 25 44l1 40H64V52H36v46H24z" fill="${hair}"/>`;
      front = `<path d="M30 50C32 28 68 28 70 50 62 40 40 40 30 50z" fill="${hair}"/>`;
    } else if (style === 1) {
      front = `<path d="M30 48C28 24 72 24 70 48 64 38 36 38 30 48z" fill="${hair}"/>` +
        `<g fill="none" stroke="${ink}" stroke-width="2"><circle cx="42" cy="53" r="6.5"/><circle cx="58" cy="53" r="6.5"/><path d="M48.5 53h3"/></g>`;
    } else if (style === 2) {
      back = `<g fill="${hair}"><circle cx="50" cy="38" r="26"/><circle cx="30" cy="50" r="12"/><circle cx="70" cy="50" r="12"/><circle cx="38" cy="22" r="12"/><circle cx="62" cy="22" r="12"/></g>`;
    } else {
      mouth = "#f3d7c0";
      front = `<path d="M30 56c0 20 10 28 20 28s20-8 20-28c-4 8-10 10-20 10s-16-2-20-10z" fill="${hair}"/>`;
    }
    return `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMin slice" role="img" aria-label="Retrato ilustrado de ${escapeHtml(c.name)}">` +
      `<rect width="100" height="120" fill="${bg}"/>${back}` +
      `<path d="M8 120c0-26 18-34 42-34s42 8 42 34z" fill="${shirt}"/>` +
      `<rect x="43" y="68" width="14" height="22" fill="${skin}"/>` +
      `<ellipse cx="50" cy="52" rx="20" ry="24" fill="${skin}"/>` +
      `<circle cx="42" cy="52" r="2.2" fill="${ink}"/><circle cx="58" cy="52" r="2.2" fill="${ink}"/>` +
      `<path d="M44 64q6 5 12 0" fill="none" stroke="${mouth}" stroke-width="2" stroke-linecap="round"/>` +
      `${front}</svg>`;
  }

  /* ---------- Som (sintetizado, sem arquivos) ---------- */
  let audioCtx;
  function tone(freq, dur, type = "square", vol = 0.035) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* áudio indisponível */ }
  }
  const sfx = {
    key: () => tone(1400, 0.05),
    blank: () => tone(900, 0.07),
    correct: () => tone(520, 0.09),
    error: () => tone(200, 0.22, "sawtooth", 0.04),
    end: () => tone(1000, 0.9, "square", 0.04)
  };

  function renderSound() {
    $("sound-btn").setAttribute("aria-pressed", String(soundOn));
    $("sound-label").textContent = soundOn ? "Som ligado" : "Som desligado";
  }

  /* ---------- Utilidades de interface ---------- */
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }
  function flash(el) {
    if (!el) return;
    el.classList.add("is-down");
    setTimeout(() => el.classList.remove("is-down"), 120);
  }
  function shake() {
    const el = $("digits");
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }
  function pop(el) {
    if (REDUCED || !el.animate) return;
    el.animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 140, easing: "ease-out" });
  }

  /* ---------- Estado e renderização ---------- */
  function currentCandidate() {
    if (state.digits.length < 2) return null;
    return candidates.find((c) => c.number === state.digits.join("")) || null;
  }
  function phaseOf() {
    if (state.done) return "done";
    if (state.blank) return "blank";
    if (state.digits.length < 2) return "typing";
    return currentCandidate() ? "found" : "wrong";
  }

  const FOOT = {
    typing: 'Digite o número do candidato ou aperte <b class="tag tag-w">BRANCO</b>.',
    review: 'Aperte a tecla:<br><b class="tag tag-g">VERDE</b> para CONFIRMAR este voto<br><b class="tag tag-o">LARANJA</b> para CORRIGIR',
    saving: "Gravando o voto…"
  };

  function render() {
    const phase = phaseOf();
    const cand = currentCandidate();
    const lcd = $("lcd");
    lcd.dataset.phase = phase;

    const [a, b] = state.digits;
    $("d1").textContent = a || "";
    $("d2").textContent = b || "";
    $("d1").classList.toggle("is-next", phase === "typing" && state.digits.length === 0);
    $("d2").classList.toggle("is-next", phase === "typing" && state.digits.length === 1);

    $("lcd-main").hidden = phase === "done";
    $("lcd-end").hidden = phase !== "done";
    $("lcd-info").hidden = phase !== "found";
    $("lcd-photo").hidden = phase !== "found";

    const verdict = $("lcd-verdict");
    verdict.hidden = !(phase === "wrong" || phase === "blank");
    $("verdict-title").textContent = phase === "blank" ? "VOTO EM BRANCO" : "NÚMERO ERRADO";
    $("verdict-text").textContent = phase === "wrong" ? "VOTO NULO" : "";

    if (cand) {
      $("info-name").textContent = cand.name;
      $("info-party").textContent = cand.party;
      if (lastPhoto !== cand.number) {
        $("photo-art").innerHTML = portrait(cand);
        lastPhoto = cand.number;
      }
    } else {
      lastPhoto = null;
    }

    const saving = state.locked && !state.done;
    $("lcd-foot").innerHTML = saving ? FOOT.saving : (phase === "typing" ? FOOT.typing : FOOT.review);
    $("lcd-foot").hidden = phase === "done";
    $("led").classList.toggle("busy", saving);

    const step = phase === "typing" ? 1 : phase === "done" ? 3 : 2;
    document.querySelectorAll("#steps li").forEach((li, i) => {
      li.classList.toggle("is-active", i + 1 === step && phase !== "done");
      li.classList.toggle("is-done", i + 1 < step || phase === "done");
    });

    const sr = { found: cand ? `Candidato ${cand.name}, ${cand.party}.` : "", wrong: "Número errado. Voto nulo.", blank: "Voto em branco.", done: "Voto registrado.", typing: "" }[phase];
    $("sr-status").textContent = sr;
  }

  function resetState() {
    clearTimeout(doneTimer);
    state.digits = [];
    state.blank = false;
    state.locked = false;
    state.done = false;
  }

  /* ---------- Ações da urna ---------- */
  function enterDigit(d) {
    if (state.locked || state.done) return;
    if (state.digits.length >= 2) {
      sfx.error();
      shake();
      toast("O número já tem 2 algarismos. Aperte CORRIGE para recomeçar.");
      return;
    }
    state.blank = false;
    state.digits.push(d);
    sfx.key();
    render();
    pop(state.digits.length === 1 ? $("d1") : $("d2"));
  }

  function setBlank() {
    if (state.locked || state.done) return;
    state.digits = [];
    state.blank = true;
    sfx.blank();
    render();
  }

  function correct() {
    if (state.locked && !state.done) return;
    runId++;
    resetState();
    sfx.correct();
    render();
  }

  async function saveVote(type, candidate) {
    const record = {
      vote_type: type,
      candidate_number: candidate ? candidate.number : null,
      candidate_name: candidate ? candidate.name : null
    };
    if (db) {
      const { error } = await db.from("urna_votes").insert(record);
      if (error) throw error;
      return;
    }
    const votes = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    votes.push({ ...record, created_at: new Date().toISOString() });
    localStorage.setItem(STORE_KEY, JSON.stringify(votes));
  }

  async function confirmVote() {
    if (state.locked || state.done) return;
    if (!state.blank && state.digits.length < 2) {
      sfx.error();
      shake();
      toast("Complete o número com 2 algarismos ou aperte BRANCO.");
      return;
    }
    const cand = currentCandidate();
    const type = state.blank ? "branco" : cand ? "nominal" : "nulo";
    state.locked = true;
    render();
    try {
      await saveVote(type, cand);
      state.done = true;
      sfx.end();
      render();
      doneTimer = setTimeout(() => { resetState(); render(); }, 3400);
    } catch (err) {
      console.error(err);
      state.locked = false;
      render();
      sfx.error();
      toast("Não foi possível gravar. Confira a URL e a chave em config.js e as policies do Supabase.");
    }
  }

  async function typeNumber(number) {
    if (state.locked && !state.done) return;
    const id = ++runId;
    resetState();
    render();
    if (window.innerWidth <= 980) {
      $("urna").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
    }
    for (const d of number) {
      await sleep(170);
      if (id !== runId) return;
      flash(document.querySelector(`[data-digit="${d}"]`));
      enterDigit(d);
    }
  }

  /* ---------- Resultados ---------- */
  async function getVotes() {
    if (db) {
      const { data, error } = await db.from("urna_votes").select("vote_type,candidate_name,candidate_number");
      if (error) throw error;
      return data || [];
    }
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  }

  function resultRow(label, num, count, total, color) {
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `<div class="res-row" style="--c:${color}">
      <div class="res-label">${num ? `<span class="res-num">${escapeHtml(num)}</span>` : ""}<span>${escapeHtml(label)}</span></div>
      <div class="res-count"><strong>${count}</strong><small>${pct}%</small></div>
      <div class="res-bar"><i data-w="${pct}"></i></div>
    </div>`;
  }

  async function showResults() {
    const dlg = $("results");
    if (!dlg.open) dlg.showModal();
    $("results-source").textContent = connected ? "Votos gravados no banco Supabase." : "Votos gravados neste navegador.";
    $("clear-results").hidden = connected;
    $("results-total").textContent = "Carregando…";
    $("results-list").innerHTML = "";
    try {
      const votes = await getVotes();
      const total = votes.length;
      $("results-total").textContent = total === 0 ? "Nenhum voto registrado ainda." : `${total} ${total === 1 ? "voto registrado" : "votos registrados"}`;
      if (total === 0) {
        $("results-list").innerHTML = '<p class="res-empty">Vote na urna e volte aqui para ver a contagem.</p>';
        return;
      }
      const rows = candidates.map((c) =>
        resultRow(c.name, c.number, votes.filter((v) => v.vote_type === "nominal" && v.candidate_number === c.number).length, total, c.bg)
      );
      rows.push('<div class="res-sep"></div>');
      rows.push(resultRow("Em branco", "", votes.filter((v) => v.vote_type === "branco").length, total, "#8a948f"));
      rows.push(resultRow("Nulos", "", votes.filter((v) => v.vote_type === "nulo").length, total, "#8a948f"));
      $("results-list").innerHTML = rows.join("");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelectorAll("#results-list .res-bar i").forEach((el) => { el.style.width = el.dataset.w + "%"; });
      }));
    } catch (err) {
      console.error(err);
      $("results-total").textContent = "Não foi possível carregar os votos. Confira a configuração do Supabase.";
    }
  }

  let clearArmed = false;
  function clearLocal() {
    const btn = $("clear-results");
    if (!clearArmed) {
      clearArmed = true;
      btn.textContent = "Toque de novo para apagar";
      setTimeout(() => { clearArmed = false; btn.textContent = "Apagar votos de teste"; }, 3000);
      return;
    }
    clearArmed = false;
    btn.textContent = "Apagar votos de teste";
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignora */ }
    showResults();
  }

  /* ---------- Montagem ---------- */
  $("storage-status").textContent = connected ? "Votos salvos no Supabase" : "Votos salvos neste navegador";
  $("lcd-office").textContent = OFFICE;
  $("photo-caption").textContent = OFFICE;

  $("roster-list").innerHTML = candidates.map((c) => `
    <li><button class="cand" type="button" data-number="${c.number}" aria-label="Digitar número ${c.number}, ${escapeHtml(c.name)}">
      <span class="thumb">${portrait(c)}</span>
      <span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.party)}</small></span>
      <span class="num">${c.number}</span>
    </button></li>`).join("");

  document.querySelectorAll("[data-digit]").forEach((btn) => btn.addEventListener("click", () => enterDigit(btn.dataset.digit)));
  document.querySelectorAll(".cand").forEach((btn) => btn.addEventListener("click", () => typeNumber(btn.dataset.number)));
  $("blank-btn").addEventListener("click", setBlank);
  $("correct-btn").addEventListener("click", correct);
  $("confirm-btn").addEventListener("click", confirmVote);

  $("sound-btn").addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignora */ }
    renderSound();
    sfx.key();
  });
  $("results-btn").addEventListener("click", showResults);
  $("refresh-results").addEventListener("click", showResults);
  $("clear-results").addEventListener("click", clearLocal);
  $("close-results").addEventListener("click", () => $("results").close());
  $("results").addEventListener("click", (e) => { if (e.target === $("results")) $("results").close(); });

  document.addEventListener("keydown", (e) => {
    if ($("results").open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^\d$/.test(e.key)) {
      flash(document.querySelector(`[data-digit="${e.key}"]`));
      enterDigit(e.key);
    } else if (e.key === "Enter") {
      if (e.target.closest && e.target.closest("button")) return;
      flash($("confirm-btn"));
      confirmVote();
    } else if (e.key === "Escape" || e.key === "Backspace") {
      flash($("correct-btn"));
      correct();
    } else if (e.key === "b" || e.key === "B") {
      flash($("blank-btn"));
      setBlank();
    }
  });

  renderSound();
  render();
})();
