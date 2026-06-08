import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOBUFf4X5dn6rdA5dD0wnLcldu9zD8A_U",
  authDomain: "vie-dublin.firebaseapp.com",
  projectId: "vie-dublin",
  storageBucket: "vie-dublin.firebasestorage.app",
  messagingSenderId: "194857816429",
  appId: "1:194857816429:web:9d000edc01748781900a64"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// === CONSTANTES ===
const VIE_MEMBERS = ["Lucas", "Léo", "Matoub", "Benjamin", "Crystal", "Emma", "Margaux", "Naissata", "Romane", "Halimatou"];

const ACTIVITY_TYPES = [
  { id: "picnic",     label: "Pique-nique",    emoji: "🧺" },
  { id: "beach",      label: "Plage / Côte",   emoji: "🌊" },
  { id: "hike",       label: "Randonnée",       emoji: "🥾" },
  { id: "restaurant", label: "Restaurant/Bar", emoji: "🍺" },
  { id: "sport",      label: "Sport",           emoji: "⚽" },
  { id: "culture",    label: "Culture/Musée",  emoji: "🎨" },
  { id: "trip",       label: "Week-end trip",  emoji: "🚗" },
  { id: "other",      label: "Autre",           emoji: "✨" },
];

const SLOT_TYPES = [
  { id: "weekend", label: "Week-end entier (Sam+Dim)", days: [6, 0] },
  { id: "saturday", label: "Samedi seulement", days: [6] },
  { id: "sunday", label: "Dimanche seulement", days: [0] },
  { id: "weekday", label: "Jour de semaine (Lun–Ven)", days: [1,2,3,4,5] },
];

const STATUS = {
  available:   { label: "Dispo",     color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)"  },
  maybe:       { label: "Peut-être", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)" },
  unavailable: { label: "Pas dispo", color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.4)"  },
  unknown:     { label: "?",         color: "#475569", bg: "rgba(71,85,105,0.15)",   border: "rgba(71,85,105,0.2)"  },
};

const INTEREST = {
  yes:   { label: "Je viens !",   emoji: "🙋", color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)"  },
  maybe: { label: "Peut-être",    emoji: "🤔", color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)" },
  no:    { label: "Pas pour moi", emoji: "👋", color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.4)"  },
};

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// === HELPERS ===
function getDaysInMonth(year, month) {
  const days = [], d = new Date(year, month, 1);
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}

function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

// === DUBLIN TIMEZONE HELPERS ===
function getDublinDate() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Europe/Dublin" }));
}

function isTodayDublin(d) {
  const today = getDublinDate();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
}

function isPastDublin(d) {
  const today = getDublinDate();
  const dd = new Date(d); dd.setHours(0,0,0,0);
  const t = new Date(today); t.setHours(0,0,0,0);
  return dd < t;
}

function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function formatDate(d) { return d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}); }
function formatDateShort(d) { return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"}); }
function formatMonthYear(y,m) { return new Date(y,m,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}); }

function getUpcomingSlots(slotType, nSlots=16) {
  const st = SLOT_TYPES.find(s=>s.id===slotType)||SLOT_TYPES[0];
  const slots = [];
  const today = getDublinDate(); 
  today.setHours(0,0,0,0);
  const d = new Date(today); 
  let found = 0;

  while (found < nSlots) {
    const dow = d.getDay();
    if (st.days.includes(dow)) {
      if (slotType === "weekend") {
        const sat = dow === 6 ? new Date(d) : new Date(d.getTime() - 86400000);
        const sun = new Date(sat.getTime() + 86400000);
        const satKey = dateKey(sat);
        if (!slots.find(s => s.satKey === satKey)) {
          slots.push({
            label: `Sam ${formatDateShort(sat)} – Dim ${formatDateShort(sun)}`,
            keys: [dateKey(sat), dateKey(sun)],
            sat,
            sun
          });
          found++;
        }
      } else {
        slots.push({label: formatDate(d), keys: [dateKey(d)], date: new Date(d)});
        found++;
      }
    }
    d.setDate(d.getDate() + 1);
    if (d.getTime() - today.getTime() > 200*24*60*60*1000) break;
  }
  return slots;
}

export default function App() {
  const now = new Date();
  const [currentUser, setCurrentUser] = useState(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState("calendar");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState([]);
  const [singleDay, setSingleDay] = useState(null);

  const [availabilities, setAvailabilities] = useState({});
  const [events, setEvents] = useState([]);
  const [polls, setPolls] = useState([]);

  const [newEvent, setNewEvent] = useState({ title:"", type:"picnic", dateKey:"", description:"" });
  const [showEventForm, setShowEventForm] = useState(false);

  const [showPollForm, setShowPollForm] = useState(false);
  const [newPoll, setNewPoll] = useState({ title:"", type:"trip", slotType:"weekend", description:"" });
  const [expandedPoll, setExpandedPoll] = useState(null);
  const [pollVotersOpen, setPollVotersOpen] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Real-time Firebase
  useEffect(() => {
    const unsubA = onSnapshot(collection(db, "availabilities"), (snap) => {
      const data = {};
      snap.forEach(d => data[d.id] = d.data());
      setAvailabilities(data);
    });

    const unsubE = onSnapshot(collection(db, "events"), (snap) => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const cutoff = new Date(); 
      cutoff.setDate(cutoff.getDate() - 3);
      list = list.filter(ev => new Date(ev.dateKey) >= cutoff);
      setEvents(list);
    });

    const unsubP = onSnapshot(collection(db, "polls"), (snap) => {
      setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubA(); unsubE(); unsubP(); };
  }, []);

  // Auto-advance month based on Dublin time
  useEffect(() => {
    const checkCurrentMonth = () => {
      const realNow = getDublinDate();
      const realYear = realNow.getFullYear();
      const realMonth = realNow.getMonth();

      if (realYear !== year || realMonth !== month) {
        const monthsDiff = (realYear - year) * 12 + (realMonth - month);
        if (monthsDiff >= 0 && monthsDiff <= 2) {
          setYear(realYear);
          setMonth(realMonth);
        }
      }
    };

    checkCurrentMonth();
    const interval = setInterval(checkCurrentMonth, 600000);
    return () => clearInterval(interval);
  }, [year, month]);

  // === CALENDAR DATA ===
  const days = getDaysInMonth(year, month);
  const firstDow = days.length ? (days[0].getDay() + 6) % 7 : 0;

  const getAvail = (dk, member) => availabilities[dk]?.[member] || "unknown";
  const countAvail = (dk) => VIE_MEMBERS.filter(m => getAvail(dk, m) === "available").length;

  // === BEST SLOTS ===
  const getBestSlots = (poll) => {
    if (poll.fixedDate) {
      const fixedSlot = getUpcomingSlots(poll.slotType || "weekend", 30)
        .find(s => s.label === poll.fixedDate);
      return fixedSlot ? [{ ...fixedSlot, allAvail: 999, score: 999, total: 1 }] : [];
    }

    const interested = Object.entries(poll.votes||{})
      .filter(([,v]) => v === "yes" || v === "maybe")
      .map(([m]) => m);

    if (interested.length === 0) return [];

    const slots = getUpcomingSlots(poll.slotType || "weekend", 16);
    return slots.map(slot => {
      let allAvail = 0;
      interested.forEach(m => {
        const allDays = slot.keys.every(dk => getAvail(dk, m) === "available");
        if (allDays) allAvail++;
      });
      return { ...slot, allAvail, score: allAvail, total: interested.length };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  };

  // === SAVE FUNCTIONS ===
  const setAvailability = async (dk, status) => {
    if (!currentUser) return;
    await setDoc(doc(db, "availabilities", dk), {
      ...(availabilities[dk] || {}),
      [currentUser]: status
    }, { merge: true });
  };

  const applyBulk = async (status) => {
    if (!currentUser || selectedDays.length === 0) return;
    const allHaveThisStatus = selectedDays.every(dk => getAvail(dk, currentUser) === status);
    const newStatus = allHaveThisStatus ? "unknown" : status;

    await Promise.all(
      selectedDays.map(dk =>
        setDoc(doc(db, "availabilities", dk), {
          ...(availabilities[dk] || {}),
          [currentUser]: newStatus
        }, { merge: true })
      )
    );
    setSelectMode(false);
    setSelectedDays([]);
  };

  const addEvent = async () => {
    if (!newEvent.title || !newEvent.dateKey) return;
    await addDoc(collection(db, "events"), {
      ...newEvent,
      createdBy: currentUser,
      participants: []
    });
    setShowEventForm(false);
    setNewEvent({title:"", type:"picnic", dateKey:"", description:""});
  };

  const toggleParticipant = async (eventId) => {
    if (!currentUser) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const p = event.participants || [];
    const newP = p.includes(currentUser) ? p.filter(x => x !== currentUser) : [...p, currentUser];
    await updateDoc(doc(db, "events", eventId), { participants: newP });
  };

  const addPoll = async () => {
    if (!newPoll.title) return;
    await addDoc(collection(db, "polls"), {
      ...newPoll,
      createdBy: currentUser,
      votes: {},
      fixedDate: null
    });
    setShowPollForm(false);
    setNewPoll({title:"", type:"trip", slotType:"weekend", description:""});
  };

  const votePoll = async (pollId, interest) => {
    if (!currentUser) return;
    await updateDoc(doc(db, "polls", pollId), { [`votes.${currentUser}`]: interest });
  };

  const fixPollDate = async (pollId, label) => {
    await updateDoc(doc(db, "polls", pollId), { fixedDate: label });
  };

  const deletePoll = async (pollId) => {
    await deleteDoc(doc(db, "polls", pollId));
    setConfirmDelete(null);
    setExpandedPoll(null);
    setPollVotersOpen(null);
  };

  const deleteEvent = async (eventId) => {
    await deleteDoc(doc(db, "events", eventId));
    setConfirmDelete(null);
    if (singleDay) {
      const remaining = events.filter(e => e.id !== eventId && e.dateKey === singleDay);
      if (remaining.length === 0) setSingleDay(null);
    }
  };

  // === CALENDAR ACTIONS ===
  const prevMonth = () => {
    setSelectMode(false); setSelectedDays([]); setSingleDay(null);
    if (month === 0) { setYear(y => y - 1); setMonth(11); } 
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    setSelectMode(false); setSelectedDays([]); setSingleDay(null);
    if (month === 11) { setYear(y => y + 1); setMonth(0); } 
    else setMonth(m => m + 1);
  };

  const enterSelectMode = () => { setSelectMode(true); setSelectedDays([]); setSingleDay(null); };
  const exitSelectMode = () => { setSelectMode(false); setSelectedDays([]); };

  const toggleDaySelect = (dk) => {
    setSelectedDays(prev => prev.includes(dk) ? prev.filter(x => x !== dk) : [...prev, dk]);
  };

  const selectAllMonth = () => setSelectedDays(days.filter(d => !isPastDublin(d) || isTodayDublin(d)).map(dateKey));
  const selectWeekends = () => setSelectedDays(days.filter(d => (!isPastDublin(d) || isTodayDublin(d)) && isWeekend(d)).map(dateKey));
  const selectWeekdays = () => setSelectedDays(days.filter(d => (!isPastDublin(d) || isTodayDublin(d)) && !isWeekend(d)).map(dateKey));

  const singleDayDate = singleDay ? new Date(singleDay + "T12:00:00") : null;
  const selDayEvents = events.filter(e => e.dateKey === singleDay);

  const inputStyle = { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"10px 14px", color:"#fff", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" };
  const selectStyle = { ...inputStyle, background:"#1e293b" };

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif" }}>
        <div style={{ background:"rgba(255,255,255,0.04)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:"48px 40px", maxWidth:480, width:"90%", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🍀</div>
          <h1 style={{ color:"#fff", fontSize:26, fontWeight:700, marginBottom:4 }}>VIE Dublin</h1>
          <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, marginBottom:36 }}>Calendrier partagé · Dublin</p>
          <p style={{ color:"rgba(255,255,255,0.7)", fontSize:13, marginBottom:20 }}>Qui es-tu ?</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {VIE_MEMBERS.map(m => (
              <button key={m} onClick={() => setCurrentUser(m)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, padding:"12px 16px", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:500 }}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }


    // MAIN UI - Full original
    return (
      <div style={{ minHeight:"100vh", background:"#0f172a", fontFamily:"sans-serif", color:"#e2e8f0" }}>
  
        {/* Header */}
        <div style={{ background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:20, backdropFilter:"blur(12px)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:22 }}>🍀</span>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"#fff" }}>VIE Dublin</div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>Synchronisé Firebase</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ background:"linear-gradient(135deg,#3b82f6,#06b6d4)", borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:600, color:"#fff" }}>👤 {currentUser}</div>
            <button onClick={()=>setShowHelp(true)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:13 }}>?</button>
            <button onClick={()=>setCurrentUser(null)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"5px 10px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:11 }}>Changer</button>
          </div>
        </div>
  
        {/* Nav */}
        <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"0 20px", overflowX:"auto" }}>
          {[["calendar","📅 Calendrier"],["events","🎉 Activités"],["polls","🗳️ Trouver un créneau"]].map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} style={{ background:"none", border:"none", borderBottom:view===v?"2px solid #3b82f6":"2px solid transparent", padding:"12px 16px", color:view===v?"#3b82f6":"rgba(255,255,255,0.45)", cursor:"pointer", fontWeight:view===v?700:400, fontSize:13, whiteSpace:"nowrap" }}>{label}</button>
          ))}
        </div>
  
        <div style={{ display:"flex", flexDirection:"column", minHeight:"calc(100vh - 101px)", overflowY:"auto" }}>
  
          {/* CALENDAR */}
          {view==="calendar" && (<>
          <div style={{ padding:"16px 16px 0" }}>

            {/* Month nav */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <button onClick={prevMonth} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"7px 14px", color:"#fff", cursor:"pointer", fontSize:16 }}>‹</button>
              <h2 style={{ fontSize:17, fontWeight:700, color:"#fff", textTransform:"capitalize" }}>{formatMonthYear(year,month)}</h2>
              <button onClick={nextMonth} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"7px 14px", color:"#fff", cursor:"pointer", fontSize:16 }}>›</button>
            </div>

            {/* Toolbar: Sélectionner / Annuler + quick select */}
            <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
              {!selectMode
                ? <button onClick={enterSelectMode} style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.35)", borderRadius:20, padding:"6px 16px", color:"#a5b4fc", cursor:"pointer", fontSize:12, fontWeight:600 }}>Sélectionner</button>
                : <>
                    <button onClick={exitSelectMode} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:20, padding:"6px 16px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:12 }}>Annuler</button>
                    <button onClick={selectAllMonth} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"6px 14px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:11 }}>Tout le mois</button>
                    <button onClick={selectWeekends} style={{ background:"rgba(96,165,250,0.1)", border:"1px solid rgba(96,165,250,0.25)", borderRadius:20, padding:"6px 14px", color:"#93c5fd", cursor:"pointer", fontSize:11 }}>Week-ends</button>
                    <button onClick={selectWeekdays} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"6px 14px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:11 }}>Semaine</button>
                  </>
              }
            </div>

            {/* Legend */}
            <div style={{ display:"flex", gap:12, marginBottom:12, flexWrap:"wrap" }}>
              {Object.entries(STATUS).map(([k,v])=>(
                <div key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:v.bg, border:`1.5px solid ${v.border}` }}/>
                  <span style={{ color:"rgba(255,255,255,0.5)" }}>{v.label}</span>
                </div>
              ))}
            </div>

            {/* Day headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
              {DAY_NAMES.map(d=><div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:(d==="Sam"||d==="Dim")?"#60a5fa":"rgba(255,255,255,0.35)", padding:"4px 0" }}>{d}</div>)}
            </div>

            {/* Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array.from({length:firstDow}).map((_,i)=><div key={`pad${i}`}/>)}
              {days.map(day=>{
                const dk      = dateKey(day);
                const dow     = (day.getDay()+6)%7;
                const weekend = dow>=5;
                const today   = isTodayDublin(day);
                const past    = isPastDublin(day) && !isTodayDublin(day);
                const myStatus= getAvail(dk,currentUser);
                const avCount = countAvail(dk);
                const hasEv   = events.some(e=>e.dateKey===dk);
                const isMSel  = selectMode && selectedDays.includes(dk);
                const is1Sel  = !selectMode && singleDay===dk;

                function handleClick() {
                  if (past) return;
                  if (selectMode) { toggleDaySelect(dk); }
                  else { setSingleDay(prev => prev===dk ? null : dk); }
                }

                return (
                  <div key={dk} onClick={handleClick} style={{
                    borderRadius:10, padding:"6px 5px", cursor:past?"default":"pointer",
                    minHeight:62, display:"flex", flexDirection:"column", gap:3, position:"relative",
                    background: isMSel?"rgba(99,102,241,0.25)": is1Sel?"rgba(59,130,246,0.25)": weekend?"rgba(96,165,250,0.06)":"rgba(255,255,255,0.03)",
                    border: isMSel?`1.5px solid #818cf8`: is1Sel?"1.5px solid #3b82f6": today?"1.5px solid rgba(59,130,246,0.5)":"1px solid rgba(255,255,255,0.06)",
                    opacity:past?0.35:1, transition:"background 0.1s, border 0.1s",
                    userSelect:"none"
                  }}>
                    {selectMode && !past && (
                      <div style={{ position:"absolute", top:4, right:4, width:14, height:14, borderRadius:"50%", border:`2px solid ${isMSel?"#818cf8":"rgba(255,255,255,0.3)"}`, background:isMSel?"#818cf8":"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {isMSel && <span style={{ color:"#fff", fontSize:9, lineHeight:1 }}>✓</span>}
                      </div>
                    )}
                    <div style={{ fontSize:12, fontWeight:today?800:600, color:today?"#60a5fa":weekend?"#93c5fd":"#e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>{day.getDate()}</span>
                      {hasEv&&!selectMode&&<span style={{ fontSize:8 }}>🎉</span>}
                    </div>
                    <div style={{ height:3, borderRadius:2, background:myStatus==="unknown"?"rgba(255,255,255,0.1)":STATUS[myStatus].color, opacity:myStatus==="unknown"?0.4:1 }}/>
                    {avCount>0&&<div style={{ fontSize:9, color:"#4ade80", fontWeight:700, background:"rgba(34,197,94,0.12)", borderRadius:4, padding:"1px 3px", textAlign:"center" }}>{avCount}/{VIE_MEMBERS.length}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom bar — slim hint while selecting, full actions only after selection */}
          {selectMode && (
            <div style={{ position:"sticky", bottom:0, zIndex:10, background:"rgba(15,23,42,0.97)", borderTop:"1px solid rgba(99,102,241,0.3)" }}>
              {selectedDays.length === 0 ? (
                /* No selection yet: just a thin hint line */
                <div style={{ padding:"8px 16px", textAlign:"center" }}>
                  <span style={{ fontSize:11, color:"rgba(165,180,252,0.7)" }}>Tape sur les jours pour les sélectionner</span>
                </div>
              ) : (
                /* Days selected: show count + 3 action buttons */
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:12, color:"#a5b4fc", fontWeight:600 }}>{selectedDays.length} jour{selectedDays.length>1?"s":""} sélectionné{selectedDays.length>1?"s":""}</span>
                    <button onClick={()=>setSelectedDays([])} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:11 }}>Tout désélectionner</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  {["available","maybe","unavailable"].map(s => {
  const isActive = selectedDays.length > 0 && 
    selectedDays.every(dk => getAvail(dk, currentUser) === s);

  return (
    <button 
      key={s} 
      onClick={() => applyBulk(s)} 
      style={{ 
        background: isActive ? "rgba(255,255,255,0.1)" : STATUS[s].bg, 
        border: `1.5px solid ${isActive ? "rgba(255,255,255,0.4)" : STATUS[s].border}`, 
        borderRadius:10, 
        padding:"8px 4px", 
        color: isActive ? "#e2e8f0" : STATUS[s].color, 
        cursor:"pointer", 
        fontSize:12, 
        fontWeight:700, 
        textAlign:"center",
        opacity: isActive ? 0.85 : 1
      }}
    >
      {s==="available" ? "✅ Dispo" : s==="maybe" ? "⚡ Peut-être" : "❌ Pas dispo"}
      {isActive && <div style={{fontSize:9, opacity:0.7}}>clic pour effacer</div>}
    </button>
  );
})}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detail panel — bottom sheet */}
          {!selectMode && singleDay && singleDayDate && (
            <div style={{ margin:"12px 16px 0", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:16 }}>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#fff", textTransform:"capitalize" }}>{formatDate(singleDayDate)}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{isWeekend(singleDayDate)?"Week-end 🎯":"Semaine"}</div>
                </div>
                <button onClick={()=>setSingleDay(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:6, padding:"4px 10px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:14 }}>✕</button>
              </div>

              {/* My availability — horizontal buttons */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#93c5fd", marginBottom:8 }}>Ma disponibilité</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                  {["available","maybe","unavailable"].map(s=>{
                    const active=getAvail(singleDay,currentUser)===s;
                    return (
                      <button key={s} onClick={()=>setAvailability(singleDay,active?"unknown":s)} style={{ background:active?STATUS[s].bg:"rgba(255,255,255,0.04)", border:`1.5px solid ${active?STATUS[s].border:"rgba(255,255,255,0.1)"}`, borderRadius:10, padding:"8px 4px", color:active?STATUS[s].color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:12, fontWeight:active?700:400, textAlign:"center", transition:"all 0.15s" }}>
                        {s==="available"?"✅ Dispo":s==="maybe"?"⚡ Peut-être":"❌ Pas dispo"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group overview — compact chips */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.4)", marginBottom:8 }}>Disponibilités du groupe</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {VIE_MEMBERS.map(m=>{
                    const s=getAvail(singleDay,m);
                    return (
                      <div key={m} style={{ display:"flex", alignItems:"center", gap:4, background:STATUS[s].bg, border:`1px solid ${STATUS[s].border}`, borderRadius:20, padding:"3px 9px" }}>
                        <span style={{ fontSize:11, color:m===currentUser?"#93c5fd":STATUS[s].color, fontWeight:m===currentUser?700:400 }}>{m}</span>
                        <span style={{ fontSize:10, color:STATUS[s].color }}>· {STATUS[s].label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selDayEvents.length>0&&(
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.4)", marginBottom:8 }}>Activités</div>
                  {selDayEvents.map(ev=>{
                    const type=ACTIVITY_TYPES.find(a=>a.id===ev.type)||ACTIVITY_TYPES[7];
                    const isJoined=(ev.participants||[]).includes(currentUser);
                    return (
                      <div key={ev.id} style={{ background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:10, padding:10, marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{type.emoji} {ev.title}</div>
                          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>par {ev.createdBy} · {(ev.participants||[]).length} participant(s)</div>
                        </div>
                        <button onClick={()=>toggleParticipant(ev.id)} style={{ background:isJoined?"rgba(239,68,68,0.1)":"rgba(34,197,94,0.1)", border:`1px solid ${isJoined?"rgba(239,68,68,0.3)":"rgba(34,197,94,0.3)"}`, borderRadius:6, padding:"5px 10px", color:isJoined?"#f87171":"#4ade80", cursor:"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{isJoined?"✕ Retirer":"✓ Participer"}</button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={()=>{setNewEvent(p=>({...p,dateKey:singleDay}));setShowEventForm(true);setView("events");}} style={{ width:"100%", background:"linear-gradient(135deg,#3b82f6,#06b6d4)", border:"none", borderRadius:10, padding:"9px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>+ Proposer une activité</button>
            </div>
          )}
        </>)}
  
          {/* EVENTS */}
          {view==="events"&&(
          <div style={{ padding:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
              <h2 style={{ fontSize:18, fontWeight:700, color:"#fff" }}>Activités proposées</h2>
              <button onClick={()=>setShowEventForm(true)} style={{ background:"linear-gradient(135deg,#3b82f6,#06b6d4)", border:"none", borderRadius:10, padding:"8px 16px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>+ Proposer</button>
            </div>

            {showEventForm&&(
              <div style={{ background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:16, padding:18, marginBottom:18 }}>
                <h3 style={{ color:"#93c5fd", fontSize:14, fontWeight:700, marginBottom:12 }}>Nouvelle activité</h3>
                <div style={{ display:"grid", gap:10 }}>
                  <input placeholder="Titre (ex: Pique-nique à Phoenix Park)" value={newEvent.title} onChange={e=>setNewEvent(p=>({...p,title:e.target.value}))} style={inputStyle}/>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <select value={newEvent.type} onChange={e=>setNewEvent(p=>({...p,type:e.target.value}))} style={selectStyle}>
                      {ACTIVITY_TYPES.map(a=><option key={a.id} value={a.id}>{a.emoji} {a.label}</option>)}
                    </select>
                    <input type="date" value={newEvent.dateKey} onChange={e=>setNewEvent(p=>({...p,dateKey:e.target.value}))} min={new Date().toISOString().split("T")[0]} style={selectStyle}/>
                  </div>
                  <textarea placeholder="Description, lieu, infos pratiques…" value={newEvent.description} onChange={e=>setNewEvent(p=>({...p,description:e.target.value}))} rows={2} style={{...inputStyle,resize:"vertical"}}/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addEvent} style={{ background:"linear-gradient(135deg,#3b82f6,#06b6d4)", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>Publier</button>
                    <button onClick={()=>setShowEventForm(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"9px 18px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:13 }}>Annuler</button>
                  </div>
                </div>
              </div>
            )}

            {events.length===0&&!showEventForm&&(
              <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,0.3)" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
                <p>Aucune activité proposée pour l'instant.</p>
                <p style={{ fontSize:13 }}>Sois le premier à suggérer quelque chose !</p>
              </div>
            )}

            {[...events].sort((a,b)=>a.dateKey>b.dateKey?1:-1).map(ev=>{
              const type=ACTIVITY_TYPES.find(a=>a.id===ev.type)||ACTIVITY_TYPES[7];
              const parts=ev.participants||[];
              const isJoined=parts.includes(currentUser);
              const evDate=ev.dateKey?new Date(ev.dateKey+"T12:00:00"):null;
              return (
                <div key={ev.id} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:16, marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                        <span style={{ fontSize:22 }}>{type.emoji}</span>
                        <div>
                          <div style={{ fontWeight:700, fontSize:15, color:"#fff" }}>{ev.title}</div>
                          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{evDate?formatDate(evDate):""} · par {ev.createdBy}</div>
                        </div>
                      </div>
                      {ev.description&&<p style={{ fontSize:12, color:"rgba(255,255,255,0.55)", margin:"6px 0", lineHeight:1.5 }}>{ev.description}</p>}
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:6 }}>
                        {parts.map(p=><span key={p} style={{ background:"rgba(34,197,94,0.13)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:20, padding:"2px 8px", fontSize:10, color:"#4ade80" }}>✓ {p}</span>)}
                      </div>
                    </div>
                    <div style={{ textAlign:"center", minWidth:34 }}>
                      <div style={{ fontSize:20, fontWeight:800, color:"#22c55e" }}>{parts.length}</div>
                      <div style={{ fontSize:9, color:"rgba(255,255,255,0.35)" }}>part.</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:10 }}>
                    <button onClick={()=>toggleParticipant(ev.id)} style={{ flex:1, background:isJoined?"rgba(239,68,68,0.1)":"rgba(34,197,94,0.1)", border:`1.5px solid ${isJoined?"rgba(239,68,68,0.3)":"rgba(34,197,94,0.3)"}`, borderRadius:8, padding:"7px 14px", color:isJoined?"#f87171":"#4ade80", cursor:"pointer", fontSize:12, fontWeight:600 }}>{isJoined?"✕ Me retirer":"✓ Je participe"}</button>
                    {ev.createdBy===currentUser && <button onClick={()=>setConfirmDelete({type:"event",id:ev.id})} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"7px 12px", color:"#f87171", cursor:"pointer", fontSize:13 }}>🗑️</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
  
          {/* POLLS */}
          {view==="polls"&&(
          <div style={{ padding:20 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <h2 style={{ fontSize:18, fontWeight:700, color:"#fff" }}>Trouver un créneau</h2>
              <button onClick={()=>setShowPollForm(true)} style={{ background:"linear-gradient(135deg,#8b5cf6,#6366f1)", border:"none", borderRadius:10, padding:"8px 16px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>+ Nouvelle idée</button>
            </div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginBottom:20 }}>Propose une activité sans date. L'app analyse les dispos et trouve les meilleurs créneaux.</p>

            {showPollForm&&(
              <div style={{ background:"rgba(139,92,246,0.08)", border:"1px solid rgba(139,92,246,0.25)", borderRadius:16, padding:18, marginBottom:18 }}>
                <h3 style={{ color:"#c4b5fd", fontSize:14, fontWeight:700, marginBottom:12 }}>Nouvelle idée d'activité</h3>
                <div style={{ display:"grid", gap:10 }}>
                  <input placeholder="Ex: Week-end à Manchester, Soirée bowling…" value={newPoll.title} onChange={e=>setNewPoll(p=>({...p,title:e.target.value}))} style={inputStyle}/>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <select value={newPoll.type} onChange={e=>setNewPoll(p=>({...p,type:e.target.value}))} style={selectStyle}>
                      {ACTIVITY_TYPES.map(a=><option key={a.id} value={a.id}>{a.emoji} {a.label}</option>)}
                    </select>
                    <select value={newPoll.slotType} onChange={e=>setNewPoll(p=>({...p,slotType:e.target.value}))} style={selectStyle}>
                      {SLOT_TYPES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <textarea placeholder="Description, budget, idées…" value={newPoll.description} onChange={e=>setNewPoll(p=>({...p,description:e.target.value}))} rows={2} style={{...inputStyle,resize:"vertical"}}/>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={addPoll} style={{ background:"linear-gradient(135deg,#8b5cf6,#6366f1)", border:"none", borderRadius:8, padding:"9px 18px", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>Lancer le sondage</button>
                    <button onClick={()=>setShowPollForm(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"9px 18px", color:"rgba(255,255,255,0.5)", cursor:"pointer", fontSize:13 }}>Annuler</button>
                  </div>
                </div>
              </div>
            )}

            {polls.length===0&&!showPollForm&&(
              <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,0.3)" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🗳️</div>
                <p>Aucune idée en attente de date.</p>
                <p style={{ fontSize:13 }}>Propose une activité sans date pour trouver le meilleur créneau ensemble !</p>
              </div>
            )}

            {polls.map(poll=>{
              const type      = ACTIVITY_TYPES.find(a=>a.id===poll.type)||ACTIVITY_TYPES[7];
              const slotType  = SLOT_TYPES.find(s=>s.id===(poll.slotType||"weekend"))||SLOT_TYPES[0];
              const myVote    = (poll.votes||{})[currentUser];
              const votes     = poll.votes||{};
              const yesCount  = Object.values(votes).filter(v=>v==="yes").length;
              const maybeCount= Object.values(votes).filter(v=>v==="maybe").length;
              const noCount   = Object.values(votes).filter(v=>v==="no").length;
              const bestSlots = getBestSlots(poll);
              const isExpanded= expandedPoll===poll.id;
              const isCreator = poll.createdBy===currentUser;
              const votersOpen= pollVotersOpen===poll.id;

              return (
                <div key={poll.id} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:16, padding:18, marginBottom:14 }}>

                  {/* Header */}
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                        <span style={{ fontSize:20 }}>{type.emoji}</span>
                        <div style={{ fontWeight:700, fontSize:15, color:"#fff" }}>{poll.title}</div>
                        <span style={{ background:"rgba(139,92,246,0.15)", border:"1px solid rgba(139,92,246,0.3)", borderRadius:20, padding:"2px 8px", fontSize:10, color:"#c4b5fd" }}>{slotType.label}</span>
                        {poll.fixedDate&&<span style={{ background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:20, padding:"2px 8px", fontSize:10, color:"#4ade80", fontWeight:700 }}>📌 {poll.fixedDate}</span>}
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>Proposé par {poll.createdBy}</div>
                      {poll.description&&<p style={{ fontSize:12, color:"rgba(255,255,255,0.5)", margin:"5px 0 0", lineHeight:1.5 }}>{poll.description}</p>}
                    </div>
                    {isCreator&&<button onClick={()=>setConfirmDelete({type:"poll",id:poll.id})} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:6, padding:"4px 8px", color:"#f87171", cursor:"pointer", fontSize:11 }}>🗑️</button>}
                  </div>

                  {/* Vote summary — clickable to show detail */}
                  <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
                    {Object.entries(INTEREST).map(([k,v])=>{
                      const count=Object.values(votes).filter(x=>x===k).length;
                      return (
                        <div key={k} style={{ display:"flex", alignItems:"center", gap:4, background:v.bg, border:`1px solid ${v.border}`, borderRadius:20, padding:"3px 10px", fontSize:11, color:v.color, fontWeight:600 }}>
                          {v.emoji} {count}
                        </div>
                      );
                    })}
                    <div style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(71,85,105,0.15)", border:"1px solid rgba(71,85,105,0.2)", borderRadius:20, padding:"3px 10px", fontSize:11, color:"#94a3b8" }}>
                      ? {VIE_MEMBERS.length-yesCount-maybeCount-noCount}
                    </div>
                    <button onClick={()=>setPollVotersOpen(votersOpen?null:poll.id)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:20, padding:"3px 10px", fontSize:11, color:"rgba(255,255,255,0.5)", cursor:"pointer" }}>
                      {votersOpen?"▾ Masquer":"▸ Voir qui"}
                    </button>
                  </div>

                  {/* Voters detail */}
                  {votersOpen&&(
                    <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:12, marginBottom:12 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        {Object.entries(INTEREST).map(([k,v])=>{
                          const who=VIE_MEMBERS.filter(m=>(poll.votes||{})[m]===k);
                          return (
                            <div key={k}>
                              <div style={{ fontSize:11, fontWeight:700, color:v.color, marginBottom:5 }}>{v.emoji} {v.label} ({who.length})</div>
                              {who.length===0
                                ? <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)" }}>—</div>
                                : who.map(m=><div key={m} style={{ fontSize:11, color:m===currentUser?"#93c5fd":"rgba(255,255,255,0.7)", padding:"2px 0" }}>{m===currentUser?"👤 ":""}{m}</div>)
                              }
                            </div>
                          );
                        })}
                      </div>
                      {/* N'ont pas encore voté */}
                      {(() => {
                        const notVoted=VIE_MEMBERS.filter(m=>!(poll.votes||{})[m]);
                        return notVoted.length>0?(
                          <div style={{ marginTop:10, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:8 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", marginBottom:4 }}>? Pas encore voté ({notVoted.length})</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                              {notVoted.map(m=><span key={m} style={{ fontSize:10, color:"rgba(255,255,255,0.35)" }}>{m}</span>).reduce((a,b)=>[...a,<span key={b.key+"c"} style={{ color:"rgba(255,255,255,0.2)", fontSize:10 }}> · </span>,b],[])}
                            </div>
                          </div>
                        ):null;
                      })()}
                    </div>
                  )}

                  {/* My vote */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:7 }}>Mon intérêt :</div>
                    <div style={{ display:"flex", gap:6 }}>
                      {Object.entries(INTEREST).map(([k,v])=>{
                        const active=myVote===k;
                        return (
                          <button key={k} onClick={()=>votePoll(poll.id,active?null:k)} style={{ flex:1, background:active?v.bg:"rgba(255,255,255,0.04)", border:`1.5px solid ${active?v.border:"rgba(255,255,255,0.1)"}`, borderRadius:8, padding:"7px 4px", color:active?v.color:"rgba(255,255,255,0.45)", cursor:"pointer", fontSize:11, fontWeight:active?700:400, transition:"all 0.15s", textAlign:"center" }}>
                            {v.emoji}<br/><span style={{ fontSize:10 }}>{v.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Best slots */}
                  <div>
                    <button onClick={()=>setExpandedPoll(isExpanded?null:poll.id)} style={{ background:"rgba(139,92,246,0.1)", border:"1px solid rgba(139,92,246,0.25)", borderRadius:8, padding:"7px 14px", color:"#c4b5fd", cursor:"pointer", fontSize:12, fontWeight:600, width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>🔍 Meilleurs créneaux ({bestSlots.length>0?`${bestSlots.length} trouvé${bestSlots.length>1?"s":""}` : "remplis le calendrier d'abord"})</span>
                      <span>{isExpanded?"▾":"▸"}</span>
                    </button>

                    {isExpanded && (
                    <div style={{ marginTop: 10 }}>
                      {bestSlots.length === 0 ? (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "10px 0" }}>
                          Personne n'a encore rempli ses dispos. Rendez-vous dans l'onglet 📅 Calendrier !
                        </p>
                      ) : (
                        bestSlots.map((slot, idx) => {
                          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "";
                          const pct = poll.fixedDate ? 100 : Math.round((slot.allAvail / slot.total) * 100);
                          const isFixed = poll.fixedDate === slot.label;

                          return (
                            <div key={slot.label} style={{
                              background: isFixed ? "rgba(34,197,94,0.12)" : idx === 0 ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.03)",
                              border: `1px solid ${isFixed ? "rgba(34,197,94,0.4)" : idx === 0 ? "rgba(234,179,8,0.25)" : "rgba(255,255,255,0.07)"}`,
                              borderRadius: 10,
                              padding: 12,
                              marginBottom: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
                                  {isFixed ? "📌 " : ""}{medal} {slot.label}
                                </div>
                                <div style={{ fontSize: 11, color: "#4ade80" }}>
                                  ✅ {poll.fixedDate ? "Date fixée" : `${slot.allAvail}/${slot.total} disponibles`}
                                </div>
                              </div>

                              {isCreator && (
                                <button 
                                  onClick={() => fixPollDate(poll.id, isFixed ? null : slot.label)}
                                  style={{
                                    background: isFixed ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                                    border: `1px solid ${isFixed ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.3)"}`,
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    color: isFixed ? "#f87171" : "#4ade80",
                                    cursor: "pointer",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap"
                                  }}
                                >
                                  {isFixed ? "Défixer" : "📌 Fixer"}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
  </div>
)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
  
        </div>

        {/* CONFIRM DELETE MODAL */}
        {/* CONFIRM DELETE MODAL */}
{confirmDelete && (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,0.12)", borderRadius:20, padding:28, maxWidth:320, width:"100%", textAlign:"center" }}>
      <div style={{ fontSize:36, marginBottom:12 }}>🗑️</div>
      <h3 style={{ color:"#fff", fontSize:17, fontWeight:700, marginBottom:8 }}>Supprimer ?</h3>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:13, marginBottom:24 }}>Cette action est irréversible.</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <button 
          onClick={() => setConfirmDelete(null)} 
          style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, padding:"12px", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:14, fontWeight:600 }}
        >
          Annuler
        </button>
        <button 
          onClick={() => {
            if (confirmDelete.type === "poll") {
              deletePoll(confirmDelete.id);
            } else {
              deleteEvent(confirmDelete.id);
            }
            // Fermeture garantie
            setConfirmDelete(null);
          }} 
          style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:12, padding:"12px", color:"#f87171", cursor:"pointer", fontSize:14, fontWeight:700 }}
        >
          Supprimer
        </button>
      </div>
    </div>
  </div>
)}  
  
        {/* HELP MODAL */}
                {/* HELP MODAL */}
                {showHelp && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:100, overflowY:"auto", padding:"20px 16px" }}>
            <div style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, maxWidth:480, margin:"0 auto", padding:24 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <h2 style={{ color:"#fff", fontSize:18, fontWeight:700 }}>🍀 Comment utiliser l'app</h2>
                <button onClick={()=>setShowHelp(false)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"5px 12px", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:14 }}>✕</button>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {[
                  { emoji:"📅", title:"Calendrier", text:"Tape sur un jour pour voir les dispos du groupe et indiquer ta propre disponibilité." },
                  { emoji:"☐", title:"Sélection multiple", text:"Appuie sur \"Sélectionner\" pour cocher plusieurs jours." },
                  { emoji:"🎉", title:"Activités", text:"Propose une sortie avec une date précise." },
                  { emoji:"🗳️", title:"Trouver un créneau", text:"Lance un sondage sans date fixe." },
                  { emoji:"🔄", title:"Synchronisation", text:"Tout est en temps réel avec Firebase." },
                ].map(({emoji,title,text})=>(
                  <div key={title} style={{ borderBottom:"1px solid rgba(255,255,255,0.07)", paddingBottom:14 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:5 }}>{emoji} {title}</div>
                    <p style={{ fontSize:13, color:"rgba(255,255,255,0.55)", margin:0, lineHeight:1.6 }}>{text}</p>
                  </div>
                ))}
              </div>

              <button onClick={()=>setShowHelp(false)} style={{ marginTop:24, width:"100%", background:"linear-gradient(135deg,#3b82f6,#06b6d4)", border:"none", borderRadius:12, padding:"13px", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>C’est compris ! 👍</button>
            </div>
          </div>
        )}
      </div>
    );
  }
