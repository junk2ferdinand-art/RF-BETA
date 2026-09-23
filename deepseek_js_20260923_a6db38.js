"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = x => String(x).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
function sanitizeName(raw, fallback) {
  let n = String(raw == null ? "" : raw).replace(/[\u0000-\u001F\u007F<>`]/g, "").trim().slice(0,20).trim();
  return n || fallback;
}
function dedupeName(name, other) {
  if (name !== other) return name;
  return name.slice(0,17) + " (2)";
}
const now = () => Date.now();
const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2,"0")).join("");
const randInt = n => { if (n <= 0) return 0; const a = new Uint8Array(4); crypto.getRandomValues(a); return (((a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3])>>>0) % n; };
const sha256 = async s => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,"0")).join("");
};
function toast(msg, kind="") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("#toastRoot").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function modal(title, bodyHtml, actions=[]) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal"><div class="modal-inner"><h3>${esc(title)}</h3><div>${bodyHtml}</div><div style="margin-top:16px" id="modalActions"></div></div></div>`;
  const act = root.querySelector("#modalActions");
  actions.forEach(a => {
    const b = document.createElement("button");
    b.textContent = a.label;
    if (a.kind) b.className = a.kind;
    b.onclick = () => { a.onClick && a.onClick(); if (a.close !== false) root.innerHTML = ""; };
    act.appendChild(b);
  });
  root.querySelector(".modal").addEventListener("click", e => { if (e.target.classList.contains("modal")) root.innerHTML = ""; });
}

/* ===== CONSTANTS ===== */
const TIERS = {
  S: ["Commander","DJ","Railgunner","Zed","Golden Commando"],
  A: ["Marksman","Sniper","Shotgunner","Commando","Plasma Trooper","Red Sniper","Cryo-Gunner","Golden Scout","Sleeter","Phaser"],
  B: ["Mortar","Scarecrow","Anarchist","Fragger","Soldier","Tuber","Patrol","Enforcer","Barracks","Aviator","Flamethrower","Mercenary","Stunner","Huntsman","Tweeter","Graveyard","Snowballer","Harpoon Hunter","Patrioteer"],
  C: ["Scout","Knifer","Ice Cream","Archer","Hallowboomer","Red Scout","Elf"]
};
const FARM = "Farm";
const TOWERS = [...TIERS.S, ...TIERS.A, ...TIERS.B, ...TIERS.C];
const towerTier = t => t === FARM ? "F" : (Object.keys(TIERS).find(k => TIERS[k].includes(t)) || "C");
const TIER_RANK = { S:4, A:3, B:2, C:1, F:0 };
const isFarm = t => t === FARM || (t && t.name === FARM);

const RULINGS = {
  Pass:       { tier:"Easy",     cost:1, desc:"Skip the rest of your picks this turn; bank them for next turn." },
  Change:     { tier:"Easy",     cost:1, desc:"Replace one of your own towers (returns to the pool)." },
  Bounty:     { tier:"Easy",     cost:1, desc:"Reveal a hidden opponent tower OR refund one of your own spent rulings." },
  Peek:       { tier:"Easy",     cost:1, desc:"Secretly reveal one hidden opponent tower to yourself only." },
  Probe:      { tier:"Easy",     cost:2, desc:"Permanently reveal one hidden pick (opponent is notified)." },
  Hide:       { tier:"Easy",     cost:2, desc:"Conceal one of your picks. Max 2 hidden." },
  Turn:       { tier:"Easy",     cost:2, desc:"Take an extra pick immediately. Not in Close draft." },
  Delay:      { tier:"Easy",     cost:2, desc:"Halve opponent's next turn timer." },
  Mark:       { tier:"Easy",     cost:2, desc:"Strip hidden and protection from one opponent tower this round." },
  Fracture:   { tier:"Easy",     cost:2, desc:"Crack one of your S-tier towers down to A-tier, freeing your S-slot." },
  Revive:     { tier:"Easy",     cost:2, desc:"Return a banned tower to the pool." },
  Shift:      { tier:"Moderate", cost:3, desc:"Swap one of your towers for a different tower of the same tier." },
  Cloak:      { tier:"Moderate", cost:3, desc:"Conceal one pick silently — opponent sees no log." },
  Rebel:      { tier:"Moderate", cost:3, desc:"Reverse opponent's most recent Steal." },
  Recall:     { tier:"Moderate", cost:3, desc:"Recover any evicted tower you don't currently own." },
  Mirror:     { tier:"Moderate", cost:3, desc:"Copy opponent's most recent pick if still in pool." },
  Ward:       { tier:"Moderate", cost:3, desc:"Your next ruling cannot be Veto'd or Silenced." },
  Anchor:     { tier:"Moderate", cost:4, desc:"Permanently protect one tower. Max 2 protected." },
  Split:      { tier:"Moderate", cost:4, desc:"Split one S-tier tower into two A/B/C-tier towers." },
  Duplicate:  { tier:"Moderate", cost:4, desc:"Copy one of your own non-S towers (must still be in pool)." },
  Echo:       { tier:"Moderate", cost:4, desc:"Copy the effect of your own last-used ruling." },
  Freeze:     { tier:"Moderate", cost:4, desc:"Block a ruling type for 1 round. Close draft only." },
  Secure:     { tier:"Moderate", cost:4, desc:"Protect one tower from removal for 2 rounds." },
  Riposte:    { tier:"Moderate", cost:4, desc:"Negate the next removal ruling against you this round." },
  Inspect:    { tier:"Moderate", cost:4, desc:"Permanently reveal all opponent hidden towers. They cannot hide again." },
  Graft:      { tier:"Hard",     cost:5, desc:"Copy last ruling used by anyone. Not Graft-on-Graft, not Veto." },
  Trade:      { tier:"Hard",     cost:5, desc:"Swap a non-hidden unprotected tower for a known opponent tower." },
  Fuse:       { tier:"Hard",     cost:5, desc:"Merge two of your non-S towers into one S-tier. Max 1." },
  Haven:      { tier:"Hard",     cost:5, desc:"Shield every tower you own from removal this round." },
  Force:      { tier:"Hard",     cost:5, desc:"Force opponent's next pick to a specific tower. Open only." },
  Evict:      { tier:"Hard",     cost:5, desc:"Remove a known tower. Counts toward removal cap." },
  Disarm:     { tier:"Hard",     cost:5, desc:"Opponent discards a random unused ruling." },
  Snatch:     { tier:"Hard",     cost:5, desc:"Take one unused ruling from opponent." },
  Salvage:    { tier:"Hard",     cost:5, desc:"Refund one of your own spent ruling uses." },
  Extort:     { tier:"Hard",     cost:5, desc:"Look at opponent's hand and force them to discard a ruling you choose." },
  Jinx:       { tier:"Hard",     cost:5, desc:"Curse: opponent discards a random ruling whenever they use one." },
  Dictate:    { tier:"Hard",     cost:5, desc:"Choose opponent's next pick for them (any legal tower)." },
  Martyr:     { tier:"Hard",     cost:6, desc:"Give up one tower to permanently protect all others. Max 1." },
  Ban:        { tier:"Hard",     cost:6, desc:"Remove a tower from pool permanently. Max 1. Uses removal cap." },
  Steal:      { tier:"Hard",     cost:6, desc:"Take opponent's known tower. Uses removal cap." },
  Silence:    { tier:"Hard",     cost:6, desc:"Opponent cannot use rulings on their next turn. Max 1." },
  Plunder:    { tier:"Hard",     cost:6, desc:"Steal a known opponent tower AND plant a non-S tower of yours into their loadout." },
  Veto:       { tier:"Hard",     cost:6, desc:"Cancel an opponent ruling. Cannot be Veto'd. Max 1." },
  Pact:       { tier:"Hard",     cost:6, desc:"Both players discard their highest-cost unused ruling." },
  Clarity:    { tier:"Hard",     cost:6, desc:"All hidden towers become visible for the rest of the match." },
  Ascend:     { tier:"Insane",   cost:7, desc:"Transform your lowest-tier tower into any S-tier still in pool." },
  Doom:       { tier:"Insane",   cost:7, desc:"Opponent immediately loses their highest-tier tower." },
  Ruin:       { tier:"Insane",   cost:8, desc:"Opponent loses their two highest-tier towers." },
  Amnesty:    { tier:"Insane",   cost:8, desc:"Both players regain their spent rulings up to their 3-slot cap." },
  Purge:      { tier:"Insane",   cost:8, desc:"Opponent loses every unprotected non-Farm tower. They may re-pick." }
};
const RULING_ORDER = Object.keys(RULINGS);
const CAPS = {
  points:15, slots:3, towers:4, removals:1, protected:2, hidden:2,
  veto:1, ban:1, martyr:1, silence:1, doom:1, pact:1, fuse:1, split:1,
  ascend:1, ruin:1, amnesty:1, purge:1, jinx:1, echo:1, haven:1
};
const RENAME_MAP = {
  Downgrade:"Fracture", Blight:"Jinx",    Sanctuary:"Haven", Lockdown:"Silence",
  Oblivion:"Ruin",      Cataclysm:"Amnesty", Apocalypse:"Purge",
  Subvert:"Dictate",    Transmute:"Shift", Redirect:"Salvage", Sabotage:"Disarm",
  Sacrifice:"Martyr",   Morph:"Shift",     Usurp:"Dictate",    Reclaim:"Salvage",
  Rearm:"Salvage",      Hex:"Jinx"
};
const STARTER_BUILDS = [
  { name:"Sentinel (Defense)",  rulings:["Anchor","Haven","Riposte"] },
  { name:"Assassin (Removal)",  rulings:["Evict","Silence","Mark"] },
  { name:"Oracle (Info)",       rulings:["Peek","Inspect","Anchor"] },
  { name:"Banker (Economy)",    rulings:["Salvage","Amnesty","Fracture"] },
  { name:"Puppeteer (Control)", rulings:["Silence","Dictate","Delay"] },
  { name:"Nuke (Burst)",        rulings:["Purge","Haven","Fracture"] }
];
const EMOTES = ["😍","🥺","🤣","😭","🤨","😈","🤮","😠","😇","😨","🥵","😎","😱"];

const RANKS = [
  { name:"Bronze",min:0,max:999,icon:"🥉" },
  { name:"Silver",min:1000,max:1499,icon:"🥈" },
  { name:"Gold",min:1500,max:1999,icon:"🥇" },
  { name:"Platinum",min:2000,max:2499,icon:"💎" },
  { name:"Diamond",min:2500,max:2999,icon:"💠" },
  { name:"Master",min:3000,max:3499,icon:"👑" },
  { name:"Challenger",min:3500,max:999999,icon:"🔥" }
];
const getRank = mmr => RANKS.find(r => mmr >= r.min && mmr <= r.max) || RANKS[0];

/* ===== PERSISTENCE ===== */
const Store = {
  KEY: "rf_1_0_",
  get(k, fb) { try { const v = localStorage.getItem(this.KEY + k); return v ? JSON.parse(v) : fb; } catch(e) { return fb; } },
  set(k, v) { try { localStorage.setItem(this.KEY + k, JSON.stringify(v)); } catch(e){} }
};
const Player = {
  load() {
    const p = Store.get("player", null);
    const def = { v:1,
      offline:{wins:0,losses:0,techVoid:0,matches:0},
      online:{wins:0,losses:0,techVoid:0,matches:0,mmr:1000,peakMmr:1000,streak:0,bestStreak:0,placementsLeft:10} };
    if (!p || p.v !== 1) return def;
    return { ...def, ...p, offline:{...def.offline,...p.offline}, online:{...def.online,...p.online} };
  },
  save(p) { p.v = 1; Store.set("player", p); },
  reset() {
    const def = { v:1,
      offline:{wins:0,losses:0,techVoid:0,matches:0},
      online:{wins:0,losses:0,techVoid:0,matches:0,mmr:1000,peakMmr:1000,streak:0,bestStreak:0,placementsLeft:10} };
    this.save(def); return def;
  },
  record(mode, result, oppMmr = 1000) {
    const p = this.load();
    const bucket = mode === "online" ? p.online : p.offline;
    let delta = 0, before = null, after = null, beforeTier = null, afterTier = null, promoted = false, demoted = false;
    if (result === "void") { this.save(p); return { mode, delta:0, before:null, after:null, beforeTier:null, afterTier:null, promoted:false, demoted:false }; }
    bucket.matches++;
    if (result === "win" || result === "loss") {
      bucket[result === "win" ? "wins" : "losses"]++;
      if (mode === "online") {
        before = bucket.mmr; beforeTier = getRank(before).name;
        const expected = 1 / (1 + Math.pow(10, (oppMmr - bucket.mmr) / 400));
        let K = 32; if (bucket.matches < 10) K = 40; else if (bucket.matches > 50) K = 24;
        delta = result === "win" ? Math.round(K*(1-expected)) : Math.round(K*(0-expected));
        bucket.mmr = Math.max(0, bucket.mmr + delta);
        bucket.peakMmr = Math.max(bucket.peakMmr, bucket.mmr);
        after = bucket.mmr; afterTier = getRank(after).name;
        promoted = afterTier !== beforeTier && after > before;
        demoted = afterTier !== beforeTier && after < before;
        if (result === "win") { bucket.streak++; bucket.bestStreak = Math.max(bucket.bestStreak, bucket.streak); }
        else bucket.streak = 0;
        if (bucket.placementsLeft > 0) bucket.placementsLeft--;
      }
    } else bucket.techVoid++;
    this.save(p);
    return { mode, delta, before, after, beforeTier, afterTier, promoted, demoted };
  }
};
const Builds = {
  load() {
    const b = Store.get("builds", []);
    if (!Array.isArray(b)) return [];
    return b.map(build => ({
      ...build,
      rulings: Array.isArray(build.rulings) ? build.rulings.map(r => RENAME_MAP[r] || r) : []
    }));
  },
  save(b) { Store.set("builds", b.slice(0, 50)); },
  add(name, rulings) { const b = this.load(); b.unshift({ id:now(), name:String(name).slice(0,30), rulings }); this.save(b); },
  validate(build) {
    if (!build || !Array.isArray(build.rulings)) return { ok:false, reason:"Malformed" };
    let cost = 0; const seen = {};
    for (let r of build.rulings) {
      r = RENAME_MAP[r] || r;
      if (!RULINGS[r]) return { ok:false, reason:"Unknown ruling " + r };
      cost += RULINGS[r].cost;
      seen[r] = (seen[r] || 0) + 1;
    }
    if (cost > CAPS.points) return { ok:false, reason:"Cost " + cost + " > " + CAPS.points };
    if (build.rulings.length > CAPS.slots) return { ok:false, reason:"Slots exceeded" };
    const capped = ["Veto","Ban","Martyr","Silence","Doom","Pact","Fuse","Split","Ascend","Ruin","Amnesty","Purge","Jinx","Echo","Haven"];
    for (const r of capped) {
      if (seen[r] > (CAPS[r.toLowerCase()] || 1)) return { ok:false, reason:`Too many ${r}` };
    }
    return { ok:true, cost };
  }
};

/* ===== GAME STATE ===== */
const G = { state:null, view:null, isHost:false, mySeat:"P1", peer:null, conn:null, roomCode:null };
let lastRecordedMatch = null;
let rulingUndo = null;
let TOWER_UID = 1;

const mkTower = name => ({ id: TOWER_UID++, name });
const towerNames = p => p.towers.map(t => t.name);
const idxOf = (p, id) => p.towers.findIndex(t => t.id === Number(id));
const draftedCount = p => p.towers.filter(t => !isFarm(t)).length;
function addTower(p, name) { const t = mkTower(name); p.towers.push(t); return t; }
function removeTowerAt(p, idx) {
  const t = p.towers[idx];
  if (!t) return null;
  p.towers.splice(idx, 1);
  const id = t.id;
  p.hidden = p.hidden.filter(x => x !== id);
  p.probed = p.probed.filter(x => x !== id);
  p.downgradedS = p.downgradedS.filter(x => x !== id);
  delete p.protectedUntil[id];
  if (p.markedId === id) p.markedId = null;
  return t;
}
function emptyPlayer(name) {
  return {
    name: name || "Player", rulings: [], spent: [], towers: [],
    hidden: [], probed: [], downgradedS: [], protectedUntil: {},
    ready:false, locked:false, result:null,
    removedCount:0, martyred:false, pendingReplacement:0,
    riposteActive:false, wardActive:false, lockedRulingsUntil:0,
    markedId:null, timerHalved:false, bonusPicks:0, passBank:0,
    frozenUntil:0, frozenType:null, jinxed:false, inspected:false,
    forcedPickBlocked:false
  };
}
function newState({ draftType="Open", mode="offline", p1name="Blue", p2name="Red" }={}) {
  return {
    v:1, matchId:randHex(3).toUpperCase(), phase:"coin", mode, draftType,
    players:{ P1:emptyPlayer(p1name), P2:emptyPlayer(p2name) },
    turn:"P1", firstPicker:null,
    picksThisTurn:0, picksPerTurn: draftType === "Close" ? 2 : 1,
    round:1,
    coin:{ commits:{}, reveals:{}, winner:null },
    removed:{ P1:[], P2:[] }, poolBanned:[], pool:[...TOWERS],
    log:[], chat:[], startedAt:now(), lastActionAt:now(),
    lastRuling:null, lastPick:null, clarityActive:false, forcedPick:null,
    privateReveals:{ P1:[], P2:[] }, rulingsRevealed:{ P1:false, P2:false },
    reportDeadline:null
  };
}
function log(state, msg) { state.log.push({ t:now(), msg:String(msg).slice(0,300) }); }
function redactFor(state, seat) {
  const s = JSON.parse(JSON.stringify(state));
  const oppSeat = seat === "P1" ? "P2" : "P1";
  const o = s.players[oppSeat];
  const rulingsVisible = (state.phase === "reveal") || state.rulingsRevealed?.[seat];
  if (!rulingsVisible) o.rulings = [];
  if (state.clarityActive || (state.players[oppSeat] && state.players[oppSeat].inspected)) {
    o.hidden = [];
  } else {
    const hid = o.hidden.slice();
    const peeked = state.privateReveals?.[seat] || [];
    o.towers = o.towers.map(t => peeked.includes(t.id) ? t : (hid.includes(t.id) ? { id:t.id, name:null } : t));
    o.hidden = [];
  }
  s.privateReveals = { [seat]: state.privateReveals?.[seat] || [] };
  return s;
}
function countS(p) { return p.towers.filter(t => towerTier(t.name) === "S" && !p.downgradedS.includes(t.id)).length; }
function canAfford(p, r) { return p.rulings.reduce((s,x) => s + RULINGS[x].cost, 0) + RULINGS[r].cost <= CAPS.points; }
function hasSlot(p) { return p.rulings.length < CAPS.slots; }
function countRuling(p, r) { return p.rulings.filter(x => x === r).length; }
function isProtected(p, id) { const v = p.protectedUntil[id]; if (v === undefined) return false; if (v === -1) return true; return v >= 0; }