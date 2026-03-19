import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorkoutDecisionPrompt from './components/WorkoutDecisionPrompt.jsx';
import BrainDumpModal from './components/BrainDumpModal.jsx';
import DayCard from './components/DayCard.jsx';
import Header from './components/Header.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import { formatDate, formatDateRange, getDateParts } from './dateFormatter.ts';
import './styles.css';
import { FlowRoot } from './flow/FlowRoot.jsx';

const IS_DEV=import.meta.env.DEV;
const DEV_SW_RESET_KEY='__app_in_my_life_dev_sw_reset__';

window.__PERSONAL_HUB_PWA__={
  isSecureOrigin:window.isSecureContext||location.hostname==='localhost'||location.hostname==='127.0.0.1'
};

if ("serviceWorker" in navigator) {
  if (IS_DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => registration.unregister()),
        ),
      )
      .catch(() => {})
      .finally(() => {
        if ("caches" in window) {
          caches
            .keys()
            .then((keys) =>
              Promise.all(
                keys
                  .filter((key) => key.startsWith("app-in-my-life-shell-"))
                  .map((key) => caches.delete(key)),
              ),
            )
            .catch(() => {})
            .finally(() => {
              if (
                navigator.serviceWorker.controller &&
                !sessionStorage.getItem(DEV_SW_RESET_KEY)
              ) {
                sessionStorage.setItem(DEV_SW_RESET_KEY, "1");
                location.reload();
              }
            });
          return;
        }

        if (
          navigator.serviceWorker.controller &&
          !sessionStorage.getItem(DEV_SW_RESET_KEY)
        ) {
          sessionStorage.setItem(DEV_SW_RESET_KEY, "1");
          location.reload();
        }
      });
  } else {
    window.addEventListener("load", () => {
      if (window.__PERSONAL_HUB_PWA__.isSecureOrigin) {
        navigator.serviceWorker
          .register("./sw.js", { scope: "./" })
          .then((registration) => registration.update().catch(() => {}))
          .catch((error) => {
            console.error("Service worker registration failed:", error);
          });
      }
    });
  }
}

const STORAGE_KEYS = {
  profile: "ops_v1",
  activeWorkout: "activeWorkoutSession_v1",
  dailyCheckin: "dailyCheckin",
  navigation: "ops_nav_v1",
  growth: "ops_growth_v1",
  migration: "ops_storage_migration_v1",
};
const APP_DB_NAME = "app_in_my_life_v1";
const APP_DB_VERSION = 1;
const APP_DB_STORE = "kv";
const MAX_GROWTH_EVENTS = 200;
let appDbPromise = null;
let navigationStateCache = null;
let dailyCheckinStoreCache = {};
let activeWorkoutStateCache = null;
let growthStateCache = null;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const APP_TAB_IDS = [
  "home",
  "calendar",
  "tasks",
  "training",
  "meals",
  "finance",
  "habits",
  "health",
  "maintenance",
  "insights",
  "settings",
  "more",
];
const TASK_TAB_IDS = ["inbox", "scheduled", "next", "done", "templates"];
const FINANCE_VIEW_IDS = [
  "overview",
  "transactions",
  "categories",
  "recurring",
  "trends",
];
const IMPORT_ACCOUNT_AUTO = "__auto__";
const TRAIN_SECTION_IDS = ["today", "plan", "library", "history"];
const SETTINGS_SECTION_IDS = [
  "app",
  "workcal",
  "finance",
  "google",
  "fitness",
  "goals",
  "meals",
  "notifications",
  "security",
];
const HEALTH_TAB_IDS = ["recovery", "wellness", "body", "care", "library"];
const LIFESTYLE_TAB_IDS = ["habits", "lifestyle", "routine"];
function openAppDb() {
  if (appDbPromise) return appDbPromise;
  appDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_DB_STORE)) {
        db.createObjectStore(APP_DB_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open IndexedDB"));
  });
  return appDbPromise;
}

async function withStore(mode, handler) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(APP_DB_STORE, mode);
    const store = tx.objectStore(APP_DB_STORE);
    let result;
    try {
      result = handler(store, tx);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () =>
      resolve(
        result && typeof result === "object" && "result" in result
          ? result.result
          : result,
      );
    tx.onerror = () =>
      reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

const storage = {
  async get(key) {
    try {
      const record = await withStore("readonly", (store) => store.get(key));
      return record?.value != null ? { value: record.value } : null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await withStore("readwrite", (store) => store.put({ key, value }));
      return true;
    } catch {
      return null;
    }
  },
  async remove(key) {
    try {
      await withStore("readwrite", (store) => store.delete(key));
      return true;
    } catch {
      return null;
    }
  },
  async getJSON(key) {
    const result = await this.get(key);
    if (!result?.value) return null;
    try {
      return JSON.parse(result.value);
    } catch {
      return null;
    }
  },
  async setJSON(key, value) {
    return this.set(key, JSON.stringify(value));
  },
};

async function migrateLegacyLocalStorage() {
  const migrated = await storage.getJSON(STORAGE_KEYS.migration);
  if (migrated?.completedAt) return migrated;
  const legacyKeys = [
    STORAGE_KEYS.profile,
    STORAGE_KEYS.navigation,
    STORAGE_KEYS.activeWorkout,
    STORAGE_KEYS.dailyCheckin,
  ];
  const importedKeys = [];
  for (const key of legacyKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      await storage.set(key, raw);
      importedKeys.push(key);
    } catch {}
  }
  const receipt = { completedAt: new Date().toISOString(), importedKeys };
  await storage.setJSON(STORAGE_KEYS.migration, receipt);
  legacyKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  });
  return receipt;
}

const ACTIVE_WORKOUT_STORAGE_KEY = STORAGE_KEYS.activeWorkout;

function normalizeGrowthState(raw = {}) {
  const next = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const activationChecklist =
    next.activationChecklist && typeof next.activationChecklist === "object"
      ? next.activationChecklist
      : {};
  const setupCardCompleted =
    (activationChecklist.checkInCompleted === true &&
      activationChecklist.prioritiesSet === true &&
      activationChecklist.actionCompleted === true) ||
    next.setupCardCompleted === true;
  return {
    firstOpenedAt:
      typeof next.firstOpenedAt === "string" ? next.firstOpenedAt : null,
    firstValueAt:
      typeof next.firstValueAt === "string" ? next.firstValueAt : null,
    lastSeenAt: typeof next.lastSeenAt === "string" ? next.lastSeenAt : null,
    installPromptDismissedAt:
      typeof next.installPromptDismissedAt === "string"
        ? next.installPromptDismissedAt
        : null,
    installPromptShownCount: Number.isFinite(next.installPromptShownCount)
      ? next.installPromptShownCount
      : 0,
    installAcceptedAt:
      typeof next.installAcceptedAt === "string"
        ? next.installAcceptedAt
        : null,
    onboardingDismissed: next.onboardingDismissed === true,
    setupCardCompleted,
    activationChecklist: {
      checkInCompleted: activationChecklist.checkInCompleted === true,
      prioritiesSet: activationChecklist.prioritiesSet === true,
      actionCompleted: activationChecklist.actionCompleted === true,
    },
    events: Array.isArray(next.events)
      ? next.events
          .filter(
            (event) =>
              event &&
              typeof event === "object" &&
              typeof event.type === "string",
          )
          .slice(-MAX_GROWTH_EVENTS)
      : [],
  };
}

function getDefaultGrowthState() {
  return normalizeGrowthState({});
}

function isIosLikeInstallContext() {
  const ua = window.navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && "ontouchend" in document)
  );
}

function toTitleCaseLabel(text = "") {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getCompactWorkoutTitle(title = "") {
  const cleaned = (title || "").replace(/^Strength\s+[—-]\s+/i, "").trim();
  return cleaned ? toTitleCaseLabel(cleaned) : "Workout";
}

function SetupCard({C,S,activationChecklist,onOpenCheckIn,onOpenBrainDump}){
  const items=[
    {id:'checkInCompleted',label:'Check in'},
    {id:'prioritiesSet',label:'Pick priorities'},
    {id:'actionCompleted',label:'Start first task'},
  ];
  return <section style={{...S.card,padding:'14px 14px 12px',display:'grid',gap:10}}>
    <div>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Setup</div>
      <div style={{fontSize:18,fontWeight:800,color:C.tx,lineHeight:1.1}}>Set your day once.</div>
    </div>
    <div style={{display:'grid',gap:6}}>
      {items.map(item=>{
        const done=activationChecklist?.[item.id]===true;
        const onClick=item.id==='checkInCompleted'?onOpenCheckIn:onOpenBrainDump;
        return <button
          key={item.id}
          type="button"
          onClick={done?undefined:onClick}
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 4,
          }}
        >
          Setup
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: C.tx,
            lineHeight: 1.1,
          }}
        >
          Set your day once.
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => {
          const done = activationChecklist?.[item.id] === true;
          const onClick =
            item.id === "checkInCompleted" ? onOpenCheckIn : onOpenAddTask;
          return (
            <button
              key={item.id}
              type="button"
              onClick={done ? undefined : onClick}
              style={{
                ...S.row,
                width: "100%",
                background: C.surf,
                border: `1px solid ${done ? C.sageL : C.bd}`,
                borderRadius: 12,
                padding: "10px 12px",
                cursor: done ? "default" : "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? C.sage : C.white,
                    border: `1px solid ${done ? C.sage : C.bd}`,
                    color: done ? C.white : C.muted,
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {done ? "✓" : ""}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.tx,
                    opacity: done ? 0.72 : 1,
                  }}
                >
                  {item.label}
                </span>
              </div>
              {!done && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.navy,
                    flexShrink: 0,
                  }}
                >
                  Open
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TodayList({
  C,
  S,
  FieldInput,
  dailyExecutionEntry,
  selectedDateLabel,
  isViewingToday,
  updatePriorityTask,
  movePriorityTask,
  removePriorityTask,
  openBrainDump,
  setDailyExecutionMode,
}){
  const headingId=React.useId();
  const hasExecutionItems=dailyExecutionEntry.priorities.some(task=>task.text.trim());
  const isExecution=dailyExecutionEntry.mode==='execution';
  const visibleTasks=isExecution
    ?dailyExecutionEntry.agenda
    :dailyExecutionEntry.priorities;

  return <section style={{...S.card,padding:'14px 14px 12px',display:'grid',gap:10}}>
    <div style={{...S.row,alignItems:'flex-start',gap:10}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Today</div>
        <h2 id={headingId} style={{fontSize:20,fontWeight:800,color:C.tx,lineHeight:1.1,margin:0}}>{selectedDateLabel}</h2>
        {!isViewingToday&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Selected date</div>}
      </div>
      <span style={S.pill(isExecution?C.sageL:C.navyL,isExecution?C.sageDk:C.navyDk)}>{isExecution?'Execution':'Planning'}</span>
    </div>
    <div style={{display:'grid',gap:8}}>
      {visibleTasks.length===0&&<div style={{background:C.surf,borderRadius:12,padding:'14px 12px'}}>
        <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:4}}>No priorities</div>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Use Brain Dump to capture something fast, then process it when you&apos;re ready.</div>
        <button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={openBrainDump}>Brain Dump</button>
      </div>}
      {visibleTasks.map((task,index,items)=><div key={task.id}>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:8,alignItems:'center',background:C.surf,borderRadius:12,padding:'10px 12px'}}>
          <button
            type="button"
            aria-pressed={task.completed}
            aria-label={`${task.completed?'Mark incomplete':'Mark complete'} for ${task.text?.trim()||`priority ${index+1}`}`}
            style={{width:22,height:22,borderRadius:999,border:`1px solid ${task.completed?C.sage:C.bd}`,background:task.completed?C.sage:'transparent',color:task.completed?C.white:C.muted,cursor:'pointer',fontSize:12,fontWeight:700,flexShrink:0}}
            onClick={()=>updatePriorityTask(task.id,{completed:!task.completed})}
          >
            Today
          </div>
          <h2
            id={headingId}
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: C.tx,
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {selectedDateLabel}
          </h2>
          {!isViewingToday && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Selected date
            </div>
          )}
        </div>
        <span
          style={S.pill(
            isExecution ? C.sageL : C.navyL,
            isExecution ? C.sageDk : C.navyDk,
          )}
        >
          {isExecution ? "Execution" : "Planning"}
        </span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {visibleTasks.length === 0 && (
          <div
            style={{
              background: C.surf,
              borderRadius: 12,
              padding: "14px 12px",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.tx,
                marginBottom: 8,
              }}
            >
              No priorities
            </div>
            <button
              type="button"
              aria-pressed={sub.completed}
              style={{width:18,height:18,borderRadius:999,border:`1px solid ${sub.completed?C.sage:C.bd}`,background:sub.completed?C.sage:'transparent',color:sub.completed?C.white:C.muted,cursor:'pointer',fontSize:10,fontWeight:700,flexShrink:0}}
              onClick={()=>updatePriorityTask(task.id,{subtasks:task.subtasks.map(s=>s.id===sub.id?{...s,completed:!s.completed}:s)})}
            >{sub.completed?'✓':''}</button>
            <span style={{fontSize:12,color:C.tx,textDecoration:sub.completed?'line-through':'none',opacity:sub.completed?0.65:1}}>{sub.text}</span>
          </div>)}
        </div>}
      </div>)}
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {!isExecution&&<button type="button" style={{...S.btnGhost,flex:1}} onClick={openBrainDump}>Brain Dump</button>}
      {!isExecution
        ?<button type="button" style={{...S.btnSolid(C.navy),flex:1,opacity:hasExecutionItems?1:0.45,pointerEvents:hasExecutionItems?'auto':'none'}} onClick={()=>setDailyExecutionMode('execution')} disabled={!hasExecutionItems}>Start</button>
        :<button type="button" style={{...S.btnGhost,flex:1}} onClick={()=>setDailyExecutionMode('planning')}>Edit</button>}
    </div>
  </section>;
}

function InlineTaskInput({C,S,onAdd}){
  const [text,setText]=useState('');
  const [notesOpen,setNotesOpen]=useState(false);
  const [notes,setNotes]=useState('');
  const [subtasks,setSubtasks]=useState([]);
  const [open,setOpen]=useState(false);

  function submit(){
    if(!text.trim())return;
    onAdd({text:text.trim(),notes:notes.trim()||null,subtasks:subtasks.map(s=>({id:`sub-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,text:s.trim(),completed:false})).filter(s=>s.text)});
    setText('');setNotes('');setSubtasks([]);setNotesOpen(false);setOpen(false);
  }

  if(!open){
    return <button type="button" style={{...S.btnGhost,fontSize:12,justifyContent:'flex-start',padding:'8px 12px'}} onClick={()=>setOpen(true)}>+ Add task</button>;
  }

  return <div style={{background:C.surf,borderRadius:12,padding:'10px 12px',display:'grid',gap:8}}>
    <input
      value={text}
      onChange={e=>setText(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit();}if(e.key==='Escape')setOpen(false);}}
      placeholder="Task name"
      style={{...S.inp,margin:0}}
      autoFocus
    />
    {subtasks.map((st,i)=><div key={i} style={{display:'flex',gap:8,paddingLeft:14,alignItems:'center'}}>
      <div style={{width:5,height:5,borderRadius:999,background:C.muted,flexShrink:0}}/>
      <input
        value={st}
        onChange={e=>{const next=[...subtasks];next[i]=e.target.value;setSubtasks(next);}}
        placeholder={`Subtask ${i+1}`}
        style={{...S.inp,margin:0,flex:1,fontSize:12}}
      />
      <button type="button" onClick={()=>setSubtasks(subtasks.filter((_,j)=>j!==i))} style={{...S.btnGhost,padding:'3px 7px',fontSize:11}}>×</button>
    </div>)}
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      <button type="button" onClick={()=>setSubtasks([...subtasks,''])} style={{...S.btnGhost,fontSize:11,padding:'5px 9px'}}>+ Subtask</button>
      <button type="button" onClick={()=>setNotesOpen(o=>!o)} style={{...S.btnGhost,fontSize:11,padding:'5px 9px'}}>{notesOpen?'▾ Notes':'▸ Notes'}</button>
      <div style={{flex:1}}/>
      <button type="button" onClick={()=>setOpen(false)} style={{...S.btnGhost,fontSize:11,padding:'5px 9px'}}>Cancel</button>
      <button type="button" onClick={submit} disabled={!text.trim()} style={{...S.btnSmall(),fontSize:11,padding:'5px 9px',opacity:text.trim()?1:0.45}}>Add</button>
    </div>
    {notesOpen&&<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes…" rows={2} style={{...S.inp,margin:0,resize:'vertical',fontSize:12}}/>}
  </div>;
}

function QuickActions({
  C,
  S,
  metrics,
  shouldPromptWorkoutDecision,
  scheduledTodayWorkout,
  recoveryWorkoutOption,
  handleWorkoutDecision,
  mealTitle,
  mealSubtitle,
  mealValue,
  onMealValueChange,
  onMealSubmit,
  workoutTitle,
  workoutDuration,
  workoutCta,
  onWorkoutAction,
  taskTitle,
  taskMeta,
  taskCta,
  onTaskAction,
  showTaskDone,
  onTaskDone,
  onOpenCheckIn,
  onOpenBrainDump,
  onOpenCalendar,
}) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      {metrics.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${metrics.length},minmax(0,1fr))`,
            gap: 8,
          }}
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                background: C.surf,
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: C.muted,
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {metric.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>
        <button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={onMealAction}>Open</button>
      </div>
      <div style={{...S.row,background:C.card,borderRadius:14,padding:'12px 12px',alignItems:'center'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Workout</div>
          <div style={{fontSize:14,fontWeight:700,color:C.tx,lineHeight:1.2}}>{workoutTitle}</div>
          {!!workoutDuration&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{workoutDuration}</div>}
        </div>
        <div
          style={{
            ...S.row,
            background: C.card,
            borderRadius: 14,
            padding: "12px 12px",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 4,
              }}
            >
              Workout
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.tx,
                lineHeight: 1.2,
              }}
            >
              {workoutTitle}
            </div>
            {!!workoutDuration && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {workoutDuration}
              </div>
            )}
          </div>
          <button
            type="button"
            style={{ ...S.btnGhost, fontSize: 11, padding: "7px 10px" }}
            onClick={onWorkoutAction}
          >
            {workoutCta}
          </button>
        </div>
        <div
          style={{
            ...S.row,
            background: C.card,
            borderRadius: 14,
            padding: "12px 12px",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 4,
              }}
            >
              Tasks
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.tx,
                lineHeight: 1.2,
              }}
            >
              {taskTitle}
            </div>
            {!!taskMeta && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {taskMeta}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {showTaskDone && (
              <button
                type="button"
                style={{ ...S.btnGhost, fontSize: 11, padding: "7px 10px" }}
                onClick={onTaskDone}
              >
                Done
              </button>
            )}
            <button
              type="button"
              style={{ ...S.btnGhost, fontSize: 11, padding: "7px 10px" }}
              onClick={onTaskAction}
            >
              {taskCta}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" style={{...S.btnGhost,flex:1}} onClick={onOpenCheckIn}>Check in</button>
      <button type="button" style={{...S.btnGhost,flex:1,position:'relative'}} onClick={onOpenBrainDump}>Brain Dump</button>
      <button type="button" style={{...S.btnGhost,flex:1}} onClick={onOpenCalendar}>Open Calendar</button>
    </div>
  </section>;
}

function shouldKeepKeyEventLocal(event) {
  if (!event) return false;
  return !event.metaKey && !event.ctrlKey;
}

function composeFieldKeyHandler(
  handler,
  { allowEnterSubmit = false, isMultiline = false } = {},
) {
  if (!handler)
    return (event) => {
      if (event.key === "Enter" && !allowEnterSubmit && !isMultiline) {
        event.preventDefault();
      }
      if (shouldKeepKeyEventLocal(event)) event.stopPropagation();
    };
  return (event) => {
    if (event.key === "Enter" && !allowEnterSubmit && !isMultiline) {
      event.preventDefault();
    }
    handler(event);
    if (shouldKeepKeyEventLocal(event) && !event.isPropagationStopped?.())
      event.stopPropagation();
  };
}

function getSharedTextFieldProps(props) {
  const type = props.type || "text";
  const isTextLike = ![
    "file",
    "date",
    "time",
    "number",
    "range",
    "checkbox",
    "radio",
    "color",
    "hidden",
  ].includes(type);
  if (!isTextLike) return {};
  return {
    autoComplete: props.autoComplete ?? "off",
    autoCorrect: props.autoCorrect ?? "off",
    autoCapitalize: props.autoCapitalize ?? "none",
    spellCheck: props.spellCheck ?? false,
  };
}

const FieldInput = React.forwardRef(function FieldInput(
  { id, name, allowEnterSubmit = false, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  return React.createElement("input", {
    ...props,
    ...getSharedTextFieldProps(props),
    ref,
    id: fieldId,
    name: name ?? fieldId,
    onKeyDown: composeFieldKeyHandler(props.onKeyDown, { allowEnterSubmit }),
  });
});

const FieldSelect = React.forwardRef(function FieldSelect(
  { id, name, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  return React.createElement("select", {
    ...props,
    ref,
    id: fieldId,
    name: name ?? fieldId,
    onKeyDown: composeFieldKeyHandler(props.onKeyDown),
  });
});

const FieldTextarea = React.forwardRef(function FieldTextarea(
  { id, name, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  return React.createElement("textarea", {
    ...props,
    autoComplete: props.autoComplete ?? "off",
    autoCorrect: props.autoCorrect ?? "off",
    autoCapitalize: props.autoCapitalize ?? "none",
    spellCheck: props.spellCheck ?? false,
    ref,
    id: fieldId,
    name: name ?? fieldId,
    onKeyDown: composeFieldKeyHandler(props.onKeyDown, { isMultiline: true }),
  });
});

class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error("Screen render failed:", error);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

const C = {
  bg: "var(--bg)",
  card: "var(--card)",
  surf: "var(--surface)",
  sage: "var(--success)",
  sageL: "var(--surface)",
  sageDk: "var(--success)",
  navy: "var(--primary)",
  navyL: "var(--primary-weak)",
  navyDk: "var(--primary)",
  amber: "var(--warning)",
  amberL: "var(--surface)",
  amberDk: "var(--warning)",
  muted: "var(--text-secondary)",
  bd: "var(--border)",
  tx: "var(--text-primary)",
  tx2: "var(--text-secondary)",
  red: "var(--danger)",
  redL: "var(--surface)",
  white: "var(--white)",
  shadow: "var(--shadow)",
  shadowStrong: "var(--shadow-strong)",
  shadowNav: "var(--shadow-nav)",
  focusRing: "var(--focus-ring)",
  focusRingInverse: "var(--focus-ring-inverse)",
  scrim: "var(--scrim)",
  scrimStrong: "var(--scrim-strong)",
  headerBg: "var(--header-bg)",
  navBg: "var(--nav-bg)",
  whiteSoft: "var(--white-soft)",
  whiteSoftBorder: "var(--white-soft-border)",
  whiteSoft2: "var(--white-soft-2)",
  whiteSoft3: "var(--white-soft-3)",
  whiteSoft4: "var(--white-soft-4)",
  whiteSoft5: "var(--white-soft-5)",
};

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseDateKey(dateKey) {
  if (typeof dateKey !== "string" || !DATE_KEY_RE.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
function normalizeDateKey(dateLike, fallbackKey = getTodayKey()) {
  if (typeof dateLike === "string") {
    if (DATE_KEY_RE.test(dateLike)) return dateLike;
    const parsed = new Date(dateLike);
    return Number.isNaN(parsed.getTime()) ? fallbackKey : formatDateKey(parsed);
  }
  if (dateLike instanceof Date) return formatDateKey(dateLike);
  return fallbackKey;
}
function getTodayKey() {
  return formatDateKey(new Date());
}
function getWeekStartDate(dateLike) {
  const date =
    dateLike instanceof Date
      ? new Date(dateLike.getTime())
      : parseDateKey(normalizeDateKey(dateLike));
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(12, 0, 0, 0);
  return date;
}
function getMonthStartDate(dateLike) {
  const date =
    dateLike instanceof Date
      ? new Date(dateLike.getTime())
      : parseDateKey(normalizeDateKey(dateLike));
  date.setDate(1);
  date.setHours(12, 0, 0, 0);
  return date;
}
function addWeeksToDate(dateLike, weeks) {
  const date =
    dateLike instanceof Date
      ? new Date(dateLike.getTime())
      : parseDateKey(normalizeDateKey(dateLike));
  date.setDate(date.getDate() + weeks * 7);
  return date;
}
function addMonthsToDate(dateLike, months) {
  const date =
    dateLike instanceof Date
      ? new Date(dateLike.getTime())
      : parseDateKey(normalizeDateKey(dateLike));
  date.setMonth(date.getMonth() + months, 1);
  return date;
}
function getWeekIndexForDate(dateKey, today = getTodayKey()) {
  const base = getWeekStartDate(today);
  const target = getWeekStartDate(dateKey);
  return Math.round((target - base) / (7 * 86400000));
}
function getMonthIndexForDate(dateKey, today = getTodayKey()) {
  const base = getMonthStartDate(today);
  const target = getMonthStartDate(dateKey);
  return (
    (target.getFullYear() - base.getFullYear()) * 12 +
    (target.getMonth() - base.getMonth())
  );
}
function compareDateKeys(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}
function getCurrentDate() {
  const now = new Date();
  return {
    now,
    today: getTodayKey(),
    dow: now.getDay(),
  };
}
function readNavigationState(today = getTodayKey()) {
  return normalizeNavigationState(navigationStateCache, today);
}
function normalizeNavigationState(raw, today = getTodayKey()) {
  const next = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const tab = APP_TAB_IDS.includes(next.tab) ? next.tab : "home";
  return {
    tab,
    calendarFocusDay: normalizeDateKey(next.calendarFocusDay, today),
    calendarViewMode: next.calendarViewMode === "month" ? "month" : "week",
    calendarWeekIndex: Number.isFinite(next.calendarWeekIndex)
      ? next.calendarWeekIndex
      : getWeekIndexForDate(
          normalizeDateKey(next.calendarFocusDay, today),
          today,
        ),
    calendarMonthIndex: Number.isFinite(next.calendarMonthIndex)
      ? next.calendarMonthIndex
      : getMonthIndexForDate(
          normalizeDateKey(next.calendarFocusDay, today),
          today,
        ),
    taskScreenTab: TASK_TAB_IDS.includes(next.taskScreenTab)
      ? next.taskScreenTab
      : "next",
    finView: FINANCE_VIEW_IDS.includes(next.finView)
      ? next.finView
      : "overview",
    trainSection: TRAIN_SECTION_IDS.includes(next.trainSection)
      ? next.trainSection
      : "today",
    settingsSection: SETTINGS_SECTION_IDS.includes(next.settingsSection)
      ? next.settingsSection
      : null,
    healthTab: HEALTH_TAB_IDS.includes(next.healthTab)
      ? next.healthTab
      : "recovery",
    lifestyleTab: LIFESTYLE_TAB_IDS.includes(next.lifestyleTab)
      ? next.lifestyleTab
      : "habits",
  };
}
function getInitialNavigationState(today = getTodayKey()) {
  return readNavigationState(today);
}
function writeNavigationState(state, today = getTodayKey()) {
  const nextState = normalizeNavigationState(state, today);
  navigationStateCache = nextState;
  storage.setJSON(STORAGE_KEYS.navigation, nextState);
  return true;
}

function createNewTaskDraft(today, overrides = {}) {
  return {
    text: "",
    priority: 1,
    parentId: null,
    date: today,
    bucket: "next",
    contextTags: "",
    scheduledTime: "",
    endTime: "",
    energyLevel: null,
    ...overrides,
  };
}
function getMsUntilNextDay(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 50);
  return Math.max(50, nextMidnight - now);
}
function readDailyCheckinStore() {
  return dailyCheckinStoreCache;
}
function writeDailyCheckinStore(store) {
  dailyCheckinStoreCache = Object.entries(store || {}).reduce(
    (acc, [key, value]) => {
      const normalizedKey = normalizeDateKey(key, null);
      if (normalizedKey) acc[normalizedKey] = value;
      return acc;
    },
    {},
  );
  storage.setJSON(STORAGE_KEYS.dailyCheckin, dailyCheckinStoreCache);
  return true;
}
function getDailyCheckinEntry(dateKey = getTodayKey()) {
  const store = readDailyCheckinStore();
  return store?.[dateKey] && typeof store[dateKey] === "object"
    ? store[dateKey]
    : null;
}
function hasSavedDailyCheckin(entry, dateKey = getTodayKey()) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.completed === true) return true;
  return entry.date === dateKey;
}
function isDailyCheckinCompleted(dateKey = getTodayKey()) {
  return hasSavedDailyCheckin(getDailyCheckinEntry(dateKey), dateKey);
}
function buildDailyCheckinEntryFromProfile(profile, dateKey) {
  const log = profile?.dailyLogs?.[dateKey];
  if (!log?.checkInDone) return null;
  const fallbackEnergy =
    typeof log.checkInEnergy === "number"
      ? log.checkInEnergy
      : typeof log.energyScore === "number"
        ? Math.max(1, Math.min(5, Math.round(log.energyScore / 2)))
        : 3;
  const fallbackSleep =
    typeof log.sleepHours === "number" && log.sleepHours > 0
      ? log.sleepHours
      : 7;
  return {
    date: dateKey,
    timestamp:
      typeof log.timestamp === "string"
        ? log.timestamp
        : new Date(`${dateKey}T08:00:00.000Z`).toISOString(),
    mood: typeof log.mood === "number" ? log.mood : null,
    energy: fallbackEnergy,
    stress: typeof log.stress === "number" ? log.stress : null,
    note:
      typeof log.checkInNote === "string" && log.checkInNote.trim()
        ? log.checkInNote.trim()
        : null,
    sleep: fallbackSleep,
    sleepHours: fallbackSleep,
  };
}
function migrateDailyCheckinStore(profile) {
  const existingStore = readDailyCheckinStore();
  const nextStore = { ...existingStore };
  let changed = false;
  Object.keys(profile?.dailyLogs || {}).forEach((dateKey) => {
    const migratedEntry = buildDailyCheckinEntryFromProfile(profile, dateKey);
    if (!migratedEntry) return;
    const currentEntry = existingStore[dateKey];
    if (currentEntry?.completed === true) return;
    nextStore[dateKey] = migratedEntry;
    changed = true;
  });
  if (changed) writeDailyCheckinStore(nextStore);
  return changed ? nextStore : existingStore;
}
function saveDailyCheckin(dateKey, entry) {
  const store = readDailyCheckinStore();
  const nextStore = { ...store, [dateKey]: entry };
  writeDailyCheckinStore(nextStore);
  return nextStore;
}
function syncDailyCheckinTop3(dateKey, top3) {
  const store = readDailyCheckinStore();
  const existingEntry = store?.[dateKey];
  if (!hasSavedDailyCheckin(existingEntry, dateKey)) return store;
  const nextStore = { ...store, [dateKey]: existingEntry };
  writeDailyCheckinStore(nextStore);
  return nextStore;
}
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DEFAULT_START = "2026-03-16",
  DEFAULT_RACE = "2026-10-25";
const UNITS = {
  system: "imperial",
  dist: "mi",
  weight: "lbs",
  energy: "kcal",
  pace: "min/mi",
};
const fmtPaceMi = (secs) => {
  const m = Math.floor(secs / 60),
    s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")} /mi`;
};
const fmtDur = (mins) => {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60),
    m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const ACCOUNT_TYPE_OPTIONS = [
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "credit", label: "Credit Card" },
  { id: "cash", label: "Cash" },
  { id: "investment", label: "Investment" },
  { id: "loan", label: "Loan" },
  { id: "other", label: "Other" },
];
const LEGACY_ACCOUNT_REFERENCE_MAP = {
  ally_checking: "ally_checking",
  "ally checking": "ally_checking",
  "ally - checking": "ally_checking",
  "ally — checking": "ally_checking",
  "checking (ally)": "ally_checking",
  ally_savings: "ally_savings",
  "ally savings": "ally_savings",
  "ally - savings": "ally_savings",
  "ally — savings": "ally_savings",
  "savings (ally)": "ally_savings",
  regions_checking: "regions_checking",
  "regions checking": "regions_checking",
  "regions - checking": "regions_checking",
  "regions — checking": "regions_checking",
  "checking (regions)": "regions_checking",
  regions_savings: "regions_savings",
  "regions savings": "regions_savings",
  "regions - savings": "regions_savings",
  "regions — savings": "regions_savings",
  "savings (regions)": "regions_savings",
};

function normalizeAccountType(type) {
  const normalized = String(type || "checking")
    .trim()
    .toLowerCase();
  return ACCOUNT_TYPE_OPTIONS.some((option) => option.id === normalized)
    ? normalized
    : "other";
}
function slugifyAccountPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function buildAccountId(institution, name) {
  const base = [slugifyAccountPart(institution), slugifyAccountPart(name)]
    .filter(Boolean)
    .join("_");
  return base || `account_${Date.now()}`;
}
function createFinancialAccount(account = {}) {
  const institution = String(
    account.institution ?? account.institutionName ?? "",
  ).trim();
  const name =
    String(account.name ?? account.accountName ?? "").trim() || "Account";
  const currentBalance =
    account.currentBalance == null || account.currentBalance === ""
      ? null
      : parseFloat(account.currentBalance);
  const startingBalance =
    account.startingBalance == null || account.startingBalance === ""
      ? null
      : parseFloat(account.startingBalance);
  return {
    id: String(account.id || buildAccountId(institution, name)),
    name,
    institution,
    type: normalizeAccountType(account.type ?? account.accountType),
    isActive: account.isActive !== false,
    startingBalance: Number.isFinite(startingBalance) ? startingBalance : null,
    currentBalance: Number.isFinite(currentBalance) ? currentBalance : null,
    maskedNumber: String(account.maskedNumber || ""),
  };
}
function normalizeFinancialAccounts(accounts) {
  const source = Array.isArray(accounts) ? accounts : [];
  const seen = new Set();
  return source.reduce((list, account) => {
    const normalized = createFinancialAccount(account);
    if (!normalized.id || seen.has(normalized.id)) return list;
    seen.add(normalized.id);
    list.push(normalized);
    return list;
  }, []);
}
function getDefaultAccountId(accounts, includeArchived = false) {
  const list = (Array.isArray(accounts) ? accounts : []).filter(
    (account) => includeArchived || account.isActive !== false,
  );
  return list[0]?.id || "";
}
function formatAccountLabel(account) {
  if (!account) return "Unknown account";
  return (
    [account.institution, account.name].filter(Boolean).join(" — ") ||
    account.name ||
    account.id
  );
}
function resolveTransactionAccountId(rawAccountId, accounts) {
  const normalizedAccounts = Array.isArray(accounts) ? accounts : [];
  const value = String(rawAccountId || "").trim();
  if (!value) return getDefaultAccountId(normalizedAccounts, true);
  const byId = normalizedAccounts.find((account) => account.id === value);
  if (byId) return byId.id;
  const lowered = value.toLowerCase();
  const legacyId = LEGACY_ACCOUNT_REFERENCE_MAP[lowered];
  if (legacyId && normalizedAccounts.some((account) => account.id === legacyId))
    return legacyId;
  const byLabel = normalizedAccounts.find((account) => {
    const label = formatAccountLabel(account).toLowerCase();
    return (
      label === lowered ||
      label.replace(/[—-]/g, " ").replace(/\s+/g, " ").trim() ===
        lowered.replace(/[—-]/g, " ").replace(/\s+/g, " ").trim()
    );
  });
  if (byLabel) return byLabel.id;
  return getDefaultAccountId(normalizedAccounts, true);
}
function ensureImportedAccount(accounts, accountInput) {
  const normalizedAccounts = normalizeFinancialAccounts(accounts);
  const draft = createFinancialAccount({
    ...accountInput,
    isActive: accountInput?.isActive !== false,
  });
  const existing = normalizedAccounts.find(
    (account) =>
      account.id === draft.id ||
      (account.institution.toLowerCase() === draft.institution.toLowerCase() &&
        account.name.toLowerCase() === draft.name.toLowerCase() &&
        account.type === draft.type),
  );
  if (existing) return { accounts: normalizedAccounts, accountId: existing.id };
  return { accounts: [...normalizedAccounts, draft], accountId: draft.id };
}

const PHASES = [
  {
    name: "Base",
    wks: "1–8",
    theme: "Build the engine",
    clr: C.sage,
    lClr: C.sageL,
    tClr: C.sageDk,
  },
  {
    name: "Build",
    wks: "9–16",
    theme: "Add volume + stations",
    clr: C.navy,
    lClr: C.navyL,
    tClr: C.navyDk,
  },
  {
    name: "Specificity",
    wks: "17–23",
    theme: "Train the race format",
    clr: C.amber,
    lClr: C.amberL,
    tClr: C.amberDk,
  },
  {
    name: "Peak",
    wks: "24–28",
    theme: "Max race-specific load",
    clr: C.primary || C.navy,
    lClr: C.navyL,
    tClr: C.navyDk,
  },
  {
    name: "Taper",
    wks: "29–32",
    theme: "Arrive fresh and sharp",
    clr: C.muted,
    lClr: C.surf,
    tClr: C.tx2,
  },
];

const PLANS = [
  {
    id: "hyrox",
    name: "HYROX training plan",
    sub: "October 2026 · 32 weeks",
    desc: "A 32-week phased plan for HYROX Tampa. Alternates general and HYROX-specific weeks across 5 phases.",
  },
];

const ALL_STATIONS = [
  "SkiErg",
  "Sled Push",
  "Sled Pull",
  "Burpee Broad Jump",
  "Row",
  "Farmers Carry",
  "Sandbag Lunges",
  "Wall Ball",
];
const FITNESS_PROGRAM_OPTIONS = [
  { id: "hyrox", label: "HYROX" },
  { id: "running", label: "Running" },
  { id: "strength", label: "Strength" },
  { id: "pilates", label: "Pilates" },
  { id: "recovery", label: "Recovery" },
];
const FITNESS_PROGRAM_ALIASES = { none: "recovery", general: "recovery" };
const FITNESS_ADD_ON_OPTIONS = [
  { id: "pilates", label: "Pilates" },
  { id: "recovery", label: "Recovery" },
];
const DEFAULT_ATHLETE = {
  fiveKTime: null,
  hyroxFinishTime: null,
  weakStations: [],
  strongStations: [],
  squat5RM: null,
  deadlift5RM: null,
  wallBallMaxReps: null,
  preferredTrainingDays: ["Mon", "Wed", "Fri", "Sun"],
  programType: "4-day",
  trainingWeekStart: "Mon",
  primaryProgram: "hyrox",
  secondaryAddOns: [],
  raceDate: DEFAULT_RACE,
  planStartDate: DEFAULT_START,
};

function normalizeFitnessProgram(program = "hyrox") {
  const normalized = String(program || "hyrox")
    .trim()
    .toLowerCase();
  if (FITNESS_PROGRAM_OPTIONS.some((option) => option.id === normalized))
    return normalized;
  return FITNESS_PROGRAM_ALIASES[normalized] || "hyrox";
}

function getAnchoredTrainingDays(
  programType = "4-day",
  trainingWeekStart = "Mon",
) {
  const normalizedProgramType = programType === "5-day" ? "5-day" : "4-day";
  const startLabel = ["Sun", "Mon", "Wed"].includes(trainingWeekStart)
    ? trainingWeekStart
    : "Mon";
  const dayIndexToLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const startIdx = dayIndexToLabel.indexOf(startLabel);
  const offsets =
    normalizedProgramType === "5-day" ? [0, 1, 2, 4, 6] : [0, 2, 4, 6];
  return offsets.map((offset) => dayIndexToLabel[(startIdx + offset) % 7]);
}

function orderTrainingDays(days = [], trainingWeekStart = "Mon") {
  const dayIndexToLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const startIdx = dayIndexToLabel.indexOf(
    ["Sun", "Mon", "Wed"].includes(trainingWeekStart)
      ? trainingWeekStart
      : "Mon",
  );
  const rank = new Map(
    dayIndexToLabel.map((label, idx) => [label, (idx - startIdx + 7) % 7]),
  );
  return [...new Set(days)]
    .filter((label) => rank.has(label))
    .sort((a, b) => rank.get(a) - rank.get(b));
}

function resolveAthleteProfile(profileAthlete = {}, legacyTrainingPlan = {}) {
  const trainingWeekStart = ["Sun", "Mon", "Wed"].includes(
    profileAthlete?.trainingWeekStart,
  )
    ? profileAthlete.trainingWeekStart
    : "Mon";
  const initialProgramType =
    profileAthlete?.programType === "5-day" ? "5-day" : "4-day";
  const preferredTrainingDays = orderTrainingDays(
    Array.isArray(profileAthlete?.preferredTrainingDays) &&
      profileAthlete.preferredTrainingDays.length
      ? profileAthlete.preferredTrainingDays
      : getAnchoredTrainingDays(initialProgramType, trainingWeekStart),
    trainingWeekStart,
  );
  const programType = preferredTrainingDays.length >= 5 ? "5-day" : "4-day";
  return {
    ...DEFAULT_ATHLETE,
    ...(profileAthlete || {}),
    trainingWeekStart,
    programType,
    preferredTrainingDays: preferredTrainingDays.length
      ? preferredTrainingDays
      : getAnchoredTrainingDays(programType, trainingWeekStart),
    planStartDate:
      normalizeDateKey(
        profileAthlete?.planStartDate || legacyTrainingPlan?.startDate,
        DEFAULT_START,
      ) || DEFAULT_START,
    raceDate:
      normalizeDateKey(
        profileAthlete?.raceDate || legacyTrainingPlan?.raceDate,
        DEFAULT_RACE,
      ) || DEFAULT_RACE,
  };
}

function getTrainingWeekAnchorDate(dateLike, trainingWeekStart = "Mon") {
  const anchorDow =
    trainingWeekStart === "Wed" ? 3 : trainingWeekStart === "Sun" ? 0 : 1;
  const anchored = new Date(
    typeof dateLike === "string" ? `${dateLike}T12:00:00` : dateLike,
  );
  anchored.setHours(0, 0, 0, 0);
  anchored.setDate(
    anchored.getDate() - ((anchored.getDay() - anchorDow + 7) % 7),
  );
  return anchored;
}

function getMondayWeekStartDate(dateLike) {
  const anchored =
    dateLike instanceof Date
      ? new Date(dateLike.getTime())
      : parseDateKey(normalizeDateKey(dateLike));
  anchored.setHours(0, 0, 0, 0);
  anchored.setDate(anchored.getDate() - ((anchored.getDay() + 6) % 7));
  return anchored;
}

function getTrainingCycleState(
  planStartDate = DEFAULT_START,
  raceDate = DEFAULT_RACE,
  referenceDate = getCurrentDate().today,
) {
  const resolvedStart =
    normalizeDateKey(planStartDate, DEFAULT_START) || DEFAULT_START;
  const resolvedRace = normalizeDateKey(raceDate, DEFAULT_RACE) || DEFAULT_RACE;
  const currentDate =
    typeof referenceDate === "string"
      ? new Date(`${referenceDate}T12:00:00`)
      : new Date(referenceDate);
  currentDate.setHours(12, 0, 0, 0);
  const startDate = new Date(`${resolvedStart}T12:00:00`);
  const raceDateObj = new Date(`${resolvedRace}T12:00:00`);
  const elapsedDays = Math.max(
    0,
    Math.floor((currentDate - startDate) / 86400000),
  );
  const totalWeeks = Math.max(
    1,
    Math.round((raceDateObj - startDate) / (7 * 86400000)),
  );
  const currentWeek = Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);
  const weekType = currentWeek % 2 === 1 ? "A" : "B";
  const taperStartWeek = Math.max(totalWeeks - 3, 1);
  const peakStartWeek = Math.max(taperStartWeek - 5, 1);
  const specificityStartWeek = Math.max(peakStartWeek - 7, 1);
  const buildStartWeek = Math.max(specificityStartWeek - 8, 1);
  const phaseEnds = [
    buildStartWeek - 1,
    specificityStartWeek - 1,
    peakStartWeek - 1,
    taperStartWeek - 1,
    totalWeeks,
  ];
  const phaseIndex =
    currentWeek <= phaseEnds[0]
      ? 0
      : currentWeek <= phaseEnds[1]
        ? 1
        : currentWeek <= phaseEnds[2]
          ? 2
          : currentWeek <= phaseEnds[3]
            ? 3
            : 4;
  return {
    planStartDate: resolvedStart,
    raceDate: resolvedRace,
    totalWeeks,
    currentWeek,
    weekType,
    daysToRace: Math.max(0, Math.ceil((raceDateObj - currentDate) / 86400000)),
    weeksToRace: Math.max(
      0,
      Math.ceil((raceDateObj - currentDate) / 604800000),
    ),
    phaseIndex,
    phase: PHASES[phaseIndex],
    phaseCode:
      ["base", "build", "specificity", "peak", "taper"][phaseIndex] || "base",
    taperStartWeek,
    peakStartWeek,
    specificityStartWeek,
    buildStartWeek,
  };
}

const PROGRAM_LIBRARY_META = {
  hyrox: {
    title: "HYROX race build",
    detail:
      "Strength, running, and station simulations with an A/B weekly rotation.",
  },
  running: {
    title: "Running performance",
    detail:
      "Run-focused weekly structure with easy, quality, tempo, and long-run distribution.",
  },
  strength: {
    title: "Strength building",
    detail:
      "Progressive upper, lower, and full-body sessions with optional fifth-day accessories.",
  },
  pilates: {
    title: "Pilates focus",
    detail:
      "Core control, posture, glute strength, and low-impact mobility in a structured weekly cadence.",
  },
  recovery: {
    title: "Recovery reset",
    detail:
      "Low-intensity mobility, zone-2 cardio, breathwork, and nervous-system downshifting across the week.",
  },
};
const PROGRAM_DETAIL_CARDS = {
  hyrox: {
    sessions: [
      "HYROX station simulation",
      "Strength + carries",
      "Tempo or long run",
      "Full sim or race prep",
    ],
    duration: "45–70 min",
    structure: "4 days / week · A/B rotation",
    note: "Best for intermediate fitness training toward a HYROX event.",
  },
  running: {
    sessions: [
      "Easy aerobic run",
      "Interval or hill session",
      "Tempo run",
      "Long run",
    ],
    duration: "35–75 min",
    structure: "4–5 days / week · A/B rotation",
    note: "Best for building run performance with structured weekly distribution.",
  },
  strength: {
    sessions: [
      "Upper body press + pull",
      "Lower body squat + hinge",
      "Full-body hypertrophy",
      "Accessories + carries",
    ],
    duration: "40–65 min",
    structure: "4–5 days / week · A/B rotation",
    note: "Best for gym-access training with a progressive strength focus.",
  },
  pilates: {
    sessions: [
      "Core control",
      "Lower body stability",
      "Posture + upper body",
      "Full-body flow",
    ],
    duration: "30–45 min",
    structure: "4–5 days / week · A/B rotation",
    note: "Low-impact and sustainable. Best for core, posture, and recovery-phase training.",
  },
  recovery: {
    sessions: [
      "Active recovery cardio",
      "Mobility reset",
      "Recovery Pilates",
      "Nervous system reset",
    ],
    duration: "20–35 min",
    structure: "4–5 days / week · A/B rotation",
    note: "Minimal-stress structure. Best during high life-load or injury prevention periods.",
  },
};

const PROGRAM_WORKOUT_LIBRARY = {
  running: {
    "4-day": {
      A: {
        mon: {
          type: "run",
          name: "Easy aerobic run",
          dur: "35–45 min",
          intensity: "Easy",
          purpose: "Build aerobic volume without adding much stress.",
          rd: {
            label: "Easy run",
            dist: "3–4 mi",
            effort: "Conversational and relaxed from start to finish.",
          },
        },
        wed: {
          type: "run",
          name: "Interval run",
          dur: "40–50 min",
          intensity: "Hard",
          purpose: "Raise top-end speed and VO2 with controlled repeat work.",
          rd: {
            label: "Intervals",
            dist: "5×3 min",
            effort: "Hard but repeatable. Jog 2 min between efforts.",
          },
        },
        fri: {
          type: "run",
          name: "Tempo run",
          dur: "40–50 min",
          intensity: "Moderate–Hard",
          purpose: "Push threshold pace while keeping form smooth.",
          rd: {
            label: "Tempo run",
            dist: "20 min tempo",
            effort: "10 min easy, 20 min comfortably hard, 10 min easy.",
          },
        },
        sat: {
          type: "run",
          name: "Long run",
          dur: "55–70 min",
          intensity: "Easy",
          purpose: "Build long aerobic durability with low strain.",
          rd: {
            label: "Long run",
            dist: "5–7 mi",
            effort: "Stay controlled and conversational.",
          },
        },
      },
      B: {
        mon: {
          type: "run",
          name: "Easy run + strides",
          dur: "35–45 min",
          intensity: "Easy",
          purpose: "Maintain easy mileage and touch turnover at the end.",
          rd: {
            label: "Easy run",
            dist: "3–4 mi + 4 strides",
            effort: "Easy throughout. Finish with 4×20s strides.",
          },
        },
        wed: {
          type: "run",
          name: "Hill or interval session",
          dur: "40–50 min",
          intensity: "Hard",
          purpose: "Develop power and economy with quality running work.",
          rd: {
            label: "Hills / intervals",
            dist: "6 reps",
            effort: "Hard uphill or fast repeat with full control on recovery.",
          },
        },
        fri: {
          type: "run",
          name: "Steady threshold run",
          dur: "45–55 min",
          intensity: "Moderate",
          purpose: "Hold a strong aerobic effort without overreaching.",
          rd: {
            label: "Steady run",
            dist: "4–5 mi",
            effort: "Settle into a strong but sustainable pace.",
          },
        },
        sat: {
          type: "run",
          name: "Long progression run",
          dur: "60–75 min",
          intensity: "Easy–Moderate",
          purpose: "Close the long run a little stronger while staying smooth.",
          rd: {
            label: "Progression long run",
            dist: "5.5–7.5 mi",
            effort: "Start easy, finish the last 15 min steady.",
          },
        },
      },
    },
    "5-day": {
      A: {
        mon: {
          type: "run",
          name: "Easy aerobic run",
          dur: "35–45 min",
          intensity: "Easy",
          purpose: "Build aerobic volume without adding much stress.",
          rd: {
            label: "Easy run",
            dist: "3–4 mi",
            effort: "Conversational and relaxed from start to finish.",
          },
        },
        tue: {
          type: "run",
          name: "Recovery run",
          dur: "25–30 min",
          intensity: "Easy",
          purpose: "Add low-stress mileage between bigger sessions.",
          rd: {
            label: "Recovery run",
            dist: "2–3 mi",
            effort: "Very easy. Keep it light.",
          },
        },
        wed: {
          type: "run",
          name: "Interval run",
          dur: "40–50 min",
          intensity: "Hard",
          purpose: "Raise top-end speed and VO2 with controlled repeat work.",
          rd: {
            label: "Intervals",
            dist: "5×3 min",
            effort: "Hard but repeatable. Jog 2 min between efforts.",
          },
        },
        thu: {
          name: "Runner strength + mobility",
          dur: "30–40 min",
          intensity: "Moderate",
          purpose: "Support running with glutes, calves, and trunk stability.",
          ex: [
            { n: "Goblet squat", s: 3, r: "10", note: "" },
            { n: "Single-leg RDL", s: 3, r: "8ea", note: "" },
            { n: "Standing calf raise", s: 3, r: "15", note: "" },
            { n: "Dead bug", s: 3, r: "8ea", note: "" },
            { n: "Side plank", s: 3, r: "25s ea", note: "" },
          ],
        },
        sat: {
          type: "run",
          name: "Long run",
          dur: "55–70 min",
          intensity: "Easy",
          purpose: "Build long aerobic durability with low strain.",
          rd: {
            label: "Long run",
            dist: "5–7 mi",
            effort: "Stay controlled and conversational.",
          },
        },
      },
      B: {
        mon: {
          type: "run",
          name: "Easy run + strides",
          dur: "35–45 min",
          intensity: "Easy",
          purpose: "Maintain easy mileage and touch turnover at the end.",
          rd: {
            label: "Easy run",
            dist: "3–4 mi + 4 strides",
            effort: "Easy throughout. Finish with 4×20s strides.",
          },
        },
        tue: {
          type: "run",
          name: "Recovery run",
          dur: "25–30 min",
          intensity: "Easy",
          purpose: "Add low-stress mileage between bigger sessions.",
          rd: {
            label: "Recovery run",
            dist: "2–3 mi",
            effort: "Very easy. Keep it light.",
          },
        },
        wed: {
          type: "run",
          name: "Hill or interval session",
          dur: "40–50 min",
          intensity: "Hard",
          purpose: "Develop power and economy with quality running work.",
          rd: {
            label: "Hills / intervals",
            dist: "6 reps",
            effort: "Hard uphill or fast repeat with full control on recovery.",
          },
        },
        thu: {
          name: "Runner strength + mobility",
          dur: "30–40 min",
          intensity: "Moderate",
          purpose: "Support running with glutes, calves, and trunk stability.",
          ex: [
            { n: "Walking lunges", s: 3, r: "10ea", note: "" },
            { n: "Hip thrust", s: 3, r: "10", note: "" },
            { n: "Standing calf raise", s: 3, r: "15", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
            {
              n: "Thoracic rotation",
              s: 2,
              r: "6ea",
              note: "Smooth and easy.",
              exerciseType: "mobility",
            },
          ],
        },
        sat: {
          type: "run",
          name: "Long progression run",
          dur: "60–75 min",
          intensity: "Easy–Moderate",
          purpose: "Close the long run a little stronger while staying smooth.",
          rd: {
            label: "Progression long run",
            dist: "5.5–7.5 mi",
            effort: "Start easy, finish the last 15 min steady.",
          },
        },
      },
    },
  },
  strength: {
    "4-day": {
      A: {
        mon: {
          name: "Upper body strength build",
          dur: "50–60 min",
          intensity: "Moderate–Hard",
          purpose: "Build pressing and pulling strength with crisp volume.",
          ex: [
            {
              n: "Barbell bench press",
              s: 4,
              r: "6",
              note: "Leave 1–2 reps in reserve.",
            },
            {
              n: "Weighted pull-up or lat pulldown",
              s: 4,
              r: "8",
              note: "Control the eccentric.",
            },
            { n: "Incline dumbbell press", s: 3, r: "10", note: "" },
            {
              n: "Single-arm dumbbell row",
              s: 3,
              r: "10ea",
              note: "Brace and pause at the top.",
            },
            { n: "Face pull", s: 3, r: "15", note: "Shoulders stay down." },
            { n: "Plank hold", s: 3, r: "40s", note: "" },
          ],
        },
        wed: {
          name: "Lower body strength build",
          dur: "55–65 min",
          intensity: "Moderate–Hard",
          purpose: "Progress squat, hinge, and unilateral lower-body strength.",
          ex: [
            {
              n: "Barbell back squat",
              s: 4,
              r: "5",
              note: "Build across sets.",
            },
            { n: "Romanian deadlift", s: 4, r: "8", note: "Own the hinge." },
            { n: "Bulgarian split squat", s: 3, r: "8ea", note: "Full range." },
            { n: "Hip thrust", s: 3, r: "10", note: "Pause at the top." },
            { n: "Calf raise", s: 3, r: "15", note: "Slow eccentric." },
            { n: "Dead bug", s: 3, r: "8ea", note: "" },
          ],
        },
        fri: {
          name: "Full body hypertrophy",
          dur: "50–60 min",
          intensity: "Moderate",
          purpose:
            "Accumulate quality strength volume without max effort fatigue.",
          ex: [
            { n: "Trap bar deadlift", s: 4, r: "6", note: "Smooth reps." },
            { n: "Dumbbell shoulder press", s: 3, r: "10", note: "" },
            { n: "Lat pulldown", s: 3, r: "10", note: "" },
            { n: "Goblet squat", s: 3, r: "12", note: "Stay upright." },
            { n: "Farmers carry", s: 4, r: "40m", note: "Braced core." },
            { n: "Hollow body hold", s: 3, r: "30s", note: "" },
          ],
        },
        sat: {
          name: "Strength accessories + carries",
          dur: "40–50 min",
          intensity: "Moderate",
          purpose:
            "Build work capacity and trunk stiffness without a full extra heavy day.",
          ex: [
            {
              n: "Walking lunges",
              s: 3,
              r: "12ea",
              note: "Long stride, upright torso.",
            },
            {
              n: "Kettlebell swings",
              s: 4,
              r: "15",
              note: "Explode from the hips.",
            },
            { n: "Seated cable row", s: 3, r: "12", note: "" },
            { n: "Push-up", s: 3, r: "12", note: "Leave a rep in reserve." },
            { n: "Farmers carry", s: 4, r: "50m", note: "Steady breathing." },
            { n: "Side plank", s: 3, r: "30s ea", note: "" },
          ],
        },
      },
      B: {
        mon: {
          name: "Upper body strength peak",
          dur: "50–60 min",
          intensity: "Hard",
          purpose: "Drive heavier pressing and pulling with lower total reps.",
          ex: [
            { n: "Bench press", s: 5, r: "4", note: "Heavy but crisp." },
            { n: "Weighted pull-up", s: 5, r: "4", note: "No grinding." },
            { n: "Bent-over barbell row", s: 4, r: "6", note: "" },
            { n: "Arnold press", s: 3, r: "8", note: "" },
            { n: "Face pull", s: 3, r: "15", note: "" },
            { n: "Pallof press", s: 3, r: "10ea", note: "" },
          ],
        },
        wed: {
          name: "Lower body strength peak",
          dur: "55–65 min",
          intensity: "Hard",
          purpose:
            "Push the squat and hinge patterns while keeping movement clean.",
          ex: [
            { n: "Barbell back squat", s: 5, r: "3", note: "Heavy triples." },
            { n: "Romanian deadlift", s: 4, r: "6", note: "Own the hinge." },
            {
              n: "Step-up",
              s: 3,
              r: "8ea",
              note: "Drive through the whole foot.",
            },
            { n: "Hip thrust", s: 3, r: "8", note: "Pause hard at the top." },
            { n: "Copenhagen plank", s: 3, r: "20s ea", note: "" },
            { n: "Calf raise", s: 3, r: "12", note: "" },
          ],
        },
        fri: {
          name: "Full body power + core",
          dur: "45–55 min",
          intensity: "Moderate–Hard",
          purpose:
            "Keep strength moving while adding power and loaded carries.",
          ex: [
            {
              n: "Trap bar deadlift",
              s: 4,
              r: "5",
              note: "Explosive concentric.",
            },
            { n: "Push press", s: 4, r: "5", note: "Leg drive then lockout." },
            { n: "Single-arm row", s: 3, r: "10ea", note: "" },
            {
              n: "Sandbag lunges",
              s: 3,
              r: "20m",
              note: "Short controlled steps.",
            },
            { n: "Farmers carry", s: 4, r: "60m", note: "Heavy and clean." },
            { n: "Dead bug", s: 3, r: "10ea", note: "" },
          ],
        },
        sat: {
          name: "Movement quality lift day",
          dur: "35–45 min",
          intensity: "Moderate",
          purpose:
            "Keep momentum with submaximal technique work and trunk training.",
          ex: [
            { n: "Goblet squat", s: 3, r: "10", note: "Pause in the hole." },
            { n: "Dumbbell bench press", s: 3, r: "10", note: "" },
            { n: "Cable row", s: 3, r: "12", note: "" },
            { n: "Walking lunges", s: 2, r: "10ea", note: "" },
            { n: "Suitcase carry", s: 3, r: "30m ea", note: "Stay tall." },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
          ],
        },
      },
    },
    "5-day": {
      A: {
        mon: {
          name: "Upper body strength build",
          dur: "50–60 min",
          intensity: "Moderate–Hard",
          purpose: "Build pressing and pulling strength with crisp volume.",
          ex: [
            {
              n: "Barbell bench press",
              s: 4,
              r: "6",
              note: "Leave 1–2 reps in reserve.",
            },
            {
              n: "Weighted pull-up or lat pulldown",
              s: 4,
              r: "8",
              note: "Control the eccentric.",
            },
            { n: "Incline dumbbell press", s: 3, r: "10", note: "" },
            {
              n: "Single-arm dumbbell row",
              s: 3,
              r: "10ea",
              note: "Brace and pause at the top.",
            },
            { n: "Face pull", s: 3, r: "15", note: "Shoulders stay down." },
            { n: "Plank hold", s: 3, r: "40s", note: "" },
          ],
        },
        tue: {
          name: "Accessory trunk + carry work",
          dur: "35–40 min",
          intensity: "Moderate",
          purpose:
            "Add a short fifth day for trunk strength, carries, and shoulder health.",
          ex: [
            { n: "Farmers carry", s: 4, r: "40m", note: "Controlled pace." },
            { n: "Suitcase carry", s: 3, r: "25m ea", note: "No leaning." },
            { n: "Band pull-apart", s: 3, r: "20", note: "" },
            { n: "Dead bug", s: 3, r: "10ea", note: "" },
            { n: "Side plank", s: 3, r: "30s ea", note: "" },
          ],
        },
        wed: {
          name: "Lower body strength build",
          dur: "55–65 min",
          intensity: "Moderate–Hard",
          purpose: "Progress squat, hinge, and unilateral lower-body strength.",
          ex: [
            {
              n: "Barbell back squat",
              s: 4,
              r: "5",
              note: "Build across sets.",
            },
            { n: "Romanian deadlift", s: 4, r: "8", note: "Own the hinge." },
            { n: "Bulgarian split squat", s: 3, r: "8ea", note: "Full range." },
            { n: "Hip thrust", s: 3, r: "10", note: "Pause at the top." },
            { n: "Calf raise", s: 3, r: "15", note: "Slow eccentric." },
            { n: "Dead bug", s: 3, r: "8ea", note: "" },
          ],
        },
        thu: {
          name: "Upper back + shoulder volume",
          dur: "40–50 min",
          intensity: "Moderate",
          purpose:
            "Round out the week with extra pull volume and scapular control.",
          ex: [
            { n: "Lat pulldown", s: 4, r: "10", note: "" },
            { n: "Seated cable row", s: 4, r: "10", note: "" },
            { n: "Dumbbell shoulder press", s: 3, r: "10", note: "" },
            { n: "Face pull", s: 3, r: "15", note: "" },
            { n: "Push-up", s: 3, r: "10", note: "" },
            { n: "Hollow body hold", s: 3, r: "30s", note: "" },
          ],
        },
        sat: {
          name: "Strength accessories + carries",
          dur: "40–50 min",
          intensity: "Moderate",
          purpose:
            "Build work capacity and trunk stiffness without a full extra heavy day.",
          ex: [
            {
              n: "Walking lunges",
              s: 3,
              r: "12ea",
              note: "Long stride, upright torso.",
            },
            {
              n: "Kettlebell swings",
              s: 4,
              r: "15",
              note: "Explode from the hips.",
            },
            { n: "Seated cable row", s: 3, r: "12", note: "" },
            { n: "Push-up", s: 3, r: "12", note: "Leave a rep in reserve." },
            { n: "Farmers carry", s: 4, r: "50m", note: "Steady breathing." },
            { n: "Side plank", s: 3, r: "30s ea", note: "" },
          ],
        },
      },
      B: {
        mon: {
          name: "Upper body strength peak",
          dur: "50–60 min",
          intensity: "Hard",
          purpose: "Drive heavier pressing and pulling with lower total reps.",
          ex: [
            { n: "Bench press", s: 5, r: "4", note: "Heavy but crisp." },
            { n: "Weighted pull-up", s: 5, r: "4", note: "No grinding." },
            { n: "Bent-over barbell row", s: 4, r: "6", note: "" },
            { n: "Arnold press", s: 3, r: "8", note: "" },
            { n: "Face pull", s: 3, r: "15", note: "" },
            { n: "Pallof press", s: 3, r: "10ea", note: "" },
          ],
        },
        tue: {
          name: "Short carry + core primer",
          dur: "30–35 min",
          intensity: "Moderate",
          purpose:
            "Keep the extra training day productive without stealing recovery.",
          ex: [
            {
              n: "Farmers carry",
              s: 4,
              r: "30m",
              note: "Heavy, clean posture.",
            },
            { n: "Suitcase carry", s: 3, r: "25m ea", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
            { n: "Copenhagen plank", s: 3, r: "20s ea", note: "" },
          ],
        },
        wed: {
          name: "Lower body strength peak",
          dur: "55–65 min",
          intensity: "Hard",
          purpose:
            "Push the squat and hinge patterns while keeping movement clean.",
          ex: [
            { n: "Barbell back squat", s: 5, r: "3", note: "Heavy triples." },
            { n: "Romanian deadlift", s: 4, r: "6", note: "Own the hinge." },
            {
              n: "Step-up",
              s: 3,
              r: "8ea",
              note: "Drive through the whole foot.",
            },
            { n: "Hip thrust", s: 3, r: "8", note: "Pause hard at the top." },
            { n: "Copenhagen plank", s: 3, r: "20s ea", note: "" },
            { n: "Calf raise", s: 3, r: "12", note: "" },
          ],
        },
        thu: {
          name: "Upper back density day",
          dur: "40–45 min",
          intensity: "Moderate",
          purpose:
            "Keep the upper body volume high without another true max-effort session.",
          ex: [
            { n: "Lat pulldown", s: 4, r: "8", note: "" },
            { n: "Single-arm row", s: 3, r: "10ea", note: "" },
            { n: "Push press", s: 3, r: "6", note: "Smooth timing." },
            { n: "Band pull-apart", s: 3, r: "20", note: "" },
            { n: "Plank hold", s: 3, r: "40s", note: "" },
          ],
        },
        sat: {
          name: "Movement quality lift day",
          dur: "35–45 min",
          intensity: "Moderate",
          purpose:
            "Keep momentum with submaximal technique work and trunk training.",
          ex: [
            { n: "Goblet squat", s: 3, r: "10", note: "Pause in the hole." },
            { n: "Dumbbell bench press", s: 3, r: "10", note: "" },
            { n: "Cable row", s: 3, r: "12", note: "" },
            { n: "Walking lunges", s: 2, r: "10ea", note: "" },
            { n: "Suitcase carry", s: 3, r: "30m ea", note: "Stay tall." },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
          ],
        },
      },
    },
  },
  pilates: {
    "4-day": {
      A: {
        mon: {
          type: "recovery",
          name: "Pilates core control",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Build deep-core control, rib positioning, and smooth spinal articulation.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Ribs down, slow exhale.",
              exerciseType: "breathing",
            },
            {
              n: "Pelvic tilts",
              s: 2,
              r: "10",
              note: "Segment the spine.",
              exerciseType: "mobility",
            },
            {
              n: "Dead bug",
              s: 3,
              r: "8ea",
              note: "Keep low back anchored.",
              exerciseType: "mobility",
            },
            {
              n: "Glute bridges",
              s: 3,
              r: "12",
              note: "Pause at the top.",
              exerciseType: "mobility",
            },
            {
              n: "Toe taps",
              s: 3,
              r: "10ea",
              note: "Move slowly.",
              exerciseType: "mobility",
            },
          ],
        },
        wed: {
          type: "recovery",
          name: "Pilates lower body stability",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Train hip control, glute engagement, and unilateral balance.",
          ex: [
            {
              n: "Bird dog",
              s: 3,
              r: "8ea",
              note: "Reach long.",
              exerciseType: "mobility",
            },
            {
              n: "Side-lying leg lifts",
              s: 3,
              r: "12ea",
              note: "No momentum.",
              exerciseType: "mobility",
            },
            {
              n: "Clamshell",
              s: 3,
              r: "15ea",
              note: "Pelvis stays stacked.",
              exerciseType: "mobility",
            },
            {
              n: "Single-leg glute bridge",
              s: 2,
              r: "10ea",
              note: "Drive through full foot.",
              exerciseType: "mobility",
            },
            {
              n: "Standing calf raise",
              s: 2,
              r: "15",
              note: "Smooth tempo.",
              exerciseType: "mobility",
            },
          ],
        },
        fri: {
          type: "recovery",
          name: "Pilates posture + upper body",
          dur: "30–35 min",
          intensity: "Low–Moderate",
          purpose:
            "Improve scapular control, thoracic mobility, and upright posture.",
          ex: [
            {
              n: "Thoracic rotation",
              s: 2,
              r: "6ea",
              note: "Rotate through upper back.",
              exerciseType: "mobility",
            },
            {
              n: "Band pull-apart",
              s: 3,
              r: "15",
              note: "Shoulders down.",
              exerciseType: "mobility",
            },
            {
              n: "Y-T-W raises",
              s: 2,
              r: "8 each",
              note: "Small precise reps.",
              exerciseType: "mobility",
            },
            {
              n: "Wall slides",
              s: 3,
              r: "10",
              note: "Ribs stay tucked.",
              exerciseType: "mobility",
            },
            {
              n: "Side plank",
              s: 3,
              r: "25s ea",
              note: "Long line from heel to head.",
              exerciseType: "mobility",
            },
          ],
        },
        sat: {
          type: "recovery",
          name: "Full-body Pilates flow",
          dur: "40–45 min",
          intensity: "Moderate",
          purpose:
            "Stitch the week together with a longer, low-impact full-body flow.",
          ex: [
            {
              n: "Cat-cow",
              s: 2,
              r: "45s",
              note: "Move with your breath.",
              exerciseType: "mobility",
            },
            {
              n: "Roll up",
              s: 3,
              r: "6",
              note: "One vertebra at a time.",
              exerciseType: "mobility",
            },
            {
              n: "Glute bridges",
              s: 3,
              r: "12",
              note: "Pause on top.",
              exerciseType: "mobility",
            },
            {
              n: "Bird dog",
              s: 3,
              r: "8ea",
              note: "Stay square.",
              exerciseType: "mobility",
            },
            { n: "Side-lying leg lifts", s: 3, r: "12ea", note: "" },
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Finish calm.",
              exerciseType: "breathing",
            },
          ],
        },
      },
      B: {
        mon: {
          type: "recovery",
          name: "Pilates reset flow",
          dur: "30–35 min",
          intensity: "Low",
          purpose:
            "Reset the trunk and hips with a slower, breath-led opening session.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "120s",
              note: "Long exhale.",
              exerciseType: "breathing",
            },
            { n: "Pelvic tilts", s: 2, r: "10", note: "" },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
            {
              n: "Hamstring floss",
              s: 2,
              r: "8ea",
              note: "Ease into range.",
              exerciseType: "mobility",
            },
            {
              n: "Supine twist",
              s: 2,
              r: "30s ea",
              note: "Breathe into the floor.",
              exerciseType: "mobility",
            },
          ],
        },
        wed: {
          type: "recovery",
          name: "Pilates glute + trunk strength",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Add a little more challenge through the hips and trunk without impact.",
          ex: [
            { n: "Single-leg glute bridge", s: 3, r: "8ea", note: "" },
            { n: "Dead bug", s: 3, r: "10ea", note: "" },
            { n: "Side plank", s: 3, r: "25s ea", note: "" },
            { n: "Clamshell", s: 3, r: "15ea", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
          ],
        },
        fri: {
          type: "recovery",
          name: "Pilates balance + rotation",
          dur: "30–35 min",
          intensity: "Low–Moderate",
          purpose:
            "Focus on control through unilateral balance and rotational mobility.",
          ex: [
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            {
              n: "Standing balance reach",
              s: 3,
              r: "6ea",
              note: "Slow and steady.",
              exerciseType: "mobility",
            },
            {
              n: "Lateral lunge",
              s: 2,
              r: "8ea",
              note: "Use bodyweight only.",
              exerciseType: "mobility",
            },
            {
              n: "Pallof press",
              s: 3,
              r: "8ea",
              note: "Hold each rep.",
              exerciseType: "mobility",
            },
            { n: "Breathing drills", s: 1, r: "90s", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Long Pilates recovery flow",
          dur: "40–45 min",
          intensity: "Low–Moderate",
          purpose:
            "Restore range and reinforce smooth movement patterns with a longer mat session.",
          ex: [
            { n: "Roll up", s: 3, r: "6", note: "" },
            { n: "Glute bridges", s: 3, r: "12", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
            { n: "Side-lying leg lifts", s: 3, r: "12ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
          ],
        },
      },
    },
    "5-day": {
      A: {
        mon: {
          type: "recovery",
          name: "Pilates core control",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Build deep-core control, rib positioning, and smooth spinal articulation.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Ribs down, slow exhale.",
              exerciseType: "breathing",
            },
            {
              n: "Pelvic tilts",
              s: 2,
              r: "10",
              note: "Segment the spine.",
              exerciseType: "mobility",
            },
            {
              n: "Dead bug",
              s: 3,
              r: "8ea",
              note: "Keep low back anchored.",
              exerciseType: "mobility",
            },
            {
              n: "Glute bridges",
              s: 3,
              r: "12",
              note: "Pause at the top.",
              exerciseType: "mobility",
            },
            {
              n: "Toe taps",
              s: 3,
              r: "10ea",
              note: "Move slowly.",
              exerciseType: "mobility",
            },
          ],
        },
        tue: {
          type: "recovery",
          name: "Pilates breath + mobility",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "Keep the extra day low stress with breath-led trunk and hip mobility.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "120s",
              note: "Long exhales.",
              exerciseType: "breathing",
            },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
            { n: "Thoracic rotation", s: 2, r: "5ea", note: "" },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
          ],
        },
        wed: {
          type: "recovery",
          name: "Pilates lower body stability",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Train hip control, glute engagement, and unilateral balance.",
          ex: [
            {
              n: "Bird dog",
              s: 3,
              r: "8ea",
              note: "Reach long.",
              exerciseType: "mobility",
            },
            {
              n: "Side-lying leg lifts",
              s: 3,
              r: "12ea",
              note: "No momentum.",
              exerciseType: "mobility",
            },
            {
              n: "Clamshell",
              s: 3,
              r: "15ea",
              note: "Pelvis stays stacked.",
              exerciseType: "mobility",
            },
            {
              n: "Single-leg glute bridge",
              s: 2,
              r: "10ea",
              note: "Drive through full foot.",
              exerciseType: "mobility",
            },
            {
              n: "Standing calf raise",
              s: 2,
              r: "15",
              note: "Smooth tempo.",
              exerciseType: "mobility",
            },
          ],
        },
        thu: {
          type: "recovery",
          name: "Pilates posture + upper body",
          dur: "30–35 min",
          intensity: "Low–Moderate",
          purpose:
            "Improve scapular control, thoracic mobility, and upright posture.",
          ex: [
            {
              n: "Thoracic rotation",
              s: 2,
              r: "6ea",
              note: "Rotate through upper back.",
              exerciseType: "mobility",
            },
            {
              n: "Band pull-apart",
              s: 3,
              r: "15",
              note: "Shoulders down.",
              exerciseType: "mobility",
            },
            {
              n: "Y-T-W raises",
              s: 2,
              r: "8 each",
              note: "Small precise reps.",
              exerciseType: "mobility",
            },
            {
              n: "Wall slides",
              s: 3,
              r: "10",
              note: "Ribs stay tucked.",
              exerciseType: "mobility",
            },
            {
              n: "Side plank",
              s: 3,
              r: "25s ea",
              note: "Long line from heel to head.",
              exerciseType: "mobility",
            },
          ],
        },
        sat: {
          type: "recovery",
          name: "Full-body Pilates flow",
          dur: "40–45 min",
          intensity: "Moderate",
          purpose:
            "Stitch the week together with a longer, low-impact full-body flow.",
          ex: [
            {
              n: "Cat-cow",
              s: 2,
              r: "45s",
              note: "Move with your breath.",
              exerciseType: "mobility",
            },
            {
              n: "Roll up",
              s: 3,
              r: "6",
              note: "One vertebra at a time.",
              exerciseType: "mobility",
            },
            {
              n: "Glute bridges",
              s: 3,
              r: "12",
              note: "Pause on top.",
              exerciseType: "mobility",
            },
            {
              n: "Bird dog",
              s: 3,
              r: "8ea",
              note: "Stay square.",
              exerciseType: "mobility",
            },
            { n: "Side-lying leg lifts", s: 3, r: "12ea", note: "" },
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Finish calm.",
              exerciseType: "breathing",
            },
          ],
        },
      },
      B: {
        mon: {
          type: "recovery",
          name: "Pilates reset flow",
          dur: "30–35 min",
          intensity: "Low",
          purpose:
            "Reset the trunk and hips with a slower, breath-led opening session.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "120s",
              note: "Long exhale.",
              exerciseType: "breathing",
            },
            { n: "Pelvic tilts", s: 2, r: "10", note: "" },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
            {
              n: "Hamstring floss",
              s: 2,
              r: "8ea",
              note: "Ease into range.",
              exerciseType: "mobility",
            },
            {
              n: "Supine twist",
              s: 2,
              r: "30s ea",
              note: "Breathe into the floor.",
              exerciseType: "mobility",
            },
          ],
        },
        tue: {
          type: "recovery",
          name: "Pilates trunk primer",
          dur: "20–25 min",
          intensity: "Low",
          purpose: "Keep the fifth day productive without adding real fatigue.",
          ex: [
            { n: "Dead bug", s: 2, r: "8ea", note: "" },
            { n: "Bird dog", s: 2, r: "8ea", note: "" },
            { n: "Breathing drills", s: 1, r: "90s", note: "" },
          ],
        },
        wed: {
          type: "recovery",
          name: "Pilates glute + trunk strength",
          dur: "35–40 min",
          intensity: "Low–Moderate",
          purpose:
            "Add a little more challenge through the hips and trunk without impact.",
          ex: [
            { n: "Single-leg glute bridge", s: 3, r: "8ea", note: "" },
            { n: "Dead bug", s: 3, r: "10ea", note: "" },
            { n: "Side plank", s: 3, r: "25s ea", note: "" },
            { n: "Clamshell", s: 3, r: "15ea", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
          ],
        },
        thu: {
          type: "recovery",
          name: "Pilates balance + rotation",
          dur: "30–35 min",
          intensity: "Low–Moderate",
          purpose:
            "Focus on control through unilateral balance and rotational mobility.",
          ex: [
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            {
              n: "Standing balance reach",
              s: 3,
              r: "6ea",
              note: "Slow and steady.",
              exerciseType: "mobility",
            },
            {
              n: "Lateral lunge",
              s: 2,
              r: "8ea",
              note: "Use bodyweight only.",
              exerciseType: "mobility",
            },
            {
              n: "Pallof press",
              s: 3,
              r: "8ea",
              note: "Hold each rep.",
              exerciseType: "mobility",
            },
            { n: "Breathing drills", s: 1, r: "90s", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Long Pilates recovery flow",
          dur: "40–45 min",
          intensity: "Low–Moderate",
          purpose:
            "Restore range and reinforce smooth movement patterns with a longer mat session.",
          ex: [
            { n: "Roll up", s: 3, r: "6", note: "" },
            { n: "Glute bridges", s: 3, r: "12", note: "" },
            { n: "Bird dog", s: 3, r: "8ea", note: "" },
            { n: "Side-lying leg lifts", s: 3, r: "12ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
          ],
        },
      },
    },
  },
  recovery: {
    "4-day": {
      A: {
        mon: {
          type: "recovery",
          name: "Active recovery cardio",
          dur: "30–35 min",
          intensity: "Low",
          purpose: "Keep blood flow high while stress stays low.",
          ex: [
            {
              n: "Light walk or bike",
              s: 1,
              r: "20 min",
              note: "Stay conversational.",
              exerciseType: "cardio",
            },
            {
              n: "Easy incline treadmill",
              s: 1,
              r: "10 min",
              note: "Optional if energy is good.",
              exerciseType: "cardio",
            },
          ],
        },
        wed: {
          type: "recovery",
          name: "Mobility reset",
          dur: "20–25 min",
          intensity: "Low",
          purpose: "Open the hips, ankles, and spine with zero rush.",
          ex: [
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Hip CARs", s: 2, r: "5ea", note: "" },
            { n: "Hamstring floss", s: 2, r: "8ea", note: "" },
            { n: "Ankle mobility", s: 2, r: "45s ea", note: "" },
          ],
        },
        fri: {
          type: "recovery",
          name: "Recovery Pilates",
          dur: "25–30 min",
          intensity: "Low",
          purpose:
            "Restore trunk control and hip mobility without adding fatigue.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Rib cage down.",
              exerciseType: "breathing",
            },
            { n: "Pelvic tilts", s: 2, r: "10", note: "" },
            { n: "Glute bridges", s: 2, r: "12", note: "" },
            { n: "Bird dog", s: 2, r: "8ea", note: "" },
            { n: "Side-lying leg lifts", s: 2, r: "12ea", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Sleepy nervous-system reset",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "Finish the week by downshifting the nervous system and loosening stiff areas.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "120s",
              note: "Long exhale focus.",
              exerciseType: "breathing",
            },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
            { n: "Childs pose", s: 2, r: "45s", note: "" },
            {
              n: "Legs up the wall",
              s: 1,
              r: "3 min",
              note: "Stay quiet.",
              exerciseType: "mobility",
            },
          ],
        },
      },
      B: {
        mon: {
          type: "recovery",
          name: "Easy zone-2 walk",
          dur: "30–40 min",
          intensity: "Low",
          purpose: "Start the week with easy aerobic recovery only.",
          ex: [
            {
              n: "Light walk or bike",
              s: 1,
              r: "30 min",
              note: "Nasal breathing.",
              exerciseType: "cardio",
            },
          ],
        },
        wed: {
          type: "recovery",
          name: "Joint care flow",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "Touch the ankles, hips, and thoracic spine with slow range work.",
          ex: [
            { n: "Ankle mobility", s: 2, r: "45s ea", note: "" },
            { n: "Hip CARs", s: 2, r: "5ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
          ],
        },
        fri: {
          type: "recovery",
          name: "Mat recovery flow",
          dur: "25–30 min",
          intensity: "Low",
          purpose:
            "Use the mat for glutes, trunk, and spine without accumulating fatigue.",
          ex: [
            { n: "Glute bridges", s: 2, r: "12", note: "" },
            { n: "Bird dog", s: 2, r: "8ea", note: "" },
            { n: "Dead bug", s: 2, r: "8ea", note: "" },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Mobility and breath finish",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "End the week with deliberate mobility and breathing down-regulation.",
          ex: [
            { n: "Breathing drills", s: 1, r: "120s", note: "" },
            { n: "Hamstring floss", s: 2, r: "8ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Legs up the wall", s: 1, r: "3 min", note: "" },
          ],
        },
      },
    },
    "5-day": {
      A: {
        mon: {
          type: "recovery",
          name: "Active recovery cardio",
          dur: "30–35 min",
          intensity: "Low",
          purpose: "Keep blood flow high while stress stays low.",
          ex: [
            {
              n: "Light walk or bike",
              s: 1,
              r: "20 min",
              note: "Stay conversational.",
              exerciseType: "cardio",
            },
            {
              n: "Easy incline treadmill",
              s: 1,
              r: "10 min",
              note: "Optional if energy is good.",
              exerciseType: "cardio",
            },
          ],
        },
        tue: {
          type: "recovery",
          name: "Breath + posture reset",
          dur: "15–20 min",
          intensity: "Low",
          purpose:
            "Add a short extra day that helps you feel better, not more tired.",
          ex: [
            { n: "Breathing drills", s: 1, r: "120s", note: "" },
            { n: "Wall slides", s: 2, r: "10", note: "" },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
          ],
        },
        wed: {
          type: "recovery",
          name: "Mobility reset",
          dur: "20–25 min",
          intensity: "Low",
          purpose: "Open the hips, ankles, and spine with zero rush.",
          ex: [
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Hip CARs", s: 2, r: "5ea", note: "" },
            { n: "Hamstring floss", s: 2, r: "8ea", note: "" },
            { n: "Ankle mobility", s: 2, r: "45s ea", note: "" },
          ],
        },
        thu: {
          type: "recovery",
          name: "Recovery Pilates",
          dur: "25–30 min",
          intensity: "Low",
          purpose:
            "Restore trunk control and hip mobility without adding fatigue.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "90s",
              note: "Rib cage down.",
              exerciseType: "breathing",
            },
            { n: "Pelvic tilts", s: 2, r: "10", note: "" },
            { n: "Glute bridges", s: 2, r: "12", note: "" },
            { n: "Bird dog", s: 2, r: "8ea", note: "" },
            { n: "Side-lying leg lifts", s: 2, r: "12ea", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Sleepy nervous-system reset",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "Finish the week by downshifting the nervous system and loosening stiff areas.",
          ex: [
            {
              n: "Breathing drills",
              s: 1,
              r: "120s",
              note: "Long exhale focus.",
              exerciseType: "breathing",
            },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
            { n: "Childs pose", s: 2, r: "45s", note: "" },
            {
              n: "Legs up the wall",
              s: 1,
              r: "3 min",
              note: "Stay quiet.",
              exerciseType: "mobility",
            },
          ],
        },
      },
      B: {
        mon: {
          type: "recovery",
          name: "Easy zone-2 walk",
          dur: "30–40 min",
          intensity: "Low",
          purpose: "Start the week with easy aerobic recovery only.",
          ex: [
            {
              n: "Light walk or bike",
              s: 1,
              r: "30 min",
              note: "Nasal breathing.",
              exerciseType: "cardio",
            },
          ],
        },
        tue: {
          type: "recovery",
          name: "Joint prep micro-flow",
          dur: "15–20 min",
          intensity: "Low",
          purpose: "Keep joints moving on the extra training day.",
          ex: [
            { n: "Ankle mobility", s: 2, r: "45s ea", note: "" },
            { n: "Hip CARs", s: 2, r: "5ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "5ea", note: "" },
          ],
        },
        wed: {
          type: "recovery",
          name: "Joint care flow",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "Touch the ankles, hips, and thoracic spine with slow range work.",
          ex: [
            { n: "Ankle mobility", s: 2, r: "45s ea", note: "" },
            { n: "Hip CARs", s: 2, r: "5ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Cat-cow", s: 2, r: "45s", note: "" },
          ],
        },
        thu: {
          type: "recovery",
          name: "Mat recovery flow",
          dur: "25–30 min",
          intensity: "Low",
          purpose:
            "Use the mat for glutes, trunk, and spine without accumulating fatigue.",
          ex: [
            { n: "Glute bridges", s: 2, r: "12", note: "" },
            { n: "Bird dog", s: 2, r: "8ea", note: "" },
            { n: "Dead bug", s: 2, r: "8ea", note: "" },
            { n: "Supine twist", s: 2, r: "30s ea", note: "" },
          ],
        },
        sat: {
          type: "recovery",
          name: "Mobility and breath finish",
          dur: "20–25 min",
          intensity: "Low",
          purpose:
            "End the week with deliberate mobility and breathing down-regulation.",
          ex: [
            { n: "Breathing drills", s: 1, r: "120s", note: "" },
            { n: "Hamstring floss", s: 2, r: "8ea", note: "" },
            { n: "Thoracic rotation", s: 2, r: "6ea", note: "" },
            { n: "Legs up the wall", s: 1, r: "3 min", note: "" },
          ],
        },
      },
    },
  },
};
const WEEKLY_TEMPLATES = {
  "4-day": {
    A: [
      { type: "run_intervals", label: "Run quality" },
      { type: "strength_upper", label: "Upper strength" },
      { type: "run_aerobic", label: "Run aerobic" },
      { type: "strength_lower", label: "Lower strength" },
    ],
    B: [
      { type: "run_threshold", label: "Run threshold" },
      { type: "hyrox_functional", label: "Full HYROX" },
      { type: "run_aerobic", label: "Run aerobic" },
      { type: "strength_circuit", label: "Strength circuit" },
    ],
  },
  "5-day": {
    A: [
      { type: "run_intervals", label: "Run intervals" },
      { type: "strength_upper", label: "Upper strength" },
      { type: "run_aerobic", label: "Run aerobic" },
      { type: "strength_lower", label: "Lower strength" },
      { type: "run_threshold", label: "Threshold run" },
    ],
    B: [
      { type: "run_intervals", label: "Run intervals" },
      { type: "hyrox_functional", label: "Full HYROX" },
      { type: "run_aerobic", label: "Run aerobic" },
      { type: "strength_lower", label: "Lower strength" },
      { type: "hyrox_simulation", label: "HYROX simulation" },
    ],
  },
};

const WKS = {
  /* ── PHASE 0 · BASE (weeks 1–8) ── */
  p0A_mon: {
    name: "Strength — full body",
    purpose: "Build baseline push, pull and core patterns.",
    dur: "45–55 min",
    intensity: "Moderate",
    ex: [
      {
        n: "Barbell back squat",
        s: 3,
        r: "8",
        note: "Drive knees out, chest tall",
      },
      {
        n: "Romanian deadlift",
        s: 3,
        r: "10",
        note: "Hinge from hips, soft knees",
      },
      { n: "Dumbbell bench press", s: 3, r: "10", note: "" },
      {
        n: "Bent-over dumbbell row",
        s: 3,
        r: "10ea",
        note: "Brace core, neutral spine",
      },
      { n: "Overhead press", s: 3, r: "10", note: "" },
      { n: "Plank hold", s: 3, r: "30s", note: "" },
    ],
  },
  p0A_wed: {
    name: "Easy run",
    type: "run",
    purpose: "Build aerobic base — consistent easy effort.",
    dur: "30–35 min",
    intensity: "Easy",
    rd: {
      label: "Easy run",
      dist: "2–3 mi",
      effort:
        "Conversational pace throughout — if you cannot hold a sentence, slow down",
    },
  },
  p0A_fri: {
    name: "Strength — lower body",
    purpose:
      "Unilateral work to build single-leg stability and posterior chain.",
    dur: "45–55 min",
    intensity: "Moderate",
    ex: [
      {
        n: "Goblet squat",
        s: 3,
        r: "12",
        note: "Elbows inside knees at bottom",
      },
      { n: "Single-leg RDL", s: 3, r: "10ea", note: "Control the balance" },
      { n: "Incline dumbbell press", s: 3, r: "10", note: "" },
      { n: "Lat pulldown", s: 3, r: "10", note: "" },
      { n: "Hip thrust", s: 3, r: "12", note: "Squeeze glutes at top" },
      { n: "Bicycle crunch", s: 3, r: "15ea", note: "" },
    ],
  },
  p0A_sat: {
    name: "Long easy run",
    type: "run",
    purpose: "Build aerobic base — the foundation everything else sits on.",
    dur: "45–55 min",
    intensity: "Easy",
    rd: {
      label: "Long run",
      dist: "3–4.5 mi",
      effort:
        "Slow and conversational — this pace is correct even if it feels too easy",
    },
  },
};
function resolveExerciseLibrary(customExercises=[]){
  return mergeRecordsById(Object.values(EXERCISE_LIBRARY),customExercises||[]);
}
const EXERCISE_TYPE_FIELD_MAP={
  strength:['weight','reps','notes'],
  cardio:['duration','distance','notes'],
  mobility:['duration','notes'],
  breathing:['duration','notes'],
};
const LEGACY_LOG_TYPE_FIELD_MAP={
  weight_reps:['weight','reps','notes'],
  reps:['reps','notes'],
  duration:['duration','notes'],
  distance:['weight','distance','notes'],
};
// Temporary source-data fallback while workout seeds are backfilled with explicit exerciseType values.
const LEGACY_EXERCISE_TYPE_OVERRIDES={
  'Ankle mobility':'mobility',
  'Breathing drills':'breathing',
  'Cat-cow':'mobility',
  'Glute activation':'mobility',
  'Hip CARs':'mobility',
  'Pelvic tilts':'mobility',
  'Spinal rotation':'mobility',
  'Thoracic rotation':'mobility',
};
const EXERCISE_NAME_ALIASES={
  'Barbell back squat':'back-squat',
  'Back Squat':'back-squat',
  'Romanian deadlift':'romanian-deadlift',
  'Romanian Deadlift':'romanian-deadlift',
  'Walking lunges':'walking-lunges',
  'Walking Lunges':'walking-lunges',
  'Push-up':'push-up',
  'Push-ups':'push-up',
  'Push-Up':'push-up',
  'One-arm row':'one-arm-row',
  'One-Arm Row':'one-arm-row',
  'Single-arm dumbbell row':'one-arm-row',
  'Bent-over dumbbell row':'one-arm-row',
  'Plank':'plank',
  'Plank hold':'plank',
  'Wall ball':'wall-ball',
  'Wall Ball':'wall-ball',
  'Wall ball (9kg)':'wall-ball',
  'Sled push':'sled-push',
  'Sled Push':'sled-push',
  'SkiErg':'ski-erg',
  'Ski Erg':'ski-erg',
  'SkiErg — easy':'ski-erg',
  'Treadmill run':'treadmill-run',
  'Treadmill Run':'treadmill-run',
};
const EXERCISE_LIBRARY_BY_NAME=Object.fromEntries(Object.values(EXERCISE_LIBRARY).map(ex=>[ex.name,ex]));
function inferMovementPattern(name=''){
  const lower=name.toLowerCase();
  if(/squat|wall ball/.test(lower))return'squat';
  if(/deadlift|rdl|hinge/.test(lower))return'hinge';
  if(/lunge/.test(lower))return'lunge';
  if(/push-up|press|bench/.test(lower))return'horizontal_push';
  if(/row|pulldown|pull-up/.test(lower))return'horizontal_pull';
  if(/plank|dead bug|core/.test(lower))return'core';
  if(/sled|hyrox|burpee/.test(lower))return'hyrox_station';
  if(/run|row 250m|ski/.test(lower))return'cardio';
  if(/carry/.test(lower))return'carry';
  return'general_strength';
}
function humanizeExerciseLabel(value='Exercise'){
  return String(value||'Exercise').replace(/[-_]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
}
function buildFallbackExerciseDefinition(name='Exercise'){
  const normalizedName=String(name||'Exercise');
  return{
    id:normalizedName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'exercise',
    name:humanizeExerciseLabel(normalizedName),
    exerciseType:LEGACY_EXERCISE_TYPE_OVERRIDES[humanizeExerciseLabel(normalizedName)]||null,
    movementPattern:inferMovementPattern(normalizedName),
    media:createExerciseMedia({kind:'none',thumbnail:svgThumb(humanizeExerciseLabel(normalizedName)),fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Use the prescribed range and tempo.','Move with control through full positions.','Log what you actually performed.'],
    substitutions:[],
    category:'Exercise',
    muscleGroup:'General',
    equipment:'Gym',
    defaultRest:75,
    logType:'weight_reps',
  };
}
function resolveExerciseDefinition(idOrName){
  const directId=EXERCISE_LIBRARY[idOrName];
  if(directId)return directId;
  const aliasedId=EXERCISE_NAME_ALIASES[idOrName];
  if(aliasedId&&EXERCISE_LIBRARY[aliasedId])return EXERCISE_LIBRARY[aliasedId];
  const byName=EXERCISE_LIBRARY_BY_NAME[idOrName];
  if(byName)return byName;
  return buildFallbackExerciseDefinition(idOrName);
}

const WARMUP_LIBRARY={
  running:[{name:'5 min easy jog',duration:300},{name:'Leg swings',duration:45},{name:'Walking lunges',duration:45},{name:'High knees',duration:30},{name:'Ankle mobility',duration:45}],
  lower_strength:[{name:'Glute bridges',duration:45},{name:'Bodyweight squats',duration:45},{name:'Hip flexor stretch',duration:45},{name:'Banded lateral walks',duration:45},{name:'Goblet squat warm-up sets',duration:60}],
  upper_strength:[{name:'Band pull-aparts',duration:45},{name:'Shoulder circles',duration:30},{name:'Push-ups',duration:45},{name:'Light dumbbell presses',duration:60}],
  mobility:[{name:'Cat-cow',duration:45,exerciseType:'mobility'},{name:'Spinal rotation',duration:45,exerciseType:'mobility'},{name:'Glute activation',duration:45,exerciseType:'mobility'},{name:'Breathing drills',duration:60,exerciseType:'breathing'}],
  hyrox:[{name:'Easy machine warm-up',duration:180},{name:'Walking lunges',duration:45},{name:'Worlds greatest stretch',duration:45},{name:'Band walks',duration:45},{name:'SkiErg or row build',duration:60}],
};

const COOLDOWN_LIBRARY={
  lower_body:[{name:'Hamstring stretch',duration:45},{name:'Quad stretch',duration:45},{name:'Hip flexor stretch',duration:45},{name:'Calf stretch',duration:45}],
  upper_body:[{name:'Chest stretch',duration:45},{name:'Lat stretch',duration:45},{name:'Shoulder stretch',duration:45},{name:'Thoracic rotation',duration:45}],
  running:[{name:'Walk',duration:180},{name:'Hamstring stretch',duration:45},{name:'Calf stretch',duration:45},{name:'Hip flexor stretch',duration:45},{name:'Glute stretch',duration:45}],
  mobility:[{name:'Breathing reset',duration:60},{name:'Supine twist',duration:45},{name:'Childs pose',duration:60}],
};

const RECOVERY_WORKOUT_LIBRARY=[
  {id:'recovery_pilates',name:'Recovery Pilates',duration:'25 min',category:'mobility',purpose:'Restore trunk control and hip mobility without adding fatigue.',warmupKey:'mobility',cooldownKey:'mobility',
    ex:[{n:'Breathing drills',s:1,r:'90s',note:'Rib cage down, nasal breathing.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:'Slow, controlled articulation.',exerciseType:'mobility'},{n:'Glute bridges',s:2,r:'12',note:'Pause at the top.',exerciseType:'mobility'},{n:'Bird dog',s:2,r:'8ea',note:'Stay long through heel and hand.',exerciseType:'mobility'},{n:'Side-lying leg lifts',s:2,r:'12ea',note:'Smooth tempo.',exerciseType:'mobility'}]},
  {id:'mobility_reset',name:'Mobility Reset',duration:'20 min',category:'mobility',purpose:'Open up the hips, spine, and ankles while keeping overall stress low.',warmupKey:'mobility',cooldownKey:'mobility',
    ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:'Move through the upper back.',exerciseType:'mobility'},{n:'Hip CARs',s:2,r:'5ea',note:'Controlled circles.',exerciseType:'mobility'},{n:'Hamstring floss',s:2,r:'8ea',note:'Pulse through range.',exerciseType:'mobility'},{n:'Ankle mobility',s:2,r:'45s ea',note:'Knee travels over toes.',exerciseType:'mobility'}]},
  {id:'active_recovery',name:'Active Recovery Cardio',duration:'30 min',category:'running',purpose:'Keep blood flow high and the effort low with true zone-2 work.',warmupKey:'running',cooldownKey:'running',
    ex:[{n:'Light walk or bike',s:1,r:'20 min',note:'Stay fully conversational.',exerciseType:'cardio'},{n:'Easy incline treadmill',s:1,r:'10 min',note:'Optional second block if energy improves.',exerciseType:'cardio'}]},
];

const RECOVERY_LIBRARY_SESSIONS=[
  {...RECOVERY_WORKOUT_LIBRARY[0],libraryCategory:'Pilates'},
  {...PROGRAM_WORKOUT_LIBRARY.pilates['4-day'].A.mon,id:'lib_pilates_core',libraryId:'lib_pilates_core',libraryCategory:'Pilates'},
  {...PROGRAM_WORKOUT_LIBRARY.pilates['4-day'].A.sat,id:'lib_pilates_flow',libraryId:'lib_pilates_flow',libraryCategory:'Pilates'},
  {...RECOVERY_WORKOUT_LIBRARY[1],libraryCategory:'Mobility'},
  {...PROGRAM_WORKOUT_LIBRARY.recovery['4-day'].B.wed,id:'lib_joint_care',libraryId:'lib_joint_care',libraryCategory:'Mobility'},
  {...RECOVERY_WORKOUT_LIBRARY[2],libraryCategory:'Recovery'},
  {...PROGRAM_WORKOUT_LIBRARY.recovery['4-day'].A.mon,id:'lib_active_rec',libraryId:'lib_active_rec',libraryCategory:'Recovery'},
  {...PROGRAM_WORKOUT_LIBRARY.recovery['4-day'].A.sat,id:'lib_ns_reset',libraryId:'lib_ns_reset',libraryCategory:'Stretching'},
];

function deriveWorkoutCategory(sess){
  if(!sess)return'mobility';
  if(sess.type==='run'||(sess.name||'').toLowerCase().includes('run'))return'running';
  const txt=`${sess.name||''} ${sess.purpose||''}`.toLowerCase();
  if(/hyrox|simulation|station/.test(txt))return'hyrox';
  if(/upper|pull|press/.test(txt))return'upper_strength';
  if(/lower|squat|deadlift|lunge/.test(txt))return'lower_strength';
  if(/recovery|mobility|pilates/.test(txt))return'mobility';
  return'lower_strength';
}

function getWarmupForCategory(key){return(WARMUP_LIBRARY[key]||WARMUP_LIBRARY.mobility).map((item,idx)=>({...item,id:`wu_${key}_${idx}`}));}
function getCooldownForCategory(key){return(COOLDOWN_LIBRARY[key]||COOLDOWN_LIBRARY.mobility).map((item,idx)=>({...item,id:`cd_${key}_${idx}`}));}

function computeRecoveryState(todayLog,fallbackEnergy=5,fallbackSleep=7.5){
  const energy=todayLog?.energyScore||fallbackEnergy;
  const sleep=todayLog?.sleepHours||fallbackSleep;
  const readiness=todayLog?.readiness??Math.max(58,Math.min(96,Math.round((sleep||7)*9+(Math.round((energy||6)/2)*5))));
  if(readiness>=85&&energy>=7)return{level:'High',readiness,energy,sleep};
  if(readiness>=70&&energy>=5)return{level:'Moderate',readiness,energy,sleep};
  return{level:'Low',readiness,energy,sleep};
}

function adjustWorkoutForRecovery(sess,recovery){
  if(!sess)return null;
  const category=deriveWorkoutCategory(sess);
  if(recovery.level==='Low'){
    const replacement=RECOVERY_WORKOUT_LIBRARY[category==='running'?2:category==='mobility'?1:0];
    return hydrateWorkoutSession({...replacement,type:'recovery',adjustmentLabel:'Recovery Replacement',adjustmentReason:'Low recovery detected',originalName:sess.name,warmup:getWarmupForCategory(replacement.warmupKey),cooldown:getCooldownForCategory(replacement.cooldownKey)});
  }
  const base=hydrateWorkoutSession({...sess});
  const warmup=getWarmupForCategory(category);
  const cooldown=getCooldownForCategory(category==='hyrox'?'lower_body':category);
  if(recovery.level==='Moderate'){
    const ex=(base.ex||[]).map((exercise,idx)=>idx===0?exercise:{...exercise,targetSets:Math.max(1,(exercise.targetSets||3)-1),setLogs:(exercise.setLogs||[]).slice(0,Math.max(1,(exercise.targetSets||3)-1))});
    return{...base,name:`${base.name} (Reduced Volume)`,ex,adjustmentLabel:'Reduced Volume',adjustmentReason:'Moderate recovery',warmup,cooldown};
  }
  return{...base,adjustmentLabel:'Planned Session',adjustmentReason:'High recovery',warmup,cooldown};
}

function getExerciseMeta(name){
  const def=resolveExerciseDefinition(name);
  return{
    ...def,
    exerciseType:def.exerciseType||null,
    pattern:def.movementPattern,
    instructions:def.coachingCues?.[0]||'Follow the prescribed reps with clean mechanics.',
    coachingNotes:(def.coachingCues||[]).join(' '),
    alternatives:(def.substitutions||[]).map(id=>resolveExerciseDefinition(id).name),
    tags:def.tags||[],
    defaultRest:def.defaultRest||75,
    logType:def.logType||'weight_reps',
    imageUrl:getExerciseThumbnail(def.media),
    videoUrl:def.media?.kind==='external_video'?def.media.src:'',
    localVideoUrl:def.media?.kind==='local_video'?def.media.src:'',
  };
}

function parseTargetNumber(v,def=8){
  const m=String(v||'').match(/(\d+)/);
  return m?parseInt(m[1],10):def;
}

function getLogTypeForExercise(raw,meta){
  if(meta.logType)return meta.logType;
  if(/m|km/i.test(raw?.r||''))return'distance';
  if(/s|min/i.test(raw?.r||''))return'duration';
  return'weight_reps';
}

function inferExerciseType(raw={},meta={}){
  if(raw.exerciseType)return raw.exerciseType;
  if(meta.exerciseType)return meta.exerciseType;
  const fallbackName=raw.n||raw.displayName||raw.name||meta.name||'';
  if(LEGACY_EXERCISE_TYPE_OVERRIDES[fallbackName])return LEGACY_EXERCISE_TYPE_OVERRIDES[fallbackName];
  return null;
}

function getVisibleLogFields(exercise={}){
  if(exercise.exerciseType&&EXERCISE_TYPE_FIELD_MAP[exercise.exerciseType])return EXERCISE_TYPE_FIELD_MAP[exercise.exerciseType];
  return LEGACY_LOG_TYPE_FIELD_MAP[exercise.logType]||['weight','reps','duration','distance','notes'];
}

function buildExerciseInstance(raw,idx){
  const lookupKey=raw.exerciseId||raw.n||raw.displayName||raw.name||`exercise-${idx+1}`;
  const meta=getExerciseMeta(lookupKey);
  const logType=getLogTypeForExercise(raw,meta);
  const exerciseType=inferExerciseType(raw,meta);
  const setCount=parseTargetNumber(raw.s,3);
  return{
    id:`${meta.id}_${idx}`,
    exerciseId:meta.id,
    exerciseType,
    n:raw.n||meta.name,
    plannedExerciseName:raw.plannedExerciseName||raw.n||meta.name,
    programmedName:raw.programmedName||raw.plannedExerciseName||raw.n||meta.name,
    swappedFrom:raw.swappedFrom||null,
    displayName:meta.name||raw.n,
    category:meta.category,
    muscleGroup:meta.muscleGroup,
    equipment:meta.equipment,
    instructions:meta.instructions,
    coachingNotes:raw.note||meta.coachingNotes||'',
    alternatives:meta.alternatives||SUBS[raw.n]||[],
    tags:meta.tags||[],
    pattern:meta.pattern||'general_strength',
    defaultRest:meta.defaultRest||75,
    logType,
    targetSets:setCount,
    targetReps:raw.r||'',
    targetNote:raw.note||'',
    supersetKey:raw.supersetKey||null,
  };
}

function hydrateWorkoutSession(sess){
  if(!sess)return null;
  const shouldPair=/circuit|hyrox/i.test(sess.name||'');
  const exercises=(sess.ex||[]).map((raw,idx)=>{
    const base=buildExerciseInstance(raw,idx);
    const targetSets=base.targetSets||parseTargetNumber(base.s,3);
    const setLogs=(base.setLogs&&base.setLogs.length?base.setLogs:Array.from({length:targetSets},(_,si)=>({
      idx:si+1,weight:'',reps:'',distance:'',duration:'',rpe:'',notes:'',done:false
    }))).map((set,si)=>({...set,idx:si+1,done:!!set.done}));
    return{...base,targetSets,setLogs,supersetKey:base.supersetKey||(shouldPair&&idx%2===0&&idx<(sess.ex||[]).length-1?`pair_${Math.floor(idx/2)+1}`:shouldPair&&idx%2===1?`pair_${Math.floor(idx/2)+1}`:null)};
  });
  return{...sess,ex:exercises,currentExerciseIdx:sess.currentExerciseIdx||0,startedAt:sess.startedAt||Date.now(),inProgress:true};
}

function resolveWorkoutSelectionId(session,dateKey=getTodayKey()){
  if(!session)return null;
  return session.id
    || session.libraryId
    || session.plannedWorkoutId
    || session.plannedName
      ?`${session.id||session.libraryId||session.plannedWorkoutId||session.plannedName}-${dateKey}`
      :session.name
        ?`${session.name}-${dateKey}`
        :null;
}

function getSwapCandidates(ex){
  const baseDef=resolveExerciseDefinition(ex.exerciseId||ex.n);
  const direct=(baseDef.substitutions||[]).map(id=>buildExerciseInstance({exerciseId:id,s:ex.targetSets,r:ex.targetReps,note:ex.targetNote},0));
  const similar=Object.values(EXERCISE_LIBRARY).filter(meta=>meta.movementPattern===baseDef.movementPattern&&meta.id!==baseDef.id).map(meta=>buildExerciseInstance({exerciseId:meta.id,s:ex.targetSets,r:ex.targetReps,note:ex.targetNote},0));
  const seen=new Set();
  return[...direct,...similar].filter(item=>{
    if(seen.has(item.exerciseId))return false;
    seen.add(item.exerciseId);
    return true;
  }).slice(0,6);
}

function summarizeExerciseHistory(entry){
  const exs=entry?.data?.exercises||[];
  const best=[];
  exs.forEach(ex=>{
    (ex.setLogs||[]).forEach(set=>{
      if(set.done)best.push(set);
    });
  });
  return best;
}

function getExerciseHistorySummary(history,name){
  const exerciseId=resolveExerciseDefinition(name).id;
  const matches=[...history].reverse().filter(h=>h.type==='workout'&&(h.data?.exercises||[]).some(ex=>(ex.exerciseId||resolveExerciseDefinition(ex.n||ex.displayName||'').id)===exerciseId));
  if(matches.length===0)return null;
  const lastEntry=matches[0];
  const lastEx=(lastEntry.data.exercises||[]).find(ex=>(ex.exerciseId||resolveExerciseDefinition(ex.n||ex.displayName||'').id)===exerciseId);
  const lastDone=(lastEx?.setLogs||[]).filter(s=>s.done);
  const lastSummary=lastDone.length>0
    ?lastDone.map(s=>summarizeLoggedSet(s)).filter(Boolean).join(' · ')
    :getExerciseHistoryFallbackLabel(lastEx);
  let bestSet=null;
  matches.slice(0,5).forEach(entry=>{
    const ex=(entry.data.exercises||[]).find(x=>(x.exerciseId||resolveExerciseDefinition(x.n||x.displayName||'').id)===exerciseId);
    (ex?.setLogs||[]).filter(s=>s.done).forEach(set=>{
      const score=(parseFloat(set.weight)||0)*1000+(parseFloat(set.reps)||0)*10+(parseFloat(set.distance)||0);
      const summary=summarizeLoggedSet(set)||getExerciseHistoryFallbackLabel(ex);
      if(!bestSet||score>bestSet.score)bestSet={score,label:summary};
    });
  });
  return{lastDate:lastEntry.date,lastSummary,bestSet:bestSet?.label||lastSummary};
}
function buildExerciseGroups(exercises=[]){
  const grouped=[];
  exercises.forEach((ex,idx)=>{
    const lastGroup=grouped[grouped.length-1];
    if(ex.supersetKey&&lastGroup&&lastGroup.key===ex.supersetKey)lastGroup.items.push({ex,idx});
    else grouped.push({key:ex.supersetKey||`single_${idx}`,items:[{ex,idx}]});
  });
  return grouped;
}
function isAccessoryExercise(ex,idx,total){
  if(!ex)return false;
  if(ex.type==='accessory'||/core|mobility/i.test(ex.category||'')||ex.pattern==='core')return true;
  return total>4&&idx>=Math.max(2,total-2);
}
function getWorkoutExecutionSections(sess){
  const exercises=sess?.ex||[];
  if((!exercises||exercises.length===0)&&sess?.type==='run'){
    const runExercise=buildExerciseInstance({
      n:sess?.rd?.label||sess?.name||'Run',
      s:1,
      r:sess?.rd?.dist||sess?.mainSet||sess?.purpose||'Planned run',
      note:sess?.rd?.effort||sess?.purpose||'Match the prescribed effort.',
    },0);
    return{
      warmup:sess?.warmup||[],
      main:[{key:'run_main',items:[{ex:runExercise,idx:0}]}],
      accessory:[],
      cooldown:sess?.cooldown||[],
    };
  }
  const groups=buildExerciseGroups(exercises);
  const main=[];
  const accessory=[];
  groups.forEach(group=>{
    const accessoryGroup=group.items.every(({ex,idx})=>isAccessoryExercise(ex,idx,exercises.length));
    (accessoryGroup?accessory:main).push(group);
  });
  return{
    warmup:sess?.warmup||[],
    main,
    accessory,
    cooldown:sess?.cooldown||[],
  };
}
function formatWorkoutTypeLabel(sess){
  if(!sess)return'Recovery';
  if(/pilates/i.test(`${sess.name||''} ${sess.purpose||''}`))return'Pilates / Mobility';
  if(sess.type==='run')return'Run';
  if(sess.type==='recovery')return'Recovery';
  if(/hyrox|simulation|station/i.test(`${sess.name||''} ${sess.purpose||''}`))return'HYROX / Functional';
  return'Strength';
}
function formatWorkoutDurationLabel(sess){
  return sess?.dur||sess?.duration||'25 min';
}
function isRecoveryStyleExercise(ex){
  return['mobility','breathing'].includes(ex?.exerciseType||'');
}
function getExerciseSetLabel(ex){
  const count=Math.max(1,ex?.targetSets||1);
  if(ex?.exerciseType==='breathing')return`${count} ${count===1?'round':'rounds'}`;
  if(ex?.exerciseType==='mobility')return`${count} ${count===1?'round':'rounds'}`;
  if(ex?.exerciseType==='cardio')return`${count} ${count===1?'block':'blocks'}`;
  return`${count} ${count===1?'set':'sets'}`;
}
function getExerciseActionLabel(ex,done=false){
  if(ex?.exerciseType==='breathing'||ex?.exerciseType==='mobility')return done?'Completed':'Complete';
  if(ex?.exerciseType==='cardio')return done?'Saved':'Save';
  return done?'Logged':'Log';
}
function formatExercisePrescription(ex){
  const parts=[getExerciseSetLabel(ex)];
  if(ex.targetReps)parts.push(ex.targetReps);
  if(ex.targetNote)parts.push(ex.targetNote);
  return parts.join(' · ');
}
function getWorkoutSetProgress(sess){
  const exercises=sess?.ex||[];
  const totalSets=exercises.reduce((sum,ex)=>sum+(ex.setLogs?.length||0),0);
  const doneSets=exercises.reduce((sum,ex)=>sum+((ex.setLogs||[]).filter(set=>set.done).length),0);
  return{doneSets,totalSets};
}
function getWorkoutProgressLabel(sess){
  if(!sess)return'sets logged';
  if(sess.type==='run')return'intervals completed';
  if(sess.type==='recovery'||deriveWorkoutCategory(sess)==='mobility')return'rounds completed';
  return'sets logged';
}
function summarizeLoggedSet(set={}){
  return[
    set.weight&&String(set.weight)!=='0'?set.weight:null,
    set.reps?`x ${set.reps}`:null,
    set.distance?set.distance:null,
    set.duration?set.duration:null,
  ].filter(Boolean).join(' · ');
}
function getExerciseHistoryFallbackLabel(ex={}){
  if(isRecoveryStyleExercise(ex))return'Completed';
  if(ex?.exerciseType==='cardio')return'Saved';
  return'Logged';
}
function getHistoryEntryTypeLabel(entry){
  if(entry?.type==='run')return'Run';
  if(entry?.type==='recovery')return'Recovery';
  const exercises=entry?.data?.exercises||[];
  const hasRecoveryStyle=exercises.some(ex=>isRecoveryStyleExercise(ex));
  if(hasRecoveryStyle)return`${exercises.length} movements`;
  return`${exercises.length} exercises`;
}
function getWorkoutStatusMeta(status){
  if(status==='Completed')return{label:'Completed',bg:C.sageL,color:C.sageDk};
  if(status==='In Progress')return{label:'In Progress',bg:C.navyL,color:C.navyDk};
  if(status==='Recovery Adjusted')return{label:'Recovery Adjusted',bg:C.amberL,color:C.amberDk};
  return{label:'Planned',bg:C.surf,color:C.muted};
}
function readActiveWorkoutState(){
  return activeWorkoutStateCache;
}
function writeActiveWorkoutState(state){
  activeWorkoutStateCache=state&&typeof state==='object'?state:null;
  if(!activeWorkoutStateCache){
    storage.remove(ACTIVE_WORKOUT_STORAGE_KEY);
    return true;
  }
  storage.setJSON(ACTIVE_WORKOUT_STORAGE_KEY,activeWorkoutStateCache);
  return true;
}
function duplicatePreviousSetValues(setLogs,setIdx){
  if(setIdx<=0)return null;
  const prev=setLogs?.[setIdx-1];
  if(!prev)return null;
  return{
    weight:prev.weight||'',
    reps:prev.reps||'',
    duration:prev.duration||'',
    distance:prev.distance||'',
    notes:prev.notes||'',
  };
}
function getMaintenanceNextLabel(item){
  if(!item)return'Nothing urgent';
  if(item.status==='overdue')return item.daysOverdue>0?`Overdue by ${item.daysOverdue}d`:'Overdue';
  if(item.status==='today')return'Due today';
  if(item.status==='active')return item.dueSoon?`Due in ${item.daysUntil}d`:'Active';
  return item.daysUntilStart>0?`Starts in ${item.daysUntilStart}d`:'Upcoming';
}

const TCLR={str:C.navy,run:C.sage,long:C.amber,rest:C.muted};
const TCLRL={str:C.navyL,run:C.sageL,long:C.amberL,rest:C.surf};

function computePaces(fiveKMin){
  if(!fiveKMin||fiveKMin<=0)return null;
  const sec=(fiveKMin*60)/3.107;
  return{easySec:sec+105,threshSec:sec+25,intSec:sec-7.5,
    easy:fmtPaceMi(sec+105),threshold:fmtPaceMi(sec+25),
    interval:fmtPaceMi(sec-7.5),race5k:fmtPaceMi(sec)};
}

function getPhaseByWeeks(w){
  if(w<=0)return{name:'Race Week',code:'race'};
  if(w<=3)return{name:'Taper',code:'taper'};
  if(w<=4)return{name:'Peak',code:'peak'};
  if(w<=8)return{name:'Build',code:'build'};
  return{name:'Base',code:'base'};
}

function getLongRunDur(code,wInPhase){
  if(code==='race')return 20;
  if(code==='taper')return({1:50,2:35,3:20})[wInPhase]||30;
  if(code==='peak')return 72;
  if(code==='build')return Math.min(40+(wInPhase||1)*5,60);
  return({1:30,2:32,3:35,4:45,5:48,6:52,7:60,8:62})[wInPhase]||35;
}

function generateWorkout(type,phCode,paces,athlete){
  const pct=({base:0.65,build:0.70,peak:0.75,taper:0.60,race:0.50})[phCode]||0.65;
  const sq=athlete?.squat5RM,dl=athlete?.deadlift5RM,wb=athlete?.wallBallMaxReps;
  if(type==='run_aerobic'||type==='run_easy'){
    const dur=({base:35,build:50,peak:45,taper:28,race:20})[phCode]||35;
    const p=paces?`@ ${paces.easy}`:'at conversational pace';
    return{type:'run',focus:'Aerobic base',warmup:'5 min easy walk or jog',
      mainSet:`${dur-10} min easy run ${p}`,cooldown:'5 min walk',
      duration:dur,estimatedCalories:Math.round(dur*9.5)};
  }
  if(type==='run_intervals'){
    const reps=({base:4,build:5,peak:6,taper:3,race:3})[phCode]||4;
    const p=paces?`@ ${paces.interval}`:'at hard effort (85–90%)';
    return{type:'run',focus:'Speed & VO\u2082',warmup:'10 min easy jog',
      mainSet:`${reps} \u00d7 3 min ${p}\n2 min easy recovery jog between each`,
      cooldown:'10 min easy jog',duration:10+(reps*5)+10,estimatedCalories:Math.round((10+reps*5+10)*11)};
  }
  if(type==='run_threshold'){
    const dur=({base:20,build:25,peak:30,taper:15,race:10})[phCode]||20;
    const p=paces?`@ ${paces.threshold}`:'at comfortably hard effort';
    return{type:'run',focus:'Lactate threshold',warmup:'10 min easy',
      mainSet:`${dur} min ${p}`,cooldown:'10 min easy',
      duration:dur+20,estimatedCalories:Math.round((dur+20)*10.5)};
  }
  if(type==='strength_upper'){
    const bench=sq?Math.round(sq*0.75*pct):null;
    return{type:'strength',focus:'Upper body — push, pull & SkiErg',
      warmup:'5 min easy row or SkiErg',
      mainSet:[bench?`Bench press 4×6 @ ${bench} lbs`:'Bench press 4×6 @ moderate weight',
        'Weighted pull-up 4×6 (or lat pulldown)',
        'SkiErg 4×250m — 85% effort',
        'Single-arm row 3×10 each side',
        'Farmers carry 3×50 ft',
        'Dead bug 3×8 each side'].join('\n'),
      cooldown:'5 min upper body stretch',duration:55,estimatedCalories:310};
  }
  if(type==='strength_lower'){
    const sqW=sq?`@ ${Math.round(sq*pct)} lbs`:'@ moderate weight';
    const dlW=dl?`@ ${Math.round(dl*0.55*pct)} lbs`:'@ moderate weight';
    return{type:'strength',focus:'Lower body — posterior chain & station prep',
      warmup:'5 min easy bike or squat mobility',
      mainSet:[`Back squat 4×6 ${sqW}`,
        `Romanian deadlift 3×8 ${dlW}`,
        'Sled push 4×50 ft — heavy',
        'Walking lunges 3×10 each leg',
        'Hip thrust 3×10',
        'Copenhagen plank 3×20s each side'].join('\n'),
      cooldown:'5 min lower body stretch',duration:60,estimatedCalories:340};
  }
  if(type==='strength_circuit'){
    const dlW=dl?`@ ${Math.round(dl*0.65*pct)} lbs`:'@ heavy';
    return{type:'strength',focus:'Full body circuit',warmup:'5 min row',
      mainSet:[`Trap bar deadlift 4×5 ${dlW}`,
        'Dumbbell bench press 3×10',
        'Kettlebell swings 4×15',
        'Farmers carry 4×40m',
        'Wall ball 3×20 (20 lb)',
        'Plank hold 3×40s'].join('\n'),
      cooldown:'5 min mobility',duration:55,estimatedCalories:350};
  }
  if(type==='hyrox_functional'){
    const wbR=wb?Math.min(wb,25):20;
    return{type:'hybrid',focus:'HYROX station circuit',warmup:'10 min easy jog',
      mainSet:[`3 rounds:`,
        `  SkiErg 250m`,
        `  ${wbR} wall balls (20 lb)`,
        `  40m farmers carry`,
        `  10 burpee broad jumps`,
        `  20m sandbag lunges`,
        `  1 min rest between rounds`].join('\n'),
      cooldown:'5 min walk + stretch',duration:65,estimatedCalories:480};
  }
  if(type==='hyrox_simulation'){
    const wbR=wb?Math.min(wb,30):20;
    return{type:'hybrid',focus:'HYROX mini simulation',warmup:'10 min easy jog',
      mainSet:[`3 rounds:`,
        `  0.6 mi run at moderate effort`,
        `  ${wbR} wall balls (20 lb)`,
        `  10 min steady jog`,
        `  10 burpee broad jumps`].join('\n'),
      cooldown:'5 min easy walk',duration:45,estimatedCalories:380};
  }
  return{type:'run',focus:'Easy aerobic',warmup:'5 min walk',
    mainSet:'30 min easy run — fully conversational',cooldown:'5 min walk',
    duration:40,estimatedCalories:280};
}

function validateWeekLoad(slots){
  let r=0,s=0;
  for(const{type}of slots){
    if(type.startsWith('run'))r++;
    else if(type.startsWith('strength'))s++;
    else{r+=0.5;s+=0.5;}
  }
  const t=r+s,rPct=t>0?r/t:0;
  return{runs:r,strength:s,total:t,runPct:Math.round(rPct*100),balanced:rPct>=0.4&&rPct<=0.6};
}

function computeWeeklyAnalytics(history,weekStart){
  const ws=new Date(weekStart),we=new Date(ws);we.setDate(ws.getDate()+7);
  const wh=history.filter(h=>{const d=new Date(h.date+'T12:00:00');return d>=ws&&d<we;});
  let rMins=0,rMi=0,str=0,hyrox=0,recovery=0,cal=0;
  for(const h of wh){
    if(h.type==='run'){
      const dur=parseFloat(h.data?.durationMins)||30;rMins+=dur;
      rMi+=h.data?.dist2?parseFloat(h.data.dist2)||0:dur/10;
    }else if(h.type==='workout')str++;
    else if(h.type==='hyrox')hyrox++;
    else if(h.type==='recovery')recovery++;
    cal+=h.data?.calories||0;
  }
  const totalMins=wh.reduce((s,h)=>s+(h.type==='run'?(parseFloat(h.data?.durationMins)||30):h.type==='workout'?(parseFloat(h.data?.durationMins)||50):h.type==='recovery'?(parseFloat(h.data?.durationMins)||20):40),0);
  return{runMiles:+rMi.toFixed(1),runMins:rMins,strengthSessions:str,hyroxSessions:hyrox,
    recoverySessions:recovery,totalMinutes:totalMins,estimatedCalories:Math.max(cal,Math.round(totalMins*8.5)),
    sessionsLogged:wh.length};
}

function gcalUrl(title,description,dateStr,startHour=7,durationMins=60){
  const d=new Date(dateStr+'T00:00:00');
  const pad=n=>String(n).padStart(2,'0');
  const fmt=(dt)=>`${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  const start=new Date(d);start.setHours(startHour,0,0);
  const end=new Date(start.getTime()+durationMins*60000);
  return`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(description)}&location=Gym`;
}

function parseDurMins(durStr){
  const m=durStr.match(/(\d+)/);return m?parseInt(m[1]):60;
}

function CalBtn({title,desc,dateStr,durStr,color}){
  const mins=parseDurMins(durStr||'60');
  const url=gcalUrl(title,desc,dateStr,7,mins);
  const s={display:'inline-flex',alignItems:'center',gap:5,background:'transparent',border:`0.5px solid ${color||C.bd}`,color:color||C.tx2,borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:500,cursor:'pointer',textDecoration:'none',marginTop:8};
  return React.createElement('a',{href:url,target:'_blank',rel:'noopener noreferrer',style:s},
    React.createElement('svg',{width:12,height:12,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2},
      React.createElement('rect',{x:3,y:4,width:18,height:18,rx:2}),
      React.createElement('line',{x1:16,y1:2,x2:16,y2:6}),
      React.createElement('line',{x1:8,y1:2,x2:8,y2:6}),
      React.createElement('line',{x1:3,y1:10,x2:21,y2:10})
    ),
    'Add to Calendar'
  );
}

// ── NEW DATA SCHEMA ─────────────────────────────────────────────────
const DEFAULT_OPS={
  userProfile:{weight:null,height:null,age:null},
  athleteProfile:{...DEFAULT_ATHLETE},
  trainingPlan:{planId:'hyrox'},
  accounts:[],
  categories:[],
  meals:{},
  exercises:[],
  workouts:[],
  tasks:[],
  workoutHistory:[],
  pantryInventory:[],
  foodLibrary:[],
  recipes:[],
  quickMealTemplates:[],
  mealTemplates:[],
  dailyMealPlans:{},
  taskHistory:[],
  taskTemplates:[],
  choreHistory:{},
  lifestyleItems:null,
  maintenanceHistory:{},
  calendarCache:{},
  busyBlocks:[],
  weekPatterns:{},
  dailyLogs:{},
  habits:[],
  captureNotes:[],
  maintenanceMeta:{},
  lastMaintenancePromptDate:null,
  securitySettings:{analyticsEnabled:true,dataExportHistory:[]},
  financialAccounts:[],
  transactions:[],
  merchantRules:{},
  recurringExpenses:[],
  financeSettings:{billReminders:true,reviewPrefs:'flagNew',transferRules:[]},
  top3:{},
  dailyExecution:{},
  dailyRecommendations:{},
  inboxItems:[], // [{id,text,createdDate,suggestedType,status:'pending'|'processed'}]
  googleClientId:null,
  notifications:{morningTime:'07:00',eveningTime:'21:00'},
  goalType:'race',
  lastRolloverDate:null,
  lastWeeklyPlanKey:null,
  lastWeeklySnapshotKey:null,
  weeklySnapshots:[],
  healthRecords:{cycle:{currentDay:null,phase:''},medications:[],appointments:[],labs:[],notes:''},
  fitnessProgram:'hyrox',nutr:{},hydr:{},hydGoal:72,proGoal:140,calGoal:2000,
};

function normalizeMealEntry(entry={},slotFallback='snack'){
  const foodIds=Array.isArray(entry.foodIds)
    ?entry.foodIds.filter(Boolean)
    :Array.isArray(entry.itemIds)
      ?entry.itemIds.filter(Boolean)
      :entry.foodId
        ?[entry.foodId]
        :[];
  return{
    ...entry,
    id:entry.id||String(Date.now()+Math.random()),
    slot:entry.slot||slotFallback,
    foodId:entry.foodId||foodIds[0]||null,
    foodIds,
    itemIds:foodIds,
  };
}
function normalizeMealsByDate(mealsByDate={}){
  return Object.entries(mealsByDate||{}).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=Array.isArray(value)?value.map(entry=>normalizeMealEntry(entry,entry?.slot||'snack')):[];
    return acc;
  },{});
}
function syncCanonicalProfileState(profile={}){
  const accounts=normalizeFinancialAccounts(profile.accounts||profile.financialAccounts||[]);
  const categories=resolveCategoryLibrary(profile.categories);
  const meals=normalizeMealsByDate(profile.meals||profile.nutr||profile.mealHistory||{});
  const workouts=Array.isArray(profile.workouts)?profile.workouts:(Array.isArray(profile.workoutHistory)?profile.workoutHistory:[]);
  const tasks=Array.isArray(profile.tasks)?profile.tasks:(Array.isArray(profile.taskHistory)?profile.taskHistory:[]);
  const athleteProfile=resolveAthleteProfile(profile.athleteProfile,profile.trainingPlan);
  return{
    ...profile,
    athleteProfile,
    trainingPlan:{planId:profile.trainingPlan?.planId||profile.fitnessProgram||athleteProfile.primaryProgram||'hyrox'},
    accounts,
    categories,
    meals,
    exercises:Array.isArray(profile.exercises)?profile.exercises:[],
    workouts,
    tasks,
    financialAccounts:accounts,
    nutr:meals,
    workoutHistory:workouts,
    taskHistory:tasks,
  };
}

function normalizeLoadedProfile(data={}){
  const normalized=syncCanonicalProfileState({...DEFAULT_OPS,...(data||{})});
  const legacyMeals=(data&&typeof data.mealHistory==='object'&&data.mealHistory)||null;
  if(legacyMeals&&Object.keys(legacyMeals).length>0){
    normalized.meals=normalizeMealsByDate({...legacyMeals,...(normalized.meals||{})});
  }
  normalized.tasks=Array.isArray(normalized.tasks)?normalized.tasks:[];
  normalized.workouts=Array.isArray(normalized.workouts)?normalized.workouts:[];
  normalized.dailyLogs=normalized.dailyLogs&&typeof normalized.dailyLogs==='object'?normalized.dailyLogs:{};
  normalized.meals=normalized.meals&&typeof normalized.meals==='object'?normalized.meals:{};
  normalized.hydr=normalized.hydr&&typeof normalized.hydr==='object'?normalized.hydr:{};
  normalized.dailyMealPlans=normalized.dailyMealPlans&&typeof normalized.dailyMealPlans==='object'?normalized.dailyMealPlans:{};
  normalized.mealTemplates=Array.isArray(normalized.mealTemplates)?normalized.mealTemplates:[];
  normalized.taskTemplates=Array.isArray(normalized.taskTemplates)?normalized.taskTemplates:[];
  normalized.brainDump=Array.isArray(normalized.brainDump)?normalized.brainDump:[];
  normalized.top3=normalized.top3&&typeof normalized.top3==='object'?normalized.top3:{};
  normalized.accounts=normalizeFinancialAccounts(normalized.accounts);
  normalized.categories=resolveCategoryLibrary(normalized.categories);
  normalized.lastRolloverDate=normalized.lastRolloverDate?normalizeDateKey(normalized.lastRolloverDate,null):null;
  normalized.lastWeeklyPlanKey=normalized.lastWeeklyPlanKey?normalizeDateKey(normalized.lastWeeklyPlanKey,null):null;
  normalized.lastWeeklySnapshotKey=normalized.lastWeeklySnapshotKey?normalizeDateKey(normalized.lastWeeklySnapshotKey,null):null;
  normalized.dailyLogs=Object.entries(normalized.dailyLogs).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]={...(value||{}),date:normalizedKey};
    return acc;
  },{});
  normalized.meals=normalizeMealsByDate(normalized.meals);
  normalized.hydr=Object.entries(normalized.hydr).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=Math.max(0,parseFloat(value)||0);
    return acc;
  },{});
  normalized.dailyMealPlans=Object.entries(normalized.dailyMealPlans).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=Array.isArray(value)?value.map(entry=>({
      ...entry,
      date:normalizeDateKey(entry?.date||normalizedKey,normalizedKey),
      plannedFor:normalizeDateKey(entry?.plannedFor||normalizedKey,normalizedKey),
    })):[];
    return acc;
  },{});
  normalized.top3=Object.entries(normalized.top3).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=Array.isArray(value)?value.slice(0,3):['','',''];
    return acc;
  },{});
  normalized.dailyExecution=Object.entries(normalized.dailyExecution&&typeof normalized.dailyExecution==='object'?normalized.dailyExecution:{}).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=normalizeDailyExecutionEntry(value,normalizedKey,normalized.top3?.[normalizedKey]||[]);
    return acc;
  },{});
  Object.entries(normalized.top3).forEach(([dateKey,value])=>{
    if(!normalized.dailyExecution[dateKey])normalized.dailyExecution[dateKey]=normalizeDailyExecutionEntry(null,dateKey,value);
  });
  normalized.dailyRecommendations=Object.entries(normalized.dailyRecommendations&&typeof normalized.dailyRecommendations==='object'?normalized.dailyRecommendations:{}).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=normalizeDailyRecommendationsEntry(value,normalizedKey);
    return acc;
  },{});
  normalized.tasks=normalized.tasks.map(task=>normalizeTaskEntry({
    ...task,
    date:normalizeDateKey(task?.date),
  }));
  normalized.workouts=normalized.workouts.map(entry=>({
    ...entry,
    date:normalizeDateKey(entry?.date),
    data:entry?.data&&typeof entry.data==='object'
      ?{
        ...entry.data,
        plannedDate:entry.data.plannedDate?normalizeDateKey(entry.data.plannedDate):entry.data.plannedDate,
      }
      :entry.data,
  }));
  normalized.transactions=(Array.isArray(normalized.transactions)?normalized.transactions:[]).map(tx=>({
    ...tx,
    date:normalizeDateKey(tx?.date),
    accountId:resolveTransactionAccountId(tx?.accountId||tx?.accountName||tx?.account,normalized.accounts),
  }));
  return syncCanonicalProfileState(normalized);
}

function createDailyExecutionTask(title='',overrides={}){
  const resolvedTitle=typeof title==='string'?title:(overrides.title||overrides.text||'');
  return{
    id:overrides.id||`dx-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    title:resolvedTitle,
    text:resolvedTitle,
    completed:!!overrides.completed,
    subtasks:Array.isArray(overrides.subtasks)?overrides.subtasks:[],
    notes:typeof overrides.notes==='string'?overrides.notes:'',
    createdAt:typeof overrides.createdAt==='string'?overrides.createdAt:(overrides.timestamp||new Date().toISOString()),
    date:overrides.date||getTodayKey(),
    timestamp:overrides.timestamp||new Date().toISOString(),
    updatedAt:overrides.updatedAt||new Date().toISOString(),
    ...overrides,
  };
}

function normalizeDailyExecutionTask(task={},dateKey=getTodayKey(),index=0){
  return createDailyExecutionTask(typeof task==='string'?task:(task?.title||task?.text||''),{
    ...((task&&typeof task==='object'&&!Array.isArray(task))?task:{}),
    id:task?.id||`dx-${dateKey}-${index}`,
    date:normalizeDateKey(task?.date||dateKey,dateKey),
    completed:!!task?.completed,
    subtasks:Array.isArray(task?.subtasks)?task.subtasks:[],
    notes:typeof task?.notes==='string'?task.notes:'',
    createdAt:typeof task?.createdAt==='string'?task.createdAt:(typeof task?.timestamp==='string'?task.timestamp:new Date().toISOString()),
    timestamp:typeof task?.timestamp==='string'?task.timestamp:null,
    updatedAt:typeof task?.updatedAt==='string'?task.updatedAt:new Date().toISOString(),
  });
}

function normalizeDailyExecutionEntry(entry,dateKey=getTodayKey(),legacyTop3=[]){
  const source=entry&&typeof entry==='object'&&!Array.isArray(entry)?entry:{};
  const taskSource=Array.isArray(source.tasks)&&source.tasks.length>0
    ?source.tasks
    :Array.isArray(source.priorities)&&source.priorities.length>0
      ?source.priorities
      :Array.isArray(source.agenda)&&source.agenda.length>0
        ?source.agenda
    :Array.isArray(legacyTop3)
      ?legacyTop3.filter(item=>typeof item==='string'&&item.trim())
      :[];
  const tasks=taskSource.map((task,index)=>normalizeDailyExecutionTask(task,dateKey,index));
  const mode=source.mode==='execution'?'execution':'planning';
  return{
    date:dateKey,
    tasks,
    priorities:tasks,
    agenda:tasks,
    mode,
  };
}

function normalizeDailyRecommendation(recommendation={},dateKey=getTodayKey()){
  const next=recommendation&&typeof recommendation==='object'&&!Array.isArray(recommendation)?recommendation:{};
  return{
    type:next.type||'task',
    date:normalizeDateKey(next.date||dateKey,dateKey),
    suggestion:next.suggestion&&typeof next.suggestion==='object'?next.suggestion:{},
    userOverride:!!next.userOverride,
    finalSelection:next.finalSelection&&typeof next.finalSelection==='object'?next.finalSelection:null,
    action:['accept','modify','ignore'].includes(next.action)?next.action:null,
    workoutDecisionMade:next.workoutDecisionMade===true,
    selectedWorkoutId:typeof next.selectedWorkoutId==='string'&&next.selectedWorkoutId.trim()?next.selectedWorkoutId:null,
  };
}

function normalizeDailyRecommendationsEntry(entry={},dateKey=getTodayKey()){
  const next=entry&&typeof entry==='object'&&!Array.isArray(entry)?entry:{};
  return{
    workout:next.workout?normalizeDailyRecommendation({...next.workout,type:'workout'},dateKey):null,
  };
}

const MACROS={protein:140,carbsTraining:200,carbsRest:130,fat:55};
function computeMacroTargets(isTrainingDay){
  const carbs=isTrainingDay?MACROS.carbsTraining:MACROS.carbsRest;
  return{protein:MACROS.protein,carbs,fat:MACROS.fat,calories:(MACROS.protein*4)+(carbs*4)+(MACROS.fat*9)};
}

const MEAL_SLOTS=[
  {id:'breakfast',label:'Breakfast',window:'7:30–9:00 AM'},
  {id:'lunch',label:'Lunch',window:'11:30 AM–2:00 PM'},
  {id:'dinner',label:'Dinner',window:'6:30–8:00 PM'},
  {id:'snack',label:'Snack',window:'Anytime'},
];

const DEFAULT_FOOD_LIBRARY=[
  {id:'egg',name:'Egg',category:'Protein',baseServingWeight:100,calories:143,protein:12.6,carbohydrates:0.7,fat:9.5,fiber:0,sodium:140,unitLabel:'egg',unitWeight:50,householdMeasure:'1 egg = 50g'},
  {id:'chicken_breast',name:'Chicken Breast',category:'Protein',baseServingWeight:100,calories:165,protein:31,carbohydrates:0,fat:3.6,fiber:0,sodium:74,unitLabel:'portion',unitWeight:120,householdMeasure:'1 portion = 120g'},
  {id:'ground_beef_lean',name:'Ground Beef 93%',category:'Protein',baseServingWeight:100,calories:176,protein:26,carbohydrates:0,fat:8,fiber:0,sodium:72,unitLabel:'portion',unitWeight:113,householdMeasure:'4 oz = 113g'},
  {id:'white_rice',name:'Cooked White Rice',category:'Carb',baseServingWeight:100,calories:130,protein:2.4,carbohydrates:28.2,fat:0.3,fiber:0.4,sodium:1,unitLabel:'cup',unitWeight:158,householdMeasure:'1 cup = 158g'},
  {id:'oats',name:'Rolled Oats',category:'Carb',baseServingWeight:100,calories:389,protein:16.9,carbohydrates:66.3,fat:6.9,fiber:10.6,sodium:2,unitLabel:'cup',unitWeight:80,householdMeasure:'1 cup dry = 80g'},
  {id:'potato',name:'Potato',category:'Carb',baseServingWeight:100,calories:77,protein:2,carbohydrates:17,fat:0.1,fiber:2.2,sodium:6,unitLabel:'potato',unitWeight:173,householdMeasure:'1 medium = 173g'},
  {id:'greek_yogurt',name:'Greek Yogurt 2%',category:'Protein',baseServingWeight:100,calories:73,protein:9.9,carbohydrates:3.9,fat:2,fiber:0,sodium:36,unitLabel:'cup',unitWeight:227,householdMeasure:'1 cup = 227g'},
  {id:'milk_2pct',name:'Milk 2%',category:'Dairy',baseServingWeight:100,calories:50,protein:3.4,carbohydrates:4.8,fat:2,fiber:0,sodium:44,unitLabel:'cup',unitWeight:244,householdMeasure:'1 cup = 244g'},
  {id:'olive_oil',name:'Olive Oil',category:'Fat',baseServingWeight:100,calories:884,protein:0,carbohydrates:0,fat:100,fiber:0,sodium:2,unitLabel:'tbsp',unitWeight:14,householdMeasure:'1 tbsp = 14g'},
  {id:'broccoli',name:'Broccoli',category:'Vegetable',baseServingWeight:100,calories:35,protein:2.4,carbohydrates:7.2,fat:0.4,fiber:3.3,sodium:41,unitLabel:'cup',unitWeight:91,householdMeasure:'1 cup = 91g'},
  {id:'spinach',name:'Spinach',category:'Vegetable',baseServingWeight:100,calories:23,protein:2.9,carbohydrates:3.6,fat:0.4,fiber:2.2,sodium:79,unitLabel:'cup',unitWeight:30,householdMeasure:'1 cup = 30g'},
  {id:'banana',name:'Banana',category:'Fruit',baseServingWeight:100,calories:89,protein:1.1,carbohydrates:22.8,fat:0.3,fiber:2.6,sodium:1,unitLabel:'banana',unitWeight:118,householdMeasure:'1 medium = 118g'},
  {id:'berries',name:'Mixed Berries',category:'Fruit',baseServingWeight:100,calories:57,protein:0.7,carbohydrates:14,fat:0.3,fiber:4,sodium:1,unitLabel:'cup',unitWeight:140,householdMeasure:'1 cup = 140g'},
  {id:'tortilla',name:'Flour Tortilla',category:'Carb',baseServingWeight:100,calories:310,protein:8,carbohydrates:52,fat:8,fiber:3,sodium:650,unitLabel:'tortilla',unitWeight:49,householdMeasure:'1 tortilla = 49g'},
];
function resolveFoodLibrary(customFoods=[]){
  return mergeRecordsById(DEFAULT_FOOD_LIBRARY,customFoods||[]);
}

const DEFAULT_RECIPE_TEMPLATES=[
  {id:'chicken_rice_bowl',name:'Chicken Rice Bowl',ingredients:[{foodId:'chicken_breast',grams:150},{foodId:'white_rice',grams:180},{foodId:'broccoli',grams:100},{foodId:'olive_oil',grams:10}],totalCookedWeight:440,servings:1,prepTime:25,isMealPrep:false,instructions:['Cook rice.','Pan-sear chicken.','Steam broccoli and combine.']},
  {id:'yogurt_parfait',name:'Yogurt Parfait',ingredients:[{foodId:'greek_yogurt',grams:220},{foodId:'berries',grams:100},{foodId:'oats',grams:35},{foodId:'banana',grams:60}],totalCookedWeight:415,servings:1,prepTime:5,isMealPrep:false,instructions:['Layer yogurt, oats, and fruit.']},
  {id:'egg_veg_scramble',name:'Egg and Veg Scramble',ingredients:[{foodId:'egg',grams:150},{foodId:'spinach',grams:60},{foodId:'potato',grams:140},{foodId:'olive_oil',grams:8}],totalCookedWeight:320,servings:1,prepTime:18,isMealPrep:false,instructions:['Saute potatoes.','Add spinach and eggs, then scramble.']},
  {id:'beef_stir_fry',name:'Simple Beef Stir-Fry',ingredients:[{foodId:'ground_beef_lean',grams:140},{foodId:'white_rice',grams:160},{foodId:'broccoli',grams:120},{foodId:'olive_oil',grams:8}],totalCookedWeight:428,servings:1,prepTime:22,isMealPrep:false,instructions:['Brown beef.','Cook broccoli.','Serve over rice.']},
];

const DEFAULT_QUICK_MEAL_TEMPLATES=[
  {id:'tmpl_yogurt_bowl',name:'Yogurt Bowl',slot:'breakfast',cal:320,pro:27,carb:34,fat:8,itemIds:['greek_yogurt','berries','oats']},
  {id:'tmpl_egg_skillet',name:'Egg Skillet',slot:'breakfast',cal:360,pro:24,carb:24,fat:18,itemIds:['egg','potato','spinach']},
  {id:'tmpl_chicken_rice',name:'Chicken and Rice',slot:'lunch',cal:560,pro:52,carb:58,fat:12,itemIds:['chicken_breast','white_rice','broccoli']},
  {id:'tmpl_beef_bowl',name:'Beef Bowl',slot:'dinner',cal:610,pro:42,carb:54,fat:22,itemIds:['ground_beef_lean','white_rice','broccoli']},
];

const MEAL_SLOT_SCHEDULE={
  breakfast:{start:'07:30',label:'Breakfast window'},
  lunch:{start:'11:30',label:'Lunch window'},
  dinner:{start:'18:30',label:'Dinner window'},
  snack:{start:'15:30',label:'Snack window'},
};

function roundMacro(n){return Math.round((n||0)*10)/10;}
function scaleFoodMacros(food,grams){
  const factor=(parseFloat(grams)||0)/100;
  return{
    grams:parseFloat(grams)||0,
    cal:Math.round((food.calories||0)*factor),
    pro:roundMacro((food.protein||0)*factor),
    carb:roundMacro((food.carbohydrates||0)*factor),
    fat:roundMacro((food.fat||0)*factor),
    fiber:roundMacro((food.fiber||0)*factor),
    sodium:roundMacro((food.sodium||0)*factor),
  };
}
function gramsFromFoodInput(food,grams,units){
  if(grams&&parseFloat(grams)>0)return parseFloat(grams);
  if(units&&parseFloat(units)>0&&food?.unitWeight)return parseFloat(units)*food.unitWeight;
  return 0;
}
function computeRecipeNutrition(recipe,foods){
  const byId=Object.fromEntries(foods.map(f=>[f.id,f]));
  const items=(recipe.ingredients||[]).map(ing=>{
    const food=byId[ing.foodId];
    return food?{food,grams:ing.grams,macros:scaleFoodMacros(food,ing.grams)}:null;
  }).filter(Boolean);
  const total=items.reduce((acc,item)=>({
    grams:acc.grams+item.grams,
    cal:acc.cal+item.macros.cal,
    pro:acc.pro+item.macros.pro,
    carb:acc.carb+item.macros.carb,
    fat:acc.fat+item.macros.fat,
  }),{grams:0,cal:0,pro:0,carb:0,fat:0});
  const servings=Math.max(recipe.servings||1,1);
  const cookedWeight=recipe.totalCookedWeight||total.grams;
  return{
    items,
    total:{...total,pro:roundMacro(total.pro),carb:roundMacro(total.carb),fat:roundMacro(total.fat)},
    perServing:{
      grams:roundMacro(cookedWeight/servings),
      cal:Math.round(total.cal/servings),
      pro:roundMacro(total.pro/servings),
      carb:roundMacro(total.carb/servings),
      fat:roundMacro(total.fat/servings),
    },
  };
}
function pantryCoverage(recipe,pantryInventory){
  const pantryIds=new Set((pantryInventory||[]).map(item=>{
    if(typeof item==='string')return item;
    return item.baseFoodId||item.foodId||item.id;
  }).filter(Boolean));
  const needs=(recipe.ingredients||[]).map(i=>i.foodId);
  const matched=needs.filter(id=>pantryIds.has(id)).length;
  return{matched,total:needs.length,ready:needs.length>0&&matched===needs.length};
}
function mergeRecordsById(defaults=[],custom=[]){
  const merged=[...defaults];
  (custom||[]).forEach(record=>{
    if(!record?.id)return;
    const idx=merged.findIndex(item=>item.id===record.id);
    if(idx>=0)merged[idx]={...merged[idx],...record};
    else merged.push(record);
  });
  return merged;
}
function resolveMealTemplates(customTemplates=[],foods=[]){
  const foodMap=Object.fromEntries((foods||[]).map(food=>[food.id,food]));
  return mergeRecordsById(DEFAULT_MEAL_TEMPLATES,customTemplates).map(template=>{
    const ingredientTotals=(template.ingredients||[]).reduce((acc,ingredient)=>{
      const food=foodMap[ingredient.foodId];
      if(!food)return acc;
      const macros=scaleFoodMacros(food,ingredient.grams||0);
      return{
        grams:acc.grams+(ingredient.grams||0),
        cal:acc.cal+(macros.cal||0),
        pro:acc.pro+(macros.pro||0),
        carb:acc.carb+(macros.carb||0),
        fat:acc.fat+(macros.fat||0),
      };
    },{grams:0,cal:0,pro:0,carb:0,fat:0});
    const macros={
      cal:template.macros?.cal??Math.round(ingredientTotals.cal||0),
      pro:template.macros?.pro??roundMacro(ingredientTotals.pro||0),
      carb:template.macros?.carb??roundMacro(ingredientTotals.carb||0),
      fat:template.macros?.fat??roundMacro(ingredientTotals.fat||0),
    };
    const servingSizeGrams=template.servingSizeGrams||Math.round(ingredientTotals.grams||0);
    const batchPrep=template.batchPrep?{
      totalRecipeWeight:template.batchPrep.totalRecipeWeight||servingSizeGrams,
      servings:Math.max(template.batchPrep.servings||1,1),
      macrosPerServing:{
        cal:template.batchPrep.macrosPerServing?.cal??macros.cal,
        pro:template.batchPrep.macrosPerServing?.pro??macros.pro,
        carb:template.batchPrep.macrosPerServing?.carb??macros.carb,
        fat:template.batchPrep.macrosPerServing?.fat??macros.fat,
      },
    }:null;
    return{
      ...template,
      servingSizeGrams,
      macros,
      mealType:template.mealType||'lunch',
      tags:Array.isArray(template.tags)?template.tags:[],
      coachingCues:template.coachingCues||[],
      batchPrep,
    };
  });
}
function getDailyMealPlanEntries(dailyMealPlans,dateStr){
  return Array.isArray(dailyMealPlans?.[dateStr])?dailyMealPlans[dateStr]:[];
}
function cloneMealPlanEntries(entries=[],targetDate){
  return (entries||[]).map(entry=>({
    ...entry,
    id:`meal-plan-${targetDate}-${Math.random().toString(36).slice(2,8)}`,
    date:targetDate,
    plannedFor:targetDate,
    loggedMealId:null,
    createdAt:new Date().toISOString(),
  }));
}
function getPantryFirstMealSuggestions(mealTemplates=[],pantryInventory=[]){
  return mealTemplates.map(template=>{
    const coverage=pantryCoverage({ingredients:template.ingredients||[]},pantryInventory);
    const protein=template.macros?.pro||0;
    return{template,coverage,protein};
  }).sort((a,b)=>{
    if(b.coverage.matched!==a.coverage.matched)return b.coverage.matched-a.coverage.matched;
    if((b.coverage.ready?1:0)!==(a.coverage.ready?1:0))return(b.coverage.ready?1:0)-(a.coverage.ready?1:0);
    return (b.protein||0)-(a.protein||0);
  });
}
function buildMealLogFromTemplate(template,slotOverride,extra={}){
  if(!template)return null;
  const foodIds=(template.ingredients||[]).map(item=>item.foodId).filter(Boolean);
  return{
    meal:template.name,
    source:extra.source||'meal-template',
    templateId:template.id,
    foodId:foodIds[0]||null,
    foodIds,
    itemIds:foodIds,
    grams:template.servingSizeGrams||0,
    cal:template.macros?.cal||0,
    pro:template.macros?.pro||0,
    carb:template.macros?.carb||0,
    fat:template.macros?.fat||0,
    photo:extra.photo||null,
    plannedMealId:extra.plannedMealId||null,
  };
}
function resolveTaskTemplates(customTemplates=[]){
  return mergeRecordsById(DEFAULT_TASK_TEMPLATES,customTemplates).map(template=>({
    ...template,
    contextTags:Array.isArray(template.contextTags)?template.contextTags:[],
    subtasks:Array.isArray(template.subtasks)?template.subtasks:[],
    defaultBucket:template.defaultBucket||'next',
  }));
}
function normalizeTaskEntry(task,todayStr=getCurrentDate().today){
  const done=!!task?.done;
  const status=done?'done':task?.status||'active';
  return{
    ...task,
    date:task?.date||todayStr,
    bucket:task?.bucket||(task?.date&&task.date>todayStr?'scheduled':'next'),
    status,
    contextTags:Array.isArray(task?.contextTags)?task.contextTags:[],
    scheduledTime:task?.scheduledTime||'',
    endTime:task?.endTime||'',
    energyLevel:task?.energyLevel||null,
    done,
    parentId:task?.parentId||null,
  };
}
function getTaskChildren(taskId,tasks=[]){
  return (tasks||[]).filter(task=>task.parentId===taskId);
}
function getTaskProgress(task,tasks=[]){
  const subtasks=getTaskChildren(task.id,tasks);
  if(subtasks.length===0)return null;
  const completed=subtasks.filter(item=>item.done).length;
  return{completed,total:subtasks.length};
}
function getSuggestedTaskTime(task){
  const tags=(task?.contextTags||[]).join(' ').toLowerCase();
  if(tags.includes('errand'))return'12:00';
  if(tags.includes('meal'))return'17:30';
  if((task?.priority||1)>=3)return'09:00';
  return'14:00';
}
function getTaskBuckets(taskHistory=[],todayStr=getCurrentDate().today){
  const tasks=(taskHistory||[]).map(task=>normalizeTaskEntry(task,todayStr));
  const sortExecution=(items=[])=>items.slice().sort((a,b)=>{
    const aOverdue=a.date<todayStr?1:0;
    const bOverdue=b.date<todayStr?1:0;
    if(aOverdue!==bOverdue)return bOverdue-aOverdue;
    if(!!a.scheduledTime!==!!b.scheduledTime)return a.scheduledTime?-1:1;
    if((a.scheduledTime||'')!==(b.scheduledTime||''))return(a.scheduledTime||'').localeCompare(b.scheduledTime||'');
    if((b.priority||1)!==(a.priority||1))return (b.priority||1)-(a.priority||1);
    if((a.date||todayStr)!==(b.date||todayStr))return (a.date||todayStr).localeCompare(b.date||todayStr);
    return String(a.text||'').localeCompare(String(b.text||''));
  });
  const topLevel=tasks.filter(task=>!task.parentId);
  return{
    all:tasks,
    inboxCandidates:topLevel.filter(task=>!task.done&&task.status==='active'&&task.bucket==='inbox'),
    next:sortExecution(topLevel.filter(task=>!task.done&&task.status==='active'&&task.date<=todayStr&&(task.bucket==='next'||!task.scheduledTime))),
    scheduled:sortExecution(topLevel.filter(task=>!task.done&&task.status==='active'&&(task.date>todayStr||!!task.scheduledTime||task.bucket==='scheduled'))),
    done:topLevel.filter(task=>task.done||task.status==='done').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),
    overdue:sortExecution(topLevel.filter(task=>!task.done&&task.status==='active'&&task.date<todayStr)),
  };
}
function addDaysIso(dateStr,days){
  const d=parseDateKey(dateStr)||parseDateKey(getTodayKey());
  d.setDate(d.getDate()+days);
  return formatDateKey(d);
}
function subtractDaysIso(dateStr,days){
  return addDaysIso(dateStr,-days);
}
function annualDueDateForYear(year,month,day){
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function resolveAnnualMaintenanceDates(task,lastCompleted,todayStr,taskMeta={}){
  const dueMonth=task.dueMonth;
  const dueDay=task.dueDay;
  const leadDays=task.leadDays??30;
  const year=new Date(todayStr+'T00:00:00').getFullYear();
  const dueThisYear=annualDueDateForYear(year,dueMonth,dueDay);
  const dueNextYear=annualDueDateForYear(year+1,dueMonth,dueDay);
  const dueDateStr=taskMeta.dueDate
    || (lastCompleted&&lastCompleted>=dueThisYear?dueNextYear:dueThisYear);
  const startDateStr=taskMeta.startDate||subtractDaysIso(dueDateStr,leadDays);
  return{dueDateStr,startDateStr};
}
function computeMaintenanceQueue(tasks,history,meta={},todayStr=getCurrentDate().today){
  const today=new Date(todayStr+'T00:00:00');
  return tasks.map(task=>{
    const last=history?.[task.id]||null;
    const taskMeta=meta?.[task.id]||{};
    const annualDates=task.frequency==='annual'
      ?resolveAnnualMaintenanceDates(task,last,todayStr,taskMeta)
      :null;
    const dueDateStr=annualDates?.dueDateStr||(taskMeta.dueDate||(last?addDaysIso(last,task.intervalDays):todayStr));
    const defaultLeadDays=task.leadDays??Math.min(14,Math.max(3,Math.round((task.intervalDays||30)*0.15)));
    const startDateStr=annualDates?.startDateStr||(taskMeta.startDate||(dueDateStr?subtractDaysIso(dueDateStr,defaultLeadDays):todayStr));
    const dueDate=new Date(dueDateStr+'T00:00:00');
    const startDate=new Date(startDateStr+'T00:00:00');
    const dayDiff=Math.floor((dueDate-today)/86400000);
    const startDiff=Math.floor((startDate-today)/86400000);
    const status=today<startDate
      ?'upcoming'
      :today>dueDate
        ?'overdue'
        :dayDiff===0
          ?'today'
          :'active';
    return{
      ...task,
      lastCompleted:last,
      startDate:startDateStr,
      dueDate:dueDateStr,
      daysUntil:dayDiff,
      daysUntilStart:startDiff,
      daysOverdue:Math.max(0,-dayDiff),
      dueSoon:status==='active'&&dayDiff<=5,
      status,
    };
  }).sort((a,b)=>{
    const order={overdue:0,today:1,active:2,upcoming:3};
    if(order[a.status]!==order[b.status])return order[a.status]-order[b.status];
    return a.daysUntil-b.daysUntil;
  });
}

const DAILY_CHORES=[
  {id:'bed',label:'Make bed'},
  {id:'roomba',label:'Run Roomba'},
  {id:'dishes',label:'Dishes / dishwasher reset'},
  {id:'kitchen',label:'Kitchen counter wipe'},
  {id:'tidy',label:'Quick house tidy'},
  {id:'trash_check',label:'Trash check'},
  {id:'kai_am',label:'Ki — morning care'},
  {id:'kai_pm',label:'Ki — evening care'},
  {id:'plants',label:'Plant check'},
  {id:'evening_reset',label:'Evening reset'},
];

const WEEKLY_CHORES=[
  {id:'vacuum',label:'Vacuum',freqPerWk:1},
  {id:'mop',label:'Mop floors',freqPerWk:2},
  {id:'bathrooms',label:'Clean bathrooms',freqPerWk:2},
  {id:'dusting',label:'Dust surfaces',freqPerWk:2},
  {id:'laundry_wed',label:'Laundry (Wed)',freqPerWk:1,dayHint:3},
  {id:'laundry_fri',label:'Laundry (Fri)',freqPerWk:1,dayHint:5},
  {id:'sheets',label:'Change sheets',freqPerWk:1},
  {id:'yard',label:'Yard work',freqPerWk:3},
];

const MAINTENANCE_TASKS=[
  {id:'gym_clothes',label:'Wash gym clothes',intervalDays:7,category:'Weekly'},
  {id:'meal_prep',label:'Meal prep reset',intervalDays:7,category:'Weekly'},
  {id:'grocery_restock',label:'Grocery restock',intervalDays:7,category:'Weekly'},
  {id:'smoke',label:'Test smoke detectors',frequency:'annual',dueMonth:7,dueDay:15,leadDays:30,category:'Yearly'},
  {id:'disposal',label:'Clean garbage disposal',intervalDays:30,category:'Monthly'},
  {id:'dishwasher_c',label:'Dishwasher clean cycle',intervalDays:30,category:'Monthly'},
  {id:'washer_c',label:'Washer clean cycle',intervalDays:30,category:'Monthly'},
  {id:'appliances',label:'Appliance inspection',intervalDays:30,category:'Monthly'},
  {id:'supplements',label:'Refill supplements',intervalDays:30,category:'Monthly'},
  {id:'roof',label:'Roof inspection',intervalDays:90,category:'Quarterly'},
  {id:'seals',label:'Seal inspection',intervalDays:90,category:'Quarterly'},
  {id:'drainage',label:'Drainage check',intervalDays:90,category:'Quarterly'},
  {id:'weatherstrip',label:'Weather stripping check',intervalDays:90,category:'Quarterly'},
  {id:'plumbing',label:'Plumbing leak check',intervalDays:90,category:'Quarterly'},
  {id:'shoe_replace',label:'Replace running shoes',intervalDays:120,category:'Quarterly'},
  {id:'hvac',label:'HVAC service',frequency:'annual',dueMonth:3,dueDay:15,leadDays:30,category:'Yearly'},
  {id:'dryer_vent',label:'Clean dryer vent',frequency:'annual',dueMonth:4,dueDay:15,leadDays:30,category:'Yearly'},
  {id:'gutters',label:'Clean gutters',frequency:'annual',dueMonth:10,dueDay:1,leadDays:30,category:'Yearly'},
  {id:'exterior',label:'Exterior inspection',frequency:'annual',dueMonth:5,dueDay:15,leadDays:30,category:'Yearly'},
  {id:'checkup',label:'Schedule checkup',intervalDays:180,category:'Yearly'},
  {id:'foundation',label:'Foundation drainage',frequency:'annual',dueMonth:11,dueDay:1,leadDays:30,category:'Yearly'},
];

function weekKey(date){return formatDateKey(getMondayWeekStartDate(date));}

const BUSY_CATEGORIES=[
  {id:'meeting',   label:'Meeting',         clr:C.navy},
  {id:'focus',     label:'Focus time',      clr:C.sage},
  {id:'unavailable',label:'Unavailable',    clr:C.muted},
  {id:'commute',   label:'Commute / errand',clr:C.amber},
  {id:'hold',      label:'Personal hold',   clr:C.navy},
];
const BUSY_PRESETS=[
  {label:'Morning meetings', startTime:'09:00',endTime:'12:00',category:'meeting'},
  {label:'Lunch blocked',    startTime:'11:30',endTime:'13:00',category:'unavailable'},
  {label:'Afternoon block',  startTime:'13:00',endTime:'17:00',category:'meeting'},
  {label:'All-day hold',     startTime:'08:00',endTime:'18:00',category:'unavailable'},
];
function timeToMins(t){if(typeof t!=='string'||!t.includes(':'))return 0;const[h,m]=t.split(':').map(Number);return(h||0)*60+(m||0);}
function minsToTime(m){return`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function fmtTimeRange(s,e){
  if(typeof s!=='string'||typeof e!=='string')return'–';
  const fmt=t=>{const[h,m]=t.split(':').map(Number);const ampm=h>=12?'pm':'am';const hh=h>12?h-12:h||12;return m?`${hh}:${String(m).padStart(2,'0')}${ampm}`:`${hh}${ampm}`;};
  return`${fmt(s)} – ${fmt(e)}`;
}

const CATEGORY_LIBRARY=[
  {id:'groceries', label:'Groceries',      clr:C.sage,ord:1},
  {id:'dining',    label:'Dining',         clr:C.amber,ord:2},
  {id:'household', label:'Household',      clr:C.navy,ord:3},
  {id:'fitness',   label:'Fitness',        clr:C.navy,ord:4},
  {id:'transport', label:'Gas / Transport',clr:C.warning||C.amber,ord:5},
  {id:'shopping',  label:'Shopping',       clr:C.muted,ord:6},
  {id:'bills',     label:'Bills',          clr:C.navy,ord:7},
  {id:'income',    label:'Income',         clr:C.sage,ord:8},
  {id:'transfer',  label:'Transfer',       clr:C.muted,ord:9},
  {id:'other',     label:'Other',          clr:C.tx2,ord:10},
];
function normalizeCategoryRecord(category={}){
  const label=String(category.label||category.name||'Other').trim()||'Other';
  const id=String(category.id||label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||`category_${Date.now()}`);
  return{
    id,
    label,
    clr:String(category.clr||category.color||C.tx2),
    ord:Number.isFinite(category.ord)?category.ord:999,
    isSystem:category.isSystem===true,
  };
}
function normalizeCategories(categories){
  const seen=new Set();
  return (Array.isArray(categories)?categories:CATEGORY_LIBRARY).reduce((list,category,idx)=>{
    const normalized=normalizeCategoryRecord({...category,ord:category?.ord??idx+1});
    if(!normalized.id||seen.has(normalized.id))return list;
    seen.add(normalized.id);
    list.push(normalized);
    return list;
  },[]).sort((a,b)=>(a.ord||999)-(b.ord||999)||a.label.localeCompare(b.label));
}
function resolveCategoryLibrary(customCategories=[]){
  return normalizeCategories(
    mergeRecordsById(
      CATEGORY_LIBRARY.map((category,idx)=>({...category,isSystem:true,ord:category.ord??idx+1})),
      (customCategories||[]).map((category,idx)=>({...category,ord:category.ord??CATEGORY_LIBRARY.length+idx+1}))
    )
  );
}
const CAT_RULES={
  groceries:['WALMART','KROGER','PUBLIX','WHOLEFOOD','TRADER JOE','ALDI','COSTCO','SAMS CLUB','INSTACART'],
  dining:['MCDONALD','CHICK-FIL','CHIPOTLE','STARBUCKS','DOORDASH','GRUBHUB','UBEREATS','DOMINO','SUBWAY','WENDY','TACO BELL','PIZZA','PANERA'],
  household:['HOME DEPOT','LOWES','IKEA','BED BATH','TARGET','WAYFAIR','ACE HARDWARE'],
  fitness:['GYM','LIFETIME','ANYTIME FITNESS','HYROX','CROSSFIT','PELOTON','NIKE','DICK\'S SPORTING'],
  transport:['SHELL','BP','EXXON','CHEVRON','SUNOCO','CIRCLE K','PILOT','SPEEDWAY','UBER','LYFT','PARKING','TOLL'],
  shopping:['AMAZON','EBAY','ETSY','BEST BUY','APPLE.COM','GOOGLE','PAYPAL'],
  bills:['ELECTRIC','WATER','INTERNET','AT&T','VERIZON','T-MOBILE','NETFLIX','SPOTIFY','HULU','DISNEY','HBO','INSURANCE','GEICO','STATE FARM','PROGRESSIVE','ALLSTATE','COMCAST','XFINITY','DUKE ENERGY','FPL','TAMPA ELECTRIC'],
  income:['PAYROLL','DIRECT DEP','DIRECT DEPOSIT','SALARY','EMPLOYER','ZELLE FROM','VENMO FROM'],
  transfer:['TRANSFER','ZELLE TO','VENMO TO','ACH TO','ACH FROM','ALLY','REGIONS'],
};
// Quick-add merchant templates for fast manual entry
const QUICK_MERCHANTS=[
  {label:'Aldi',       merchant:'Aldi',       category:'groceries', icon:'🛒'},
  {label:'Costco',     merchant:'Costco',     category:'groceries', icon:'🛒'},
  {label:'Publix',     merchant:'Publix',     category:'groceries', icon:'🛒'},
  {label:'Coffee',     merchant:'Coffee',     category:'dining',    icon:'☕'},
  {label:'Dining out', merchant:'',           category:'dining',    icon:'🍽'},
  {label:'Gas',        merchant:'Gas',        category:'transport', icon:'⛽'},
  {label:'Amazon',     merchant:'Amazon',     category:'shopping',  icon:'📦'},
  {label:'Electric',   merchant:'Electric bill',category:'bills',   icon:'⚡'},
  {label:'Internet',   merchant:'Internet',   category:'bills',     icon:'📡'},
  {label:'Mortgage',   merchant:'Mortgage',   category:'bills',     icon:'🏠'},
  {label:'Gym',        merchant:'Gym',        category:'fitness',   icon:'💪'},
  {label:'Transfer',   merchant:'Transfer',   category:'transfer',  icon:'↔️', isTransfer:true},
];

function autoCategorize(description,merchantRules){
  const d=(description||'').toUpperCase();
  // 1. merchant rule override
  for(const[merchant,cat] of Object.entries(merchantRules||{})){
    if(d.includes(merchant.toUpperCase()))return cat;
  }
  // 2. keyword match
  for(const[cat,kws] of Object.entries(CAT_RULES)){
    if(kws.some(kw=>d.includes(kw)))return cat;
  }
  return'other';
}
function parseAllyCSV(text){
  const lines=text.trim().split('\n');
  const header=lines[0].toLowerCase();
  const isAlly=header.includes('date')&&header.includes('description')&&header.includes('amount');
  if(!isAlly)return null;
  return lines.slice(1).filter(l=>l.trim()).map(l=>{
    const cols=l.match(/(".*?"|[^,]+)(?:,|$)/g)?.map(c=>c.replace(/^"|"$|,$/g,'').trim())||[];
    const [date,,desc,,amount,,balance]=cols;
    const amt=parseFloat((amount||'0').replace(/[$,]/g,''));
    return{transactionId:`ally-${date}-${Math.random()}`,date:date||getCurrentDate().today,merchant:desc||'',description:desc||'',amount:Math.abs(amt),isCredit:amt>0,accountId:'',category:'',isReviewed:false,isTransfer:false,isRecurring:false,notes:'',_importAccount:{institution:'Ally',name:'Imported account',type:'checking',isActive:true}};
  }).filter(t=>t.date&&!isNaN(t.amount));
}
function parseRegionsCSV(text){
  const lines=text.trim().split('\n');
  const header=lines[0].toLowerCase();
  const isRegions=header.includes('date')&&(header.includes('debit')||header.includes('credit'));
  if(!isRegions)return null;
  return lines.slice(1).filter(l=>l.trim()).map(l=>{
    const cols=l.match(/(".*?"|[^,]+)(?:,|$)/g)?.map(c=>c.replace(/^"|"$|,$/g,'').trim())||[];
    const[date,desc,,debit,credit]=cols;
    const amt=parseFloat((credit||debit||'0').replace(/[$,]/g,''));
    const isCredit=!!credit&&!debit;
    return{transactionId:`regions-${date}-${Math.random()}`,date:date||getCurrentDate().today,merchant:desc||'',description:desc||'',amount:Math.abs(amt),isCredit,accountId:'',category:'',isReviewed:false,isTransfer:false,isRecurring:false,notes:'',_importAccount:{institution:'Regions',name:'Imported account',type:'checking',isActive:true}};
  }).filter(t=>t.date&&!isNaN(t.amount));
}
function detectRecurring(transactions){
  const groups={};
  for(const t of transactions){
    const key=t.merchant.substring(0,12).toUpperCase().trim();
    if(!groups[key])groups[key]=[];
    groups[key].push(t);
  }
  const recurring=[];
  for(const[merchant,txns] of Object.entries(groups)){
    if(txns.length<2)continue;
    const amounts=txns.map(t=>t.amount);
    const avgAmt=amounts.reduce((s,a)=>s+a,0)/amounts.length;
    const maxDev=Math.max(...amounts.map(a=>Math.abs(a-avgAmt)));
    if(maxDev/avgAmt>0.15)continue; // too variable
    const dates=txns.map(t=>new Date(t.date+'T12:00:00')).sort((a,b)=>a-b);
    const intervals=dates.slice(1).map((d,i)=>Math.round((d-dates[i])/86400000));
    if(intervals.length===0)continue;
    const avgInterval=intervals.reduce((s,i)=>s+i,0)/intervals.length;
    let freq='monthly';
    if(avgInterval<=8)freq='weekly';
    else if(avgInterval<=16)freq='biweekly';
    const lastDate=dates[dates.length-1];
    const nextDate=new Date(lastDate.getTime()+avgInterval*86400000);
    recurring.push({merchant,averageAmount:+avgAmt.toFixed(2),frequency:freq,nextExpectedDate:formatDateKey(nextDate),category:txns[0].category||'bills'});
  }
  return recurring;
}
function fmtMoney(n){return(n||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:0});}
function fmtMoneyD(n){return(n||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});}

// ── QUICK CAPTURE ROUTING ─────────────────────────────────────────
const CAPTURE_CURRENCY=/(\$[\d,.]+|[\d,.]+\s*dollars?)/i;
const CAPTURE_DATE=/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|\d{1,2}\/\d{1,2}|\b\d{1,2}(st|nd|rd|th)\b)/i;
const CAPTURE_NOTE=/^(idea:|note:|think:|remember:|\*)/i;
function parseMinutesInput(text){
  const t=(text||'').trim();
  if(!t)return null;
  if(/^\d+:\d{2}$/.test(t)){
    const [m,s]=t.split(':').map(Number);
    return +(m+(s/60)).toFixed(2);
  }
  const n=parseFloat(t);
  return Number.isFinite(n)&&n>0?n:null;
}
function routeCapture(text){
  const t=text.trim();
  if(!t)return null;
  const lower=t.toLowerCase();
  const workoutStart=/^(start|continue)\s+(today'?s\s+)?workout/.test(lower);
  if(workoutStart)return{type:'command',command:'start_workout',label:'Start Workout',icon:'W',preview:'Start today\'s workout'};
  const foodMatch=t.match(/^log\s+(.+?)\s+(\d+(?:\.\d+)?)\s*g$/i);
  if(foodMatch)return{type:'command',command:'log_food',label:'Log Food',icon:'F',foodQuery:foodMatch[1].trim(),grams:parseFloat(foodMatch[2]),preview:`Log ${foodMatch[1].trim()} ${foodMatch[2]}g`};
  const fiveKMatch=t.match(/^add\s+5k\s+time\s+(.+)$/i);
  if(fiveKMatch){
    const mins=parseMinutesInput(fiveKMatch[1]);
    if(mins)return{type:'command',command:'set_5k',label:'Set 5K Time',icon:'P',minutes:mins,preview:`Set 5K time to ${fiveKMatch[1].trim()}`};
  }
  const groceryMatch=t.match(/^add\s+grocery\s+item\s+(.+)$/i);
  if(groceryMatch)return{type:'command',command:'add_grocery',label:'Add Grocery Item',icon:'G',item:groceryMatch[1].trim(),preview:`Add grocery item: ${groceryMatch[1].trim()}`};
  if(CAPTURE_NOTE.test(t))return{type:'note',label:'Note',icon:'N',preview:t.replace(/^(idea:|note:|think:|remember:|\*)\s*/i,'')};
  if(CAPTURE_CURRENCY.test(t)){
    const match=t.match(/\$?([\d,.]+)/);
    const amount=match?parseFloat(match[1].replace(',','')):null;
    return{type:'expense',label:'Expense',icon:'$',amount,preview:t};
  }
  if(CAPTURE_DATE.test(t))return{type:'task',label:'Task',icon:'T',preview:t};
  return{type:'task',label:'Task',icon:'T',preview:t};
}

// ── HABIT HELPERS ─────────────────────────────────────────────────
function computeStreak(habit,dailyLogs){
  if(!habit||!dailyLogs)return 0;
  let streak=0,d=new Date(getCurrentDate().now);
  while(streak<365){
    const ds=formatDateKey(d);
    const log=dailyLogs[ds];
    const done=(log?.habitsCompleted||[]).includes(habit.id);
    if(!done)break;
    streak++;d.setDate(d.getDate()-1);
  }
  return streak;
}
function habitDueToday(habit,dailyLogs){
  if(habit.frequencyType==='daily')return true;
  const {now}=getCurrentDate();
  if(habit.frequencyType==='weekly'){
    const wk=weekKey(now);
    const daysThisWeek=Object.keys(dailyLogs||{}).filter(d=>weekKey(new Date(d+'T12:00:00'))===wk);
    return!daysThisWeek.some(d=>(dailyLogs[d]?.habitsCompleted||[]).includes(habit.id));
  }
  if(habit.frequencyType==='x_per_week'){
    const wk=weekKey(now);
    const doneThisWeek=Object.keys(dailyLogs||{}).filter(d=>weekKey(new Date(d+'T12:00:00'))===wk&&(dailyLogs[d]?.habitsCompleted||[]).includes(habit.id)).length;
    return doneThisWeek<(habit.targetPerWeek||1);
  }
  return true;
}

// ── QUARTERLY / ANNUAL REVIEW ─────────────────────────────────────
function getReviewType(){
  const d=new Date(getCurrentDate().now);
  const dow=d.getDay();
  if(dow!==0)return null; // only on Sundays
  const month=d.getMonth(),date=d.getDate();
  if(month===0&&date<=7)return'annual';
  if([0,3,6,9].includes(month)&&date<=7)return'quarterly';
  return null;
}

let googleScriptPromise=null;
function loadGoogleScript(){
  if(typeof google!=='undefined')return Promise.resolve(true);
  if(!navigator.onLine)return Promise.reject(new Error('Offline'));
  if(googleScriptPromise)return googleScriptPromise;
  googleScriptPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-google-gsi="true"]');
    if(existing){
      existing.addEventListener('load',()=>resolve(true),{once:true});
      existing.addEventListener('error',()=>{
        googleScriptPromise=null;
        reject(new Error('Google script failed to load'));
      },{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';
    script.async=true;
    script.defer=true;
    script.dataset.googleGsi='true';
    script.onload=()=>resolve(true);
    script.onerror=()=>{
      googleScriptPromise=null;
      reject(new Error('Google script failed to load'));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

const GoogleAPI={
  _token:null,_expiry:0,_client:null,_clientId:null,
  init(clientId){
    if(!clientId)return Promise.resolve(false);
    this._clientId=clientId;
    const setupClient=()=>{
      if(typeof google==='undefined')return false;
      this._client=google.accounts.oauth2.initTokenClient({
        client_id:clientId,
        scope:'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
        callback:(resp)=>{
          if(resp.access_token){
            this._token=resp.access_token;
            this._expiry=Date.now()+(resp.expires_in-60)*1000;
            sessionStorage.setItem('goog_token',resp.access_token);
            sessionStorage.setItem('goog_token_exp',String(this._expiry));
          }
        }
      });
      const t=sessionStorage.getItem('goog_token'),exp=parseInt(sessionStorage.getItem('goog_token_exp')||'0');
      if(t&&Date.now()<exp){this._token=t;this._expiry=exp;}
      return true;
    };
    if(setupClient())return Promise.resolve(true);
    return loadGoogleScript().then(()=>setupClient());
  },
  isConnected(){return!!this._token&&Date.now()<this._expiry;},
  signIn(onSuccess,onError){
    if(!this._client){onError?.('No client initialized — check Client ID in Settings');return;}
    this._client.callback=(resp)=>{
      if(resp.error){onError?.(resp.error);return;}
      this._token=resp.access_token;
      this._expiry=Date.now()+(resp.expires_in-60)*1000;
      sessionStorage.setItem('goog_token',this._token);
      sessionStorage.setItem('goog_token_exp',String(this._expiry));
      onSuccess?.(resp);
    };
    this._client.requestAccessToken({prompt:'consent'});
  },
  signOut(){
    if(this._token&&typeof google!=='undefined')google.accounts.oauth2.revoke(this._token,()=>{});
    this._token=null;this._expiry=0;
    sessionStorage.removeItem('goog_token');sessionStorage.removeItem('goog_token_exp');
  },
  async _fetch(url,opts={}){
    if(!this.isConnected())throw new Error('Not authenticated');
    const r=await fetch(url,{...opts,headers:{'Authorization':`Bearer ${this._token}`,'Content-Type':'application/json',...(opts.headers||{})}});
    if(r.status===401){this._token=null;throw new Error('Token expired');}
    if(r.status===204)return{};
    return r.json();
  },
  p0B_fri: {
    name: "HYROX station circuit",
    purpose:
      "Back-to-back station exposure — get comfortable with the movements.",
    dur: "50–60 min",
    intensity: "Moderate",
    ex: [
      {
        n: "Wall ball (9kg)",
        s: 4,
        r: "20",
        note: "Break into smaller sets if needed",
      },
      { n: "Farmers carry", s: 4, r: "40m", note: "" },
      { n: "Sandbag lunges", s: 3, r: "20m", note: "Stay upright, chest up" },
      { n: "Row 250m", s: 4, r: "250m", note: "2 min rest between efforts" },
      {
        n: "Burpee broad jumps",
        s: 3,
        r: "6",
        note: "Explode forward on the jump",
      },
      {
        n: "Copenhagen plank",
        s: 3,
        r: "20s ea",
        note: "Hip adductor strength",
      },
    ],
  },
  p0B_sat: {
    name: "Long run + station finish",
    type: "run",
    purpose: "Extend aerobic base and introduce station work after running.",
    dur: "60–70 min",
    intensity: "Easy–Moderate",
    rd: {
      label: "Long run + stations",
      dist: "4–5 mi",
      effort:
        "Easy run, then finish with 2×40m farmers carry — legs should already feel it",
    },
  },
  /* ── PHASE 1 · BUILD (weeks 9–16) ── */
  p1A_mon: {
    name: "Full body strength — build",
    purpose: "Increase push and pull volume to support station performance.",
    dur: "50–60 min",
    intensity: "Moderate–Hard",
    ex: [
      {
        n: "Barbell bench press",
        s: 4,
        r: "8",
        note: "Controlled tempo, full range",
      },
      {
        n: "Weighted pull-up or lat pulldown",
        s: 4,
        r: "8",
        note: "Full extension at bottom",
      },
      { n: "Dumbbell shoulder press", s: 3, r: "10", note: "" },
      {
        n: "Single-arm dumbbell row",
        s: 3,
        r: "12ea",
        note: "Brace against bench",
      },
      {
        n: "Farmers carry",
        s: 3,
        r: "50m",
        note: "Shoulders packed, walk tall",
      },
      {
        n: "Hollow body hold",
        s: 3,
        r: "30s",
        note: "Lower back stays pressed down",
      },
    ],
  },
  p1A_wed: {
    name: "Aerobic run — extended",
    type: "run",
    purpose: "Build aerobic capacity through consistent moderate volume.",
    dur: "40–50 min",
    intensity: "Easy",
    rd: {
      label: "Easy run",
      dist: "3–4.5 mi",
      effort: "Conversational throughout — no pace pressure, just time on feet",
    },
  },
  p1A_fri: {
    name: "Full body functional",
    purpose: "Compound movements and loaded carries to build work capacity.",
    dur: "55–65 min",
    intensity: "Moderate–Hard",
    ex: [
      {
        n: "Trap bar deadlift",
        s: 4,
        r: "6",
        note: "Hip drive — pull the floor away",
      },
      {
        n: "Kettlebell swings",
        s: 4,
        r: "15",
        note: "Power from hips, not arms",
      },
      {
        n: "Farmers carry",
        s: 4,
        r: "50m",
        note: "Heavy — full posture throughout",
      },
      { n: "Wall ball (9kg)", s: 4, r: "20", note: "Unbroken if possible" },
      {
        n: "SkiErg 500m",
        s: 3,
        r: "500m",
        note: "Controlled effort, build to 80%",
      },
      { n: "Dead bug", s: 3, r: "10ea", note: "Exhale fully at top" },
    ],
  },
  p1A_sat: {
    name: "Long run",
    type: "run",
    purpose: "Build aerobic durability — the event is endurance-first.",
    dur: "60–70 min",
    intensity: "Easy",
    rd: {
      label: "Long run",
      dist: "4.5–5.5 mi",
      effort: "Keep it slow — the duration is the stimulus, not the pace",
    },
  },
  p1B_mon: {
    name: "Lower body strength — build",
    purpose:
      "Build single-leg power and posterior chain for sled and sandbag work.",
    dur: "55–65 min",
    intensity: "Moderate–Hard",
    ex: [
      { n: "Barbell back squat", s: 4, r: "6", note: "Pause 1s at bottom" },
      {
        n: "Romanian deadlift",
        s: 4,
        r: "8",
        note: "Load the hamstrings fully",
      },
      {
        n: "Sandbag lunges",
        s: 4,
        r: "20m",
        note: "Chest up, short controlled steps",
      },
      { n: "Hip thrust", s: 3, r: "12", note: "Squeeze hard at top" },
      {
        n: "Copenhagen plank",
        s: 3,
        r: "25s ea",
        note: "Hip in line with body",
      },
      { n: "Single-leg RDL", s: 3, r: "10ea", note: "Control the descent" },
    ],
  },
  p1B_wed: {
    name: "Interval run",
    type: "run",
    purpose:
      "Develop speed and VO2 capacity — HYROX demands repeated hard efforts.",
    dur: "40–50 min",
    intensity: "Hard",
    rd: {
      label: "Intervals",
      dist: "5×0.5 mi",
      effort:
        "85–90% effort per rep — 2 min easy jog recovery between each. Warm-up 10 min easy first.",
    },
  },
  p1B_fri: {
    name: "HYROX build circuit",
    purpose:
      "Begin combining run efforts with station work — train the actual race demand.",
    dur: "60–70 min",
    intensity: "Moderate–Hard",
    ex: [
      {
        n: "1km run at moderate effort",
        s: 3,
        r: "1km",
        note: "Go straight into next station",
      },
      {
        n: "Wall ball (9kg)",
        s: 3,
        r: "25",
        note: "Unbroken target — rest before rather than during",
      },
      {
        n: "Farmers carry",
        s: 3,
        r: "50m",
        note: "Heavy — shoulders back, no stopping",
      },
      {
        n: "Row 500m",
        s: 3,
        r: "500m",
        note: "Strong pace — not a rest effort",
      },
      {
        n: "Burpee broad jumps",
        s: 3,
        r: "8",
        note: "Land soft, drive forward",
      },
      {
        n: "Sandbag lunges",
        s: 3,
        r: "20m",
        note: "After the last run rep — finish strong",
      },
    ],
  },
  p1B_sat: {
    name: "Tempo run",
    type: "run",
    purpose: "Build lactate threshold — the pace that matters most in HYROX.",
    dur: "50–60 min",
    intensity: "Moderate",
    rd: {
      label: "Tempo run",
      dist: "4–5 mi",
      effort:
        "10 min easy warm-up · 20–25 min at comfortably hard pace (can speak a few words only) · 10 min easy cool-down",
    },
  },
};

const T={section:16,card:15,body:12,meta:11,micro:10,hero:24};
const G={xs:4,sm:8,md:12,lg:16,xl:24};

const S={
  wrap:{background:C.bg,minHeight:'100vh',maxWidth:430,margin:'0 auto',paddingBottom:64,paddingTop:'env(safe-area-inset-top)',position:'relative'},
  hdr:{padding:`calc(14px + env(safe-area-inset-top)) ${G.lg}px 10px`,borderBottom:`1px solid ${C.bd}`,display:'flex',justifyContent:'space-between',alignItems:'center',position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,zIndex:250,background:C.headerBg,backdropFilter:'blur(18px)'},
  body:{padding:`${G.md}px ${G.lg}px ${G.xs}px`},
  card:{background:C.card,border:`1px solid ${C.bd}`,borderRadius:16,padding:G.lg,marginBottom:G.md,boxShadow:C.shadow},
  lbl:{fontSize:T.micro,fontWeight:700,letterSpacing:'0.8px',color:C.muted,textTransform:'uppercase',marginBottom:G.xs,display:'block',lineHeight:1.2},
  sectionTitle:{fontSize:T.section,fontWeight:700,color:C.tx,lineHeight:1.2},
  cardTitle:{fontSize:T.card,fontWeight:700,color:C.tx,lineHeight:1.25},
  support:{fontSize:T.body,color:C.tx2,lineHeight:1.45},
  bodyText:{fontSize:T.body,color:C.tx,lineHeight:1.45},
  metaText:{fontSize:T.meta,color:C.muted,lineHeight:1.35},
  micro:{fontSize:T.micro,color:C.muted,lineHeight:1.35},
  pill:(bg,clr)=>({display:'inline-flex',alignItems:'center',background:bg,color:clr,borderRadius:999,padding:'4px 10px',fontSize:T.micro,fontWeight:700,marginRight:G.xs,marginBottom:3}),
  btnSolid:()=>({background:C.navy,color:C.white,border:'1px solid transparent',borderRadius:12,padding:'12px 14px',fontWeight:600,fontSize:T.body,width:'100%',cursor:'pointer',textAlign:'center',lineHeight:1.2,display:'inline-flex',alignItems:'center',justifyContent:'center',boxShadow:C.shadowStrong}),
  btnGhost:{background:C.surf,border:`1px solid ${C.bd}`,color:C.tx,borderRadius:12,padding:'9px 14px',cursor:'pointer',fontSize:T.body,lineHeight:1.2,display:'inline-flex',alignItems:'center',justifyContent:'center'},
  btnSmall:()=>({background:C.navy,color:C.white,border:'1px solid transparent',borderRadius:12,padding:'8px 12px',fontWeight:600,fontSize:T.body,cursor:'pointer',lineHeight:1.2,display:'inline-flex',alignItems:'center',justifyContent:'center'}),
  inp:{background:C.surf,border:`1px solid ${C.bd}`,borderRadius:12,padding:'10px 11px',color:C.tx,fontSize:T.body,lineHeight:1.25,width:'100%',boxSizing:'border-box'},
  nav:{display:'flex',justifyContent:'space-around',alignItems:'center',padding:'6px 8px calc(env(safe-area-inset-bottom) + 6px)',borderTop:`1px solid ${C.bd}`,background:C.navBg,position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,height:64,backdropFilter:'blur(16px)',boxShadow:C.shadowNav,zIndex:260},
  navBtn:(a,f)=>({background:a?C.navy:'transparent',border:f?`2px solid ${C.navy}`:'2px solid transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flex:1,height:48,borderRadius:14,WebkitTapHighlightColor:'transparent',outline:'none',opacity:1,color:a?C.white:C.muted,boxShadow:f?`0 0 0 3px ${C.focusRing}`:'none',transition:'background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease'}),
  row:{display:'flex',alignItems:'center',justifyContent:'space-between'},
  sep:{height:'1px',background:C.bd,margin:`${G.md}px 0`},
  tag:(clr,bg)=>({display:'inline-block',background:bg,color:clr,borderRadius:8,padding:'3px 8px',fontSize:T.micro,fontWeight:600}),
};

function ProgressBar({value,max,color=C.sage}){
  const pct=max>0?Math.min(100,(value/max)*100):0;
  return <div style={{background:C.surf,borderRadius:99,height:6,overflow:'hidden'}}>
    <div style={{width:`${pct}%`,background:color,height:'100%',borderRadius:99,transition:'width 0.35s ease'}}/>
  </div>;
}
function TrafficLight({pct}){
  const clr=pct>=90?C.sage:pct>=60?C.amber:C.red;
  return <div style={{width:10,height:10,borderRadius:'50%',background:clr,display:'inline-block'}}/>;
}
function CollapsibleCard({title,summary,open,onToggle,accent,children,cardStyle={}}){
  return <div style={{background:C.card,borderRadius:16,padding:'14px 16px',border:`1px solid ${accent||C.bd}`,marginBottom:10,...cardStyle}}>
    <div onClick={onToggle} style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none',WebkitUserSelect:'none'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:C.tx,lineHeight:1.3}}>{title}</div>
        {!open&&summary&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{summary}</div>}
      </div>
      <div style={{fontSize:16,color:C.muted,flexShrink:0,marginLeft:8,fontWeight:400,lineHeight:1}}>{open?'▾':'▸'}</div>
    </div>
    {open&&<div style={{marginTop:10}}>{children}</div>}
  </div>;
}
function ConnectGoogle({onConnect}){
  return <div style={{...S.card,borderColor:C.navy,textAlign:'center'}}>
    <div style={{fontSize:13,color:C.tx,marginBottom:8,fontWeight:500}}>Connect Google to sync</div>
    <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Calendar and Tasks integration requires a Google account connection in Settings.</div>
    <button style={S.btnSmall(C.navy)} onClick={onConnect}>Go to Settings - Google</button>
  </div>;
}
function NotificationBanner({message,type='info',detail,actionLabel,onAction,onDismiss}){
  if(!message)return null;
  const bg=type==='error'?C.red:type==='success'?C.sage:C.navy;
  return <div role="status" aria-live="polite" aria-atomic="true" style={{position:'fixed',top:60,left:'50%',transform:'translateX(-50%)',width:'calc(100% - 32px)',maxWidth:398,background:bg,color:C.white,borderRadius:12,padding:'12px 16px',zIndex:999,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,fontSize:13,fontWeight:500}}>
    <div style={{minWidth:0,flex:1}}>
      <div>{message}</div>
      {detail&&<div style={{fontSize:11,opacity:0.88,marginTop:4,fontWeight:400}}>{detail}</div>}
      {actionLabel&&onAction&&<button type="button" onClick={onAction} style={{marginTop:8,background:C.whiteSoft,border:`1px solid ${C.whiteSoftBorder}`,color:C.white,fontSize:11,cursor:'pointer',padding:'5px 9px',borderRadius:8}}> {actionLabel} </button>}
    </div>
    <button type="button" onClick={onDismiss} style={{background:'none',border:'none',color:C.white,fontSize:16,cursor:'pointer',padding:0,flexShrink:0}}>x</button>
  </div>;
}
function ExerciseDemoModal({exercise,onClose}){
  if(!exercise)return null;
  const definition=resolveExerciseDefinition(exercise.exerciseId||exercise.id||exercise.n||exercise.name);
  const displayName=exercise.n||exercise.name||definition.name;
  const media=createExerciseMedia(definition.media);
  const asset=getExerciseDemoAsset(media,{includePlaceholder:false});
  const embedUrl=asset?.kind==='external_video'?toExternalEmbedUrl(asset.src):'';
  const coachingCues=(definition.coachingCues||[]).slice(0,3);
  return <div style={{position:'fixed',inset:0,background:C.scrim,zIndex:700,display:'flex',alignItems:'flex-end'}}>
    <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'20px 16px 28px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'88vh',overflowY:'auto'}}>
      <div style={{...S.row,alignItems:'flex-start',marginBottom:12}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{displayName}</div>
          <div style={{fontSize:11,color:C.muted}}>{definition.category||'Exercise demo'}</div>
        </div>
        <button style={{...S.btnGhost,fontSize:11}} onClick={onClose}>Close</button>
      </div>
      <div style={{background:C.surf,borderRadius:16,overflow:'hidden',marginBottom:12}}>
        {!asset&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:240,color:C.muted,fontSize:12,background:C.surf}}>No demo available</div>
        )}
        {asset?.kind==='local_video'&&(
          <video
            src={asset.src}
            controls
            autoPlay
            preload='none'
            playsInline
            style={{display:'block',width:'100%',height:240,objectFit:'cover',background:C.surf}}
          />
        )}
        {asset?.kind==='external_video'&&(
          <iframe
            src={embedUrl||asset.src}
            title={(exercise.n||exercise.name)+' demo'}
            loading='lazy'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowFullScreen
            style={{display:'block',width:'100%',height:240,border:'none',background:C.surf}}
          />
        )}
        {asset?.kind==='image'&&(
          <img
            src={asset.src}
            alt={displayName}
            style={{display:'block',width:'100%',height:240,objectFit:'cover',background:C.surf}}
          />
        )}
      </div>
      <div style={{marginBottom:12}}>
        {coachingCues.map(cue=><div key={cue} style={{fontSize:12,color:C.tx2,marginBottom:6}}>• {cue}</div>)}
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {media.sources.localVideo&&<span style={S.pill(C.sageL,C.sageDk)}>Local video</span>}
        {!media.sources.localVideo&&media.sources.externalVideo&&<span style={S.pill(C.navyL,C.navyDk)}>External demo</span>}
        {asset?.kind==='image'&&<span style={S.pill(C.surf,C.muted)}>Image fallback</span>}
        {!asset&&<span style={S.pill(C.surf,C.muted)}>No demo available</span>}
      </div>
    </div>
  </div>;
}

function App(){
  const [currentDate,setCurrentDate]=useState(()=>getCurrentDate());
  const {now:NOW,today:TODAY,dow:DOW}=currentDate;
  const initialNavigationState=getInitialNavigationState(TODAY);
  const [tab,setTab]=useState(initialNavigationState.tab);
  const [profile,setProfile]=useState(DEFAULT_OPS);
  const [loaded,setLoaded]=useState(false);
  const [deferredInstallPrompt,setDeferredInstallPrompt]=useState(null);
  const [installAvailable,setInstallAvailable]=useState(false);
  const [isInstalled,setIsInstalled]=useState(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true);
  const [wkSess,setWkSess]=useState(null);
  const [runSess,setRunSess]=useState(null);
  const [recSess,setRecSess]=useState(null);
  const [trainView,setTrainView]=useState('overview');
  const [recIdx,setRecIdx]=useState(0);
  const [recTmr,setRecTmr]=useState(0);
  const [recOn,setRecOn]=useState(false);
  const [recSecond,setRecSecond]=useState(false);
  const [restTmr,setRestTmr]=useState(null);
  const [restLabel,setRestLabel]=useState('');
  const [showSwap,setShowSwap]=useState(null);
  const [playerIdx,setPlayerIdx]=useState(0);
  const [trainSection,setTrainSection]=useState(initialNavigationState.trainSection);
  const [showManual,setShowManual]=useState(false);
  const [mealShortcut,setMealShortcut]=useState(null);
  const [demoExercise,setDemoExercise]=useState(null);
  const [calendarFocusDay,setCalendarFocusDay]=useState(initialNavigationState.calendarFocusDay);
  const [calendarViewMode,setCalendarViewMode]=useState(initialNavigationState.calendarViewMode);
  const [calendarWeekIndex,setCalendarWeekIndex]=useState(initialNavigationState.calendarWeekIndex);
  const [calendarMonthIndex,setCalendarMonthIndex]=useState(initialNavigationState.calendarMonthIndex);
  const [showMVD,setShowMVD]=useState(false);
  const [calOffset,setCalOffset]=useState(0);
  const [calModal,setCalModal]=useState(null);
  const [calForm,setCalForm]=useState({title:'',hour:9,dur:60,allDay:false});
  const [busyModal,setBusyModal]=useState(null);
  const [busyForm,setBusyForm]=useState(()=>({title:'',date:TODAY,startTime:'09:00',endTime:'10:00',category:'meeting',recurring:false,dow:null,notes:''}));
  const [patternName,setPatternName]=useState('');
  const [finView,setFinView]=useState(initialNavigationState.finView);
  const [finCatFilter,setFinCatFilter]=useState(null);
  const [finSearch,setFinSearch]=useState('');
  const [showAddTx,setShowAddTx]=useState(false);
  const [txForm,setTxForm]=useState(()=>({date:TODAY,merchant:'',amount:'',isCredit:false,isRecurring:false,isTransfer:false,accountId:'',category:'other',notes:''}));
  const [showAccountModal,setShowAccountModal]=useState(false);
  const [editingAccountId,setEditingAccountId]=useState(null);
  const [accountForm,setAccountForm]=useState({name:'',institution:'',type:'checking',isActive:true,startingBalance:''});
  const [showImport,setShowImport]=useState(false);
  const [showCapture,setShowCapture]=useState(false);
  const [captureText,setCaptureText]=useState('');
  const [showWeeklyPlanner,setShowWeeklyPlanner]=useState(false);
  const [showEnergyIn,setShowEnergyIn]=useState(false);
  const [showMorningCheckin,setShowMorningCheckin]=useState(false);
  const [showHabitsModal,setShowHabitsModal]=useState(false);
  const [habitDraftCompletions,setHabitDraftCompletions]=useState({});
  const [showPlannedWorkoutLibrary,setShowPlannedWorkoutLibrary]=useState(false);
  const [showProgramPicker,setShowProgramPicker]=useState(false);
  const [energyScore,setEnergyScore]=useState(5);
  const [sleepHours,setSleepHours]=useState(7.5);
  const [checkInMood,setCheckInMood]=useState(null);
  const [checkInEnergy,setCheckInEnergy]=useState(3);
  const [checkInStress,setCheckInStress]=useState(2);
  const [checkInNote,setCheckInNote]=useState('');
  const [checkInSleep,setCheckInSleep]=useState(7);
  const [showCheckInNote,setShowCheckInNote]=useState(false);
  const [dismissedMorningCheckinDate,setDismissedMorningCheckinDate]=useState(null);
  const [showWorkoutPlayer,setShowWorkoutPlayer]=useState(false);
  const [tier2Open,setTier2Open]=useState({energy:true,finance:false,habits:false});
  const [homeCardsOpen,setHomeCardsOpen]=useState({habits:false,alerts:false,weekly:false});
  const [showInsights,setShowInsights]=useState(false);
  const [showReview,setShowReview]=useState(false);
  const [growthState,setGrowthState]=useState(()=>getDefaultGrowthState());
  const [expandedTasks,setExpandedTasks]=useState({});
  const [showAddTask,setShowAddTask]=useState(false);
  const [newTask,setNewTask]=useState(()=>createNewTaskDraft(TODAY));
  const [taskDraftText,setTaskDraftText]=useState('');
  const [taskScreenTab,setTaskScreenTab]=useState(initialNavigationState.taskScreenTab);
  const [settingsSection,setSettingsSection]=useState(initialNavigationState.settingsSection);
  const [healthScreenTab,setHealthScreenTab]=useState(initialNavigationState.healthTab);
  const [lifestyleScreenTab,setLifestyleScreenTab]=useState(initialNavigationState.lifestyleTab);
  const [lifestyleOpen,setLifestyleOpen]=useState({daily:false,weekly:false});
  const [navFocusId,setNavFocusId]=useState(null);
  const [notif,setNotif]=useState(null);
  const [notifType,setNotifType]=useState('info');
  const [notifDetail,setNotifDetail]=useState('');
  const [notifAction,setNotifAction]=useState(null);
  const [focusTaskId,setFocusTaskId]=useState(null);
  const [focusTmrSec,setFocusTmrSec]=useState(null);
  const [focusTmrRunning,setFocusTmrRunning]=useState(false);
  const [googleConnected,setGoogleConnected]=useState(false);
  const [showFlow,setShowFlow]=useState(false);
  const [flowDayType,setFlowDayType]=useState(()=>{
    try{const v=localStorage.getItem('flow_day_type_'+new Date().toISOString().slice(0,10));return v||null;}catch{return null;}
  });
  const handleFlowDayType=useCallback(type=>{
    setFlowDayType(type);
    try{localStorage.setItem('flow_day_type_'+new Date().toISOString().slice(0,10),type);}catch{}
  },[]);
  const contentRef=useRef(null);
  const restRef=useRef(null),recRef=useRef(null),saveRef=useRef(null);
  const latestProfileRef=useRef(DEFAULT_OPS);
  const growthStateRef=useRef(getDefaultGrowthState());
  const appOpenTrackedRef=useRef(false);
  const growthImpressionRef=useRef({});
  const prevTodayRef=useRef(TODAY);
  const {athleteProfile,accounts,categories,meals,exercises,workouts,pantryInventory,foodLibrary,recipes,quickMealTemplates,mealTemplates,dailyMealPlans,tasks,taskTemplates,choreHistory,lifestyleItems,maintenanceHistory,maintenanceMeta,calendarCache,busyBlocks,weekPatterns,transactions,merchantRules,recurringExpenses,financeSettings,dailyLogs,habits,captureNotes,inboxItems,securitySettings,top3,hydr,hydGoal,proGoal,calGoal,healthRecords,lastMaintenancePromptDate}=profile;
  const financialAccounts=accounts;
  const nutr=meals;
  const workoutHistory=workouts;
  const taskHistory=tasks;

  const updateProfile=useCallback(patch=>setProfile(prev=>syncCanonicalProfileState(typeof patch==='function'?patch(prev):{...prev,...patch})),[]);
  const updateGrowthState=useCallback(updater=>{
    setGrowthState(prev=>normalizeGrowthState(typeof updater==='function'?updater(prev):updater));
  },[]);
  const trackGrowthEvent=useCallback((type,meta={})=>{
    if(profile.securitySettings?.analyticsEnabled===false)return;
    const nowIso=new Date().toISOString();
    updateGrowthState(prev=>{
      const next=normalizeGrowthState(prev);
      const events=[...next.events,{id:`growth-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,type,meta,at:nowIso}].slice(-MAX_GROWTH_EVENTS);
      const activationChecklist={...next.activationChecklist};
      if(type==='checkin_completed')activationChecklist.checkInCompleted=true;
      if(type==='first_priority_added')activationChecklist.prioritiesSet=true;
      if(['execution_started','meal_planned','meal_logged','workout_started','workout_completed','task_completed'].includes(type))activationChecklist.actionCompleted=true;
      const hasSetupSignal=activationChecklist.checkInCompleted||activationChecklist.prioritiesSet;
      const hasActionSignal=activationChecklist.actionCompleted;
      const setupCardCompleted=activationChecklist.checkInCompleted&&activationChecklist.prioritiesSet&&activationChecklist.actionCompleted;
      return{
        ...next,
        lastSeenAt:nowIso,
        setupCardCompleted:next.setupCardCompleted||setupCardCompleted,
        activationChecklist,
        firstOpenedAt:next.firstOpenedAt||nowIso,
        firstValueAt:next.firstValueAt||(hasSetupSignal&&hasActionSignal?nowIso:null),
        events,
      };
    });
  },[profile.securitySettings?.analyticsEnabled,updateGrowthState]);
  const openCommandBar=()=>{
    setCaptureText('');
    setShowCapture(true);
  };
  const openBrainDump=()=>{
    setShowBrainDumpModal(true);
  };
  function saveBrainDumpEntry(text){
    const createdAt=new Date().toISOString();
    updateProfile(p=>({
      ...p,
      brainDump:[
        ...(p.brainDump||[]),
        {
          id:`brain-${Date.now()}`,
          text,
          createdAt,
          processed:false,
        },
      ],
    }));
    showNotif('Captured','success');
  }
  const openTab=useCallback((nextTab,options={})=>{
    if(!APP_TAB_IDS.includes(nextTab))return;
    if(options.taskTab&&TASK_TAB_IDS.includes(options.taskTab))setTaskScreenTab(options.taskTab);
    if(options.finView&&FINANCE_VIEW_IDS.includes(options.finView))setFinView(options.finView);
    if(options.trainSection&&TRAIN_SECTION_IDS.includes(options.trainSection))setTrainSection(options.trainSection);
    if(options.settingsSection!==undefined)setSettingsSection(SETTINGS_SECTION_IDS.includes(options.settingsSection)?options.settingsSection:null);
    if(options.healthTab&&HEALTH_TAB_IDS.includes(options.healthTab))setHealthScreenTab(options.healthTab);
    if(options.lifestyleTab&&LIFESTYLE_TAB_IDS.includes(options.lifestyleTab))setLifestyleScreenTab(options.lifestyleTab);
    if(options.calendarFocusDay)setCalendarFocusDay(normalizeDateKey(options.calendarFocusDay,TODAY));
    if(options.calendarViewMode)setCalendarViewMode(options.calendarViewMode==='month'?'month':'week');
    if(Number.isFinite(options.calendarWeekIndex))setCalendarWeekIndex(options.calendarWeekIndex);
    if(Number.isFinite(options.calendarMonthIndex))setCalendarMonthIndex(options.calendarMonthIndex);
    setTab(nextTab);
  },[TODAY]);
  const clearNotif=()=>{
    setNotif(null);
    setNotifType('info');
    setNotifDetail('');
    setNotifAction(null);
  };
  const showNotif=(msg,type='info',detail='',action=null)=>{
    setNotif(msg);
    setNotifType(type);
    setNotifDetail(detail||'');
    setNotifAction(action||null);
    setTimeout(()=>clearNotif(),3500);
  };
  const applyUndoableProfileUpdate=(label,updater,detail='')=>{
    const snapshot=latestProfileRef.current;
    setProfile(prev=>syncCanonicalProfileState(updater(prev)));
    showNotif(label,'success',detail||'',{label:'Undo',handler:()=>{setProfile(syncCanonicalProfileState(snapshot));showNotif('Undid last action','success');}});
  };
  const installEngaged=growthState.activationChecklist.checkInCompleted
    ||growthState.activationChecklist.prioritiesSet
    ||growthState.events.some(event=>['meal_planned','meal_logged','workout_started'].includes(event.type));
  const installDismissCooldownMs=(growthState.installPromptShownCount||0)>=2?14*86400000:3*86400000;
  const installCooldownActive=!!(growthState.installPromptDismissedAt&&Date.now()-new Date(growthState.installPromptDismissedAt).getTime()<installDismissCooldownMs);
  const shouldShowInstallCta=installAvailable&&!isInstalled&&installEngaged&&!installCooldownActive;
  const needsInstallHelp=!installAvailable&&!isInstalled&&installEngaged;
  const showActivationChecklist=loaded&&!growthState.setupCardCompleted&&!growthState.onboardingDismissed;
  const installHelpText=isIosLikeInstallContext()
    ?'Use Share > Add to Home Screen in Safari to install this app.'
    :'Install becomes available in supported browsers after the app is served from HTTPS or localhost.';

  useEffect(()=>{
    const syncCurrentDate=()=>setCurrentDate(getCurrentDate());
    const timeoutId=setTimeout(syncCurrentDate,getMsUntilNextDay(NOW));
    const onVisibilityChange=()=>{
      if(document.visibilityState==='visible')syncCurrentDate();
    };
    window.addEventListener('focus',syncCurrentDate);
    document.addEventListener('visibilitychange',onVisibilityChange);
    return()=>{
      clearTimeout(timeoutId);
      window.removeEventListener('focus',syncCurrentDate);
      document.removeEventListener('visibilitychange',onVisibilityChange);
    };
  },[TODAY,NOW]);

  useEffect(()=>{
    const prevToday=prevTodayRef.current;
    if(prevToday===TODAY)return;
    setCalendarFocusDay(day=>day===prevToday?TODAY:day===addDaysIso(prevToday,1)?addDaysIso(TODAY,1):day);
    setBusyForm(form=>form.date===prevToday?{...form,date:TODAY}:form);
    setTxForm(form=>form.date===prevToday?{...form,date:TODAY}:form);
    setNewTask(task=>task.date===prevToday?{...task,date:TODAY}:task);
    prevTodayRef.current=TODAY;
  },[TODAY]);

  useEffect(()=>{
    if(!loaded)return;
    writeNavigationState({
      tab,
      calendarFocusDay,
      calendarViewMode,
      calendarWeekIndex,
      calendarMonthIndex,
      taskScreenTab,
      finView,
      trainSection,
      settingsSection,
      healthTab:healthScreenTab,
      lifestyleTab:lifestyleScreenTab,
    },TODAY);
  },[loaded,tab,calendarFocusDay,calendarViewMode,calendarWeekIndex,calendarMonthIndex,taskScreenTab,finView,trainSection,settingsSection,healthScreenTab,lifestyleScreenTab,TODAY]);

  useEffect(()=>{
    (async()=>{
      try{
        await migrateLegacyLocalStorage();
        const [storedProfile,storedNav,storedCheckins,storedActiveWorkout,storedGrowth]=await Promise.all([
          storage.getJSON(STORAGE_KEYS.profile),
          storage.getJSON(STORAGE_KEYS.navigation),
          storage.getJSON(STORAGE_KEYS.dailyCheckin),
          storage.getJSON(STORAGE_KEYS.activeWorkout),
          storage.getJSON(STORAGE_KEYS.growth),
        ]);
        if(storedNav){
          navigationStateCache=normalizeNavigationState(storedNav,TODAY);
          setTab(navigationStateCache.tab);
          setCalendarFocusDay(navigationStateCache.calendarFocusDay);
          setCalendarViewMode(navigationStateCache.calendarViewMode);
          setCalendarWeekIndex(navigationStateCache.calendarWeekIndex);
          setCalendarMonthIndex(navigationStateCache.calendarMonthIndex);
          setTaskScreenTab(navigationStateCache.taskScreenTab);
          setFinView(navigationStateCache.finView);
          setTrainSection(navigationStateCache.trainSection);
          setSettingsSection(navigationStateCache.settingsSection);
          setHealthScreenTab(navigationStateCache.healthTab);
          setLifestyleScreenTab(navigationStateCache.lifestyleTab);
        }
        dailyCheckinStoreCache=storedCheckins&&typeof storedCheckins==='object'&&!Array.isArray(storedCheckins)
          ?Object.entries(storedCheckins).reduce((acc,[key,value])=>{
            const normalizedKey=normalizeDateKey(key,null);
            if(normalizedKey)acc[normalizedKey]=value;
            return acc;
          },{})
          :{};
        activeWorkoutStateCache=storedActiveWorkout&&typeof storedActiveWorkout==='object'?storedActiveWorkout:null;
        const nextGrowthState=normalizeGrowthState(storedGrowth||{});
        growthStateCache=nextGrowthState;
        setGrowthState(nextGrowthState);
        if(storedProfile){
          const normalizedProfile=normalizeLoadedProfile(storedProfile);
          migrateDailyCheckinStore(normalizedProfile);
          setProfile(normalizedProfile);
        }
        const t=sessionStorage.getItem('goog_token'),exp=parseInt(sessionStorage.getItem('goog_token_exp')||'0');
        if(t&&Date.now()<exp)setGoogleConnected(true);
      }catch(e){
        console.error('Profile boot failed:',e);
      }finally{
        setLoaded(true);
        document.getElementById('loading')?.remove();
      }
    })();
  },[]);

  function LifestyleScreen({
    activeTab = "habits",
    onTabChange = () => {},
    lifestyleOpen = { daily: false, weekly: false },
    setLifestyleOpen = () => {},
  }) {
    const homeTab = LIFESTYLE_TAB_IDS.includes(activeTab)
      ? activeTab
      : "habits";
    const choreKey = TODAY;
    const wkChoreKey = weekKey(NOW);
    const todayChores = choreHistory[choreKey] || {};
    const weekChores = choreHistory[wkChoreKey] || {};

    function toggleDailyChore(id) {
      updateProfile((p) => ({
        ...p,
        choreHistory: {
          ...p.choreHistory,
          [choreKey]: {
            ...(p.choreHistory[choreKey] || {}),
            [id]: !(p.choreHistory[choreKey] || {})[id],
          },
        },
      }));
    }
    function toggleWeeklyChore(id) {
      updateProfile((p) => ({
        ...p,
        choreHistory: {
          ...p.choreHistory,
          [wkChoreKey]: {
            ...(p.choreHistory[wkChoreKey] || {}),
            [id]: !(p.choreHistory[wkChoreKey] || {})[id],
          },
        },
      }));
    }
    function markMaintenance(id) {
      updateProfile((p) => ({
        ...p,
        maintenanceHistory: { ...p.maintenanceHistory, [id]: TODAY },
      }));
    }
    function addLifestyleItem() {
      const title = prompt("Item name?");
      if (!title) return;
      const notes = prompt("Notes (optional)", "") || "";
      const id = "ls_" + Date.now();
      const maxOrder = (lifestyleItems || []).reduce(
        (m, x) => Math.max(m, x.order || 0),
        0,
      );
      updateProfile((p) => ({
        ...p,
        lifestyleItems: [
          ...(p.lifestyleItems || []),
          { id, title, notes, order: maxOrder + 1, archived: false },
        ],
      }));
    }
    function editLifestyleItem(item) {
      const title = prompt("Item name?", item.title);
      if (!title) return;
      const notes = prompt("Notes (optional)", item.notes || "") || "";
      updateProfile((p) => ({
        ...p,
        lifestyleItems: (p.lifestyleItems || []).map((x) =>
          x.id === item.id ? { ...x, title, notes } : x,
        ),
      }));
    }
    function deleteLifestyleItem(id) {
      updateProfile((p) => ({
        ...p,
        lifestyleItems: (p.lifestyleItems || []).filter((x) => x.id !== id),
      }));
    }

    const activeItems = (lifestyleItems || [])
      .filter((i) => !i.archived)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const dailyDone = activeItems.filter((i) => !!todayChores[i.id]).length;
    const weekDone = WEEKLY_CHORES.filter((c) => weekChores[c.id]).length;

    return (
      <div style={S.body}>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            overflowX: "auto",
          }}
        >
          {[
            { id: "habits", label: "Habits" },
            { id: "lifestyle", label: "Lifestyle" },
            { id: "routine", label: "Routine" },
          ].map((t) => (
            <button
              key={t.id}
              style={{
                flexShrink: 0,
                padding: "7px 12px",
                borderRadius: 10,
                border: `0.5px solid ${homeTab === t.id ? C.sage : C.bd}`,
                background: homeTab === t.id ? C.sageL : "transparent",
                color: homeTab === t.id ? C.sageDk : C.muted,
                fontSize: 11,
                fontWeight: homeTab === t.id ? 600 : 400,
                cursor: "pointer",
              }}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {homeTab === "habits" && (
          <div>
            <div style={{ ...S.row, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
                Repeat behaviors
              </span>
              <button
                style={S.btnSmall(C.sage)}
                onClick={() => {
                  const name = prompt("Habit name?");
                  if (!name) return;
                  const freq =
                    prompt("Frequency: daily / weekly / x_per_week", "daily") ||
                    "daily";
                  const target =
                    freq === "x_per_week"
                      ? parseInt(prompt("Times per week?", "3") || "3")
                      : 1;
                  addHabit({
                    name,
                    frequencyType: freq,
                    targetPerWeek: target,
                  });
                }}
              >
                + Habit
              </button>
            </div>
            {(habits || []).length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 0",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                No habits yet. Tap + Habit to add one.
              </div>
            )}
            {(habits || []).map((h) => {
              const done = (dailyLogs?.[TODAY]?.habitsCompleted || []).includes(
                h.id,
              );
              const streak = computeStreak(h, dailyLogs);
              const due = habitDueToday(h, dailyLogs);
              const wkDone = Object.keys(dailyLogs || {}).filter(
                (d) =>
                  weekKey(new Date(d + "T12:00:00")) === weekKey(NOW) &&
                  (dailyLogs[d]?.habitsCompleted || []).includes(h.id),
              ).length;
              return (
                <div
                  key={h.id}
                  style={{
                    ...S.card,
                    borderLeft: `3px solid ${done ? C.sage : due ? C.amber : C.bd}`,
                  }}
                >
                  <div style={S.row}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: C.tx,
                          marginBottom: 2,
                        }}
                      >
                        {h.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>
                        {h.frequencyType === "daily"
                          ? "Daily"
                          : h.frequencyType === "weekly"
                            ? "Weekly"
                            : `${wkDone}/${h.targetPerWeek || 1}x this week`}
                        {streak > 0 ? ` · ${streak}d streak` : ""}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      {due && (
                        <button
                          onClick={() => completeHabit(h.id)}
                          style={{ ...S.btnSmall(done ? C.muted : C.sage) }}
                        >
                          {done ? "Done" : "Mark done"}
                        </button>
                      )}
                      <button
                        onClick={() => openEditHabit(h)}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.muted,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteHabit(h.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.muted,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {homeTab === "lifestyle" && (
          <div>
            <CollapsibleCard
              title="Daily Lifestyle"
              summary={`${dailyDone}/${activeItems.length} done today`}
              open={lifestyleOpen.daily}
              onToggle={() =>
                setLifestyleOpen((s) => ({ ...s, daily: !s.daily }))
              }
            >
              <div style={{ ...S.row, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {dailyDone}/{activeItems.length} done
                </div>
                <button
                  style={S.btnSmall(C.sage)}
                  onClick={(e) => {
                    e.stopPropagation();
                    addLifestyleItem();
                  }}
                >
                  + Item
                </button>
              </div>
              <ProgressBar value={dailyDone} max={activeItems.length || 1} />
              <div style={{ height: 10 }} />
              {activeItems.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "16px 0",
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  No items yet. Tap + Item to add one.
                </div>
              )}
              {activeItems.length > 0 && (
                <div style={S.card}>
                  {activeItems.map((c, i) => {
                    const done = !!todayChores[c.id];
                    return (
                      <div
                        key={c.id}
                        style={{
                          ...S.row,
                          padding: "10px 0",
                          borderBottom:
                            i < activeItems.length - 1
                              ? `0.5px solid ${C.bd}`
                              : "none",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: done ? C.muted : C.tx,
                              textDecoration: done ? "line-through" : "none",
                            }}
                          >
                            {c.title}
                          </div>
                          {c.notes && (
                            <div
                              style={{
                                fontSize: 10,
                                color: C.muted,
                                marginTop: 2,
                              }}
                            >
                              {c.notes}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <button
                            onClick={() => editLifestyleItem(c)}
                            style={{
                              background: "none",
                              border: "none",
                              color: C.muted,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            edit
                          </button>
                          <button
                            onClick={() => deleteLifestyleItem(c.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: C.muted,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            x
                          </button>
                          <button
                            onClick={() => toggleDailyChore(c.id)}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 6,
                              border: `1.5px solid ${done ? C.sage : C.bd}`,
                              background: done ? C.sage : "transparent",
                              color: C.white,
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {done ? "✓" : ""}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleCard>
            <CollapsibleCard
              title="Weekly Lifestyle"
              summary={`${weekDone}/${WEEKLY_CHORES.length} done this week`}
              open={lifestyleOpen.weekly}
              onToggle={() =>
                setLifestyleOpen((s) => ({ ...s, weekly: !s.weekly }))
              }
            >
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                {weekDone}/{WEEKLY_CHORES.length} done
              </div>
              <div style={S.card}>
                {WEEKLY_CHORES.map((c, i) => {
                  const done = !!weekChores[c.id];
                  return (
                    <div
                      key={c.id}
                      style={{
                        ...S.row,
                        padding: "10px 0",
                        borderBottom:
                          i < WEEKLY_CHORES.length - 1
                            ? `0.5px solid ${C.bd}`
                            : "none",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: done ? C.muted : C.tx,
                            textDecoration: done ? "line-through" : "none",
                          }}
                        >
                          {c.label}
                        </div>
                        {c.dayHint && (
                          <div style={{ fontSize: 10, color: C.muted }}>
                            {
                              [
                                "",
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                                "Sun",
                              ][c.dayHint]
                            }
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleWeeklyChore(c.id)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          border: `1.5px solid ${done ? C.sage : C.bd}`,
                          background: done ? C.sage : "transparent",
                          color: C.white,
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {done ? "v" : ""}
                      </button>
                    </div>
                  );
                })}
              </div>
            </CollapsibleCard>
          </div>
        )}

  useEffect(()=>{
    const flushProfile=()=>{
      storage.setJSON(STORAGE_KEYS.profile,latestProfileRef.current);
      storage.setJSON(STORAGE_KEYS.growth,growthStateRef.current);
    };
    const onVisibilityChange=()=>{
      if(document.visibilityState==='hidden')flushProfile();
    };
    const onPageHide=()=>flushProfile();
    window.addEventListener('beforeunload',flushProfile);
    window.addEventListener('pagehide',onPageHide);
    document.addEventListener('visibilitychange',onVisibilityChange);
    return()=>{
      window.removeEventListener('beforeunload',flushProfile);
      window.removeEventListener('pagehide',onPageHide);
      document.removeEventListener('visibilitychange',onVisibilityChange);
    };
  },[]);

  useEffect(()=>{
    const onKeyDown=e=>{
      if(isTypingTarget(e.target))return;
      const meta=e.metaKey||e.ctrlKey;
      if(!meta)return;
      const key=e.key.toLowerCase();
      if(key==='k'){
        e.preventDefault();
        openCommandBar();
      }else if(key==='w'){
        e.preventDefault();
        openTab('training');
      }else if(key==='m'){
        e.preventDefault();
        openTab('meals');
        setShowManual(true);
      }
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[openTab]);

  useEffect(()=>{
    if(!profile.googleClientId)return;
    GoogleAPI.init(profile.googleClientId).catch(()=>{});
  },[profile.googleClientId]);

  useEffect(()=>{
    if(!loaded||profile.lastRolloverDate===TODAY)return;
    const overdue=profile.taskHistory.filter(t=>t.date<TODAY&&!t.done&&(t.status||'active')==='active'&&!t.parentId);
    if(overdue.length>0){
      updateProfile(p=>({
        ...p,
        maintenanceHistory: { ...p.maintenanceHistory, [id]: TODAY },
        maintenanceMeta: {
          ...(p.maintenanceMeta || {}),
          [id]: { ...(p.maintenanceMeta || {})[id], dueDate: null },
        },
      }));
    }
    function snoozeMaintenance(id) {
      const tomorrow = addDaysIso(TODAY, 1);
      updateProfile((p) => ({
        ...p,
        maintenanceMeta: {
          ...(p.maintenanceMeta || {}),
          [id]: {
            ...(p.maintenanceMeta || {})[id],
            startDate: tomorrow,
            dueDate: tomorrow,
          },
        },
      }));
    }
    function editMaintenance(item) {
      const nextStartDate = prompt(
        "Set start date (YYYY-MM-DD)",
        item.startDate || TODAY,
      );
      if (!nextStartDate) return;
      const nextDueDate = prompt(
        "Set next due date (YYYY-MM-DD)",
        item.dueDate || TODAY,
      );
      if (!nextDueDate) return;
      updateProfile((p) => ({
        ...p,
        maintenanceMeta: {
          ...(p.maintenanceMeta || {}),
          [item.id]: {
            ...(p.maintenanceMeta || {})[item.id],
            startDate: nextStartDate,
            dueDate: nextDueDate,
          },
        },
      }));
    }
    function formatMaintenanceStatus(item) {
      if (item.status === "overdue")
        return item.daysOverdue > 0
          ? `Overdue ${item.daysOverdue}d`
          : "Overdue";
      if (item.status === "today") return "Due today";
      if (item.status === "active")
        return item.dueSoon ? `Due soon · ${item.daysUntil}d` : "Active";
      return item.daysUntilStart > 0
        ? `Starts in ${item.daysUntilStart}d`
        : `Upcoming in ${item.daysUntil}d`;
    }
    const mqOverdue = maintenanceQueue.filter(
      (item) => item.status === "overdue",
    );
    const mqToday = maintenanceQueue.filter((item) => item.status === "today");
    const mqActive = maintenanceQueue.filter(
      (item) => item.status === "active",
    );
    const mqUpcoming = maintenanceQueue.filter(
      (item) => item.status === "upcoming",
    );
    const [maintenanceOpen, setMaintenanceOpen] = useState({
      overdue: mqOverdue.length > 0 || mqToday.length > 0,
      today: mqOverdue.length > 0 || mqToday.length > 0,
      active: false,
      upcoming: false,
    });
    function renderMaintGroup(groupLabel, items, openKey, accent) {
      return (
        <CollapsibleCard
          title={groupLabel}
          summary={
            items.length === 0
              ? "No items"
              : `${items.length} item${items.length !== 1 ? "s" : ""}`
          }
          open={maintenanceOpen[openKey]}
          onToggle={() =>
            setMaintenanceOpen((s) => ({ ...s, [openKey]: !s[openKey] }))
          }
          accent={accent}
          cardStyle={{ marginBottom: 6 }}
        >
          {items.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted }}>
              No items in this group.
            </div>
          )}
          {items.map((item, i) => (
            <div
              key={item.id}
              style={{
                padding: "10px 0",
                borderBottom:
                  i < items.length - 1 ? `0.5px solid ${C.bd}` : "none",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: item.status === "overdue" ? C.red : C.muted,
                      marginTop: 2,
                    }}
                  >
                    {formatMaintenanceStatus(item)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {item.category}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    style={S.btnSmall(
                      item.status === "overdue" ? C.red : C.sage,
                    )}
                    onClick={() => completeMaintenance(item.id)}
                  >
                    Complete
                  </button>
                  <button
                    style={{ ...S.btnGhost, fontSize: 10, padding: "5px 8px" }}
                    onClick={() => snoozeMaintenance(item.id)}
                  >
                    Snooze
                  </button>
                  <button
                    style={{ ...S.btnGhost, fontSize: 10, padding: "5px 8px" }}
                    onClick={() => editMaintenance(item)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </CollapsibleCard>
      );
    }

    return (
      <div style={S.body}>
        <div style={S.card}>
          <span style={S.lbl}>Maintenance</span>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 6,
            }}
          >
            Operational and personal upkeep
          </div>
          <div style={{ fontSize: 11, color: C.tx2 }}>
            Refills, cleaning, replacements, restocks, and scheduled checkups
            stay here until you clear them.
          </div>
        </div>
        {renderMaintGroup(
          "Overdue",
          mqOverdue,
          "overdue",
          mqOverdue.length > 0 ? C.red : undefined,
        )}
        {renderMaintGroup(
          "Due Today",
          mqToday,
          "today",
          mqToday.length > 0 ? C.amber : undefined,
        )}
        {renderMaintGroup("Active", mqActive, "active", undefined)}
        {renderMaintGroup("Upcoming", mqUpcoming, "upcoming", undefined)}
      </div>
    );
  }

  // ── QUICK CAPTURE ───────────────────────────────────────────────
  function confirmCapture(routed){
    const text=captureText.trim();
    if(!text)return;
    if(routed?.type==='command'){
      if(routed.command==='start_workout'){
        if(adjustedTodayWorkout){
          openTab('training');
          launchWorkout(adjustedTodayWorkout);
          showNotif('Started today\'s workout','success');
        }else{
          showNotif('No workout scheduled today','warn');
        }
      }else if(routed.command==='log_food'){
        const query=(routed.foodQuery||'').toLowerCase();
        const allFoods=resolveFoodLibrary(foodLibrary);
        const food=allFoods.find(item=>item.name.toLowerCase()===query)
          || allFoods.find(item=>item.name.toLowerCase().includes(query))
          || allFoods.find(item=>query.includes(item.name.toLowerCase()));
        if(food&&routed.grams){
          const macros=scaleFoodMacros(food,routed.grams);
          addMeal({
            meal:food.name,
            foodId:food.id,
            source:'command',
            grams:Math.round(routed.grams),
            cal:macros.cal,
            pro:macros.pro,
            carb:macros.carb,
            fat:macros.fat,
            fiber:macros.fiber,
            sodium:macros.sodium,
          },'snack');
          showNotif(`${food.name} logged`,'success');
        }else{
          showNotif('Food not found in library or pantry','warn');
        }
      }else if(routed.command==='set_5k'){
        updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,fiveKTime:routed.minutes}}));
        showNotif('5K time updated','success');
      }else if(routed.command==='add_grocery'){
        const itemText=`Grocery: ${routed.item}`;
        updateProfile(p=>({...p,inboxItems:[...(p.inboxItems||[]),{id:String(Date.now()),text:itemText,createdDate:TODAY,suggestedType:'grocery',status:'pending'}]}));
        showNotif('Added to grocery inbox','success');
      }
    } else if(routed?.type==='expense'){
      const t={transactionId:`cap-${Date.now()}`,date:TODAY,merchant:routed.preview,description:routed.preview,amount:routed.amount||0,isCredit:false,accountId:getDefaultAccountId(activeFinancialAccounts,true),category:'other',isReviewed:false,isTransfer:false,isRecurring:false,notes:''};
      updateProfile(p=>({...p,transactions:[...(p.transactions||[]),t]}));
    } else if(routed?.type==='note'){
      const item={id:`inbox-${Date.now()}`,text:routed.preview,createdDate:TODAY,suggestedType:'note',status:'pending'};
      updateProfile(p=>({...p,inboxItems:[...(p.inboxItems||[]),item]}));
      showNotif('Added to inbox for review','success');
    } else {
      const t={id:String(Date.now()),text:text,date:TODAY,priority:1,parentId:null,done:false,updatedAt:new Date().toISOString()};
      updateProfile(p=>({...p,taskHistory:[...(p.taskHistory||[]),t]}));
    }
    setCaptureText('');setShowCapture(false);setCaptureMode('command');
    if(routed?.type!=='command')showNotif('Captured','success');
  }

  // ── DAILY LOG ───────────────────────────────────────────────────
  function saveDailyLog(patch,dateKey=selectedDate){
    updateProfile(p=>({...p,dailyLogs:{...p.dailyLogs,[dateKey]:{...(p.dailyLogs?.[dateKey]||{}),date:dateKey,...patch}}}));
  }
  function logEnergyCheckin(){
    if(compareDateKeys(selectedDate,TODAY)>0){
      showNotif('Recovery data is unavailable for future dates.','warn');
      return;
    }
    function toggleTask(id) {
      updateProfile((p) => ({
        ...p,
        taskHistory: p.taskHistory.map((t) =>
          t.id === id
            ? {
                ...t,
                done: !t.done,
                status: !t.done ? "done" : "active",
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      }));
    }
    setShowMorningCheckin(false);
    setDismissedMorningCheckinDate(todayKey);
  }
  function saveMorningCheckin(){
    const todayKey=getTodayKey();
    const noteValue=checkInNote.trim();
    const sleepVal=typeof checkInSleep==='number'&&checkInSleep>0?checkInSleep:null;
    const entry={
      date:todayKey,
      mood:typeof checkInMood==='number'?checkInMood:null,
      energy:checkInEnergy,
      stress:checkInStress,
      note:noteValue||null,
      sleepHours:sleepVal,
    };
    saveDailyCheckin(todayKey,entry);
    updateProfile(p=>({
      ...p,
      dailyLogs:{
        ...p.dailyLogs,
        [todayKey]:{
          ...(p.dailyLogs?.[todayKey]||{}),
          date:todayKey,
          mood:entry.mood,
          checkInEnergy:entry.energy,
          energyScore:entry.energy*2,
          stress:entry.stress,
          checkInNote:entry.note,
          sleepHours:sleepVal!=null?sleepVal:(p.dailyLogs?.[todayKey]?.sleepHours||null),
          workoutDone:wktDone,
          proteinMet:totPro>=(proGoal*0.9),
          hydrationMet:todayH>=(hydGoal*0.9),
          checkInDone:true,
        },
      },
    }));
    setDismissedMorningCheckinDate(todayKey);
    setShowMorningCheckin(false);
    trackGrowthEvent('checkin_completed');
    showNotif('Check-in saved','success');
  }
  function updateDailyExecution(dateKey,updater){
    const existing=normalizeDailyExecutionEntry(profile.dailyExecution?.[dateKey],dateKey,profile.top3?.[dateKey]||[]);
    const nextEntry=normalizeDailyExecutionEntry(typeof updater==='function'?updater(existing):updater,dateKey,profile.top3?.[dateKey]||[]);
    const existingCount=existing.tasks.filter(task=>(task.title||task.text||'').trim()).length;
    const nextCount=nextEntry.tasks.filter(task=>(task.title||task.text||'').trim()).length;
    const nextTop3=nextEntry.tasks.slice(0,3).map(task=>task.title||task.text||'');
    updateProfile(current=>({
      ...current,
      dailyExecution:{...(current.dailyExecution||{}),[dateKey]:nextEntry},
      top3:{...(current.top3||{}),[dateKey]:nextTop3},
    }));
    syncDailyCheckinTop3(dateKey,nextTop3);
    if(existingCount===0&&nextCount>0)trackGrowthEvent('first_priority_added',{date:dateKey});
  }
  function updateWorkoutRecommendationForDate(dateKey,action,finalSelection=null){
    const nextSelectedWorkoutId=action==='modify'
      ?resolveWorkoutSelectionId(finalSelection,dateKey)
      :action==='accept'
        ?resolveWorkoutSelectionId(scheduledTodayWorkout,dateKey)
        :null;
    updateProfile(current=>({
      ...current,
      dailyRecommendations:{
        ...(current.dailyRecommendations||{}),
        [dateKey]:{
          ...normalizeDailyRecommendationsEntry(current.dailyRecommendations?.[dateKey],dateKey),
          workout:normalizeDailyRecommendation({
            type:'workout',
            date:dateKey,
            suggestion:{
              scheduledWorkout:scheduledTodayWorkout,
              recoveryWorkout:recoveryWorkoutOption,
            },
            userOverride:action==='modify',
            finalSelection,
            action,
            workoutDecisionMade:true,
            selectedWorkoutId:nextSelectedWorkoutId,
          },dateKey),
        },
      },
    }));
  }
  function completeHabit(habitId){
    const log=dailyLogs?.[selectedDate]||{};
    const done=[...(log.habitsCompleted||[])];
    if(!done.includes(habitId))done.push(habitId);
    saveDailyLog({habitsCompleted:done},selectedDate);
  }
  function openHabitsEditor(dateKey=selectedDate){
    const completedIds=dailyLogs?.[dateKey]?.habitsCompleted||[];
    setHabitDraftCompletions(completedIds.reduce((acc,id)=>{acc[id]=true;return acc;},{}));
    setShowHabitsModal(true);
  }
  function saveHabitCompletions(dateKey=selectedDate){
    const completedIds=(habits||[]).filter(habit=>habitDraftCompletions[habit.id]).map(habit=>habit.id);
    saveDailyLog({habitsCompleted:completedIds},dateKey);
    setShowHabitsModal(false);
    showNotif('Habits saved','success');
  }
  // Toggle a task's done state from dashboard or agenda
  function toggleTaskDone(taskId){
    const targetTask=(taskHistory||[]).find(task=>task.id===taskId);
    const nextDone=!targetTask?.done;
    updateProfile(p=>({...p,taskHistory:(p.taskHistory||[]).map(t=>t.id===taskId?{...t,done:!t.done,status:!t.done?'done':'active',updatedAt:new Date().toISOString()}:t)}));
    if(nextDone)trackGrowthEvent('task_completed',{taskId});
  }
  // Add text to Capture Inbox (unclassified, no routing)
  function addToInbox(text){
    if(!text?.trim())return;
    const item={id:`inbox-${Date.now()}`,text:text.trim(),createdDate:TODAY,suggestedType:null,status:'pending'};
    updateProfile(p=>({...p,inboxItems:[...(p.inboxItems||[]),item]}));
  }
  // Convert inbox item to a specific module
  function convertInboxItem(id,type,extra={}){
    const item=(inboxItems||[]).find(x=>x.id===id);
    if(!item)return;
    if(type==='task'){
      const t={id:`t-${Date.now()}`,text:item.text,date:extra.date||TODAY,priority:extra.priority||2,parentId:null,done:false,status:'active',bucket:extra.bucket||'next',contextTags:extra.contextTags||[],scheduledTime:extra.scheduledTime||'',updatedAt:new Date().toISOString()};
      updateProfile(p=>({...p,inboxItems:(p.inboxItems||[]).map(x=>x.id===id?{...x,status:'processed'}:x),taskHistory:[...(p.taskHistory||[]),t]}));
    } else if(type==='finance'){
      const cat=autoCategorize(item.text,profile.merchantRules||{});
      const finMatch=item.text.match(/\$?(\d+(?:\.\d{1,2})?)/);
      const t={transactionId:`inbox-${Date.now()}`,date:TODAY,merchant:item.text,amount:parseFloat(finMatch?.[1])||0,isCredit:false,isTransfer:cat==='transfer',isRecurring:false,isReviewed:false,category:cat,accountId:getDefaultAccountId(activeFinancialAccounts,true),notes:'From inbox'};
      updateProfile(p=>({...p,inboxItems:(p.inboxItems||[]).map(x=>x.id===id?{...x,status:'processed'}:x),transactions:[...(p.transactions||[]),t]}));
    } else if(type==='note'){
      const n={id:String(Date.now()),text:item.text,date:TODAY,createdAt:new Date().toISOString()};
      updateProfile(p=>({...p,inboxItems:(p.inboxItems||[]).map(x=>x.id===id?{...x,status:'processed'}:x),captureNotes:[...(p.captureNotes||[]),n]}));
    } else if(type==='delete'){
      updateProfile(p=>({...p,inboxItems:(p.inboxItems||[]).map(x=>x.id===id?{...x,status:'processed'}:x)}));
    }
    showNotif(type==='delete'?'Cleared':`Added to ${type}`,'success');
  }
  function addHabit(habit){
    updateProfile(p=>({...p,habits:[...(p.habits||[]),{...habit,id:String(Date.now()),streakCount:0,createdAt:TODAY}]}));
  }
  function editHabit(habitId,patch){
    updateProfile(p=>({...p,habits:(p.habits||[]).map(h=>h.id===habitId?{...h,...patch,updatedAt:new Date().toISOString()}:h)}));
  }
  function deleteHabit(id){
    updateProfile(p=>({...p,habits:(p.habits||[]).filter(h=>h.id!==id)}));
  }
  function openEditHabit(habit){
    if(!habit)return;
    const name=prompt('Habit name?',habit.name||'');
    if(name===null||!name.trim())return;
    const freq=prompt('Frequency: daily / weekly / x_per_week',habit.frequencyType||'daily');
    if(freq===null||!freq.trim())return;
    const normalizedFrequency=freq.trim();
    const target=normalizedFrequency==='x_per_week'
      ?parseInt(prompt('Times per week?',String(habit.targetPerWeek||3))||String(habit.targetPerWeek||3),10)
      :1;
    editHabit(habit.id,{name:name.trim(),frequencyType:normalizedFrequency,targetPerWeek:Number.isFinite(target)&&target>0?target:1});
    showNotif('Habit updated','success');
  }
  function addCategory(){
    const label=prompt('Category name?');
    if(label===null||!label.trim())return;
    const color=prompt('Color token or hex (optional)',C.navy);
    if(color===null)return;
    updateProfile(p=>({
      ...p,
      categories:[
        ...(p.categories||[]),
        normalizeCategoryRecord({label:label.trim(),clr:(color||C.navy).trim(),ord:(financeCategories[financeCategories.length-1]?.ord||0)+1})
      ],
    }));
    showNotif('Category added','success');
  }
  function editCategory(category){
    if(!category)return;
    const label=prompt('Category name?',category.label||'');
    if(label===null||!label.trim())return;
    const color=prompt('Color token or hex (optional)',category.clr||C.navy);
    if(color===null)return;
    const nextCategory=normalizeCategoryRecord({...category,label:label.trim(),clr:(color||category.clr||C.navy).trim(),isSystem:false});
    updateProfile(p=>({
      ...p,
      categories:(p.categories||[]).some(item=>item.id===category.id)
        ?(p.categories||[]).map(item=>item.id===category.id?nextCategory:item)
        :[...(p.categories||[]),nextCategory],
    }));
    showNotif('Category updated','success');
  }

  // Finance helpers
  function importTransactions(raw,targetAccountId=''){
    const parsed=parseAllyCSV(raw)||parseRegionsCSV(raw)||[];
    if(!parsed.length){showNotif('Could not parse CSV — check format','error');return;}
    const accountSeed=parsed[0]?._importAccount||null;
    let nextAccounts=normalizeFinancialAccounts(financialAccounts);
    let importedAccountId=getDefaultAccountId(nextAccounts,true);
    if(targetAccountId&&nextAccounts.some(account=>account.id===targetAccountId)){
      importedAccountId=targetAccountId;
    }else if(accountSeed){
      const ensured=ensureImportedAccount(nextAccounts,accountSeed);
      nextAccounts=ensured.accounts;
      importedAccountId=ensured.accountId;
    }
    const categorized=parsed.map(t=>{
      const {_importAccount,...transaction}=t;
      const category=autoCategorize(t.description,merchantRules);
      return{
        ...transaction,
        accountId:resolveTransactionAccountId(transaction.accountId||importedAccountId,nextAccounts),
        category,
        isTransfer:category==='transfer',
      };
      const subtasks = (template.subtasks || []).map((text, idx) => ({
        id: `${parentId}-${idx}`,
        text,
        date: TODAY,
        priority: template.priority || 1,
        parentId,
        done: false,
        status: "active",
        bucket: template.defaultBucket || "next",
        contextTags: template.contextTags || [],
        scheduledTime: "",
        templateId: template.id,
        updatedAt: new Date().toISOString(),
      }));
      updateProfile((p) => ({
        ...p,
        taskHistory: [...p.taskHistory, parentTask, ...subtasks],
      }));
      showNotif(`${template.name} added`, "success");
    }
    function reuseTask(task) {
      if (!task) return;
      const reuseId = `task-${Date.now()}`;
      const subtasks = allTasks
        .filter(
          (item) => item.parentId === task.id && item.status !== "dismissed",
        )
        .map((item, idx) => ({
          ...item,
          id: `${reuseId}-${idx}`,
          parentId: reuseId,
          done: false,
          status: "active",
          date: TODAY,
          bucket: "next",
          scheduledTime: "",
          updatedAt: new Date().toISOString(),
        }));
      const nextTask = {
        ...task,
        id: reuseId,
        parentId: null,
        done: false,
        status: "active",
        date: TODAY,
        bucket: "next",
        scheduledTime: "",
        updatedAt: new Date().toISOString(),
      };
      updateProfile((p) => ({
        ...p,
        taskHistory: [...p.taskHistory, nextTask, ...subtasks],
      }));
      showNotif(`${task.text} added back to Next Up`, "success");
    }
    function saveNewTemplate() {
      if (!newTmplName.trim()) return;
      const tmpl = {
        id: `custom-${Date.now()}`,
        name: newTmplName.trim(),
        text: newTmplName.trim(),
        priority: newTmplPriority,
        contextTags: newTmplTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        subtasks: newTmplSubtasks
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        defaultBucket: "next",
      };
      updateProfile((p) => ({
        ...p,
        taskTemplates: [...(p.taskTemplates || []), tmpl],
      }));
      setNewTmplName("");
      setNewTmplSubtasks("");
      setNewTmplTags("");
      setNewTmplPriority(1);
      showNotif(`Template "${tmpl.name}" saved`, "success");
    }
    function deleteTemplate(id) {
      updateProfile((p) => ({
        ...p,
        taskTemplates: (p.taskTemplates || []).filter((t) => t.id !== id),
      }));
      showNotif("Template removed", "success");
    }

    function TaskRow({ t, indent = 0 }) {
      const subtasks = allTasks.filter(
        (s) => s.parentId === t.id && s.status !== "dismissed",
      );
      const expanded = expandedTasks[t.id];
      const progress = getTaskProgress(t, allTasks);
      const overdue = !t.done && t.date < TODAY;
      return (
        <div>
          <div
            style={{
              ...S.row,
              padding: "9px 0",
              paddingLeft: indent * 16,
              borderBottom: `0.5px solid ${C.bd}`,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}
            >
              <button
                onClick={() => toggleTask(t.id)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `1.5px solid ${t.done ? C.sage : prioClr[t.priority] || C.bd}`,
                  background: t.done ? C.sage : "transparent",
                  color: C.white,
                  fontSize: 11,
                  cursor: "pointer",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t.done ? "v" : ""}
              </button>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: t.done ? C.muted : C.tx,
                    textDecoration: t.done ? "line-through" : "none",
                  }}
                >
                  {t.text}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 2,
                  }}
                >
                  {t.rolledFrom && (
                    <span style={{ fontSize: 9, color: C.amber }}>
                      rolled over
                    </span>
                  )}
                  {overdue && (
                    <span style={{ fontSize: 9, color: C.red }}>overdue</span>
                  )}
                  {t.scheduledTime && (
                    <span style={{ fontSize: 9, color: C.muted }}>
                      {t.endTime
                        ? fmtTimeRange(t.scheduledTime, t.endTime)
                        : t.scheduledTime}
                    </span>
                  )}
                  {t.energyLevel && (
                    <span
                      style={{
                        ...S.pill(
                          t.energyLevel === "high"
                            ? C.sageL
                            : t.energyLevel === "medium"
                              ? C.amberL
                              : C.surf,
                          t.energyLevel === "high"
                            ? C.sageDk
                            : t.energyLevel === "medium"
                              ? C.amberDk
                              : C.muted,
                        ),
                        fontSize: 8,
                        padding: "2px 6px",
                      }}
                    >
                      {t.energyLevel}
                    </span>
                  )}
                  {progress && (
                    <span style={{ fontSize: 9, color: C.muted }}>
                      {progress.completed}/{progress.total} subtasks
                    </span>
                  )}
                </div>
                {(t.contextTags || []).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      marginTop: 5,
                    }}
                  >
                    {t.contextTags.map((tag) => (
                      <span key={tag} style={S.pill(C.surf, C.tx2)}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {subtasks.length > 0 && (
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setExpandedTasks((e) => ({ ...e, [t.id]: !e[t.id] }))
                  }
                >
                  {subtasks.length} {expanded ? "up" : "dn"}
                </button>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 4,
                marginLeft: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {t.done && (
                <button
                  onClick={() => reuseTask(t)}
                  style={{ ...S.btnGhost, fontSize: 9, padding: "5px 6px" }}
                >
                  Reuse
                </button>
              )}
              {!t.done && !t.scheduledTime && t.date === TODAY && (
                <button
                  onClick={() => scheduleTask(t.id, getSuggestedTaskTime(t))}
                  style={{ ...S.btnGhost, fontSize: 9, padding: "5px 6px" }}
                >
                  Suggest
                </button>
              )}
              {overdue && !t.done && (
                <button
                  onClick={() => rollTask(t.id)}
                  style={{ ...S.btnGhost, fontSize: 9, padding: "5px 6px" }}
                >
                  Roll
                </button>
              )}
              {overdue && !t.done && (
                <button
                  onClick={() => deferTask(t.id)}
                  style={{ ...S.btnGhost, fontSize: 9, padding: "5px 6px" }}
                >
                  Defer
                </button>
              )}
              {!t.done && (
                <button
                  onClick={() => dismissTask(t.id)}
                  style={{ ...S.btnGhost, fontSize: 9, padding: "5px 6px" }}
                >
                  Dismiss
                </button>
              )}
              {!t.done && t.status === "active" && (
                <button
                  onClick={() => {
                    setFocusTaskId(t.id);
                    setFocusTmrSec(null);
                    setFocusTmrRunning(false);
                  }}
                  style={{
                    ...S.btnGhost,
                    fontSize: 9,
                    padding: "5px 6px",
                    borderColor: C.navy,
                    color: C.navy,
                  }}
                >
                  Focus
                </button>
              )}
              <button
                onClick={() =>
                  openTaskComposer({
                    parentId: t.id,
                    date: t.date || TODAY,
                    bucket: t.bucket || "next",
                    contextTags: (t.contextTags || []).join(", "),
                    scheduledTime: "",
                  })
                }
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                +
              </button>
              <button
                onClick={() => deleteTask(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                x
              </button>
            </div>
          </div>
          {expanded &&
            subtasks.map((s) => (
              <TaskRow key={s.id} t={s} indent={indent + 1} />
            ))}
        </div>
      );
    }

    return (
      <div style={S.body}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[
            {
              id: "inbox",
              label: `Inbox${pendingInbox.length > 0 ? " (" + pendingInbox.length + ")" : ""}`,
              warn: pendingInbox.length > 0,
            },
            { id: "scheduled", label: `Sched` },
            {
              id: "next",
              label: `Next${todayTasks.length > 0 ? " (" + todayTasks.length + ")" : ""}`,
            },
            { id: "done", label: `Done` },
            { id: "templates", label: `Templates` },
          ].map(({ id, label, warn }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 10,
                border: `1px solid ${tasksTab === id ? (warn ? C.amber : C.sage) : C.bd}`,
                background:
                  tasksTab === id ? (warn ? C.amberL : C.sageL) : "transparent",
                color:
                  tasksTab === id ? (warn ? C.amberDk : C.sageDk) : C.muted,
                fontSize: 11,
                fontWeight: tasksTab === id ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tasksTab === "inbox" && (
          <div>
            {pendingInbox.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                Inbox is clear.
                <br />
                <span style={{ fontSize: 11 }}>
                  Use Quick Capture on Home to add ideas.
                </span>
              </div>
            )}
            {pendingInbox.map((item, i) => (
              <div key={item.id} style={{ ...S.card, marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: C.tx,
                    marginBottom: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {item.text}
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 10 }}>
                  {formatDate(item.createdDate, "monthDayShort")}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => convertInboxItem(item.id, "task")}
                    style={S.btnSmall(C.sage)}
                  >
                    → Task
                  </button>
                  <button
                    onClick={() => convertInboxItem(item.id, "finance")}
                    style={S.btnSmall(C.navy)}
                  >
                    → Finance
                  </button>
                  <button
                    onClick={() => convertInboxItem(item.id, "note")}
                    style={S.btnSmall(C.tx2)}
                  >
                    → Note
                  </button>
                  <button
                    onClick={() => convertInboxItem(item.id, "delete")}
                    style={{ ...S.btnGhost, fontSize: 11, color: C.muted }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ))}
            {pendingInbox.length > 0 && (
              <button
                style={{
                  ...S.btnGhost,
                  width: "100%",
                  textAlign: "center",
                  fontSize: 12,
                  marginTop: 4,
                }}
                onClick={() => {
                  if (confirm("Clear all inbox items?"))
                    updateProfile((p) => ({
                      ...p,
                      inboxItems: (p.inboxItems || []).map((x) => ({
                        ...x,
                        status: "processed",
                      })),
                    }));
                }}
              >
                Clear all inbox
              </button>
            )}
          </div>
        )}

        {(tasksTab === "next" || tasksTab === "scheduled") && (
          <div>
            {overdueTasks.length > 0 && (
              <div
                style={{
                  ...S.card,
                  borderColor: C.amber,
                  background: C.amberL,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.amberDk,
                    marginBottom: 4,
                  }}
                >
                  {overdueTasks.length} overdue task
                  {overdueTasks.length > 1 ? "s" : ""} need a decision
                </div>
                <div style={{ fontSize: 11, color: C.amberDk }}>
                  Roll, defer, or dismiss instead of letting them silently pile
                  up.
                </div>
              </div>
            )}
            <div style={{ ...S.row, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>
                {tasksTab === "next" ? "Next Up" : "Scheduled"}
              </div>
              <button
                style={S.btnSmall(C.sage)}
                onClick={() =>
                  openTaskComposer({
                    bucket: tasksTab === "scheduled" ? "scheduled" : "next",
                  })
                }
              >
                + Add
              </button>
            </div>
            {taskTemplates.length > 0 && (
              <div style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  Task templates
                </div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                  {taskTemplates.map((template) => (
                    <button
                      key={template.id}
                      style={{
                        ...S.btnGhost,
                        flexShrink: 0,
                        fontSize: 10,
                        padding: "6px 9px",
                      }}
                      onClick={() => addTaskFromTemplate(template)}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {dueTodayUnscheduled.length > 0 && tasksTab === "next" && (
              <div style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  Scheduling suggestions
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {dueTodayUnscheduled.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      style={{
                        ...S.row,
                        background: C.surf,
                        borderRadius: 10,
                        padding: "8px 10px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontSize: 12, fontWeight: 600, color: C.tx }}
                        >
                          {task.text}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          Suggested start: {getSuggestedTaskTime(task)}
                        </div>
                      </div>
                      <button
                        style={{
                          ...S.btnGhost,
                          fontSize: 10,
                          padding: "5px 8px",
                        }}
                        onClick={() =>
                          scheduleTask(task.id, getSuggestedTaskTime(task))
                        }
                      >
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tasksTab === "next" && suggestedByEnergy.length > 0 && (
              <div
                style={{
                  ...S.card,
                  marginBottom: 12,
                  borderColor: energyHigh ? C.sage : energyLow ? C.amber : C.bd,
                }}
              >
                <span style={S.lbl}>Suggested for now</span>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  {energyHigh
                    ? "Energy is high — tackle something demanding."
                    : energyLow
                      ? "Low energy — keep it light."
                      : "Next by priority."}
                </div>
                {suggestedByEnergy.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      ...S.row,
                      padding: "6px 0",
                      borderBottom: `0.5px solid ${C.bd}`,
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.tx, flex: 1 }}>
                      {t.text}
                    </span>
                    <button
                      style={{
                        ...S.btnGhost,
                        fontSize: 9,
                        padding: "5px 6px",
                        borderColor: C.navy,
                        color: C.navy,
                      }}
                      onClick={() => {
                        setFocusTaskId(t.id);
                        setFocusTmrSec(null);
                        setFocusTmrRunning(false);
                      }}
                    >
                      Focus
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showAddTask && (
              <div style={{ ...S.card, marginBottom: 12 }}>
                <FieldInput
                  value={taskDraftText}
                  allowEnterSubmit
                  onChange={(e) => setTaskDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key !== "Enter" ||
                      e.shiftKey ||
                      e.altKey ||
                      e.ctrlKey ||
                      e.metaKey ||
                      e.nativeEvent.isComposing
                    )
                      return;
                    e.preventDefault();
                    addTask();
                  }}
                  placeholder="Task name..."
                  style={{ ...S.inp, marginBottom: 8 }}
                  autoFocus
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <FieldInput
                    type="date"
                    value={newTask.date || TODAY}
                    onChange={(e) =>
                      setNewTask((n) => ({ ...n, date: e.target.value }))
                    }
                    style={S.inp}
                  />
                  <FieldInput
                    type="time"
                    value={newTask.scheduledTime || ""}
                    onChange={(e) =>
                      setNewTask((n) => ({
                        ...n,
                        scheduledTime: e.target.value,
                        bucket: e.target.value ? "scheduled" : n.bucket,
                      }))
                    }
                    placeholder="Start time (opt)"
                    style={S.inp}
                  />
                </div>
                {newTask.scheduledTime && (
                  <FieldInput
                    type="time"
                    value={newTask.endTime || ""}
                    onChange={(e) =>
                      setNewTask((n) => ({ ...n, endTime: e.target.value }))
                    }
                    placeholder="End time (optional)"
                    style={{ ...S.inp, marginBottom: 8 }}
                  />
                )}
                <FieldInput
                  value={newTask.contextTags || ""}
                  onChange={(e) =>
                    setNewTask((n) => ({ ...n, contextTags: e.target.value }))
                  }
                  placeholder="Context tags (comma separated)"
                  style={{ ...S.inp, marginBottom: 8 }}
                />
                <div style={{ ...S.row, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Priority:
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          setNewTask((n) => ({ ...n, priority: p }))
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: `1.5px solid ${newTask.priority === p ? prioClr[p] : C.bd}`,
                          background:
                            newTask.priority === p ? prioClr[p] : "transparent",
                          color: newTask.priority === p ? C.white : C.muted,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ ...S.row, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>Energy:</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { id: "high", label: "High", clr: C.sage, bg: C.sageL },
                      {
                        id: "medium",
                        label: "Med",
                        clr: C.amberDk,
                        bg: C.amberL,
                      },
                      { id: "low", label: "Low", clr: C.muted, bg: C.surf },
                    ].map(({ id, label, clr, bg }) => (
                      <button
                        key={id}
                        onClick={() =>
                          setNewTask((n) => ({
                            ...n,
                            energyLevel: n.energyLevel === id ? null : id,
                          }))
                        }
                        style={{
                          padding: "4px 10px",
                          borderRadius: 8,
                          border: `1.5px solid ${newTask.energyLevel === id ? clr : C.bd}`,
                          background:
                            newTask.energyLevel === id ? bg : "transparent",
                          color: newTask.energyLevel === id ? clr : C.muted,
                          fontSize: 10,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {[
                    { id: "next", label: "Next Up" },
                    { id: "scheduled", label: "Scheduled" },
                  ].map((bucket) => (
                    <button
                      key={bucket.id}
                      style={{
                        ...S.btnGhost,
                        flex: 1,
                        fontSize: 10,
                        padding: "6px 8px",
                        borderColor:
                          newTask.bucket === bucket.id ? C.sage : C.bd,
                        background:
                          newTask.bucket === bucket.id
                            ? C.sageL
                            : "transparent",
                      }}
                      onClick={() =>
                        setNewTask((n) => ({ ...n, bucket: bucket.id }))
                      }
                    >
                      {bucket.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={S.btnSolid(C.sage)} onClick={addTask}>
                    Add Task
                  </button>
                  <button
                    style={{ ...S.btnGhost, flex: 1 }}
                    onClick={() => {
                      setNewTask(
                        createNewTaskDraft(TODAY, {
                          bucket:
                            tasksTab === "scheduled" ? "scheduled" : "next",
                        }),
                      );
                      setTaskDraftText("");
                      setShowAddTask(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {tasksTab === "next" && todayTasks.length === 0 && !showAddTask && (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px 0",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                No next-up tasks right now. Tap + Add or use a template.
              </div>
            )}
            {tasksTab === "scheduled" &&
              futureTasks.length === 0 &&
              !showAddTask && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 0",
                    color: C.muted,
                    fontSize: 13,
                  }}
                >
                  Nothing scheduled yet.
                </div>
              )}
            {tasksTab === "next" && todayTasks.length > 0 && (
              <div style={S.card}>
                {timeBlockedTasks.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.muted,
                        fontWeight: 700,
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        marginBottom: 4,
                        paddingBottom: 4,
                        borderBottom: `0.5px solid ${C.bd}`,
                      }}
                    >
                      Time-Blocked
                    </div>
                    {timeBlockedTasks.map((t) => (
                      <TaskRow key={t.id} t={t} />
                    ))}
                  </>
                )}
                {anytimeTasks.length > 0 && (
                  <>
                    {timeBlockedTasks.length > 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          fontWeight: 700,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                          marginTop: 8,
                          marginBottom: 4,
                          paddingBottom: 4,
                          borderBottom: `0.5px solid ${C.bd}`,
                        }}
                      >
                        Anytime
                      </div>
                    )}
                    {anytimeTasks.map((t) => (
                      <TaskRow key={t.id} t={t} />
                    ))}
                  </>
                )}
              </div>
            )}
            {tasksTab === "scheduled" && futureTasks.length > 0 && (
              <div style={S.card}>
                {futureTasks.map((t) => (
                  <TaskRow key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {tasksTab === "done" && (
          <div>
            {doneTasks.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px 0",
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                Nothing completed yet.
              </div>
            )}
            {doneTasks.length > 0 && (
              <div style={S.card}>
                {doneTasks
                  .slice()
                  .reverse()
                  .map((t) => (
                    <TaskRow key={t.id} t={t} />
                  ))}
              </div>
            )}
          </div>
        )}

  function HomeScreenV2(){
    const weekAheadPanelId=useId();
    const [weekAheadOpen,setWeekAheadOpen]=useState(false);
    const [rescheduleTarget,setRescheduleTarget]=useState(null);
    const agendaTab='today';
    const activeDate=selectedDate;
    const isViewingToday=activeDate===TODAY;
    const isPastDate=compareDateKeys(activeDate,TODAY)<0;
    const isFutureDate=compareDateKeys(activeDate,TODAY)>0;
    const activeDateParts=getDateParts(activeDate);
    const dailyExecutionEntry=normalizeDailyExecutionEntry(profile.dailyExecution?.[activeDate],activeDate,top3[activeDate]||[]);
    const todayLog=dailyLogs?.[activeDate]||{};
    const pendingInbox=(inboxItems||[]).filter(x=>x.status==='pending');
    const mealsLogged=todayN.length;
    const activeTrainingFlags=getTrainingDayFlags(selectedDateObj.getDay(),athlete?.programType||'4-day',athlete?.preferredTrainingDays,athlete?.trainingWeekStart||'Mon');
    const mealsGoal=activeTrainingFlags.isTrainingDay?3:2;
    const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(weekMon);d.setDate(d.getDate()+i);return formatDateKey(d);});
    const mealsBySlot=MEAL_SLOTS.map(slot=>({slot,...MEAL_SLOT_SCHEDULE[slot.id],entries:todayN.filter(m=>m.slot===slot.id)}));
    const missingMealSlots=mealsBySlot.filter(entry=>entry.slot.id!=='snack'&&entry.entries.length===0);
    const homeFoodLibrary=[...DEFAULT_FOOD_LIBRARY,...(foodLibrary||[])];
    const homeMealTemplates=resolveMealTemplates(mealTemplates,homeFoodLibrary);
    const todayMealPlanEntries=getDailyMealPlanEntries(dailyMealPlans,activeDate);
    const nextPlannedMeal=todayMealPlanEntries.find(entry=>entry.status!=='logged')||null;
    const nextMealTemplate=nextPlannedMeal?homeMealTemplates.find(template=>template.id===nextPlannedMeal.templateId):null;
    const taskBuckets=getTaskBuckets(taskHistory,activeDate);
    const nextWeekMon=new Date(calendarWeekMon);nextWeekMon.setDate(calendarWeekMon.getDate()+7);
    const nextWeekDates=Array.from({length:7},(_,i)=>{const d=new Date(nextWeekMon);d.setDate(nextWeekMon.getDate()+i);return formatDateKey(d);});
    const overdueTasks=taskBuckets.overdue;
    const carryoverDismissed=!!(dailyLogs?.[activeDate]?.carryoverDismissed);
    const showCarryoverPrompt=isViewingToday&&overdueTasks.length>0&&!carryoverDismissed;
    const nextTaskItem=taskBuckets.next.slice().sort((a,b)=>{
      if(!!a.scheduledTime!==!!b.scheduledTime)return a.scheduledTime?-1:1;
      if((a.scheduledTime||'')!==(b.scheduledTime||''))return(a.scheduledTime||'').localeCompare(b.scheduledTime||'');
      return (b.priority||1)-(a.priority||1);
    })[0]||taskBuckets.scheduled.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))[0]||null;
    const urgentMaintenanceItems=maintenanceAttentionItems.slice(0,3);
    const todayChores=choreHistory[activeDate]||{};
    const dueHabits=(habits||[]).filter(h=>habitDueToday(h,dailyLogs));
    const completedHabitIds=dailyLogs?.[activeDate]?.habitsCompleted||[];
    const completedHabits=dueHabits.filter(h=>completedHabitIds.includes(h.id)).length;
    const activeHabits=(habits||[]).filter(h=>!h.archived);
    const completedActiveHabits=activeHabits.filter(h=>completedHabitIds.includes(h.id)).length;
    const habitsSummary=activeHabits.length>0?`${completedActiveHabits} of ${activeHabits.length} habits completed today`:'No habits set up yet';
    const habitsBadge=activeHabits.length===0?null:(completedActiveHabits===activeHabits.length&&activeHabits.length>0?'done':completedActiveHabits>0?`${completedActiveHabits}/${activeHabits.length}`:null);
    const activeLifestyleItems=(lifestyleItems||[]).filter(i=>!i.archived).sort((a,b)=>(a.order||0)-(b.order||0));
    const dailyDone=activeLifestyleItems.filter(i=>!!todayChores[i.id]).length;

    const energyFive=Math.max(1,Math.min(5,Math.round(((recoveryToday.energy??6)/2))));
    const sleepHoursToday=recoveryToday.sleep||0;
    const sleepWhole=Math.floor(sleepHoursToday||0);
    const sleepMinutes=Math.round(((sleepHoursToday||0)-sleepWhole)*60);
    const recoveryReadiness=recoveryToday.readiness;
    const recoveryState=recoveryToday.level===null
      ?{label:'No data',color:C.muted,bg:C.surf,recommendation:'Future dates stay in planning mode until recovery data exists.'}
      :recoveryToday.level==='High'
        ?{label:'Ready',color:C.sage,bg:C.sageL,recommendation:'Good day for intensity.'}
        :recoveryToday.level==='Moderate'
          ?{label:'Moderate',color:C.amberDk,bg:C.amberL,recommendation:'Train, but keep volume controlled.'}
          :{label:'Low',color:C.red,bg:C.redL,recommendation:'Recovery or light session recommended.'};
    const doneForToday=wktDone&&maintenanceAttentionItems.length===0&&(missingMealSlots.length===0||mealsLogged>=mealsGoal);
    const workoutTitle=selectedTodayWorkout?.name||restDayRecovery.name;
    const workoutMeta=isPastDate
      ?'Workout history is fixed for past dates.'
      :isFutureDate
        ?'Planning only. No recovery prompt for future dates.'
        :workoutDecisionMade&&dailyWorkoutRecommendation?.action==='modify'
          ?'Recovery workout selected for today.'
          :workoutDecisionMade&&dailyWorkoutRecommendation?.action==='accept'
            ?'Scheduled workout confirmed for today.'
            :workoutDecisionMade&&dailyWorkoutRecommendation?.action==='ignore'
              ?'Scheduled workout left unchanged for today.'
        :shouldPromptWorkoutDecision&&!dailyWorkoutRecommendation?.action
          ?'Recovery is low. Choose whether to continue or switch.'
          :selectedTodayWorkout?.adjustmentReason||'Open today’s plan';
    const workoutDuration=selectedTodayWorkout?.dur||selectedTodayWorkout?.duration||restDayRecovery.dur||'25 min';
    const alertsVisible=urgentMaintenanceItems.length>0||pendingInbox.length>5;

    function setDailyExecutionMode(nextMode){
      if(nextMode==='execution'&&!dailyExecutionEntry.tasks.some(task=>(task.title||task.text||'').trim())){
        showNotif('Add at least one task before starting the day.','warn');
        return;
      }
      updateDailyExecution(activeDate,entry=>({
        ...entry,
        mode:nextMode,
      }));
      if(nextMode==='execution')trackGrowthEvent('execution_started',{date:activeDate});
      if(nextMode==='execution')showNotif('Day started','success');
    }

    function updatePriorityTask(taskId,patch){
      const normalizedPatch='title' in patch&&!("text" in patch)
        ?{...patch,text:patch.title}
        :('text' in patch&&!("title" in patch)?{...patch,title:patch.text}:patch);
      updateDailyExecution(activeDate,entry=>{
        const tasks=entry.tasks.map(task=>task.id===taskId?{...task,...normalizedPatch,updatedAt:new Date().toISOString()}:task);
        return{...entry,tasks};
      });
    }

    function addPriorityTask(taskData={}){
      updateDailyExecution(activeDate,entry=>{
        const nextTask=createDailyExecutionTask(taskData.title||taskData.text||'',{date:activeDate,...taskData});
        return{
          ...entry,
          mode:entry.mode==='execution'?entry.mode:'planning',
          tasks:[...entry.tasks,nextTask],
        };
      });
    }

    function removePriorityTask(taskId){
      updateDailyExecution(activeDate,entry=>({
        ...entry,
        tasks:entry.tasks.filter(task=>task.id!==taskId),
      }));
    }

    function movePriorityTask(taskId,direction){
      updateDailyExecution(activeDate,entry=>{
        const tasks=[...entry.tasks];
        const index=tasks.findIndex(task=>task.id===taskId);
        const target=index+direction;
        if(index<0||target<0||target>=tasks.length)return entry;
        [tasks[index],tasks[target]]=[tasks[target],tasks[index]];
        return{...entry,tasks};
      });
    }
    function moveCalendar(delta) {
      if (calendarViewMode === "month") {
        setCalendarMonthIndex((index) => index + delta);
        return;
      }
      updateWorkoutRecommendationForDate(activeDate,'ignore',scheduledTodayWorkout);
    }

    const latestRunEntry=[...workoutHistory].reverse().find(entry=>entry.type==='run');
    const latestStrengthEntry=[...workoutHistory].reverse().find(entry=>entry.type==='workout');
    const latestSimulationEntry=[...workoutHistory].reverse().find(entry=>entry.type==='workout'&&/simulation|hyrox/i.test(entry.name||''));
    const latestRunMetric=latestRunEntry
      ?`${latestRunEntry.data?.dist2?`${latestRunEntry.data.dist2} mi · `:''}${(function(){
        const nm=(latestRunEntry.name||'').toLowerCase();
        if(nm.includes('interval'))return paceProfile?.interval||'Intervals';
        if(nm.includes('tempo')||nm.includes('threshold')||nm.includes('race'))return paceProfile?.threshold||'Threshold';
        return paceProfile?.easy||'Logged';
      })()}`
      :'No runs';
    const latestStrengthPr=(function(){
      if(!latestStrengthEntry?.data?.exercises)return'No lifts';
      let best=null;
      latestStrengthEntry.data.exercises.forEach(ex=>{
        (ex.setLogs||[]).forEach(set=>{
          const weight=parseFloat(set.weight);
          if(set.done&&weight>0&&(!best||weight>best.weight))best={name:ex.n,weight};
        });
      });
      return best?`${best.name} · ${best.weight}${UNITS.weight}`:'No PR';
    })();
    const latestSimulationMetric=(function(){
      if(!latestSimulationEntry)return'No simulations';
      const mins=latestSimulationEntry.data?.startedAt&&latestSimulationEntry.data?.completedAt
        ?Math.max(1,Math.round((latestSimulationEntry.data.completedAt-latestSimulationEntry.data.startedAt)/60000))
        :null;
      return mins?`${fmtDur(mins)} · ${formatDate(latestSimulationEntry.date,'monthDayShort')}`:`${latestSimulationEntry.name} · ${formatDate(latestSimulationEntry.date,'monthDayShort')}`;
    })();
    const mealHistoryAll=Object.entries(nutr||{}).flatMap(([date,entries])=>(entries||[]).map(entry=>({...entry,date}))).sort((a,b)=>a.date===b.date?((b.id||0)-(a.id||0)):b.date.localeCompare(a.date));
    const lastBreakfast=mealHistoryAll.find(entry=>entry.slot==='breakfast');
    const lastSnack=mealHistoryAll.find(entry=>entry.slot==='snack');
    const compactNextMealLabel=nextMealTemplate
      ?`${nextMealTemplate.name} · ${nextMealTemplate.macros?.pro||0}g protein`
      :missingMealSlots[0]
        ?`${missingMealSlots[0].slot.label} still open`
        :'Meals logged';
    const homeMetrics=[
      energyFive!=null?{label:'Energy',value:`${energyFive}/5`}:null,
      sleepHoursToday?{label:'Sleep',value:`${sleepWhole}h ${String(sleepMinutes).padStart(2,'0')}m`}:null,
      pendingInbox.length>0?{label:'Inbox',value:String(pendingInbox.length)}:null,
    ].filter(Boolean);
    const mealCardTitle='Log meal';
    const mealCardSubtitle=(nextPlannedMeal||missingMealSlots.length>0)?'Open nutrition':null;
    const workoutCardTitle=getCompactWorkoutTitle(workoutTitle||restDayRecovery.name);
    const workoutCardDuration=workoutDuration||restDayRecovery.dur||'25 min';
    const taskCardTitle=nextTaskItem?.text||'No tasks';
    const taskCardMeta=nextTaskItem
      ?`${nextTaskItem.scheduledTime||'Anytime'}${nextTaskItem.priority?` · P${nextTaskItem.priority}`:''}`
      :null;

    function rollAllOverdue(){
      updateProfile(p=>({
        ...p,
        taskHistory:p.taskHistory.map(t=>(!t.done&&t.status==='active'&&t.date<activeDate)?{...t,date:activeDate,bucket:'next',rolledFrom:t.rolledFrom||t.id,updatedAt:new Date().toISOString()}:t),
        dailyLogs:{...p.dailyLogs,[activeDate]:{...(p.dailyLogs[activeDate]||{}),carryoverDismissed:true}},
      }));
      showNotif(`${overdueTasks.length} task${overdueTasks.length!==1?'s':''} rolled to ${formatDate(activeDate,'monthDayLong')}`,'success');
    }
    function dismissCarryover(){
      updateProfile(p=>({...p,dailyLogs:{...p.dailyLogs,[activeDate]:{...(p.dailyLogs[activeDate]||{}),carryoverDismissed:true}}}));
    }
    function resetCalendarToToday() {
      onSelectDay(TODAY);
      setCalendarViewMode("week");
      setCalendarWeekIndex(0);
      setCalendarMonthIndex(0);
    }
    function handleCalendarTouchStart(event) {
      const touch = event.touches?.[0];
      if (!touch) return;
      gestureRef.current = { x: touch.clientX, y: touch.clientY };
    }
    function handleCalendarTouchEnd(event) {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const dx = touch.clientX - gestureRef.current.x;
      const dy = touch.clientY - gestureRef.current.y;
      if (
        calendarViewMode === "week" &&
        Math.abs(dx) > 40 &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        moveCalendar(dx < 0 ? 1 : -1);
      }
      if (
        calendarViewMode === "month" &&
        Math.abs(dy) > 50 &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        moveCalendar(dy < 0 ? 1 : -1);
      }
    }
    function createLocalEvent() {
      if (!calForm.title.trim()) return;
      const event = {
        id: String(Date.now()),
        title: calForm.title,
        startHour: calForm.hour,
        durationMins: calForm.dur,
        local: true,
        color: C.sage,
      };
      updateProfile((p) => ({
        ...p,
        calendarCache: {
          ...p.calendarCache,
          [selDay]: [...(p.calendarCache[selDay] || []), event],
        },
      }));
      setCalForm({ title: "", hour: 9, dur: 60, allDay: false });
      setCalModal(null);
    }
    function deleteEvent(dateStr, id) {
      updateProfile((p) => ({
        ...p,
        calendarCache: {
          ...p.calendarCache,
          [dateStr]: (p.calendarCache[dateStr] || []).filter(
            (e) => e.id !== id,
          ),
        },
      }));
    }
    async function syncGoogleCal() {
      if (!googleConnected) {
        showNotif("Connect Google in Settings first");
        return;
      }
      openTab('training');
    }

    function repeatMeal(entry,slotOverride){
      if(!entry)return;
      addMeal({
        meal:entry.meal,
        pantryItemId:entry.pantryItemId,
        recipeId:entry.recipeId,
        source:'repeat-last',
        foodIds:entry.foodIds||entry.itemIds||[],
        foodId:entry.foodId||(entry.foodIds||entry.itemIds||[])[0]||null,
        grams:entry.grams||0,
        cal:entry.cal||0,
        pro:entry.pro||0,
        carb:entry.carb||0,
        fat:entry.fat||0,
        fiber:entry.fiber||0,
        sodium:entry.sodium||0,
        photo:entry.photo||null,
      },slotOverride||entry.slot||'snack');
      showNotif(`Repeated ${entry.meal}`,'success');
    }
    function buildAgendaItemsForDate(dateStr){
      const scheduledItems=(calendarCache[dateStr]||[]).map(event=>({
        id:`event-${dateStr}-${event.id}`,
        kind:'calendar',
        sortMins:event.allDay?-999:(event.startHour||8)*60,
        timeLabel:event.allDay?'All day':formatHourLabel(event.startHour),
        title:event.title||'Calendar event',
        meta:event.allDay?'All day':event.durationMins?`${event.durationMins} min`:'Calendar',
        allDay:event.allDay||false,
      }));
      scheduledItems.push(...getBusyForDay(dateStr).map(block=>({
        id:`busy-${dateStr}-${block.id}`,
        kind:'busy',
        sortMins:timeToMins(block.startTime),
        timeLabel:block.startTime&&block.endTime?fmtTimeRange(block.startTime,block.endTime):'Busy',
        title:block.title||'Busy block',
        meta:'Busy',
      })));
      scheduledItems.push(...taskHistory.filter(task=>task.date===dateStr&&!task.parentId&&!task.done&&(task.status||'active')==='active').map(task=>({
        id:`task-${task.id}`,
        kind:'task',
        sortMins:9*60,
        timeLabel:'Task',
        title:task.text,
        meta:task.priority===3?'High priority':task.priority===2?'Medium priority':'Task',
        taskId:task.id,
      })));
      const plannedWorkout=selectedWeekPlannedWorkouts.find(item=>item.plannedDate===dateStr);
      if(plannedWorkout){
        scheduledItems.push({
        id:`workout-${plannedWorkout.plannedDate}`,
        kind:'workout',
        sortMins:7*60,
        timeLabel:'Workout',
        title:plannedWorkout.plannedName||plannedWorkout.name,
        meta:plannedWorkout.status==='completed'?'Completed':plannedWorkout.status==='moved'?'Moved':plannedWorkout.status==='missed'?'Open':'Planned',
      });
      }
    }
    function applyPreset(preset) {
      setBusyForm((f) => ({
        ...f,
        title: preset.label,
        startTime: preset.startTime,
        endTime: preset.endTime,
        category: preset.category,
        date: selDay,
      }));
      setBusyModal("new");
    }

    const selEvents = getDayEvents(selDay);
    const selBusy = getBusyForDay(selDay);
    const selTasks = getTasksForDay(selDay);
    const catClr = (id) =>
      (BUSY_CATEGORIES.find((c) => c.id === id) || { clr: C.muted }).clr;
    const selectedCalendarDay = getCalendarDay(selDay);
    const renderDots = (calendarDay, maxDots = 3) => {
      const dots = [];
      if (calendarDay.hasTasks) dots.push({ id: "tasks", color: C.amber });
      if (calendarDay.recoveryStatus === "low")
        dots.push({ id: "recovery", color: C.red });
      if (calendarDay.completionRate >= 80)
        dots.push({ id: "completion", color: C.sage });
      if (calendarDay.hasWorkout)
        dots.push({ id: "workout", color: "#4D7EA8" });
      return dots.slice(0, maxDots);
    };

    // Merge events + busy blocks + tasks into a single time-sorted list
    // Tasks float to the top (sortMins=-1) since they typically have no time
    const allDayEvents = selEvents.filter((e) => e.allDay);
    const allItems = [
      ...selEvents
        .filter((e) => !e.allDay)
        .map((e) => ({
          ...e,
          kind: "event",
          sortMins: (e.startHour || 0) * 60,
        })),
      ...selBusy.map((b) => ({
        ...b,
        kind: "busy",
        sortMins: timeToMins(b.startTime),
      })),
      ...selTasks.map((t) => ({ ...t, kind: "task", sortMins: -1 })),
    ].sort((a, b) => a.sortMins - b.sortMins);

    return (
      <div style={S.body}>
        <div style={{ ...S.card, marginBottom: 10, padding: "14px 14px 12px" }}>
          <div style={{ ...S.row, marginBottom: 10, alignItems: "center" }}>
            <button style={S.btnGhost} onClick={() => moveCalendar(-1)}>
              Prev
            </button>
            <button
              style={{
                background: "none",
                border: "none",
                color: C.tx,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={() =>
                setCalendarViewMode((mode) =>
                  mode === "week" ? "month" : "week",
                )
              }
            >
              {monthHeaderLabel} {calendarViewMode === "month" ? "▲" : "▼"}
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                style={{ ...S.btnGhost, fontSize: 11, padding: "6px 10px" }}
                onClick={resetCalendarToToday}
              >
                Today
              </button>
              <button style={S.btnGhost} onClick={() => moveCalendar(1)}>
                Next
              </button>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,minmax(0,1fr))",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div
                key={label}
                style={{
                  fontSize: 10,
                  color: C.muted,
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            onTouchStart={handleCalendarTouchStart}
            onTouchEnd={handleCalendarTouchEnd}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,minmax(0,1fr))",
              gap: 6,
            }}
          >
            {(calendarViewMode === "month"
              ? monthGridDays
              : displayedWeekDays
            ).map((dayDate) => {
              const dateStr = formatDateKey(dayDate);
              const calendarDay = getCalendarDay(dateStr);
              const isSelected = dateStr === selDay;
              const isToday = dateStr === TODAY;
              const isOutsideMonth =
                calendarViewMode === "month"
                  ? dayDate.getMonth() !== displayedMonthStart.getMonth()
                  : dayDate.getMonth() !== weekReferenceMonth;
              const dots = renderDots(
                calendarDay,
                calendarViewMode === "month" ? 2 : 4,
              );
              return (
                <button
                  key={dateStr}
                  onClick={() => selectCalendarDate(dateStr)}
                  style={{
                    minHeight: calendarViewMode === "month" ? 74 : 86,
                    borderRadius: 14,
                    border: `1px solid ${isSelected ? C.navy : isToday ? C.sage : C.bd}`,
                    background: isSelected ? C.navyL : C.card,
                    color: isOutsideMonth ? C.muted : C.tx,
                    cursor: "pointer",
                    padding:
                      calendarViewMode === "month" ? "8px 6px" : "10px 6px",
                    opacity: isOutsideMonth ? 0.7 : 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      fontSize: calendarViewMode === "month" ? 20 : 11,
                      fontWeight: calendarViewMode === "month" ? 700 : 600,
                    }}
                  >
                    {calendarViewMode === "month"
                      ? calendarDay.dayNumber
                      : formatDate(dateStr, "weekdayShort")}
                  </div>
                  {calendarViewMode === "week" && (
                    <div
                      style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}
                    >
                      {calendarDay.dayNumber}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      justifyContent: "center",
                      minHeight: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {dots.map((dot) => (
                      <span
                        key={dot.id}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: dot.color,
                          display: "inline-block",
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Day header + actions */}
        <div style={{ ...S.row, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
              {formatDate(selDay, "primary")}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              {selectedCalendarDay.completionRate}% complete
              {selectedCalendarDay.recoveryStatus === "low"
                ? " · recovery low"
                : ""}
              {selectedCalendarDay.hasWorkout ? " · workout logged" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button
              style={{ ...S.btnGhost, fontSize: 11, padding: "6px 10px" }}
              onClick={() => openTab("home", { calendarFocusDay: selDay })}
            >
              Open Daily
            </button>
            {googleConnected && (
              <button style={S.btnSmall(C.navy)} onClick={syncGoogleCal}>
                Sync
              </button>
            )}
            <button
              style={S.btnSmall(C.amber)}
              onClick={() => {
                setBusyForm((f) => ({ ...f, date: selDay }));
                setBusyModal("new");
              }}
            >
              + Busy
            </button>
            <button
              style={S.btnSmall(C.sage)}
              onClick={() => setCalModal("new")}
            >
              + Event
            </button>
          </div>
        </div>
      </div>}
      {showActivationChecklist&&<SetupCard
        C={C}
        S={S}
        activationChecklist={growthState.activationChecklist}
        onOpenCheckIn={()=>setShowMorningCheckin(true)}
        onOpenBrainDump={openBrainDump}
      />}
      {(shouldShowInstallCta||needsInstallHelp)&&!isInstalled&&<div style={{...S.card,padding:'12px 14px'}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Install</div>
        <div style={{fontSize:11,color:C.tx2,lineHeight:1.4,marginBottom:shouldShowInstallCta?10:0}}>{installHelpText}</div>
        {shouldShowInstallCta&&<button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={openInstallPrompt}>Install</button>}
      </div>}
      <DayCard
        C={C}
        S={S}
        dailyExecutionEntry={dailyExecutionEntry}
        selectedDateLabel={activeDateParts?formatDate(activeDate,'primary'):'Today'}
        isViewingToday={isViewingToday}
        updateTask={updatePriorityTask}
        moveTask={movePriorityTask}
        removeTask={removePriorityTask}
        addTask={addPriorityTask}
        startDay={()=>setDailyExecutionMode('execution')}
      />
      <QuickActions
        C={C}
        S={S}
        metrics={homeMetrics}
        shouldPromptWorkoutDecision={shouldPromptWorkoutDecision}
        scheduledTodayWorkout={scheduledTodayWorkout}
        recoveryWorkoutOption={recoveryWorkoutOption}
        handleWorkoutDecision={handleWorkoutDecision}
        mealTitle={mealCardTitle}
        mealSubtitle={mealCardSubtitle}
        onMealAction={()=>openTab('meals')}
        workoutTitle={workoutCardTitle}
        workoutDuration={workoutCardDuration}
        workoutCta={wktDone?'View':'Start'}
        onWorkoutAction={openTodayWorkoutAction}
        taskTitle={taskCardTitle}
        taskMeta={taskCardMeta}
        taskCta="Open"
        onTaskAction={()=>openTab('tasks',{taskTab:'next'})}
        showTaskDone={!!nextTaskItem}
        onTaskDone={()=>nextTaskItem&&toggleTaskDone(nextTaskItem.id)}
        onOpenCheckIn={()=>setShowMorningCheckin(true)}
        onOpenBrainDump={openBrainDump}
        onOpenCalendar={()=>openTab('calendar',{calendarFocusDay:activeDate,calendarViewMode:'week',calendarWeekIndex:getWeekIndexForDate(activeDate,TODAY),calendarMonthIndex:getMonthIndexForDate(activeDate,TODAY)})}
      />

        {/* Quick busy presets */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 500,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Quick busy blocks
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {BUSY_PRESETS.map((p) => (
              <button
                key={p.label}
                style={{
                  ...S.btnGhost,
                  fontSize: 10,
                  padding: "5px 10px",
                  color: C.tx,
                }}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Week patterns */}
        {Object.keys(weekPatterns || {}).length > 0 && (
          <div style={{ ...S.card, marginBottom: 10, padding: "10px 14px" }}>
            <div
              style={{
                fontSize: 10,
                color: C.muted,
                fontWeight: 500,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Saved patterns
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {Object.keys(weekPatterns).map((name) => (
                <button
                  key={name}
                  style={S.btnSmall(C.navy)}
                  onClick={() => applyWeekPattern(name, selDay)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Google hint */}
        {!googleConnected && (
          <ConnectGoogle
            onConnect={() => openTab("settings", { settingsSection: "google" })}
          />
        )}

        {/* All-day events */}
        {allDayEvents.length > 0 && (
          <div style={{ ...S.card, marginBottom: 8 }}>
            <div
              style={{
                fontSize: 10,
                color: C.muted,
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              All Day
            </div>
            {allDayEvents.map((ev, i) => (
              <div
                key={ev.id}
                style={{
                  ...S.row,
                  padding: "7px 0",
                  borderBottom:
                    i < allDayEvents.length - 1
                      ? `0.5px solid ${C.bd}`
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 44,
                    flexShrink: 0,
                    fontSize: 9,
                    color: C.muted,
                    textAlign: "center",
                    paddingTop: 2,
                  }}
                >
                  All day
                </div>
                <div
                  style={{
                    flex: 1,
                    background: ev.color || C.navy,
                    borderRadius: 8,
                    padding: "7px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ fontSize: 12, fontWeight: 600, color: C.white }}
                  >
                    {ev.title}
                  </div>
                  {!ev.local && (
                    <span
                      style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}
                    >
                      Google
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Time list */}
        {allItems.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 0",
              color: C.muted,
              fontSize: 13,
            }}
          >
            No events, tasks, or busy blocks. Use the buttons above to add.
          </div>
        ) : (
          <div style={S.card}>
            {allItems.map((item, i) => {
              const isLast = i === allItems.length - 1;
              if (item.kind === "task") {
                const priBorder =
                  item.priority === 3
                    ? C.red
                    : item.priority === 2
                      ? C.amber
                      : C.sage;
                return (
                  <div
                    key={item.id}
                    style={{
                      ...S.row,
                      padding: "9px 0",
                      borderBottom: isLast ? "none" : `0.5px solid ${C.bd}`,
                      alignItems: "center",
                      opacity: item.done ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        flexShrink: 0,
                        fontSize: 9,
                        color: C.muted,
                        textAlign: "center",
                        paddingTop: 2,
                      }}
                    >
                      Task
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: C.surf,
                        borderRadius: 8,
                        padding: "7px 10px",
                        borderLeft: `3px solid ${priBorder}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: C.tx,
                            textDecoration: item.done ? "line-through" : "none",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.text}
                        </div>
                        {item.priority > 1 && (
                          <div
                            style={{
                              fontSize: 9,
                              color: priBorder,
                              marginTop: 1,
                            }}
                          >
                            {"!".repeat(item.priority)} priority
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          updateProfile((p) => ({
                            ...p,
                            taskHistory: p.taskHistory.map((t) =>
                              t.id === item.id
                                ? {
                                    ...t,
                                    done: !t.done,
                                    status: !t.done ? "done" : "active",
                                    updatedAt: new Date().toISOString(),
                                  }
                                : t,
                            ),
                          }))
                        }
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          border: `1.5px solid ${item.done ? C.sage : C.bd}`,
                          background: item.done ? C.sage : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {item.done && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="var(--white)"
                          >
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              }
              if (item.kind === "busy") {
                const cat = BUSY_CATEGORIES.find(
                  (c) => c.id === item.category,
                ) || { clr: C.muted, label: item.category };
                return (
                  <div
                    key={item.id}
                    style={{
                      ...S.row,
                      padding: "9px 0",
                      borderBottom: isLast ? "none" : `0.5px solid ${C.bd}`,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ width: 44, flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: C.muted }}>
                        {
                          fmtTimeRange(item.startTime, item.endTime).split(
                            " – ",
                          )[0]
                        }
                      </div>
                      <div style={{ fontSize: 9, color: C.muted }}>
                        {
                          fmtTimeRange(item.startTime, item.endTime).split(
                            " – ",
                          )[1]
                        }
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: C.surf,
                        borderRadius: 8,
                        padding: "7px 10px",
                        borderLeft: `3px solid ${cat.clr}`,
                      }}
                    >
                      <div style={{ ...S.row }}>
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: C.tx,
                            }}
                          >
                            {item.title}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: C.muted,
                              marginTop: 1,
                            }}
                          >
                            {fmtTimeRange(item.startTime, item.endTime)} ·{" "}
                            <span style={{ color: cat.clr }}>{cat.label}</span>
                            {item.recurring && " · repeats"}
                          </div>
                          {item.notes && (
                            <div
                              style={{
                                fontSize: 10,
                                color: C.muted,
                                marginTop: 2,
                              }}
                            >
                              {item.notes}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => deleteBusyBlock(item.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: C.muted,
                            fontSize: 14,
                            cursor: "pointer",
                            padding: "0 0 0 8px",
                          }}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  style={{
                    ...S.row,
                    padding: "9px 0",
                    borderBottom: isLast ? "none" : `0.5px solid ${C.bd}`,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      flexShrink: 0,
                      fontSize: 10,
                      color: C.muted,
                      paddingTop: 4,
                    }}
                  >
                    {(() => {
                      const h = item.startHour;
                      return `${h > 12 ? h - 12 : h || 12}${h >= 12 ? "pm" : "am"}`;
                    })()}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: item.color || C.sage,
                      borderRadius: 8,
                      padding: "7px 10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.white,
                        }}
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: 10, color: C.whiteSoft4 }}>
                        {item.durationMins}min
                      </div>
                    </div>
                    {item.local && (
                      <button
                        onClick={() => deleteEvent(selDay, item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.whiteSoft5,
                          fontSize: 14,
                          cursor: "pointer",
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Busy block summary for week (below day view) */}
        {selBusy.length > 0 && (
          <div style={{ ...S.card, marginTop: 4 }}>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>
                Busy today
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>
                {selBusy.length} block{selBusy.length > 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Free windows:{" "}
              {(() => {
                const sorted = selBusy.sort(
                  (a, b) => timeToMins(a.startTime) - timeToMins(b.startTime),
                );
                const windows = [];
                let cursor = 480; // 8am
                for (const b of sorted) {
                  const sm = timeToMins(b.startTime);
                  if (sm - cursor >= 30)
                    windows.push(`${minsToTime(cursor)}–${minsToTime(sm)}`);
                  cursor = Math.max(cursor, timeToMins(b.endTime));
                }
                if (1080 - cursor >= 30)
                  windows.push(`${minsToTime(cursor)}–6pm`); // up to 6pm
                return windows.length ? windows.join(", ") : "None today";
              })()}
            </div>
          </div>
        )}

        {/* Save pattern prompt */}
        <div style={{ ...S.card, marginTop: 4, padding: "10px 14px" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: C.tx,
              marginBottom: 8,
            }}
          >
            Save this week as a pattern
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <FieldInput
              value={patternName}
              onChange={(e) => setPatternName(e.target.value)}
              placeholder="Pattern name (e.g. Typical Mon)"
              style={{ ...S.inp, flex: 1, padding: "7px 10px" }}
            />
            <button
              style={S.btnSmall(C.navy)}
              onClick={() => saveWeekPattern(selDay)}
            >
              Save
            </button>
          </div>
        </div>

        {/* Add Busy Block modal */}
        {busyModal === "new" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: C.scrim,
              zIndex: 500,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                background: C.card,
                borderRadius: "20px 20px 0 0",
                padding: "24px 16px",
                width: "100%",
                maxWidth: 430,
                margin: "0 auto",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.tx,
                  marginBottom: 16,
                }}
              >
                Add Busy Block
              </div>
              <span style={S.lbl}>Title</span>
              <FieldInput
                value={busyForm.title}
                onChange={(e) =>
                  setBusyForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Team standup"
                style={{ ...S.inp, marginBottom: 8 }}
                autoFocus
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={S.lbl}>Start time</span>
                  <FieldInput
                    type="time"
                    value={busyForm.startTime}
                    onChange={(e) =>
                      setBusyForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                    style={S.inp}
                  />
                </div>
                <div>
                  <span style={S.lbl}>End time</span>
                  <FieldInput
                    type="time"
                    value={busyForm.endTime}
                    onChange={(e) =>
                      setBusyForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                    style={S.inp}
                  />
                </div>
              </div>
              <span style={S.lbl}>Category</span>
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {BUSY_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() =>
                      setBusyForm((f) => ({ ...f, category: cat.id }))
                    }
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: `1.5px solid ${busyForm.category === cat.id ? cat.clr : C.bd}`,
                      background:
                        busyForm.category === cat.id ? cat.clr : "transparent",
                      color: busyForm.category === cat.id ? C.white : C.tx,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.tx }}>
                  Recurring (same day each week)
                </span>
                <button
                  onClick={() =>
                    setBusyForm((f) => ({ ...f, recurring: !f.recurring }))
                  }
                  style={{
                    width: 40,
                    height: 24,
                    borderRadius: 12,
                    background: busyForm.recurring ? C.sage : C.surf,
                    border: `1px solid ${C.bd}`,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: C.white,
                      position: "absolute",
                      top: 2,
                      transition: "left 0.2s",
                      left: busyForm.recurring ? "18px" : "2px",
                    }}
                  />
                </button>
              </div>
              {!busyForm.recurring && (
                <>
                  <span style={S.lbl}>Date</span>
                  <FieldInput
                    type="date"
                    value={busyForm.date}
                    onChange={(e) =>
                      setBusyForm((f) => ({ ...f, date: e.target.value }))
                    }
                    style={{ ...S.inp, marginBottom: 8 }}
                  />
                </>
              )}
              {busyForm.recurring && (
                <>
                  <span style={S.lbl}>Day of week</span>
                  <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d, i) => (
                      <button
                        key={i}
                        onClick={() => setBusyForm((f) => ({ ...f, dow: i }))}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          border: `1.5px solid ${busyForm.dow === i ? C.sage : C.bd}`,
                          background:
                            busyForm.dow === i ? C.sage : "transparent",
                          color: busyForm.dow === i ? C.white : C.tx,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <span style={S.lbl}>Notes (optional)</span>
              <FieldInput
                value={busyForm.notes}
                onChange={(e) =>
                  setBusyForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional context..."
                style={{ ...S.inp, marginBottom: 14 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btnSolid(C.amber)} onClick={addBusyBlock}>
                  Add Block
                </button>
                <button
                  style={{ ...S.btnGhost, flex: 1 }}
                  onClick={() => setBusyModal(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Event modal */}
        {calModal === "new" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: C.scrim,
              zIndex: 500,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                background: C.card,
                borderRadius: "20px 20px 0 0",
                padding: "24px 16px",
                width: "100%",
                maxWidth: 430,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.tx,
                  marginBottom: 16,
                }}
              >
                New Event — {selDay}
              </div>
              <FieldInput
                value={calForm.title}
                onChange={(e) =>
                  setCalForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Event title"
                style={{ ...S.inp, marginBottom: 8 }}
                autoFocus
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div>
                  <span style={S.lbl}>Start hour</span>
                  <FieldInput
                    type="number"
                    min={0}
                    max={23}
                    value={calForm.hour}
                    onChange={(e) =>
                      setCalForm((f) => ({
                        ...f,
                        hour: parseInt(e.target.value) || 9,
                      }))
                    }
                    style={S.inp}
                  />
                </div>
                <div>
                  <span style={S.lbl}>Duration (min)</span>
                  <FieldInput
                    type="number"
                    min={15}
                    step={15}
                    value={calForm.dur}
                    onChange={(e) =>
                      setCalForm((f) => ({
                        ...f,
                        dur: parseInt(e.target.value) || 60,
                      }))
                    }
                    style={S.inp}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btnSolid(C.sage)} onClick={createLocalEvent}>
                  Add Event
                </button>
                <button
                  style={{ ...S.btnGhost, flex: 1 }}
                  onClick={() => setCalModal(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function FinanceScreen({ activeView = "overview", onViewChange = () => {} }) {
    const localFinView = FINANCE_VIEW_IDS.includes(activeView)
      ? activeView
      : "overview";
    const [editTxId, setEditTxId] = useState(null);
    const [finOverviewOpen, setFinOverviewOpen] = useState({
      accounts: false,
      spending: false,
    });
    const accountTypeLabel = (type) =>
      ACCOUNT_TYPE_OPTIONS.find((option) => option.id === type)?.label ||
      "Other";
    const getTransactionAccountLabel = (tx) => {
      const account = financialAccountMap.get(tx.accountId);
      if (account) return formatAccountLabel(account);
      return tx.accountId
        ? String(tx.accountId).replace(/_/g, " ")
        : "No account";
    };
    const TransactionRow = ({
      transaction,
      showEditButton = false,
      isEditing = false,
      onToggleEdit,
    }) => {
      const cat = financeCategoryMap.get(transaction.category) || {
        clr: C.muted,
        label: "Other",
      };
      return (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              flex: "1 1 180px",
            }}
          >
            {!transaction.isReviewed && (
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.amber,
                  flexShrink: 0,
                  marginTop: 5,
                }}
              />
            )}
            <div
              style={{
                fontSize: 13,
                color: C.tx,
                fontWeight: 500,
                lineHeight: 1.35,
                minWidth: 0,
                overflowWrap: "anywhere",
              }}
            >
              {transaction.merchant}
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              textAlign: "right",
              minWidth: 84,
              flex: "0 0 auto",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: transaction.isCredit ? C.sage : C.tx,
                whiteSpace: "nowrap",
              }}
            >
              {transaction.isCredit ? "+" : "-"}
              {fmtMoneyD(transaction.amount)}
            </div>
            {showEditButton && (
              <button
                onClick={onToggleEdit}
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  fontSize: 10,
                  cursor: "pointer",
                  padding: 0,
                  marginTop: 2,
                }}
              >
                {isEditing ? "close" : "edit"}
              </button>
            )}
          </div>
          <div
            style={{
              width: "100%",
              fontSize: 10,
              color: C.muted,
              lineHeight: 1.4,
              paddingLeft: transaction.isReviewed ? 0 : 12,
              overflowWrap: "anywhere",
            }}
          >
            {formatDate(transaction.date, "monthDayShort")} ·{" "}
            <span style={{ color: cat.clr }}>{cat.label}</span> ·{" "}
            {getTransactionAccountLabel(transaction)}
            {transaction.isTransfer ? " · transfer" : ""}
          </div>
        </div>
      );
    };

    // Filtered transactions
    const visibleTx = useMemo(() => {
      let list = [...(transactions || [])].sort((a, b) =>
        b.date.localeCompare(a.date),
      );
      if (finSearch)
        list = list.filter((t) =>
          (t.merchant + (t.description || "") + (t.notes || ""))
            .toLowerCase()
            .includes(finSearch.toLowerCase()),
        );
      if (finCatFilter) list = list.filter((t) => t.category === finCatFilter);
      return list;
    }, [transactions, finSearch, finCatFilter]);

    const sub = () => {
      const labels = {
        overview: "Overview",
        transactions: "Feed",
        categories: "By Category",
        recurring: "Recurring",
        trends: "Trends",
      };
      return (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {Object.entries(labels).map(([k, v]) => (
            <button
              key={k}
              onClick={() => onViewChange(k)}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 10,
                border: `0.5px solid ${localFinView === k ? C.sage : C.bd}`,
                background: localFinView === k ? C.sageL : "transparent",
                color: localFinView === k ? C.sageDk : C.muted,
                fontSize: 11,
                fontWeight: localFinView === k ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      );
    };

    // Sticky + Transaction button rendered in every sub-view header
    const addBtn = (
      <button
        style={{
          ...S.btnSmall(C.sage),
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
        }}
        onClick={() => setShowAddTx(true)}
      >
        + Transaction
      </button>
    );

    // ── OVERVIEW ─────────────────────────────────────────────────────
    if (localFinView === "overview") {
      const totalBalance = activeFinancialAccounts
        .filter((a) => a.currentBalance != null)
        .reduce((s, a) => s + a.currentBalance, 0);
      const hasBalances = activeFinancialAccounts.some(
        (a) => a.currentBalance != null,
      );
      const topCats = catSpend.slice(0, 3);
      return (
        <div style={S.body}>
          {/* Header row with sub-tabs and + button */}
          <div style={{ ...S.row, marginBottom: 10, gap: 8 }}>
            <div style={{ flex: 1, overflowX: "auto" }}>{sub()}</div>
            {addBtn}
          </div>
          {/* Quick add templates */}
          <div style={S.card}>
            <span style={S.lbl}>Quick Add</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {QUICK_MERCHANTS.map((m) => (
                <button
                  key={m.label}
                  onClick={() => quickAddMerchant(m)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 20,
                    border: `0.5px solid ${C.bd}`,
                    background: C.surf,
                    color: C.tx,
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
              <button
                onClick={duplicateLastTx}
                style={{
                  padding: "6px 10px",
                  borderRadius: 20,
                  border: `0.5px solid ${C.navy}`,
                  background: "transparent",
                  color: C.navy,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ↩ Duplicate last
              </button>
            </div>
          </div>
          <div style={S.card}>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <span style={S.lbl}>Categories</span>
              <button
                style={{ ...S.btnGhost, fontSize: 11, padding: "4px 8px" }}
                onClick={addCategory}
              >
                + Add
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {financeCategories
                .filter((category) => category.id !== "transfer")
                .map((category) => (
                  <button
                    key={category.id}
                    onClick={() => editCategory(category)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 20,
                      border: `0.5px solid ${category.clr}`,
                      background: C.surf,
                      color: C.tx,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {category.label}
                  </button>
                ))}
            </div>
          </div>
          {/* Accounts */}
          <CollapsibleCard
            title="Accounts"
            summary={
              hasBalances
                ? `${fmtMoney(totalBalance)} total · ${activeFinancialAccounts.length} account${activeFinancialAccounts.length !== 1 ? "s" : ""}`
                : `${activeFinancialAccounts.length} account${activeFinancialAccounts.length !== 1 ? "s" : ""}`
            }
            open={finOverviewOpen.accounts}
            onToggle={() =>
              setFinOverviewOpen((s) => ({ ...s, accounts: !s.accounts }))
            }
          >
            {activeFinancialAccounts.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: "8px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <div style={{ ...S.row, alignItems: "flex-start", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: C.tx,
                        fontWeight: 500,
                        lineHeight: 1.3,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {formatAccountLabel(a)}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {accountTypeLabel(a.type)}
                      {a.startingBalance != null
                        ? ` · start ${fmtMoney(a.startingBalance)}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {a.currentBalance != null ? (
                      <div
                        style={{ fontSize: 14, fontWeight: 700, color: C.sage }}
                      >
                        {fmtMoney(a.currentBalance)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: C.muted }}>—</div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                        marginTop: 4,
                      }}
                    >
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          color: C.muted,
                          fontSize: 10,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => openEditAccount(a)}
                      >
                        edit
                      </button>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          color: C.red,
                          fontSize: 10,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => archiveAccount(a.id)}
                      >
                        archive
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {activeFinancialAccounts.length === 0 && (
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                No active accounts yet. Add one to start tracking transactions.
              </div>
            )}
            {archivedFinancialAccounts.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `0.5px solid ${C.bd}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.7px",
                    color: C.muted,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Archived
                </div>
                {archivedFinancialAccounts.map((a) => (
                  <div
                    key={a.id}
                    style={{ ...S.row, padding: "6px 0", gap: 8 }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.tx,
                          lineHeight: 1.3,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {formatAccountLabel(a)}
                      </div>
                      <div
                        style={{ fontSize: 10, color: C.muted, marginTop: 2 }}
                      >
                        {accountTypeLabel(a.type)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          color: C.navy,
                          fontSize: 10,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => restoreAccount(a.id)}
                      >
                        restore
                      </button>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          color: C.red,
                          fontSize: 10,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => deleteAccount(a.id)}
                      >
                        delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              style={{ ...S.btnGhost, width: "100%", marginTop: 10 }}
              onClick={openAddAccount}
            >
              + Add account
            </button>
            {hasBalances && (
              <div
                style={{
                  ...S.row,
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `0.5px solid ${C.bd}`,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>
                  Total
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
                  {fmtMoney(totalBalance)}
                </span>
              </div>
            )}
            {!hasBalances && activeFinancialAccounts.length > 0 && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                Set balances in Settings → Finance if you want totals here.
              </div>
            )}
          </CollapsibleCard>
          {/* Spend summary */}
          <CollapsibleCard
            title="Spending"
            summary={`${fmtMoney(weekSpend)} this week · ${fmtMoney(monthSpend)} this month`}
            open={finOverviewOpen.spending}
            onToggle={() =>
              setFinOverviewOpen((s) => ({ ...s, spending: !s.spending }))
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {[
                { l: "This week", v: weekSpend },
                { l: "This month", v: monthSpend },
              ].map(({ l, v }) => (
                <div
                  key={l}
                  style={{
                    background: C.surf,
                    borderRadius: 10,
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}
                  >
                    {l}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
                    {fmtMoney(v)}
                  </div>
                </div>
              ))}
            </div>
            {topCats.length > 0 &&
              topCats.map((c) => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <div style={{ ...S.row, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: C.tx }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>
                      {fmtMoney(c.total)}
                    </span>
                  </div>
                  <ProgressBar value={c.total} max={monthSpend} color={c.clr} />
                </div>
              ))}
          </CollapsibleCard>
          {/* Alerts */}
          {(unreviewed > 0 || billsDueSoon.length > 0) && (
            <div style={S.card}>
              <span style={S.lbl}>Attention</span>
              {unreviewed > 0 && (
                <div
                  style={{
                    ...S.row,
                    padding: "8px 0",
                    borderBottom: billsDueSoon.length
                      ? `0.5px solid ${C.bd}`
                      : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: C.tx }}>
                    {unreviewed} unreviewed transaction
                    {unreviewed > 1 ? "s" : ""}
                  </span>
                  <button
                    style={S.btnSmall(C.amber)}
                    onClick={() => {
                      setFinCatFilter(null);
                      onViewChange("transactions");
                    }}
                  >
                    Review
                  </button>
                </div>
              )}
              {billsDueSoon.map((r) => (
                <div
                  key={r.merchant}
                  style={{
                    ...S.row,
                    padding: "8px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: C.tx }}>
                      {r.merchant}
                    </div>
                    <div style={{ fontSize: 10, color: C.amber }}>
                      Due {formatDate(r.nextExpectedDate, "monthDayLong")} ·{" "}
                      {fmtMoney(r.averageAmount)}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: C.muted }}>
                    {r.frequency}
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* Recent transactions */}
          {(transactions || []).length > 0 && (
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Recent</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11, padding: "4px 8px" }}
                  onClick={() => onViewChange("transactions")}
                >
                  All
                </button>
              </div>
              {[...(transactions || [])]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)
                .map((t, i, items) => (
                  <div
                    key={t.transactionId}
                    style={{
                      padding: "8px 0",
                      borderBottom:
                        i < items.length - 1 ? `0.5px solid ${C.bd}` : "none",
                    }}
                  >
                    <TransactionRow transaction={t} />
                  </div>
                ))}
            </div>
          )}
          {(transactions || []).length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "30px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No transactions yet.
              <br />
              Import a CSV or add manually.
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
                <button
                  style={S.btnSmall(C.navy)}
                  onClick={() => setShowImport(true)}
                >
                  Import CSV
                </button>
                <button
                  style={S.btnSmall(C.sage)}
                  onClick={() => setShowAddTx(true)}
                >
                  + Manual
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── TRANSACTIONS ──────────────────────────────────────────────────
    if (localFinView === "transactions") {
      return (
        <div style={S.body}>
          <div style={{ ...S.row, marginBottom: 8, gap: 8 }}>
            <div style={{ flex: 1, overflowX: "auto" }}>{sub()}</div>
            {addBtn}
          </div>
          <div style={{ ...S.row, marginBottom: 8, gap: 6 }}>
            <FieldInput
              value={finSearch}
              onChange={(e) => setFinSearch(e.target.value)}
              placeholder="Search transactions..."
              style={{ ...S.inp, flex: 1, padding: "7px 10px" }}
            />
            <button
              style={S.btnSmall(C.navy)}
              onClick={() => setShowImport(true)}
            >
              Import CSV
            </button>
          </div>
          {/* Category filter chips */}
          <div
            style={{
              display: "flex",
              gap: 4,
              overflowX: "auto",
              marginBottom: 10,
              paddingBottom: 2,
            }}
          >
            <button
              onClick={() => setFinCatFilter(null)}
              style={{
                flexShrink: 0,
                padding: "4px 10px",
                borderRadius: 20,
                border: `0.5px solid ${!finCatFilter ? C.sage : C.bd}`,
                background: !finCatFilter ? C.sageL : "transparent",
                color: !finCatFilter ? C.sageDk : C.muted,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {financeCategories.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  setFinCatFilter(finCatFilter === c.id ? null : c.id)
                }
                style={{
                  flexShrink: 0,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: `0.5px solid ${finCatFilter === c.id ? c.clr : C.bd}`,
                  background: finCatFilter === c.id ? c.clr : "transparent",
                  color: finCatFilter === c.id ? C.white : C.muted,
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {visibleTx.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No transactions match.
            </div>
          )}
          <div style={S.card}>
            {visibleTx.map((t, i) => {
              const isEdit = editTxId === t.transactionId;
              return (
                <div
                  key={t.transactionId}
                  style={{
                    padding: "10px 0",
                    borderBottom:
                      i < visibleTx.length - 1 ? `0.5px solid ${C.bd}` : "none",
                  }}
                >
                  <TransactionRow
                    transaction={t}
                    showEditButton
                    isEditing={isEdit}
                    onToggleEdit={() =>
                      setEditTxId(isEdit ? null : t.transactionId)
                    }
                  />
                  {isEdit && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px",
                        background: C.surf,
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                          marginBottom: 8,
                        }}
                      >
                        {financeCategories.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              updateTxCategory(t.transactionId, c.id, true);
                              setEditTxId(null);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: `1px solid ${t.category === c.id ? c.clr : C.bd}`,
                              background:
                                t.category === c.id ? c.clr : "transparent",
                              color: t.category === c.id ? C.white : C.tx,
                              fontSize: 10,
                              cursor: "pointer",
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {!t.isReviewed && (
                          <button
                            style={S.btnSmall(C.sage)}
                            onClick={() => {
                              reviewTx(t.transactionId);
                              setEditTxId(null);
                            }}
                          >
                            Mark reviewed
                          </button>
                        )}
                        <button
                          style={{
                            ...S.btnGhost,
                            fontSize: 11,
                            color: C.red,
                            borderColor: C.red,
                          }}
                          onClick={() => {
                            deleteTx(t.transactionId);
                            setEditTxId(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── CATEGORIES ────────────────────────────────────────────────────
    if (localFinView === "categories") {
      const prev = formatDateKey(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
      );
      const prevEnd = formatDateKey(
        new Date(now.getFullYear(), now.getMonth(), 0),
      );
      const prevTx = spendTx.filter((t) => t.date >= prev && t.date <= prevEnd);
      const prevSpend = prevTx.reduce((s, t) => s + t.amount, 0);
      return (
        <div style={S.body}>
          <div style={{ ...S.row, marginBottom: 10, gap: 8 }}>
            <div style={{ flex: 1, overflowX: "auto" }}>{sub()}</div>
            {addBtn}
          </div>
          <div style={{ ...S.row, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
              {formatDate(monthStart, "monthYear")}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
              {fmtMoney(monthSpend)}
            </span>
          </div>
          {catSpend.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No spending data yet.
            </div>
          )}
          {catSpend.map((c) => (
            <div key={c.id} style={{ ...S.card, marginBottom: 8 }}>
              <div style={{ ...S.row, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: c.clr,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.tx }}>
                    {c.label}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                    {fmtMoney(c.total)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {monthSpend > 0
                      ? Math.round((c.total / monthSpend) * 100)
                      : 0}
                    % of spend
                  </div>
                </div>
              </div>
              <ProgressBar value={c.total} max={monthSpend} color={c.clr} />
              <button
                style={{
                  ...S.btnGhost,
                  marginTop: 8,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                onClick={() => {
                  setFinCatFilter(c.id);
                  onViewChange("transactions");
                }}
              >
                View transactions
              </button>
            </div>
          ))}
          {prevSpend > 0 && (
            <div style={{ ...S.card, background: C.surf }}>
              <span style={S.lbl}>Prior month</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
                {fmtMoney(prevSpend)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: monthSpend > prevSpend ? C.red : C.sage,
                  marginTop: 4,
                }}
              >
                {monthSpend > prevSpend ? "+" : `-`}
                {fmtMoney(Math.abs(monthSpend - prevSpend))} vs last month
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── RECURRING ─────────────────────────────────────────────────────
    if (localFinView === "recurring") {
      return (
        <div style={S.body}>
          <div style={{ ...S.row, marginBottom: 10, gap: 8 }}>
            <div style={{ flex: 1, overflowX: "auto" }}>{sub()}</div>
            {addBtn}
          </div>
        </div>
        {expanded&&subtasks.map(s=><TaskRow key={s.id} t={s} indent={indent+1}/>)}
      </div>;
    }

    return <div style={S.body}>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {[
          {id:'inbox',label:`Inbox${pendingInbox.length>0?' ('+pendingInbox.length+')':''}`,warn:pendingInbox.length>0},
          {id:'scheduled',label:`Sched`},
          {id:'next',label:`Next${todayTasks.length>0?' ('+todayTasks.length+')':''}`},
          {id:'done',label:`Done`},
          {id:'templates',label:`Templates`},
        ].map(({id,label,warn})=><button key={id} onClick={()=>onTabChange(id)} style={{flex:1,padding:'8px',borderRadius:10,border:`1px solid ${tasksTab===id?(warn?C.amber:C.sage):C.bd}`,background:tasksTab===id?(warn?C.amberL:C.sageL):'transparent',color:tasksTab===id?(warn?C.amberDk:C.sageDk):C.muted,fontSize:11,fontWeight:tasksTab===id?600:400,cursor:'pointer'}}>{label}</button>)}
      </div>

      {tasksTab==='inbox'&&<div>
        {pendingInbox.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:C.muted,fontSize:13}}>
          Inbox is clear.<br/>
          <span style={{fontSize:11}}>Use Brain Dump on Home to capture ideas.</span>
        </div>}
        {pendingInbox.map((item,i)=><div key={item.id} style={{...S.card,marginBottom:8}}>
          <div style={{fontSize:13,color:C.tx,marginBottom:10,lineHeight:1.5}}>{item.text}</div>
          <div style={{fontSize:9,color:C.muted,marginBottom:10}}>{formatDate(item.createdDate,'monthDayShort')}</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button onClick={()=>convertInboxItem(item.id,'task')} style={S.btnSmall(C.sage)}>→ Task</button>
            <button onClick={()=>convertInboxItem(item.id,'finance')} style={S.btnSmall(C.navy)}>→ Finance</button>
            <button onClick={()=>convertInboxItem(item.id,'note')} style={S.btnSmall(C.tx2)}>→ Note</button>
            <button onClick={()=>convertInboxItem(item.id,'delete')} style={{...S.btnGhost,fontSize:11,color:C.muted}}>Clear</button>
          </div>
        </div>)}
        {pendingInbox.length>0&&<button style={{...S.btnGhost,width:'100%',textAlign:'center',fontSize:12,marginTop:4}} onClick={()=>{if(confirm('Clear all inbox items?'))updateProfile(p=>({...p,inboxItems:(p.inboxItems||[]).map(x=>({...x,status:'processed'}))}));}}>Clear all inbox</button>}
      </div>}

      {(tasksTab==='next'||tasksTab==='scheduled')&&<div>
        {overdueTasks.length>0&&<div style={{...S.card,borderColor:C.amber,background:C.amberL,marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:600,color:C.amberDk,marginBottom:4}}>{overdueTasks.length} overdue task{overdueTasks.length>1?'s':''} need a decision</div>
          <div style={{fontSize:11,color:C.amberDk}}>Roll, defer, or dismiss instead of letting them silently pile up.</div>
        </div>}
        <div style={{...S.row,marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:600,color:C.tx}}>{tasksTab==='next'?'Next Up':'Scheduled'}</div>
          <button style={S.btnSmall(C.sage)} onClick={()=>openTaskComposer({bucket:tasksTab==='scheduled'?'scheduled':'next'})}>+ Add</button>
        </div>
        {taskTemplates.length>0&&<div style={{...S.card,marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Task templates</div>
          <div style={{display:'flex',gap:6,overflowX:'auto'}}>
            {taskTemplates.map(template=><button key={template.id} style={{...S.btnGhost,flexShrink:0,fontSize:10,padding:'6px 9px'}} onClick={()=>addTaskFromTemplate(template)}>{template.name}</button>)}
          </div>
        </div>}
        {dueTodayUnscheduled.length>0&&tasksTab==='next'&&<div style={{...S.card,marginBottom:12}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Scheduling suggestions</div>
          <div style={{display:'grid',gap:8}}>
            {dueTodayUnscheduled.slice(0,3).map(task=><div key={task.id} style={{...S.row,background:C.surf,borderRadius:10,padding:'8px 10px'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{task.text}</div>
                <div style={{fontSize:10,color:C.muted}}>Suggested start: {getSuggestedTaskTime(task)}</div>
              </div>
              <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>scheduleTask(task.id,getSuggestedTaskTime(task))}>Apply</button>
            </div>)}
          </div>
        </div>}
        {tasksTab==='next'&&suggestedByEnergy.length>0&&<div style={{...S.card,marginBottom:12,borderColor:energyHigh?C.sage:energyLow?C.amber:C.bd}}>
          <span style={S.lbl}>Suggested for now</span>
          <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{energyHigh?'Energy is high — tackle something demanding.':energyLow?'Low energy — keep it light.':'Next by priority.'}</div>
          {suggestedByEnergy.map(t=><div key={t.id} style={{...S.row,padding:'6px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:13,color:C.tx,flex:1}}>{t.text}</span>
            <button style={{...S.btnGhost,fontSize:9,padding:'5px 6px',borderColor:C.navy,color:C.navy}} onClick={()=>{setFocusTaskId(t.id);setFocusTmrSec(null);setFocusTmrRunning(false);}}>Focus</button>
          </div>)}
        </div>}
        {showAddTask&&<div style={{...S.card,marginBottom:12}}>
          <FieldInput
            value={taskDraftText}
            allowEnterSubmit
            onChange={e=>setTaskDraftText(e.target.value)}
            onKeyDown={e=>{
              if(e.key!=='Enter'||e.shiftKey||e.altKey||e.ctrlKey||e.metaKey||e.nativeEvent.isComposing)return;
              e.preventDefault();
              addTask();
            }}
            placeholder="Task name..."
            style={{...S.inp,marginBottom:8}}
            autoFocus
          />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <FieldInput type="date" value={newTask.date||TODAY} onChange={e=>setNewTask(n=>({...n,date:e.target.value}))} style={S.inp}/>
            <FieldInput type="time" value={newTask.scheduledTime||''} onChange={e=>setNewTask(n=>({...n,scheduledTime:e.target.value,bucket:e.target.value?'scheduled':n.bucket}))} placeholder="Start time (opt)" style={S.inp}/>
          </div>
          {newTask.scheduledTime&&<FieldInput type="time" value={newTask.endTime||''} onChange={e=>setNewTask(n=>({...n,endTime:e.target.value}))} placeholder="End time (optional)" style={{...S.inp,marginBottom:8}}/>}
          <FieldInput value={newTask.contextTags||''} onChange={e=>setNewTask(n=>({...n,contextTags:e.target.value}))} placeholder="Context tags (comma separated)" style={{...S.inp,marginBottom:8}}/>
          <div style={{...S.row,marginBottom:8}}>
            <span style={{fontSize:11,color:C.muted}}>Priority:</span>
            <div style={{display:'flex',gap:4}}>
              {[1,2,3].map(p=><button key={p} onClick={()=>setNewTask(n=>({...n,priority:p}))} style={{width:28,height:28,borderRadius:6,border:`1.5px solid ${newTask.priority===p?prioClr[p]:C.bd}`,background:newTask.priority===p?prioClr[p]:'transparent',color:newTask.priority===p?C.white:C.muted,fontSize:11,cursor:'pointer'}}>{p}</button>)}
            </div>
          </div>
          <div style={{...S.row,marginBottom:8}}>
            <span style={{fontSize:11,color:C.muted}}>Energy:</span>
            <div style={{display:'flex',gap:4}}>
              {[{id:'high',label:'High',clr:C.sage,bg:C.sageL},{id:'medium',label:'Med',clr:C.amberDk,bg:C.amberL},{id:'low',label:'Low',clr:C.muted,bg:C.surf}].map(({id,label,clr,bg})=><button key={id} onClick={()=>setNewTask(n=>({...n,energyLevel:n.energyLevel===id?null:id}))} style={{padding:'4px 10px',borderRadius:8,border:`1.5px solid ${newTask.energyLevel===id?clr:C.bd}`,background:newTask.energyLevel===id?bg:'transparent',color:newTask.energyLevel===id?clr:C.muted,fontSize:10,cursor:'pointer'}}>{label}</button>)}
            </div>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            {[{id:'next',label:'Next Up'},{id:'scheduled',label:'Scheduled'}].map(bucket=><button key={bucket.id} style={{...S.btnGhost,flex:1,fontSize:10,padding:'6px 8px',borderColor:newTask.bucket===bucket.id?C.sage:C.bd,background:newTask.bucket===bucket.id?C.sageL:'transparent'}} onClick={()=>setNewTask(n=>({...n,bucket:bucket.id}))}>{bucket.label}</button>)}
          </div>
          <div style={{display:'flex',gap:6}}>
            <button style={S.btnSolid(C.sage)} onClick={addTask}>Add Task</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>{setNewTask(createNewTaskDraft(TODAY,{bucket:tasksTab==='scheduled'?'scheduled':'next'}));setTaskDraftText('');setShowAddTask(false);}}>Cancel</button>
          </div>
        </div>}
        {tasksTab==='next'&&todayTasks.length===0&&!showAddTask&&<div style={{textAlign:'center',padding:'30px 0',color:C.muted,fontSize:13}}>No next-up tasks right now. Tap + Add or use a template.</div>}
        {tasksTab==='scheduled'&&futureTasks.length===0&&!showAddTask&&<div style={{textAlign:'center',padding:'30px 0',color:C.muted,fontSize:13}}>Nothing scheduled yet.</div>}
        {tasksTab==='next'&&todayTasks.length>0&&<div style={S.card}>
          {timeBlockedTasks.length>0&&<>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:4,paddingBottom:4,borderBottom:`0.5px solid ${C.bd}`}}>Time-Blocked</div>
            {timeBlockedTasks.map(t=><TaskRow key={t.id} t={t}/>)}
          </>}
          {anytimeTasks.length>0&&<>
            {timeBlockedTasks.length>0&&<div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:'0.5px',textTransform:'uppercase',marginTop:8,marginBottom:4,paddingBottom:4,borderBottom:`0.5px solid ${C.bd}`}}>Anytime</div>}
            {anytimeTasks.map(t=><TaskRow key={t.id} t={t}/>)}
          </>}
        </div>}
        {tasksTab==='scheduled'&&futureTasks.length>0&&<div style={S.card}>
          {futureTasks.map(t=><TaskRow key={t.id} t={t}/>)}
        </div>}
      </div>}

      {tasksTab==='done'&&<div>
        {doneTasks.length===0&&<div style={{textAlign:'center',padding:'30px 0',color:C.muted,fontSize:13}}>Nothing completed yet.</div>}
        {doneTasks.length>0&&<div style={S.card}>
          {doneTasks.slice().reverse().map(t=><TaskRow key={t.id} t={t}/>)}
        </div>}
      </div>}

      {tasksTab==='templates'&&<div>
        <div style={{...S.card,marginBottom:12}}>
          <span style={S.lbl}>New Template</span>
          <FieldInput value={newTmplName} onChange={e=>setNewTmplName(e.target.value)} placeholder="Template name" style={{...S.inp,marginBottom:8}}/>
          <FieldInput value={newTmplSubtasks} onChange={e=>setNewTmplSubtasks(e.target.value)} placeholder="Subtasks (comma separated)" style={{...S.inp,marginBottom:8}}/>
          <FieldInput value={newTmplTags} onChange={e=>setNewTmplTags(e.target.value)} placeholder="Tags (comma separated)" style={{...S.inp,marginBottom:8}}/>
          <div style={{...S.row,marginBottom:8}}>
            <span style={{fontSize:11,color:C.muted}}>Priority:</span>
            <div style={{display:'flex',gap:4}}>
              {[1,2,3].map(p=><button key={p} onClick={()=>setNewTmplPriority(p)} style={{width:28,height:28,borderRadius:6,border:`1.5px solid ${newTmplPriority===p?prioClr[p]:C.bd}`,background:newTmplPriority===p?prioClr[p]:'transparent',color:newTmplPriority===p?C.white:C.muted,fontSize:11,cursor:'pointer'}}>{p}</button>)}
            </div>
          </div>
          <button style={S.btnSolid(C.sage)} onClick={saveNewTemplate}>Save Template</button>
        </div>
        <div style={S.card}>
          <span style={S.lbl}>All Templates</span>
          {taskTemplates.map(tmpl=>{
            const isDefault=DEFAULT_TASK_TEMPLATES.some(d=>d.id===tmpl.id);
            return <div key={tmpl.id} style={{...S.row,padding:'9px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{tmpl.name}</div>
                <div style={{fontSize:10,color:C.muted}}>{(tmpl.subtasks||[]).length} subtask{(tmpl.subtasks||[]).length!==1?'s':''} · Priority {tmpl.priority}</div>
                {(tmpl.contextTags||[]).length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>{tmpl.contextTags.map(tag=><span key={tag} style={S.pill(C.surf,C.tx2)}>{tag}</span>)}</div>}
              </div>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>addTaskFromTemplate(tmpl)}>Use</button>
                {!isDefault&&<button style={{background:'none',border:'none',color:C.red,fontSize:14,cursor:'pointer'}} onClick={()=>deleteTemplate(tmpl.id)}>x</button>}
              </div>
            </div>;
          })}
        </div>
      </div>}
    </div>;
  }

  function CalendarScreen({focusDay,onSelectDay=()=>{}}){
    const selDay=normalizeDateKey(focusDay,TODAY);
    const gestureRef=useRef({x:0,y:0});
    const displayedWeekStart=addWeeksToDate(getWeekStartDate(TODAY),calendarWeekIndex);
    const displayedWeekDays=Array.from({length:7},(_,i)=>addDaysIso(formatDateKey(displayedWeekStart),i)).map(parseDateKey);
    const displayedMonthStart=addMonthsToDate(getMonthStartDate(TODAY),calendarMonthIndex);
    const monthGridStart=getWeekStartDate(displayedMonthStart);
    const monthGridDays=Array.from({length:42},(_,i)=>parseDateKey(addDaysIso(formatDateKey(monthGridStart),i)));
    const activeRangeStart=calendarViewMode==='month'?monthGridStart:displayedWeekStart;
    const activeRangeEnd=calendarViewMode==='month'?monthGridDays[monthGridDays.length-1]:displayedWeekDays[6];
    const weekReferenceMonth=displayedWeekDays[3]?.getMonth();
    const monthHeaderLabel=formatDate(displayedMonthStart,'monthYear');

    function getDayEvents(dateStr){
      return (calendarCache[dateStr]||[]).sort((a,b)=>(a.startHour||0)-(b.startHour||0));
    }
    function getTasksForDay(dateStr){
      return taskHistory.filter(t=>t.date===dateStr&&!t.parentId&&(t.status||'active')!=='dismissed');
    }
    function getCalendarDay(dateStr){
      const parts=getDateParts(dateStr);
      const executionEntry=normalizeDailyExecutionEntry(profile.dailyExecution?.[dateStr],dateStr,top3?.[dateStr]||[]);
      const executionTasks=executionEntry.priorities.filter(task=>task.text.trim());
      const explicitTasks=getTasksForDay(dateStr).filter(task=>!task.done);
      const completedTasks=executionTasks.filter(task=>task.completed).length+getTasksForDay(dateStr).filter(task=>task.done).length;
      const totalTasks=executionTasks.length+getTasksForDay(dateStr).length;
      const completionRate=totalTasks>0?Math.round((completedTasks/totalTasks)*100):0;
      const workoutLogged=workoutHistory.some(entry=>entry.date===dateStr&&(entry.type==='workout'||entry.type==='run'||entry.type==='recovery'));
      const recoveryEntry=compareDateKeys(dateStr,TODAY)>0?null:computeRecoveryState(dailyLogs?.[dateStr],dailyLogs?.[dateStr]?.energyScore??energyScore,dailyLogs?.[dateStr]?.sleepHours??sleepHours);
      return{
        date:dateStr,
        dayOfWeek:parts?.dayOfWeek||'',
        month:parts?.monthName||'',
        dayNumber:parts?.day||0,
        year:parts?.year||new Date().getFullYear(),
        hasTasks:executionTasks.length>0||explicitTasks.length>0,
        hasWorkout:workoutLogged,
        recoveryStatus:recoveryEntry?.level==='Low'?'low':recoveryEntry?'ok':null,
        completionRate,
      };
    }
    function selectCalendarDate(dateStr){
      onSelectDay(dateStr);
      setCalendarWeekIndex(getWeekIndexForDate(dateStr,TODAY));
      setCalendarMonthIndex(getMonthIndexForDate(dateStr,TODAY));
      setCalendarViewMode('week');
      openTab('home',{calendarFocusDay:dateStr});
    }
    function moveCalendar(delta){
      if(calendarViewMode==='month'){
        setCalendarMonthIndex(index=>index+delta);
        return;
      }
      setCalendarWeekIndex(index=>index+delta);
    }
    function resetCalendarToToday(){
      onSelectDay(TODAY);
      setCalendarViewMode('week');
      setCalendarWeekIndex(0);
      setCalendarMonthIndex(0);
    }
    function handleCalendarTouchStart(event){
      const touch=event.touches?.[0];
      if(!touch)return;
      gestureRef.current={x:touch.clientX,y:touch.clientY};
    }
    function handleCalendarTouchEnd(event){
      const touch=event.changedTouches?.[0];
      if(!touch)return;
      const dx=touch.clientX-gestureRef.current.x;
      const dy=touch.clientY-gestureRef.current.y;
      if(calendarViewMode==='week'&&Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){
        moveCalendar(dx<0?1:-1);
      }
      if(calendarViewMode==='month'&&Math.abs(dy)>50&&Math.abs(dy)>Math.abs(dx)){
        moveCalendar(dy<0?1:-1);
      }
    }
    function createLocalEvent(){
      if(!calForm.title.trim())return;
      const event={id:String(Date.now()),title:calForm.title,startHour:calForm.hour,durationMins:calForm.dur,local:true,color:C.sage};
      updateProfile(p=>({...p,calendarCache:{...p.calendarCache,[selDay]:[...(p.calendarCache[selDay]||[]),event]}}));
      setCalForm({title:'',hour:9,dur:60,allDay:false});setCalModal(null);
    }
    function deleteEvent(dateStr,id){
      updateProfile(p=>({...p,calendarCache:{...p.calendarCache,[dateStr]:(p.calendarCache[dateStr]||[]).filter(e=>e.id!==id)}}));
    }
    async function syncGoogleCal(){
      if(!googleConnected){showNotif('Connect Google in Settings first');return;}
      try{
        const start=new Date(activeRangeStart);start.setHours(0,0,0,0);
        const end=new Date(activeRangeEnd);end.setHours(23,59,59,999);
        const resp=await GoogleAPI.listEvents(start.toISOString(),end.toISOString());
        const newCache={...calendarCache};
        for(const ev of resp.items||[]){
          const dateStr=(ev.start?.dateTime||ev.start?.date||'').slice(0,10);if(!dateStr)continue;
          const isAllDay=!!ev.start?.date&&!ev.start?.dateTime;
          const startHour=isAllDay?null:new Date(ev.start.dateTime).getHours();
          const endDt=ev.end?.dateTime?new Date(ev.end.dateTime):null;
          const durationMins=isAllDay?null:(endDt&&ev.start?.dateTime?Math.round((endDt-new Date(ev.start.dateTime))/60000):60);
          const entry={id:ev.id,title:ev.summary||'Event',startHour,durationMins,allDay:isAllDay,color:C.navy,local:false,googleEventId:ev.id};
          if(!newCache[dateStr])newCache[dateStr]=[];
          const idx=newCache[dateStr].findIndex(e=>e.googleEventId===ev.id);
          if(idx>=0)newCache[dateStr][idx]=entry;else newCache[dateStr].push(entry);
        }
        updateProfile({calendarCache:newCache});showNotif('Calendar synced!','success');
      }catch(e){showNotif('Sync failed: '+e.message,'error');}
    }
    function applyPreset(preset){
      setBusyForm(f=>({...f,title:preset.label,startTime:preset.startTime,endTime:preset.endTime,category:preset.category,date:selDay}));
      setBusyModal('new');
    }

    const selEvents=getDayEvents(selDay);
    const selBusy=getBusyForDay(selDay);
    const selTasks=getTasksForDay(selDay);
    const catClr=id=>(BUSY_CATEGORIES.find(c=>c.id===id)||{clr:C.muted}).clr;
    const selectedCalendarDay=getCalendarDay(selDay);
    const renderDots=(calendarDay,maxDots=3)=>{
      const dots=[];
      if(calendarDay.hasTasks)dots.push({id:'tasks',color:C.amber});
      if(calendarDay.recoveryStatus==='low')dots.push({id:'recovery',color:C.red});
      if(calendarDay.completionRate>=80)dots.push({id:'completion',color:C.sage});
      if(calendarDay.hasWorkout)dots.push({id:'workout',color:'#4D7EA8'});
      return dots.slice(0,maxDots);
    };

    // Merge events + busy blocks + tasks into a single time-sorted list
    // Tasks float to the top (sortMins=-1) since they typically have no time
    const allDayEvents=selEvents.filter(e=>e.allDay);
    const allItems=[
      ...selEvents.filter(e=>!e.allDay).map(e=>({...e,kind:'event',sortMins:(e.startHour||0)*60})),
      ...selBusy.map(b=>({...b,kind:'busy',sortMins:timeToMins(b.startTime)})),
      ...selTasks.map(t=>({...t,kind:'task',sortMins:-1})),
    ].sort((a,b)=>a.sortMins-b.sortMins);

    return <div style={S.body}>
      <div style={{...S.card,marginBottom:10,padding:'14px 14px 12px'}}>
        <div style={{...S.row,marginBottom:10,alignItems:'center'}}>
          <button style={S.btnGhost} onClick={()=>moveCalendar(-1)}>Prev</button>
          <button style={{background:'none',border:'none',color:C.tx,fontSize:15,fontWeight:700,cursor:'pointer'}} onClick={()=>setCalendarViewMode(mode=>mode==='week'?'month':'week')}>
            {monthHeaderLabel} {calendarViewMode==='month'?'▲':'▼'}
          </button>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={resetCalendarToToday}>Today</button>
            <button style={S.btnGhost} onClick={()=>moveCalendar(1)}>Next</button>
          </div>
          {(recurringExpenses || []).length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: C.muted,
                fontSize: 13,
              }}
            >
              No recurring expenses detected yet.
              <br />
              Import at least 2 months of transactions.
            </div>
          )}
          {(recurringExpenses || []).map((r, i) => {
            const cat = financeCategoryMap.get(r.category) || {
              clr: C.muted,
              label: "Other",
            };
            const daysUntil = r.nextExpectedDate
              ? Math.ceil(
                  (new Date(r.nextExpectedDate + "T12:00:00") - now) / 86400000,
                )
              : null;
            const isDue = daysUntil !== null && daysUntil <= 7;
            return (
              <div
                key={i}
                style={{
                  ...S.card,
                  borderLeft: `3px solid ${isDue ? C.amber : cat.clr}`,
                }}
              >
                <div style={S.row}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
                      {r.merchant}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {fmtMoney(r.averageAmount)} · {r.frequency}
                      {r.nextExpectedDate && (
                        <span style={{ color: isDue ? C.amber : C.muted }}>
                          {" "}
                          · due {formatDate(r.nextExpectedDate, "monthDayLong")}
                          {isDue ? ` (${daysUntil}d)` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={S.tag(cat.clr, C.surf)}>
                    {cat.label || "Other"}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ ...S.card, background: C.surf, marginTop: 4 }}>
            <span style={S.lbl}>Recurring total</span>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
              {fmtMoney(
                (recurringExpenses || []).reduce(
                  (s, r) => s + r.averageAmount,
                  0,
                ),
              )}
              /mo est.
            </div>
          </div>
        </div>
      );
    }

    // ── TRENDS ────────────────────────────────────────────────────────
    if (localFinView === "trends") {
      // Build last 4 weeks
      const weeks = Array.from({ length: 4 }, (_, i) => {
        const d = new Date(weekMon);
        d.setDate(d.getDate() - i * 7);
        const wk = formatDateKey(d);
        const wkEnd = new Date(d);
        wkEnd.setDate(d.getDate() + 6);
        const total = spendTx
          .filter((t) => t.date >= wk && t.date <= formatDateKey(wkEnd))
          .reduce((s, t) => s + t.amount, 0);
        return { label: formatDate(d, "monthDayShort"), total, wk };
      }).reverse();
      const maxWeek = Math.max(...weeks.map((w) => w.total), 1);
      return (
        <div style={S.body}>
          <div style={{ ...S.row, marginBottom: 10, gap: 8 }}>
            <div style={{ flex: 1, overflowX: "auto" }}>{sub()}</div>
            {addBtn}
          </div>
          <div style={S.card}>
            <span style={S.lbl}>Weekly spend — last 4 weeks</span>
            {weeks.map((w) => (
              <div key={w.wk} style={{ marginBottom: 10 }}>
                <div style={{ ...S.row, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.tx }}>{w.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>
                    {fmtMoney(w.total)}
                  </span>
                </div>
                <ProgressBar value={w.total} max={maxWeek} color={C.navy} />
              </div>
            ))}
          </div>
          <div style={S.card}>
            <span style={S.lbl}>This month by category</span>
            {catSpend.length === 0 && (
              <div style={{ fontSize: 11, color: C.muted }}>No data yet.</div>
            )}
            {catSpend.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div style={{ ...S.row, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: C.tx }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    {fmtMoney(c.total)}
                  </span>
                </div>
                <ProgressBar value={c.total} max={monthSpend} color={c.clr} />
              </div>
            ))}
          </div>
          <div style={S.card}>
            <span style={S.lbl}>Income vs spend this month</span>
            {(() => {
              const income = (transactions || [])
                .filter(
                  (t) => t.isCredit && !t.isTransfer && t.date >= monthStart,
                )
                .reduce((s, t) => s + t.amount, 0);
              const net = income - monthSpend;
              return (
                <div>
                  <div style={{ ...S.row, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.tx }}>Income</span>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: C.sage }}
                    >
                      +{fmtMoney(income)}
                    </span>
                  </div>
                  <div style={{ ...S.row, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.tx }}>Spend</span>
                    <span
                      style={{ fontSize: 14, fontWeight: 700, color: C.tx }}
                    >
                      -{fmtMoney(monthSpend)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "0.5px",
                      background: C.bd,
                      margin: "6px 0",
                    }}
                  />
                  <div style={S.row}>
                    <span
                      style={{ fontSize: 12, fontWeight: 600, color: C.tx }}
                    >
                      Net
                    </span>
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: net >= 0 ? C.sage : C.red,
                      }}
                    >
                      {net >= 0 ? "+" : ""}
                      {fmtMoney(net)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      );
    }

    return (
      <div style={S.body}>
        <div style={S.card}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 6,
            }}
          >
            Finance view unavailable
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Resetting to Overview will restore the finance workspace.
          </div>
          <button
            style={{ ...S.btnGhost, marginTop: 10 }}
            onClick={() => onViewChange("overview")}
          >
            Open Overview
          </button>
        </div>
      </div>
    );
  }

  // ── IMPORT CSV MODAL (rendered at App level) ──────────────────────
  function ImportModal() {
    const [csvText, setCsvText] = useState("");
    const [targetAccountId, setTargetAccountId] = useState(
      getDefaultAccountId(activeFinancialAccounts, true) || IMPORT_ACCOUNT_AUTO,
    );
    const fileRef = useRef(null);
    const handleFile = (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => setCsvText(ev.target.result || "");
      reader.readAsText(f);
    };
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: C.scrim,
          zIndex: 600,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            background: C.card,
            borderRadius: "20px 20px 0 0",
            padding: "24px 16px",
            width: "100%",
            maxWidth: 430,
            margin: "0 auto",
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 12,
            }}
          >
            Import Transactions
          </div>
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            Export CSV from Ally (Account → Transactions → Export) or Regions
            (Online Banking → Download). Paste the CSV text below or select the
            file.
          </div>
          {activeFinancialAccounts.length > 0 && (
            <>
              <span style={S.lbl}>Import Into</span>
              <FieldSelect
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                style={{ ...S.inp, marginBottom: 10 }}
              >
                <option value={IMPORT_ACCOUNT_AUTO}>
                  Match or create from CSV source
                </option>
                {activeFinancialAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </FieldSelect>
            </>
          )}
          <FieldInput
            type="file"
            accept=".csv,.txt"
            ref={fileRef}
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <button
            style={{
              ...S.btnGhost,
              width: "100%",
              textAlign: "center",
              marginBottom: 8,
            }}
            onClick={() => fileRef.current?.click()}
          >
            Select CSV file
          </button>
          <FieldTextarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Or paste CSV text here..."
            style={{
              ...S.inp,
              height: 120,
              resize: "none",
              fontSize: 11,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={S.btnSolid(C.navy)}
              onClick={() =>
                importTransactions(
                  csvText,
                  targetAccountId === IMPORT_ACCOUNT_AUTO
                    ? ""
                    : targetAccountId,
                )
              }
            >
              Import
            </button>
            <button
              style={{ ...S.btnGhost, flex: 1 }}
              onClick={() => setShowImport(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ADD MANUAL TX MODAL (rendered at App level) ───────────────────
  function AddTxModal() {
    // Toggle helper renders a labeled switch
    function Toggle({ label, on, onToggle, activeColor = C.sage }) {
      return (
        <div
          style={{
            ...S.row,
            paddingBottom: 10,
            borderBottom: `0.5px solid ${C.bd}`,
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 13, color: C.tx }}>{label}</span>
          <button
            onClick={onToggle}
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              background: on ? activeColor : C.surf,
              border: `1px solid ${C.bd}`,
              cursor: "pointer",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: C.white,
                boxShadow: C.shadow,
                position: "absolute",
                top: 3,
                transition: "left 0.18s",
                left: on ? "20px" : "3px",
              }}
            />
          </button>
        </div>
      );
    }
    const lastTx = [...(transactions || [])].sort((a, b) =>
      b.date.localeCompare(a.date),
    )[0];
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: C.scrim,
          zIndex: 600,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            background: C.card,
            borderRadius: "20px 20px 0 0",
            padding: "24px 16px 32px",
            width: "100%",
            maxWidth: 430,
            margin: "0 auto",
            maxHeight: "88vh",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div style={{ ...S.row, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
              Add Transaction
            </div>
            {lastTx && (
              <button
                style={{
                  ...S.btnGhost,
                  fontSize: 11,
                  padding: "4px 10px",
                  color: C.navy,
                  borderColor: C.navy,
                }}
                onClick={duplicateLastTx}
              >
                ↩ Dup last: {lastTx.merchant.substring(0, 12)}
              </button>
            )}
          </div>

          {/* Merchant */}
          <span style={S.lbl}>Merchant</span>
          <FieldInput
            value={txForm.merchant}
            onChange={(e) =>
              setTxForm((f) => ({ ...f, merchant: e.target.value }))
            }
            placeholder="e.g. Aldi"
            style={{ ...S.inp, marginBottom: 8 }}
            autoFocus
          />

          {/* Amount + Date */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <span style={S.lbl}>Amount ($)</span>
              <FieldInput
                type="number"
                inputMode="decimal"
                value={txForm.amount}
                onChange={(e) =>
                  setTxForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0.00"
                style={S.inp}
              />
            </div>
            <div>
              <span style={S.lbl}>Date</span>
              <FieldInput
                type="date"
                value={txForm.date}
                onChange={(e) =>
                  setTxForm((f) => ({ ...f, date: e.target.value }))
                }
                style={S.inp}
              />
            </div>
          </div>

          {/* Account */}
          <span style={S.lbl}>Account</span>
          {activeFinancialAccounts.length > 0 ? (
            <FieldSelect
              value={txForm.accountId}
              onChange={(e) =>
                setTxForm((f) => ({ ...f, accountId: e.target.value }))
              }
              style={{ ...S.inp, marginBottom: 8 }}
            >
              {activeFinancialAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatAccountLabel(a)}
                </option>
              ))}
            </FieldSelect>
          ) : (
            <div
              style={{
                background: C.surf,
                border: `1px solid ${C.bd}`,
                borderRadius: 12,
                padding: "12px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, color: C.tx, marginBottom: 8 }}>
                Add an account before saving transactions.
              </div>
              <button
                style={S.btnSmall(C.navy)}
                onClick={() => {
                  setShowAddTx(false);
                  openAddAccount();
                }}
              >
                + Add account
              </button>
            </div>
          )}

          {/* Category chips */}
          <span style={S.lbl}>Category</span>
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {financeCategories
              .filter((c) => c.id !== "transfer")
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    setTxForm((f) => ({
                      ...f,
                      category: c.id,
                      isTransfer: false,
                    }))
                  }
                  style={{
                    padding: "5px 10px",
                    borderRadius: 20,
                    border: `1.5px solid ${txForm.category === c.id ? c.clr : C.bd}`,
                    background:
                      txForm.category === c.id ? c.clr : "transparent",
                    color: txForm.category === c.id ? C.white : C.tx,
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: txForm.category === c.id ? 600 : 400,
                  }}
                >
                  {c.label}
                </button>
              ))}
          </div>

          {/* Toggles */}
          <Toggle
            label="Income / credit"
            on={txForm.isCredit}
            onToggle={() => setTxForm((f) => ({ ...f, isCredit: !f.isCredit }))}
            activeColor={C.sage}
          />
          <Toggle
            label="Recurring bill or subscription"
            on={txForm.isRecurring}
            onToggle={() =>
              setTxForm((f) => ({ ...f, isRecurring: !f.isRecurring }))
            }
            activeColor={C.navy}
          />
          <Toggle
            label="Transfer between accounts (excluded from spend totals)"
            on={txForm.isTransfer}
            onToggle={() =>
              setTxForm((f) => ({
                ...f,
                isTransfer: !f.isTransfer,
                category: !f.isTransfer ? "transfer" : f.category,
              }))
            }
            activeColor={C.amber}
          />

          {/* Notes */}
          <FieldInput
            value={txForm.notes}
            onChange={(e) =>
              setTxForm((f) => ({ ...f, notes: e.target.value }))
            }
            placeholder="Note (optional)..."
            style={{ ...S.inp, marginBottom: 16 }}
          />

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                ...S.btnSolid(C.sage),
                opacity: activeFinancialAccounts.length ? 1 : 0.6,
                pointerEvents: activeFinancialAccounts.length ? "auto" : "none",
              }}
              onClick={() => addManualTx()}
            >
              Save Transaction
            </button>
            <button
              style={{ ...S.btnGhost, flex: 0, padding: "11px 16px" }}
              onClick={() => setShowAddTx(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  function AccountModal() {
    const isEdit = !!editingAccountId;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: C.scrim,
          zIndex: 600,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            background: C.card,
            borderRadius: "20px 20px 0 0",
            padding: "24px 16px 32px",
            width: "100%",
            maxWidth: 430,
            margin: "0 auto",
            maxHeight: "88vh",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 16,
            }}
          >
            {isEdit ? "Edit Account" : "Add Account"}
          </div>
          <span style={S.lbl}>Account Name</span>
          <FieldInput
            value={accountForm.name}
            onChange={(e) =>
              setAccountForm((form) => ({ ...form, name: e.target.value }))
            }
            placeholder="Checking"
            style={{ ...S.inp, marginBottom: 8 }}
            autoFocus
          />
          <span style={S.lbl}>Institution</span>
          <FieldInput
            value={accountForm.institution}
            onChange={(e) =>
              setAccountForm((form) => ({
                ...form,
                institution: e.target.value,
              }))
            }
            placeholder="Ally"
            style={{ ...S.inp, marginBottom: 8 }}
          />
          <span style={S.lbl}>Type</span>
          <FieldSelect
            value={accountForm.type}
            onChange={(e) =>
              setAccountForm((form) => ({ ...form, type: e.target.value }))
            }
            style={{ ...S.inp, marginBottom: 8 }}
          >
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FieldSelect>
          <span style={S.lbl}>Starting Balance (optional)</span>
          <FieldInput
            type="number"
            inputMode="decimal"
            value={accountForm.startingBalance}
            onChange={(e) =>
              setAccountForm((form) => ({
                ...form,
                startingBalance: e.target.value,
              }))
            }
            placeholder="0.00"
            style={{ ...S.inp, marginBottom: 12 }}
          />
          <div
            style={{
              ...S.row,
              paddingBottom: 10,
              borderBottom: `0.5px solid ${C.bd}`,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 13, color: C.tx }}>
              Active for new transactions
            </span>
            <button
              onClick={() =>
                setAccountForm((form) => ({
                  ...form,
                  isActive: !form.isActive,
                }))
              }
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                background: accountForm.isActive ? C.sage : C.surf,
                border: `1px solid ${C.bd}`,
                cursor: "pointer",
                position: "relative",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: C.white,
                  boxShadow: C.shadow,
                  position: "absolute",
                  top: 3,
                  transition: "left 0.18s",
                  left: accountForm.isActive ? "20px" : "3px",
                }}
              />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btnSolid(C.sage)} onClick={saveAccount}>
              {isEdit ? "Save Account" : "Add Account"}
            </button>
            <button
              style={{ ...S.btnGhost, flex: 0, padding: "11px 16px" }}
              onClick={() => setShowAccountModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  function SettingsScreen({
    activeSection = null,
    onSectionChange = () => {},
  }) {
    const [clientIdInput, setClientIdInput] = useState(
      profile.googleClientId || "",
    );
    const restoreFileRef = useRef(null);
    function exportAllData() {
      const data = JSON.stringify(profile, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-hub-backup-${TODAY}.json`;
      a.click();
      URL.revokeObjectURL(url);
      updateProfile((p) => ({
        ...p,
        securitySettings: {
          ...p.securitySettings,
          dataExportHistory: [
            ...(p.securitySettings?.dataExportHistory || []),
            TODAY,
          ],
        },
      }));
      showNotif("Backup exported", "success");
    }
    function restoreAllData(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result || "{}");
          if (!confirm("Restore this backup and replace current local data?"))
            return;
          const restored = normalizeLoadedProfile(parsed);
          setProfile(restored);
          storage.setJSON(STORAGE_KEYS.profile, restored);
          showNotif("Backup restored", "success");
        } catch {
          showNotif("Backup restore failed", "error");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    }
    const sections = [
      { id: "app", label: "App" },
      { id: "workcal", label: "Work Calendar" },
      { id: "finance", label: "Finance" },
      { id: "google", label: "Google Integration" },
      { id: "fitness", label: "Fitness Profile" },
      { id: "goals", label: "Goals and Targets" },
      { id: "meals", label: "Meal Preferences" },
      { id: "notifications", label: "Notifications" },
      { id: "security", label: "Security & Data" },
    ];
    return (
      <div style={S.body}>
        {sections.map((sec) => (
          <div key={sec.id} style={S.card}>
            <button
              style={{
                ...S.row,
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() =>
                onSectionChange(activeSection === sec.id ? null : sec.id)
              }
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
                {sec.label}
              </span>
              <span style={{ color: C.muted, fontSize: 16 }}>
                {activeSection === sec.id ? "^" : "v"}
              </span>
            </button>
            {activeSection === sec.id && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `0.5px solid ${C.bd}`,
                }}
              >
                {sec.id === "app" && (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginBottom: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      Install controls now live on the Home screen when this
                      browser makes them available. PWA installability and
                      service workers only work when the app is served from
                      localhost or HTTPS, not when opened from file://.
                    </div>
                    {isInstalled ? (
                      <div
                        style={{
                          ...S.card,
                          padding: "10px 12px",
                          background: C.sageL,
                          borderColor: "transparent",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: C.sageDk,
                            marginBottom: 4,
                          }}
                        >
                          Installed
                        </div>
                        <div style={{ fontSize: 11, color: C.tx2 }}>
                          This device is already running the standalone app.
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 11,
                          color: C.muted,
                          lineHeight: 1.5,
                        }}
                      >
                        Installation is not available right now. Open the app
                        from a supported browser on localhost or HTTPS, then use
                        the browser install or Add to Home Screen action if
                        prompted.
                      </div>
                    )}
                  </div>
                )}
                {sec.id === "finance" && (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginBottom: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      Manage balances for your saved accounts here. Add, edit,
                      archive, and restore accounts from the Finance tab.
                      Everything stays local.
                    </div>
                    <span style={S.lbl}>Account Balances</span>
                    {normalizeFinancialAccounts(financialAccounts).map((a) => (
                      <div
                        key={a.id}
                        style={{
                          ...S.card,
                          padding: "10px 12px",
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ ...S.row, marginBottom: 6 }}>
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: C.tx,
                              }}
                            >
                              {formatAccountLabel(a)}
                            </div>
                            <div style={{ fontSize: 10, color: C.muted }}>
                              {ACCOUNT_TYPE_OPTIONS.find(
                                (option) => option.id === a.type,
                              )?.label || "Other"}
                              {a.isActive === false ? " · archived" : ""}
                            </div>
                          </div>
                          {a.currentBalance != null && (
                            <div
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: C.sage,
                              }}
                            >
                              {fmtMoney(a.currentBalance)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <FieldInput
                            placeholder="Balance"
                            type="number"
                            defaultValue={a.currentBalance ?? ""}
                            style={{
                              ...S.inp,
                              flex: 1,
                              padding: "6px 8px",
                              fontSize: 12,
                            }}
                            onBlur={(e) =>
                              updateAccountBalance(
                                a.id,
                                e.target.value,
                                a.maskedNumber,
                              )
                            }
                          />
                          <FieldInput
                            placeholder="••••"
                            style={{
                              ...S.inp,
                              width: 60,
                              padding: "6px 8px",
                              fontSize: 12,
                            }}
                            defaultValue={a.maskedNumber}
                            onBlur={(e) =>
                              updateAccountBalance(
                                a.id,
                                a.currentBalance,
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                    <div style={{ height: 8 }} />
                    <span style={S.lbl}>Import Transactions (CSV)</span>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.muted,
                        marginBottom: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      Export from Ally: Account → Transactions → Export → CSV
                      <br />
                      Export from Regions: Online Banking → Transactions →
                      Download → CSV
                    </div>
                    <button
                      style={S.btnSolid(C.navy)}
                      onClick={() => setShowImport(true)}
                    >
                      Import CSV
                    </button>
                    <div style={{ height: 8 }} />
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {(transactions || []).length} transactions stored ·{" "}
                      {unreviewed} unreviewed
                    </div>
                  </div>
                )}
                {sec.id === "workcal" && (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginBottom: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      Manually enter work-unavailable windows so the app can
                      plan workouts, meals, and tasks around them. Busy blocks
                      are locked — the planner treats them like fixed meetings.
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: C.tx,
                        marginBottom: 6,
                      }}
                    >
                      Priority order
                    </div>
                    {[
                      { n: "1", l: "Fixed Google events", c: C.navy },
                      { n: "2", l: "Manual busy blocks", c: C.amber },
                      { n: "3", l: "Meal prep", c: C.sage },
                      { n: "4", l: "Workout", c: C.sage },
                      { n: "5", l: "Tasks", c: C.muted },
                    ].map((r) => (
                      <div
                        key={r.n}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 0",
                          borderBottom: `0.5px solid ${C.bd}`,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: r.c,
                            color: C.white,
                            fontSize: 10,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {r.n}
                        </span>
                        <span style={{ fontSize: 12, color: C.tx }}>{r.l}</span>
                      </div>
                    ))}
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 11,
                        color: C.muted,
                        lineHeight: 1.5,
                      }}
                    >
                      Add busy blocks from the Calendar tab. Use the quick
                      presets for common patterns, or save a weekly pattern and
                      apply it each Sunday.
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        color: C.tx,
                        marginBottom: 4,
                      }}
                    >
                      Current busy blocks
                    </div>
                    {(busyBlocks || []).length === 0 ? (
                      <div style={{ fontSize: 11, color: C.muted }}>
                        None yet. Go to Calendar to add blocks.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 180, overflowY: "auto" }}>
                        {(busyBlocks || []).map((b) => {
                          const cat = BUSY_CATEGORIES.find(
                            (c) => c.id === b.category,
                          ) || { clr: C.muted, label: b.category };
                          return (
                            <div
                              key={b.id}
                              style={{
                                ...S.row,
                                padding: "6px 0",
                                borderBottom: `0.5px solid ${C.bd}`,
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 12, color: C.tx }}>
                                  {b.title}
                                </div>
                                <div style={{ fontSize: 10, color: C.muted }}>
                                  {b.recurring
                                    ? `Every ${"SMTWTFS"[b.dow || 0]}`
                                    : formatDate(
                                        b.date,
                                        "weekdayMonthDayShort",
                                      )}{" "}
                                  · {fmtTimeRange(b.startTime, b.endTime)} ·{" "}
                                  <span style={{ color: cat.clr }}>
                                    {cat.label}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteBusyBlock(b.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: C.muted,
                                  fontSize: 13,
                                  cursor: "pointer",
                                }}
                              >
                                x
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {sec.id === "google" && (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginBottom: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      Enter your Google OAuth Client ID to enable Calendar +
                      Tasks sync. Serve this file via python3 -m http.server
                      8080 and add http://localhost:8080 to your GCP authorized
                      origins.
                    </div>
                    <span style={S.lbl}>Google Client ID</span>
                    <FieldInput
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="123456789.apps.googleusercontent.com"
                      style={{ ...S.inp, marginBottom: 8 }}
                    />
                    <button
                      style={S.btnSolid(C.navy)}
                      onClick={() => {
                        updateProfile({ googleClientId: clientIdInput });
                        GoogleAPI.init(clientIdInput);
                        showNotif("Client ID saved", "success");
                      }}
                    >
                      Save Client ID
                    </button>
                    <div style={{ height: 8 }} />
                    {googleConnected ? (
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: C.sage,
                            marginBottom: 8,
                            fontWeight: 500,
                          }}
                        >
                          Google connected
                        </div>
                        <button
                          style={{ ...S.btnGhost, fontSize: 12 }}
                          onClick={disconnectGoogle}
                        >
                          Disconnect Google
                        </button>
                      </div>
                    ) : (
                      <button
                        style={S.btnSolid(C.sage)}
                        onClick={connectGoogle}
                      >
                        Connect Google Account
                      </button>
                    )}
                  </div>
                )}
                {sec.id === "fitness" && (
                  <div>
                    {(() => {
                      const primaryProgram =
                        athlete.primaryProgram &&
                        ["hyrox", "running", "strength"].includes(
                          athlete.primaryProgram,
                        )
                          ? athlete.primaryProgram
                          : ["hyrox", "running", "strength"].includes(
                                fitnessProgram,
                              )
                            ? fitnessProgram
                            : "hyrox";
                      const addOns = Array.isArray(athlete.secondaryAddOns)
                        ? athlete.secondaryAddOns.filter((id) =>
                            FITNESS_ADD_ON_OPTIONS.some(
                              (option) => option.id === id,
                            ),
                          )
                        : [];
                      const selectedDays = orderTrainingDays(
                        Array.isArray(athlete.preferredTrainingDays) &&
                          athlete.preferredTrainingDays.length
                          ? athlete.preferredTrainingDays
                          : getAnchoredTrainingDays(
                              athlete.programType || "4-day",
                              athlete.trainingWeekStart || "Mon",
                            ),
                        athlete.trainingWeekStart || "Mon",
                      );
                      const raceWeeks = trainingCycle.weeksToRace;
                      const derivedSquat = athlete.squat5RM
                        ? [
                            {
                              label: "60%",
                              value: Math.round(athlete.squat5RM * 0.6),
                            },
                            {
                              label: "70%",
                              value: Math.round(athlete.squat5RM * 0.7),
                            },
                            {
                              label: "80%",
                              value: Math.round(athlete.squat5RM * 0.8),
                            },
                            {
                              label: "85%",
                              value: Math.round(athlete.squat5RM * 0.85),
                            },
                          ]
                        : [];
                      const derivedDeadlift = athlete.deadlift5RM
                        ? [
                            {
                              label: "60%",
                              value: Math.round(athlete.deadlift5RM * 0.6),
                            },
                            {
                              label: "70%",
                              value: Math.round(athlete.deadlift5RM * 0.7),
                            },
                            {
                              label: "80%",
                              value: Math.round(athlete.deadlift5RM * 0.8),
                            },
                            {
                              label: "85%",
                              value: Math.round(athlete.deadlift5RM * 0.85),
                            },
                          ]
                        : [];
                      const previewDays = weekPlannedWorkouts.slice(
                        0,
                        Math.max(4, selectedDays.length),
                      );
                      const setPrimaryProgram = (nextProgram) =>
                        updateProfile((p) => ({
                          ...p,
                          fitnessProgram: nextProgram,
                          athleteProfile: {
                            ...p.athleteProfile,
                            primaryProgram: nextProgram,
                          },
                        }));
                      const toggleAddOn = (id) =>
                        updateProfile((p) => {
                          const current = Array.isArray(
                            p.athleteProfile?.secondaryAddOns,
                          )
                            ? p.athleteProfile.secondaryAddOns
                            : [];
                          const next = current.includes(id)
                            ? current.filter((item) => item !== id)
                            : [...current, id];
                          return {
                            ...p,
                            athleteProfile: {
                              ...p.athleteProfile,
                              secondaryAddOns: next,
                            },
                          };
                        });
                      const toggleTrainingDay = (label) =>
                        updateProfile((p) => {
                          const anchor =
                            p.athleteProfile?.trainingWeekStart || "Mon";
                          const current = orderTrainingDays(
                            Array.isArray(
                              p.athleteProfile?.preferredTrainingDays,
                            ) && p.athleteProfile.preferredTrainingDays.length
                              ? p.athleteProfile.preferredTrainingDays
                              : getAnchoredTrainingDays(
                                  p.athleteProfile?.programType || "4-day",
                                  anchor,
                                ),
                            anchor,
                          );
                          const hasDay = current.includes(label);
                          let next = current;
                          if (hasDay && current.length > 4) {
                            next = current.filter((day) => day !== label);
                          } else if (!hasDay && current.length < 5) {
                            next = orderTrainingDays(
                              [...current, label],
                              anchor,
                            );
                          }
                          const nextProgramType =
                            next.length >= 5 ? "5-day" : "4-day";
                          return {
                            ...p,
                            athleteProfile: {
                              ...p.athleteProfile,
                              preferredTrainingDays: next,
                              programType: nextProgramType,
                            },
                          };
                        });
                      const setTrainingWeekStart = (option) =>
                        updateProfile((p) => {
                          const currentDays =
                            Array.isArray(
                              p.athleteProfile?.preferredTrainingDays,
                            ) && p.athleteProfile.preferredTrainingDays.length
                              ? p.athleteProfile.preferredTrainingDays
                              : getAnchoredTrainingDays(
                                  p.athleteProfile?.programType || "4-day",
                                  option,
                                );
                          return {
                            ...p,
                            athleteProfile: {
                              ...p.athleteProfile,
                              trainingWeekStart: option,
                              preferredTrainingDays: orderTrainingDays(
                                currentDays,
                                option,
                              ),
                            },
                          };
                        });
                      return (
                        <>
                          <div style={S.card}>
                            <span style={S.lbl}>Program Setup</span>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: C.tx,
                                marginBottom: 10,
                              }}
                            >
                              Choose the training system
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: C.muted,
                                marginBottom: 8,
                              }}
                            >
                              Primary program drives the weekly plan. Add-ons
                              layer on support work.
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: C.tx,
                                  marginBottom: 6,
                                  fontWeight: 600,
                                }}
                              >
                                Primary Program
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {[
                                  "hyrox",
                                  "running",
                                  "strength",
                                  "pilates",
                                  "recovery",
                                ].map((id) => (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => setPrimaryProgram(id)}
                                    style={{
                                      padding: "7px 12px",
                                      borderRadius: 9,
                                      border: `1.5px solid ${primaryProgram === id ? C.sage : C.bd}`,
                                      background:
                                        primaryProgram === id
                                          ? C.sageL
                                          : "transparent",
                                      color:
                                        primaryProgram === id
                                          ? C.sageDk
                                          : C.muted,
                                      fontSize: 12,
                                      cursor: "pointer",
                                      fontWeight:
                                        primaryProgram === id ? 600 : 400,
                                    }}
                                  >
                                    {FITNESS_PROGRAM_OPTIONS.find(
                                      (option) => option.id === id,
                                    )?.label || id}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: C.tx,
                                  marginBottom: 6,
                                  fontWeight: 600,
                                }}
                              >
                                Secondary Add-Ons
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {FITNESS_ADD_ON_OPTIONS.map(({ id, label }) => (
                                  <button
                                    key={id}
                                    onClick={() => toggleAddOn(id)}
                                    style={{
                                      padding: "7px 12px",
                                      borderRadius: 9,
                                      border: `1.5px solid ${addOns.includes(id) ? C.navy : C.bd}`,
                                      background: addOns.includes(id)
                                        ? C.navyL
                                        : "transparent",
                                      color: addOns.includes(id)
                                        ? C.navyDk
                                        : C.muted,
                                      fontSize: 12,
                                      cursor: "pointer",
                                      fontWeight: addOns.includes(id)
                                        ? 600
                                        : 400,
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div style={S.card}>
                            <span style={S.lbl}>Schedule</span>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: C.tx,
                                marginBottom: 10,
                              }}
                            >
                              Pick exact training days
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: C.muted,
                                marginBottom: 8,
                              }}
                            >
                              Select 4 or 5 specific days. The current planner
                              supports either 4-day or 5-day structures.
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                marginBottom: 10,
                              }}
                            >
                              {[
                                "Sun",
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                              ].map((label) => (
                                <button
                                  key={label}
                                  onClick={() => toggleTrainingDay(label)}
                                  style={{
                                    padding: "7px 10px",
                                    minWidth: 44,
                                    borderRadius: 9,
                                    border: `1.5px solid ${selectedDays.includes(label) ? C.sage : C.bd}`,
                                    background: selectedDays.includes(label)
                                      ? C.sageL
                                      : "transparent",
                                    color: selectedDays.includes(label)
                                      ? C.sageDk
                                      : C.muted,
                                    fontSize: 12,
                                    cursor: "pointer",
                                    fontWeight: selectedDays.includes(label)
                                      ? 600
                                      : 400,
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                                marginBottom: 10,
                              }}
                            >
                              <span style={S.pill(C.surf, C.tx2)}>
                                {selectedDays.length} selected
                              </span>
                              <span style={S.pill(C.surf, C.tx2)}>
                                {selectedDays.length >= 5
                                  ? "5-day structure"
                                  : "4-day structure"}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: C.tx,
                                marginBottom: 6,
                                fontWeight: 600,
                              }}
                            >
                              Training Week Anchor
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              {["Sun", "Mon", "Wed"].map((option) => (
                                <button
                                  key={option}
                                  onClick={() => setTrainingWeekStart(option)}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: 9,
                                    border: `1.5px solid ${(athlete.trainingWeekStart || "Mon") === option ? C.sage : C.bd}`,
                                    background:
                                      (athlete.trainingWeekStart || "Mon") ===
                                      option
                                        ? C.sageL
                                        : "transparent",
                                    color:
                                      (athlete.trainingWeekStart || "Mon") ===
                                      option
                                        ? C.sageDk
                                        : C.muted,
                                    fontSize: 12,
                                    cursor: "pointer",
                                    fontWeight:
                                      (athlete.trainingWeekStart || "Mon") ===
                                      option
                                        ? 600
                                        : 400,
                                  }}
                                >
                                  {option === "Sun"
                                    ? "Sunday Start"
                                    : option === "Mon"
                                      ? "Monday Start"
                                      : "Wednesday Start"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={S.card}>
                            <span style={S.lbl}>Performance Inputs</span>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: C.tx,
                                marginBottom: 10,
                              }}
                            >
                              Enter anchor metrics
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                                marginBottom: 8,
                              }}
                            >
                              <div>
                                <span style={S.lbl}>5K Time</span>
                                <FieldInput
                                  type="number"
                                  step="0.1"
                                  inputMode="decimal"
                                  value={athlete.fiveKTime || ""}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        fiveKTime:
                                          parseFloat(e.target.value) || null,
                                      },
                                    }))
                                  }
                                  placeholder="28.5 min"
                                  style={S.inp}
                                />
                              </div>
                              <div>
                                <span style={S.lbl}>Wall Ball Max</span>
                                <FieldInput
                                  type="number"
                                  step="1"
                                  inputMode="numeric"
                                  value={athlete.wallBallMaxReps || ""}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        wallBallMaxReps:
                                          parseInt(e.target.value) || null,
                                      },
                                    }))
                                  }
                                  placeholder="40 reps"
                                  style={S.inp}
                                />
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                              }}
                            >
                              <div>
                                <span style={S.lbl}>Back Squat 5RM</span>
                                <FieldInput
                                  type="number"
                                  step="5"
                                  inputMode="numeric"
                                  value={athlete.squat5RM || ""}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        squat5RM:
                                          parseInt(e.target.value) || null,
                                      },
                                    }))
                                  }
                                  placeholder="185 lb"
                                  style={S.inp}
                                />
                              </div>
                              <div>
                                <span style={S.lbl}>Deadlift 5RM</span>
                                <FieldInput
                                  type="number"
                                  step="5"
                                  inputMode="numeric"
                                  value={athlete.deadlift5RM || ""}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        deadlift5RM:
                                          parseInt(e.target.value) || null,
                                      },
                                    }))
                                  }
                                  placeholder="225 lb"
                                  style={S.inp}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={S.card}>
                            <span style={S.lbl}>Race Timeline</span>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                                marginBottom: 10,
                              }}
                            >
                              <div>
                                <span style={S.lbl}>Race Date</span>
                                <FieldInput
                                  type="date"
                                  value={raceDate || DEFAULT_RACE}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        raceDate: e.target.value,
                                      },
                                    }))
                                  }
                                  style={S.inp}
                                />
                              </div>
                              <div>
                                <span style={S.lbl}>Plan Start</span>
                                <FieldInput
                                  type="date"
                                  value={planStartDate || DEFAULT_START}
                                  onChange={(e) =>
                                    updateProfile((p) => ({
                                      ...p,
                                      athleteProfile: {
                                        ...p.athleteProfile,
                                        planStartDate: e.target.value,
                                      },
                                    }))
                                  }
                                  style={S.inp}
                                />
                              </div>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3,1fr)",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  background: C.surf,
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: C.muted,
                                    marginBottom: 4,
                                  }}
                                >
                                  Weeks to race
                                </div>
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: C.tx,
                                  }}
                                >
                                  {raceWeeks}
                                </div>
                              </div>
                              <div
                                style={{
                                  background: C.surf,
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: C.muted,
                                    marginBottom: 4,
                                  }}
                                >
                                  Training phase
                                </div>
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: C.tx,
                                  }}
                                >
                                  {PH?.name || trainingCycle.phase?.name}
                                </div>
                              </div>
                              <div
                                style={{
                                  background: C.surf,
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: C.muted,
                                    marginBottom: 4,
                                  }}
                                >
                                  Current week
                                </div>
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: C.tx,
                                  }}
                                >
                                  {CUR_WK}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={S.card}>
                            <span style={S.lbl}>Derived Outputs</span>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: C.tx,
                                marginBottom: 10,
                              }}
                            >
                              Training targets and preview
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: C.tx,
                                marginBottom: 6,
                                fontWeight: 600,
                              }}
                            >
                              Running Pace Zones
                            </div>
                            {paceProfile ? (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(2,1fr)",
                                  gap: 8,
                                  marginBottom: 12,
                                }}
                              >
                                {[
                                  { label: "Easy", value: paceProfile.easy },
                                  {
                                    label: "Threshold",
                                    value: paceProfile.threshold,
                                  },
                                  {
                                    label: "Interval",
                                    value: paceProfile.interval,
                                  },
                                  {
                                    label: "5K Pace",
                                    value: paceProfile.race5k,
                                  },
                                ].map((item) => (
                                  <div
                                    key={item.label}
                                    style={{
                                      background: C.surf,
                                      borderRadius: 12,
                                      padding: "10px 12px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 9,
                                        color: C.muted,
                                        marginBottom: 4,
                                      }}
                                    >
                                      {item.label}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color: C.tx,
                                      }}
                                    >
                                      {item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: C.muted,
                                  marginBottom: 12,
                                }}
                              >
                                Add a 5K time to generate pace zones.
                              </div>
                            )}

                            <div
                              style={{
                                fontSize: 11,
                                color: C.tx,
                                marginBottom: 6,
                                fontWeight: 600,
                              }}
                            >
                              Working Weights from 5RM
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                                marginBottom: 12,
                              }}
                            >
                              <div
                                style={{
                                  background: C.surf,
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: C.muted,
                                    marginBottom: 6,
                                  }}
                                >
                                  Back Squat
                                </div>
                                {derivedSquat.length > 0 ? (
                                  derivedSquat.map((item) => (
                                    <div
                                      key={item.label}
                                      style={{ ...S.row, padding: "2px 0" }}
                                    >
                                      <span
                                        style={{ fontSize: 11, color: C.tx2 }}
                                      >
                                        {item.label}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: C.tx,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {item.value} lb
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: 11, color: C.muted }}>
                                    Add a squat 5RM
                                  </div>
                                )}
                              </div>
                              <div
                                style={{
                                  background: C.surf,
                                  borderRadius: 12,
                                  padding: "10px 12px",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: C.muted,
                                    marginBottom: 6,
                                  }}
                                >
                                  Deadlift
                                </div>
                                {derivedDeadlift.length > 0 ? (
                                  derivedDeadlift.map((item) => (
                                    <div
                                      key={item.label}
                                      style={{ ...S.row, padding: "2px 0" }}
                                    >
                                      <span
                                        style={{ fontSize: 11, color: C.tx2 }}
                                      >
                                        {item.label}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: C.tx,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {item.value} lb
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ fontSize: 11, color: C.muted }}>
                                    Add a deadlift 5RM
                                  </div>
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: C.tx,
                                marginBottom: 6,
                                fontWeight: 600,
                              }}
                            >
                              Weekly Training Preview
                            </div>
                            <div
                              style={{
                                background: C.surf,
                                borderRadius: 12,
                                padding: "10px 12px",
                              }}
                            >
                              {previewDays.map((item, idx) => (
                                <div
                                  key={`${item.plannedDate}-${idx}`}
                                  style={{
                                    ...S.row,
                                    padding: "7px 0",
                                    borderBottom:
                                      idx < previewDays.length - 1
                                        ? `0.5px solid ${C.bd}`
                                        : "none",
                                    alignItems: "flex-start",
                                    gap: 8,
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: C.tx,
                                      }}
                                    >
                                      {item.plannedDayLabel}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: C.tx2,
                                        marginTop: 2,
                                      }}
                                    >
                                      {item.plannedName}
                                    </div>
                                  </div>
                                  <span
                                    style={S.pill(
                                      item.status === "today"
                                        ? C.navyL
                                        : C.surf,
                                      item.status === "today"
                                        ? C.navyDk
                                        : C.muted,
                                    )}
                                  >
                                    {item.status === "today"
                                      ? "Today"
                                      : formatWorkoutTypeLabel(item)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {sec.id === "goals" && (
                  <div>
                    <span style={S.lbl}>Daily Calorie Goal (kcal)</span>
                    <FieldInput
                      type="number"
                      value={calGoal}
                      onChange={(e) =>
                        updateProfile({
                          calGoal: parseInt(e.target.value) || 2000,
                        })
                      }
                      style={{ ...S.inp, marginBottom: 8 }}
                    />
                    <span style={S.lbl}>Daily Protein Goal (g)</span>
                    <FieldInput
                      type="number"
                      value={proGoal}
                      onChange={(e) =>
                        updateProfile({
                          proGoal: parseInt(e.target.value) || 140,
                        })
                      }
                      style={{ ...S.inp, marginBottom: 8 }}
                    />
                    <span style={S.lbl}>Daily Water Goal (oz)</span>
                    <FieldInput
                      type="number"
                      value={hydGoal}
                      onChange={(e) =>
                        updateProfile({
                          hydGoal: parseInt(e.target.value) || 72,
                        })
                      }
                      style={S.inp}
                    />
                  </div>
                )}
                {sec.id === "meals" && (
                  <div>
                    <div
                      style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}
                    >
                      Training day macros: {MACROS.protein}g protein ·{" "}
                      {MACROS.carbsTraining}g carbs · {MACROS.fat}g fat
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Rest day macros: {MACROS.protein}g protein ·{" "}
                      {MACROS.carbsRest}g carbs · {MACROS.fat}g fat
                    </div>
                  </div>
                )}
                {sec.id === "notifications" && (
                  <div>
                    <span style={S.lbl}>Morning Reminder</span>
                    <FieldInput
                      type="time"
                      value={profile.notifications?.morningTime || "07:00"}
                      onChange={(e) =>
                        updateProfile((p) => ({
                          ...p,
                          notifications: {
                            ...p.notifications,
                            morningTime: e.target.value,
                          },
                        }))
                      }
                      style={{ ...S.inp, marginBottom: 8 }}
                    />
                    <span style={S.lbl}>Evening Reminder</span>
                    <FieldInput
                      type="time"
                      value={profile.notifications?.eveningTime || "21:00"}
                      onChange={(e) =>
                        updateProfile((p) => ({
                          ...p,
                          notifications: {
                            ...p.notifications,
                            eveningTime: e.target.value,
                          },
                        }))
                      }
                      style={S.inp}
                    />
                  </div>
                )}
                {sec.id === "security" && (
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginBottom: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      All data is stored locally on this device. Nothing is
                      transmitted except optional Google OAuth tokens
                      (session-only) and Plaid connections when configured.
                    </div>
                    <div
                      style={{
                        ...S.row,
                        marginBottom: 12,
                        paddingBottom: 12,
                        borderBottom: `0.5px solid ${C.bd}`,
                      }}
                    >
                      <div>
                        <div
                          style={{ fontSize: 13, color: C.tx, fontWeight: 500 }}
                        >
                          Analytics tracking
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          Correlations across energy, sleep, workouts, spend
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          updateProfile((p) => ({
                            ...p,
                            securitySettings: {
                              ...p.securitySettings,
                              analyticsEnabled:
                                !p.securitySettings?.analyticsEnabled,
                            },
                          }))
                        }
                        style={{
                          width: 40,
                          height: 24,
                          borderRadius: 12,
                          background:
                            securitySettings?.analyticsEnabled !== false
                              ? C.sage
                              : C.surf,
                          border: `1px solid ${C.bd}`,
                          cursor: "pointer",
                          position: "relative",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: C.white,
                            position: "absolute",
                            top: 2,
                            transition: "left 0.2s",
                            left:
                              securitySettings?.analyticsEnabled !== false
                                ? "18px"
                                : "2px",
                          }}
                        />
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: C.tx,
                        marginBottom: 8,
                      }}
                    >
                      Connected services
                    </div>
                    <div
                      style={{
                        ...S.row,
                        padding: "8px 0",
                        borderBottom: `0.5px solid ${C.bd}`,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.tx }}>
                        Google Calendar / Tasks
                      </div>
                      {googleConnected ? (
                        <button
                          style={{ ...S.btnSmall(C.red) }}
                          onClick={disconnectGoogle}
                        >
                          Disconnect
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: C.muted }}>
                          Not connected
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        ...S.row,
                        padding: "8px 0",
                        borderBottom: `0.5px solid ${C.bd}`,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.tx }}>
                        Financial data
                      </div>
                      <button
                        style={{ ...S.btnSmall(C.amber) }}
                        onClick={() => {
                          if (confirm("Delete all transaction data?"))
                            updateProfile((p) => ({
                              ...p,
                              transactions: [],
                              recurringExpenses: [],
                              merchantRules: {},
                            }));
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <FieldInput
                      ref={restoreFileRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={restoreAllData}
                      style={{ display: "none" }}
                    />
                    <button
                      style={{
                        ...S.btnGhost,
                        width: "100%",
                        textAlign: "center",
                        marginBottom: 8,
                        fontSize: 12,
                      }}
                      onClick={exportAllData}
                    >
                      Export all data (JSON)
                    </button>
                    <button
                      style={{
                        ...S.btnGhost,
                        width: "100%",
                        textAlign: "center",
                        marginBottom: 8,
                        fontSize: 12,
                      }}
                      onClick={() => restoreFileRef.current?.click()}
                    >
                      Restore backup (JSON)
                    </button>
                    {(securitySettings?.dataExportHistory || []).length > 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          textAlign: "center",
                        }}
                      >
                        Last export:{" "}
                        {securitySettings.dataExportHistory.slice(-1)[0]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div style={{ ...S.card, borderColor: C.red }}>
          <span style={{ ...S.lbl, color: C.red }}>Data</span>
          <button
            style={{
              ...S.btnGhost,
              color: C.red,
              borderColor: C.red,
              width: "100%",
              textAlign: "center",
              fontSize: 12,
            }}
            onClick={() => {
              if (!confirm("Clear all data? This cannot be undone.")) return;
              Promise.all([
                storage.setJSON(STORAGE_KEYS.profile, DEFAULT_OPS),
                storage.remove(STORAGE_KEYS.navigation),
                storage.remove(STORAGE_KEYS.activeWorkout),
                storage.remove(STORAGE_KEYS.dailyCheckin),
                storage.remove(STORAGE_KEYS.growth),
              ]).then(() => window.location.reload());
            }}
          >
            Reset All Data
          </button>
        </div>
        <div
          style={{
            textAlign: "center",
            padding: "16px 0",
            fontSize: 10,
            color: C.muted,
          }}
        >
          Personal Ops Hub · v1.0 · {TODAY}
        </div>
      </div>
    );
  }

  function NavIcon({ id, active }) {
    const clr = active ? C.white : C.muted;
    // All paths are Material Design 24x24 viewBox
    const p = {
      // House outline → filled on active
      home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
      // Calendar grid
      calendar:
        "M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z",
      // Checklist with dots
      tasks:
        "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 13h14v-2H7v2zm0-6v2h14V7H7zm0 10h14v-2H7v2z",
      // Inbox tray
      inbox:
        "M19 3H4.99C3.88 3 3 3.9 3 5l.01 14c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12h-4c0 1.66-1.34 3-3 3s-3-1.34-3-3H5V5h14v10z",
      // Dumbbell diagonal (Material Design fitness_center)
      training:
        "M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 5.57 2 7.71 3.43 9.14 2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22 14.86 20.57 16.28 22 18.43 19.86 19.85 18.43 22 16.28 20.57 14.86z",
      // Fork and knife / restaurant
      meals:
        "M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z",
      // Menu / more
      more: "M4 10.5c-.83 0-1.5.67-1.5 1.5S3.17 13.5 4 13.5s1.5-.67 1.5-1.5S4.83 10.5 4 10.5zm8 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm8 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z",
      // Heart pulse / ECG line (health monitoring)
      health:
        "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
      // Wallet
      finance:
        "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
      maintenance:
        "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.4l4.3 4.3-3 3-4.2-4.2c-1.1 2.4-.6 5.3 1.4 7.3 1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1 2.5-2.6z",
      // Line chart / show_chart
      insights:
        "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
      // Habit check circle
      habits:
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
      // Gear / settings
      settings:
        "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    };
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={clr}>
        <path d={p[id] || ""} />
      </svg>
    );
  }

  function HealthScreen({ activeTab = "recovery", onTabChange = () => {} }) {
    const hTab = HEALTH_TAB_IDS.includes(activeTab) ? activeTab : "recovery";
    const todayLog = dailyLogs?.[TODAY] || {};
    const records = healthRecords || {
      cycle: { currentDay: null, phase: "" },
      medications: [],
      appointments: [],
      labs: [],
      notes: "",
    };

    // Last 7 days for vitals history
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(NOW);
      d.setDate(d.getDate() - i);
      const ds = formatDateKey(d);
      return {
        ds,
        label: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()],
        log: dailyLogs?.[ds] || null,
      };
    }).reverse();
    const soreness = todayLog.soreness || 3;
    const mobility = todayLog.mobility || 3;
    const symptoms = todayLog.symptoms || "";
    const cycleDay = records.cycle?.currentDay || "";
    const cyclePhase = records.cycle?.phase || "";
    const HTABS = ["recovery", "wellness", "body", "care", "library"];

    return (
      <div style={S.body}>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 12,
            overflowX: "auto",
          }}
        >
          {HTABS.map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 10,
                border: `0.5px solid ${hTab === t ? C.sage : C.bd}`,
                background: hTab === t ? C.sageL : "transparent",
                color: hTab === t ? C.sageDk : C.muted,
                fontSize: 11,
                fontWeight: hTab === t ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <button
            style={{ ...S.btnGhost, fontSize: 11, padding: "8px 10px" }}
            onClick={() => openTab("training")}
          >
            Open Fitness
          </button>
          <button
            style={{ ...S.btnGhost, fontSize: 11, padding: "8px 10px" }}
            onClick={() => openTab("meals")}
          >
            Open Nutrition
          </button>
          <button
            style={{ ...S.btnGhost, fontSize: 11, padding: "8px 10px" }}
            onClick={() => openTab("habits")}
          >
            Open Lifestyle
          </button>
        </div>

        {hTab === "recovery" && (
          <div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 10 }}>
                <div>
                  <span style={S.lbl}>Recovery Today</span>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.tx }}>
                    {recoveryToday.level}
                  </div>
                </div>
                <span
                  style={S.pill(
                    recoveryToday.level === "Low"
                      ? C.redL
                      : recoveryToday.level === "Moderate"
                        ? C.amberL
                        : C.sageL,
                    recoveryToday.level === "Low"
                      ? C.red
                      : recoveryToday.level === "Moderate"
                        ? C.amberDk
                        : C.sageDk,
                  )}
                >
                  {recoveryToday.readiness}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Sleep
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                    {todayLog.sleepHours || "—"}h
                  </div>
                </div>
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Energy
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                    {todayLog.energyScore || "—"}/10
                  </div>
                </div>
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Soreness
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                    {soreness}/5
                  </div>
                </div>
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Mobility
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                    {mobility}/5
                  </div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <span style={S.lbl}>Body feedback</span>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                Keep body-state inputs here. Behavior tracking lives in
                Lifestyle.
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    style={{
                      ...S.btnGhost,
                      flex: 1,
                      fontSize: 11,
                      borderColor: soreness === val ? C.red : C.bd,
                      color: soreness === val ? C.red : C.muted,
                      background: soreness === val ? C.redL : "transparent",
                    }}
                    onClick={() => saveDailyLog({ soreness: val })}
                  >
                    S{val}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    style={{
                      ...S.btnGhost,
                      flex: 1,
                      fontSize: 11,
                      borderColor: mobility === val ? C.navy : C.bd,
                      color: mobility === val ? C.navy : C.muted,
                      background: mobility === val ? C.navyL : "transparent",
                    }}
                    onClick={() => saveDailyLog({ mobility: val })}
                  >
                    M{val}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {hTab === "wellness" && (
          <div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Hydration today</span>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {todayH} / {hydGoal} oz
                </span>
              </div>
              <ProgressBar value={todayH} max={hydGoal} color={C.navy} />
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                {[8, 12, 16, 20].map((oz) => (
                  <button
                    key={oz}
                    style={S.btnSmall(C.navy)}
                    onClick={() =>
                      updateProfile((p) => ({
                        ...p,
                        hydr: {
                          ...p.hydr,
                          [TODAY]: Math.max(0, (p.hydr[TODAY] || 0) + oz),
                        },
                      }))
                    }
                  >
                    +{oz} oz
                  </button>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <span style={S.lbl}>Energy and sleep — last 7 days</span>
              {last7.every((d) => !d.log) ? (
                <div
                  style={{
                    fontSize: 12,
                    color: C.muted,
                    padding: "12px 0",
                    textAlign: "center",
                  }}
                >
                  No data yet. Log your energy from the Home screen.
                </div>
              ) : (
                <div>
                  {last7.map(({ ds, label, log }) => (
                    <div
                      key={ds}
                      style={{
                        ...S.row,
                        padding: "7px 0",
                        borderBottom: `0.5px solid ${C.bd}`,
                      }}
                    >
                      <div style={{ width: 28, flexShrink: 0 }}>
                        <div style={{ fontSize: 9, color: C.muted }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {ds.slice(5)}
                        </div>
                      </div>
                      {log?.energyScore ? (
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 2 }}>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                <div
                                  key={n}
                                  style={{
                                    flex: 1,
                                    height: 6,
                                    borderRadius: 2,
                                    background:
                                      n <= log.energyScore ? C.sage : C.surf,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.tx,
                              width: 20,
                              textAlign: "right",
                            }}
                          >
                            {log.energyScore}
                          </span>
                          {log.sleepHours && (
                            <span
                              style={{
                                fontSize: 10,
                                color: C.muted,
                                width: 28,
                                textAlign: "right",
                              }}
                            >
                              {log.sleepHours}h
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ flex: 1, fontSize: 11, color: C.muted }}>
                          not logged
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Symptoms</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const next =
                      prompt("Symptoms or notes for today?", symptoms) || "";
                    saveDailyLog({ symptoms: next });
                  }}
                >
                  Update
                </button>
              </div>
              <div style={{ fontSize: 12, color: C.tx }}>
                {symptoms || "No symptoms logged today."}
              </div>
            </div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Cycle</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const currentDay = prompt("Cycle day?", cycleDay) || "";
                    const phase = prompt("Cycle phase?", cyclePhase) || "";
                    updateProfile((p) => ({
                      ...p,
                      healthRecords: {
                        ...(p.healthRecords || {}),
                        cycle: { currentDay, phase },
                      },
                    }));
                  }}
                >
                  Update
                </button>
              </div>
              <div style={{ fontSize: 12, color: C.tx }}>
                Day {cycleDay || "—"}
                {cyclePhase ? ` · ${cyclePhase}` : ""}
              </div>
            </div>
          </div>
        )}

        {hTab === "body" && (
          <div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Biometrics</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const weight =
                      prompt(
                        "Body weight (lb)?",
                        todayLog.weight || profile.userProfile?.weight || "",
                      ) || "";
                    const restingHr =
                      prompt("Resting HR?", todayLog.restingHr || "") || "";
                    const hrv = prompt("HRV?", todayLog.hrv || "") || "";
                    saveDailyLog({
                      weight: parseFloat(weight) || null,
                      restingHr: parseInt(restingHr) || null,
                      hrv: parseInt(hrv) || null,
                    });
                  }}
                >
                  Log
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Weight
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
                    {todayLog.weight || profile.userProfile?.weight || "—"}
                  </div>
                </div>
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    Resting HR
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
                    {todayLog.restingHr || "—"}
                  </div>
                </div>
                <div
                  style={{
                    background: C.surf,
                    borderRadius: 12,
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>
                    HRV
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
                    {todayLog.hrv || "—"}
                  </div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Labs</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const label = prompt("Lab result label?");
                    if (!label) return;
                    const value = prompt("Value / note?") || "";
                    updateProfile((p) => ({
                      ...p,
                      healthRecords: {
                        ...(p.healthRecords || {}),
                        labs: [
                          { id: Date.now(), label, value, date: TODAY },
                          ...(p.healthRecords?.labs || []),
                        ].slice(0, 8),
                      },
                    }));
                  }}
                >
                  Add
                </button>
              </div>
              {(records.labs || []).length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>
                  No labs logged yet.
                </div>
              ) : (
                (records.labs || []).map((lab, idx) => (
                  <div
                    key={lab.id || idx}
                    style={{
                      ...S.row,
                      padding: "8px 0",
                      borderBottom:
                        idx < (records.labs || []).length - 1
                          ? `0.5px solid ${C.bd}`
                          : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: C.tx }}>
                        {lab.label}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>
                        {lab.value} · {formatDate(lab.date, "monthDayShort")}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {hTab === "care" && (
          <div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Medications</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const name = prompt("Medication or supplement name?");
                    if (!name) return;
                    const dose = prompt("Dose / instructions?") || "";
                    updateProfile((p) => ({
                      ...p,
                      healthRecords: {
                        ...(p.healthRecords || {}),
                        medications: [
                          { id: Date.now(), name, dose },
                          ...(p.healthRecords?.medications || []),
                        ].slice(0, 10),
                      },
                    }));
                  }}
                >
                  Add
                </button>
              </div>
              {(records.medications || []).length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>
                  No medications logged.
                </div>
              ) : (
                (records.medications || []).map((med, idx) => (
                  <div
                    key={med.id || idx}
                    style={{
                      padding: "8px 0",
                      borderBottom:
                        idx < (records.medications || []).length - 1
                          ? `0.5px solid ${C.bd}`
                          : "none",
                    }}
                  >
                    <div style={{ fontSize: 12, color: C.tx }}>{med.name}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>
                      {med.dose}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={S.card}>
              <div style={{ ...S.row, marginBottom: 8 }}>
                <span style={S.lbl}>Appointments</span>
                <button
                  style={{ ...S.btnGhost, fontSize: 11 }}
                  onClick={() => {
                    const title = prompt("Appointment title?");
                    if (!title) return;
                    const date = prompt("Date?", TODAY) || TODAY;
                    updateProfile((p) => ({
                      ...p,
                      healthRecords: {
                        ...(p.healthRecords || {}),
                        appointments: [
                          { id: Date.now(), title, date },
                          ...(p.healthRecords?.appointments || []),
                        ].slice(0, 10),
                      },
                    }));
                  }}
                >
                  Add
                </button>
              </div>
              {(records.appointments || []).length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>
                  No appointments scheduled.
                </div>
              ) : (
                (records.appointments || []).map((appt, idx) => (
                  <div
                    key={appt.id || idx}
                    style={{
                      ...S.row,
                      padding: "8px 0",
                      borderBottom:
                        idx < (records.appointments || []).length - 1
                          ? `0.5px solid ${C.bd}`
                          : "none",
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.tx }}>
                      {appt.title}
                    </span>
                    <span style={{ fontSize: 10, color: C.muted }}>
                      {formatDate(appt.date, "primary")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {hTab === "library" && (
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              On-demand sessions for recovery days. Tap Start to launch in
              Training.
            </div>
            {["Pilates", "Mobility", "Recovery", "Stretching"].map((cat) => {
              const sessions = RECOVERY_LIBRARY_SESSIONS.filter(
                (s) => s.libraryCategory === cat,
              );
              if (!sessions.length) return null;
              const accent =
                cat === "Pilates"
                  ? C.sage
                  : cat === "Mobility"
                    ? C.amber
                    : cat === "Recovery"
                      ? C.navy
                      : C.sageDk;
              const accentL =
                cat === "Pilates"
                  ? C.sageL
                  : cat === "Mobility"
                    ? C.amberL
                    : cat === "Recovery"
                      ? C.navyL
                      : C.sageL;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.muted,
                      fontWeight: 600,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      marginBottom: 6,
                      paddingLeft: 2,
                    }}
                  >
                    {cat}
                  </div>
                  {sessions.map((session) => (
                    <div
                      key={session.id || session.name}
                      style={{
                        ...S.card,
                        padding: "12px",
                        marginBottom: 6,
                        borderLeft: `3px solid ${accent}`,
                      }}
                    >
                      <div
                        style={{ ...S.row, alignItems: "flex-start", gap: 8 }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.tx,
                            }}
                          >
                            {session.name}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: C.muted,
                              marginTop: 2,
                            }}
                          >
                            {session.duration || session.dur} · {cat}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: C.tx2,
                              marginTop: 4,
                              lineHeight: 1.4,
                            }}
                          >
                            {session.purpose}
                          </div>
                        </div>
                        <button
                          style={{ ...S.btnSmall(accent), flexShrink: 0 }}
                          onClick={() => {
                            const hydrated = hydrateWorkoutSession({
                              ...session,
                              warmup: getWarmupForCategory(
                                session.warmupKey || "mobility",
                              ),
                              cooldown: getCooldownForCategory(
                                session.cooldownKey || "mobility",
                              ),
                            });
                            launchWorkout(hydrated);
                            openTab("training");
                          }}
                        >
                          Start
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function InsightsScreen() {
    const [weekReviewCard, setWeekReviewCard] = useState(null);
    const growthEvents = Array.isArray(growthState.events)
      ? growthState.events
      : [];
    const growthCount = (type) =>
      growthEvents.filter((event) => event.type === type).length;
    const activationSummary = [
      { label: "App opens", value: growthCount("app_open") },
      { label: "Onboarding shown", value: growthCount("onboarding_shown") },
      { label: "Install CTA shown", value: growthCount("install_cta_shown") },
      { label: "Installs accepted", value: growthCount("install_accepted") },
      { label: "First value reached", value: growthState.firstValueAt ? 1 : 0 },
    ];
    function generateWeeklyReview() {
      const wkStart = weekKey(NOW);
      const wkEnd = addDaysIso(wkStart, 7);
      const weekDays = Array.from({ length: 7 }, (_, i) =>
        addDaysIso(wkStart, i),
      );
      const tasksCompleted = (taskHistory || []).filter(
        (t) =>
          t.done &&
          t.updatedAt &&
          t.updatedAt.slice(0, 10) >= wkStart &&
          t.updatedAt.slice(0, 10) < wkEnd,
      ).length;
      const tasksTotal = (taskHistory || []).filter(
        (t) => !t.parentId && t.date >= wkStart && t.date < wkEnd,
      ).length;
      const workoutsCount = (workoutHistory || []).filter(
        (h) => h.date >= wkStart && h.date < wkEnd,
      ).length;
      const dailyHabitCount = (habits || []).filter(
        (h) => h.frequencyType === "daily",
      ).length;
      const habitDueCounts = weekDays.length * dailyHabitCount;
      const habitDone = weekDays.reduce(
        (s, d) => s + (dailyLogs[d]?.habitsCompleted || []).length,
        0,
      );
      const habitRate =
        habitDueCounts > 0
          ? Math.round((habitDone / habitDueCounts) * 100)
          : null;
      const energyLogs = weekDays
        .map((d) => dailyLogs[d]?.energyScore)
        .filter(Boolean);
      const avgEnergyWk = energyLogs.length
        ? +(energyLogs.reduce((s, n) => s + n, 0) / energyLogs.length).toFixed(
            1,
          )
        : null;
      const snapshot = {
        week: wkStart,
        weekLabel: `Week of ${wkStart}`,
        createdAt: new Date().toISOString(),
        workouts: workoutsCount,
        inboxPending: (inboxItems || []).filter((x) => x.status === "pending")
          .length,
        transactions: (transactions || []).filter(
          (t) => t.date >= wkStart && t.date < wkEnd,
        ).length,
        habitsCompleted: weekDays.filter(
          (d) => (dailyLogs[d]?.habitsCompleted || []).length > 0,
        ).length,
        tasksCompleted,
        tasksTotal,
        workoutsCount,
        habitRate,
        avgEnergy: avgEnergyWk,
      };
      updateProfile((p) => ({
        ...p,
        weeklySnapshots: [snapshot, ...(p.weeklySnapshots || [])],
      }));
      setWeekReviewCard(snapshot);
      showNotif("Weekly review saved", "success");
    }
    const logs = Object.values(dailyLogs || {}).filter((l) => l.energyScore);
    const withSleep7 = logs.filter((l) => l.sleepHours >= 7);
    const withSleep6 = logs.filter((l) => l.sleepHours < 6);
    const avgEnergy = logs.length
      ? +(logs.reduce((s, l) => s + l.energyScore, 0) / logs.length).toFixed(1)
      : null;
    const avgE7 = withSleep7.length
      ? +(
          withSleep7.reduce((s, l) => s + l.energyScore, 0) / withSleep7.length
        ).toFixed(1)
      : null;
    const avgE6 = withSleep6.length
      ? +(
          withSleep6.reduce((s, l) => s + l.energyScore, 0) / withSleep6.length
        ).toFixed(1)
      : null;
    const withWkt = logs.filter((l) => l.workoutDone);
    const withoutWkt = logs.filter((l) => !l.workoutDone);
    const avgEWkt = withWkt.length
      ? +(
          withWkt.reduce((s, l) => s + l.energyScore, 0) / withWkt.length
        ).toFixed(1)
      : null;
    const avgENoWkt = withoutWkt.length
      ? +(
          withoutWkt.reduce((s, l) => s + l.energyScore, 0) / withoutWkt.length
        ).toFixed(1)
      : null;
    const totalWorkouts = workoutHistory.length;
    const totalMiles = workoutHistory
      .filter((h) => h.type === "run")
      .reduce((s, h) => s + (parseFloat(h.data?.dist2) || 0), 0);
    const longestStreak = (habits || []).reduce(
      (best, h) => Math.max(best, computeStreak(h, dailyLogs)),
      0,
    );
    const snapshots = [...(profile.weeklySnapshots || [])].slice().reverse();
    const lowRecoveryRuns = workoutHistory.filter(
      (h) => h.type === "run" && h.data?.recoveryState === "Low",
    );
    const strongRecoveryRuns = workoutHistory.filter(
      (h) => h.type === "run" && h.data?.recoveryState === "High",
    );
    const avgRunDistance = (entries) =>
      entries.length
        ? entries.reduce((s, h) => s + (parseFloat(h.data?.dist2) || 0), 0) /
          entries.length
        : null;
    const lowVsHighRunDelta =
      avgRunDistance(strongRecoveryRuns) && avgRunDistance(lowRecoveryRuns)
        ? Math.round(
            (1 -
              avgRunDistance(lowRecoveryRuns) /
                avgRunDistance(strongRecoveryRuns)) *
              100,
          )
        : null;
    const insightItems = [];
    if (avgE7 && avgE6) {
      const diff = +(avgE7 - avgE6).toFixed(1);
      insightItems.push(
        diff > 0
          ? `Your energy is ${diff} points higher when sleep reaches 7+ hours.`
          : `Sleep consistency is not yet showing a clear energy benefit.`,
      );
    }
    if (lowVsHighRunDelta != null) {
      insightItems.push(
        lowVsHighRunDelta > 0
          ? `Low recovery days reduce logged run output by about ${lowVsHighRunDelta}% versus high recovery days.`
          : `Run output stays relatively stable even on lower recovery days.`,
      );
    }
    if ((athlete?.weakStations || []).length > 0) {
      insightItems.push(
        `${athlete.weakStations[0]} is currently your weakest station. Build drills around it.`,
      );
    }
    if (!insightItems.length) {
      insightItems.push(
        "Log more recovery and workout data to unlock stronger pattern detection.",
      );
    }
    return (
      <div style={S.body}>
        <div style={S.card}>
          <span style={S.lbl}>Activation Funnel</span>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 10,
            }}
          >
            Local growth metrics
          </div>
          {activationSummary.map((item, idx) => (
            <div
              key={item.label}
              style={{
                ...S.row,
                padding: "7px 0",
                borderBottom:
                  idx < activationSummary.length - 1
                    ? `0.5px solid ${C.bd}`
                    : "none",
              }}
            >
              <span style={{ fontSize: 12, color: C.muted }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                {item.value}
              </span>
            </div>
          ))}
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {[
              {
                label: "Morning check-in",
                done: growthState.activationChecklist.checkInCompleted,
              },
              {
                label: "Set priorities",
                done: growthState.activationChecklist.prioritiesSet,
              },
              {
                label: "Complete one action",
                done: growthState.activationChecklist.actionCompleted,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: C.tx2,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: item.done ? C.sage : C.surf,
                    color: item.done ? C.white : C.muted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {item.done ? "✓" : "•"}
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.card}>
          <div style={{ ...S.row, marginBottom: weekReviewCard ? 12 : 0 }}>
            <div>
              <span style={S.lbl}>Weekly Review</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
                Capture this week's data
              </div>
            </div>
            <button style={S.btnSmall(C.sage)} onClick={generateWeeklyReview}>
              Generate
            </button>
          </div>
          {weekReviewCard && (
            <div
              style={{
                background: C.surf,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.tx,
                  marginBottom: 6,
                }}
              >
                {weekReviewCard.weekLabel}
              </div>
              <div
                style={{
                  ...S.row,
                  padding: "4px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <span style={{ fontSize: 11, color: C.muted }}>
                  Tasks completed
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
                  {weekReviewCard.tasksCompleted} / {weekReviewCard.tasksTotal}
                </span>
              </div>
              <div
                style={{
                  ...S.row,
                  padding: "4px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <span style={{ fontSize: 11, color: C.muted }}>Workouts</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.sage }}>
                  {weekReviewCard.workoutsCount}
                </span>
              </div>
              {weekReviewCard.habitRate != null && (
                <div
                  style={{
                    ...S.row,
                    padding: "4px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Habit completion
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: weekReviewCard.habitRate >= 70 ? C.sage : C.amber,
                    }}
                  >
                    {weekReviewCard.habitRate}%
                  </span>
                </div>
              )}
              {weekReviewCard.avgEnergy != null && (
                <div style={{ ...S.row, padding: "4px 0" }}>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Avg energy
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
                    {weekReviewCard.avgEnergy}/10
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={S.card}>
          <span style={S.lbl}>Interpretation</span>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: C.tx,
              marginBottom: 8,
            }}
          >
            Auto-generated patterns
          </div>
          {insightItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 12,
                color: C.tx,
                marginBottom: idx < insightItems.length - 1 ? 8 : 0,
              }}
            >
              {item}
            </div>
          ))}
        </div>
        {/* Health trends */}
        <div style={S.card}>
          <span style={S.lbl}>Health Trends</span>
          {logs.length < 3 ? (
            <div style={{ fontSize: 12, color: C.muted }}>
              Log energy for 3+ days to see correlations.
            </div>
          ) : (
            <div>
              <div
                style={{
                  ...S.row,
                  padding: "7px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <span style={{ fontSize: 12, color: C.muted }}>
                  Avg energy score
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                  {avgEnergy}/10
                </span>
              </div>
              {avgE7 && (
                <div
                  style={{
                    ...S.row,
                    padding: "7px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Energy w/ 7+ hrs sleep
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: C.sage }}
                  >
                    {avgE7}
                  </span>
                </div>
              )}
              {avgE6 && (
                <div
                  style={{
                    ...S.row,
                    padding: "7px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Energy w/ &lt;6 hrs sleep
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
                    {avgE6}
                  </span>
                </div>
              )}
              {avgEWkt && (
                <div
                  style={{
                    ...S.row,
                    padding: "7px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Energy on workout days
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: C.sage }}
                  >
                    {avgEWkt}
                  </span>
                </div>
              )}
              {avgENoWkt && (
                <div style={{ ...S.row, padding: "7px 0" }}>
                  <span style={{ fontSize: 11, color: C.muted }}>
                    Energy on rest days
                  </span>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: C.muted }}
                  >
                    {avgENoWkt}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Fitness summary */}
        <div style={S.card}>
          <span style={S.lbl}>Fitness</span>
          <div
            style={{
              ...S.row,
              padding: "7px 0",
              borderBottom: `0.5px solid ${C.bd}`,
            }}
          >
            <span style={{ fontSize: 12, color: C.muted }}>
              Total workouts logged
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
              {totalWorkouts}
            </span>
          </div>
          <div
            style={{
              ...S.row,
              padding: "7px 0",
              borderBottom: `0.5px solid ${C.bd}`,
            }}
          >
            <span style={{ fontSize: 12, color: C.muted }}>
              Total miles run
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
              {totalMiles.toFixed(1)}
            </span>
          </div>
          <div style={{ ...S.row, padding: "7px 0" }}>
            <span style={{ fontSize: 12, color: C.muted }}>Days to race</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: PH.clr }}>
              {DTR}
            </span>
          </div>
        </div>
        {/* Finance summary */}
        {(transactions || []).length > 0 && (
          <div style={S.card}>
            <span style={S.lbl}>Finance Trends</span>
            <div
              style={{
                ...S.row,
                padding: "7px 0",
                borderBottom: `0.5px solid ${C.bd}`,
              }}
            >
              <span style={{ fontSize: 12, color: C.muted }}>
                This month spend
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                {fmtMoney(monthSpend)}
              </span>
            </div>
            <div
              style={{
                ...S.row,
                padding: "7px 0",
                borderBottom: `0.5px solid ${C.bd}`,
              }}
            >
              <span style={{ fontSize: 12, color: C.muted }}>
                Recurring total / mo
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                {fmtMoney(
                  (recurringExpenses || []).reduce(
                    (s, r) => s + r.averageAmount,
                    0,
                  ),
                )}
              </span>
            </div>
            {catSpend.slice(0, 1).map((c) => (
              <div key={c.id} style={{ ...S.row, padding: "7px 0" }}>
                <span style={{ fontSize: 12, color: C.muted }}>
                  Top category
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: c.clr }}>
                  {c.label} {fmtMoney(c.total)}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Habits */}
        {(habits || []).length > 0 && (
          <div style={S.card}>
            <span style={S.lbl}>Habit Trends</span>
            <div
              style={{
                ...S.row,
                padding: "7px 0",
                borderBottom: `0.5px solid ${C.bd}`,
              }}
            >
              <span style={{ fontSize: 12, color: C.muted }}>
                Longest current streak
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.sage }}>
                {longestStreak}d
              </span>
            </div>
            {(habits || []).map((h) => (
              <div
                key={h.id}
                style={{
                  ...S.row,
                  padding: "6px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <span style={{ fontSize: 12, color: C.tx }}>{h.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>
                  {computeStreak(h, dailyLogs)}d
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={S.card}>
          <span style={S.lbl}>History Timeline</span>
          {snapshots.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>
              No weekly snapshots yet.
            </div>
          ) : (
            snapshots.slice(0, 8).map((s) => (
              <div
                key={s.week}
                style={{
                  ...S.row,
                  padding: "7px 0",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: C.tx }}>
                    Week of {s.week}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {s.workouts} workouts · {s.transactions} transactions ·{" "}
                    {s.inboxPending} inbox items
                  </div>
                </div>
                <span style={{ fontSize: 10, color: C.muted }}>
                  {formatDate(s.createdAt, "monthDayShort")}
                </span>
              </div>
            ))
          )}
        </div>
        {/* Home maintenance */}
        <div style={S.card}>
          <span style={S.lbl}>Home Maintenance</span>
          {(() => {
            const done = maintenanceQueue.filter((item) => item.lastCompleted);
            const overdue = maintenanceQueue.filter(
              (item) => item.status === "overdue",
            );
            return (
              <div>
                <div
                  style={{
                    ...S.row,
                    padding: "7px 0",
                    borderBottom: `0.5px solid ${C.bd}`,
                  }}
                >
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Tasks completed
                  </span>
                  <span
                    style={{ fontSize: 14, fontWeight: 700, color: C.sage }}
                  >
                    {done.length}
                  </span>
                </div>
                <div style={{ ...S.row, padding: "7px 0" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Overdue</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: overdue.length > 0 ? C.red : C.sage,
                    }}
                  >
                    {overdue.length}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  function MoreScreen() {
    const openTaskCount = Array.isArray(taskHistory)
      ? taskHistory.filter(
          (t) => !t.done && !t.parentId && (t.status || "active") === "active",
        ).length
      : 0;
    const financeReviewCount = typeof unreviewed === "number" ? unreviewed : 0;
    const urgentMaintenanceCount = Array.isArray(maintenanceAttentionItems)
      ? maintenanceAttentionItems.length
      : 0;
    const nextMaintenanceItem = Array.isArray(maintenanceAttentionItems)
      ? maintenanceAttentionItems[0]
      : null;
    const secondarySections = [
      {
        title: "Recovery and Health",
        items: [
          {
            id: "health",
            label: "Recovery",
            detail: "Sleep, recovery, wellness, appointments, and biometrics.",
          },
          {
            id: "habits",
            label: "Lifestyle",
            detail: "Routines, repeated behaviors, and low-friction structure.",
          },
        ],
      },
      {
        title: "Operations",
        items: [
          {
            id: "maintenance",
            label: "Maintenance",
            detail: nextMaintenanceItem
              ? `Next: ${nextMaintenanceItem.label} · ${getMaintenanceNextLabel(nextMaintenanceItem)}`
              : "No action due today.",
          },
          {
            id: "tasks",
            label: "Tasks",
            detail: `${openTaskCount} open task${openTaskCount !== 1 ? "s" : ""} across your system.`,
          },
          {
            id: "finance",
            label: "Finance",
            detail: `${financeReviewCount} transaction${financeReviewCount !== 1 ? "s" : ""} waiting for review.`,
          },
        ],
      },
      {
        title: "Review and Settings",
        items: [
          {
            id: "insights",
            label: "Insights",
            detail: "Patterns, history, and weekly review summaries.",
          },
          {
            id: "settings",
            label: "Settings",
            detail: "Backup, restore, preferences, and app controls.",
          },
        ],
      },
    ];

    return (
      <div style={S.body}>
        <div style={S.card}>
          <div style={{ ...S.row, alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <span style={S.lbl}>More</span>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
                Secondary workspaces
              </div>
            </div>
            {urgentMaintenanceCount > 0 && (
              <span style={S.pill(C.redL, C.red)}>
                {urgentMaintenanceCount} urgent
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.tx2 }}>
            Today, Calendar, Nutrition, and Fitness stay in the primary nav.
            Everything else lives here.
          </div>
        </div>

        {secondarySections.map((section) => (
          <div key={section.title} style={S.card}>
            <span style={S.lbl}>{section.title}</span>
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => openTab(item.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  cursor: "pointer",
                  borderBottom: `0.5px solid ${C.bd}`,
                }}
              >
                <div style={{ ...S.row, alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: C.tx2, marginTop: 2 }}>
                      {item.detail}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, color: C.muted, flexShrink: 0 }}>
                    ›
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}

        <div style={S.card}>
          <div style={{ ...S.row, marginBottom: 10 }}>
            <div>
              <span style={S.lbl}>Quick Planning</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
                Weekly setup and command access
              </div>
            </div>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
          >
            <button
              style={{ ...S.btnGhost, width: "100%" }}
              onClick={() => setShowWeeklyPlanner(true)}
            >
              Open Weekly Planner
            </button>
            <button
              style={{ ...S.btnGhost, width: "100%" }}
              onClick={openCommandBar}
            >
              Open Command Bar
            </button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <button style={{...S.btnGhost,width:'100%'}} onClick={()=>setShowWeeklyPlanner(true)}>Open Weekly Planner</button>
          <button style={{...S.btnGhost,width:'100%'}} onClick={openCommandBar}>Open Command Bar</button>
        </div>
      </div>
    );
  }

  // Primary navigation: Today · Calendar · Nutrition · Fitness · More
  const NAV_ITEMS = [
    { id: "home", label: "Today" },
    { id: "calendar", label: "Calendar" },
    { id: "meals", label: "Nutrition" },
    { id: "training", label: "Fitness" },
    { id: "more", label: "More" },
  ];
  const MORE_TAB_IDS = new Set([
    "tasks",
    "finance",
    "habits",
    "health",
    "maintenance",
    "insights",
    "settings",
    "more",
  ]);
  const TAB_TITLES = {
    home: "Today",
    calendar: "Calendar",
    tasks: "Tasks",
    training: "Fitness",
    meals: "Nutrition",
    finance: "Finance",
    habits: "Lifestyle",
    health: "Recovery",
    maintenance: "Maintenance",
    insights: "Insights",
    settings: "Settings",
    more: "More",
  };
  const SCREENS = {
    home: HomeScreenV2,
    calendar: () =>
      React.createElement(CalendarScreen, {
        focusDay: calendarFocusDay,
        onSelectDay: setCalendarFocusDay,
      }),
    tasks: () =>
      React.createElement(TasksScreen, {
        activeTab: taskScreenTab,
        onTabChange: setTaskScreenTab,
      }),
    training: TrainingScreen,
    meals: MealsScreen,
    finance: () =>
      React.createElement(FinanceScreen, {
        activeView: finView,
        onViewChange: setFinView,
      }),
    habits: () =>
      React.createElement(LifestyleScreen, {
        activeTab: lifestyleScreenTab,
        onTabChange: setLifestyleScreenTab,
        lifestyleOpen,
        setLifestyleOpen,
      }),
    health: () =>
      React.createElement(HealthScreen, {
        activeTab: healthScreenTab,
        onTabChange: setHealthScreenTab,
      }),
    maintenance: MaintenanceScreen,
    insights: InsightsScreen,
    settings: () =>
      React.createElement(SettingsScreen, {
        activeSection: settingsSection,
        onSectionChange: setSettingsSection,
      }),
    more: MoreScreen,
  };
  const activePrimaryTab = MORE_TAB_IDS.has(tab)
    ? "more"
    : NAV_ITEMS.some((item) => item.id === tab)
      ? tab
      : null;
  const ActiveScreen = SCREENS[tab] || HomeScreenV2;
  const screenFallback = (
    <div style={S.body}>
      <div style={S.card}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: C.tx,
            marginBottom: 6,
          }}
        >
          Screen failed to render
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
          Resetting to Today will recover the app if a screen throws during
          navigation.
        </div>
        <button style={S.btnGhost} onClick={() => openTab("home")}>
          Back to Today
        </button>
      </div>
    </div>
  );

  const hr = NOW.getHours();
  const greeting =
    hr >= 6 && hr < 12
      ? "Good morning"
      : hr >= 12 && hr < 17
        ? "Good afternoon"
        : "Good evening";

  return (
    <div style={S.wrap}>
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <NotificationBanner
        message={notif}
        type={notifType}
        detail={notifDetail}
        actionLabel={notifAction?.label}
        onAction={notifAction?.handler}
        onDismiss={clearNotif}
      />
      {tab==='home'
        ?<Header
          C={C}
          S={S}
          greeting={greeting}
          name={profile.userProfile?.name||'there'}
          dateLabel={formatDate(NOW,'primary')}
          dateTitle={formatDate(NOW,'primaryWithYear')}
          inboxCount={pendingInbox.length}
          onOpenCalendar={()=>openTab('calendar',{calendarFocusDay:TODAY})}
          onOpenInbox={()=>openTab('tasks',{taskTab:'inbox'})}
          onOpenBrainDump={openBrainDump}
        />
        :<div style={S.hdr}>
          <div style={S.sectionTitle}>
            {TAB_TITLES[tab]||TAB_TITLES.home}
          </div>
        </div>}
      <main id="app-main" ref={contentRef} tabIndex={-1} style={{overflowY:'auto',height:'calc(100vh - 64px - 64px)',paddingTop:64,paddingBottom:12}}>
        <ScreenErrorBoundary resetKey={tab} fallback={screenFallback}>
          <ActiveScreen focusDay={calendarFocusDay} />
        </ScreenErrorBoundary>
      </main>
      <nav aria-label="Primary" style={S.nav}>
        {NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            style={{
              ...S.navBtn(activePrimaryTab === id, navFocusId === id),
              position: "relative",
              opacity: activePrimaryTab === id ? 1 : 0.58,
            }}
            onFocus={() => setNavFocusId(id)}
            onBlur={() =>
              setNavFocusId((current) => (current === id ? null : current))
            }
            onClick={() => {
              if (id === "home" && tab === "home") {
                contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }
              if (id === "calendar") {
                if (tab === "calendar") setCalendarFocusDay(TODAY);
              }
              setTab(id);
            }}
            title={label}
            aria-label={label}
            aria-current={activePrimaryTab === id ? "page" : undefined}
          >
            {id === "more" &&
              maintenanceAttentionItems.length + pendingInbox.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 15,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 999,
                    background: C.red,
                    color: C.white,
                    fontSize: 9,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    zIndex: 2,
                  }}
                >
                  {Math.min(
                    maintenanceAttentionItems.length + pendingInbox.length,
                    9,
                  )}
                </div>
              )}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
              }}
            >
              <NavIcon id={id} active={activePrimaryTab === id} />
            </div>
          </button>
        ))}
      </nav>
      {showImport && <ImportModal />}
      {showAddTx && <AddTxModal />}
      {showAccountModal && <AccountModal />}
      {demoExercise && (
        <ExerciseDemoModal
          exercise={demoExercise}
          onClose={() => setDemoExercise(null)}
        />
      )}
      {showWeeklyPlanner && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: C.scrim,
            zIndex: 620,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              background: C.card,
              borderRadius: "20px 20px 0 0",
              padding: "24px 16px 32px",
              width: "100%",
              maxWidth: 430,
              margin: "0 auto",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div style={{ ...S.row, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.tx }}>
                  Weekly Planner
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Turn the preview into a planning ritual.
                </div>
              </div>
              <button
                style={{ ...S.btnGhost, fontSize: 11 }}
                onClick={() => setShowWeeklyPlanner(false)}
              >
                Close
              </button>
            </div>
            {[
              {
                title: "Training",
                body: `${weekAnalytics.sessionsLogged}/${plannerWeekWorkoutGoal} sessions logged. ${plannerWorkoutStatusGlobal}.`,
                action: "Open Training",
                onClick: () => {
                  setShowWeeklyPlanner(false);
                  openTab("training");
                },
              },
              {
                title: "Tasks",
                body: `${plannerTaskCountGlobal} open tasks are assigned this week. Review and spread high-priority items across the next 7 days.`,
                action: "Open Tasks",
                onClick: () => {
                  setShowWeeklyPlanner(false);
                  openTab("tasks");
                },
              },
              {
                title: "Meals",
                body: `Protein target met on ${plannerProteinDays}/7 days and hydration target on ${plannerHydrationDays}/7. Plan ${Math.max(0, 7 - plannerProteinDays)} more high-protein days.`,
                action: "Open Meals",
                onClick: () => {
                  setShowWeeklyPlanner(false);
                  openTab("meals");
                },
              },
              {
                title: "Maintenance",
                body:
                  plannerMaintenanceCount > 0
                    ? `${plannerMaintenanceCount} open maintenance item${plannerMaintenanceCount !== 1 ? "s" : ""}. Clear the next one before it slips.`
                    : "No maintenance due right now.",
                action: "Open Maintenance",
                onClick: () => {
                  setShowWeeklyPlanner(false);
                  openTab("maintenance");
                },
              },
              {
                title: "Inbox",
                body: `${(inboxItems || []).filter((x) => x.status === "pending").length} inbox item${(inboxItems || []).filter((x) => x.status === "pending").length !== 1 ? "s" : ""} waiting. Process them into tasks, notes, or finance entries.`,
                action: "Review Inbox",
                onClick: () => {
                  setShowWeeklyPlanner(false);
                  openTab("tasks", { taskTab: "inbox" });
                },
              },
            ].map((card) => (
              <div key={card.title} style={{ ...S.card, marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.tx,
                    marginBottom: 4,
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.tx2,
                    marginBottom: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {card.body}
                </div>
                <button
                  style={{ ...S.btnSmall(C.sage), width: "100%" }}
                  onClick={card.onClick}
                >
                  {card.action}
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                style={{ ...S.btnSolid(C.navy), flex: 1 }}
                onClick={() => {
                  updateProfile((p) => ({
                    ...p,
                    lastWeeklyPlanKey: weekKey(NOW),
                  }));
                  setShowWeeklyPlanner(false);
                }}
              >
                Mark Planned
              </button>
              <button
                style={{ ...S.btnGhost, flex: 1 }}
                onClick={() => {
                  updateProfile((p) => ({
                    ...p,
                    securitySettings: {
                      ...p.securitySettings,
                      dataExportHistory: [
                        ...(p.securitySettings?.dataExportHistory || []),
                        TODAY,
                      ],
                    },
                  }));
                  showNotif("Weekly snapshot recorded", "success");
                }}
              >
                Save Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Morning check-in */}
      {showMorningCheckin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: C.scrimStrong,
            zIndex: 650,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={closeMorningCheckin}
        >
          <div
            style={{
              background: C.card,
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px 32px",
              width: "100%",
              maxWidth: 430,
              margin: "0 auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: C.tx,
                    marginBottom: 4,
                  }}
                >
                  Daily Check-In
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Answer quickly. Don&apos;t overthink.
                </div>
              </div>
              <button
                onClick={closeMorningCheckin}
                aria-label="Close daily check-in"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `1.5px solid ${C.bd}`,
                  background: "transparent",
                  color: C.tx,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                X
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Mood
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5,minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {[
                  { value: 1, face: "Awful", emoji: ":(" },
                  { value: 2, face: "Low", emoji: ":/" },
                  { value: 3, face: "Okay", emoji: ":|" },
                  { value: 4, face: "Good", emoji: ":)" },
                  { value: 5, face: "Great", emoji: ":D" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setCheckInMood(option.value)}
                    aria-pressed={checkInMood === option.value}
                    style={{
                      padding: "12px 6px",
                      borderRadius: 12,
                      border: `2px solid ${checkInMood === option.value ? C.amberDk : C.bd}`,
                      background:
                        checkInMood === option.value ? C.amberL : C.bg,
                      color: C.tx,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}
                    >
                      {option.emoji}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600 }}>
                      {option.face}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Energy
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => setCheckInEnergy(level)}
                    aria-pressed={checkInEnergy === level}
                    style={{
                      height: 44,
                      borderRadius: 12,
                      border: `2px solid ${checkInEnergy === level ? C.sage : C.bd}`,
                      background: checkInEnergy === level ? C.sageL : C.bg,
                      color: checkInEnergy === level ? C.sageDk : C.tx,
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Sleep (hours)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
                  <button
                    key={h}
                    onClick={() => setCheckInSleep(h)}
                    aria-pressed={checkInSleep === h}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: `2px solid ${checkInSleep === h ? C.navy : C.bd}`,
                      background: checkInSleep === h ? C.navyL : C.bg,
                      color: checkInSleep === h ? C.navyDk : C.tx,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: C.muted,
                  marginBottom: 8,
                }}
              >
                Stress / Load
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                  gap: 8,
                }}
              >
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => setCheckInStress(level)}
                    aria-pressed={checkInStress === level}
                    style={{
                      height: 44,
                      borderRadius: 12,
                      border: `2px solid ${checkInStress === level ? C.red : C.bd}`,
                      background: checkInStress === level ? C.redL : C.bg,
                      color: checkInStress === level ? C.red : C.tx,
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {!showCheckInNote && (
              <button
                style={{ ...S.btnGhost, width: "100%", marginBottom: 12 }}
                onClick={() => setShowCheckInNote(true)}
              >
                Add note
              </button>
            )}
            {showCheckInNote && (
              <textarea
                value={checkInNote}
                onChange={(e) => setCheckInNote(e.target.value)}
                placeholder="Optional note"
                rows={3}
                style={{
                  ...S.inp,
                  minHeight: 88,
                  resize: "vertical",
                  marginBottom: 12,
                }}
              />
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.btnSolid(C.sage)} onClick={saveMorningCheckin}>
                Save
              </button>
              <button
                style={{ ...S.btnGhost, flex: 1 }}
                onClick={closeMorningCheckin}
              >
                Skip for today
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Energy check-in modal */}
      {showEnergyIn && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: C.scrim,
            zIndex: 600,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              background: C.card,
              borderRadius: "20px 20px 0 0",
              padding: "24px 16px",
              width: "100%",
              maxWidth: 430,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: C.tx,
                marginBottom: 20,
              }}
            >
              How are you today?
            </div>
            <span style={S.lbl}>Energy (1–10)</span>
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setEnergyScore(n)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: `1.5px solid ${energyScore === n ? C.sage : C.bd}`,
                    background: energyScore === n ? C.sage : "transparent",
                    color: energyScore === n ? C.white : C.tx,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <span style={S.lbl}>Hours slept</span>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => (
                <button
                  key={h}
                  onClick={() => setSleepHours(h)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: `1.5px solid ${sleepHours === h ? C.navy : C.bd}`,
                    background: sleepHours === h ? C.navy : "transparent",
                    color: sleepHours === h ? C.white : C.tx,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.btnSolid(C.sage)} onClick={logEnergyCheckin}>
                Save
              </button>
              <button
                style={{ ...S.btnGhost, flex: 1 }}
                onClick={() => setShowEnergyIn(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Bar modal */}
      {showCapture&&(()=>{
        const routed=routeCapture(captureText);
        return <div style={{position:'fixed',inset:0,background:C.scrim,zIndex:600,display:'flex',alignItems:'flex-end'}}>
          <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px',width:'100%',maxWidth:430,margin:'0 auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:6}}>Command Bar</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
              Try: “Log chicken 120g”, “Start today’s workout”, “Add 5K time 24:10”, or “Add grocery item bananas”.
            </div>
            <FieldInput
              value={captureText}
              allowEnterSubmit
              onChange={e=>setCaptureText(e.target.value)}
              onKeyDown={e=>{
                if(e.key!=='Enter'||e.shiftKey||e.altKey||e.ctrlKey||e.metaKey||e.nativeEvent.isComposing||!routed)return;
                e.preventDefault();
                confirmCapture(routed);
              }}
              placeholder="Type a command or capture..."
              style={{...S.inp,marginBottom:10,fontSize:15}}
              autoFocus
            />
            {routed&&<div style={{...S.card,padding:'10px 12px',marginBottom:12,background:C.surf}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Routing as</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <div style={{width:22,height:22,borderRadius:6,background:routed.type==='expense'?C.amber:routed.type==='note'?C.navy:routed.type==='command'?C.red:C.sage,color:C.white,fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{routed.icon}</div>
                <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{routed.label}</span>
                <span style={{fontSize:11,color:C.muted}}>{routed.preview?.slice(0,40)}</span>
              </div>
              {routed.type!=='command'&&<div style={{display:'flex',gap:5,marginTop:8}}>
                {['task','expense','note'].map(type=><button key={type} onClick={()=>confirmCapture({...routed,type,label:type.charAt(0).toUpperCase()+type.slice(1),icon:type==='expense'?'$':type==='note'?'N':'T'})} style={{padding:'4px 10px',borderRadius:7,border:`1px solid ${routed.type===type?C.sage:C.bd}`,background:routed.type===type?C.sage:'transparent',color:routed.type===type?C.white:C.muted,fontSize:10,cursor:'pointer'}}>{type}</button>)}
              </div>}
            </div>}
            <div style={{display:'flex',gap:8}}>
              <button style={S.btnSolid(C.sage)} onClick={()=>routed&&confirmCapture(routed)} disabled={!routed}>Save</button>
              <button style={{...S.btnGhost,flex:1}} onClick={()=>{setShowCapture(false);setCaptureText('');}}>Cancel</button>
            </div>
          </div>
        </div>;
      })()}

      {/* Quarterly / Annual review modal */}
      {showReview &&
        (() => {
          const type = getReviewType() || "quarterly";
          const year = NOW.getFullYear();
          const q = Math.ceil((NOW.getMonth() + 1) / 3);
          const totalWorkouts = workoutHistory.length;
          const totalMiles = workoutHistory
            .filter((h) => h.type === "run")
            .reduce((s, h) => s + (parseFloat(h.data?.dist2) || 0), 0);
          const yearSpend = (transactions || [])
            .filter(
              (t) =>
                !t.isCredit && !t.isTransfer && t.date.startsWith(String(year)),
            )
            .reduce((s, t) => s + t.amount, 0);
          const subTotal = (recurringExpenses || []).reduce(
            (s, r) => s + r.averageAmount * 12,
            0,
          );
          const bestHabit = (habits || []).reduce((best, h) => {
            const s = computeStreak(h, dailyLogs);
            return s > (best?.streak || 0) ? { ...h, streak: s } : best;
          }, null);
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: C.bg,
                zIndex: 700,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  maxWidth: 430,
                  margin: "0 auto",
                  padding: "16px 16px 80px",
                }}
              >
                <div
                  style={{
                    ...S.row,
                    marginBottom: 20,
                    paddingTop: "env(safe-area-inset-top)",
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.tx }}>
                    {type === "annual"
                      ? `${year} Annual Review`
                      : `Q${q} ${year} Review`}
                  </div>
                  <button
                    style={S.btnGhost}
                    onClick={() => setShowReview(false)}
                  >
                    Close
                  </button>
                </div>
                <div
                  style={{
                    ...S.card,
                    background: PH.lClr,
                    borderColor: "transparent",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{ fontSize: 11, color: PH.tClr, marginBottom: 4 }}
                  >
                    {type === "annual" ? "Year in review" : "Quarter in review"}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    {[
                      { l: "Workouts", v: totalWorkouts },
                      { l: "Miles run", v: totalMiles.toFixed(1) },
                      { l: "Spend YTD", v: fmtMoney(yearSpend) },
                      { l: "Subscriptions/yr", v: fmtMoney(subTotal) },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <div style={{ fontSize: 9, color: PH.tClr }}>{l}</div>
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 700,
                            color: PH.clr,
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {bestHabit && (
                  <div style={S.card}>
                    <span style={S.lbl}>Most consistent habit</span>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.tx }}>
                      {bestHabit.name}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {bestHabit.streak}d current streak
                    </div>
                  </div>
                )}
                <div style={S.card}>
                  <span style={S.lbl}>Home maintenance</span>
                  <div style={{ fontSize: 13, color: C.tx }}>
                    {Object.keys(maintenanceHistory || {}).length} tasks
                    completed this period
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Focus Mode overlay */}
      {focusTaskId &&
        (() => {
          const focusTask =
            taskHistory.find((t) => t.id === focusTaskId) || null;
          if (!focusTask) return null;
          const tmrMins =
            focusTmrSec !== null ? Math.floor(focusTmrSec / 60) : null;
          const tmrSecs = focusTmrSec !== null ? focusTmrSec % 60 : null;
          const tmrPct = focusTmrSec !== null ? focusTmrSec / (25 * 60) : 1;
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: C.navy,
                zIndex: 999,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 24px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.5)",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  marginBottom: 16,
                }}
              >
                Focus Mode
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: C.white,
                  textAlign: "center",
                  lineHeight: 1.3,
                  marginBottom: 32,
                  maxWidth: 320,
                }}
              >
                {focusTask.text}
              </div>
              {focusTmrSec !== null && (
                <div style={{ marginBottom: 32, textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 60,
                      fontWeight: 800,
                      color: C.white,
                      letterSpacing: "-2px",
                    }}
                  >
                    {String(tmrMins).padStart(2, "0")}:
                    {String(tmrSecs).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      width: 200,
                      height: 4,
                      background: "rgba(255,255,255,0.2)",
                      borderRadius: 99,
                      marginTop: 10,
                      overflow: "hidden",
                      margin: "10px auto 0",
                    }}
                  >
                    <div
                      style={{
                        width: `${tmrPct * 100}%`,
                        height: "100%",
                        background: C.white,
                        borderRadius: 99,
                        transition: "width 1s linear",
                      }}
                    />
                  </div>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  width: "100%",
                  maxWidth: 280,
                }}
              >
                {focusTmrSec === null && (
                  <button
                    style={{
                      ...S.btnSolid(),
                      background: C.sage,
                      border: "none",
                    }}
                    onClick={() => {
                      setFocusTmrSec(25 * 60);
                      setFocusTmrRunning(true);
                    }}
                  >
                    Start 25-min Timer
                  </button>
                )}
                {focusTmrSec !== null && (
                  <button
                    style={{
                      ...S.btnSolid(),
                      background: focusTmrRunning ? C.amberDk : C.sage,
                      border: "none",
                    }}
                    onClick={() => setFocusTmrRunning((r) => !r)}
                  >
                    {focusTmrRunning ? "Pause" : "Resume"}
                  </button>
                )}
                <button
                  style={{
                    ...S.btnSolid(),
                    background: C.sage,
                    border: "none",
                  }}
                  onClick={() => {
                    updateProfile((p) => ({
                      ...p,
                      taskHistory: p.taskHistory.map((t) =>
                        t.id === focusTask.id
                          ? {
                              ...t,
                              done: true,
                              status: "done",
                              updatedAt: new Date().toISOString(),
                            }
                          : t,
                      ),
                    }));
                    setFocusTaskId(null);
                    setFocusTmrSec(null);
                    setFocusTmrRunning(false);
                    showNotif("Task completed!", "success");
                  }}
                >
                  Done — Mark Complete
                </button>
                <button
                  style={{
                    ...S.btnGhost,
                    color: C.white,
                    borderColor: "rgba(255,255,255,0.3)",
                  }}
                  onClick={() => {
                    setFocusTaskId(null);
                    setFocusTmrSec(null);
                    setFocusTmrRunning(false);
                  }}
                >
                  Exit Focus
                </button>
              </div>
            </div>
          );
        })()}

      {/* Workout player overlay */}
      {showWorkoutPlayer && wkSess && (
        <WorkoutPlayer
          C={C}
          S={S}
          wkSess={wkSess}
          onComplete={() => {
            finishWk();
            setShowWorkoutPlayer(false);
          }}
          onCancel={() => {
            setWkSess(null);
            setTrainView("overview");
            setShowWorkoutPlayer(false);
          }}
        />
      )}

      {/* Flow Engine overlay */}
      {showFlow && (
        <FlowRoot
          dayType={flowDayType}
          onDayType={handleFlowDayType}
          calendarCache={calendarCache}
          todayKey={TODAY}
          now={NOW}
          onClose={() => setShowFlow(false)}
        />
      )}
    </div>
  );
}

function mountApp() {
  try {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Root element #root was not found.");
    const root = rootElement.__appRoot ?? createRoot(rootElement);
    rootElement.__appRoot = root;
    root.render(React.createElement(App));
  } catch (error) {
    console.error("App render failed:", error);
    const loading = document.getElementById("loading");
    if (loading) loading.textContent = "App failed to load. Refresh to retry.";
  }
}

mountApp();
