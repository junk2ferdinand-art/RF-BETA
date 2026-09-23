
/* ===== REDUCER ===== */
function applyAction(state, action, actor) {
  const ok = s => ({ ok:true, state:s });
  const err = msg => ({ ok:false, error:msg });
  const opp = actor === "P1" ? "P2" : "P1";
  switch (action.type) {
    case "COIN_COMMIT": {
      if (state.phase !== "coin") return err("Wrong phase");
      if (state.coin.commits[actor]) return err("Already committed");
      state.coin.commits[actor] = String(action.hash||"").slice(0,128);
      log(state, `${state.players[actor].name} committed`);
      state.lastActionAt = now();
      return ok(state);
    }
    case "COIN_REVEAL": {
      if (state.phase !== "coin") return err("Wrong phase");
      if (!state.coin.commits[actor]) return err("Must commit first");
      state.coin.reveals[actor] = String(action.secret||"").slice(0,128);
      log(state, `${state.players[actor].name} revealed`);
      if (state.coin.reveals.P1 && state.coin.reveals.P2) {
        const combined = state.coin.reveals.P1 + state.coin.reveals.P2;
        let h = 0; for (let i=0;i<combined.length;i++) h = (h*31 + combined.charCodeAt(i))>>>0;
        state.coin.winner = (h % 2 === 0) ? "P1" : "P2";
        log(state, `Winner: ${state.players[state.coin.winner].name}`);
      }
      state.lastActionAt = now();
      return ok(state);
    }
    case "COIN_CHOOSE": {
      if (state.phase !== "coin") return err("Wrong phase");
      if (state.coin.winner !== actor) return err("Not the winner");
      if (action.choice === "first") { state.firstPicker = actor; state.turn = actor; }
      else { state.firstPicker = opp; state.turn = opp; }
      state.phase = "config";
      log(state, `${state.players[actor].name} chose ${action.choice} pick`);
      state.lastActionAt = now();
      return ok(state);
    }
    case "CONFIRM_CONFIG": {
      if (state.phase !== "config") return err("Wrong phase");
      state.players[actor].ready = true;
      log(state, `${state.players[actor].name} confirmed`);
      if (state.players.P1.ready && state.players.P2.ready) { state.phase = "rulings"; state.turn = "P1"; }
      state.lastActionAt = now();
      return ok(state);
    }
    case "ADD_RULING": {
      if (state.phase !== "rulings") return err("Wrong phase");
      const p = state.players[actor];
      if (p.locked) return err("Portfolio is locked");
      let r = action.ruling;
      r = RENAME_MAP[r] || r;
      if (!RULINGS[r]) return err("Unknown ruling");
      if (!hasSlot(p)) return err("No slots left (3/3 used)");
      if (!canAfford(p, r)) return err("Not enough points (" + RULINGS[r].cost + " needed, " + (CAPS.points - p.rulings.reduce((s,x)=>s+RULINGS[x].cost,0)) + " left)");
      const capChecks = [
        ["Veto",CAPS.veto],["Ban",CAPS.ban],["Martyr",CAPS.martyr],["Silence",CAPS.silence],
        ["Doom",CAPS.doom],["Pact",CAPS.pact],["Fuse",CAPS.fuse],["Split",CAPS.split],
        ["Ascend",CAPS.ascend],["Ruin",CAPS.ruin],["Amnesty",CAPS.amnesty],["Purge",CAPS.purge],
        ["Jinx",CAPS.jinx],["Echo",CAPS.echo],["Haven",CAPS.haven]
      ];
      for (const [name, cap] of capChecks) {
        if (r === name && countRuling(p, name) >= cap) return err(`Max ${cap} ${name} allowed`);
      }
      p.rulings.push(r);
      state.lastActionAt = now();
      return ok(state);
    }
    case "UNDO_RULING": {
      if (state.phase !== "rulings" || state.players[actor].locked) return err("Cannot undo");
      state.players[actor].rulings.pop();
      state.lastActionAt = now();
      return ok(state);
    }
    case "RESET_RULING": {
      if (state.phase !== "rulings" || state.players[actor].locked) return err("Cannot reset");
      state.players[actor].rulings = [];
      state.lastActionAt = now();
      return ok(state);
    }
    case "LOCK_RULING": {
      if (state.phase !== "rulings") return err("Wrong phase");
      const p = state.players[actor];
      if (p.locked) return err("Already locked");
      let cost = 0; for (const r of p.rulings) cost += RULINGS[r].cost;
      if (cost > CAPS.points) return err("Cost over budget");
      p.locked = true;
      log(state, `${p.name} locked their portfolio`);
      if (state.players.P1.locked && state.players.P2.locked) state.phase = "reveal";
      state.lastActionAt = now();
      return ok(state);
    }
    case "BEGIN_DRAFT": {
      if (state.phase !== "reveal") return err("Wrong phase");
      if (!state.players.P1.towers.some(t => t.name === FARM)) addTower(state.players.P1, FARM);
      if (!state.players.P2.towers.some(t => t.name === FARM)) addTower(state.players.P2, FARM);
      state.phase = "draft";
      state.turn = state.firstPicker;
      state.picksThisTurn = 0;
      state.round = 1;
      state.forcedPick = null;
      rulingUndo = null;
      log(state, `Draft begins — ${state.players[state.firstPicker].name} picks first`);
      state.lastActionAt = now();
      return ok(state);
    }
    case "PICK": {
      if (state.phase !== "draft") return err("Wrong phase");
      if (state.turn !== actor) return err("Not your turn");
      const t = action.tower;
      const p = state.players[actor];
      if (!TOWERS.includes(t)) return err("Unknown tower");
      if (state.poolBanned.includes(t)) return err("That tower is banned");
      if (!state.pool.includes(t)) return err("That tower is already taken");
      if (p.towers.some(x => x.name === t)) return err("You already own that tower");
      if (draftedCount(p) >= CAPS.towers) return err("Your draft is complete");
      if (state.forcedPick && state.forcedPick.forSeat === actor) {
        if (!state.pool.includes(state.forcedPick.tower)) {
          // Auto-clear stale forced pick when target vanished
          state.forcedPick = null;
        } else if (state.forcedPick.tower !== t) {
          return err(`You are forced to pick ${state.forcedPick.tower}`);
        }
      }
      if (towerTier(t) === "S" && countS(p) >= 1) return err("S-tier cap: you already hold an S-tier");
      state.pool = state.pool.filter(x => x !== t);
      addTower(p, t);
      if (p.pendingReplacement > 0) p.pendingReplacement--;
      state.picksThisTurn++;
      state.lastPick = { by: actor, name: t };
      if (state.forcedPick && state.forcedPick.forSeat === actor) state.forcedPick = null;
      log(state, `${p.name} drafted ${t}`);
      advanceTurn(state);
      state.lastActionAt = now();
      return ok(state);
    }
    case "USE_RULING": {
      if (state.phase !== "draft") return err("Wrong phase");
      if (state.turn !== actor) return err("Not your turn");
      const r = RENAME_MAP[action.ruling] || action.ruling;
      const p0 = state.players[actor];
      if (!p0.rulings.includes(r)) return err("You don't own that ruling");
      if (p0.lockedRulingsUntil >= state.round) {
        if (p0.jinxed && p0.rulings.length) {
          p0.jinxed = false;
          const di = randInt(p0.rulings.length);
          const disc = p0.rulings.splice(di, 1)[0];
          p0.spent.push(disc);
          log(state, `Jinx triggered: ${p0.name} lost ${disc} (blocked)`);
        }
        return err("Your rulings are locked down");
      }
      if (p0.frozenUntil >= state.round && p0.frozenType === r) {
        if (p0.jinxed && p0.rulings.length) {
          p0.jinxed = false;
          const di = randInt(p0.rulings.length);
          const disc = p0.rulings.splice(di, 1)[0];
          p0.spent.push(disc);
          log(state, `Jinx triggered: ${p0.name} lost ${disc} (frozen)`);
        }
        return err(`${r} is frozen`);
      }
      const snapshot = (r === "Veto") ? null : JSON.stringify(state);
      const eff = applyRulingEffect(state, actor, r, action);
      if (!eff.ok) return err(eff.error);
      const pl = state.players[actor];
      // Ward is only consumed by rules that try to cancel/block other rulings.
      // It shields the caster's NEXT ruling, so we clear it AFTER the ruling resolves.
      if (r !== "Ward" && pl.wardActive) {
        // record for Veto check that this ruling was warded
        state.lastRulingWarded = true;
        pl.wardActive = false;
      } else if (r !== "Ward") {
        state.lastRulingWarded = false;
      }
      if (!eff.keepRuling) {
        const idx = pl.rulings.indexOf(r);
        if (idx >= 0) pl.rulings.splice(idx, 1);
        pl.spent.push(r);
      }
      if (r === "Veto") {
        rulingUndo = null;
        state.lastRuling = { by:actor, ruling:"Veto", warded:false };
      } else {
        rulingUndo = snapshot;
        state.lastRuling = { by:actor, ruling:r, target:action.target, meta:eff.meta||null, warded:!!state.lastRulingWarded };
      }
      if (r !== "Jinx" && pl.jinxed && pl.rulings.length) {
        pl.jinxed = false;
        const di = randInt(pl.rulings.length);
        const disc = pl.rulings.splice(di, 1)[0];
        pl.spent.push(disc);
        log(state, `Jinx triggered: ${pl.name} also lost ${disc}`);
      }
      if (!eff.silent) log(state, `${pl.name} used ${r}`);
      if (state.phase === "draft" && draftedCount(state.players[actor]) >= CAPS.towers) {
        advanceTurn(state);
      }
      state.lastActionAt = now();
      return ok(state);
    }
    case "ADD_CHAT": {
      if (state.mode !== "online") return err("Chat is online-only");
      const txt = String(action.msg || "").slice(0, 200).trim();
      if (!txt) return err("Empty message");
      if (state.chat.length > 0 && state.chat[state.chat.length-1].sender === actor && (now() - state.chat[state.chat.length-1].t) < 400) return err("Too fast");
      state.chat.push({ t: now(), sender: actor, name: state.players[actor].name, msg: txt });
      if (state.chat.length > 100) state.chat = state.chat.slice(-100);
      state.lastActionAt = now();
      return ok(state);
    }
    case "REPORT_READY": {
      if (state.phase !== "handoff") return err("Wrong phase");
      state.players[actor].ready = true;
      if (state.players.P1.ready && state.players.P2.ready) {
        state.phase = "result";
        state.reportDeadline = now() + 5*60*1000;
      }
      state.lastActionAt = now();
      return ok(state);
    }
    case "REPORT_RESULT": {
      if (state.phase !== "result") return err("Wrong phase");
      state.players[actor].result = action.result;
      log(state, `${state.players[actor].name} reported ${action.result}`);
      if (state.players.P1.result && state.players.P2.result) finalizeResults(state);
      state.lastActionAt = now();
      return ok(state);
    }
    case "AUTO_RESOLVE_REPORT": {
      if (state.phase !== "result") return err("Wrong phase");
      const p1r = state.players.P1.result, p2r = state.players.P2.result;
      if (p1r && !p2r) { state.players.P2.result = p1r === "win" ? "loss" : (p1r === "loss" ? "win" : "tech"); log(state, `Auto-resolved: ${state.players.P2.name} did not report`); }
      else if (p2r && !p1r) { state.players.P1.result = p2r === "win" ? "loss" : (p2r === "loss" ? "win" : "tech"); log(state, `Auto-resolved: ${state.players.P1.name} did not report`); }
      else { state.outcome = { type:"void", reason:"Both failed to report" }; state.phase = "final"; return ok(state); }
      finalizeResults(state);
      return ok(state);
    }
    case "AUTO_PASS_TURN": {
      if (state.phase !== "draft") return err("Wrong phase");
      if (state.turn !== actor) return err("Not your turn");
      log(state, `${state.players[actor].name} ran out of time — turn auto-passed`);
      advanceTurn(state, true);
      state.lastActionAt = now();
      return ok(state);
    }
    case "ABORT": {
      state.phase = "final";
      state.aborted = true;
      state.outcome = { type:"void", reason:"Aborted by " + state.players[actor].name };
      rulingUndo = null;
      log(state, `Match aborted`);
      state.lastActionAt = now();
      return ok(state);
    }
    default: return err("Unknown action");
  }
}

function advanceTurn(state, force = false) {
  const cur = state.turn, other = cur === "P1" ? "P2" : "P1";
  const cp = state.players[cur], op = state.players[other];
  const allowed = state.picksPerTurn + (cp.bonusPicks || 0);
  const curDone = draftedCount(cp) >= CAPS.towers;
  const otherDone = draftedCount(op) >= CAPS.towers;
  if (!force && !curDone && state.picksThisTurn < allowed) return;
  if (state.forcedPick && state.forcedPick.forSeat === cur) state.forcedPick = null;
  if (curDone && otherDone) {
    state.phase = "handoff";
    cp.bonusPicks = 0; cp.passBank = 0; cp.timerHalved = false;
    log(state, `Draft complete`);
    return;
  }
  if (otherDone) {
    cp.bonusPicks = (cp.bonusPicks || 0) + (cp.passBank || 0);
    cp.passBank = 0;
    cp.timerHalved = false;
    state.picksThisTurn = 0;
    return;
  }
  cp.bonusPicks = cp.passBank || 0;
  cp.passBank = 0;
  cp.timerHalved = false;
  state.turn = other;
  state.picksThisTurn = 0;
  state.round++;
  state.players.P1.markedId = null;
  state.players.P2.markedId = null;
  state.players.P1.riposteActive = false;
  state.players.P2.riposteActive = false;
  [state.players.P1, state.players.P2].forEach(pl => {
    Object.keys(pl.protectedUntil).forEach(id => {
      const val = pl.protectedUntil[id];
      if (val !== -1 && state.round > val) delete pl.protectedUntil[id];
    });
  });
}

/* ===== RULING EFFECTS ===== */
function applyRulingEffect(state, actor, r, action) {
  const p = state.players[actor];
  const opp = actor === "P1" ? "P2" : "P1";
  const oppP = state.players[opp];
  const target = action.target;
  switch (r) {
    case "Pass": {
      if (draftedCount(p) >= CAPS.towers) return { ok:false, error:"Draft already complete" };
      const allowed = state.picksPerTurn + (p.bonusPicks || 0);
      const remaining = Math.max(0, allowed - state.picksThisTurn);
      if (remaining <= 0) return { ok:false, error:"Nothing to skip" };
      p.passBank = (p.passBank || 0) + remaining;
      log(state, `${p.name} passed — ${remaining} pick(s) banked`);
      advanceTurn(state, true);
      return { ok:true };
    }
    case "Change": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[idx])) return { ok:false, error:"Cannot change Farm" };
      const removed = removeTowerAt(p, idx);
      state.removed[actor].push(removed.name);
      state.pool = [...new Set([...state.pool, removed.name])];
      p.pendingReplacement++;
      log(state, `Change: ${removed.name} returned to pool`);
      return { ok:true };
    }
    case "Bounty": {
      if (target === "refund") {
        if (!p.spent.length) return { ok:false, error:"No spent rulings to refund" };
        if (p.rulings.length >= CAPS.slots) return { ok:false, error:"No free slot" };
        const back = p.spent.pop();
        p.rulings.push(back);
        log(state, `Bounty refunded ${back}`);
        return { ok:true };
      }
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const id = oppP.towers[idx].id;
      if (!oppP.hidden.includes(id)) return { ok:false, error:"Not hidden" };
      oppP.hidden = oppP.hidden.filter(i => i !== id);
      log(state, `Bounty revealed ${oppP.towers[idx].name}`);
      return { ok:true };
    }
    case "Peek": {
      if (oppP.inspected) return { ok:false, error:"Opponent's towers already fully revealed" };
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const id = oppP.towers[idx].id;
      if (!oppP.hidden.includes(id)) return { ok:false, error:"Not hidden" };
      if (!state.privateReveals) state.privateReveals = { P1:[], P2:[] };
      if (!state.privateReveals[actor].includes(id)) state.privateReveals[actor].push(id);
      log(state, `Peek: ${p.name} quietly peeked at a hidden tower`);
      return { ok:true };
    }
    case "Probe": {
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const id = oppP.towers[idx].id;
      if (!oppP.hidden.includes(id)) return { ok:false, error:"Not hidden" };
      oppP.hidden = oppP.hidden.filter(i => i !== id);
      if (!oppP.probed.includes(id)) oppP.probed.push(id);
      log(state, `Probe revealed ${oppP.towers[idx].name} permanently`);
      return { ok:true };
    }
    case "Hide": {
      if (p.inspected) return { ok:false, error:"You cannot hide — you have been Inspected." };
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[idx])) return { ok:false, error:"Cannot hide Farm" };
      const id = p.towers[idx].id;
      if (p.hidden.length >= CAPS.hidden) return { ok:false, error:"Hidden cap reached (max 2)" };
      if (p.probed.includes(id)) return { ok:false, error:"That tower was probed — cannot hide" };
      if (state.clarityActive) return { ok:false, error:"Clarity is active — nothing can be hidden" };
      if (!p.hidden.includes(id)) p.hidden.push(id);
      log(state, `Hide: a tower was concealed`);
      return { ok:true };
    }
    case "Turn": {
      if (state.draftType === "Close") return { ok:false, error:"Not allowed in Close draft" };
      if (draftedCount(p) >= CAPS.towers) return { ok:false, error:"Draft already complete" };
      p.bonusPicks = (p.bonusPicks || 0) + 1;
      log(state, `${p.name} takes an extra pick`);
      return { ok:true };
    }
    case "Delay": {
      oppP.timerHalved = true;
      log(state, `Delay: ${oppP.name}'s next timer halved`);
      return { ok:true };
    }
    case "Mark": {
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(oppP.towers[idx])) return { ok:false, error:"Farm is untargetable" };
      const id = oppP.towers[idx].id;
      oppP.hidden = oppP.hidden.filter(i => i !== id);
      delete oppP.protectedUntil[id];
      oppP.markedId = id;
      log(state, `Mark: ${oppP.towers[idx].name} exposed`);
      return { ok:true };
    }
    case "Fracture": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (towerTier(p.towers[idx].name) !== "S") return { ok:false, error:"Not S-tier" };
      const id = p.towers[idx].id;
      if (!p.downgradedS.includes(id)) p.downgradedS.push(id);
      log(state, `Fracture: ${p.towers[idx].name} treated as A-tier`);
      return { ok:true };
    }
    case "Revive": {
      if (!state.poolBanned.includes(target)) return { ok:false, error:"Not banned" };
      state.poolBanned = state.poolBanned.filter(x => x !== target);
      state.pool = [...new Set([...state.pool, target])];
      log(state, `Revive: ${target} returned to pool`);
      return { ok:true };
    }
    case "Shift": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const src = p.towers[idx];
      if (isFarm(src)) return { ok:false, error:"Cannot shift Farm" };
      const srcTier = towerTier(src.name);
      if (srcTier === "S") return { ok:false, error:"S-tier cannot be shifted" };
      if (!state.pool.includes(action.want)) return { ok:false, error:"Target not in pool" };
      if (towerTier(action.want) !== srcTier) return { ok:false, error:"Must be same tier" };
      removeTowerAt(p, idx);
      state.removed[actor].push(src.name);
      addTower(p, action.want);
      state.pool = state.pool.filter(x => x !== action.want);
      state.pool = [...new Set([...state.pool, src.name])];
      log(state, `Shift: ${src.name} → ${action.want}`);
      return { ok:true };
    }
    case "Cloak": {
      if (p.inspected) return { ok:false, error:"You cannot cloak — you have been Inspected." };
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[idx])) return { ok:false, error:"Cannot cloak Farm" };
      const id = p.towers[idx].id;
      if (p.hidden.length >= CAPS.hidden) return { ok:false, error:"Hidden cap reached" };
      if (state.clarityActive) return { ok:false, error:"Clarity is active" };
      if (p.probed.includes(id)) return { ok:false, error:"Probed" };
      if (!p.hidden.includes(id)) p.hidden.push(id);
      return { ok:true, silent:true };
    }
    case "Rebel": {
      const lr = state.lastRuling;
      if (!lr || lr.ruling !== "Steal" || lr.by === actor || !lr.meta || !lr.meta.name) return { ok:false, error:"No Steal to reverse" };
      const thief = state.players[lr.by];
      const i = thief.towers.findIndex(t => t.name === lr.meta.name);
      if (i < 0) return { ok:false, error:"Stolen tower not found" };
      const t = removeTowerAt(thief, i);
      addTower(p, t.name);
      thief.removedCount = Math.max(0, thief.removedCount - 1);
      thief.pendingReplacement = Math.max(0, thief.pendingReplacement - 1);
      state.lastRuling = null;
      log(state, `Rebel: ${t.name} returned to ${p.name}`);
      return { ok:true };
    }
    case "Recall": {
      if (!state.removed[actor].length) return { ok:false, error:"Nothing to recall" };
      const name = state.removed[actor].pop();
      if (p.towers.some(t => t.name === name)) { state.removed[actor].push(name); return { ok:false, error:"You already own that" }; }
      if (towerTier(name) === "S" && countS(p) >= 1) { state.removed[actor].push(name); return { ok:false, error:"S-tier cap" }; }
      addTower(p, name);
      state.pool = state.pool.filter(x => x !== name);
      log(state, `Recall: ${name}`);
      return { ok:true };
    }
    case "Mirror": {
      if (!state.lastPick) return { ok:false, error:"No last pick" };
      if (state.lastPick.by === actor) return { ok:false, error:"Last pick was yours" };
      const name = state.lastPick.name;
      if (!state.pool.includes(name)) return { ok:false, error:"No longer in pool" };
      if (p.towers.some(t => t.name === name)) return { ok:false, error:"Already own" };
      if (towerTier(name) === "S" && countS(p) >= 1) return { ok:false, error:"S-tier cap" };
      state.pool = state.pool.filter(x => x !== name);
      addTower(p, name);
      log(state, `Mirror: ${p.name} copies ${name}`);
      return { ok:true };
    }
    case "Ward": {
      p.wardActive = true;
      log(state, `Ward: ${p.name}'s next ruling cannot be Veto'd or Silenced`);
      return { ok:true };
    }
    case "Anchor": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[idx])) return { ok:false, error:"Farm is already untargetable" };
      if (Object.keys(p.protectedUntil).length >= CAPS.protected) return { ok:false, error:"Protection cap" };
      p.protectedUntil[p.towers[idx].id] = -1;
      log(state, `Anchor: ${p.towers[idx].name} permanently protected`);
      return { ok:true };
    }
    case "Split": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const src = p.towers[idx];
      if (towerTier(src.name) !== "S") return { ok:false, error:"Not S-tier" };
      const n1 = action.pick1, n2 = action.pick2;
      if (!n1 || !n2 || n1 === n2) return { ok:false, error:"Pick two different towers" };
      if (towerTier(n1) === "S" || towerTier(n2) === "S") return { ok:false, error:"Targets must be A/B/C" };
      if (!state.pool.includes(n1) || !state.pool.includes(n2)) return { ok:false, error:"Target not in pool" };
      removeTowerAt(p, idx);
      state.removed[actor].push(src.name);
      addTower(p, n1); addTower(p, n2);
      state.pool = state.pool.filter(x => x !== n1 && x !== n2);
      state.pool.push(src.name);
      log(state, `Split: ${src.name} → ${n1} + ${n2}`);
      return { ok:true };
    }
    case "Duplicate": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const src = p.towers[idx];
      if (isFarm(src)) return { ok:false, error:"Cannot duplicate Farm" };
      if (towerTier(src.name) === "S") return { ok:false, error:"S-tier cannot be duplicated" };
      if (!state.pool.includes(src.name)) return { ok:false, error:"Original not in pool" };
      state.pool = state.pool.filter(x => x !== src.name);
      addTower(p, src.name);
      log(state, `Duplicate: ${p.name} copied ${src.name}`);
      return { ok:true };
    }
    case "Echo": {
      const lastSelf = (state.lastRuling && state.lastRuling.by === actor) ? state.lastRuling.ruling : null;
      if (!lastSelf) return { ok:false, error:"You have not used a ruling yet" };
      if (["Echo","Graft","Veto"].includes(lastSelf)) return { ok:false, error:"Cannot Echo that" };
      const sub = applyRulingEffect(state, actor, lastSelf, action);
      if (!sub.ok) return { ok:false, error:`Echo failed: ${sub.error}` };
      log(state, `Echo re-applied ${lastSelf}`);
      return { ok:true, meta: sub.meta || null };
    }
    case "Freeze": {
      if (state.draftType !== "Close") return { ok:false, error:"Closing draft only" };
      const type = RENAME_MAP[target] || String(target).slice(0,32);
      if (!RULINGS[type]) return { ok:false, error:"Unknown ruling type" };
      oppP.frozenUntil = state.round;
      oppP.frozenType = type;
      log(state, `Freeze: ${oppP.name} cannot use ${type} this round`);
      return { ok:true };
    }
    case "Secure": {
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      p.protectedUntil[p.towers[idx].id] = state.round + 3;
      log(state, `Secure: ${p.towers[idx].name} protected 2 rounds`);
      return { ok:true };
    }
    case "Riposte": {
      p.riposteActive = true;
      log(state, `Riposte: ${p.name} will negate the next removal`);
      return { ok:true };
    }
    case "Inspect": {
      oppP.hidden = [];
      oppP.inspected = true;
      log(state, `Inspect: all of ${oppP.name}'s hidden towers revealed`);
      return { ok:true };
    }
    case "Graft": {
      const lr = state.lastRuling;
      if (!lr) return { ok:false, error:"No ruling to copy" };
      const last = lr.ruling;
      if (last === "Graft" || last === "Veto") return { ok:false, error:"Cannot Graft that" };
      if (!RULINGS[last]) return { ok:false, error:"Cannot Graft that" };
      if (RULINGS[last].cost > RULINGS.Graft.cost) return { ok:false, error:"Cost too high" };
      // Re-use the ORIGINAL action's target if the copy needs one; caller supplied it.
      const sub = applyRulingEffect(state, actor, last, action);
      if (!sub.ok) return { ok:false, error:`Graft failed: ${sub.error}` };
      log(state, `Graft re-applied ${last}`);
      return { ok:true, meta: sub.meta || null };
    }
    case "Trade": {
      const mi = idxOf(p, action.myId), oi = idxOf(oppP, action.oppId);
      if (mi < 0 || oi < 0) return { ok:false, error:"Bad target" };
      const a = p.towers[mi], b = oppP.towers[oi];
      if (isFarm(a) || isFarm(b)) return { ok:false, error:"Farm untradeable" };
      if (p.hidden.includes(a.id) || oppP.hidden.includes(b.id)) return { ok:false, error:"Hidden cannot be traded" };
      if (isProtected(p, a.id) || isProtected(oppP, b.id)) return { ok:false, error:"Protected cannot be traded" };
      const aHidden = p.hidden.includes(a.id), bHidden = oppP.hidden.includes(b.id);
      const aProt = p.protectedUntil[a.id], bProt = oppP.protectedUntil[b.id];
      p.towers[mi] = b; oppP.towers[oi] = a;
      delete p.protectedUntil[a.id]; delete oppP.protectedUntil[b.id];
      if (bProt !== undefined) p.protectedUntil[b.id] = bProt;
      if (aProt !== undefined) oppP.protectedUntil[a.id] = aProt;
      p.hidden = p.hidden.filter(i => i !== a.id);
      oppP.hidden = oppP.hidden.filter(i => i !== b.id);
      if (bHidden) p.hidden.push(b.id);
      if (aHidden) oppP.hidden.push(a.id);
      log(state, `Trade: ${a.name} ↔ ${b.name}`);
      return { ok:true };
    }
    case "Fuse": {
      const i1 = idxOf(p, action.i1), i2 = idxOf(p, action.i2);
      if (i1 < 0 || i2 < 0 || i1 === i2) return { ok:false, error:"Bad targets" };
      const a = p.towers[i1], b = p.towers[i2];
      if (isFarm(a) || isFarm(b)) return { ok:false, error:"Cannot fuse Farm" };
      if (towerTier(a.name) === "S" || towerTier(b.name) === "S") return { ok:false, error:"Both non-S required" };
      if (countS(p) >= 1) return { ok:false, error:"S-tier cap" };
      const want = action.want;
      if (!TOWERS.includes(want) || towerTier(want) !== "S") return { ok:false, error:"Must be S-tier" };
      if (!state.pool.includes(want)) return { ok:false, error:"Not in pool" };
      const hi = Math.max(i1, i2), lo = Math.min(i1, i2);
      removeTowerAt(p, hi); removeTowerAt(p, lo);
      state.removed[actor].push(a.name, b.name);
      state.pool = state.pool.filter(x => x !== want);
      addTower(p, want);
      state.pool = [...new Set([...state.pool, a.name, b.name])];
      log(state, `Fuse: ${a.name}+${b.name} → ${want}`);
      return { ok:true };
    }
    case "Haven": {
      p.towers.forEach(t => { if (!isFarm(t)) p.protectedUntil[t.id] = state.round + 1; });
      log(state, `Haven: all of ${p.name}'s towers protected this round`);
      return { ok:true };
    }
    case "Force": {
      if (state.draftType === "Close") return { ok:false, error:"Opening only" };
      if (!TOWERS.includes(target)) return { ok:false, error:"Unknown tower" };
      if (isFarm(target)) return { ok:false, error:"Farm untargetable" };
      if (!state.pool.includes(target)) return { ok:false, error:"Not in pool" };
      if (draftedCount(oppP) >= CAPS.towers) return { ok:false, error:"Opponent's draft complete" };
      if (oppP.towers.some(t => t.name === target)) return { ok:false, error:"Opponent already owns" };
      if (towerTier(target) === "S" && countS(oppP) >= 1) return { ok:false, error:"Opponent holds S-tier" };
      state.forcedPick = { by:actor, forSeat:opp, tower:target };
      log(state, `Force: ${oppP.name} must pick ${target}`);
      return { ok:true };
    }
    case "Evict": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap (already used a removal this match)" };
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const v = oppP.towers[idx];
      if (isFarm(v)) return { ok:false, error:"Farm untargetable" };
      if (isProtected(oppP, v.id) && oppP.markedId !== v.id) return { ok:false, error:"Protected" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Evict`); return { ok:true }; }
      removeTowerAt(oppP, idx);
      state.removed[opp].push(v.name);
      p.removedCount++;
      oppP.pendingReplacement++;
      log(state, `Evict: ${v.name} removed`);
      return { ok:true };
    }
    case "Disarm": {
      if (!oppP.rulings.length) return { ok:false, error:"Opponent has no rulings" };
      const i = randInt(oppP.rulings.length);
      const disc = oppP.rulings.splice(i, 1)[0];
      oppP.spent.push(disc);
      log(state, `Disarm: ${oppP.name} lost ${disc}`);
      return { ok:true };
    }
    case "Snatch": {
      if (!hasSlot(p)) return { ok:false, error:"No free slot" };
      const i = oppP.rulings.indexOf(target);
      if (i < 0) return { ok:false, error:"Not found" };
      const taken = oppP.rulings.splice(i, 1)[0];
      p.rulings.push(taken);
      log(state, `Snatch: ${p.name} took ${taken}`);
      return { ok:true };
    }
    case "Salvage": {
      if (!p.spent.length) return { ok:false, error:"No spent rulings" };
      if (p.rulings.length >= CAPS.slots) return { ok:false, error:"No free slot" };
      const back = p.spent.pop();
      p.rulings.push(back);
      log(state, `Salvage: recovered ${back}`);
      return { ok:true };
    }
    case "Extort": {
      if (!oppP.rulings.length) return { ok:false, error:"Opponent has no rulings" };
      const i = oppP.rulings.indexOf(target);
      if (i < 0) return { ok:false, error:"Not in opponent's hand" };
      const disc = oppP.rulings.splice(i, 1)[0];
      oppP.spent.push(disc);
      log(state, `Extort: ${oppP.name} lost ${disc}`);
      return { ok:true };
    }
    case "Jinx": {
      oppP.jinxed = true;
      log(state, `Jinx: ${oppP.name} is cursed`);
      return { ok:true };
    }
    case "Dictate": {
      if (!TOWERS.includes(target)) return { ok:false, error:"Unknown tower" };
      if (isFarm(target)) return { ok:false, error:"Farm untargetable" };
      if (!state.pool.includes(target)) return { ok:false, error:"Not in pool" };
      if (draftedCount(oppP) >= CAPS.towers) return { ok:false, error:"Opponent's draft complete" };
      if (oppP.towers.some(t => t.name === target)) return { ok:false, error:"Opponent already owns" };
      if (towerTier(target) === "S" && countS(oppP) >= 1) return { ok:false, error:"Opponent holds S-tier" };
      state.forcedPick = { by:actor, forSeat:opp, tower:target };
      log(state, `Dictate: ${p.name} will pick ${target} for ${oppP.name}`);
      return { ok:true };
    }
    case "Martyr": {
      if (p.martyred) return { ok:false, error:"Already martyred" };
      const idx = idxOf(p, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[idx])) return { ok:false, error:"Cannot martyr Farm" };
      const name = p.towers[idx].name;
      removeTowerAt(p, idx);
      p.martyred = true;
      p.towers.forEach(t => { p.protectedUntil[t.id] = -1; });
      log(state, `Martyr: ${name} given up — remaining towers protected`);
      return { ok:true };
    }
    case "Ban": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      if (!TOWERS.includes(target)) return { ok:false, error:"Unknown tower" };
      if (isFarm(target)) return { ok:false, error:"Farm untargetable" };
      if (state.poolBanned.includes(target)) return { ok:false, error:"Already banned" };
      state.poolBanned.push(target);
      state.pool = state.pool.filter(x => x !== target);
      p.removedCount++;
      log(state, `Ban: ${target} removed permanently`);
      return { ok:true };
    }
    case "Steal": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      const idx = idxOf(oppP, target);
      if (idx < 0) return { ok:false, error:"Bad target" };
      const v = oppP.towers[idx];
      if (isFarm(v)) return { ok:false, error:"Farm untargetable" };
      if (isProtected(oppP, v.id) && oppP.markedId !== v.id) return { ok:false, error:"Protected" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Steal`); return { ok:true }; }
      const taken = removeTowerAt(oppP, idx);
      state.pool = state.pool.filter(x => x !== taken.name);
      addTower(p, taken.name);
      p.removedCount++;
      oppP.pendingReplacement++;
      log(state, `Steal: ${taken.name}`);
      return { ok:true, meta:{ name: taken.name } };
    }
    case "Silence": {
      if (oppP.wardActive) {
        oppP.wardActive = false;
        log(state, `Ward blocked Silence`);
        return { ok:true };
      }
      oppP.lockedRulingsUntil = state.round + 1;
      log(state, `Silence: ${oppP.name} cannot use rulings`);
      return { ok:true };
    }
    case "Plunder": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      const idx = idxOf(oppP, action.stealId);
      if (idx < 0) return { ok:false, error:"Bad steal" };
      const v = oppP.towers[idx];
      if (isFarm(v)) return { ok:false, error:"Farm untargetable" };
      if (isProtected(oppP, v.id) && oppP.markedId !== v.id) return { ok:false, error:"Protected" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Plunder`); return { ok:true }; }
      const plantIdx = idxOf(p, action.plantId);
      if (plantIdx < 0) return { ok:false, error:"Bad plant" };
      const planted = p.towers[plantIdx];
      if (isFarm(planted)) return { ok:false, error:"Cannot plant Farm" };
      if (towerTier(planted.name) === "S") return { ok:false, error:"Cannot plant S-tier" };
      const stolen = removeTowerAt(oppP, idx);
      removeTowerAt(p, plantIdx);
      addTower(p, stolen.name);
      addTower(oppP, planted.name);
      state.pool = state.pool.filter(x => x !== stolen.name);
      p.removedCount++;
      log(state, `Plunder: ${p.name} took ${stolen.name}, planted ${planted.name}`);
      return { ok:true, meta:{ name: stolen.name } };
    }
    case "Veto": {
      if (!rulingUndo) return { ok:false, error:"Nothing to Veto" };
      const lr = state.lastRuling;
      if (!lr || lr.by === actor) return { ok:false, error:"No opponent ruling to Veto" };
      if (lr.warded) {
        log(state, `Veto blocked by Ward`);
        return { ok:true };
      }
      let prev;
      try { prev = JSON.parse(rulingUndo); } catch(e) { return { ok:false, error:"Veto unavailable" }; }
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, prev);
      log(state, `Veto cancelled ${lr.ruling}`);
      return { ok:true };
    }
    case "Pact": {
      let did = 0;
      ["P1","P2"].forEach(seat => {
        const pl = state.players[seat];
        if (!pl.rulings.length) return;
        let best = 0;
        pl.rulings.forEach((rr, i) => { if (RULINGS[rr].cost > RULINGS[pl.rulings[best]].cost) best = i; });
        const removed = pl.rulings.splice(best, 1)[0];
        pl.spent.push(removed);
        log(state, `Pact: ${pl.name} discarded ${removed}`);
        did++;
      });
      if (did === 0) return { ok:false, error:"Neither has unused rulings" };
      return { ok:true };
    }
    case "Clarity": {
      state.clarityActive = true;
      state.players.P1.hidden = [];
      state.players.P2.hidden = [];
      log(state, `Clarity: all hidden towers revealed`);
      return { ok:true };
    }
    case "Ascend": {
      const chosenIdx = idxOf(p, target);
      if (chosenIdx < 0) return { ok:false, error:"Bad target" };
      if (isFarm(p.towers[chosenIdx])) return { ok:false, error:"Cannot ascend Farm" };
      if (towerTier(p.towers[chosenIdx].name) === "S") return { ok:false, error:"Already S-tier" };
      const want = action.want;
      if (!TOWERS.includes(want) || towerTier(want) !== "S") return { ok:false, error:"Must be S-tier" };
      if (!state.pool.includes(want)) return { ok:false, error:"Not in pool" };
      if (countS(p) >= 1) return { ok:false, error:"S-tier cap" };
      const oldName = p.towers[chosenIdx].name;
      removeTowerAt(p, chosenIdx);
      state.pool = state.pool.filter(x => x !== want);
      state.pool = [...new Set([...state.pool, oldName])];
      addTower(p, want);
      log(state, `Ascend: ${oldName} → ${want}`);
      return { ok:true };
    }
    case "Doom": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Doom`); return { ok:true }; }
      let worstIdx = -1, worstTier = -1;
      oppP.towers.forEach((t, i) => {
        if (isFarm(t)) return;
        const rank = TIER_RANK[towerTier(t.name)] || 0;
        if (rank > worstTier) { worstTier = rank; worstIdx = i; }
      });
      if (worstIdx < 0) return { ok:false, error:"No target" };
      const name = oppP.towers[worstIdx].name;
      removeTowerAt(oppP, worstIdx);
      state.removed[opp].push(name);
      p.removedCount++;
      oppP.pendingReplacement++;
      log(state, `Doom: ${oppP.name} lost ${name}`);
      return { ok:true };
    }
    case "Ruin": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Ruin`); return { ok:true }; }
      const targets = oppP.towers
        .map((t, i) => ({ i, name:t.name, rank:TIER_RANK[towerTier(t.name)] || 0, farm:isFarm(t) }))
        .filter(x => !x.farm)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 2);
      if (!targets.length) return { ok:false, error:"No targets" };
      targets.sort((a, b) => b.i - a.i).forEach(t => {
        const removed = removeTowerAt(oppP, t.i);
        state.removed[opp].push(removed.name);
        oppP.pendingReplacement++;
      });
      p.removedCount++;
      log(state, `Ruin: ${oppP.name} lost ${targets.map(t => t.name).join(" and ")}`);
      return { ok:true };
    }
    case "Amnesty": {
      // The acting player's Amnesty is still in their hand right now.
      // Temporary slot cap bump for them so they regain to 3 post-Amnesty.
      ["P1","P2"].forEach(seat => {
        const pl = state.players[seat];
        const cap = (seat === actor) ? CAPS.slots + 1 : CAPS.slots;
        while (pl.spent.length && pl.rulings.length < cap) {
          pl.rulings.push(pl.spent.pop());
        }
      });
      log(state, `Amnesty: both players regained spent rulings`);
      return { ok:true };
    }
    case "Purge": {
      if (p.removedCount >= CAPS.removals) return { ok:false, error:"Removal cap" };
      if (oppP.riposteActive) { oppP.riposteActive = false; log(state, `Riposte negated Purge`); return { ok:true }; }
      const victims = oppP.towers.filter(t => !isFarm(t) && !isProtected(oppP, t.id));
      if (!victims.length) return { ok:false, error:"No unprotected towers" };
      victims.slice().reverse().forEach(v => {
        const idx = idxOf(oppP, v.id);
        if (idx < 0) return;
        removeTowerAt(oppP, idx);
        state.removed[opp].push(v.name);
        oppP.pendingReplacement++;
      });
      p.removedCount++;
      log(state, `Purge: ${oppP.name} lost ${victims.length} tower(s)`);
      return { ok:true };
    }
    default: return { ok:false, error:"Unhandled ruling" };
  }
}

function finalizeResults(state) {
  const p1 = state.players.P1.result, p2 = state.players.P2.result;
  state.phase = "final";
  state.reportDeadline = null;
  if (p1 === "tech" || p2 === "tech") { state.outcome = { type:"technical", winner:null }; return; }
  if (p1 === "win" && p2 === "loss") state.outcome = { type:"win", winner:"P1" };
  else if (p1 === "loss" && p2 === "win") state.outcome = { type:"win", winner:"P2" };
  else state.outcome = { type:"void", reason:"Players disagreed" };
}