
/* ===== TIMERS ===== */
let rulingTimerInterval = null, rulingTimerKey = null;
let draftTimerInterval = null, draftTimerKey = null;
let reportCountdownInterval = null, reportCountdownKey = null;

function startRulingTimer(seconds, key, onExpire) {
  if (rulingTimerKey === key) return;
  rulingTimerKey = key;
  if (rulingTimerInterval) clearInterval(rulingTimerInterval);
  const el = $("#rulingTimer");
  let t = seconds; el.textContent = t; el.className = "timer";
  rulingTimerInterval = setInterval(() => {
    t--; el.textContent = Math.max(0, t);
    if (t <= 30) el.className = "timer warn";
    if (t <= 10) el.className = "timer danger";
    if (t <= 0) { clearInterval(rulingTimerInterval); rulingTimerInterval = null; if (onExpire) onExpire(); }
  }, 1000);
}

function startDraftTimer(seconds, key, onExpire) {
  if (draftTimerKey === key) return;
  draftTimerKey = key;
  if (draftTimerInterval) clearInterval(draftTimerInterval);
  const el = $("#draftTimer");
  let t = seconds; el.textContent = t; el.className = "timer";
  draftTimerInterval = setInterval(() => {
    t--; el.textContent = Math.max(0, t);
    if (t <= 10) el.className = "timer warn";
    if (t <= 5) el.className = "timer danger";
    if (t <= 0) { clearInterval(draftTimerInterval); draftTimerInterval = null; if (onExpire) onExpire(); }
  }, 1000);
}

function startReportCountdown() {
  const el = $("#resultCountdown");
  if (reportCountdownInterval) clearInterval(reportCountdownInterval);
  const key = "report";
  reportCountdownKey = key;
  reportCountdownInterval = setInterval(() => {
    if (!G.state || G.state.phase !== "result" || !G.state.reportDeadline) {
      clearInterval(reportCountdownInterval); reportCountdownInterval = null; return;
    }
    const left = Math.max(0, Math.round((G.state.reportDeadline - now()) / 1000));
    el.style.display = "block";
    el.textContent = "⏱ " + left + "s remaining for both reports. If opponent doesn't respond, your report stands.";
    if (left <= 0) {
      clearInterval(reportCountdownInterval); reportCountdownInterval = null;
      if (G.state.mode === "offline") {
        const a = offlineActor();
        const res = applyAction(G.state, { type:"AUTO_RESOLVE_REPORT" }, a);
        if (res.ok) render();
      } else if (G.isHost) {
        const a = G.mySeat;
        const res = applyAction(G.state, { type:"AUTO_RESOLVE_REPORT" }, a);
        if (res.ok) { broadcastState(); render(); }
      }
    }
  }, 1000);
}

function stopTimers() {
  if (rulingTimerInterval) { clearInterval(rulingTimerInterval); rulingTimerInterval = null; }
  rulingTimerKey = null;
  if (draftTimerInterval) { clearInterval(draftTimerInterval); draftTimerInterval = null; }
  draftTimerKey = null;
  if (reportCountdownInterval) { clearInterval(reportCountdownInterval); reportCountdownInterval = null; }
  reportCountdownKey = null;
}

/* ===== RENDERING ===== */
function hideAll() { $$("main > section").forEach(e => e.hidden = true); }
function show(id) { $("#" + id).hidden = false; }
function refreshView() {
  if (!G.state) { G.view = null; return; }
  if (G.state.mode === "offline") { G.view = G.state; return; }
  G.view = redactFor(G.state, G.mySeat);
}
function render() {
  const s0 = G.state;
  if (!s0) { stopTimers(); renderLanding(); return; }
  refreshView();
  const s = G.view;
  $("#phaseBadge").textContent = s.phase.charAt(0).toUpperCase() + s.phase.slice(1);
  if (s.phase !== "rulings" && s.phase !== "draft" && s.phase !== "result") stopTimers();
  hideAll();
  switch (s.phase) {
    case "landing": renderLanding(); break;
    case "waiting": renderWaiting(); break;
    case "coin": renderCoin(); break;
    case "config": renderConfig(); break;
    case "rulings": renderRulings(); break;
    case "reveal": renderReveal(); break;
    case "draft": renderDraft(); break;
    case "handoff": renderHandoff(); break;
    case "result": renderResult(); break;
    case "final": renderFinal(); break;
    default: renderLanding();
  }
}
function renderLanding() {
  show("s-landing");
  checkHttpsForOnline();
  const p = Player.load();
  const r = getRank(p.online.mmr);
  $("#landingStats").innerHTML = `
    <div class="grid2">
      <div class="loadout">
        <h3 style="margin-top:0">Offline (casual)</h3>
        <div>W:${p.offline.wins} · L:${p.offline.losses} · Tech/Void:${p.offline.techVoid}</div>
        <div>Matches: ${p.offline.matches}</div>
        <div class="muted" style="font-size:12px;margin-top:6px">Does not affect ranked MMR.</div>
      </div>
      <div class="loadout">
        <h3 style="margin-top:0">Online — Provisional MMR <span class="pill">Unverified</span></h3>
        <div><b>${esc(r.icon)} ${esc(r.name)}</b> — ${p.online.mmr} MMR (peak ${p.online.peakMmr})</div>
        <div>W:${p.online.wins} · L:${p.online.losses} · Tech/Void:${p.online.techVoid} · Streak ${p.online.streak}</div>
        <div>Matches: ${p.online.matches} · Placements left: ${p.online.placementsLeft}</div>
        <div class="muted" style="font-size:12px;margin-top:6px">Honor-system reports. Not official ranked MMR.</div>
      </div>
    </div>`;
}
function renderWaiting() {
  show("s-waiting");
  $("#roomCodeDisplay").textContent = G.roomCode || "------";
}
function renderCoin() {
  show("s-coin");
  const s = G.view;
  const myCommit = s.coin.commits[G.mySeat];
  if (s.coin.winner) {
    $("#coinResult").textContent = `Winner: ${s.players[s.coin.winner].name}`;
    const canChoose = s.coin.winner === G.mySeat || s.mode === "offline";
    if (canChoose) {
      $("#btnFlip").hidden = true;
      $("#choiceBox").hidden = false;
      $("#winnerName").textContent = s.players[s.coin.winner].name;
    } else {
      $("#btnFlip").hidden = true;
      $("#choiceBox").hidden = true;
    }
  } else {
    $("#choiceBox").hidden = true;
    if (s.mode === "offline") {
      const actor = offlineActor();
      $("#coinResult").textContent = `${s.players[actor].name}, click to flip`;
      $("#btnFlip").hidden = false;
    } else {
      if (myCommit) { $("#coinResult").textContent = "Waiting…"; $("#btnFlip").hidden = true; }
      else { $("#coinResult").textContent = "Click to flip"; $("#btnFlip").hidden = false; }
    }
  }
}
function renderConfig() {
  show("s-config");
  const s = G.view;
  $("#cfgMode").textContent = s.mode === "offline" ? "Offline" : "Online";
  $("#cfgDraftType").textContent = s.draftType === "Close" ? "Close — 2 picks/turn × 2 turns" : "Open — 1 pick/turn × 4 turns";
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  $("#btnConfirmConfig").disabled = s.players[actor].ready;
  $("#configConfirmStatus").textContent = `${s.players.P1.name}: ${s.players.P1.ready ? "✅" : "⏳"} · ${s.players.P2.name}: ${s.players.P2.ready ? "✅" : "⏳"}`;
}
function renderRulings() {
  show("s-rulings");
  const s = G.view;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  const list = $("#rulingsList");
  list.innerHTML = "";
  const myCost = me.rulings.reduce((a,r) => a + RULINGS[r].cost, 0);
  const pointsLeft = CAPS.points - myCost;
  const slotsLeft = CAPS.slots - me.rulings.length;
  let availableCount = 0;
  ["Easy","Moderate","Hard","Insane"].forEach(tier => {
    const h = document.createElement("div");
    h.style.cssText = "margin:12px 0 4px;font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase";
    h.textContent = `${tier} tier`;
    list.appendChild(h);
    RULING_ORDER.filter(r => RULINGS[r].tier === tier).forEach(r => {
      const info = RULINGS[r];
      const affordable = info.cost <= pointsLeft && slotsLeft > 0 && !me.rulings.includes(r);
      if (affordable) availableCount++;
      const div = document.createElement("div");
      div.className = "ruling " + tier.toLowerCase() + (me.rulings.includes(r) ? " selected" : "");
      div.innerHTML = `<b>${esc(r)} <span class="pill" style="float:right">${info.cost} pt</span></b><small>${esc(info.desc)}</small>`;
      div.onclick = () => {
        if (me.locked) { toast("Portfolio locked", "warn"); return; }
        if (me.rulings.includes(r)) { toast("Already in your portfolio", "warn"); return; }
        if (slotsLeft <= 0) { toast("No slots left (3/3 used)", "warn"); return; }
        if (info.cost > pointsLeft) { toast(`Not enough points — need ${info.cost}, have ${pointsLeft}`, "warn"); return; }
        sendAction({ type:"ADD_RULING", ruling:r });
      };
      list.appendChild(div);
    });
  });
  $("#rulingCount").textContent = availableCount;
  $("#selList").textContent = me.rulings.map(r => `${r}(${RULINGS[r].cost})`).join(", ") || "None";
  $("#spentList").textContent = me.spent.length ? me.spent.map(r => `${r}(${RULINGS[r].cost})`).join(", ") : "None";
  $("#selCost").textContent = myCost;
  $("#selSlots").textContent = me.rulings.length;
  $("#btnLock").disabled = me.locked;
  const other = actor === "P1" ? s.players.P2 : s.players.P1;
  $("#rulingLockStatus").textContent = me.locked ? `Locked in. Waiting for ${other.name}…` : `${me.name}'s portfolio — build it, then lock.`;
  startRulingTimer(90, `r:${s.matchId}`, () => {
    if (!me.locked) sendAction({ type:"LOCK_RULING" });
  });
}
function renderReveal() {
  show("s-reveal");
  const s = G.view;
  $("#revP1Name").textContent = s.players.P1.name;
  $("#revP2Name").textContent = s.players.P2.name;
  $("#revP1Rulings").innerHTML = s.players.P1.rulings.map(r => `<span class="tower" title="${esc(RULINGS[r].desc)}">${esc(r)} (${RULINGS[r].cost})</span>`).join("") || "<em>None</em>";
  $("#revP2Rulings").innerHTML = s.players.P2.rulings.map(r => `<span class="tower" title="${esc(RULINGS[r].desc)}">${esc(r)} (${RULINGS[r].cost})</span>`).join("") || "<em>None</em>";
}
function towerPill(t, isHidden, isProt, isMarked) {
  const tier = towerTier(isHidden ? "Scout" : t.name);
  const cls = `tower ${isProt?"protected ":""}${isHidden?"hidden ":""}${isMarked?"marked ":""}pill-${tier.toLowerCase()}`;
  const label = isHidden ? "❓ Hidden" : esc(t.name);
  return `<span class="${cls}">${label}${isProt ? " 🛡" : ""}${isMarked ? " 🎯" : ""}</span>`;
}
function renderDraft() {
  show("s-draft");
  const s = G.view;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  const oppSeat = actor === "P1" ? "P2" : "P1";
  const opp = s.players[oppSeat];
  const myTurn = s.turn === actor;
  const forcedNote = (s.forcedPick && s.forcedPick.forSeat === actor) ? ` · ⚠ Forced: ${esc(s.forcedPick.tower)}` : "";
  const who = s.mode === "offline" ? (myTurn ? `${me.name}'s turn` : `${s.players[s.turn].name}'s turn`) : (myTurn ? "Your turn" : `${s.players[s.turn].name}'s turn`);
  const thinking = (!myTurn && s.mode === "online") ? '<span class="thinking"></span>' : "";
  $("#turnLabel").innerHTML = `Round ${s.round} · ${who}${forcedNote}${thinking}`;
  $("#priorityBadge").textContent = s.firstPicker === actor ? "First Pick" : "Second Pick";
  $("#scoreP1Name").textContent = s.players.P1.name;
  $("#scoreP2Name").textContent = s.players.P2.name;
  $("#scoreP1").textContent = draftedCount(s.players.P1);
  $("#scoreP2").textContent = draftedCount(s.players.P2);

  const banners = [];
  if (me.lockedRulingsUntil >= s.round) banners.push("🔒 You are Silenced — cannot use rulings this turn");
  if (me.jinxed) banners.push("💀 You are Jinxed — using a ruling will cost you another");
  if (me.frozenUntil >= s.round) banners.push(`🧊 ${me.frozenType} is Frozen this round`);
  $("#statusBanners").innerHTML = banners.map(b => `<div class="statusbanner">${b}</div>`).join("");

  const grid = $("#towerGrid");
  grid.innerHTML = "";
  TOWERS.forEach(t => {
    const btn = document.createElement("button");
    const isBanned = s.poolBanned.includes(t);
    const isTaken = !s.pool.includes(t);
    const tier = towerTier(t);
    btn.className = `${tier.toLowerCase()}tier` + (isTaken ? " picked" : "") + (isBanned ? " banned" : "");
    btn.textContent = `${t} [${tier}]`;
    btn.disabled = isBanned || isTaken || !myTurn || draftedCount(me) >= CAPS.towers;
    btn.onclick = () => sendAction({ type:"PICK", tower:t });
    grid.appendChild(btn);
  });

  const lw = $("#loadoutWrap");
  lw.innerHTML = "";
  ["P1","P2"].forEach(seat => {
    const p = s.players[seat];
    const isMe = seat === actor;
    const pills = p.towers.map(t => {
      const isHidden = !t.name;
      const isProt = isProtected(p, t.id);
      const isMarked = p.markedId === t.id;
      return towerPill(t, isHidden, isProt, isMarked);
    }).join("");
    const bonus = p.bonusPicks ? ` <span class="pill">+${p.bonusPicks} extra</span>` : "";
    const need = p.pendingReplacement > 0 ? ` <span class="needs">⚠ re-pick ${p.pendingReplacement}</span>` : "";
    lw.innerHTML += `<div class="loadout"><b>${esc(p.name)}${isMe ? " (you)" : ""}</b>${bonus}${need}<div>${pills || "<em>Empty</em>"}</div></div>`;
  });

  const rb = $("#rulingButtons");
  rb.innerHTML = "";
  if (!me.rulings.length) rb.innerHTML = `<div class="muted" style="font-size:13px">No unused rulings.</div>`;
  me.rulings.forEach(r => {
    const b = document.createElement("button");
    b.className = "secondary tiny";
    b.textContent = `${r} (${RULINGS[r].cost})`;
    const frozen = me.frozenUntil >= s.round && me.frozenType === r;
    const locked = me.lockedRulingsUntil >= s.round;
    b.disabled = !myTurn || frozen || locked;
    if (frozen) b.textContent += " 🧊";
    if (locked) b.textContent += " 🔒";
    b.onclick = () => promptUseRuling(r);
    rb.appendChild(b);
  });

  const rem = $("#removedWrap");
  rem.innerHTML = `<div class="removeline">
    <div><b>${esc(s.players.P1.name)} lost:</b> ${s.removed.P1.map(esc).join(", ") || "—"}</div>
    <div><b>${esc(s.players.P2.name)} lost:</b> ${s.removed.P2.map(esc).join(", ") || "—"}</div>
    ${s.poolBanned.length ? `<div><b>Banned:</b> ${s.poolBanned.map(esc).join(", ")}</div>` : ""}
  </div>`;

  const logEl = $("#log");
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
  logEl.innerHTML = s.log.slice(-40).map(l => `<div>${new Date(l.t).toLocaleTimeString()} — ${esc(l.msg)}</div>`).join("");
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;

  const chatWrap = $("#chatWrap");
  if (s.mode === "online") {
    chatWrap.hidden = false;
    const cl = $("#chatLog");
    const arr = s.chat || [];
    const chatBottom = cl.scrollHeight - cl.scrollTop - cl.clientHeight < 40;
    cl.innerHTML = arr.slice(-30).map(c => {
      const mine = c.sender === actor;
      return `<div><b style="color:${mine ? "var(--blue)" : "var(--muted)"}">${esc(c.name)}:</b> ${esc(c.msg)}</div>`;
    }).join("") || `<div class="muted">No messages yet.</div>`;
    if (chatBottom) cl.scrollTop = cl.scrollHeight;
    const er = $("#emoteRow");
    if (!er.dataset.built) {
      er.innerHTML = EMOTES.map(e => `<button data-emote="${e}">${e}</button>`).join("");
      er.querySelectorAll("button").forEach(b => {
        b.onclick = () => sendChat(b.dataset.emote);
      });
      er.dataset.built = "1";
    }
  } else {
    chatWrap.hidden = true;
  }

  const turnP = s.players[s.turn];
  startDraftTimer(turnP.timerHalved ? 15 : 30, `d:${s.matchId}:${s.round}:${s.turn}:${s.picksThisTurn}`, () => {
    if (s.mode === "offline") {
      const a = offlineActor();
      const res = applyAction(G.state, { type:"AUTO_PASS_TURN" }, a);
      if (res.ok) render();
    } else if (G.isHost) {
      const a = state.players[s.turn] && s.turn === G.mySeat ? G.mySeat : (s.turn === "P1" ? "P1" : "P2");
      const res = applyAction(G.state, { type:"AUTO_PASS_TURN" }, a);
      if (res.ok) { broadcastState(); render(); }
    } else if (s.turn === G.mySeat) {
      sendAction({ type:"AUTO_PASS_TURN" });
    }
  });
}

function promptUseRuling(r) {
  const s = G.view;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  const oppSeat = actor === "P1" ? "P2" : "P1";
  const opp = s.players[oppSeat];
  const opts = [];
  let promptR = r;
  if (r === "Graft" || r === "Echo") {
    const lr = r === "Graft" ? s.lastRuling : (s.lastRuling && s.lastRuling.by === actor ? s.lastRuling : null);
    if (!lr) { toast("No ruling to copy", "warn"); return; }
    if (["Graft","Veto"].includes(lr.ruling)) { toast("Cannot copy that", "warn"); return; }
    if (!RULINGS[lr.ruling]) { toast("Cannot copy that", "warn"); return; }
    if (r === "Graft" && RULINGS[lr.ruling].cost > RULINGS.Graft.cost) { toast("Cost too high", "warn"); return; }
    promptR = lr.ruling;
  }
  const sendR = extra => sendAction(Object.assign({ type:"USE_RULING", ruling:r }, extra || {}));
  const addOpt = (label, extra) => opts.push({ label, onClick: () => sendR(extra) });

  if (["Change","Hide","Cloak","Anchor","Secure","Fracture","Martyr"].includes(promptR)) {
    me.towers.forEach(t => {
      if (["Change","Martyr"].includes(promptR) && isFarm(t)) return;
      if (["Anchor","Secure","Hide","Cloak","Fracture"].includes(promptR) && isFarm(t)) return;
      const extra = me.hidden.includes(t.id) ? " (hidden)" : "";
      addOpt(`${t.name}${extra}`, { target:t.id });
    });
  } else if (promptR === "Shift") {
    const mine = me.towers.filter(t => !isFarm(t) && towerTier(t.name) !== "S");
    if (!mine.length) { toast("No shiftable tower", "warn"); return; }
    modal("Shift — choose your tower", "<p>Pick a non-S tower.</p>",
      mine.map(t => ({ label:`${t.name} [${towerTier(t.name)}]`, close:true, onClick:() => {
        const tier = towerTier(t.name);
        const poolSame = s.pool.filter(x => towerTier(x) === tier);
        if (!poolSame.length) { toast("No same-tier in pool", "warn"); return; }
        modal(`Shift → pick a ${tier}`, "<p>Choose replacement.</p>",
          poolSame.map(w => ({ label:w, close:true, onClick:() => sendR({ target:t.id, want:w }) })));
      }})));
    return;
  } else if (promptR === "Duplicate") {
    const mine = me.towers.filter(t => !isFarm(t) && towerTier(t.name) !== "S" && s.pool.includes(t.name));
    if (!mine.length) { toast("No duplicable tower", "warn"); return; }
    mine.forEach(t => addOpt(`${t.name}`, { target:t.id }));
  } else if (promptR === "Revive") {
    if (!s.poolBanned.length) { toast("No banned towers", "warn"); return; }
    s.poolBanned.forEach(t => addOpt(t, { target:t }));
  } else if (promptR === "Peek") {
    opp.towers.forEach(t => {
      if (!opp.hidden.includes(t.id)) return;
      addOpt(`${t.name || "?"} (hidden)`, { target:t.id });
    });
    if (!opts.length) { toast("Opponent has no hidden towers", "warn"); return; }
  } else if (["Inspect","Haven","Amnesty","Clarity","Ruin","Purge","Silence","Jinx","Ward","Riposte","Turn","Pass","Delay","Rebel"].includes(promptR)) {
    addOpt("Use", {});
  } else if (promptR === "Extort") {
    if (!opp.rulings.length) { toast("Opponent has no rulings", "warn"); return; }
    opp.rulings.forEach(rr => addOpt(rr, { target:rr }));
  } else if (promptR === "Dictate" || promptR === "Force") {
    s.pool.forEach(t => addOpt(t, { target:t }));
  } else if (promptR === "Plunder") {
    const mine = me.towers.filter(t => !isFarm(t) && towerTier(t.name) !== "S");
    const theirs = opp.towers.filter(o => !isFarm(o) && !isProtected(opp, o.id));
    if (!mine.length) { toast("No tower to plant", "warn"); return; }
    if (!theirs.length) { toast("No stealable tower", "warn"); return; }
    modal("Plunder — steal", "<p>Pick an unprotected opponent tower.</p>",
      theirs.map(o => ({ label:o.name || "(hidden)", close:true, onClick:() => {
        modal("Plunder — plant", "<p>Pick a non-S tower of yours to give them.</p>",
          mine.map(m => ({ label:m.name, close:true, onClick:() => sendR({ stealId:o.id, plantId:m.id }) })));
      }})));
    return;
  } else if (promptR === "Ascend") {
    const mine = me.towers.filter(t => !isFarm(t) && towerTier(t.name) !== "S");
    if (!mine.length) { toast("No non-S tower", "warn"); return; }
    modal("Ascend — choose tower", "<p>Pick the tower to transform.</p>",
      mine.map(t => ({ label:`${t.name} [${towerTier(t.name)}]`, close:true, onClick:() => {
        const poolS = s.pool.filter(x => towerTier(x) === "S");
        if (!poolS.length) { toast("No S-tier in pool", "warn"); return; }
        modal("Ascend → choose S-tier", "<p>Pick the S-tier result.</p>",
          poolS.map(w => ({ label:w, close:true, onClick:() => sendR({ target:t.id, want:w }) })));
      }})));
    return;
  } else if (promptR === "Bounty") {
    if (me.spent.length && me.rulings.length < CAPS.slots) addOpt("Refund spent ruling", { target:"refund" });
    opp.towers.forEach(t => {
      if (!opp.hidden.includes(t.id)) return;
      addOpt(`${t.name || "?"} (hidden)`, { target:t.id });
    });
  } else if (promptR === "Probe") {
    opp.towers.forEach(t => {
      if (!opp.hidden.includes(t.id)) return;
      addOpt(`${t.name || "?"} (hidden)`, { target:t.id });
    });
  } else if (["Mark","Evict","Steal"].includes(promptR)) {
    opp.towers.forEach(t => {
      if (isFarm(t)) return;
      addOpt(t.name || "(hidden)", { target:t.id });
    });
  } else if (promptR === "Ban") {
    s.pool.forEach(t => addOpt(t, { target:t }));
  } else if (promptR === "Freeze") {
    RULING_ORDER.forEach(t => addOpt(t, { target:t }));
  } else if (promptR === "Snatch") {
    if (!opp.rulings.length) { toast("Opponent has no rulings", "warn"); return; }
    opp.rulings.forEach(rr => addOpt(rr, { target:rr }));
  } else if (promptR === "Trade") {
    const mine = me.towers.filter(t => !isFarm(t) && !me.hidden.includes(t.id) && !isProtected(me, t.id));
    if (!mine.length) { toast("No tradable tower", "warn"); return; }
    modal("Trade — your tower", "<p>Pick one of your towers.</p>",
      mine.map(t => ({ label:t.name, close:true, onClick:() => {
        const theirs = opp.towers.filter(o => !isFarm(o) && !opp.hidden.includes(o.id) && !isProtected(opp, o.id));
        if (!theirs.length) { toast("Opponent has no tradable", "warn"); return; }
        modal("Trade — their tower", "<p>Pick their tower.</p>",
          theirs.map(o => ({ label:o.name || "(hidden)", close:true, onClick:() => sendR({ myId:t.id, oppId:o.id }) })));
      }})));
    return;
  } else if (promptR === "Fuse") {
    const mine = me.towers.filter(t => towerTier(t.name) !== "S" && !isFarm(t));
    if (mine.length < 2) { toast("Need 2 non-S towers", "warn"); return; }
    modal("Fuse — first tower", "<p>Pick the first non-S tower.</p>",
      mine.map(a => ({ label:a.name, close:true, onClick:() => {
        modal("Fuse — second tower", "<p>Pick a different non-S tower.</p>",
          mine.filter(b => b.id !== a.id).map(b => ({ label:b.name, close:true, onClick:() => {
            const poolS = s.pool.filter(x => towerTier(x) === "S");
            if (!poolS.length) { toast("No S-tier in pool", "warn"); return; }
            modal("Fuse — S-tier result", "<p>Pick the S-tier.</p>",
              poolS.map(sT => ({ label:sT, close:true, onClick:() => sendR({ i1:a.id, i2:b.id, want:sT }) })));
          }})));
      }})));
    return;
  } else if (promptR === "Split") {
    const sTowers = me.towers.filter(t => towerTier(t.name) === "S");
    if (!sTowers.length) { toast("No S-tier to split", "warn"); return; }
    modal("Split — S-tier to split", "<p>Pick one of your S-tier towers.</p>",
      sTowers.map(a => ({ label:a.name, close:true, onClick:() => {
        const poolABC = s.pool.filter(x => towerTier(x) !== "S");
        if (poolABC.length < 2) { toast("Not enough A/B/C in pool", "warn"); return; }
        modal("Split — first result", "<p>Pick first A/B/C.</p>",
          poolABC.map(p1 => ({ label:p1, close:true, onClick:() => {
            modal("Split — second result", "<p>Pick a different A/B/C.</p>",
              poolABC.filter(p2 => p2 !== p1).map(p2 => ({ label:p2, close:true, onClick:() => sendR({ target:a.id, pick1:p1, pick2:p2 }) })));
          }})));
      }})));
    return;
  } else { addOpt("Use", {}); }

  if (!opts.length) { toast("No legal targets", "warn"); return; }
  const title = promptR === r ? `Use ${r}` : `${r} → ${promptR}`;
  const desc = promptR === r ? RULINGS[r].desc : `${r} copies <b>${esc(promptR)}</b>: ${esc(RULINGS[promptR].desc)}`;
  modal(title, `<p>${desc}</p>`, opts);
}

function renderHandoff() {
  show("s-handoff");
  const s = G.view;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  const opp = s.players[actor === "P1" ? "P2" : "P1"];
  $("#handoffYour").innerHTML = towerNames(me).map(t => `<span class="tower">${esc(t)}</span>`).join("");
  $("#handoffOpp").innerHTML = towerNames(opp).map(t => `<span class="tower">${esc(t)}</span>`).join("");
  $("#handoffModeNote").textContent = s.mode === "online" ? "Online (Unverified): honor-system reports. Does not affect official ranked MMR." : "Offline (Casual): does not affect ranked MMR.";
  $("#btnHandoffReady").disabled = me.ready;
  $("#handoffStatus").textContent = `${s.players.P1.name}: ${s.players.P1.ready ? "✅" : "⏳"} · ${s.players.P2.name}: ${s.players.P2.ready ? "✅" : "⏳"}`;
}
function renderResult() {
  show("s-result");
  const s = G.view;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  const opp = s.players[actor === "P1" ? "P2" : "P1"];
  $("#resultModeNote").textContent = s.mode === "online" ? "Online (Unverified): honor-system reports. Does not affect official ranked MMR." : "Offline (Casual): does not affect ranked MMR.";
  $("#resultYour").textContent = towerNames(me).join(", ");
  $("#resultOpp").textContent = towerNames(opp).join(", ");
  $("#resultScore").textContent = `${draftedCount(s.players.P1)} - ${draftedCount(s.players.P2)} (informational)`;
  $("#resultStatus").textContent = `${s.players.P1.name}: ${s.players.P1.result || "…"} · ${s.players.P2.name}: ${s.players.P2.result || "…"}`;
  $$("#s-result button").forEach(b => b.disabled = !!me.result);
  if (!me.result && s.reportDeadline) startReportCountdown();
}
function renderFinal() {
  show("s-final");
  const s = G.view;
  const outcome = s.outcome || { type:"void" };
  const box = $("#winnerBox");
  const mmrBox = $("#mmrDelta");
  const mySeat = G.mySeat;
  let myResult;
  if (outcome.type === "win") myResult = outcome.winner === mySeat ? "win" : "loss";
  else if (outcome.type === "technical") myResult = "tech";
  else myResult = "void";
  if (!lastRecordedMatch || lastRecordedMatch.matchId !== s.matchId) {
    lastRecordedMatch = { matchId: s.matchId, upd: Player.record(s.mode, myResult, 1000) };
  }
  const upd = lastRecordedMatch.upd;
  if (outcome.type === "win") {
    const winner = s.players[outcome.winner];
    const iWon = outcome.winner === mySeat;
    box.innerHTML = `<div class="${iWon ? "win" : "loss"}">${iWon ? "🏆 Victory" : "💀 Defeat"} — ${esc(winner.name)} wins</div>`;
    if (s.mode === "online") {
      mmrBox.innerHTML = `<div class="loadout"><div>${myResult === "win" ? "Win" : "Loss"} — <b>Provisional MMR</b> ${upd.before} → ${upd.after} (${upd.delta >= 0 ? "+" : ""}${upd.delta})${upd.promoted ? " · Up to " + esc(upd.afterTier) : ""}${upd.demoted ? " · Down to " + esc(upd.afterTier) : ""}</div></div>`;
    } else {
      mmrBox.innerHTML = `<div class="loadout muted" style="font-size:13px">Casual result recorded. Offline matches never affect ranked MMR.</div>`;
    }
  } else if (outcome.type === "technical") {
    box.innerHTML = `<div class="muted">Technical — no MMR change.</div>`;
    mmrBox.innerHTML = "";
  } else {
    box.innerHTML = `<div class="muted">Match voided${outcome.reason ? " — " + esc(outcome.reason) : ""}.</div>`;
    mmrBox.innerHTML = "";
  }
  $("#finalLog").innerHTML = s.log.map(l => `<div>${new Date(l.t).toLocaleTimeString()} — ${esc(l.msg)}</div>`).join("");
}

/* ===== DISPATCH ===== */
function offlineActor() {
  const s = G.state;
  if (!s) return "P1";
  switch (s.phase) {
    case "coin":
      if (!s.coin.commits.P1) return "P1";
      if (!s.coin.commits.P2) return "P2";
      if (s.coin.winner && !s.firstPicker) return s.coin.winner;
      return "P1";
    case "config":
      if (!s.players.P1.ready) return "P1";
      if (!s.players.P2.ready) return "P2";
      return "P1";
    case "rulings":
      if (!s.players.P1.locked) return "P1";
      if (!s.players.P2.locked) return "P2";
      return "P1";
    case "draft": return s.turn;
    case "handoff":
      if (!s.players.P1.ready) return "P1";
      if (!s.players.P2.ready) return "P2";
      return "P1";
    case "result":
      if (!s.players.P1.result) return "P1";
      if (!s.players.P2.result) return "P2";
      return "P1";
    default: return "P1";
  }
}
function sendAction(action) {
  if (!G.state) return;
  const actor = G.state.mode === "offline" ? offlineActor() : G.mySeat;
  if (G.state.mode === "offline") {
    const res = applyAction(G.state, action, actor);
    if (!res.ok) { toast(res.error, "danger"); return; }
    render();
  } else {
    if (G.isHost) {
      const res = applyAction(G.state, action, actor);
      if (!res.ok) { toast(res.error, "danger"); return; }
      broadcastState();
      render();
    } else {
      if (!G.conn || !G.conn.open) { toast("Not connected", "danger"); return; }
      G.conn.send({ type:"ACTION", action });
    }
  }
}
function sendChat(msg) {
  if (!G.state || G.state.mode !== "online") return;
  if (!msg) return;
  if (G.isHost) {
    const res = applyAction(G.state, { type:"ADD_CHAT", msg }, G.mySeat);
    if (!res.ok) { if (res.error !== "Too fast") toast(res.error, "danger"); return; }
    broadcastState();
    render();
  } else {
    if (!G.conn || !G.conn.open) { toast("Not connected", "danger"); return; }
    G.conn.send({ type:"ACTION", action:{ type:"ADD_CHAT", msg } });
  }
}
function broadcastState() {
  if (!G.state || !G.conn || !G.conn.open) return;
  G.conn.send({ type:"STATE", state: redactFor(G.state, "P2") });
}

/* ===== ONLINE ===== */
const PEER_AVAILABLE = typeof Peer !== "undefined";

const METERED_APP_NAME = "towerbeetles";
const METERED_API_KEY = "0GnMFSysPNHKRs5SLoJE_ZVtuc4PnSXkPTH-aFtpyZcoMeLO";

const STUN_SERVERS = [
  { urls:"stun:stun.l.google.com:19302" },
  { urls:"stun:stun1.l.google.com:19302" }
];

let cachedIceServers = null;
async function getIceServers() {
  if (cachedIceServers) return cachedIceServers;
  const configured = METERED_APP_NAME && METERED_APP_NAME !== "YOUR_APP_NAME" &&
                      METERED_API_KEY && METERED_API_KEY !== "YOUR_API_KEY";
  if (!configured) {
    console.warn("Metered TURN not configured — STUN only.");
    cachedIceServers = STUN_SERVERS;
    return cachedIceServers;
  }
  try {
    const res = await fetch(`https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const turnServers = await res.json();
    cachedIceServers = [...STUN_SERVERS, ...turnServers];
  } catch (e) {
    console.warn("Failed to fetch TURN credentials:", e);
    cachedIceServers = STUN_SERVERS;
  }
  return cachedIceServers;
}
function isSecureContextForOnline() {
  const h = location.hostname;
  return location.protocol === "https:" || h === "localhost" || h === "127.0.0.1" || location.protocol === "file:";
}
function checkHttpsForOnline() {
  const hint = $("#onlineHint");
  const btnCreate = $("#btnCreateOnline");
  const btnJoin = $("#btnJoinOnline");
  if (!hint || !btnCreate || !btnJoin) return;
  if (!PEER_AVAILABLE) {
    hint.innerHTML = '<span style="color:var(--red)">⚠ Online unavailable — peer script could not load.</span>';
    btnCreate.disabled = true; btnJoin.disabled = true; return;
  }
  if (!isSecureContextForOnline()) {
    hint.innerHTML = '<span style="color:var(--red)">⚠ Online requires HTTPS. Deploy to Netlify/Vercel first.</span>';
    btnCreate.disabled = true; btnJoin.disabled = true; return;
  }
  hint.textContent = "Requires HTTPS and a stable connection. Refreshing mid-match disconnects you.";
  btnCreate.disabled = false; btnJoin.disabled = false;
}
document.addEventListener("DOMContentLoaded", checkHttpsForOnline);
function friendlyPeerError(e) {
  const type = e && e.type;
  if (type === "peer-unavailable") return "Room code not found.";
  if (type === "network") return "Network error. Check your connection.";
  if (type === "browser-incompatible") return "Browser not supported for online play.";
  if (type === "disconnected") return "Disconnected from signaling server.";
  if (type === "unavailable-id") return "Room code already in use. Try again.";
  return "Connection error (" + String(type || "unknown") + ").";
}
async function createRoom() {
  if (!PEER_AVAILABLE) { toast("Online unavailable.", "danger"); return; }
  if (!isSecureContextForOnline()) { toast("Online requires HTTPS.", "danger"); return; }
  if (G.peer) { try { G.peer.destroy(); } catch(e){} G.peer = null; }
  const name = sanitizeName($("#myName").value, "Player");
  const dt = $("#onlineDraftType") ? $("#onlineDraftType").value : "Open";
  G.mySeat = "P1"; G.isHost = true;
  G.roomCode = randHex(2).toUpperCase() + Math.floor(Math.random()*90+10);
  const iceServers = await getIceServers();
  G.peer = new Peer("rf1-" + G.roomCode, { config: { iceServers } });
  G.peer.on("open", () => {
    G.state = newState({ mode:"online", draftType:dt, p1name:name, p2name:"Opponent" });
    G.state.phase = "waiting";
    G.state.matchId = G.roomCode;
    render();
    toast("Room created: " + G.roomCode, "good");
  });
  G.peer.on("connection", conn => {
    if (G.conn && G.conn.open) { try { conn.close(); } catch(e){} return; }
    G.conn = conn;
    conn.on("open", () => {
      $("#connBadge").hidden = false;
      $("#connBadge").textContent = "🔗 Connected";
      if (G.state.phase === "waiting") G.state.phase = "coin";
      broadcastState();
      render();
    });
    conn.on("data", data => {
      if (!data || typeof data !== "object") return;
      if (data.type === "ACTION") {
        const res = applyAction(G.state, data.action, "P2");
        if (!res.ok) { conn.send({ type:"ERROR", error:res.error }); return; }
        broadcastState();
        render();
      } else if (data.type === "JOIN") {
        const guestName = sanitizeName(data.name, "Opponent");
        G.state.players.P2.name = dedupeName(guestName, G.state.players.P1.name);
        broadcastState();
        render();
      }
    });
    conn.on("close", handleDisconnect);
    conn.on("error", () => handleDisconnect());
  });
  G.peer.on("error", e => toast(friendlyPeerError(e), "danger"));
}
function handleDisconnect() {
  $("#connBadge").textContent = "⚠ Disconnected";
  $("#connBadge").hidden = false;
  if (!G.state || G.state.phase === "final") return;
  modal("Opponent disconnected", `<p>The connection was lost. This online match cannot continue.</p><p class="muted" style="font-size:13px">No MMR change is recorded for an unfinished match.</p>`,
    [{ label:"Return to Setup", kind:"good", onClick:() => {
      if (G.peer) { try { G.peer.destroy(); } catch(e){} G.peer = null; }
      G.conn = null; G.state = null; G.view = null; render();
    }}]);
}
async function joinRoom() {
  if (!PEER_AVAILABLE) { toast("Online unavailable.", "danger"); return; }
  if (!isSecureContextForOnline()) { toast("Online requires HTTPS.", "danger"); return; }
  if (G.peer) { try { G.peer.destroy(); } catch(e){} G.peer = null; }
  const name = sanitizeName($("#myName").value, "Player");
  const code = $("#joinCode").value.trim().toUpperCase();
  if (!code) { toast("Enter a code", "warn"); return; }
  G.mySeat = "P2"; G.isHost = false; G.roomCode = code;
  const iceServers = await getIceServers();
  G.peer = new Peer(undefined, { config: { iceServers } });
  G.peer.on("open", () => {
    G.conn = G.peer.connect("rf1-" + code, { reliable:true });
    G.conn.on("open", () => {
      $("#connBadge").hidden = false;
      $("#connBadge").textContent = "🔗 Connected";
      G.conn.send({ type:"JOIN", name });
      toast("Joined " + code, "good");
    });
    G.conn.on("data", data => {
      if (!data || typeof data !== "object") return;
      if (data.type === "STATE") { G.state = data.state; render(); }
      else if (data.type === "ERROR") toast(data.error, "danger");
    });
    G.conn.on("close", handleDisconnect);
    G.conn.on("error", () => handleDisconnect());
  });
  G.peer.on("error", e => toast(friendlyPeerError(e), "danger"));
}

/* ===== EVENTS ===== */
$("#btnOffline").onclick = () => {
  const p1 = sanitizeName($("#p1name").value, "Blue");
  let p2 = sanitizeName($("#p2name").value, "Red");
  p2 = dedupeName(p2, p1);
  G.state = newState({ mode:"offline", draftType:$("#draftType").value, p1name:p1, p2name:p2 });
  G.mySeat = "P1"; G.isHost = true;
  rulingUndo = null;
  render();
};
$("#btnCreateOnline").onclick = createRoom;
$("#btnJoinOnline").onclick = joinRoom;
$("#joinCode").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
$("#btnCopyCode").onclick = () => {
  if (!G.roomCode) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(G.roomCode).then(() => toast("Copied", "good")).catch(() => toast("Copy failed", "warn"));
  } else toast("Room code: " + G.roomCode, "good");
};
$("#btnCancelWait").onclick = () => {
  if (G.peer) { try { G.peer.destroy(); } catch(e){} G.peer = null; }
  G.conn = null; G.state = null; G.view = null;
  render();
};
$("#btnFlip").onclick = () => {
  const s = G.state;
  if (!s) return;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  if (s.mode === "offline") {
    const secret = randHex(16);
    const r1 = applyAction(G.state, { type:"COIN_COMMIT", hash:"local" }, actor);
    if (!r1.ok) { toast(r1.error, "danger"); return; }
    const r2 = applyAction(G.state, { type:"COIN_REVEAL", secret }, actor);
    if (!r2.ok) { toast(r2.error, "danger"); return; }
    render();
    return;
  }
  if (!window.crypto || !crypto.subtle) { toast("Secure crypto unavailable.", "danger"); return; }
  $("#btnFlip").hidden = true;
  const secret = randHex(16);
  sha256(secret).then(h => {
    sendAction({ type:"COIN_COMMIT", hash:h });
    sendAction({ type:"COIN_REVEAL", secret });
  }).catch(() => toast("Coin flip failed", "danger"));
};
$$("#choiceBox button").forEach(b => { b.onclick = () => sendAction({ type:"COIN_CHOOSE", choice:b.dataset.choice }); });
$("#btnConfirmConfig").onclick = () => sendAction({ type:"CONFIRM_CONFIG" });
$("#btnUndo").onclick = () => sendAction({ type:"UNDO_RULING" });
$("#btnReset").onclick = () => sendAction({ type:"RESET_RULING" });
$("#btnLock").onclick = () => {
  const s = G.state;
  if (!s) return;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  let cost = 0; for (const r of me.rulings) cost += RULINGS[r].cost;
  modal("Lock portfolio?", `<p>You've selected <b>${me.rulings.length}</b> ruling(s) for <b>${cost}</b> points. This cannot be undone this match.</p>`, [
    { label:"Lock in", kind:"good", onClick:() => sendAction({ type:"LOCK_RULING" }) },
    { label:"Cancel", kind:"secondary", close:true }
  ]);
};
$("#btnBeginDraft").onclick = () => sendAction({ type:"BEGIN_DRAFT" });
$("#btnAbort").onclick = () => {
  modal("Abort match?", "<p>The match will be voided. No MMR change.</p>",
    [{ label:"Abort", kind:"danger", onClick:() => sendAction({ type:"ABORT" }) },
     { label:"Cancel", kind:"secondary", close:true }]);
};
$("#btnHandoffReady").onclick = () => sendAction({ type:"REPORT_READY" });
$("#btnResultWin").onclick = () => sendAction({ type:"REPORT_RESULT", result:"win" });
$("#btnResultLoss").onclick = () => sendAction({ type:"REPORT_RESULT", result:"loss" });
$("#btnResultTech").onclick = () => sendAction({ type:"REPORT_RESULT", result:"tech" });
$("#btnSendChat").onclick = () => {
  const input = $("#chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";
  sendChat(msg);
};
$("#chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("#btnSendChat").click(); }
});
function fullReset() {
  lastRecordedMatch = null;
  if (G.peer) { try { G.peer.destroy(); } catch(e){} G.peer = null; }
  G.conn = null; G.state = null; G.view = null; G.roomCode = null;
  $("#connBadge").hidden = true;
  render();
}
$("#btnRematch").onclick = fullReset;
$("#btnNewMatch").onclick = fullReset;
$("#btnSaveBuild").onclick = () => {
  const s = G.state;
  if (!s) return;
  const actor = s.mode === "offline" ? offlineActor() : G.mySeat;
  const me = s.players[actor];
  if (!me.rulings.length) { toast("No rulings selected", "warn"); return; }
  const name = prompt("Build name:", "Build " + (Builds.load().length + 1));
  if (!name) return;
  Builds.add(name, [...me.rulings]);
  toast("Build saved", "good");
};
$("#btnLoadBuild").onclick = () => {
  const builds = Builds.load();
  const rows = [];
  STARTER_BUILDS.forEach(sb => {
    rows.push({ label:`⭐ ${sb.name} — ${sb.rulings.join(", ")}`, close:true, onClick:() => {
      const v = Builds.validate(sb);
      if (!v.ok) { toast("Invalid: " + v.reason, "danger"); return; }
      sendAction({ type:"RESET_RULING" });
      sb.rulings.forEach(r => sendAction({ type:"ADD_RULING", ruling:r }));
    }});
  });
  builds.forEach(b => {
    rows.push({ label:`${b.name} (${b.rulings.join(", ") || "empty"})`, close:true, onClick:() => {
      const v = Builds.validate(b);
      if (!v.ok) { toast("Invalid: " + v.reason, "danger"); return; }
      sendAction({ type:"RESET_RULING" });
      b.rulings.forEach(r => sendAction({ type:"ADD_RULING", ruling:r }));
    }});
  });
  if (!rows.length) { toast("No builds available", "warn"); return; }
  modal("Load Build", "<p>⭐ = starter builds (always available).</p>", rows);
};
$("#btnProfile").onclick = () => {
  const p = Player.load();
  const r = getRank(p.online.mmr);
  modal("Profile", `
    <div class="loadout">
      <h3 style="margin-top:0">Offline (casual)</h3>
      <div>W:${p.offline.wins} · L:${p.offline.losses} · Tech/Void:${p.offline.techVoid}</div>
      <div>Matches: ${p.offline.matches}</div>
      <div class="muted" style="font-size:12px;margin-top:4px">Does not affect ranked MMR.</div>
    </div>
    <div class="loadout">
      <h3 style="margin-top:0">Online — Provisional MMR <span class="pill">Unverified</span></h3>
      <div><b>${esc(r.icon)} ${esc(r.name)}</b> — ${p.online.mmr} MMR (peak ${p.online.peakMmr})</div>
      <div>W:${p.online.wins} · L:${p.online.losses} · Tech/Void:${p.online.techVoid}</div>
      <div>Streak: ${p.online.streak} (best ${p.online.bestStreak})</div>
      <div>Matches: ${p.online.matches} · Placements left: ${p.online.placementsLeft}</div>
      <div class="muted" style="font-size:12px;margin-top:4px">Honor-system reports. Locally tracked, unverified.</div>
    </div>
    <button class="danger" id="resetProfile">Reset Profile</button>
  `, [{ label:"Close", kind:"secondary", close:true }]);
  setTimeout(() => {
    const rb = document.getElementById("resetProfile");
    if (rb) rb.onclick = () => {
      if (confirm("Reset local profile? This clears offline and online stats on this device.")) {
        Player.reset();
        modal("Reset", "<p>Profile reset.</p>", [{ label:"OK", close:true }]);
      }
    };
  }, 0);
};
$("#btnHelp").onclick = () => {
  modal("How to play — Ranked Flex 1.0.1", `
    <ul style="padding-left:20px;font-size:14px">
      <li><b>Draft 4 towers.</b> Farm is mandatory, auto-added, and untargetable.</li>
      <li><b>Rulings:</b> 3 slots, 15 points. 50 rulings across Easy / Moderate / Hard / Insane tiers.</li>
      <li><b>Open draft:</b> 1 pick/turn × 4 turns. <b>Close draft:</b> 2 picks/turn × 2 turns.</li>
      <li><b>Removals (Ban/Evict/Steal/Plunder/Doom/Ruin/Purge):</b> max 1 per player. Removed towers return to the pool for a replacement pick.</li>
      <li><b>Coinflip:</b> commit-reveal; winner chooses first/second pick.</li>
      <li><b>Timers auto-resolve:</b> if a draft timer hits 0, your turn auto-passes. If a report times out after 5 minutes, the responding player's report stands.</li>
      <li><b>Result:</b> both report independently. Disagreement = void (no MMR change). Technical = no MMR change.</li>
      <li><b>Offline:</b> casual only, never affects MMR.</li>
      <li><b>Online:</b> honor-system, updates a Provisional MMR only — not an official ranked rating.</li>
    </ul>
  `, [{ label:"Close", kind:"secondary", close:true }]);
};
setInterval(() => {
  if (G.state && G.state.mode === "online" && G.isHost && G.state.phase !== "final") {
    try { sessionStorage.setItem("rf_1_0_match", JSON.stringify({ matchId:G.state.matchId, phase:G.state.phase })); } catch(e){}
  }
}, 3000);
window.addEventListener("beforeunload", (e) => {
  if (G.state && G.state.mode === "online" && G.state.phase !== "final" && G.state.phase !== "landing" && G.state.phase !== "waiting") {
    e.preventDefault();
    e.returnValue = "Refreshing will disconnect you from this online match. Continue?";
    return e.returnValue;
  }
});
(function checkStale() {
  try {
    const raw = sessionStorage.getItem("rf_1_0_match");
    if (raw) {
      sessionStorage.removeItem("rf_1_0_match");
      const snap = JSON.parse(raw);
      if (snap && snap.phase && snap.phase !== "final") {
        setTimeout(() => {
          modal("Match state was lost", `<p>This page was refreshed during an online match.</p><p class="muted" style="font-size:13px">No MMR change was recorded. Create or join a new room to continue.</p>`, [{ label:"OK", kind:"good", close:true }]);
        }, 300);
      }
    }
  } catch (e) {}
})();

/* ===== INIT ===== */
render();
</script>
</body>
</html>