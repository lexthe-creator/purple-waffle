import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorkoutDecisionPrompt from './components/WorkoutDecisionPrompt.jsx';
import BrainDumpModal from './components/BrainDumpModal.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import { formatDate, formatDateRange, getDateParts } from './dateFormatter.ts';
import './styles.css';
import { FlowRoot } from './flow/FlowRoot.jsx';

const IS_DEV=import.meta.env.DEV;
const DEV_SW_RESET_KEY='__app_in_my_life_dev_sw_reset__';

window.__PERSONAL_HUB_PWA__={
  isSecureOrigin:window.isSecureContext||location.hostname==='localhost'||location.hostname==='127.0.0.1'
};

if('serviceWorker' in navigator){
  if(IS_DEV){
    navigator.serviceWorker.getRegistrations()
      .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
      .catch(()=>{})
      .finally(()=>{
        if('caches' in window){
          caches.keys()
            .then(keys=>Promise.all(keys.filter(key=>key.startsWith('app-in-my-life-shell-')).map(key=>caches.delete(key))))
            .catch(()=>{})
            .finally(()=>{
              if(navigator.serviceWorker.controller&&!sessionStorage.getItem(DEV_SW_RESET_KEY)){
                sessionStorage.setItem(DEV_SW_RESET_KEY,'1');
                location.reload();
              }
            });
          return;
        }

        if(navigator.serviceWorker.controller&&!sessionStorage.getItem(DEV_SW_RESET_KEY)){
          sessionStorage.setItem(DEV_SW_RESET_KEY,'1');
          location.reload();
        }
      });
  }else{
    window.addEventListener('load',()=>{

      if(window.__PERSONAL_HUB_PWA__.isSecureOrigin){
        navigator.serviceWorker.register('./sw.js',{scope:'./'})
          .then(registration=>registration.update().catch(()=>{}))
          .catch(error=>{
            console.error('Service worker registration failed:',error);
          });
      }
    });
  }
}

const STORAGE_KEYS={
  profile:'ops_v1',
  activeWorkout:'activeWorkoutSession_v1',
  dailyCheckin:'dailyCheckin',
  navigation:'ops_nav_v1',
  growth:'ops_growth_v1',
  migration:'ops_storage_migration_v1',
};
const APP_DB_NAME='app_in_my_life_v1';
const APP_DB_VERSION=1;
const APP_DB_STORE='kv';
const MAX_GROWTH_EVENTS=200;
let appDbPromise=null;
let navigationStateCache=null;
let dailyCheckinStoreCache={};
let activeWorkoutStateCache=null;
let growthStateCache=null;
const DATE_KEY_RE=/^\d{4}-\d{2}-\d{2}$/;
const APP_TAB_IDS=['home','calendar','tasks','training','meals','finance','habits','health','maintenance','insights','settings','more'];
const TASK_TAB_IDS=['inbox','scheduled','next','done','templates'];
const FINANCE_VIEW_IDS=['overview','transactions','categories','recurring','trends'];
const IMPORT_ACCOUNT_AUTO='__auto__';
const TRAIN_SECTION_IDS=['today','plan','library','history'];
const SETTINGS_SECTION_IDS=['app','workcal','finance','google','fitness','goals','meals','notifications','security'];
const HEALTH_TAB_IDS=['recovery','wellness','body','care','library'];
const LIFESTYLE_TAB_IDS=['habits','lifestyle','routine'];
function openAppDb(){
  if(appDbPromise)return appDbPromise;
  appDbPromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request=indexedDB.open(APP_DB_NAME,APP_DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(APP_DB_STORE)){
        db.createObjectStore(APP_DB_STORE,{keyPath:'key'});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Failed to open IndexedDB'));
  });
  return appDbPromise;
}

async function withStore(mode,handler){
  const db=await openAppDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(APP_DB_STORE,mode);
    const store=tx.objectStore(APP_DB_STORE);
    let result;
    try{
      result=handler(store,tx);
    }catch(error){
      reject(error);
      return;
    }
    tx.oncomplete=()=>resolve(result&&typeof result==='object'&&'result' in result?result.result:result);
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
  });
}

const storage={
  async get(key){
    try{
      const record=await withStore('readonly',store=>store.get(key));
      return record?.value!=null?{value:record.value}:null;
    }catch{
      return null;
    }
  },
  async set(key,value){
    try{
      await withStore('readwrite',store=>store.put({key,value}));
      return true;
    }catch{
      return null;
    }
  },
  async remove(key){
    try{
      await withStore('readwrite',store=>store.delete(key));
      return true;
    }catch{
      return null;
    }
  },
  async getJSON(key){
    const result=await this.get(key);
    if(!result?.value)return null;
    try{
      return JSON.parse(result.value);
    }catch{
      return null;
    }
  },
  async setJSON(key,value){
    return this.set(key,JSON.stringify(value));
  },
};

async function migrateLegacyLocalStorage(){
  const migrated=await storage.getJSON(STORAGE_KEYS.migration);
  if(migrated?.completedAt)return migrated;
  const legacyKeys=[
    STORAGE_KEYS.profile,
    STORAGE_KEYS.navigation,
    STORAGE_KEYS.activeWorkout,
    STORAGE_KEYS.dailyCheckin,
  ];
  const importedKeys=[];
  for(const key of legacyKeys){
    try{
      const raw=localStorage.getItem(key);
      if(raw==null)continue;
      await storage.set(key,raw);
      importedKeys.push(key);
    }catch{}
  }
  const receipt={completedAt:new Date().toISOString(),importedKeys};
  await storage.setJSON(STORAGE_KEYS.migration,receipt);
  legacyKeys.forEach(key=>{
    try{localStorage.removeItem(key);}catch{}
  });
  return receipt;
}

const ACTIVE_WORKOUT_STORAGE_KEY=STORAGE_KEYS.activeWorkout;

function normalizeGrowthState(raw={}){
  const next=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const activationChecklist=next.activationChecklist&&typeof next.activationChecklist==='object'?next.activationChecklist:{};
  const setupCardCompleted=(activationChecklist.checkInCompleted===true&&activationChecklist.prioritiesSet===true&&activationChecklist.actionCompleted===true)||next.setupCardCompleted===true;
  return{
    firstOpenedAt:typeof next.firstOpenedAt==='string'?next.firstOpenedAt:null,
    firstValueAt:typeof next.firstValueAt==='string'?next.firstValueAt:null,
    lastSeenAt:typeof next.lastSeenAt==='string'?next.lastSeenAt:null,
    installPromptDismissedAt:typeof next.installPromptDismissedAt==='string'?next.installPromptDismissedAt:null,
    installPromptShownCount:Number.isFinite(next.installPromptShownCount)?next.installPromptShownCount:0,
    installAcceptedAt:typeof next.installAcceptedAt==='string'?next.installAcceptedAt:null,
    onboardingDismissed:next.onboardingDismissed===true,
    setupCardCompleted,
    activationChecklist:{
      checkInCompleted:activationChecklist.checkInCompleted===true,
      prioritiesSet:activationChecklist.prioritiesSet===true,
      actionCompleted:activationChecklist.actionCompleted===true,
    },
    events:Array.isArray(next.events)
      ?next.events.filter(event=>event&&typeof event==='object'&&typeof event.type==='string').slice(-MAX_GROWTH_EVENTS)
      :[],
  };
}

function getDefaultGrowthState(){
  return normalizeGrowthState({});
}

function isIosLikeInstallContext(){
  const ua=window.navigator.userAgent||'';
  return /iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&'ontouchend' in document);
}

function toTitleCaseLabel(text=''){
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase())
    .join(' ');
}

function getCompactWorkoutTitle(title=''){
  const cleaned=(title||'').replace(/^Strength\s+[—-]\s+/i,'').trim();
  return cleaned?toTitleCaseLabel(cleaned):'Workout';
}

function SetupCard({C,S,activationChecklist,onOpenCheckIn,onOpenAddTask}){
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
        const onClick=item.id==='checkInCompleted'?onOpenCheckIn:onOpenAddTask;
        return <button
          key={item.id}
          type="button"
          onClick={done?undefined:onClick}
          style={{
            ...S.row,
            width:'100%',
            background:C.surf,
            border:`1px solid ${done?C.sageL:C.bd}`,
            borderRadius:12,
            padding:'10px 12px',
            cursor:done?'default':'pointer',
            textAlign:'left',
          }}
        >
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <span style={{width:18,height:18,borderRadius:999,display:'inline-flex',alignItems:'center',justifyContent:'center',background:done?C.sage:C.white,border:`1px solid ${done?C.sage:C.bd}`,color:done?C.white:C.muted,fontSize:10,fontWeight:700,flexShrink:0}}>{done?'✓':''}</span>
            <span style={{fontSize:13,fontWeight:600,color:C.tx,opacity:done?0.72:1}}>{item.label}</span>
          </div>
          {!done&&<span style={{fontSize:11,fontWeight:700,color:C.navy,flexShrink:0}}>Open</span>}
        </button>;
      })}
    </div>
  </section>;
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
            {task.completed?'✓':''}
          </button>
          {!isExecution
            ?<FieldInput
              id={`daily-priority-${task.id}`}
              aria-label={`Priority ${index+1}`}
              value={task.text||''}
              placeholder={`Task ${index+1}`}
              style={{...S.inp,margin:0,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}
              onChange={e=>updatePriorityTask(task.id,{text:e.target.value})}
            />
            :<div style={{minHeight:36,display:'flex',flexDirection:'column',justifyContent:'center',padding:'0 4px',fontSize:14,fontWeight:600,color:C.tx,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}>
              <span>{task.text||`Task ${index+1}`}</span>
              {task.notes&&<span style={{fontSize:11,fontWeight:400,color:C.muted,marginTop:2}}>{task.notes}</span>}
            </div>}
          <div style={{display:'flex',gap:6,flexShrink:0}}>
            <button type="button" aria-label={`Move ${task.text?.trim()||`priority ${index+1}`} up`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,-1)} disabled={index===0}>↑</button>
            <button type="button" aria-label={`Move ${task.text?.trim()||`priority ${index+1}`} down`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,1)} disabled={index===items.length-1}>↓</button>
            {!isExecution&&<button type="button" aria-label={`Remove ${task.text?.trim()||`priority ${index+1}`}`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>removePriorityTask(task.id)}>Remove</button>}
          </div>
        </div>
        {isExecution&&Array.isArray(task.subtasks)&&task.subtasks.length>0&&<div style={{paddingLeft:30,display:'grid',gap:4,marginTop:4}}>
          {task.subtasks.map(sub=><div key={sub.id||sub.text} style={{display:'flex',alignItems:'center',gap:8,background:C.bg,borderRadius:10,padding:'7px 10px'}}>
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
  onMealAction,
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
}){
  return <section style={{display:'grid',gap:10}}>
    {metrics.length>0&&<div style={{display:'grid',gridTemplateColumns:`repeat(${metrics.length},minmax(0,1fr))`,gap:8}}>
      {metrics.map(metric=><div key={metric.label} style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:0.3}}>{metric.label}</div>
        <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{metric.value}</div>
      </div>)}
    </div>}
    {shouldPromptWorkoutDecision&&<WorkoutDecisionPrompt
      C={C}
      S={S}
      scheduledWorkout={scheduledTodayWorkout}
      recoveryWorkout={recoveryWorkoutOption}
      onAccept={()=>handleWorkoutDecision('accept')}
      onModify={()=>handleWorkoutDecision('modify')}
      onIgnore={()=>handleWorkoutDecision('ignore')}
    />}
    <div style={{display:'grid',gap:8}}>
      <div style={{...S.row,background:C.card,borderRadius:14,padding:'12px 12px',alignItems:'center'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Meal</div>
          <div style={{fontSize:14,fontWeight:700,color:C.tx,lineHeight:1.2}}>{mealTitle}</div>
          {mealSubtitle&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{mealSubtitle}</div>}
        </div>
        <button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={onMealAction}>Open</button>
      </div>
      <div style={{...S.row,background:C.card,borderRadius:14,padding:'12px 12px',alignItems:'center'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Workout</div>
          <div style={{fontSize:14,fontWeight:700,color:C.tx,lineHeight:1.2}}>{workoutTitle}</div>
          {!!workoutDuration&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{workoutDuration}</div>}
        </div>
        <button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={onWorkoutAction}>{workoutCta}</button>
      </div>
      <div style={{...S.row,background:C.card,borderRadius:14,padding:'12px 12px',alignItems:'center'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Tasks</div>
          <div style={{fontSize:14,fontWeight:700,color:C.tx,lineHeight:1.2}}>{taskTitle}</div>
          {!!taskMeta&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{taskMeta}</div>}
        </div>
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          {showTaskDone&&<button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={onTaskDone}>Done</button>}
          <button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={onTaskAction}>{taskCta}</button>
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

function shouldKeepKeyEventLocal(event){
  if(!event)return false;
  return !event.metaKey&&!event.ctrlKey;
}

function composeFieldKeyHandler(handler,{allowEnterSubmit=false,isMultiline=false}={}){
  if(!handler)return event=>{
    if(event.key==='Enter'&&!allowEnterSubmit&&!isMultiline){
      event.preventDefault();
    }
    if(shouldKeepKeyEventLocal(event))event.stopPropagation();
  };
  return event=>{
    if(event.key==='Enter'&&!allowEnterSubmit&&!isMultiline){
      event.preventDefault();
    }
    handler(event);
    if(shouldKeepKeyEventLocal(event)&&!event.isPropagationStopped?.())event.stopPropagation();
  };
}

function getSharedTextFieldProps(props){
  const type=props.type||'text';
  const isTextLike=!['file','date','time','number','range','checkbox','radio','color','hidden'].includes(type);
  if(!isTextLike)return{};
  return{
    autoComplete:props.autoComplete??'off',
    autoCorrect:props.autoCorrect??'off',
    autoCapitalize:props.autoCapitalize??'none',
    spellCheck:props.spellCheck??false,
  };
}

const FieldInput=React.forwardRef(function FieldInput({id,name,allowEnterSubmit=false,...props},ref){
  const generatedId=useId();
  const fieldId=id??name??generatedId;
  return React.createElement('input',{
    ...props,
    ...getSharedTextFieldProps(props),
    ref,
    id:fieldId,
    name:name??fieldId,
    onKeyDown:composeFieldKeyHandler(props.onKeyDown,{allowEnterSubmit}),
  });
});

const FieldSelect=React.forwardRef(function FieldSelect({id,name,...props},ref){
  const generatedId=useId();
  const fieldId=id??name??generatedId;
  return React.createElement('select',{
    ...props,
    ref,
    id:fieldId,
    name:name??fieldId,
    onKeyDown:composeFieldKeyHandler(props.onKeyDown),
  });
});

const FieldTextarea=React.forwardRef(function FieldTextarea({id,name,...props},ref){
  const generatedId=useId();
  const fieldId=id??name??generatedId;
  return React.createElement('textarea',{
    ...props,
    autoComplete:props.autoComplete??'off',
    autoCorrect:props.autoCorrect??'off',
    autoCapitalize:props.autoCapitalize??'none',
    spellCheck:props.spellCheck??false,
    ref,
    id:fieldId,
    name:name??fieldId,
    onKeyDown:composeFieldKeyHandler(props.onKeyDown,{isMultiline:true}),
  });
});

class ScreenErrorBoundary extends React.Component{
  constructor(props){
    super(props);
    this.state={hasError:false};
  }
  static getDerivedStateFromError(){
    return{hasError:true};
  }
  componentDidCatch(error){
    console.error('Screen render failed:',error);
  }
  componentDidUpdate(prevProps){
    if(prevProps.resetKey!==this.props.resetKey&&this.state.hasError){
      this.setState({hasError:false});
    }
  }
  render(){
    if(this.state.hasError){
      return this.props.fallback??null;
    }
    return this.props.children;
  }
}

function isTypingTarget(target){
  if(!(target instanceof HTMLElement))return false;
  const tagName=target.tagName.toLowerCase();
  return tagName==='input'||tagName==='textarea'||tagName==='select'||target.isContentEditable;
}

const C={bg:'var(--bg)',card:'var(--card)',surf:'var(--surface)',sage:'var(--success)',sageL:'var(--surface)',sageDk:'var(--success)',navy:'var(--primary)',navyL:'var(--primary-weak)',navyDk:'var(--primary)',amber:'var(--warning)',amberL:'var(--surface)',amberDk:'var(--warning)',muted:'var(--text-secondary)',bd:'var(--border)',tx:'var(--text-primary)',tx2:'var(--text-secondary)',red:'var(--danger)',redL:'var(--surface)',white:'var(--white)',shadow:'var(--shadow)',shadowStrong:'var(--shadow-strong)',shadowNav:'var(--shadow-nav)',focusRing:'var(--focus-ring)',focusRingInverse:'var(--focus-ring-inverse)',scrim:'var(--scrim)',scrimStrong:'var(--scrim-strong)',headerBg:'var(--header-bg)',navBg:'var(--nav-bg)',whiteSoft:'var(--white-soft)',whiteSoftBorder:'var(--white-soft-border)',whiteSoft2:'var(--white-soft-2)',whiteSoft3:'var(--white-soft-3)',whiteSoft4:'var(--white-soft-4)',whiteSoft5:'var(--white-soft-5)'};

function formatDateKey(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function parseDateKey(dateKey){
  if(typeof dateKey!=='string'||!DATE_KEY_RE.test(dateKey))return null;
  const [year,month,day]=dateKey.split('-').map(Number);
  return new Date(year,month-1,day,12,0,0,0);
}
function normalizeDateKey(dateLike,fallbackKey=getTodayKey()){
  if(typeof dateLike==='string'){
    if(DATE_KEY_RE.test(dateLike))return dateLike;
    const parsed=new Date(dateLike);
    return Number.isNaN(parsed.getTime())?fallbackKey:formatDateKey(parsed);
  }
  if(dateLike instanceof Date)return formatDateKey(dateLike);
  return fallbackKey;
}
function getTodayKey(){
  return formatDateKey(new Date());
}
function getWeekStartDate(dateLike){
  const date=dateLike instanceof Date?new Date(dateLike.getTime()):parseDateKey(normalizeDateKey(dateLike));
  date.setDate(date.getDate()-((date.getDay()+6)%7));
  date.setHours(12,0,0,0);
  return date;
}
function getMonthStartDate(dateLike){
  const date=dateLike instanceof Date?new Date(dateLike.getTime()):parseDateKey(normalizeDateKey(dateLike));
  date.setDate(1);
  date.setHours(12,0,0,0);
  return date;
}
function addWeeksToDate(dateLike,weeks){
  const date=dateLike instanceof Date?new Date(dateLike.getTime()):parseDateKey(normalizeDateKey(dateLike));
  date.setDate(date.getDate()+weeks*7);
  return date;
}
function addMonthsToDate(dateLike,months){
  const date=dateLike instanceof Date?new Date(dateLike.getTime()):parseDateKey(normalizeDateKey(dateLike));
  date.setMonth(date.getMonth()+months,1);
  return date;
}
function getWeekIndexForDate(dateKey,today=getTodayKey()){
  const base=getWeekStartDate(today);
  const target=getWeekStartDate(dateKey);
  return Math.round((target-base)/(7*86400000));
}
function getMonthIndexForDate(dateKey,today=getTodayKey()){
  const base=getMonthStartDate(today);
  const target=getMonthStartDate(dateKey);
  return (target.getFullYear()-base.getFullYear())*12+(target.getMonth()-base.getMonth());
}
function compareDateKeys(left,right){
  return left===right?0:(left<right?-1:1);
}
function getCurrentDate(){
  const now=new Date();
  return{
    now,
    today:getTodayKey(),
    dow:now.getDay(),
  };
}
function readNavigationState(today=getTodayKey()){
  return normalizeNavigationState(navigationStateCache,today);
}
function normalizeNavigationState(raw,today=getTodayKey()){
  const next=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const tab=APP_TAB_IDS.includes(next.tab)?next.tab:'home';
  return{
    tab,
    calendarFocusDay:normalizeDateKey(next.calendarFocusDay,today),
    calendarViewMode:next.calendarViewMode==='month'?'month':'week',
    calendarWeekIndex:Number.isFinite(next.calendarWeekIndex)?next.calendarWeekIndex:getWeekIndexForDate(normalizeDateKey(next.calendarFocusDay,today),today),
    calendarMonthIndex:Number.isFinite(next.calendarMonthIndex)?next.calendarMonthIndex:getMonthIndexForDate(normalizeDateKey(next.calendarFocusDay,today),today),
    taskScreenTab:TASK_TAB_IDS.includes(next.taskScreenTab)?next.taskScreenTab:'next',
    finView:FINANCE_VIEW_IDS.includes(next.finView)?next.finView:'overview',
    trainSection:TRAIN_SECTION_IDS.includes(next.trainSection)?next.trainSection:'today',
    settingsSection:SETTINGS_SECTION_IDS.includes(next.settingsSection)?next.settingsSection:null,
    healthTab:HEALTH_TAB_IDS.includes(next.healthTab)?next.healthTab:'recovery',
    lifestyleTab:LIFESTYLE_TAB_IDS.includes(next.lifestyleTab)?next.lifestyleTab:'habits',
  };
}
function getInitialNavigationState(today=getTodayKey()){
  return readNavigationState(today);
}
function writeNavigationState(state,today=getTodayKey()){
  const nextState=normalizeNavigationState(state,today);
  navigationStateCache=nextState;
  storage.setJSON(STORAGE_KEYS.navigation,nextState);
  return true;
}

function createNewTaskDraft(today,overrides={}){
  return{
    text:'',
    priority:1,
    parentId:null,
    date:today,
    bucket:'next',
    contextTags:'',
    scheduledTime:'',
    endTime:'',
    energyLevel:null,
    ...overrides,
  };
}
function getMsUntilNextDay(now=new Date()){
  const nextMidnight=new Date(now);
  nextMidnight.setHours(24,0,0,50);
  return Math.max(50,nextMidnight-now);
}
function readDailyCheckinStore(){
  return dailyCheckinStoreCache;
}
function writeDailyCheckinStore(store){
  dailyCheckinStoreCache=Object.entries(store||{}).reduce((acc,[key,value])=>{
    const normalizedKey=normalizeDateKey(key,null);
    if(normalizedKey)acc[normalizedKey]=value;
    return acc;
  },{});
  storage.setJSON(STORAGE_KEYS.dailyCheckin,dailyCheckinStoreCache);
  return true;
}
function getDailyCheckinEntry(dateKey=getTodayKey()){
  const store=readDailyCheckinStore();
  return store?.[dateKey]&&typeof store[dateKey]==='object'?store[dateKey]:null;
}
function hasSavedDailyCheckin(entry,dateKey=getTodayKey()){
  if(!entry||typeof entry!=='object')return false;
  if(entry.completed===true)return true;
  return entry.date===dateKey;
}
function isDailyCheckinCompleted(dateKey=getTodayKey()){
  return hasSavedDailyCheckin(getDailyCheckinEntry(dateKey),dateKey);
}
function buildDailyCheckinEntryFromProfile(profile,dateKey){
  const log=profile?.dailyLogs?.[dateKey];
  if(!log?.checkInDone)return null;
  return{
    date:dateKey,
    mood:typeof log.mood==='number'?log.mood:null,
    energy:typeof log.checkInEnergy==='number'
      ?log.checkInEnergy
      :typeof log.energyScore==='number'
        ?Math.max(0,Math.min(5,Math.round(log.energyScore/2)))
        :null,
    stress:typeof log.stress==='number'?log.stress:null,
    note:typeof log.checkInNote==='string'&&log.checkInNote.trim()?log.checkInNote.trim():null,
  };
}
function migrateDailyCheckinStore(profile){
  const existingStore=readDailyCheckinStore();
  const nextStore={...existingStore};
  let changed=false;
  Object.keys(profile?.dailyLogs||{}).forEach(dateKey=>{
    const migratedEntry=buildDailyCheckinEntryFromProfile(profile,dateKey);
    if(!migratedEntry)return;
    const currentEntry=existingStore[dateKey];
    if(currentEntry?.completed===true) return;
    nextStore[dateKey]=migratedEntry;
    changed=true;
  });
  if(changed)writeDailyCheckinStore(nextStore);
  return changed?nextStore:existingStore;
}
function saveDailyCheckin(dateKey,entry){
  const store=readDailyCheckinStore();
  const nextStore={...store,[dateKey]:entry};
  writeDailyCheckinStore(nextStore);
  return nextStore;
}
function syncDailyCheckinTop3(dateKey,top3){
  const store=readDailyCheckinStore();
  const existingEntry=store?.[dateKey];
  if(!hasSavedDailyCheckin(existingEntry,dateKey))return store;
  const nextStore={...store,[dateKey]:existingEntry};
  writeDailyCheckinStore(nextStore);
  return nextStore;
}
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DEFAULT_START='2026-03-16',DEFAULT_RACE='2026-10-25';
const UNITS={system:'imperial',dist:'mi',weight:'lbs',energy:'kcal',pace:'min/mi'};
const fmtPaceMi=secs=>{const m=Math.floor(secs/60),s=Math.round(secs%60);return`${m}:${String(s).padStart(2,'0')} /mi`;};
const fmtDur=mins=>{if(!mins||mins<=0)return'—';if(mins<60)return`${Math.round(mins)} min`;const h=Math.floor(mins/60),m=Math.round(mins%60);return m>0?`${h}h ${m}m`:`${h}h`;};

const ACCOUNT_TYPE_OPTIONS=[
  {id:'checking',label:'Checking'},
  {id:'savings',label:'Savings'},
  {id:'credit',label:'Credit Card'},
  {id:'cash',label:'Cash'},
  {id:'investment',label:'Investment'},
  {id:'loan',label:'Loan'},
  {id:'other',label:'Other'},
];
const LEGACY_ACCOUNT_REFERENCE_MAP={
  ally_checking:'ally_checking',
  'ally checking':'ally_checking',
  'ally - checking':'ally_checking',
  'ally — checking':'ally_checking',
  'checking (ally)':'ally_checking',
  ally_savings:'ally_savings',
  'ally savings':'ally_savings',
  'ally - savings':'ally_savings',
  'ally — savings':'ally_savings',
  'savings (ally)':'ally_savings',
  regions_checking:'regions_checking',
  'regions checking':'regions_checking',
  'regions - checking':'regions_checking',
  'regions — checking':'regions_checking',
  'checking (regions)':'regions_checking',
  regions_savings:'regions_savings',
  'regions savings':'regions_savings',
  'regions - savings':'regions_savings',
  'regions — savings':'regions_savings',
  'savings (regions)':'regions_savings',
};

function normalizeAccountType(type){
  const normalized=String(type||'checking').trim().toLowerCase();
  return ACCOUNT_TYPE_OPTIONS.some(option=>option.id===normalized)?normalized:'other';
}
function slugifyAccountPart(value){
  return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function buildAccountId(institution,name){
  const base=[slugifyAccountPart(institution),slugifyAccountPart(name)].filter(Boolean).join('_');
  return base||`account_${Date.now()}`;
}
function createFinancialAccount(account={}){
  const institution=String(account.institution??account.institutionName??'').trim();
  const name=String(account.name??account.accountName??'').trim()||'Account';
  const currentBalance=account.currentBalance==null||account.currentBalance===''
    ?null
    :parseFloat(account.currentBalance);
  const startingBalance=account.startingBalance==null||account.startingBalance===''
    ?null
    :parseFloat(account.startingBalance);
  return{
    id:String(account.id||buildAccountId(institution,name)),
    name,
    institution,
    type:normalizeAccountType(account.type??account.accountType),
    isActive:account.isActive!==false,
    startingBalance:Number.isFinite(startingBalance)?startingBalance:null,
    currentBalance:Number.isFinite(currentBalance)?currentBalance:null,
    maskedNumber:String(account.maskedNumber||''),
  };
}
function normalizeFinancialAccounts(accounts){
  const source=Array.isArray(accounts)?accounts:[];
  const seen=new Set();
  return source.reduce((list,account)=>{
    const normalized=createFinancialAccount(account);
    if(!normalized.id||seen.has(normalized.id))return list;
    seen.add(normalized.id);
    list.push(normalized);
    return list;
  },[]);
}
function getDefaultAccountId(accounts,includeArchived=false){
  const list=(Array.isArray(accounts)?accounts:[]).filter(account=>includeArchived||account.isActive!==false);
  return list[0]?.id||'';
}
function formatAccountLabel(account){
  if(!account)return'Unknown account';
  return [account.institution,account.name].filter(Boolean).join(' — ')||account.name||account.id;
}
function resolveTransactionAccountId(rawAccountId,accounts){
  const normalizedAccounts=Array.isArray(accounts)?accounts:[];
  const value=String(rawAccountId||'').trim();
  if(!value)return getDefaultAccountId(normalizedAccounts,true);
  const byId=normalizedAccounts.find(account=>account.id===value);
  if(byId)return byId.id;
  const lowered=value.toLowerCase();
  const legacyId=LEGACY_ACCOUNT_REFERENCE_MAP[lowered];
  if(legacyId&&normalizedAccounts.some(account=>account.id===legacyId))return legacyId;
  const byLabel=normalizedAccounts.find(account=>{
    const label=formatAccountLabel(account).toLowerCase();
    return label===lowered||label.replace(/[—-]/g,' ').replace(/\s+/g,' ').trim()===lowered.replace(/[—-]/g,' ').replace(/\s+/g,' ').trim();
  });
  if(byLabel)return byLabel.id;
  return getDefaultAccountId(normalizedAccounts,true);
}
function ensureImportedAccount(accounts,accountInput){
  const normalizedAccounts=normalizeFinancialAccounts(accounts);
  const draft=createFinancialAccount({...accountInput,isActive:accountInput?.isActive!==false});
  const existing=normalizedAccounts.find(account=>
    account.id===draft.id
    || (
      account.institution.toLowerCase()===draft.institution.toLowerCase()
      && account.name.toLowerCase()===draft.name.toLowerCase()
      && account.type===draft.type
    )
  );
  if(existing)return{accounts:normalizedAccounts,accountId:existing.id};
  return{accounts:[...normalizedAccounts,draft],accountId:draft.id};
}

const PHASES=[
  {name:'Base',wks:'1–8',theme:'Build the engine',clr:C.sage,lClr:C.sageL,tClr:C.sageDk},
  {name:'Build',wks:'9–16',theme:'Add volume + stations',clr:C.navy,lClr:C.navyL,tClr:C.navyDk},
  {name:'Specificity',wks:'17–23',theme:'Train the race format',clr:C.amber,lClr:C.amberL,tClr:C.amberDk},
  {name:'Peak',wks:'24–28',theme:'Max race-specific load',clr:C.primary||C.navy,lClr:C.navyL,tClr:C.navyDk},
  {name:'Taper',wks:'29–32',theme:'Arrive fresh and sharp',clr:C.muted,lClr:C.surf,tClr:C.tx2},
];

const PLANS=[
  {id:'hyrox',name:'HYROX training plan',sub:'October 2026 · 32 weeks',desc:'A 32-week phased plan for HYROX Tampa. Alternates general and HYROX-specific weeks across 5 phases.'},
];

const ALL_STATIONS=['SkiErg','Sled Push','Sled Pull','Burpee Broad Jump','Row','Farmers Carry','Sandbag Lunges','Wall Ball'];
const FITNESS_PROGRAM_OPTIONS=[
  {id:'hyrox',label:'HYROX'},
  {id:'running',label:'Running'},
  {id:'strength',label:'Strength'},
  {id:'pilates',label:'Pilates'},
  {id:'recovery',label:'Recovery'},
];
const FITNESS_PROGRAM_ALIASES={none:'recovery',general:'recovery'};
const FITNESS_ADD_ON_OPTIONS=[
  {id:'pilates',label:'Pilates'},
  {id:'recovery',label:'Recovery'},
];
const DEFAULT_ATHLETE={fiveKTime:null,hyroxFinishTime:null,weakStations:[],strongStations:[],squat5RM:null,deadlift5RM:null,wallBallMaxReps:null,preferredTrainingDays:['Mon','Wed','Fri','Sun'],programType:'4-day',trainingWeekStart:'Mon',primaryProgram:'hyrox',secondaryAddOns:[],raceDate:DEFAULT_RACE,planStartDate:DEFAULT_START};

function normalizeFitnessProgram(program='hyrox'){
  const normalized=String(program||'hyrox').trim().toLowerCase();
  if(FITNESS_PROGRAM_OPTIONS.some(option=>option.id===normalized))return normalized;
  return FITNESS_PROGRAM_ALIASES[normalized]||'hyrox';
}

function getAnchoredTrainingDays(programType='4-day',trainingWeekStart='Mon'){
  const normalizedProgramType=programType==='5-day'?'5-day':'4-day';
  const startLabel=['Sun','Mon','Wed'].includes(trainingWeekStart)?trainingWeekStart:'Mon';
  const dayIndexToLabel=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const startIdx=dayIndexToLabel.indexOf(startLabel);
  const offsets=normalizedProgramType==='5-day'?[0,1,2,4,6]:[0,2,4,6];
  return offsets.map(offset=>dayIndexToLabel[(startIdx+offset)%7]);
}

function orderTrainingDays(days=[],trainingWeekStart='Mon'){
  const dayIndexToLabel=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const startIdx=dayIndexToLabel.indexOf(['Sun','Mon','Wed'].includes(trainingWeekStart)?trainingWeekStart:'Mon');
  const rank=new Map(dayIndexToLabel.map((label,idx)=>[label,(idx-startIdx+7)%7]));
  return [...new Set(days)].filter(label=>rank.has(label)).sort((a,b)=>rank.get(a)-rank.get(b));
}

function resolveAthleteProfile(profileAthlete={},legacyTrainingPlan={}){
  const trainingWeekStart=['Sun','Mon','Wed'].includes(profileAthlete?.trainingWeekStart)?profileAthlete.trainingWeekStart:'Mon';
  const initialProgramType=profileAthlete?.programType==='5-day'?'5-day':'4-day';
  const preferredTrainingDays=orderTrainingDays(
    Array.isArray(profileAthlete?.preferredTrainingDays)&&profileAthlete.preferredTrainingDays.length
      ?profileAthlete.preferredTrainingDays
      :getAnchoredTrainingDays(initialProgramType,trainingWeekStart),
    trainingWeekStart
  );
  const programType=preferredTrainingDays.length>=5?'5-day':'4-day';
  return{
    ...DEFAULT_ATHLETE,
    ...(profileAthlete||{}),
    trainingWeekStart,
    programType,
    preferredTrainingDays:preferredTrainingDays.length
      ?preferredTrainingDays
      :getAnchoredTrainingDays(programType,trainingWeekStart),
    planStartDate:normalizeDateKey(profileAthlete?.planStartDate||legacyTrainingPlan?.startDate,DEFAULT_START)||DEFAULT_START,
    raceDate:normalizeDateKey(profileAthlete?.raceDate||legacyTrainingPlan?.raceDate,DEFAULT_RACE)||DEFAULT_RACE,
  };
}

function getTrainingWeekAnchorDate(dateLike,trainingWeekStart='Mon'){
  const anchorDow=trainingWeekStart==='Wed'?3:trainingWeekStart==='Sun'?0:1;
  const anchored=new Date(typeof dateLike==='string'?`${dateLike}T12:00:00`:dateLike);
  anchored.setHours(0,0,0,0);
  anchored.setDate(anchored.getDate()-((anchored.getDay()-anchorDow+7)%7));
  return anchored;
}

function getMondayWeekStartDate(dateLike){
  const anchored=dateLike instanceof Date?new Date(dateLike.getTime()):parseDateKey(normalizeDateKey(dateLike));
  anchored.setHours(0,0,0,0);
  anchored.setDate(anchored.getDate()-((anchored.getDay()+6)%7));
  return anchored;
}

function getTrainingCycleState(planStartDate=DEFAULT_START,raceDate=DEFAULT_RACE,referenceDate=getCurrentDate().today){
  const resolvedStart=normalizeDateKey(planStartDate,DEFAULT_START)||DEFAULT_START;
  const resolvedRace=normalizeDateKey(raceDate,DEFAULT_RACE)||DEFAULT_RACE;
  const currentDate=typeof referenceDate==='string'?new Date(`${referenceDate}T12:00:00`):new Date(referenceDate);
  currentDate.setHours(12,0,0,0);
  const startDate=new Date(`${resolvedStart}T12:00:00`);
  const raceDateObj=new Date(`${resolvedRace}T12:00:00`);
  const elapsedDays=Math.max(0,Math.floor((currentDate-startDate)/86400000));
  const totalWeeks=Math.max(1,Math.round((raceDateObj-startDate)/(7*86400000)));
  const currentWeek=Math.min(totalWeeks,Math.floor(elapsedDays/7)+1);
  const weekType=currentWeek%2===1?'A':'B';
  const taperStartWeek=Math.max(totalWeeks-3,1);
  const peakStartWeek=Math.max(taperStartWeek-5,1);
  const specificityStartWeek=Math.max(peakStartWeek-7,1);
  const buildStartWeek=Math.max(specificityStartWeek-8,1);
  const phaseEnds=[buildStartWeek-1,specificityStartWeek-1,peakStartWeek-1,taperStartWeek-1,totalWeeks];
  const phaseIndex=currentWeek<=phaseEnds[0]?0:currentWeek<=phaseEnds[1]?1:currentWeek<=phaseEnds[2]?2:currentWeek<=phaseEnds[3]?3:4;
  return{
    planStartDate:resolvedStart,
    raceDate:resolvedRace,
    totalWeeks,
    currentWeek,
    weekType,
    daysToRace:Math.max(0,Math.ceil((raceDateObj-currentDate)/86400000)),
    weeksToRace:Math.max(0,Math.ceil((raceDateObj-currentDate)/604800000)),
    phaseIndex,
    phase:PHASES[phaseIndex],
    phaseCode:['base','build','specificity','peak','taper'][phaseIndex]||'base',
    taperStartWeek,
    peakStartWeek,
    specificityStartWeek,
    buildStartWeek,
  };
}

const PROGRAM_LIBRARY_META={
  hyrox:{title:'HYROX race build',detail:'Strength, running, and station simulations with an A/B weekly rotation.'},
  running:{title:'Running performance',detail:'Run-focused weekly structure with easy, quality, tempo, and long-run distribution.'},
  strength:{title:'Strength building',detail:'Progressive upper, lower, and full-body sessions with optional fifth-day accessories.'},
  pilates:{title:'Pilates focus',detail:'Core control, posture, glute strength, and low-impact mobility in a structured weekly cadence.'},
  recovery:{title:'Recovery reset',detail:'Low-intensity mobility, zone-2 cardio, breathwork, and nervous-system downshifting across the week.'},
};
const PROGRAM_DETAIL_CARDS={
  hyrox:{sessions:['HYROX station simulation','Strength + carries','Tempo or long run','Full sim or race prep'],duration:'45–70 min',structure:'4 days / week · A/B rotation',note:'Best for intermediate fitness training toward a HYROX event.'},
  running:{sessions:['Easy aerobic run','Interval or hill session','Tempo run','Long run'],duration:'35–75 min',structure:'4–5 days / week · A/B rotation',note:'Best for building run performance with structured weekly distribution.'},
  strength:{sessions:['Upper body press + pull','Lower body squat + hinge','Full-body hypertrophy','Accessories + carries'],duration:'40–65 min',structure:'4–5 days / week · A/B rotation',note:'Best for gym-access training with a progressive strength focus.'},
  pilates:{sessions:['Core control','Lower body stability','Posture + upper body','Full-body flow'],duration:'30–45 min',structure:'4–5 days / week · A/B rotation',note:'Low-impact and sustainable. Best for core, posture, and recovery-phase training.'},
  recovery:{sessions:['Active recovery cardio','Mobility reset','Recovery Pilates','Nervous system reset'],duration:'20–35 min',structure:'4–5 days / week · A/B rotation',note:'Minimal-stress structure. Best during high life-load or injury prevention periods.'},
};

const PROGRAM_WORKOUT_LIBRARY={
  running:{
    '4-day':{
      A:{
        mon:{type:'run',name:'Easy aerobic run',dur:'35–45 min',intensity:'Easy',purpose:'Build aerobic volume without adding much stress.',rd:{label:'Easy run',dist:'3–4 mi',effort:'Conversational and relaxed from start to finish.'}},
        wed:{type:'run',name:'Interval run',dur:'40–50 min',intensity:'Hard',purpose:'Raise top-end speed and VO2 with controlled repeat work.',rd:{label:'Intervals',dist:'5×3 min',effort:'Hard but repeatable. Jog 2 min between efforts.'}},
        fri:{type:'run',name:'Tempo run',dur:'40–50 min',intensity:'Moderate–Hard',purpose:'Push threshold pace while keeping form smooth.',rd:{label:'Tempo run',dist:'20 min tempo',effort:'10 min easy, 20 min comfortably hard, 10 min easy.'}},
        sat:{type:'run',name:'Long run',dur:'55–70 min',intensity:'Easy',purpose:'Build long aerobic durability with low strain.',rd:{label:'Long run',dist:'5–7 mi',effort:'Stay controlled and conversational.'}},
      },
      B:{
        mon:{type:'run',name:'Easy run + strides',dur:'35–45 min',intensity:'Easy',purpose:'Maintain easy mileage and touch turnover at the end.',rd:{label:'Easy run',dist:'3–4 mi + 4 strides',effort:'Easy throughout. Finish with 4×20s strides.'}},
        wed:{type:'run',name:'Hill or interval session',dur:'40–50 min',intensity:'Hard',purpose:'Develop power and economy with quality running work.',rd:{label:'Hills / intervals',dist:'6 reps',effort:'Hard uphill or fast repeat with full control on recovery.'}},
        fri:{type:'run',name:'Steady threshold run',dur:'45–55 min',intensity:'Moderate',purpose:'Hold a strong aerobic effort without overreaching.',rd:{label:'Steady run',dist:'4–5 mi',effort:'Settle into a strong but sustainable pace.'}},
        sat:{type:'run',name:'Long progression run',dur:'60–75 min',intensity:'Easy–Moderate',purpose:'Close the long run a little stronger while staying smooth.',rd:{label:'Progression long run',dist:'5.5–7.5 mi',effort:'Start easy, finish the last 15 min steady.'}},
      },
    },
    '5-day':{
      A:{
        mon:{type:'run',name:'Easy aerobic run',dur:'35–45 min',intensity:'Easy',purpose:'Build aerobic volume without adding much stress.',rd:{label:'Easy run',dist:'3–4 mi',effort:'Conversational and relaxed from start to finish.'}},
        tue:{type:'run',name:'Recovery run',dur:'25–30 min',intensity:'Easy',purpose:'Add low-stress mileage between bigger sessions.',rd:{label:'Recovery run',dist:'2–3 mi',effort:'Very easy. Keep it light.'}},
        wed:{type:'run',name:'Interval run',dur:'40–50 min',intensity:'Hard',purpose:'Raise top-end speed and VO2 with controlled repeat work.',rd:{label:'Intervals',dist:'5×3 min',effort:'Hard but repeatable. Jog 2 min between efforts.'}},
        thu:{name:'Runner strength + mobility',dur:'30–40 min',intensity:'Moderate',purpose:'Support running with glutes, calves, and trunk stability.',ex:[{n:'Goblet squat',s:3,r:'10',note:''},{n:'Single-leg RDL',s:3,r:'8ea',note:''},{n:'Standing calf raise',s:3,r:'15',note:''},{n:'Dead bug',s:3,r:'8ea',note:''},{n:'Side plank',s:3,r:'25s ea',note:''}]},
        sat:{type:'run',name:'Long run',dur:'55–70 min',intensity:'Easy',purpose:'Build long aerobic durability with low strain.',rd:{label:'Long run',dist:'5–7 mi',effort:'Stay controlled and conversational.'}},
      },
      B:{
        mon:{type:'run',name:'Easy run + strides',dur:'35–45 min',intensity:'Easy',purpose:'Maintain easy mileage and touch turnover at the end.',rd:{label:'Easy run',dist:'3–4 mi + 4 strides',effort:'Easy throughout. Finish with 4×20s strides.'}},
        tue:{type:'run',name:'Recovery run',dur:'25–30 min',intensity:'Easy',purpose:'Add low-stress mileage between bigger sessions.',rd:{label:'Recovery run',dist:'2–3 mi',effort:'Very easy. Keep it light.'}},
        wed:{type:'run',name:'Hill or interval session',dur:'40–50 min',intensity:'Hard',purpose:'Develop power and economy with quality running work.',rd:{label:'Hills / intervals',dist:'6 reps',effort:'Hard uphill or fast repeat with full control on recovery.'}},
        thu:{name:'Runner strength + mobility',dur:'30–40 min',intensity:'Moderate',purpose:'Support running with glutes, calves, and trunk stability.',ex:[{n:'Walking lunges',s:3,r:'10ea',note:''},{n:'Hip thrust',s:3,r:'10',note:''},{n:'Standing calf raise',s:3,r:'15',note:''},{n:'Bird dog',s:3,r:'8ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:'Smooth and easy.',exerciseType:'mobility'}]},
        sat:{type:'run',name:'Long progression run',dur:'60–75 min',intensity:'Easy–Moderate',purpose:'Close the long run a little stronger while staying smooth.',rd:{label:'Progression long run',dist:'5.5–7.5 mi',effort:'Start easy, finish the last 15 min steady.'}},
      },
    },
  },
  strength:{
    '4-day':{
      A:{
        mon:{name:'Upper body strength build',dur:'50–60 min',intensity:'Moderate–Hard',purpose:'Build pressing and pulling strength with crisp volume.',ex:[{n:'Barbell bench press',s:4,r:'6',note:'Leave 1–2 reps in reserve.'},{n:'Weighted pull-up or lat pulldown',s:4,r:'8',note:'Control the eccentric.'},{n:'Incline dumbbell press',s:3,r:'10',note:''},{n:'Single-arm dumbbell row',s:3,r:'10ea',note:'Brace and pause at the top.'},{n:'Face pull',s:3,r:'15',note:'Shoulders stay down.'},{n:'Plank hold',s:3,r:'40s',note:''}]},
        wed:{name:'Lower body strength build',dur:'55–65 min',intensity:'Moderate–Hard',purpose:'Progress squat, hinge, and unilateral lower-body strength.',ex:[{n:'Barbell back squat',s:4,r:'5',note:'Build across sets.'},{n:'Romanian deadlift',s:4,r:'8',note:'Own the hinge.'},{n:'Bulgarian split squat',s:3,r:'8ea',note:'Full range.'},{n:'Hip thrust',s:3,r:'10',note:'Pause at the top.'},{n:'Calf raise',s:3,r:'15',note:'Slow eccentric.'},{n:'Dead bug',s:3,r:'8ea',note:''}]},
        fri:{name:'Full body hypertrophy',dur:'50–60 min',intensity:'Moderate',purpose:'Accumulate quality strength volume without max effort fatigue.',ex:[{n:'Trap bar deadlift',s:4,r:'6',note:'Smooth reps.'},{n:'Dumbbell shoulder press',s:3,r:'10',note:''},{n:'Lat pulldown',s:3,r:'10',note:''},{n:'Goblet squat',s:3,r:'12',note:'Stay upright.'},{n:'Farmers carry',s:4,r:'40m',note:'Braced core.'},{n:'Hollow body hold',s:3,r:'30s',note:''}]},
        sat:{name:'Strength accessories + carries',dur:'40–50 min',intensity:'Moderate',purpose:'Build work capacity and trunk stiffness without a full extra heavy day.',ex:[{n:'Walking lunges',s:3,r:'12ea',note:'Long stride, upright torso.'},{n:'Kettlebell swings',s:4,r:'15',note:'Explode from the hips.'},{n:'Seated cable row',s:3,r:'12',note:''},{n:'Push-up',s:3,r:'12',note:'Leave a rep in reserve.'},{n:'Farmers carry',s:4,r:'50m',note:'Steady breathing.'},{n:'Side plank',s:3,r:'30s ea',note:''}]},
      },
      B:{
        mon:{name:'Upper body strength peak',dur:'50–60 min',intensity:'Hard',purpose:'Drive heavier pressing and pulling with lower total reps.',ex:[{n:'Bench press',s:5,r:'4',note:'Heavy but crisp.'},{n:'Weighted pull-up',s:5,r:'4',note:'No grinding.'},{n:'Bent-over barbell row',s:4,r:'6',note:''},{n:'Arnold press',s:3,r:'8',note:''},{n:'Face pull',s:3,r:'15',note:''},{n:'Pallof press',s:3,r:'10ea',note:''}]},
        wed:{name:'Lower body strength peak',dur:'55–65 min',intensity:'Hard',purpose:'Push the squat and hinge patterns while keeping movement clean.',ex:[{n:'Barbell back squat',s:5,r:'3',note:'Heavy triples.'},{n:'Romanian deadlift',s:4,r:'6',note:'Own the hinge.'},{n:'Step-up',s:3,r:'8ea',note:'Drive through the whole foot.'},{n:'Hip thrust',s:3,r:'8',note:'Pause hard at the top.'},{n:'Copenhagen plank',s:3,r:'20s ea',note:''},{n:'Calf raise',s:3,r:'12',note:''}]},
        fri:{name:'Full body power + core',dur:'45–55 min',intensity:'Moderate–Hard',purpose:'Keep strength moving while adding power and loaded carries.',ex:[{n:'Trap bar deadlift',s:4,r:'5',note:'Explosive concentric.'},{n:'Push press',s:4,r:'5',note:'Leg drive then lockout.'},{n:'Single-arm row',s:3,r:'10ea',note:''},{n:'Sandbag lunges',s:3,r:'20m',note:'Short controlled steps.'},{n:'Farmers carry',s:4,r:'60m',note:'Heavy and clean.'},{n:'Dead bug',s:3,r:'10ea',note:''}]},
        sat:{name:'Movement quality lift day',dur:'35–45 min',intensity:'Moderate',purpose:'Keep momentum with submaximal technique work and trunk training.',ex:[{n:'Goblet squat',s:3,r:'10',note:'Pause in the hole.'},{n:'Dumbbell bench press',s:3,r:'10',note:''},{n:'Cable row',s:3,r:'12',note:''},{n:'Walking lunges',s:2,r:'10ea',note:''},{n:'Suitcase carry',s:3,r:'30m ea',note:'Stay tall.'},{n:'Bird dog',s:3,r:'8ea',note:''}]},
      },
    },
    '5-day':{
      A:{
        mon:{name:'Upper body strength build',dur:'50–60 min',intensity:'Moderate–Hard',purpose:'Build pressing and pulling strength with crisp volume.',ex:[{n:'Barbell bench press',s:4,r:'6',note:'Leave 1–2 reps in reserve.'},{n:'Weighted pull-up or lat pulldown',s:4,r:'8',note:'Control the eccentric.'},{n:'Incline dumbbell press',s:3,r:'10',note:''},{n:'Single-arm dumbbell row',s:3,r:'10ea',note:'Brace and pause at the top.'},{n:'Face pull',s:3,r:'15',note:'Shoulders stay down.'},{n:'Plank hold',s:3,r:'40s',note:''}]},
        tue:{name:'Accessory trunk + carry work',dur:'35–40 min',intensity:'Moderate',purpose:'Add a short fifth day for trunk strength, carries, and shoulder health.',ex:[{n:'Farmers carry',s:4,r:'40m',note:'Controlled pace.'},{n:'Suitcase carry',s:3,r:'25m ea',note:'No leaning.'},{n:'Band pull-apart',s:3,r:'20',note:''},{n:'Dead bug',s:3,r:'10ea',note:''},{n:'Side plank',s:3,r:'30s ea',note:''}]},
        wed:{name:'Lower body strength build',dur:'55–65 min',intensity:'Moderate–Hard',purpose:'Progress squat, hinge, and unilateral lower-body strength.',ex:[{n:'Barbell back squat',s:4,r:'5',note:'Build across sets.'},{n:'Romanian deadlift',s:4,r:'8',note:'Own the hinge.'},{n:'Bulgarian split squat',s:3,r:'8ea',note:'Full range.'},{n:'Hip thrust',s:3,r:'10',note:'Pause at the top.'},{n:'Calf raise',s:3,r:'15',note:'Slow eccentric.'},{n:'Dead bug',s:3,r:'8ea',note:''}]},
        thu:{name:'Upper back + shoulder volume',dur:'40–50 min',intensity:'Moderate',purpose:'Round out the week with extra pull volume and scapular control.',ex:[{n:'Lat pulldown',s:4,r:'10',note:''},{n:'Seated cable row',s:4,r:'10',note:''},{n:'Dumbbell shoulder press',s:3,r:'10',note:''},{n:'Face pull',s:3,r:'15',note:''},{n:'Push-up',s:3,r:'10',note:''},{n:'Hollow body hold',s:3,r:'30s',note:''}]},
        sat:{name:'Strength accessories + carries',dur:'40–50 min',intensity:'Moderate',purpose:'Build work capacity and trunk stiffness without a full extra heavy day.',ex:[{n:'Walking lunges',s:3,r:'12ea',note:'Long stride, upright torso.'},{n:'Kettlebell swings',s:4,r:'15',note:'Explode from the hips.'},{n:'Seated cable row',s:3,r:'12',note:''},{n:'Push-up',s:3,r:'12',note:'Leave a rep in reserve.'},{n:'Farmers carry',s:4,r:'50m',note:'Steady breathing.'},{n:'Side plank',s:3,r:'30s ea',note:''}]},
      },
      B:{
        mon:{name:'Upper body strength peak',dur:'50–60 min',intensity:'Hard',purpose:'Drive heavier pressing and pulling with lower total reps.',ex:[{n:'Bench press',s:5,r:'4',note:'Heavy but crisp.'},{n:'Weighted pull-up',s:5,r:'4',note:'No grinding.'},{n:'Bent-over barbell row',s:4,r:'6',note:''},{n:'Arnold press',s:3,r:'8',note:''},{n:'Face pull',s:3,r:'15',note:''},{n:'Pallof press',s:3,r:'10ea',note:''}]},
        tue:{name:'Short carry + core primer',dur:'30–35 min',intensity:'Moderate',purpose:'Keep the extra training day productive without stealing recovery.',ex:[{n:'Farmers carry',s:4,r:'30m',note:'Heavy, clean posture.'},{n:'Suitcase carry',s:3,r:'25m ea',note:''},{n:'Bird dog',s:3,r:'8ea',note:''},{n:'Copenhagen plank',s:3,r:'20s ea',note:''}]},
        wed:{name:'Lower body strength peak',dur:'55–65 min',intensity:'Hard',purpose:'Push the squat and hinge patterns while keeping movement clean.',ex:[{n:'Barbell back squat',s:5,r:'3',note:'Heavy triples.'},{n:'Romanian deadlift',s:4,r:'6',note:'Own the hinge.'},{n:'Step-up',s:3,r:'8ea',note:'Drive through the whole foot.'},{n:'Hip thrust',s:3,r:'8',note:'Pause hard at the top.'},{n:'Copenhagen plank',s:3,r:'20s ea',note:''},{n:'Calf raise',s:3,r:'12',note:''}]},
        thu:{name:'Upper back density day',dur:'40–45 min',intensity:'Moderate',purpose:'Keep the upper body volume high without another true max-effort session.',ex:[{n:'Lat pulldown',s:4,r:'8',note:''},{n:'Single-arm row',s:3,r:'10ea',note:''},{n:'Push press',s:3,r:'6',note:'Smooth timing.'},{n:'Band pull-apart',s:3,r:'20',note:''},{n:'Plank hold',s:3,r:'40s',note:''}]},
        sat:{name:'Movement quality lift day',dur:'35–45 min',intensity:'Moderate',purpose:'Keep momentum with submaximal technique work and trunk training.',ex:[{n:'Goblet squat',s:3,r:'10',note:'Pause in the hole.'},{n:'Dumbbell bench press',s:3,r:'10',note:''},{n:'Cable row',s:3,r:'12',note:''},{n:'Walking lunges',s:2,r:'10ea',note:''},{n:'Suitcase carry',s:3,r:'30m ea',note:'Stay tall.'},{n:'Bird dog',s:3,r:'8ea',note:''}]},
      },
    },
  },
  pilates:{
    '4-day':{
      A:{
        mon:{type:'recovery',name:'Pilates core control',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Build deep-core control, rib positioning, and smooth spinal articulation.',ex:[{n:'Breathing drills',s:1,r:'90s',note:'Ribs down, slow exhale.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:'Segment the spine.',exerciseType:'mobility'},{n:'Dead bug',s:3,r:'8ea',note:'Keep low back anchored.',exerciseType:'mobility'},{n:'Glute bridges',s:3,r:'12',note:'Pause at the top.',exerciseType:'mobility'},{n:'Toe taps',s:3,r:'10ea',note:'Move slowly.',exerciseType:'mobility'}]},
        wed:{type:'recovery',name:'Pilates lower body stability',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Train hip control, glute engagement, and unilateral balance.',ex:[{n:'Bird dog',s:3,r:'8ea',note:'Reach long.',exerciseType:'mobility'},{n:'Side-lying leg lifts',s:3,r:'12ea',note:'No momentum.',exerciseType:'mobility'},{n:'Clamshell',s:3,r:'15ea',note:'Pelvis stays stacked.',exerciseType:'mobility'},{n:'Single-leg glute bridge',s:2,r:'10ea',note:'Drive through full foot.',exerciseType:'mobility'},{n:'Standing calf raise',s:2,r:'15',note:'Smooth tempo.',exerciseType:'mobility'}]},
        fri:{type:'recovery',name:'Pilates posture + upper body',dur:'30–35 min',intensity:'Low–Moderate',purpose:'Improve scapular control, thoracic mobility, and upright posture.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:'Rotate through upper back.',exerciseType:'mobility'},{n:'Band pull-apart',s:3,r:'15',note:'Shoulders down.',exerciseType:'mobility'},{n:'Y-T-W raises',s:2,r:'8 each',note:'Small precise reps.',exerciseType:'mobility'},{n:'Wall slides',s:3,r:'10',note:'Ribs stay tucked.',exerciseType:'mobility'},{n:'Side plank',s:3,r:'25s ea',note:'Long line from heel to head.',exerciseType:'mobility'}]},
        sat:{type:'recovery',name:'Full-body Pilates flow',dur:'40–45 min',intensity:'Moderate',purpose:'Stitch the week together with a longer, low-impact full-body flow.',ex:[{n:'Cat-cow',s:2,r:'45s',note:'Move with your breath.',exerciseType:'mobility'},{n:'Roll up',s:3,r:'6',note:'One vertebra at a time.',exerciseType:'mobility'},{n:'Glute bridges',s:3,r:'12',note:'Pause on top.',exerciseType:'mobility'},{n:'Bird dog',s:3,r:'8ea',note:'Stay square.',exerciseType:'mobility'},{n:'Side-lying leg lifts',s:3,r:'12ea',note:''},{n:'Breathing drills',s:1,r:'90s',note:'Finish calm.',exerciseType:'breathing'}]},
      },
      B:{
        mon:{type:'recovery',name:'Pilates reset flow',dur:'30–35 min',intensity:'Low',purpose:'Reset the trunk and hips with a slower, breath-led opening session.',ex:[{n:'Breathing drills',s:1,r:'120s',note:'Long exhale.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:''},{n:'Cat-cow',s:2,r:'45s',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:'Ease into range.',exerciseType:'mobility'},{n:'Supine twist',s:2,r:'30s ea',note:'Breathe into the floor.',exerciseType:'mobility'}]},
        wed:{type:'recovery',name:'Pilates glute + trunk strength',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Add a little more challenge through the hips and trunk without impact.',ex:[{n:'Single-leg glute bridge',s:3,r:'8ea',note:''},{n:'Dead bug',s:3,r:'10ea',note:''},{n:'Side plank',s:3,r:'25s ea',note:''},{n:'Clamshell',s:3,r:'15ea',note:''},{n:'Bird dog',s:3,r:'8ea',note:''}]},
        fri:{type:'recovery',name:'Pilates balance + rotation',dur:'30–35 min',intensity:'Low–Moderate',purpose:'Focus on control through unilateral balance and rotational mobility.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Standing balance reach',s:3,r:'6ea',note:'Slow and steady.',exerciseType:'mobility'},{n:'Lateral lunge',s:2,r:'8ea',note:'Use bodyweight only.',exerciseType:'mobility'},{n:'Pallof press',s:3,r:'8ea',note:'Hold each rep.',exerciseType:'mobility'},{n:'Breathing drills',s:1,r:'90s',note:''}]},
        sat:{type:'recovery',name:'Long Pilates recovery flow',dur:'40–45 min',intensity:'Low–Moderate',purpose:'Restore range and reinforce smooth movement patterns with a longer mat session.',ex:[{n:'Roll up',s:3,r:'6',note:''},{n:'Glute bridges',s:3,r:'12',note:''},{n:'Bird dog',s:3,r:'8ea',note:''},{n:'Side-lying leg lifts',s:3,r:'12ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Supine twist',s:2,r:'30s ea',note:''}]},
      },
    },
    '5-day':{
      A:{
        mon:{type:'recovery',name:'Pilates core control',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Build deep-core control, rib positioning, and smooth spinal articulation.',ex:[{n:'Breathing drills',s:1,r:'90s',note:'Ribs down, slow exhale.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:'Segment the spine.',exerciseType:'mobility'},{n:'Dead bug',s:3,r:'8ea',note:'Keep low back anchored.',exerciseType:'mobility'},{n:'Glute bridges',s:3,r:'12',note:'Pause at the top.',exerciseType:'mobility'},{n:'Toe taps',s:3,r:'10ea',note:'Move slowly.',exerciseType:'mobility'}]},
        tue:{type:'recovery',name:'Pilates breath + mobility',dur:'20–25 min',intensity:'Low',purpose:'Keep the extra day low stress with breath-led trunk and hip mobility.',ex:[{n:'Breathing drills',s:1,r:'120s',note:'Long exhales.',exerciseType:'breathing'},{n:'Cat-cow',s:2,r:'45s',note:''},{n:'Thoracic rotation',s:2,r:'5ea',note:''},{n:'Supine twist',s:2,r:'30s ea',note:''}]},
        wed:{type:'recovery',name:'Pilates lower body stability',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Train hip control, glute engagement, and unilateral balance.',ex:[{n:'Bird dog',s:3,r:'8ea',note:'Reach long.',exerciseType:'mobility'},{n:'Side-lying leg lifts',s:3,r:'12ea',note:'No momentum.',exerciseType:'mobility'},{n:'Clamshell',s:3,r:'15ea',note:'Pelvis stays stacked.',exerciseType:'mobility'},{n:'Single-leg glute bridge',s:2,r:'10ea',note:'Drive through full foot.',exerciseType:'mobility'},{n:'Standing calf raise',s:2,r:'15',note:'Smooth tempo.',exerciseType:'mobility'}]},
        thu:{type:'recovery',name:'Pilates posture + upper body',dur:'30–35 min',intensity:'Low–Moderate',purpose:'Improve scapular control, thoracic mobility, and upright posture.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:'Rotate through upper back.',exerciseType:'mobility'},{n:'Band pull-apart',s:3,r:'15',note:'Shoulders down.',exerciseType:'mobility'},{n:'Y-T-W raises',s:2,r:'8 each',note:'Small precise reps.',exerciseType:'mobility'},{n:'Wall slides',s:3,r:'10',note:'Ribs stay tucked.',exerciseType:'mobility'},{n:'Side plank',s:3,r:'25s ea',note:'Long line from heel to head.',exerciseType:'mobility'}]},
        sat:{type:'recovery',name:'Full-body Pilates flow',dur:'40–45 min',intensity:'Moderate',purpose:'Stitch the week together with a longer, low-impact full-body flow.',ex:[{n:'Cat-cow',s:2,r:'45s',note:'Move with your breath.',exerciseType:'mobility'},{n:'Roll up',s:3,r:'6',note:'One vertebra at a time.',exerciseType:'mobility'},{n:'Glute bridges',s:3,r:'12',note:'Pause on top.',exerciseType:'mobility'},{n:'Bird dog',s:3,r:'8ea',note:'Stay square.',exerciseType:'mobility'},{n:'Side-lying leg lifts',s:3,r:'12ea',note:''},{n:'Breathing drills',s:1,r:'90s',note:'Finish calm.',exerciseType:'breathing'}]},
      },
      B:{
        mon:{type:'recovery',name:'Pilates reset flow',dur:'30–35 min',intensity:'Low',purpose:'Reset the trunk and hips with a slower, breath-led opening session.',ex:[{n:'Breathing drills',s:1,r:'120s',note:'Long exhale.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:''},{n:'Cat-cow',s:2,r:'45s',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:'Ease into range.',exerciseType:'mobility'},{n:'Supine twist',s:2,r:'30s ea',note:'Breathe into the floor.',exerciseType:'mobility'}]},
        tue:{type:'recovery',name:'Pilates trunk primer',dur:'20–25 min',intensity:'Low',purpose:'Keep the fifth day productive without adding real fatigue.',ex:[{n:'Dead bug',s:2,r:'8ea',note:''},{n:'Bird dog',s:2,r:'8ea',note:''},{n:'Breathing drills',s:1,r:'90s',note:''}]},
        wed:{type:'recovery',name:'Pilates glute + trunk strength',dur:'35–40 min',intensity:'Low–Moderate',purpose:'Add a little more challenge through the hips and trunk without impact.',ex:[{n:'Single-leg glute bridge',s:3,r:'8ea',note:''},{n:'Dead bug',s:3,r:'10ea',note:''},{n:'Side plank',s:3,r:'25s ea',note:''},{n:'Clamshell',s:3,r:'15ea',note:''},{n:'Bird dog',s:3,r:'8ea',note:''}]},
        thu:{type:'recovery',name:'Pilates balance + rotation',dur:'30–35 min',intensity:'Low–Moderate',purpose:'Focus on control through unilateral balance and rotational mobility.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Standing balance reach',s:3,r:'6ea',note:'Slow and steady.',exerciseType:'mobility'},{n:'Lateral lunge',s:2,r:'8ea',note:'Use bodyweight only.',exerciseType:'mobility'},{n:'Pallof press',s:3,r:'8ea',note:'Hold each rep.',exerciseType:'mobility'},{n:'Breathing drills',s:1,r:'90s',note:''}]},
        sat:{type:'recovery',name:'Long Pilates recovery flow',dur:'40–45 min',intensity:'Low–Moderate',purpose:'Restore range and reinforce smooth movement patterns with a longer mat session.',ex:[{n:'Roll up',s:3,r:'6',note:''},{n:'Glute bridges',s:3,r:'12',note:''},{n:'Bird dog',s:3,r:'8ea',note:''},{n:'Side-lying leg lifts',s:3,r:'12ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Supine twist',s:2,r:'30s ea',note:''}]},
      },
    },
  },
  recovery:{
    '4-day':{
      A:{
        mon:{type:'recovery',name:'Active recovery cardio',dur:'30–35 min',intensity:'Low',purpose:'Keep blood flow high while stress stays low.',ex:[{n:'Light walk or bike',s:1,r:'20 min',note:'Stay conversational.',exerciseType:'cardio'},{n:'Easy incline treadmill',s:1,r:'10 min',note:'Optional if energy is good.',exerciseType:'cardio'}]},
        wed:{type:'recovery',name:'Mobility reset',dur:'20–25 min',intensity:'Low',purpose:'Open the hips, ankles, and spine with zero rush.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Hip CARs',s:2,r:'5ea',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:''},{n:'Ankle mobility',s:2,r:'45s ea',note:''}]},
        fri:{type:'recovery',name:'Recovery Pilates',dur:'25–30 min',intensity:'Low',purpose:'Restore trunk control and hip mobility without adding fatigue.',ex:[{n:'Breathing drills',s:1,r:'90s',note:'Rib cage down.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:''},{n:'Glute bridges',s:2,r:'12',note:''},{n:'Bird dog',s:2,r:'8ea',note:''},{n:'Side-lying leg lifts',s:2,r:'12ea',note:''}]},
        sat:{type:'recovery',name:'Sleepy nervous-system reset',dur:'20–25 min',intensity:'Low',purpose:'Finish the week by downshifting the nervous system and loosening stiff areas.',ex:[{n:'Breathing drills',s:1,r:'120s',note:'Long exhale focus.',exerciseType:'breathing'},{n:'Supine twist',s:2,r:'30s ea',note:''},{n:'Childs pose',s:2,r:'45s',note:''},{n:'Legs up the wall',s:1,r:'3 min',note:'Stay quiet.',exerciseType:'mobility'}]},
      },
      B:{
        mon:{type:'recovery',name:'Easy zone-2 walk',dur:'30–40 min',intensity:'Low',purpose:'Start the week with easy aerobic recovery only.',ex:[{n:'Light walk or bike',s:1,r:'30 min',note:'Nasal breathing.',exerciseType:'cardio'}]},
        wed:{type:'recovery',name:'Joint care flow',dur:'20–25 min',intensity:'Low',purpose:'Touch the ankles, hips, and thoracic spine with slow range work.',ex:[{n:'Ankle mobility',s:2,r:'45s ea',note:''},{n:'Hip CARs',s:2,r:'5ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Cat-cow',s:2,r:'45s',note:''}]},
        fri:{type:'recovery',name:'Mat recovery flow',dur:'25–30 min',intensity:'Low',purpose:'Use the mat for glutes, trunk, and spine without accumulating fatigue.',ex:[{n:'Glute bridges',s:2,r:'12',note:''},{n:'Bird dog',s:2,r:'8ea',note:''},{n:'Dead bug',s:2,r:'8ea',note:''},{n:'Supine twist',s:2,r:'30s ea',note:''}]},
        sat:{type:'recovery',name:'Mobility and breath finish',dur:'20–25 min',intensity:'Low',purpose:'End the week with deliberate mobility and breathing down-regulation.',ex:[{n:'Breathing drills',s:1,r:'120s',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Legs up the wall',s:1,r:'3 min',note:''}]},
      },
    },
    '5-day':{
      A:{
        mon:{type:'recovery',name:'Active recovery cardio',dur:'30–35 min',intensity:'Low',purpose:'Keep blood flow high while stress stays low.',ex:[{n:'Light walk or bike',s:1,r:'20 min',note:'Stay conversational.',exerciseType:'cardio'},{n:'Easy incline treadmill',s:1,r:'10 min',note:'Optional if energy is good.',exerciseType:'cardio'}]},
        tue:{type:'recovery',name:'Breath + posture reset',dur:'15–20 min',intensity:'Low',purpose:'Add a short extra day that helps you feel better, not more tired.',ex:[{n:'Breathing drills',s:1,r:'120s',note:''},{n:'Wall slides',s:2,r:'10',note:''},{n:'Cat-cow',s:2,r:'45s',note:''}]},
        wed:{type:'recovery',name:'Mobility reset',dur:'20–25 min',intensity:'Low',purpose:'Open the hips, ankles, and spine with zero rush.',ex:[{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Hip CARs',s:2,r:'5ea',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:''},{n:'Ankle mobility',s:2,r:'45s ea',note:''}]},
        thu:{type:'recovery',name:'Recovery Pilates',dur:'25–30 min',intensity:'Low',purpose:'Restore trunk control and hip mobility without adding fatigue.',ex:[{n:'Breathing drills',s:1,r:'90s',note:'Rib cage down.',exerciseType:'breathing'},{n:'Pelvic tilts',s:2,r:'10',note:''},{n:'Glute bridges',s:2,r:'12',note:''},{n:'Bird dog',s:2,r:'8ea',note:''},{n:'Side-lying leg lifts',s:2,r:'12ea',note:''}]},
        sat:{type:'recovery',name:'Sleepy nervous-system reset',dur:'20–25 min',intensity:'Low',purpose:'Finish the week by downshifting the nervous system and loosening stiff areas.',ex:[{n:'Breathing drills',s:1,r:'120s',note:'Long exhale focus.',exerciseType:'breathing'},{n:'Supine twist',s:2,r:'30s ea',note:''},{n:'Childs pose',s:2,r:'45s',note:''},{n:'Legs up the wall',s:1,r:'3 min',note:'Stay quiet.',exerciseType:'mobility'}]},
      },
      B:{
        mon:{type:'recovery',name:'Easy zone-2 walk',dur:'30–40 min',intensity:'Low',purpose:'Start the week with easy aerobic recovery only.',ex:[{n:'Light walk or bike',s:1,r:'30 min',note:'Nasal breathing.',exerciseType:'cardio'}]},
        tue:{type:'recovery',name:'Joint prep micro-flow',dur:'15–20 min',intensity:'Low',purpose:'Keep joints moving on the extra training day.',ex:[{n:'Ankle mobility',s:2,r:'45s ea',note:''},{n:'Hip CARs',s:2,r:'5ea',note:''},{n:'Thoracic rotation',s:2,r:'5ea',note:''}]},
        wed:{type:'recovery',name:'Joint care flow',dur:'20–25 min',intensity:'Low',purpose:'Touch the ankles, hips, and thoracic spine with slow range work.',ex:[{n:'Ankle mobility',s:2,r:'45s ea',note:''},{n:'Hip CARs',s:2,r:'5ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Cat-cow',s:2,r:'45s',note:''}]},
        thu:{type:'recovery',name:'Mat recovery flow',dur:'25–30 min',intensity:'Low',purpose:'Use the mat for glutes, trunk, and spine without accumulating fatigue.',ex:[{n:'Glute bridges',s:2,r:'12',note:''},{n:'Bird dog',s:2,r:'8ea',note:''},{n:'Dead bug',s:2,r:'8ea',note:''},{n:'Supine twist',s:2,r:'30s ea',note:''}]},
        sat:{type:'recovery',name:'Mobility and breath finish',dur:'20–25 min',intensity:'Low',purpose:'End the week with deliberate mobility and breathing down-regulation.',ex:[{n:'Breathing drills',s:1,r:'120s',note:''},{n:'Hamstring floss',s:2,r:'8ea',note:''},{n:'Thoracic rotation',s:2,r:'6ea',note:''},{n:'Legs up the wall',s:1,r:'3 min',note:''}]},
      },
    },
  },
};
const WEEKLY_TEMPLATES={
  '4-day':{
    A:[{type:'run_intervals',label:'Run quality'},{type:'strength_upper',label:'Upper strength'},{type:'run_aerobic',label:'Run aerobic'},{type:'strength_lower',label:'Lower strength'}],
    B:[{type:'run_threshold',label:'Run threshold'},{type:'hyrox_functional',label:'Full HYROX'},{type:'run_aerobic',label:'Run aerobic'},{type:'strength_circuit',label:'Strength circuit'}],
  },
  '5-day':{
    A:[{type:'run_intervals',label:'Run intervals'},{type:'strength_upper',label:'Upper strength'},{type:'run_aerobic',label:'Run aerobic'},{type:'strength_lower',label:'Lower strength'},{type:'run_threshold',label:'Threshold run'}],
    B:[{type:'run_intervals',label:'Run intervals'},{type:'hyrox_functional',label:'Full HYROX'},{type:'run_aerobic',label:'Run aerobic'},{type:'strength_lower',label:'Lower strength'},{type:'hyrox_simulation',label:'HYROX simulation'}],
  },
};

const WKS={
  /* ── PHASE 0 · BASE (weeks 1–8) ── */
  p0A_mon:{name:'Strength — full body',purpose:'Build baseline push, pull and core patterns.',dur:'45–55 min',intensity:'Moderate',ex:[{n:'Barbell back squat',s:3,r:'8',note:'Drive knees out, chest tall'},{n:'Romanian deadlift',s:3,r:'10',note:'Hinge from hips, soft knees'},{n:'Dumbbell bench press',s:3,r:'10',note:''},{n:'Bent-over dumbbell row',s:3,r:'10ea',note:'Brace core, neutral spine'},{n:'Overhead press',s:3,r:'10',note:''},{n:'Plank hold',s:3,r:'30s',note:''}]},
  p0A_wed:{name:'Easy run',type:'run',purpose:'Build aerobic base — consistent easy effort.',dur:'30–35 min',intensity:'Easy',rd:{label:'Easy run',dist:'2–3 mi',effort:'Conversational pace throughout — if you cannot hold a sentence, slow down'}},
  p0A_fri:{name:'Strength — lower body',purpose:'Unilateral work to build single-leg stability and posterior chain.',dur:'45–55 min',intensity:'Moderate',ex:[{n:'Goblet squat',s:3,r:'12',note:'Elbows inside knees at bottom'},{n:'Single-leg RDL',s:3,r:'10ea',note:'Control the balance'},{n:'Incline dumbbell press',s:3,r:'10',note:''},{n:'Lat pulldown',s:3,r:'10',note:''},{n:'Hip thrust',s:3,r:'12',note:'Squeeze glutes at top'},{n:'Bicycle crunch',s:3,r:'15ea',note:''}]},
  p0A_sat:{name:'Long easy run',type:'run',purpose:'Build aerobic base — the foundation everything else sits on.',dur:'45–55 min',intensity:'Easy',rd:{label:'Long run',dist:'3–4.5 mi',effort:'Slow and conversational — this pace is correct even if it feels too easy'}},
  p0B_mon:{name:'Strength + station intro',purpose:'First HYROX station exposure alongside compound lifts.',dur:'55–65 min',intensity:'Moderate',ex:[{n:'Barbell back squat',s:3,r:'8',note:''},{n:'Farmers carry',s:4,r:'40m',note:'Heavy — shoulders back, core tight'},{n:'Wall ball (9kg)',s:3,r:'15',note:'Full squat, drive ball to 10ft'},{n:'Bent-over row',s:3,r:'10',note:''},{n:'SkiErg — easy',s:3,r:'250m',note:'Focus on technique, not pace'},{n:'Dead bug',s:3,r:'8ea',note:'Lower back stays flat'}]},
  p0B_wed:{name:'Easy run',type:'run',purpose:'Aerobic maintenance — keep the engine ticking.',dur:'30–35 min',intensity:'Easy',rd:{label:'Easy run',dist:'2–3 mi',effort:'Conversational pace throughout'}},
  p0B_fri:{name:'HYROX station circuit',purpose:'Back-to-back station exposure — get comfortable with the movements.',dur:'50–60 min',intensity:'Moderate',ex:[{n:'Wall ball (9kg)',s:4,r:'20',note:'Break into smaller sets if needed'},{n:'Farmers carry',s:4,r:'40m',note:''},{n:'Sandbag lunges',s:3,r:'20m',note:'Stay upright, chest up'},{n:'Row 250m',s:4,r:'250m',note:'2 min rest between efforts'},{n:'Burpee broad jumps',s:3,r:'6',note:'Explode forward on the jump'},{n:'Copenhagen plank',s:3,r:'20s ea',note:'Hip adductor strength'}]},
  p0B_sat:{name:'Long run + station finish',type:'run',purpose:'Extend aerobic base and introduce station work after running.',dur:'60–70 min',intensity:'Easy–Moderate',rd:{label:'Long run + stations',dist:'4–5 mi',effort:'Easy run, then finish with 2×40m farmers carry — legs should already feel it'}},
  /* ── PHASE 1 · BUILD (weeks 9–16) ── */
  p1A_mon:{name:'Full body strength — build',purpose:'Increase push and pull volume to support station performance.',dur:'50–60 min',intensity:'Moderate–Hard',ex:[{n:'Barbell bench press',s:4,r:'8',note:'Controlled tempo, full range'},{n:'Weighted pull-up or lat pulldown',s:4,r:'8',note:'Full extension at bottom'},{n:'Dumbbell shoulder press',s:3,r:'10',note:''},{n:'Single-arm dumbbell row',s:3,r:'12ea',note:'Brace against bench'},{n:'Farmers carry',s:3,r:'50m',note:'Shoulders packed, walk tall'},{n:'Hollow body hold',s:3,r:'30s',note:'Lower back stays pressed down'}]},
  p1A_wed:{name:'Aerobic run — extended',type:'run',purpose:'Build aerobic capacity through consistent moderate volume.',dur:'40–50 min',intensity:'Easy',rd:{label:'Easy run',dist:'3–4.5 mi',effort:'Conversational throughout — no pace pressure, just time on feet'}},
  p1A_fri:{name:'Full body functional',purpose:'Compound movements and loaded carries to build work capacity.',dur:'55–65 min',intensity:'Moderate–Hard',ex:[{n:'Trap bar deadlift',s:4,r:'6',note:'Hip drive — pull the floor away'},{n:'Kettlebell swings',s:4,r:'15',note:'Power from hips, not arms'},{n:'Farmers carry',s:4,r:'50m',note:'Heavy — full posture throughout'},{n:'Wall ball (9kg)',s:4,r:'20',note:'Unbroken if possible'},{n:'SkiErg 500m',s:3,r:'500m',note:'Controlled effort, build to 80%'},{n:'Dead bug',s:3,r:'10ea',note:'Exhale fully at top'}]},
  p1A_sat:{name:'Long run',type:'run',purpose:'Build aerobic durability — the event is endurance-first.',dur:'60–70 min',intensity:'Easy',rd:{label:'Long run',dist:'4.5–5.5 mi',effort:'Keep it slow — the duration is the stimulus, not the pace'}},
  p1B_mon:{name:'Lower body strength — build',purpose:'Build single-leg power and posterior chain for sled and sandbag work.',dur:'55–65 min',intensity:'Moderate–Hard',ex:[{n:'Barbell back squat',s:4,r:'6',note:'Pause 1s at bottom'},{n:'Romanian deadlift',s:4,r:'8',note:'Load the hamstrings fully'},{n:'Sandbag lunges',s:4,r:'20m',note:'Chest up, short controlled steps'},{n:'Hip thrust',s:3,r:'12',note:'Squeeze hard at top'},{n:'Copenhagen plank',s:3,r:'25s ea',note:'Hip in line with body'},{n:'Single-leg RDL',s:3,r:'10ea',note:'Control the descent'}]},
  p1B_wed:{name:'Interval run',type:'run',purpose:'Develop speed and VO2 capacity — HYROX demands repeated hard efforts.',dur:'40–50 min',intensity:'Hard',rd:{label:'Intervals',dist:'5×0.5 mi',effort:'85–90% effort per rep — 2 min easy jog recovery between each. Warm-up 10 min easy first.'}},
  p1B_fri:{name:'HYROX build circuit',purpose:'Begin combining run efforts with station work — train the actual race demand.',dur:'60–70 min',intensity:'Moderate–Hard',ex:[{n:'1km run at moderate effort',s:3,r:'1km',note:'Go straight into next station'},{n:'Wall ball (9kg)',s:3,r:'25',note:'Unbroken target — rest before rather than during'},{n:'Farmers carry',s:3,r:'50m',note:'Heavy — shoulders back, no stopping'},{n:'Row 500m',s:3,r:'500m',note:'Strong pace — not a rest effort'},{n:'Burpee broad jumps',s:3,r:'8',note:'Land soft, drive forward'},{n:'Sandbag lunges',s:3,r:'20m',note:'After the last run rep — finish strong'}]},
  p1B_sat:{name:'Tempo run',type:'run',purpose:'Build lactate threshold — the pace that matters most in HYROX.',dur:'50–60 min',intensity:'Moderate',rd:{label:'Tempo run',dist:'4–5 mi',effort:'10 min easy warm-up · 20–25 min at comfortably hard pace (can speak a few words only) · 10 min easy cool-down'}},
  /* ── PHASE 2 · SPECIFICITY (weeks 17–23) ── */
  p2A_mon:{name:'Full body strength — maintain',purpose:'Sustain strength while training volume shifts to race simulation.',dur:'45–55 min',intensity:'Moderate',ex:[{n:'Barbell bench press',s:4,r:'6',note:'Heavier than build phase — quality over volume'},{n:'Weighted pull-up',s:4,r:'6',note:'Full ROM, slow eccentric'},{n:'SkiErg 4×250m',s:4,r:'250m',note:'90s rest — race pace effort each rep'},{n:'Single-arm row',s:3,r:'10ea',note:''},{n:'Farmers carry',s:4,r:'60m',note:'Heaviest weight you can walk tall with'},{n:'Plank + reach',s:3,r:'8ea',note:'Slow and controlled'}]},
  p2A_wed:{name:'Threshold run',type:'run',purpose:'Train at race effort — HYROX running demands sustained pace under fatigue.',dur:'45–55 min',intensity:'Moderate–Hard',rd:{label:'Threshold run',dist:'4–5 mi',effort:'10 min easy · 25 min at threshold (comfortably hard — breathing controlled but not conversational) · 10 min easy'}},
  p2A_fri:{name:'HYROX mini simulation',purpose:'Train the race format directly — run into station, station into run.',dur:'65–80 min',intensity:'Hard',ex:[{n:'1km run',s:4,r:'1km',note:'Race pace effort — go straight to station'},{n:'Wall ball (9kg)',s:4,r:'30',note:'Break into 2 sets max — rest before, not during'},{n:'Sandbag lunges',s:4,r:'20m',note:'After wall ball, straight into next run'},{n:'Farmers carry',s:2,r:'80m',note:'After run 3 — heavy, do not put down'},{n:'Burpee broad jumps',s:2,r:'10',note:'Final station'},{n:'Row 500m',s:2,r:'500m',note:'Race pace — strong finish'}]},
  p2A_sat:{name:'Race pace long run',type:'run',purpose:'Extend aerobic volume at the pace you plan to hold on race day.',dur:'65–80 min',intensity:'Moderate–Hard',rd:{label:'Race pace long run',dist:'5.5–7 mi',effort:'10 min easy warm-up · 40 min at goal race pace · 10–15 min easy cool-down'}},
  p2B_mon:{name:'Lower body strength — peak loading',purpose:'Heavy lower body and max station loads — peak the movement patterns.',dur:'60–70 min',intensity:'Hard',ex:[{n:'Barbell back squat',s:5,r:'5',note:'Work up to a challenging set of 5'},{n:'Romanian deadlift',s:4,r:'6',note:'Heaviest of the program'},{n:'Sled push (or prowler sub)',s:4,r:'30m',note:'Max weight — short rest between'},{n:'Sandbag lunges',s:4,r:'30m',note:'Heavy bag — stay upright, short steps'},{n:'Copenhagen plank',s:3,r:'30s ea',note:''},{n:'Hip thrust',s:3,r:'10',note:'Weighted — full pause at top'}]},
  p2B_wed:{name:'Hard interval run',type:'run',purpose:'Push VO2 ceiling — race demands short hard efforts repeated.',dur:'45–55 min',intensity:'Hard',rd:{label:'Hard intervals',dist:'6×0.6 mi',effort:'90–95% effort per rep · Full 2 min walk recovery · Warm-up 10 min · First reps may feel easy — hold the discipline'}},
  p2B_fri:{name:'HYROX simulation — extended',purpose:'Longer simulation — train the accumulation of fatigue across multiple stations.',dur:'75–90 min',intensity:'Hard',ex:[{n:'1km run',s:5,r:'1km',note:'Race intent — no slower than goal pace'},{n:'Wall ball (9kg)',s:5,r:'30',note:'Unbroken target — rest before if needed'},{n:'Farmers carry',s:5,r:'80m',note:'Race load — no putting down'},{n:'Sandbag lunges',s:3,r:'40m',note:'Rounds 3–5 only'},{n:'Burpee broad jumps',s:3,r:'10',note:'Rounds 3–5 only'},{n:'SkiErg 250m',s:3,r:'250m',note:'Race pace — rounds 4–5 only'}]},
  p2B_sat:{name:'Race pace threshold',type:'run',purpose:'Consolidate race-pace running — the body should find this effort familiar.',dur:'55–65 min',intensity:'Hard',rd:{label:'Race pace run',dist:'5–6 mi',effort:'15 min warm-up · 30–35 min at race pace · 10 min cool-down'}},
  /* ── PHASE 3 · PEAK (weeks 24–28) ── */
  p3A_mon:{name:'Full body — peak maintenance',purpose:'Maintain strength and SkiErg capacity without accumulating excess fatigue.',dur:'45–55 min',intensity:'Moderate',ex:[{n:'Bench press',s:3,r:'5',note:'Heavy — crisp quality over volume'},{n:'Weighted pull-up',s:3,r:'5',note:''},{n:'SkiErg 5×250m',s:5,r:'250m',note:'Max effort each rep — 90s rest'},{n:'Farmers carry',s:4,r:'80m',note:'Heaviest of the program'},{n:'Seated cable row',s:3,r:'12',note:''},{n:'Plank hold',s:3,r:'45s',note:''}]},
  p3A_wed:{name:'Threshold run — moderate',type:'run',purpose:'Maintain aerobic sharpness without taxing the body ahead of simulation day.',dur:'45–55 min',intensity:'Moderate–Hard',rd:{label:'Threshold run',dist:'4.5–5.5 mi',effort:'10 min easy · 25 min comfortably hard · 10 min easy cool-down'}},
  p3A_fri:{name:'Full HYROX simulation',purpose:'Race rehearsal — all 8 stations in sequence, each run at race pace.',dur:'75–90 min',intensity:'Very Hard',ex:[{n:'1km run',s:8,r:'1km',note:'Race pace — go straight to station'},{n:'SkiErg 1000m',s:1,r:'1000m',note:'Station 1 — strong technique'},{n:'Sled push (or loaded sub)',s:1,r:'50m',note:'Station 2 — max effort'},{n:'Sled pull (or farmers carry)',s:1,r:'50m',note:'Station 3'},{n:'Burpee broad jumps',s:1,r:'80 reps',note:'Station 4 — go to your limit'},{n:'Row 1000m',s:1,r:'1000m',note:'Station 5'},{n:'Farmers carry',s:1,r:'200m',note:'Station 6 — do not put down'},{n:'Sandbag lunges',s:1,r:'100m',note:'Station 7 — short steps, chest up'},{n:'Wall ball (9kg)',s:1,r:'100 reps',note:'Station 8 — sets of 20, no rest on floor'}]},
  p3A_sat:{name:'Long run — moderate hard',type:'run',purpose:'Build peak aerobic endurance — the biggest run of the program.',dur:'70–85 min',intensity:'Moderate–Hard',rd:{label:'Long run',dist:'7–8 mi',effort:'First 30 min easy · Middle 30 min at moderate-hard pace · Last 10 min easy'}},
  p3B_mon:{name:'Lower body — peak maintenance',purpose:'Heavy compound work and loaded station movements — maintain peak strength.',dur:'55–65 min',intensity:'Moderate–Hard',ex:[{n:'Barbell back squat',s:4,r:'4',note:'Work to near-maximal weight'},{n:'Romanian deadlift',s:3,r:'6',note:'Heavy'},{n:'Sled push (or heavy sandbag drag)',s:4,r:'40m',note:'Max weight you can move'},{n:'Sandbag lunges',s:4,r:'40m',note:'Heavy bag — break if form breaks'},{n:'Copenhagen plank',s:3,r:'35s ea',note:''},{n:'Hip thrust',s:3,r:'8',note:'Weighted — slow 3s eccentric'}]},
  p3B_wed:{name:'Hard intervals — peak',type:'run',purpose:'Maintain VO2 ceiling and sharpness going into taper.',dur:'45–55 min',intensity:'Hard',rd:{label:'Hard intervals',dist:'8×0.4 mi',effort:'92–95% effort each · 90s recovery jog · Controlled-hard, not all-out sprint'}},
  p3B_fri:{name:'Race rehearsal — full simulation',purpose:'Simulate race day in full — all stations at race weight and race pace.',dur:'80–100 min',intensity:'Race Effort',ex:[{n:'1km run',s:8,r:'1km',note:'RACE PACE — no holding back'},{n:'SkiErg 1000m',s:1,r:'1000m',note:'Station 1'},{n:'Sled push (or max loaded sub)',s:1,r:'50m',note:'Station 2'},{n:'Sled pull (or farmers carry)',s:1,r:'50m',note:'Station 3'},{n:'Burpee broad jumps',s:1,r:'80 reps',note:'Station 4 — push your limit'},{n:'Row 1000m',s:1,r:'1000m',note:'Station 5'},{n:'Farmers carry',s:1,r:'200m',note:'Station 6'},{n:'Sandbag lunges',s:1,r:'100m',note:'Station 7'},{n:'Wall ball (9kg)',s:1,r:'100 reps',note:'Station 8 — last thing, give everything'}]},
  p3B_sat:{name:'Race pace long run',type:'run',purpose:'Final high-volume run — consolidate race-pace running before taper.',dur:'65–80 min',intensity:'Hard',rd:{label:'Race pace long run',dist:'6–7.5 mi',effort:'10 min easy warm-up · 40–50 min at or just below race pace · 10 min cool-down'}},
  /* ── PHASE 4 · TAPER (weeks 29–32) ── */
  p4A_mon:{name:'Full body activation',purpose:'Maintain neural activation without accumulating fatigue — preserve what you built.',dur:'35–45 min',intensity:'Moderate',ex:[{n:'Bench press',s:3,r:'4',note:'Heavy but crisp — no grinders'},{n:'Pull-up',s:3,r:'5',note:''},{n:'SkiErg 3×200m',s:3,r:'200m',note:'Full effort each rep — short and sharp'},{n:'Farmers carry',s:2,r:'60m',note:''},{n:'Hollow body hold',s:2,r:'30s',note:''}]},
  p4A_wed:{name:'Easy run — taper',type:'run',purpose:'Maintain aerobic feel without adding load — legs should feel fresh.',dur:'30–40 min',intensity:'Easy',rd:{label:'Easy run',dist:'2.5–3 mi',effort:'Fully conversational — deliberately easy is the goal here'}},
  p4A_fri:{name:'HYROX activation — light',purpose:'Stay sharp on station movements without building fatigue.',dur:'40–50 min',intensity:'Moderate',ex:[{n:'1km run at race pace',s:2,r:'1km',note:'Two good efforts — no more'},{n:'Wall ball (9kg)',s:3,r:'20',note:'Sharp and snappy — not trying to go hard'},{n:'Farmers carry',s:3,r:'60m',note:'Race weight — two passes'},{n:'Row 500m',s:2,r:'500m',note:'Race pace — clean technique'},{n:'Sandbag lunges',s:2,r:'20m',note:''},{n:'Burpee broad jumps',s:1,r:'10',note:'One sharp set — call it done'}]},
  p4A_sat:{name:'Easy run — aerobic feel',type:'run',purpose:'Aerobic maintenance only — resist the urge to run faster.',dur:'35–45 min',intensity:'Easy',rd:{label:'Easy run',dist:'3–3.5 mi',effort:'Conversational throughout — if breathing hard, slow down'}},
  p4B_mon:{name:'Lower body activation',purpose:'Light lower body to stay sharp — no fatigue accumulation before race week.',dur:'30–40 min',intensity:'Low–Moderate',ex:[{n:'Goblet squat',s:3,r:'8',note:'Crisp and controlled — no heavy loading'},{n:'Single-leg RDL',s:3,r:'8ea',note:''},{n:'Hip thrust',s:2,r:'10',note:'Bodyweight or light load only'},{n:'Lateral lunge',s:2,r:'8ea',note:''},{n:'Calf raise',s:2,r:'15',note:'Slow eccentric — hold the stretch'}]},
  p4B_wed:{name:'Short sharp intervals',type:'run',purpose:'Maintain race sharpness — volume low but effort must be real.',dur:'30–40 min',intensity:'Moderate–Hard',rd:{label:'Short intervals',dist:'4×0.25 mi',effort:'95% effort per rep · Full recovery between · 10 min warm-up and cool-down each side'}},
  p4B_fri:{name:'HYROX race prep',purpose:'Final station movement — prep the patterns before race week, no new stress.',dur:'25–35 min',intensity:'Easy–Moderate',ex:[{n:'1km easy run',s:1,r:'1km',note:'One relaxed effort — feel the legs under you'},{n:'Wall ball (9kg)',s:2,r:'15',note:'Perfect form — not going hard'},{n:'Farmers carry',s:2,r:'40m',note:'Lighter than race weight'},{n:'Burpee broad jumps',s:1,r:'6',note:''},{n:'SkiErg 250m',s:2,r:'250m',note:'Easy pace — technique only'}]},
  p4B_sat:{name:'Race week run',type:'run',purpose:'Final run before race day — legs should feel springy and ready.',dur:'20–30 min',intensity:'Easy',rd:{label:'Short easy run',dist:'2–2.5 mi',effort:'Fully easy — stop if anything feels off. Save everything for tomorrow.'}},
  /* ── THURSDAY sessions (5-day plan) — upper body pull focus ── */
  p0A_thu:{name:'Upper body — pull foundations',purpose:'Build pulling strength for SkiErg and sled pull — the most undertrained HYROX movements.',dur:'45–50 min',intensity:'Moderate',ex:[{n:'Lat pulldown',s:4,r:'10',note:'Full extension at bottom, squeeze at top'},{n:'Bent-over dumbbell row',s:4,r:'10ea',note:'Neutral spine, drive elbow back'},{n:'Face pull',s:3,r:'15',note:'External rotation — rear delt and rotator cuff'},{n:'SkiErg 4×250m',s:4,r:'250m',note:'Easy effort — technique focus, not pace'},{n:'Farmers carry',s:3,r:'40m',note:'Packed shoulders, tall posture'},{n:'Dead bug',s:3,r:'8ea',note:'Lower back stays flat'}]},
  p0B_thu:{name:'Upper body — pull volume',purpose:'Add pulling volume to build the back and grip strength needed for carry events.',dur:'45–50 min',intensity:'Moderate',ex:[{n:'Cable row',s:4,r:'12',note:'Drive elbows back, pause at chest'},{n:'Lat pulldown',s:3,r:'12',note:'Full ROM'},{n:'SkiErg 5×250m',s:5,r:'250m',note:'Build to moderate effort'},{n:'Single-arm dumbbell row',s:3,r:'12ea',note:'Brace against bench'},{n:'Band pull-apart',s:3,r:'20',note:'Arms straight, slow and controlled'},{n:'Hollow body hold',s:3,r:'30s',note:''}]},
  p1A_thu:{name:'Upper body — pull build',purpose:'Progress pulling load — weighted rows and pull-ups feed directly into SkiErg and sled pull performance.',dur:'50–55 min',intensity:'Moderate–Hard',ex:[{n:'Weighted pull-up',s:4,r:'6',note:'Full hang at bottom, chin over bar'},{n:'Pendlay row',s:4,r:'8',note:'Bar to floor each rep — no momentum'},{n:'SkiErg 4×300m',s:4,r:'300m',note:'85% effort — rest 90s between'},{n:'Farmers carry',s:4,r:'50m',note:'Heavy — no shrugging'},{n:'Face pull',s:3,r:'15',note:'High anchor, pull to forehead'},{n:'Dead bug',s:3,r:'10ea',note:''}]},
  p1B_thu:{name:'Upper body — pull power',purpose:'Develop explosive pulling for SkiErg sprint efforts — short and fast.',dur:'50–55 min',intensity:'Moderate–Hard',ex:[{n:'Pull-up',s:5,r:'5',note:'Explosive concentric, controlled descent'},{n:'Bent-over barbell row',s:4,r:'6',note:'Controlled tempo, heavy'},{n:'SkiErg 6×200m',s:6,r:'200m',note:'Sprint effort — full recovery between'},{n:'Farmers carry',s:4,r:'50m',note:'Heaviest of the program so far'},{n:'Cable face pull',s:3,r:'15',note:''},{n:'Pallof press',s:3,r:'10ea',note:'Anti-rotation — brace hard'}]},
  p2A_thu:{name:'Upper body — pull maintain',purpose:'Maintain pulling strength while race simulation volume increases.',dur:'45–55 min',intensity:'Moderate',ex:[{n:'Weighted pull-up',s:4,r:'5',note:'Quality reps — no kipping'},{n:'Single-arm row',s:4,r:'10ea',note:'Heavy — control the twist'},{n:'SkiErg 4×250m',s:4,r:'250m',note:'Race pace effort each rep — 90s rest'},{n:'Farmers carry',s:4,r:'60m',note:'Race load — no putting down'},{n:'Band pull-apart',s:3,r:'20',note:''},{n:'Dead bug',s:3,r:'10ea',note:''}]},
  p2B_thu:{name:'Upper body — pull peak',purpose:'Peak pulling strength — heavy and sharp without accumulating fatigue before simulation day.',dur:'50–55 min',intensity:'Hard',ex:[{n:'Weighted pull-up',s:5,r:'4',note:'Heaviest of the program'},{n:'Pendlay row',s:4,r:'5',note:'Heavy — reset on the floor each rep'},{n:'SkiErg 5×250m',s:5,r:'250m',note:'Max effort each rep — full recovery'},{n:'Farmers carry',s:4,r:'80m',note:'Race load — one pass without dropping'},{n:'Face pull',s:3,r:'12',note:''},{n:'Hollow body hold',s:3,r:'40s',note:''}]},
  p3A_thu:{name:'Upper body — pull peak maintenance',purpose:'Maintain peak pulling capacity without adding fatigue before full simulation.',dur:'45–50 min',intensity:'Moderate–Hard',ex:[{n:'Weighted pull-up',s:4,r:'4',note:'Crisp quality — no grinders'},{n:'Bent-over barbell row',s:3,r:'5',note:'Heavy'},{n:'SkiErg 5×200m',s:5,r:'200m',note:'Sprint effort each rep — 2 min rest'},{n:'Farmers carry',s:3,r:'80m',note:'Heaviest load'},{n:'Face pull',s:3,r:'12',note:''}]},
  p3B_thu:{name:'Upper body — pull flush',purpose:'Keep pulling movements fresh — maintain sharpness without adding stress going into taper.',dur:'35–45 min',intensity:'Moderate',ex:[{n:'Pull-up',s:3,r:'6',note:'Bodyweight — controlled and clean'},{n:'Cable row',s:3,r:'10',note:'Moderate weight, full ROM'},{n:'SkiErg 4×200m',s:4,r:'200m',note:'Comfortable effort — 90s rest'},{n:'Farmers carry',s:3,r:'60m',note:''},{n:'Band pull-apart',s:3,r:'20',note:''}]},
  p4A_thu:{name:'Upper body — pull activation',purpose:'Keep the pulling patterns sharp in taper — no new stress, just stay switched on.',dur:'30–35 min',intensity:'Low–Moderate',ex:[{n:'Pull-up',s:3,r:'4',note:'Crisp — stop well short of failure'},{n:'Cable row',s:2,r:'10',note:'Moderate weight'},{n:'SkiErg 3×200m',s:3,r:'200m',note:'Sharp and snappy — not a grind'},{n:'Farmers carry',s:2,r:'60m',note:'Race weight — two clean passes'}]},
  p4B_thu:{name:'Upper body — race day prep',purpose:'Final pulling activation — prime the SkiErg patterns and grip before race day.',dur:'20–25 min',intensity:'Easy',ex:[{n:'Pull-up',s:2,r:'4',note:'Easy — feel loose and strong'},{n:'SkiErg 3×150m',s:3,r:'150m',note:'Race pace — short and sharp, full recovery'},{n:'Farmers carry',s:1,r:'40m',note:'Race weight — one relaxed pass'},{n:'Band pull-apart',s:2,r:'15',note:'Wake up the rear delts'}]},
  /* ── TUESDAY sessions (5-day plan) — easy run ── */
  p0_tue:{name:'Recovery run',type:'run',purpose:'Easy aerobic — keeps momentum between strength days without adding load.',dur:'25–30 min',intensity:'Easy',rd:{label:'Recovery run',dist:'2–3 mi',effort:'Very easy — fully conversational. Active recovery, not a workout.'}},
  p1_tue:{name:'Easy run + strides',type:'run',purpose:'Light aerobic stimulus between strength days — finish with short strides to keep legs sharp.',dur:'30–35 min',intensity:'Easy',rd:{label:'Easy run',dist:'3–4 mi',effort:'Easy throughout — finish with 4×20s strides at 85% effort'}},
  p2_tue:{name:'Easy aerobic run',type:'run',purpose:'Maintain aerobic base between harder training days — legs stay fresh for Wednesday threshold work.',dur:'30–40 min',intensity:'Easy',rd:{label:'Easy run',dist:'3–4 mi',effort:'Conversational pace — this should feel relaxed compared to Wednesday'}},
  p3_tue:{name:'Easy run',type:'run',purpose:'Maintain aerobic feel during peak phase — protect your legs for Friday full simulation.',dur:'25–35 min',intensity:'Easy',rd:{label:'Easy run',dist:'2.5–3.5 mi',effort:'Fully easy — you have a full simulation on Friday, protect your legs today'}},
  p4_tue:{name:'Easy run — taper',type:'run',purpose:'Keep the engine turning during taper — resist the urge to go harder.',dur:'20–30 min',intensity:'Easy',rd:{label:'Easy run',dist:'2–3 mi',effort:'Fully conversational — deliberately easy. Save everything for race day.'}},
  /* ── legacy keys (fallback) ── */
  run_wed:{name:'Easy run',type:'run',purpose:'Aerobic maintenance — keep the engine ticking.',dur:'30–35 min',intensity:'Easy',rd:{label:'Easy run',dist:'2–3 mi',effort:'Conversational pace throughout'}},
  run_A_sat:{name:'Long easy run',type:'run',purpose:'Build aerobic base — the foundation everything else sits on.',dur:'45–55 min',intensity:'Easy',rd:{label:'Long run',dist:'3–4.5 mi',effort:'Slow and conversational — this pace is correct'}},
  run_B_sat:{name:'Long run + station finish',type:'run',purpose:'Extend aerobic base and introduce station work after running.',dur:'60–70 min',intensity:'Easy–Moderate',rd:{label:'Long run + stations',dist:'4–5 mi + carries',effort:'Easy run, then 2×40m farmers carry at the end'}},
};

function getTrainingDayFlags(dow,programType='4-day',preferredTrainingDays,trainingWeekStart='Mon'){
  const normalized=programType==='5-day'?'5-day':'4-day';
  const dayIndexToLabel=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const preferredLabels=Array.isArray(preferredTrainingDays)&&preferredTrainingDays.length
    ?preferredTrainingDays
    :getAnchoredTrainingDays(normalized,trainingWeekStart);
  const seenTrainingDays=new Set();
  const trainingDays=preferredLabels
    .map(label=>dayIndexToLabel.indexOf(label))
    .filter(idx=>idx>=0&&!seenTrainingDays.has(idx)&&seenTrainingDays.add(idx));
  const fallbackTrainingDays=trainingDays.length
    ?trainingDays
    :getAnchoredTrainingDays(normalized,trainingWeekStart).map(label=>dayIndexToLabel.indexOf(label));
  const canonicalSlots=normalized==='5-day'
    ?['mon','tue','wed','thu','sat']
    :['mon','wed','fri','sat'];
  const daySlot=fallbackTrainingDays.includes(dow)
    ?canonicalSlots[Math.max(0,fallbackTrainingDays.indexOf(dow))]
    :null;
  return{
    trainingDays:fallbackTrainingDays,
    isTrainingDay:fallbackTrainingDays.includes(dow),
    daySlot,
    programType:normalized,
    isRunDay:daySlot==='tue'||daySlot==='wed',
    isLongDay:daySlot==='sat',
    isThursdayStrengthDay:daySlot==='thu',
  };
}

function isTrainingDayForDate(dateStr,programType='4-day',preferredTrainingDays,trainingWeekStart='Mon'){
  const dow=new Date(dateStr+'T12:00:00').getDay();
  return getTrainingDayFlags(dow,programType,preferredTrainingDays,trainingWeekStart).isTrainingDay;
}

function getProgramLibraryWorkout(fitnessProgram,programType,wkType,daySlot){
  const normalizedProgram=normalizeFitnessProgram(fitnessProgram);
  if(normalizedProgram==='hyrox'||!daySlot)return null;
  return PROGRAM_WORKOUT_LIBRARY[normalizedProgram]?.[programType]?.[wkType||'A']?.[daySlot]
    || PROGRAM_WORKOUT_LIBRARY[normalizedProgram]?.[programType]?.A?.[daySlot]
    || null;
}

function getTodayWk(wkType,phIdx,flags,fitnessProgram='hyrox'){
  if(!flags?.isTrainingDay)return null;
  const normalizedProgram=normalizeFitnessProgram(fitnessProgram);
  if(normalizedProgram!=='hyrox'){
    return getProgramLibraryWorkout(normalizedProgram,flags.programType||'4-day',wkType,flags.daySlot);
  }
  const ph=Number.isFinite(phIdx)?phIdx:0,wt=wkType||'A';
  const k=`p${ph}${wt}`;
  if(flags.daySlot==='sat')return WKS[`${k}_sat`]||(wt==='A'?WKS.run_A_sat:WKS.run_B_sat)||WKS.p0A_mon;
  if(flags.daySlot==='thu')return WKS[`${k}_thu`]||WKS[`p0${wt}_thu`]||WKS.p0A_mon;
  if(flags.daySlot==='tue')return WKS[`p${ph}_tue`]||WKS.p0_tue||WKS.run_wed||WKS.p0A_mon;
  if(flags.daySlot==='wed')return WKS[`${k}_wed`]||WKS.run_wed||WKS.p0A_mon;
  if(flags.daySlot==='mon')return WKS[`${k}_mon`]||WKS[`p0${wt}_mon`]||WKS.p0A_mon;
  if(flags.daySlot==='fri')return WKS[`${k}_fri`]||WKS[`p0${wt}_fri`]||WKS.p0A_fri||WKS.p0A_mon;
  return null;
}

function getPlannedWorkoutForDate(dateStr,wkType,phIdx,fitnessProgram='hyrox',programType='4-day',preferredTrainingDays,trainingWeekStart='Mon'){
  const dow=new Date(dateStr+'T12:00:00').getDay();
  const flags=getTrainingDayFlags(dow,programType,preferredTrainingDays,trainingWeekStart);
  const sess=getTodayWk(wkType,phIdx,flags,fitnessProgram);
  if(!sess)return null;
  const normalizedExercises=(sess.ex||[]).map(exercise=>{
    const exerciseId=exercise?.exerciseId||resolveExerciseDefinition(exercise?.n||exercise?.name||'').id;
    return{...exercise,exerciseId};
  });
  return{
    ...sess,
    ex:normalizedExercises,
    plannedDate:dateStr,
    plannedDayLabel:DAY_NAMES[dow],
    plannedSlot:flags.daySlot,
    plannedName:sess.name,
  };
}

function getWorkoutLogForPlan(plan,history){
  if(!plan)return null;
  return(history||[]).find(entry=>{
    if(entry.type!=='workout'&&entry.type!=='run'&&entry.type!=='recovery')return false;
    const plannedDate=entry.data?.plannedDate||entry.plannedDate;
    if(plannedDate)return plannedDate===plan.plannedDate;
    return entry.date===plan.plannedDate&&entry.name===plan.name;
  })||null;
}

function resolveWeeklyTrainingPlan(weekStart,wkType,phIdx,fitnessProgram='hyrox',programType='4-day',preferredTrainingDays,trainingWeekStart='Mon',history,todayStr=getCurrentDate().today){
  const days=Array.from({length:7},(_,i)=>{
    const d=new Date(weekStart);
    d.setDate(d.getDate()+i);
    return formatDateKey(d);
  });
  return days.reduce((acc,dateStr)=>{
    const planned=getPlannedWorkoutForDate(dateStr,wkType,phIdx,fitnessProgram,programType,preferredTrainingDays,trainingWeekStart);
    if(!planned)return acc;
    const completedLog=getWorkoutLogForPlan(planned,history);
    const status=completedLog
      ?(completedLog.date===planned.plannedDate?'completed':'moved')
      :dateStr<todayStr
        ?'missed'
        :dateStr===todayStr
          ?'today'
          :'planned';
    acc.push({
      ...planned,
      completedLog,
      completedDate:completedLog?.date||null,
      status,
      moved:!!(completedLog&&completedLog.date!==planned.plannedDate),
      moveLabel:completedLog&&completedLog.date!==planned.plannedDate
        ?`Moved to ${formatDate(completedLog.date,'weekdayMonthDayShort')}`
        :null,
    });
    return acc;
  },[]);
}

function resolveWeeklyTrainingPlanFromProfile(weekStart,athleteProfile,fitnessProgram='hyrox',history,todayStr=getCurrentDate().today){
  const programType=athleteProfile?.programType||'4-day';
  const preferredTrainingDays=athleteProfile?.preferredTrainingDays;
  const trainingWeekStart=athleteProfile?.trainingWeekStart||'Mon';
  const days=Array.from({length:7},(_,i)=>{
    const d=new Date(weekStart);
    d.setDate(d.getDate()+i);
    return formatDateKey(d);
  });
  return days.reduce((acc,dateStr)=>{
    const cycleState=getTrainingCycleState(athleteProfile?.planStartDate,athleteProfile?.raceDate,dateStr);
    const planned=getPlannedWorkoutForDate(dateStr,cycleState.weekType,cycleState.phaseIndex,fitnessProgram,programType,preferredTrainingDays,trainingWeekStart);
    if(!planned)return acc;
    const completedLog=getWorkoutLogForPlan(planned,history);
    const status=completedLog
      ?(completedLog.date===planned.plannedDate?'completed':'moved')
      :dateStr<todayStr
        ?'missed'
        :dateStr===todayStr
          ?'today'
          :'planned';
    acc.push({
      ...planned,
      completedLog,
      completedDate:completedLog?.date||null,
      status,
      moved:!!(completedLog&&completedLog.date!==planned.plannedDate),
      moveLabel:completedLog&&completedLog.date!==planned.plannedDate
        ?`Moved to ${formatDate(completedLog.date,'weekdayMonthDayShort')}`
        :null,
    });
    return acc;
  },[]);
}

function getWorkoutLibrarySessions(fitnessProgram='hyrox',programType='4-day',wkType='A',phIdx=0){
  const normalizedProgram=normalizeFitnessProgram(fitnessProgram);
  if(normalizedProgram==='hyrox'){
    const altType=wkType==='A'?'B':'A';
    const keys=['mon','tue','wed','thu','fri','sat'];
    const seen=new Set();
    return [wkType,altType].flatMap(type=>{
      return keys.map(daySlot=>{
        const session=getTodayWk(type,phIdx,{isTrainingDay:true,daySlot,programType},'hyrox');
        if(!session)return null;
        const dedupeKey=`${type}-${daySlot}-${session.name}`;
        if(seen.has(dedupeKey))return null;
        seen.add(dedupeKey);
        return{...session,libraryId:dedupeKey,rotation:type,daySlot};
      }).filter(Boolean);
    });
  }
  const templates=PROGRAM_WORKOUT_LIBRARY[normalizedProgram]?.[programType]||{};
  const seen=new Set();
  return ['A','B'].flatMap(rotation=>{
    return ['mon','tue','wed','thu','fri','sat'].map(daySlot=>{
      const session=templates[rotation]?.[daySlot];
      if(!session)return null;
      const dedupeKey=`${rotation}-${daySlot}-${session.name}`;
      if(seen.has(dedupeKey))return null;
      seen.add(dedupeKey);
      return{...session,libraryId:dedupeKey,rotation,daySlot};
    }).filter(Boolean);
  });
}

function describeWorkoutAdjustment(sess){
  if(!sess?.adjustmentLabel)return null;
  if(sess.originalName&&sess.adjustmentLabel==='Recovery Replacement'){
    return `${sess.adjustmentLabel} from ${sess.originalName}`;
  }
  return sess.adjustmentLabel;
}

function getWorkoutPaceLabel(sess,paceProfile){
  if(!sess||sess.type!=='run'||!paceProfile)return null;
  const nm=(sess.name||'').toLowerCase();
  if(nm.includes('interval'))return paceProfile.interval;
  if(nm.includes('tempo')||nm.includes('threshold')||nm.includes('race'))return paceProfile.threshold;
  return paceProfile.easy;
}

const RECOVERY_SESSIONS=[
  {id:'fullbody',name:'Full body reset',when:'After any strength session or rest day',dur:'18 min',clr:C.sage,
   moves:[{n:'Neck rolls',d:30,note:'Slow full circles each direction'},{n:'Cross-body shoulder stretch',d:30,side:true,note:'Pull arm across, hold firm'},{n:'Standing forward fold',d:45,note:'Soft knees, head hangs heavy'},{n:'Hip flexor lunge',d:60,side:true,note:'Tuck pelvis, sink hips'},{n:'Pigeon pose',d:60,side:true,note:'Square hips to the ground'},{n:'Seated hamstring stretch',d:45,side:true,note:'Flex foot, hinge from hips'},{n:'Supine spinal twist',d:30,side:true,note:'Both shoulders stay down'},{n:"Child's pose",d:60,note:'Breathe into lower back'}]},
  {id:'runner',name:'Runner recovery',when:'After any run or the day after a long run',dur:'16 min',clr:C.navy,
   moves:[{n:'Standing calf stretch',d:45,side:true,note:'Heel off step — full calf'},{n:'Achilles low lunge',d:40,side:true,note:'Back knee bent, heel pressing down'},{n:'Standing quad stretch',d:45,side:true,note:'Knee points down, hips level'},{n:'Hip flexor lunge',d:60,side:true,note:'Front foot forward, back knee down'},{n:'Hamstring stretch',d:60,side:true,note:'Foot propped, hinge at hips'},{n:'IT band stretch',d:45,side:true,note:'Cross leg, lean away'},{n:'Figure four — glute',d:60,side:true,note:'Cross ankle, flex foot'},{n:'Forward fold release',d:60,note:'Sway gently, release spine'}]},
  {id:'upper',name:'Upper body mobility',when:'After upper body strength, SkiErg or row sessions',dur:'12 min',clr:C.amber,
   moves:[{n:'Neck side stretch',d:30,side:true,note:'Let gravity do the work'},{n:'Cross-body shoulder stretch',d:30,side:true,note:'Opposite arm pulls across'},{n:'Doorway chest stretch',d:60,note:'Arms at 90°, step through'},{n:'Overhead lat stretch',d:40,side:true,note:'Arm overhead, lean into it'},{n:'Thoracic extension',d:60,note:'Over roller — pause at tight spots'},{n:'Wrist flexor stretch',d:30,side:true,note:'Arm straight, palm up'},{n:"Child's pose wide arms",d:60,note:'Walk hands to each side'}]},
  {id:'lower',name:'Lower body mobility',when:'After leg day, HYROX sim, or before a long run',dur:'17 min',clr:C.navy,
   moves:[{n:'Standing quad stretch',d:45,side:true,note:'Stand tall, knee points down'},{n:'Deep hip flexor lunge',d:75,side:true,note:'Back knee down, arms overhead'},{n:'Half splits',d:60,side:true,note:'Straighten front leg, flex foot'},{n:'Seated butterfly',d:60,note:'Tall spine, press knees gently'},{n:'Frog stretch',d:75,note:'Knees wide — deep inner thigh'},{n:'Pigeon pose',d:90,side:true,note:'Use block if hip lifts'},{n:'Happy baby',d:60,note:'Grab outer feet, rock gently'}]},
  {id:'raceweek',name:'Race week mobility',when:'Daily during taper week',dur:'20 min',clr:C.red,
   moves:[{n:'Full body shake out',d:60,note:'Loose and gentle — release tension'},{n:'Hip flexor lunge',d:60,side:true,note:'Long hold, breathe into front hip'},{n:'Pigeon pose',d:90,side:true,note:'Full hip release'},{n:'Thoracic rotation',d:45,side:true,note:'Seated — rotate upper back'},{n:'Ankle circles + calf',d:45,side:true,note:'Ten circles each direction'},{n:'Standing forward fold',d:60,note:'No forcing — just hang'},{n:'Supine twist',d:45,side:true,note:'Decompress the spine'},{n:'Legs up the wall',d:120,note:'2 full minutes minimum'}]},
  {id:'sleep',name:'Sleep wind down',when:'Evening before bed, especially before hard training',dur:'15 min',clr:C.navy,
   moves:[{n:'Breathwork 4-4-6',d:90,note:'Inhale 4, hold 4, exhale 6. Activate rest mode.'},{n:'Neck and shoulder release',d:30,side:true,note:'Let gravity do the work'},{n:'Reclined butterfly',d:90,note:'Soles together, knees wide. Surrender.'},{n:'Reclined spinal twist',d:45,side:true,note:'Shoulders flat, breathe into the rotation'},{n:'Legs up the wall',d:120,note:'Or feet on bed edge'},{n:'Savasana',d:180,note:'Eyes closed. Body scan. Nothing to do.'}]},
];

const SAVED_MEALS=[
  {meal:'Protein shake',cal:150,pro:30,carb:8},{meal:'Chicken + rice bowl',cal:560,pro:55,carb:65},
  {meal:'Greek yogurt + berries',cal:165,pro:17,carb:22},{meal:'2 eggs on toast',cal:280,pro:18,carb:28},
  {meal:'Protein bar',cal:220,pro:20,carb:26},{meal:'Cottage cheese + fruit',cal:200,pro:25,carb:18},
  {meal:'Oats + banana + PB',cal:420,pro:15,carb:62},{meal:'Tuna wrap',cal:380,pro:38,carb:30},
];
const DEFAULT_MEAL_TEMPLATES=[
  {
    id:'breakfast-protein-oats',
    name:'Protein Oats',
    ingredients:[{foodId:'oats',grams:80},{foodId:'milk_2pct',grams:244},{foodId:'banana',grams:118}],
    servingSizeGrams:442,
    macros:{cal:540,pro:26,carb:84,fat:12},
    tags:['high-protein','breakfast','batch-friendly'],
    mealType:'breakfast',
    batchPrep:{totalRecipeWeight:884,servings:2,macrosPerServing:{cal:540,pro:26,carb:84,fat:12}},
  },
  {
    id:'chicken-rice-bowl',
    name:'Chicken Rice Bowl',
    ingredients:[{foodId:'chicken_breast',grams:160},{foodId:'white_rice',grams:180},{foodId:'broccoli',grams:120}],
    servingSizeGrams:460,
    macros:{cal:560,pro:55,carb:58,fat:10},
    tags:['high-protein','lunch','meal-prep'],
    mealType:'lunch',
    batchPrep:{totalRecipeWeight:1840,servings:4,macrosPerServing:{cal:560,pro:55,carb:58,fat:10}},
  },
  {
    id:'greek-yogurt-berries',
    name:'Greek Yogurt + Berries',
    ingredients:[{foodId:'greek_yogurt',grams:227},{foodId:'berries',grams:140}],
    servingSizeGrams:367,
    macros:{cal:245,pro:23,carb:28,fat:5},
    tags:['high-protein','snack','fast'],
    mealType:'snack',
    batchPrep:null,
  },
];
const DEFAULT_TASK_TEMPLATES=[
  {id:'morning-reset',name:'Morning Reset',text:'Morning reset',priority:1,contextTags:['routine','home'],subtasks:['Review Top 3','Check calendar','Prep breakfast'],defaultBucket:'next'},
  {id:'shutdown',name:'Shutdown',text:'Evening shutdown',priority:1,contextTags:['routine','planning'],subtasks:['Clear inbox','Set tomorrow plan','Reset kitchen'],defaultBucket:'scheduled'},
  {id:'meal-prep',name:'Meal Prep',text:'Meal prep block',priority:2,contextTags:['meal','home'],subtasks:['Choose templates','Cook protein','Portion servings'],defaultBucket:'scheduled'},
];

const SUBS={
  'Barbell back squat':['Goblet squat','Leg press','Bulgarian split squat'],
  'Romanian deadlift':['Dumbbell RDL','Single-leg RDL','Hip thrust'],
  'Dumbbell bench press':['Barbell bench press','Push-ups','Cable fly'],
  'Bent-over dumbbell row':['Cable row','Lat pulldown','Single-arm DB row'],
  'Overhead press':['Dumbbell shoulder press','Arnold press'],
  'Farmers carry':['KB carry','DB carry','Suitcase carry'],
  'Wall ball (9kg)':['Goblet squat thruster','KB thruster'],
  'SkiErg — easy':['Row 250m','Easy bike 3 min'],
  'Row 250m':['SkiErg 250m','Bike 3 min'],
  'Burpee broad jumps':['Regular burpees','Broad jumps','Box jumps'],
  'Sandbag lunges':['DB walking lunges','Barbell lunges'],
  'Copenhagen plank':['Side plank','Lateral band walk'],
};

function svgThumb(label,bg='#E8EDF4',fg='#1A2436'){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" rx="24" fill="${bg}"/><text x="24" y="108" font-family="system-ui, sans-serif" font-size="22" font-weight="700" fill="${fg}">${label.replace(/&/g,'and')}</text></svg>`;
  return`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const EXERCISE_PLACEHOLDER_IMAGE=svgThumb('Exercise demo');
const LOCAL_MEDIA_ASSETS=new Set([
  // Add local /media assets here when they exist in the repo.
]);
function resolveLocalMediaAsset(path){
  if(typeof path!=='string'||path.length===0)return'';
  if(!path.startsWith('/media/')&&!path.startsWith('./media/'))return path;
  const normalized=path.startsWith('./')?path.slice(1):path;
  return LOCAL_MEDIA_ASSETS.has(normalized)?normalized:'';
}
function createExerciseMedia(input={}){
  const fallbackImage=resolveLocalMediaAsset(input.fallbackImage||input.placeholderImage)||EXERCISE_PLACEHOLDER_IMAGE;
  const localVideo=resolveLocalMediaAsset(input.localVideo||input.localVideoUrl||(input.kind==='local_video'?input.src:''))||'';
  const externalVideo=input.externalVideo||input.externalDemoUrl||input.videoUrl||input.youtubeUrl||(input.kind==='external_video'?input.src:'')||'';
  const image=resolveLocalMediaAsset(input.image||input.localImage||input.imageUrl||(input.kind==='image'?input.src:''))||'';
  const thumbnail=resolveLocalMediaAsset(input.thumbnail||input.thumbnailImage)||image||fallbackImage;
  const resolvedKind=localVideo
    ?'local_video'
    :externalVideo
      ?'external_video'
      :image
        ?'image'
        :'none';
  const resolvedSrc=resolvedKind==='local_video'
    ?localVideo
    :resolvedKind==='external_video'
      ?externalVideo
      :resolvedKind==='image'
        ?image
        :'';
  return{
    kind:resolvedKind,
    src:resolvedSrc,
    thumbnail,
    fallbackImage,
    sources:{
      localVideo,
      externalVideo,
      image,
    },
  };
}
function getExerciseThumbnail(media){
  const normalized=createExerciseMedia(media);
  return normalized.thumbnail||normalized.fallbackImage||EXERCISE_PLACEHOLDER_IMAGE;
}
function getExerciseDemoAsset(media,{includePlaceholder=true}={}){
  const normalized=createExerciseMedia(media);
  if(normalized.sources.localVideo)return{kind:'local_video',src:normalized.sources.localVideo,thumbnail:normalized.thumbnail,fallbackImage:normalized.fallbackImage};
  if(normalized.sources.externalVideo)return{kind:'external_video',src:normalized.sources.externalVideo,thumbnail:normalized.thumbnail,fallbackImage:normalized.fallbackImage};
  if(normalized.sources.image)return{kind:'image',src:normalized.sources.image,thumbnail:normalized.thumbnail,fallbackImage:normalized.fallbackImage};
  if(!includePlaceholder)return null;
  return{kind:'image',src:normalized.fallbackImage,thumbnail:normalized.thumbnail,fallbackImage:normalized.fallbackImage};
}
function hasExerciseDemo(media){
  return createExerciseMedia(media).kind!=='none';
}
function toExternalEmbedUrl(url=''){
  if(!url)return'';
  const youtubeMatch=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/i);
  if(youtubeMatch)return`https://www.youtube.com/embed/${youtubeMatch[1]}`;
  return url;
}
function exerciseMediaFor(id,kind='local_video'){
  return createExerciseMedia({
    kind,
    src:kind==='local_video'?`/media/videos/${id}.mp4`:kind==='image'?`/media/thumbs/${id}.jpg`:'',
    thumbnail:`/media/thumbs/${id}.jpg`,
    fallbackImage:EXERCISE_PLACEHOLDER_IMAGE,
  });
}
const EXERCISE_LIBRARY={
  'back-squat':{
    id:'back-squat',
    name:'Back Squat',
    exerciseType:'strength',
    movementPattern:'squat',
    media:createExerciseMedia({kind:'local_video',src:'/media/videos/back-squat.mp4',thumbnail:'/media/thumbs/back-squat.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Brace before you descend','Keep knees tracking over toes','Drive through midfoot to stand'],
    substitutions:['goblet-squat','leg-press','hack-squat'],
    category:'Lower body strength',
    muscleGroup:'Quads and glutes',
    equipment:'Barbell',
    defaultRest:120,
    logType:'weight_reps',
  },
  'romanian-deadlift':{
    id:'romanian-deadlift',
    name:'Romanian deadlift',
    exerciseType:'strength',
    movementPattern:'hinge',
    media:createExerciseMedia({kind:'local_video',src:'/media/videos/romanian-deadlift.mp4',thumbnail:'/media/thumbs/romanian-deadlift.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Push hips back first','Keep a soft bend in the knees','Maintain a neutral spine'],
    substitutions:['dumbbell-rdl','barbell-deadlift','good-morning'],
    category:'Posterior chain',
    muscleGroup:'Hamstrings and glutes',
    equipment:'Barbell or dumbbells',
    defaultRest:105,
    logType:'weight_reps',
  },
  'walking-lunges':{
    id:'walking-lunges',
    name:'Walking Lunges',
    exerciseType:'strength',
    movementPattern:'lunge',
    media:createExerciseMedia({kind:'image',src:'/media/thumbs/walking-lunges.jpg',thumbnail:'/media/thumbs/walking-lunges.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Take a controlled long step','Keep your torso upright','Lower with control and push through the front foot'],
    substitutions:['reverse-lunge','split-squat','stationary-lunge'],
    category:'Lower body strength',
    muscleGroup:'Quads and glutes',
    equipment:'Bodyweight or dumbbells',
    defaultRest:75,
    logType:'distance',
  },
  'push-up':{
    id:'push-up',
    name:'Push-Up',
    exerciseType:'strength',
    movementPattern:'horizontal-push',
    media:createExerciseMedia({kind:'local_video',src:'/media/videos/push-up.mp4',thumbnail:'/media/thumbs/push-up.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Keep body in one straight line','Lower chest with control','Press the floor away'],
    substitutions:['bench-press','incline-push-up','dumbbell-floor-press'],
    category:'Upper push',
    muscleGroup:'Chest and triceps',
    equipment:'Bodyweight',
    defaultRest:60,
    logType:'reps',
  },
  'one-arm-row':{
    id:'one-arm-row',
    name:'One-Arm Row',
    exerciseType:'strength',
    movementPattern:'horizontal-pull',
    media:createExerciseMedia({kind:'local_video',src:'/media/videos/one-arm-row.mp4',thumbnail:'/media/thumbs/one-arm-row.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Keep shoulders square','Pull elbow toward the hip','Control the lowering phase'],
    substitutions:['chest-supported-row','cable-row','barbell-row'],
    category:'Upper pull',
    muscleGroup:'Lats and upper back',
    equipment:'Dumbbell or cable',
    defaultRest:75,
    logType:'weight_reps',
  },
  'plank':{
    id:'plank',
    name:'Plank',
    exerciseType:'mobility',
    movementPattern:'core',
    media:createExerciseMedia({kind:'image',src:'/media/thumbs/plank.jpg',thumbnail:'/media/thumbs/plank.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Brace ribs and glutes','Keep hips level','Push forearms into the floor'],
    substitutions:['dead-bug','hollow-hold','bear-plank'],
    category:'Core',
    muscleGroup:'Anterior trunk',
    equipment:'Bodyweight',
    defaultRest:45,
    logType:'duration',
  },
  'wall-ball':{
    id:'wall-ball',
    name:'Wall Ball',
    exerciseType:'strength',
    movementPattern:'hyrox-conditioning',
    media:createExerciseMedia({kind:'local_video',src:'/media/videos/wall-ball.mp4',thumbnail:'/media/thumbs/wall-ball.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Catch high and descend smoothly','Use legs to drive the ball','Stay tall at release'],
    substitutions:['thruster','med-ball-squat-press','db-thruster'],
    category:'HYROX station',
    muscleGroup:'Legs and shoulders',
    equipment:'Wall ball',
    defaultRest:45,
    logType:'reps',
  },
  'sled-push':{
    id:'sled-push',
    name:'Sled push',
    exerciseType:'cardio',
    movementPattern:'hyrox-power',
    media:createExerciseMedia({kind:'image',src:'/media/thumbs/sled-push.jpg',thumbnail:'/media/thumbs/sled-push.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Drive through the legs continuously','Keep torso angled and braced','Take short powerful steps'],
    substitutions:['heavy-prowler-push','plate-push','incline-treadmill-drive'],
    category:'HYROX station',
    muscleGroup:'Quads and glutes',
    equipment:'Sled',
    defaultRest:90,
    logType:'distance',
  },
  'ski-erg':{
    id:'ski-erg',
    name:'Ski Erg',
    exerciseType:'cardio',
    movementPattern:'hyrox-cardio',
    media:createExerciseMedia({kind:'image',src:'/media/thumbs/ski-erg.jpg',thumbnail:'/media/thumbs/ski-erg.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Initiate from lats and core','Drive hands down past hips','Return under control'],
    substitutions:['battle-rope-pulls','band-lat-pulldown','rower-sprint'],
    category:'Erg',
    muscleGroup:'Full body',
    equipment:'SkiErg',
    defaultRest:45,
    logType:'distance',
  },
  'treadmill-run':{
    id:'treadmill-run',
    name:'Treadmill Run',
    exerciseType:'cardio',
    movementPattern:'run',
    media:createExerciseMedia({kind:'image',src:'/media/thumbs/treadmill-run.jpg',thumbnail:'/media/thumbs/treadmill-run.jpg',fallbackImage:EXERCISE_PLACEHOLDER_IMAGE}),
    coachingCues:['Keep cadence light and steady','Relax shoulders and jaw','Match pace to workout intent'],
    substitutions:['outdoor-run','air-runner','bike-erg-easy'],
    category:'Run',
    muscleGroup:'Cardio',
    equipment:'Treadmill',
    defaultRest:30,
    logType:'duration',
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
  brainDump:[],
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

function createDailyExecutionTask(text='',overrides={}){
  return{
    id:overrides.id||`dx-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    text,
    completed:!!overrides.completed,
    date:overrides.date||getTodayKey(),
    timestamp:overrides.timestamp||new Date().toISOString(),
    updatedAt:overrides.updatedAt||new Date().toISOString(),
    ...overrides,
  };
}

function normalizeDailyExecutionTask(task={},dateKey=getTodayKey(),index=0){
  return createDailyExecutionTask(typeof task==='string'?task:(task?.text||''),{
    ...((task&&typeof task==='object'&&!Array.isArray(task))?task:{}),
    id:task?.id||`dx-${dateKey}-${index}`,
    date:normalizeDateKey(task?.date||dateKey,dateKey),
    completed:!!task?.completed,
    timestamp:typeof task?.timestamp==='string'?task.timestamp:null,
    updatedAt:typeof task?.updatedAt==='string'?task.updatedAt:new Date().toISOString(),
  });
}

function normalizeDailyExecutionEntry(entry,dateKey=getTodayKey(),legacyTop3=[]){
  const source=entry&&typeof entry==='object'&&!Array.isArray(entry)?entry:{};
  const prioritiesSource=Array.isArray(source.priorities)&&source.priorities.length>0
    ?source.priorities
    :Array.isArray(legacyTop3)
      ?legacyTop3.filter(item=>typeof item==='string'&&item.trim())
      :[];
  const priorities=prioritiesSource.map((task,index)=>normalizeDailyExecutionTask(task,dateKey,index));
  const agenda=Array.isArray(source.agenda)&&source.agenda.length>0
    ?source.agenda.map((task,index)=>normalizeDailyExecutionTask(task,dateKey,index))
    :[];
  const mode=source.mode==='execution'?'execution':'planning';
  return{
    date:dateKey,
    priorities,
    agenda:mode==='execution'&&agenda.length===0?priorities.map(task=>({...task})):agenda,
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
  async listEvents(timeMin,timeMax,calendarId='primary'){
    const p=new URLSearchParams({timeMin,timeMax,singleEvents:true,orderBy:'startTime',maxResults:250});
    return this._fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${p}`);
  },
  async createEvent(event,calendarId='primary'){
    return this._fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,{method:'POST',body:JSON.stringify(event)});
  },
  async deleteEvent(eventId,calendarId='primary'){
    return this._fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,{method:'DELETE'});
  },
  async listTasklists(){return this._fetch('https://www.googleapis.com/tasks/v1/users/@me/lists');},
  async listTasks(tasklistId='@default'){
    const p=new URLSearchParams({showCompleted:false,showHidden:false});
    return this._fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks?${p}`);
  },
  async createTask(task,tasklistId='@default'){
    return this._fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks`,{method:'POST',body:JSON.stringify(task)});
  },
  async updateTask(taskId,task,tasklistId='@default'){
    return this._fetch(`https://www.googleapis.com/tasks/v1/lists/${tasklistId}/tasks/${taskId}`,{method:'PUT',body:JSON.stringify(task)});
  },
  async getOrCreateTasklist(title){
    const lists=await this.listTasklists();
    const found=(lists.items||[]).find(l=>l.title===title);
    if(found)return found.id;
    const created=await this._fetch('https://www.googleapis.com/tasks/v1/users/@me/lists',{method:'POST',body:JSON.stringify({title})});
    return created.id;
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
  const [showBrainDumpModal,setShowBrainDumpModal]=useState(false);
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
  const openBrainDump=()=>{
    setShowBrainDumpModal(true);
  };
  function saveBrainDumpEntry(text){
    const entry={id:`brain-${Date.now()}`,text,createdAt:new Date().toISOString(),processed:false};
    updateProfile(p=>({...p,brainDump:[entry,...(p.brainDump||[])]}));
    setShowBrainDumpModal(false);
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

  useEffect(()=>{
    if(!loaded)return;
    const activeState=readActiveWorkoutState();
    if(!activeState)return;
    if(activeState.wkSess){
      setWkSess(hydrateWorkoutSession(activeState.wkSess));
    }
    if(activeState.runSess){
      setRunSess(activeState.runSess);
    }
    if(activeState.recSess){
      setRecSess(activeState.recSess);
      if(typeof activeState.recIdx==='number')setRecIdx(activeState.recIdx);
      if(typeof activeState.recTmr==='number')setRecTmr(activeState.recTmr);
      if(typeof activeState.recOn==='boolean')setRecOn(activeState.recOn);
      if(typeof activeState.recSecond==='boolean')setRecSecond(activeState.recSecond);
    }
    if(activeState.trainView){
      setTrainView(activeState.trainView);
    }
    if(typeof activeState.playerIdx==='number'){
      setPlayerIdx(activeState.playerIdx);
    }
    if(activeState.rest&&typeof activeState.rest.remaining==='number'){
      setRestTmr(activeState.rest.remaining);
      setRestLabel(activeState.rest.label||'Rest');
    }
  },[loaded]);

  useEffect(()=>{
    const media=window.matchMedia('(display-mode: standalone)');
    const syncInstalledState=()=>{
      const installed=media.matches||window.navigator.standalone===true;
      setIsInstalled(installed);
      if(installed){
        setInstallAvailable(false);
        setDeferredInstallPrompt(null);
      }
    };
    const handleBeforeInstallPrompt=event=>{
      event.preventDefault();
      syncInstalledState();
      if(media.matches||window.navigator.standalone===true)return;
      setDeferredInstallPrompt(event);
      setInstallAvailable(true);
    };
    const handleInstalled=()=>{
      setIsInstalled(true);
      setInstallAvailable(false);
      setDeferredInstallPrompt(null);
      updateGrowthState(prev=>({
        ...prev,
        installAcceptedAt:new Date().toISOString(),
      }));
      trackGrowthEvent('install_accepted',{source:'native'});
      showNotif('App installed','success');
    };
    syncInstalledState();
    window.addEventListener('beforeinstallprompt',handleBeforeInstallPrompt);
    window.addEventListener('appinstalled',handleInstalled);
    if(media.addEventListener)media.addEventListener('change',syncInstalledState);
    else media.addListener(syncInstalledState);
    return()=>{
      window.removeEventListener('beforeinstallprompt',handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled',handleInstalled);
      if(media.removeEventListener)media.removeEventListener('change',syncInstalledState);
      else media.removeListener(syncInstalledState);
    };
  },[trackGrowthEvent,updateGrowthState]);

  const openInstallPrompt=useCallback(async()=>{
    trackGrowthEvent('install_cta_clicked',{nativePrompt:!!deferredInstallPrompt});
    if(!deferredInstallPrompt){
      updateGrowthState(prev=>({
        ...prev,
        installPromptShownCount:(prev.installPromptShownCount||0)+1,
        installPromptDismissedAt:new Date().toISOString(),
      }));
      return;
    }
    try{
      await deferredInstallPrompt.prompt();
      const choice=await deferredInstallPrompt.userChoice;
      if(choice?.outcome!=='accepted'){
        updateGrowthState(prev=>({
          ...prev,
          installPromptShownCount:(prev.installPromptShownCount||0)+1,
          installPromptDismissedAt:new Date().toISOString(),
        }));
        trackGrowthEvent('install_declined',{outcome:choice?.outcome||'dismissed'});
      }
    }catch(e){}
    setDeferredInstallPrompt(null);
  },[deferredInstallPrompt,trackGrowthEvent,updateGrowthState]);

  useEffect(()=>{
    if(!loaded||appOpenTrackedRef.current)return;
    appOpenTrackedRef.current=true;
    trackGrowthEvent('app_open');
  },[loaded,trackGrowthEvent]);

  useEffect(()=>{
    if(!loaded||!showMorningCheckin||growthState.activationChecklist.checkInCompleted)return;
    if(growthImpressionRef.current.morningCheckin)return;
    growthImpressionRef.current.morningCheckin=true;
    trackGrowthEvent('onboarding_shown',{surface:'morning_checkin'});
  },[loaded,showMorningCheckin,growthState.activationChecklist.checkInCompleted,trackGrowthEvent]);

  useEffect(()=>{
    if(!loaded||!showActivationChecklist)return;
    if(growthImpressionRef.current.homeActivation)return;
    growthImpressionRef.current.homeActivation=true;
    trackGrowthEvent('onboarding_shown',{surface:'home_activation'});
  },[loaded,showActivationChecklist,trackGrowthEvent]);

  useEffect(()=>{
    if(!loaded||!shouldShowInstallCta)return;
    if(growthImpressionRef.current.installCta)return;
    growthImpressionRef.current.installCta=true;
    trackGrowthEvent('install_cta_shown',{surface:'home'});
  },[loaded,shouldShowInstallCta,trackGrowthEvent]);

  // Morning check-in trigger (once per day, 5am–1pm only)
  useEffect(()=>{
    if(!loaded)return;
    const todayKey=getTodayKey();
    const h=NOW.getHours();
    const shouldShow=h>=5&&h<=13&&!isDailyCheckinCompleted(todayKey)&&dismissedMorningCheckinDate!==todayKey;
    setShowMorningCheckin(shouldShow);
  },[loaded,NOW,TODAY,dailyLogs,dismissedMorningCheckinDate]);

  useEffect(()=>{
    if(!showMorningCheckin)return;
    const todayKey=getTodayKey();
    const existingEntry=getDailyCheckinEntry(todayKey);
    setCheckInMood(typeof existingEntry?.mood==='number'?existingEntry.mood:null);
    setCheckInEnergy(typeof existingEntry?.energy==='number'?existingEntry.energy:3);
    setCheckInStress(typeof existingEntry?.stress==='number'?existingEntry.stress:2);
    setCheckInNote(typeof existingEntry?.note==='string'?existingEntry.note:'');
    setCheckInSleep(typeof existingEntry?.sleepHours==='number'?existingEntry.sleepHours:7);
    setShowCheckInNote(!!existingEntry?.note);
    const onKeyDown=e=>{
      if(e.key!=='Escape')return;
      e.preventDefault();
      setShowMorningCheckin(false);
      setDismissedMorningCheckinDate(todayKey);
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[showMorningCheckin]);

  useEffect(()=>{
    if(!loaded)return;
    clearTimeout(saveRef.current);
    saveRef.current=setTimeout(()=>storage.setJSON(STORAGE_KEYS.profile,profile),150);
    return()=>clearTimeout(saveRef.current);
  },[profile,loaded]);

  useEffect(()=>{
    latestProfileRef.current=profile;
  },[profile]);

  useEffect(()=>{
    growthStateRef.current=growthState;
    growthStateCache=growthState;
  },[growthState]);

  useEffect(()=>{
    if(!loaded)return;
    storage.setJSON(STORAGE_KEYS.growth,growthState);
  },[growthState,loaded]);

  useEffect(()=>{
    if(!loaded)return;
    if(!wkSess&&!runSess&&!recSess){
      writeActiveWorkoutState(null);
      return;
    }
    writeActiveWorkoutState({
      dateKey:wkSess?.dateKey||runSess?.dateKey||recSess?.dateKey||getTodayKey(),
      wkSess,
      runSess,
      recSess,
      recIdx,
      recTmr,
      recOn,
      recSecond,
      trainView,
      playerIdx,
      rest:restTmr!==null?{remaining:restTmr,label:restLabel}:null,
    });
  },[loaded,wkSess,runSess,recSess,recIdx,recTmr,recOn,recSecond,trainView,playerIdx,restTmr,restLabel]);

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
        openBrainDump();
      }else if(key==='t'){
        e.preventDefault();
        openBrainDump();
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
        taskHistory:p.taskHistory.map(task=>{
          if(task.done||(task.status||'active')!=='active')return task;
          const isDirectOverdue=task.date<TODAY&&!task.parentId;
          const parentRolled=isDirectOverdue?null:overdue.find(item=>item.id===task.parentId);
          if(!isDirectOverdue&&!parentRolled)return task;
          return{
            ...task,
            date:TODAY,
            bucket:'next',
            scheduledTime:'',
            priority:Math.min((task.priority||1)+(task.parentId?0:1),3),
            rolledFrom:task.rolledFrom||task.id,
            status:'active',
            updatedAt:new Date().toISOString(),
          };
        }),
        lastRolloverDate:TODAY,
      }));
    }else{
      updateProfile({lastRolloverDate:TODAY});
    }
  },[loaded,profile.lastRolloverDate,profile.taskHistory,TODAY,updateProfile]);

  useEffect(()=>{
    if(!loaded)return;
    const wk=weekKey(NOW);
    if(profile.lastWeeklySnapshotKey!==wk){
      const snapshot={
        week:wk,
        createdAt:new Date().toISOString(),
        workouts:workoutHistory.filter(h=>h.date>=wk).length,
        inboxPending:(inboxItems||[]).filter(x=>x.status==='pending').length,
        transactions:(transactions||[]).filter(t=>t.date>=wk).length,
        habitsCompleted:Object.values(dailyLogs||{}).filter(log=>(log?.habitsCompleted||[]).length>0).length
      };
      updateProfile(p=>({...p,lastWeeklySnapshotKey:wk,weeklySnapshots:[...(p.weeklySnapshots||[]).slice(-11),snapshot]}));
    }
    if(NOW.getDay()===0&&profile.lastWeeklyPlanKey!==wk){
      setShowWeeklyPlanner(true);
    }
  },[loaded,NOW,TODAY,profile.lastWeeklySnapshotKey,profile.lastWeeklyPlanKey,workoutHistory,inboxItems,transactions,dailyLogs,updateProfile]);

  useEffect(()=>{
    if(restTmr===null)return;
    if(restTmr<=0){setRestTmr(null);setRestLabel('');return;}
    restRef.current=setTimeout(()=>setRestTmr(t=>t-1),1000);
    return()=>clearTimeout(restRef.current);
  },[restTmr]);
  useEffect(()=>{
    if(!focusTmrRunning||focusTmrSec===null)return;
    if(focusTmrSec<=0){setFocusTmrRunning(false);showNotif('Timer complete!','success');return;}
    const id=setTimeout(()=>setFocusTmrSec(s=>s-1),1000);
    return()=>clearTimeout(id);
  },[focusTmrRunning,focusTmrSec]);

  useEffect(()=>{
    if(!recOn||!recSess)return;
    if(recTmr<=0){
      const cur=recSess.moves[recIdx];
      if(cur?.side&&!recSecond){setRecSecond(true);setRecTmr(cur.d);return;}
      setRecSecond(false);
      const next=recIdx+1;
      if(next<recSess.moves.length){setRecIdx(next);setRecTmr(recSess.moves[next].d);}
      else{
        setRecOn(false);
        const sessionDateKey=recSess.dateKey||TODAY;
        updateProfile(p=>({...p,workouts:[...(p.workouts||p.workoutHistory||[]),{date:sessionDateKey,type:'recovery',name:recSess.name,data:{
          durationMins:parseInt(recSess.dur,10)||Math.round((recSess.moves||[]).reduce((sum,move)=>sum+(move?.d||0)*(move?.side?2:1),0)/60),
          moves:recSess.moves||[],
          recoveryState:recoveryToday.level,
          plannedDate:recSess.plannedDate||sessionDateKey,
          plannedDayLabel:recSess.plannedDayLabel||DAY_NAMES[DOW],
          plannedName:recSess.plannedName||recSess.name,
          completedOffSchedule:(recSess.plannedDate||sessionDateKey)!==sessionDateKey,
        }}]}));
        setRecSess(s=>({...s,_done:true}));
      }
      return;
    }
    recRef.current=setTimeout(()=>setRecTmr(t=>t-1),1000);
    return()=>clearTimeout(recRef.current);
  },[recOn,recTmr,recIdx,recSecond,recSess]);

  const athlete=athleteProfile;
  const fitnessProgram=normalizeFitnessProgram(profile.fitnessProgram||'hyrox');
  const trainingFlags=getTrainingDayFlags(DOW,athlete?.programType||'4-day',athlete?.preferredTrainingDays,athlete?.trainingWeekStart||'Mon');
  const trainingCycle=getTrainingCycleState(athlete?.planStartDate,athlete?.raceDate,TODAY);
  const raceDate=trainingCycle.raceDate;
  const planStartDate=trainingCycle.planStartDate;
  const CUR_WK=trainingCycle.currentWeek;
  const PH_IDX=trainingCycle.phaseIndex;
  const PH=trainingCycle.phase;
  const DTR=trainingCycle.daysToRace;
  const phCode=trainingCycle.phaseCode;
  const paceProfile=computePaces(athlete.fiveKTime);
  const weekMon=getTrainingWeekAnchorDate(NOW,athlete?.trainingWeekStart||'Mon');
  const calendarWeekMon=getMondayWeekStartDate(NOW);
  const selectedDate=normalizeDateKey(calendarFocusDay,TODAY);
  const selectedDateRelation=compareDateKeys(selectedDate,TODAY);
  const selectedDateObj=parseDateKey(selectedDate)||parseDateKey(TODAY);
  const selectedWeekMon=getTrainingWeekAnchorDate(selectedDateObj,athlete?.trainingWeekStart||'Mon');
  const currentWeekKey=formatDateKey(weekMon);
  const weekDatesGlobal=Array.from({length:7},(_,i)=>{const d=new Date(weekMon);d.setDate(d.getDate()+i);return formatDateKey(d);});
  const weekAnalytics=computeWeeklyAnalytics(workoutHistory,weekMon);
  const weekWorkoutGoal=(athlete?.preferredTrainingDays?.length)||((athlete?.programType||'4-day')==='5-day'?5:4);
  const weekMilesGoal=phCode==='peak'?20:phCode==='specificity'?18:phCode==='build'?15:phCode==='taper'?10:12;
  const resolvedWkType=trainingCycle.weekType||'A';
  const resolvedPhaseIdx=Number.isFinite(PH_IDX)?PH_IDX:0;
  const TODAY_WK=getTodayWk(resolvedWkType,resolvedPhaseIdx,trainingFlags);
  const weekPlannedWorkouts=resolveWeeklyTrainingPlanFromProfile(weekMon,athlete,fitnessProgram,workoutHistory,TODAY);
  const selectedWeekPlannedWorkouts=resolveWeeklyTrainingPlanFromProfile(selectedWeekMon,athlete,fitnessProgram,workoutHistory,selectedDate);
  const workoutLibrarySessions=getWorkoutLibrarySessions(fitnessProgram,athlete?.programType||'4-day',resolvedWkType,resolvedPhaseIdx);
  const todayPlannedWorkout=selectedWeekPlannedWorkouts.find(item=>item.plannedDate===selectedDate)||null;
  const missedPlannedWorkouts=weekPlannedWorkouts.filter(item=>item.status==='missed');
  const missedSelectedWorkouts=selectedWeekPlannedWorkouts.filter(item=>item.status==='missed');
  const suggestedPlanEntry=todayPlannedWorkout&&todayPlannedWorkout.status!=='completed'&&todayPlannedWorkout.status!=='moved'
    ?todayPlannedWorkout
    :missedSelectedWorkouts[0]||todayPlannedWorkout||null;
  const suggestedWorkoutBase=suggestedPlanEntry?{
    ...suggestedPlanEntry,
    name:suggestedPlanEntry.name,
    plannedDate:suggestedPlanEntry.plannedDate,
    plannedDayLabel:suggestedPlanEntry.plannedDayLabel,
    plannedName:suggestedPlanEntry.plannedName||suggestedPlanEntry.name,
    suggestedForDate:selectedDate,
    suggestedCarryover:suggestedPlanEntry.plannedDate!==selectedDate,
  }:null;
  const macros=computeMacroTargets(trainingFlags.isTrainingDay);

  const todayN=nutr[selectedDate]||[];
  const todayH=hydr[selectedDate]||0;
  const totCal=todayN.reduce((s,m)=>s+(m.cal||0),0);
  const totPro=todayN.reduce((s,m)=>s+(m.pro||0),0);
  const wktDone=workoutHistory.some(h=>h.date===selectedDate&&(h.type==='workout'||h.type==='run'||h.type==='recovery'));
  const plannerWeekWorkoutGoal=(athlete?.preferredTrainingDays?.length)||((athlete?.programType||'4-day')==='5-day'?5:4);
  const plannerWeekNutrition=weekDatesGlobal.map(ds=>{
    const meals=nutr[ds]||[];
    const protein=meals.reduce((s,m)=>s+(m.pro||0),0);
    const hydration=hydr[ds]||0;
    const proteinTarget=computeMacroTargets(isTrainingDayForDate(ds,athlete?.programType||'4-day',athlete?.preferredTrainingDays,athlete?.trainingWeekStart||'Mon')).protein;
    return{proteinMet:protein>=proteinTarget*0.9,hydrationMet:hydration>=(hydGoal*0.9)};
  });
  const plannerProteinDays=plannerWeekNutrition.filter(d=>d.proteinMet).length;
  const plannerHydrationDays=plannerWeekNutrition.filter(d=>d.hydrationMet).length;
  const maintenanceQueue=computeMaintenanceQueue(MAINTENANCE_TASKS,maintenanceHistory,maintenanceMeta||{},TODAY);
  const maintenanceAttentionItems=maintenanceQueue.filter(item=>item.category!=='Yearly'&&(item.status==='overdue'||item.status==='today'||item.dueSoon));
  const annualHoldingItems=maintenanceQueue.filter(item=>item.category==='Yearly');
  const plannerMaintenanceCount=maintenanceAttentionItems.length;
  const plannerTaskCountGlobal=taskHistory.filter(t=>t.date>=currentWeekKey&&!t.done&&!t.parentId&&(t.status||'active')==='active').length;
  const plannerWorkoutStatusGlobal=weekAnalytics.sessionsLogged<plannerWeekWorkoutGoal?'Behind target':'On track';
  const pendingInbox=(inboxItems||[]).filter(x=>x.status==='pending');
  const recoveryToday=selectedDateRelation>0
    ?{level:null,readiness:null,energy:null,sleep:null}
    :computeRecoveryState(dailyLogs?.[selectedDate],dailyLogs?.[selectedDate]?.energyScore??energyScore,dailyLogs?.[selectedDate]?.sleepHours??sleepHours);
  const restDayRecovery=RECOVERY_WORKOUT_LIBRARY[1];
  const workoutDecisionThreshold=70;
  const scheduledTodayWorkout=suggestedWorkoutBase?hydrateWorkoutSession({
    ...suggestedWorkoutBase,
    adjustmentLabel:'Planned Session',
    adjustmentReason:'Scheduled workout',
    dateKey:selectedDate,
  }):null;
  const recoveryWorkoutOption=suggestedWorkoutBase?adjustWorkoutForRecovery(suggestedWorkoutBase,{...recoveryToday,level:'Low'}):restDayRecovery;
  const dailyWorkoutRecommendation=profile.dailyRecommendations?.[selectedDate]?.workout||null;
  const workoutDecisionMade=dailyWorkoutRecommendation?.workoutDecisionMade===true;
  const selectedWorkoutId=dailyWorkoutRecommendation?.selectedWorkoutId||null;
  const scheduledWorkoutId=resolveWorkoutSelectionId(scheduledTodayWorkout,selectedDate);
  const recoveryWorkoutId=resolveWorkoutSelectionId(recoveryWorkoutOption,selectedDate);
  const shouldPromptWorkoutDecision=selectedDateRelation===0&&!!scheduledTodayWorkout&&recoveryToday.readiness<workoutDecisionThreshold&&!wktDone&&!workoutDecisionMade;
  const selectedTodayWorkout=workoutDecisionMade
    ?dailyWorkoutRecommendation?.action==='modify'
      ?hydrateWorkoutSession({
        ...(dailyWorkoutRecommendation.finalSelection||recoveryWorkoutOption||scheduledTodayWorkout||{}),
        dateKey:selectedDate,
      })
      :scheduledTodayWorkout
    :scheduledTodayWorkout;
  const adjustedTodayWorkout=selectedTodayWorkout;
  const hasModifiedSession=false;
  const modifiedSessionChanges=[];
  const activeFinancialAccounts=useMemo(
    ()=>normalizeFinancialAccounts(financialAccounts).filter(account=>account.isActive!==false),
    [financialAccounts]
  );
  const archivedFinancialAccounts=useMemo(
    ()=>normalizeFinancialAccounts(financialAccounts).filter(account=>account.isActive===false),
    [financialAccounts]
  );
  const financialAccountMap=useMemo(
    ()=>new Map(normalizeFinancialAccounts(financialAccounts).map(account=>[account.id,account])),
    [financialAccounts]
  );
  const financeCategories=useMemo(
    ()=>resolveCategoryLibrary(categories),
    [categories]
  );
  const financeCategoryMap=useMemo(
    ()=>new Map(financeCategories.map(category=>[category.id,category])),
    [financeCategories]
  );
  const todaysStatus=!trainingFlags.isTrainingDay
    ?(suggestedPlanEntry?'suggested':'rest')
    :selectedTodayWorkout?.type==='recovery'
      ?'recovery_override'
      :selectedTodayWorkout
        ?'training'
        :'rest';
  const suggestionLabel=suggestedPlanEntry?.suggestedCarryover
    ?`Suggested for today: ${suggestedPlanEntry.plannedDayLabel}'s ${suggestedPlanEntry.plannedName}`
    :todayPlannedWorkout
      ?`Planned for today: ${todayPlannedWorkout.plannedName}`
      :null;

  useEffect(()=>{
    if(!loaded||maintenanceAttentionItems.length===0||lastMaintenancePromptDate===TODAY)return;
    const topItem=maintenanceAttentionItems[0];
    showNotif(
      `${maintenanceAttentionItems.length} maintenance item${maintenanceAttentionItems.length!==1?'s':''} need attention.`,
      'warn',
      topItem?`${topItem.label} is ${topItem.status==='overdue'?'overdue':topItem.status==='today'?'due today':'due soon'}${topItem.dueDate?` because the due date is ${formatDate(topItem.dueDate,'monthDayLong')}`:''}.`:''
    );
    updateProfile({lastMaintenancePromptDate:TODAY});
  },[loaded,maintenanceAttentionItems.length,lastMaintenancePromptDate,TODAY,updateProfile]);

  useEffect(()=>{
    if(!loaded||lifestyleItems!==null)return;
    updateProfile(p=>({...p,lifestyleItems:DAILY_CHORES.map((c,i)=>({id:c.id,title:c.label,notes:'',order:i,archived:false}))}));
  },[loaded,lifestyleItems,updateProfile]);

  useEffect(()=>{
    const validIds=new Set(activeFinancialAccounts.map(account=>account.id));
    const fallbackAccountId=getDefaultAccountId(activeFinancialAccounts,true);
    setTxForm(form=>{
      if(form.accountId&&validIds.has(form.accountId))return form;
      if(form.accountId===fallbackAccountId)return form;
      return {...form,accountId:fallbackAccountId};
    });
  },[activeFinancialAccounts]);

  function addMeal(mealObj,slot){
    const entry=normalizeMealEntry({...mealObj,slot:slot||'snack',id:Date.now()},slot||'snack');
    applyUndoableProfileUpdate('Meal logged',p=>({...p,meals:{...p.meals,[TODAY]:[...(p.meals?.[TODAY]||[]),entry]}}),`Added to ${entry.slot}.`);
    trackGrowthEvent('meal_logged',{slot:entry.slot});
  }
  function logQuickMealTemplate(template,slotOverride,photo){
    if(!template)return;
    addMeal({
      meal:template.name,
      source:'quick-template',
      foodIds:template.foodIds||template.itemIds||[],
      foodId:(template.foodIds||template.itemIds||[])[0]||null,
      cal:template.cal||0,
      pro:template.pro||0,
      carb:template.carb||0,
      fat:template.fat||0,
      photo:photo||null,
    },slotOverride||template.slot||'snack');
  }
  function rmMeal(id){
    applyUndoableProfileUpdate('Meal removed',p=>({...p,meals:{...p.meals,[TODAY]:(p.meals?.[TODAY]||[]).filter(m=>m.id!==id)}}),'You can undo if this was accidental.');
  }
  function addWater(oz){
    applyUndoableProfileUpdate('Water logged',p=>({...p,hydr:{...p.hydr,[TODAY]:Math.max(0,(p.hydr[TODAY]||0)+oz)}}),`Added ${oz} oz to today.`);
  }
  function startRest(seconds,label='Rest'){
    setRestLabel(label);
    setRestTmr(seconds);
  }
  function updateExerciseSet(exIdx,setIdx,patch){
    setWkSess(s=>{
      if(!s)return s;
      const ex=[...(s.ex||[])];
      const current=ex[exIdx];
      if(!current)return s;
      const setLogs=[...(current.setLogs||[])];
      setLogs[setIdx]={...(setLogs[setIdx]||{idx:setIdx+1}),...patch};
      ex[exIdx]={...current,setLogs};
      return{...s,ex};
    });
  }
  function markSetDone(exIdx,setIdx){
    setWkSess(s=>{
      if(!s)return s;
      const ex=[...(s.ex||[])];
      const current=ex[exIdx];
      if(!current)return s;
      const setLogs=[...(current.setLogs||[])];
      const nextDone=!(setLogs[setIdx]?.done);
      setLogs[setIdx]={...(setLogs[setIdx]||{idx:setIdx+1}),done:nextDone};
      ex[exIdx]={...current,setLogs};
      return{...s,ex,currentExerciseIdx:exIdx};
    });
  }
  function duplicatePreviousSet(exIdx,setIdx){
    setWkSess(s=>{
      if(!s)return s;
      const ex=[...(s.ex||[])];
      const current=ex[exIdx];
      if(!current)return s;
      const setLogs=[...(current.setLogs||[])];
      const copied=duplicatePreviousSetValues(setLogs,setIdx);
      if(!copied)return s;
      setLogs[setIdx]={...(setLogs[setIdx]||{idx:setIdx+1}),...copied};
      ex[exIdx]={...current,setLogs};
      return{...s,ex,currentExerciseIdx:exIdx};
    });
  }
  function adjustSetWeight(exIdx,setIdx,delta){
    setWkSess(s=>{
      if(!s)return s;
      const ex=[...(s.ex||[])];
      const current=ex[exIdx];
      if(!current)return s;
      const setLogs=[...(current.setLogs||[])];
      const existing=parseFloat(setLogs[setIdx]?.weight);
      const nextWeight=Math.max(0,Math.round(((Number.isFinite(existing)?existing:0)+delta)*100)/100);
      setLogs[setIdx]={...(setLogs[setIdx]||{idx:setIdx+1}),weight:String(nextWeight)};
      ex[exIdx]={...current,setLogs};
      return{...s,ex,currentExerciseIdx:exIdx};
    });
  }
  function swapExercise(exIdx,nextExerciseId){
    setWkSess(s=>{
      if(!s)return s;
      const ex=[...(s.ex||[])];
      const prev=ex[exIdx];
      if(!prev)return s;
      const nextDefinition=resolveExerciseDefinition(nextExerciseId);
      const next=buildExerciseInstance({
        exerciseId:nextDefinition.id,
        n:nextDefinition.name,
        s:prev.targetSets,
        r:prev.targetReps,
        note:prev.targetNote,
        plannedExerciseName:prev.plannedExerciseName||prev.n,
        programmedName:prev.programmedName||prev.plannedExerciseName||prev.n,
        swappedFrom:prev.swappedFrom||prev.n,
      },exIdx);
      ex[exIdx]={
        ...next,
        setLogs:prev.setLogs||next.setLogs,
        supersetKey:prev.supersetKey,
        plannedExerciseName:prev.plannedExerciseName||prev.n,
        programmedName:prev.programmedName||prev.plannedExerciseName||prev.n,
        swappedFrom:prev.n,
      };
      return{...s,ex};
    });
    setShowSwap(null);
  }
  function startWorkout(sess){
    const hydrated=hydrateWorkoutSession({...sess,dateKey:sess?.dateKey||TODAY});
    setWkSess(hydrated);
    setPlayerIdx(hydrated?.currentExerciseIdx||0);
    setTrainView('session');
    trackGrowthEvent('workout_started',{type:hydrated?.type||'workout'});
  }
  function launchWorkout(sess){
    if(!sess)return;
    setTrainSection('today');
    openTab('training');
    if(sess.type==='run')startRun({...sess,warmup:sess.warmup||getWarmupForCategory('running'),cooldown:sess.cooldown||getCooldownForCategory('running')});
    else startWorkout(sess);
  }
  function finishWk(){
    if(!wkSess)return;
    const sessionDateKey=wkSess.dateKey||TODAY;
    const sessionDuration=Math.max(15,Math.round((((wkSess.warmup||[]).reduce((sum,item)=>sum+(item.duration||0),0)+(wkSess.cooldown||[]).reduce((sum,item)=>sum+(item.duration||0),0)+((wkSess.ex||[]).reduce((sum,ex)=>sum+((ex.setLogs||[]).length*(ex.defaultRest||60)),0)))/60)));
    const workoutEntryName=wkSess.name||(wkSess.type==='recovery'?'Recovery session':'Strength session');
    const entry={date:sessionDateKey,type:'workout',name:workoutEntryName,data:{
      exercises:wkSess.ex||[],
      exercisePlan:(wkSess.ex||[]).map(ex=>({
        exerciseId:ex.exerciseId||null,
        plannedExerciseName:ex.plannedExerciseName||ex.programmedName||ex.n,
        performedExerciseName:ex.n,
        swapped:!!ex.swappedFrom&&ex.swappedFrom!==ex.n,
        swappedFrom:ex.swappedFrom||null,
      })),
      warmup:wkSess.warmup||[],
      cooldown:wkSess.cooldown||[],
      startedAt:wkSess.startedAt,
      completedAt:Date.now(),
      durationMins:sessionDuration,
      sets:wkSess.log||{},
      recoveryState:recoveryToday.level,
      plannedDate:wkSess.plannedDate||sessionDateKey,
      plannedDayLabel:wkSess.plannedDayLabel||DAY_NAMES[DOW],
      plannedName:wkSess.plannedName||workoutEntryName,
      completedOffSchedule:(wkSess.plannedDate||sessionDateKey)!==sessionDateKey,
    }};
    updateProfile(p=>({...p,workouts:[...(p.workouts||p.workoutHistory||[]),entry]}));
    trackGrowthEvent('workout_completed',{type:wkSess?.type==='recovery'?'recovery':'workout'});
    setWkSess(null);setPlayerIdx(0);setTrainView('overview');showNotif(wkSess?.type==='recovery'?'Session complete!':'Workout complete!','success');
  }
  function startRun(sess){setRunSess({...sess,dateKey:sess?.dateKey||TODAY,log:{},startTime:Date.now(),warmup:sess.warmup||getWarmupForCategory('running'),cooldown:sess.cooldown||getCooldownForCategory('running')});setTrainView('run');trackGrowthEvent('workout_started',{type:'run'});}
  function finishRun(data){
    const sessionDateKey=runSess?.dateKey||TODAY;
    const entry={date:sessionDateKey,type:'run',name:runSess?.name||'Run',data:{
      ...data,
      warmup:runSess?.warmup||[],
      cooldown:runSess?.cooldown||[],
      durationMins:parseFloat(data?.durationMins)||parseFloat(runSess?.duration)||parseFloat(runSess?.dur)||30,
      recoveryState:recoveryToday.level,
      plannedDate:runSess?.plannedDate||sessionDateKey,
      plannedDayLabel:runSess?.plannedDayLabel||DAY_NAMES[DOW],
      plannedName:runSess?.plannedName||runSess?.name||'Run',
      completedOffSchedule:(runSess?.plannedDate||sessionDateKey)!==sessionDateKey,
    }};
    updateProfile(p=>({...p,workouts:[...(p.workouts||p.workoutHistory||[]),entry]}));
    trackGrowthEvent('workout_completed',{type:'run'});
    setRunSess(null);setTrainView('overview');showNotif('Run logged!','success');
  }
  function toggleSet(exIdx,setIdx){markSetDone(exIdx,setIdx);}
  function startRec(sess){
    setRecSess({...sess,dateKey:sess?.dateKey||TODAY});setRecIdx(0);setRecTmr(sess.moves[0].d);setRecOn(true);setRecSecond(false);setTrainView('recovery');
  }
  function addBusyBlock(){
    const f=busyForm;
    if(!f.title.trim()||!f.startTime||!f.endTime)return;
    const block={id:String(Date.now()),title:f.title.trim(),startTime:f.startTime,endTime:f.endTime,category:f.category,notes:f.notes,
      recurring:f.recurring,date:f.recurring?null:f.date,dow:f.recurring?f.dow:null};
    updateProfile(p=>({...p,busyBlocks:[...p.busyBlocks,block]}));
    setBusyModal(null);
    setBusyForm({title:'',date:TODAY,startTime:'09:00',endTime:'10:00',category:'meeting',recurring:false,dow:null,notes:''});
  }
  function deleteBusyBlock(id){
    updateProfile(p=>({...p,busyBlocks:p.busyBlocks.filter(b=>b.id!==id)}));
  }
  function saveWeekPattern(forDate){
    if(!patternName.trim())return;
    const d=new Date(forDate+'T12:00:00');
    const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));
    const sun=new Date(mon);sun.setDate(mon.getDate()+6);
    const monStr=formatDateKey(mon),sunStr=formatDateKey(sun);
    const weekBlocks=busyBlocks.filter(b=>!b.recurring&&b.date>=monStr&&b.date<=sunStr);
    const pattern=weekBlocks.map(b=>({...b,dow:new Date(b.date+'T12:00:00').getDay(),recurring:false,date:null}));
    updateProfile(p=>({...p,weekPatterns:{...p.weekPatterns,[patternName.trim()]:pattern}}));
    setPatternName('');showNotif('Pattern saved','success');
  }
  function applyWeekPattern(name,forDate){
    const pattern=weekPatterns[name];if(!pattern)return;
    const d=new Date(forDate+'T12:00:00');
    const mon=new Date(d);mon.setDate(d.getDate()-((d.getDay()+6)%7));
    const newBlocks=pattern.map(b=>{
      const date=new Date(mon);date.setDate(mon.getDate()+((b.dow+6)%7));
      return{...b,id:String(Date.now()+Math.random()),date:formatDateKey(date),recurring:false,dow:null};
    });
    updateProfile(p=>({...p,busyBlocks:[...p.busyBlocks,...newBlocks]}));
    showNotif(`Applied pattern "${name}"`, 'success');
  }
  function getBusyForDay(dateStr){
    const d=new Date(dateStr+'T12:00:00');const dow=d.getDay();
    return (busyBlocks||[]).filter(b=>(b.recurring?b.dow===dow:b.date===dateStr)&&b.startTime&&b.endTime)
      .sort((a,b)=>timeToMins(a.startTime)-timeToMins(b.startTime));
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
    saveDailyLog({energyScore,sleepHours,workoutDone:wktDone,proteinMet:totPro>=(proGoal*0.9),hydrationMet:todayH>=(hydGoal*0.9)});
    setShowEnergyIn(false);showNotif('Energy logged','success');
  }
  function closeMorningCheckin(){
    const todayKey=getTodayKey();
    const todayLogEntry=profile.dailyLogs?.[todayKey];
    if(!todayLogEntry?.checkInDone){
      // Auto-generate energy baseline so energy is never null
      const recentEntries=Object.entries(profile.dailyLogs||{})
        .filter(([k])=>k<todayKey)
        .sort(([a],[b])=>b.localeCompare(a))
        .slice(0,7);
      const lastEnergy=recentEntries.find(([,v])=>typeof v?.checkInEnergy==='number')?.[1]?.checkInEnergy??3;
      saveDailyCheckin(todayKey,{date:todayKey,energy:lastEnergy,mood:null,stress:null,skipped:true});
      updateProfile(p=>({
        ...p,
        dailyLogs:{
          ...p.dailyLogs,
          [todayKey]:{
            ...(p.dailyLogs?.[todayKey]||{}),
            checkInEnergy:lastEnergy,
            energyScore:lastEnergy*2,
            checkInDone:true,
            skipped:true,
          },
        },
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
    const existingCount=existing.priorities.filter(task=>task.text.trim()).length;
    const nextCount=nextEntry.priorities.filter(task=>task.text.trim()).length;
    const nextTop3=nextEntry.priorities.slice(0,3).map(task=>task.text||'');
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
    });
    const existingIds=new Set((transactions||[]).map(t=>t.transactionId));
    const fresh=categorized.filter(t=>!existingIds.has(t.transactionId));
    updateProfile(p=>{
      const allTx=[...(p.transactions||[]),...fresh];
      return{...p,financialAccounts:nextAccounts,transactions:allTx,recurringExpenses:detectRecurring(allTx.filter(t=>!t.isTransfer&&!t.isCredit))};
    });
    showNotif(`Imported ${fresh.length} new transactions`,'success');
    setShowImport(false);
  }
  function addManualTx(form){
    const f=form||txForm;
    if(!f.merchant||!f.amount)return;
    if(!f.accountId){showNotif('Add an active account first','warn');return;}
    const isTransfer=f.isTransfer||f.category==='transfer';
    const t={transactionId:`manual-${Date.now()}`,date:f.date,merchant:f.merchant,description:f.merchant,amount:parseFloat(f.amount)||0,isCredit:f.isCredit,accountId:f.accountId,category:f.category,isReviewed:true,isTransfer,isRecurring:f.isRecurring||false,notes:f.notes||''};
    updateProfile(p=>{
      // Save merchant rule if merchant has a specific category
      const rules=f.category!=='other'?{...(p.merchantRules||{}),[f.merchant.toUpperCase().substring(0,20)]:f.category}:(p.merchantRules||{});
      return{...p,transactions:[...(p.transactions||[]),t],merchantRules:rules};
    });
    setTxForm({date:TODAY,merchant:'',amount:'',isCredit:false,isRecurring:false,isTransfer:false,accountId:f.accountId,category:'other',notes:''});
    setShowAddTx(false);showNotif('Transaction added','success');
  }
  function duplicateLastTx(){
    const last=[...(transactions||[])].sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!last)return;
    setTxForm({date:TODAY,merchant:last.merchant,amount:String(last.amount),isCredit:last.isCredit,isRecurring:last.isRecurring||false,isTransfer:last.isTransfer||false,accountId:resolveTransactionAccountId(last.accountId,activeFinancialAccounts),category:last.category,notes:last.notes||''});
    setShowAddTx(true);
  }
  function quickAddMerchant(template){
    const form={date:TODAY,merchant:template.merchant,amount:'',isCredit:false,isRecurring:false,isTransfer:!!template.isTransfer,accountId:getDefaultAccountId(activeFinancialAccounts,true),category:template.category,notes:''};
    setTxForm(form);
    setShowAddTx(true);
  }
  function updateTxCategory(txId,cat,applyRule){
    updateProfile(p=>{
      const txns=p.transactions.map(t=>t.transactionId===txId?{...t,category:cat,isReviewed:true,isTransfer:cat==='transfer'}:t);
      const tx=p.transactions.find(t=>t.transactionId===txId);
      const rules=applyRule&&tx?{...p.merchantRules,[tx.merchant.toUpperCase().substring(0,20)]:cat}:p.merchantRules;
      return{...p,transactions:txns,merchantRules:rules};
    });
  }
  function reviewTx(txId){updateProfile(p=>({...p,transactions:p.transactions.map(t=>t.transactionId===txId?{...t,isReviewed:true}:t)}));}
  function deleteTx(txId){updateProfile(p=>({...p,transactions:p.transactions.filter(t=>t.transactionId!==txId)}));}
  function updateAccountBalance(accountId,balance,maskedNumber){
    updateProfile(p=>({...p,financialAccounts:p.financialAccounts.map(a=>a.id===accountId?{...a,currentBalance:balance==null||balance===''?null:parseFloat(balance)||null,maskedNumber,isActive:true}:a)}));
  }
  function openAddAccount(){
    setEditingAccountId(null);
    setAccountForm({name:'',institution:'',type:'checking',isActive:true,startingBalance:''});
    setShowAccountModal(true);
  }
  function openEditAccount(account){
    setEditingAccountId(account.id);
    setAccountForm({
      name:account.name||'',
      institution:account.institution||'',
      type:account.type||'checking',
      isActive:account.isActive!==false,
      startingBalance:account.startingBalance==null?'':String(account.startingBalance),
    });
    setShowAccountModal(true);
  }
  function saveAccount(){
    if(!accountForm.name.trim()){showNotif('Account name is required','warn');return;}
    let finalAccount=createFinancialAccount({
      id:editingAccountId||undefined,
      name:accountForm.name,
      institution:accountForm.institution,
      type:accountForm.type,
      isActive:accountForm.isActive,
      startingBalance:accountForm.startingBalance,
    });
    updateProfile(p=>{
      const existingAccounts=normalizeFinancialAccounts(p.financialAccounts);
      const conflictingId=existingAccounts.some(account=>account.id===finalAccount.id&&account.id!==editingAccountId);
      const baseAccount=conflictingId&&!editingAccountId
        ?createFinancialAccount({...finalAccount,id:`${finalAccount.id}_${Date.now()}`})
        :finalAccount;
      finalAccount=baseAccount;
      const nextAccounts=editingAccountId
        ?existingAccounts.map(account=>account.id===editingAccountId?{...account,...baseAccount}:account)
        :[...existingAccounts,baseAccount];
      return{...p,financialAccounts:nextAccounts};
    });
    setTxForm(form=>{
      if(form.accountId)return form;
      return {...form,accountId:finalAccount.isActive?finalAccount.id:form.accountId};
    });
    setShowAccountModal(false);
    showNotif(editingAccountId?'Account updated':'Account added','success');
  }
  function archiveAccount(accountId){
    updateProfile(p=>({...p,financialAccounts:p.financialAccounts.map(account=>account.id===accountId?{...account,isActive:false}:account)}));
    setTxForm(form=>form.accountId===accountId?{...form,accountId:getDefaultAccountId(activeFinancialAccounts.filter(account=>account.id!==accountId),true)}:form);
    showNotif('Account archived','success');
  }
  function restoreAccount(accountId){
    updateProfile(p=>({...p,financialAccounts:p.financialAccounts.map(account=>account.id===accountId?{...account,isActive:true}:account)}));
    showNotif('Account restored','success');
  }
  function deleteAccount(accountId){
    const linkedTransactions=(transactions||[]).some(tx=>tx.accountId===accountId);
    if(linkedTransactions){
      archiveAccount(accountId);
      return;
    }
    updateProfile(p=>({...p,financialAccounts:p.financialAccounts.filter(account=>account.id!==accountId)}));
    setTxForm(form=>form.accountId===accountId?{...form,accountId:getDefaultAccountId(activeFinancialAccounts.filter(account=>account.id!==accountId),true)}:form);
    showNotif('Account removed','success');
  }

  // Finance computed values
  const now=new Date();
  const monthStart=formatDateKey(new Date(now.getFullYear(),now.getMonth(),1));
  const weekStartStr=formatDateKey(weekMon);
  const spendTx=(transactions||[]).filter(t=>!t.isCredit&&!t.isTransfer);
  const monthTx=spendTx.filter(t=>t.date>=monthStart);
  const weekTx=spendTx.filter(t=>t.date>=weekStartStr);
  const monthSpend=monthTx.reduce((s,t)=>s+t.amount,0);
  const weekSpend=weekTx.reduce((s,t)=>s+t.amount,0);
  const unreviewed=(transactions||[]).filter(t=>!t.isReviewed).length;
  const catSpend=financeCategories.map(c=>({...c,total:monthTx.filter(t=>t.category===c.id).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  const billsDueSoon=(recurringExpenses||[]).filter(r=>{if(!r.nextExpectedDate)return false;const d=new Date(r.nextExpectedDate+'T12:00:00');return(d-now)/86400000<=7;});

  function connectGoogle(){
    GoogleAPI.signIn(()=>{setGoogleConnected(true);showNotif('Google connected!','success');},
      err=>showNotif(`Google sign-in failed: ${err}`,'error'));
  }
  function disconnectGoogle(){
    GoogleAPI.signOut();setGoogleConnected(false);showNotif('Google disconnected');
  }

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
      if(nextMode==='execution'&&!dailyExecutionEntry.priorities.some(task=>task.text.trim())){
        showNotif('Add at least one priority before moving to execution.','warn');
        return;
      }
      updateDailyExecution(activeDate,entry=>({
        ...entry,
        mode:nextMode,
        agenda:nextMode==='execution'
          ?entry.priorities.map(task=>({...task}))
          :entry.agenda,
      }));
      if(nextMode==='execution')trackGrowthEvent('execution_started',{date:activeDate});
      showNotif(nextMode==='execution'?'Execution mode enabled':'Returned to planning mode','success');
    }

    function updatePriorityTask(taskId,patch){
      updateDailyExecution(activeDate,entry=>{
        const priorities=entry.priorities.map(task=>task.id===taskId?{...task,...patch,updatedAt:new Date().toISOString()}:task);
        const agendaSource=entry.mode==='execution'
          ?(entry.agenda.length>0?entry.agenda:entry.priorities).map(task=>task.id===taskId?{...task,...patch,updatedAt:new Date().toISOString()}:task)
          :entry.agenda;
        return{...entry,priorities,agenda:agendaSource};
      });
    }

    function addPriorityTask(taskData={}){
      updateDailyExecution(activeDate,entry=>{
        const nextTask=createDailyExecutionTask(taskData.text||'',{date:activeDate,...taskData});
        return{
          ...entry,
          mode:entry.mode==='execution'?entry.mode:'planning',
          priorities:[...entry.priorities,nextTask],
          agenda:entry.mode==='execution'?[...entry.agenda,nextTask]:entry.agenda,
        };
      });
    }

    function removePriorityTask(taskId){
      updateDailyExecution(activeDate,entry=>({
        ...entry,
        priorities:entry.priorities.filter(task=>task.id!==taskId),
        agenda:entry.agenda.filter(task=>task.id!==taskId),
      }));
    }

    function movePriorityTask(taskId,direction){
      updateDailyExecution(activeDate,entry=>{
        const priorities=[...entry.priorities];
        const index=priorities.findIndex(task=>task.id===taskId);
        const target=index+direction;
        if(index<0||target<0||target>=priorities.length)return entry;
        [priorities[index],priorities[target]]=[priorities[target],priorities[index]];
        const orderedAgenda=entry.mode==='execution'
          ?priorities.map(priorityTask=>entry.agenda.find(task=>task.id===priorityTask.id)||priorityTask)
          :entry.agenda;
        return{...entry,priorities,agenda:orderedAgenda};
      });
    }

    function handleWorkoutDecision(action){
      if(action==='modify'){
        updateWorkoutRecommendationForDate(activeDate,'modify',recoveryWorkoutOption);
        showNotif('Recovery workout selected','success');
        return;
      }
      if(action==='accept'){
        updateWorkoutRecommendationForDate(activeDate,'accept',scheduledTodayWorkout);
        showNotif('Scheduled workout kept','success');
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
    function openComposerForDate(dateStr){
      setNewTask(createNewTaskDraft(activeDate,{date:dateStr,bucket:'scheduled'}));
      setTaskDraftText('');
      setShowAddTask(true);
      openTab('tasks',{taskTab:'scheduled'});
    }
    function getWorkoutPaceLabel(sess){
      if(!sess||sess.type!=='run'||!paceProfile)return null;
      const nm=(sess.name||'').toLowerCase();
      if(nm.includes('interval'))return paceProfile.interval;
      if(nm.includes('tempo')||nm.includes('threshold')||nm.includes('race'))return paceProfile.threshold;
      return paceProfile.easy;
    }

    function formatHourLabel(hour){
      if(hour==null)return'Anytime';
      const suffix=hour>=12?'PM':'AM';
      const normalized=hour%12||12;
      return `${normalized}:00 ${suffix}`;
    }

    function getMaintenanceNextLabel(item){
      if(!item)return'Nothing urgent';
      if(item.status==='overdue')return item.daysOverdue>0?`Overdue by ${item.daysOverdue}d`:'Overdue';
      if(item.status==='today')return'Due today';
      if(item.status==='active')return item.dueSoon?`Due in ${item.daysUntil}d`:'Active';
      return item.daysUntilStart>0?`Starts in ${item.daysUntilStart}d`:'Upcoming';
    }

    function completeMaintenanceItem(id){
      applyUndoableProfileUpdate('Maintenance cleared',p=>({...p,maintenanceHistory:{...p.maintenanceHistory,[id]:TODAY},maintenanceMeta:{...(p.maintenanceMeta||{}),[id]:{...(p.maintenanceMeta||{})[id],dueDate:null}}}),'Undo if you cleared the wrong item.');
    }

    function openTodayWorkoutAction(){
      if(isPastDate&&!wktDone){
        showNotif('Past workouts are locked and cannot be started retroactively.','warn');
        return;
      }
      if(wktDone){
        openTab('training',{trainSection:'today'});
        return;
      }
      if(selectedTodayWorkout){
        const hydrated=hydrateWorkoutSession({...selectedTodayWorkout,dateKey:TODAY});
        setWkSess(hydrated);
        setPlayerIdx(hydrated?.currentExerciseIdx||0);
        setTrainView('session');
        trackGrowthEvent('workout_started',{type:hydrated?.type||'workout'});
        setShowWorkoutPlayer(true);
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
      const suggestionItems=(dateStr===activeDate
        ?missingMealSlots
        :MEAL_SLOTS.filter(slot=>slot.id!=='snack').map(slot=>({slot,entries:(nutr[dateStr]||[]).filter(m=>m.slot===slot.id)})).filter(entry=>entry.entries.length===0)
      ).map(entry=>({
        id:`meal-${dateStr}-${entry.slot.id}`,
        kind:'meal',
        sortMins:timeToMins((MEAL_SLOT_SCHEDULE[entry.slot.id]||{}).start||'12:00'),
        timeLabel:'Meal',
        title:`${entry.slot.label} window`,
        meta:dateStr===activeDate?'Log or prep':'Plan meal',
      }));
      suggestionItems.push(...[
        ...(dateStr===activeDate&&pendingInbox.length>0?[{
          id:'inbox-review',
          kind:'reminder',
          sortMins:18*60,
          timeLabel:'Inbox',
          title:`Review ${pendingInbox.length} inbox item${pendingInbox.length!==1?'s':''}`,
          meta:'Process quick captures',
        }]:[]),
        ...(dateStr===activeDate?urgentMaintenanceItems.map(item=>({
          id:`maintenance-${item.id}`,
          kind:'alert',
          sortMins:17*60,
          timeLabel:'Alert',
          title:item.label,
          meta:getMaintenanceNextLabel(item),
          maintenanceId:item.id,
        })):[]),
      ]);
      return{
        scheduled:scheduledItems.sort((a,b)=>a.sortMins-b.sortMins),
        suggestions:suggestionItems.sort((a,b)=>a.sortMins-b.sortMins),
      };
    }

    const agendaGroups=(function(){
      if(agendaTab==='today'){
        const groups=buildAgendaItemsForDate(activeDate);
        return{
          scheduled:groups.scheduled.map(item=>({...item,dayLabel:isViewingToday?'Today':formatDate(activeDate,'weekdayShort')})),
          suggestions:groups.suggestions.map(item=>({...item,dayLabel:isViewingToday?'Today':formatDate(activeDate,'weekdayShort')})),
        };
      }
      if(agendaTab==='tomorrow'){
        const groups=buildAgendaItemsForDate(addDaysIso(activeDate,1));
        return{
          scheduled:groups.scheduled.map(item=>({...item,dayLabel:'Tomorrow'})),
          suggestions:groups.suggestions.map(item=>({...item,dayLabel:'Tomorrow'})),
        };
      }
      return weekDates.reduce((acc,dateStr)=>{
        const dayLabel=formatDate(dateStr,'weekdayShort');
        const groups=buildAgendaItemsForDate(dateStr);
        acc.scheduled.push(...groups.scheduled.map(item=>({...item,dayLabel})));
        acc.suggestions.push(...groups.suggestions.map(item=>({...item,dayLabel})));
        return acc;
      },{scheduled:[],suggestions:[]});
    })();
    const visibleScheduledItems=agendaGroups.scheduled.slice(0,agendaTab==='week'?12:8);
    const visibleSuggestionItems=agendaGroups.suggestions.slice(0,agendaTab==='week'?8:4);
    const hasAgendaContent=visibleScheduledItems.length>0||visibleSuggestionItems.length>0;

    return <div style={S.body}>
      {showCarryoverPrompt&&<div style={{...S.card,borderColor:C.amber,background:C.amberL,marginBottom:0}}>
        <div style={{...S.row,marginBottom:6}}>
          <div style={{fontSize:13,fontWeight:700,color:C.amberDk}}>{overdueTasks.length} unfinished task{overdueTasks.length!==1?'s':''} from earlier</div>
          <button style={{background:'none',border:'none',color:C.amberDk,cursor:'pointer',fontSize:14,padding:0,lineHeight:1}} onClick={dismissCarryover}>×</button>
        </div>
        <div style={{fontSize:11,color:C.amberDk,marginBottom:8}}>Roll all to today, or review them in Tasks.</div>
        <div style={{display:'flex',gap:8}}>
          <button style={{...S.btnGhost,flex:1,fontSize:11,borderColor:C.amber,color:C.amberDk}} onClick={rollAllOverdue}>Roll all to today</button>
          <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>{dismissCarryover();openTab('tasks',{taskTab:'next'});}}>Review</button>
        </div>
      </div>}
      {showActivationChecklist&&<SetupCard
        C={C}
        S={S}
        activationChecklist={growthState.activationChecklist}
        onOpenCheckIn={()=>setShowMorningCheckin(true)}
        onOpenAddTask={openBrainDump}
      />}
      {(shouldShowInstallCta||needsInstallHelp)&&!isInstalled&&<div style={{...S.card,padding:'12px 14px'}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Install</div>
        <div style={{fontSize:11,color:C.tx2,lineHeight:1.4,marginBottom:shouldShowInstallCta?10:0}}>{installHelpText}</div>
        {shouldShowInstallCta&&<button type="button" style={{...S.btnGhost,fontSize:11,padding:'7px 10px'}} onClick={openInstallPrompt}>Install</button>}
      </div>}
      <TodayList
        C={C}
        S={S}
        FieldInput={FieldInput}
        dailyExecutionEntry={dailyExecutionEntry}
        selectedDateLabel={activeDateParts?formatDate(activeDate,'primary'):'Today'}
        isViewingToday={isViewingToday}
        updatePriorityTask={updatePriorityTask}
        movePriorityTask={movePriorityTask}
        removePriorityTask={removePriorityTask}
        openBrainDump={openBrainDump}
        setDailyExecutionMode={setDailyExecutionMode}
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
        taskCta={nextTaskItem?'Open':'Brain Dump'}
        onTaskAction={nextTaskItem?()=>openTab('tasks',{taskTab:'next'}):openBrainDump}
        showTaskDone={!!nextTaskItem}
        onTaskDone={()=>nextTaskItem&&toggleTaskDone(nextTaskItem.id)}
        onOpenCheckIn={()=>setShowMorningCheckin(true)}
        onOpenBrainDump={openBrainDump}
        onOpenCalendar={()=>openTab('calendar',{calendarFocusDay:activeDate,calendarViewMode:'week',calendarWeekIndex:getWeekIndexForDate(activeDate,TODAY),calendarMonthIndex:getMonthIndexForDate(activeDate,TODAY)})}
      />

      <button
        type="button"
        style={{...S.card,width:'100%',textAlign:'left',cursor:'pointer',background:C.surf}}
        aria-label={`Open weekly preview for the ${PROGRAM_LIBRARY_META[fitnessProgram]?.title||'training plan'}`}
        onClick={()=>openTab('training',{trainSection:'plan'})}
      >
        <div style={{...S.row,marginBottom:10,alignItems:'flex-start'}}>
          <div>
            <div style={S.lbl}>Weekly Preview</div>
            <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{PROGRAM_LIBRARY_META[fitnessProgram]?.title||'Training plan'}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{resolvedWkType} week · {weekPlannedWorkouts.filter(w=>w.status==='completed'||w.status==='moved').length}/{weekPlannedWorkouts.length} completed</div>
          </div>
          <span style={{fontSize:11,color:C.navy,fontWeight:700}}>Open Plan</span>
        </div>
        <div style={{display:'grid',gap:8,maxHeight:360,overflowY:'auto',paddingRight:2}}>
          {weekPlannedWorkouts.map(item=>{
            const isDone=item.status==='completed'||item.status==='moved';
            const isMissed=item.status==='missed';
            const isRescheduling=rescheduleTarget===item.plannedDate;
            const pillBg=isDone?C.sageL:isMissed?C.amberL:C.navyL;
            const pillClr=isDone?C.sageDk:isMissed?C.amberDk:C.navyDk;
            const pillLabel=isDone?'Done':isMissed?'Missed':'Planned';
            // Next 7 days for rescheduling
            const reschedDates=Array.from({length:7},(_,i)=>{const d=new Date(TODAY);d.setDate(d.getDate()+i+1);return formatDateKey(d);});
            return <div key={item.plannedDate}>
              <div style={{background:C.card,border:`1px solid ${isMissed?C.amber:C.bd}`,borderRadius:12,padding:'10px 12px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:9,color:C.muted,marginBottom:4}}>{item.plannedDayLabel}</div>
                  <div style={{fontSize:12,fontWeight:700,color:C.tx,marginBottom:isMissed?6:4,lineHeight:1.35}}>{item.plannedName?.replace('Strength — ','')||item.name}</div>
                  {isMissed&&<button
                    type="button"
                    onClick={e=>{e.stopPropagation();setRescheduleTarget(isRescheduling?null:item.plannedDate);}}
                    style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}}
                  >{isRescheduling?'Cancel':'Reschedule'}</button>}
                </div>
                <span style={{...S.pill(pillBg,pillClr),flexShrink:0,marginBottom:0}}>{pillLabel}</span>
              </div>
              {isRescheduling&&<div style={{background:C.surf,borderRadius:'0 0 12px 12px',padding:'10px 12px',marginTop:-4}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:8,letterSpacing:0.5,textTransform:'uppercase'}}>Pick a new date</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {reschedDates.map(d=><button
                    key={d}
                    type="button"
                    onClick={e=>{
                      e.stopPropagation();
                      updateProfile(p=>({...p,workoutReschedules:{...(p.workoutReschedules||{}),[item.plannedDate]:d}}));
                      setRescheduleTarget(null);
                      showNotif(`Rescheduled to ${formatDate(d,'weekdayMonthDayShort')}`,'success');
                    }}
                    style={{padding:'6px 10px',borderRadius:10,border:`1.5px solid ${C.bd}`,background:C.card,color:C.tx,fontSize:11,fontWeight:600,cursor:'pointer'}}
                  >{formatDate(d,'weekdayMonthDayShort')}</button>)}
                </div>
              </div>}
            </div>;
          })}
        </div>
      </button>

      <div style={S.card}>
        <button
          type="button"
          style={{width:'100%',background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0}}
          aria-expanded={weekAheadOpen}
          aria-controls={weekAheadPanelId}
          onClick={()=>setWeekAheadOpen(o=>!o)}
        >
          <div style={S.row}>
            <div><span style={S.lbl}>Week Ahead</span><div style={{fontSize:14,fontWeight:600,color:C.tx}}>{formatDateRange(nextWeekDates[0],nextWeekDates[6],'monthDayShort')}</div></div>
            <span style={{fontSize:13,color:C.muted}}>{weekAheadOpen?'▲':'▼'}</span>
          </div>
        </button>
        {weekAheadOpen&&<div id={weekAheadPanelId} style={{marginTop:12,display:'grid',gap:8}}>
          {nextWeekDates.map(dateStr=>{
            const dayLabel=formatDate(dateStr,'primary');
            const scheduledCount=taskBuckets.scheduled.filter(t=>t.date===dateStr).length;
            return <div key={dateStr} style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px'}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{dayLabel}</div>
                <div style={{fontSize:10,color:C.muted}}>{scheduledCount>0?`${scheduledCount} task${scheduledCount!==1?'s':''}`:'Nothing scheduled'}</div>
              </div>
              <button type="button" style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>openComposerForDate(dateStr)}>+ task</button>
            </div>;
          })}
        </div>}
      </div>

      {annualHoldingItems.length>0&&<div style={{...S.card,padding:'16px 16px 12px'}}>
        <div style={{...S.row,marginBottom:10}}>
          <div>
            <div style={S.lbl}>Things to Accomplish</div>
            <div style={{fontSize:13,fontWeight:600,color:C.tx2}}>Someday / Soon</div>
          </div>
          <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>openTab('maintenance')}>View all</button>
        </div>
        <div style={{display:'grid',gap:8}}>
          {annualHoldingItems.slice(0,4).map(item=>{
            const dueLabel=item.dueDate?formatDate(item.dueDate,'monthYear'):null;
            return <div key={item.id} style={{background:C.surf,borderRadius:12,padding:'10px 12px',display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center'}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{item.label}</div>
                {dueLabel&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>Target: {dueLabel}</div>}
              </div>
              <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>completeMaintenanceItem(item.id)}>Done</button>
            </div>;
          })}
        </div>
      </div>}

      {alertsVisible&&<CollapsibleCard
        title="Alerts"
        summary={[urgentMaintenanceItems.length>0&&`${urgentMaintenanceItems.length} maintenance`,pendingInbox.length>0&&`${pendingInbox.length} inbox`].filter(Boolean).join(' · ')||'No active alerts'}
        open={homeCardsOpen.alerts}
        onToggle={()=>setHomeCardsOpen(s=>({...s,alerts:!s.alerts}))}
        accent={C.amber}>
        <div style={{...S.row,marginBottom:10}}>
          <div style={{fontSize:11,color:C.muted}}>{urgentMaintenanceItems.length>0?`${urgentMaintenanceItems.length} active item${urgentMaintenanceItems.length!==1?'s':''}`:`${pendingInbox.length} inbox item${pendingInbox.length!==1?'s':''}`}</div>
          <span style={S.pill(C.amberL,C.amberDk)}>{urgentMaintenanceItems.length>0?'Needs attention':'Review later'}</span>
        </div>
        <div style={{display:'grid',gap:8,marginBottom:10}}>
          {urgentMaintenanceItems.slice(0,2).map(item=><div key={item.id} style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{item.label}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:3}}>{getMaintenanceNextLabel(item)}</div>
          </div>)}
          {pendingInbox.length>5&&<div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:13,fontWeight:700,color:C.tx}}>Inbox review</div>
            <div style={{fontSize:10,color:C.muted,marginTop:3}}>{pendingInbox.length} items waiting to be processed.</div>
          </div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={{...S.btnGhost,flex:1}} onClick={()=>openTab('maintenance')}>Open Maintenance</button>
          <button style={{...S.btnGhost,flex:1}} onClick={()=>openTab('tasks',{taskTab:'inbox'})}>Review Inbox</button>
        </div>
      </CollapsibleCard>}

      {showHabitsModal&&<div style={{position:'fixed',inset:0,background:C.scrim,zIndex:520,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
        <div style={{background:C.card,borderRadius:20,padding:'20px 16px',width:'100%',maxWidth:390,maxHeight:'80vh',overflowY:'auto',boxShadow:C.shadowStrong}}>
          <div style={{...S.row,alignItems:'flex-start',marginBottom:12}}>
            <div>
              <div style={S.lbl}>Daily Habits</div>
              <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{formatDate(activeDate,'primary')}</div>
            </div>
            <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>setShowHabitsModal(false)}>Close</button>
          </div>
          <div style={{display:'grid',gap:8,marginBottom:12}}>
            {activeHabits.length===0
              ?<div style={{background:C.surf,borderRadius:12,padding:'14px 12px',fontSize:12,color:C.muted}}>No habits set up yet.</div>
              :activeHabits.map(habit=>{
                const checked=!!habitDraftCompletions[habit.id];
                return <button key={habit.id} style={{...S.row,width:'100%',background:C.surf,border:`1px solid ${checked?C.sage:C.bd}`,borderRadius:12,padding:'12px 12px',cursor:'pointer',textAlign:'left'}} onClick={()=>setHabitDraftCompletions(prev=>({...prev,[habit.id]:!prev[habit.id]}))}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}}>
                    <span style={{width:22,height:22,borderRadius:checked?8:999,border:`1px solid ${checked?C.sage:C.bd}`,background:checked?C.sage:'transparent',color:checked?C.white:C.muted,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{checked?'✓':''}</span>
                    <span style={{fontSize:14,fontWeight:600,color:C.tx,textDecoration:checked?'line-through':'none'}}>{habit.name}</span>
                  </div>
                </button>;
              })}
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:12}}>
            {activeHabits.filter(habit=>habitDraftCompletions[habit.id]).length} of {activeHabits.length} habits completed today
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={{...S.btnSolid(C.navy),flex:1}} onClick={()=>saveHabitCompletions(activeDate)}>Save</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setShowHabitsModal(false)}>Cancel</button>
          </div>
        </div>
      </div>}

    </div>;
  }

  function TrainingScreen(){
    const [localView,setLocalView]=useState(trainView);
    const [runDist,setRunDist]=useState('');
    const [runDuration,setRunDuration]=useState('');
    const [runNotes,setRunNotes]=useState('');
    useEffect(()=>setLocalView(trainView),[trainView]);
    useEffect(()=>{
      if(localView==='run'&&runSess){
        setRunDist('');
        setRunDuration('');
        setRunNotes('');
      }
    },[localView,runSess]);
    const playerFlow=wkSess?[
      ...(wkSess.warmup||[]).map((item,idx)=>({kind:'warmup',idx,item,title:item.name})),
      ...(wkSess.ex||[]).map((exercise,idx)=>({kind:'exercise',idx,exercise,title:exercise.n})),
      ...(wkSess.cooldown||[]).map((item,idx)=>({kind:'cooldown',idx,item,title:item.name}))
    ]:[];
    const originalWorkoutLabel=suggestedPlanEntry?.plannedName||TODAY_WK?.name||'Planned session unavailable';
    const warmupCount=(wkSess?.warmup||[]).length||0;
    const currentFlowItem=playerFlow[playerIdx]||null;
    const currentExercise=currentFlowItem?.kind==='exercise'?currentFlowItem.exercise:null;
    const nextFlowItem=playerFlow[playerIdx+1]||null;
    const todayWorkoutSections=getWorkoutExecutionSections(adjustedTodayWorkout);
    const activeWorkoutSections=getWorkoutExecutionSections(wkSess);
    const todayWorkoutProgress=getWorkoutSetProgress(adjustedTodayWorkout);
    const activeWorkoutProgress=getWorkoutSetProgress(wkSess);
    const todayWorkoutProgressLabel=getWorkoutProgressLabel(adjustedTodayWorkout||restDayRecovery);
    const activeWorkoutProgressLabel=getWorkoutProgressLabel(wkSess);
    const todayWorkoutType=formatWorkoutTypeLabel(adjustedTodayWorkout||restDayRecovery);
    const todayWorkoutDuration=formatWorkoutDurationLabel(adjustedTodayWorkout||restDayRecovery);
    const todayWorkoutStatusLabel=wkSess
      ?'In progress'
      :wktDone
        ?'Completed'
        :todaysStatus==='recovery_override'
          ?'Recovery replacement'
          :todaysStatus==='training'
            ?'Ready'
            :todaysStatus==='suggested'
              ?'Suggested'
              :'Rest day';
    const todayWorkoutStatusMeta=getWorkoutStatusMeta(
      wktDone
        ?'Completed'
        :wkSess
          ?'In Progress'
          :todaysStatus==='recovery_override'
            ?'Recovery Adjusted'
            :'Planned'
    );
    const activeWorkoutStatusMeta=getWorkoutStatusMeta(wkSess?'In Progress':'Planned');
    const selectedExerciseIndex=wkSess?.currentExerciseIdx||0;
    const completeWorkoutLabel=wkSess?.type==='recovery'?'Complete Session':'Complete Workout';

    function ExerciseThumbnail({exercise,size=72,height=size,radius=12}){
      const definition=resolveExerciseDefinition(exercise?.exerciseId||exercise?.n||exercise?.name||'Exercise');
      const media=createExerciseMedia(definition.media);
      const hasVisual=!!(media.sources.image||media.sources.localVideo||media.sources.externalVideo);
      const accent=exercise?.exerciseType==='breathing'
        ?C.amber
        :exercise?.exerciseType==='mobility'
          ?C.sage
          :exercise?.exerciseType==='cardio'
            ?C.navy
            :C.tx;
      const badge=exercise?.exerciseType==='breathing'
        ?'BREATH'
        :exercise?.exerciseType==='mobility'
          ?'MOBILITY'
          :exercise?.exerciseType==='cardio'
            ?'CARDIO'
            :'EXERCISE';
      if(hasVisual){
        return <img src={getExerciseThumbnail(definition.media)} alt={exercise?.n||definition.name} loading="lazy" style={{width:size,height, borderRadius:radius,objectFit:'cover',flexShrink:0,background:C.surf,display:'block'}}/>;
      }
      return <div style={{width:size,height,borderRadius:radius,flexShrink:0,background:C.surf,border:`1px solid ${C.bd}`,padding:10,display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
        <div style={{width:22,height:22,borderRadius:999,background:accent,opacity:0.16}}/>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:accent,letterSpacing:'0.5px'}}>{badge}</div>
          <div style={{fontSize:10,color:C.tx2,marginTop:2,lineHeight:1.2}}>No media</div>
        </div>
      </div>;
    }
    function WorkoutFlowRail({label='Workout Flow',currentIndex=playerIdx}){
      if(!playerFlow.length)return null;
      return <div style={{...S.card,padding:'10px 12px',marginBottom:10}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:8}}>{label}</div>
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
          {playerFlow.map((item,idx)=>{
            const selected=idx===currentIndex;
            const recoveryItem=item.kind==='exercise'&&isRecoveryStyleExercise(item.exercise);
            const accentBorder=selected?(recoveryItem?C.sage:C.navy):C.bd;
            const accentBg=selected?(recoveryItem?C.sageL:C.navyL):C.card;
            const accentText=selected?(recoveryItem?C.sageDk:C.navyDk):C.muted;
            const detail=item.kind==='exercise'
              ?getExerciseSetLabel(item.exercise)
              :`${item.item.duration}s`;
            return <button key={`${item.kind}-${item.idx}`} onClick={()=>setPlayerIdx(idx)} style={{flexShrink:0,minWidth:104,textAlign:'left',borderRadius:12,border:`1px solid ${accentBorder}`,background:accentBg,padding:'8px 10px',cursor:'pointer'}}>
              <div style={{fontSize:9,color:accentText,fontWeight:700,letterSpacing:'0.4px',textTransform:'uppercase',marginBottom:3}}>{selected?'Current':item.kind==='exercise'?'Exercise':item.kind==='warmup'?'Warm-Up':'Cooldown'}</div>
              <div style={{fontSize:12,fontWeight:700,color:C.tx,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title}</div>
              <div style={{fontSize:10,color:C.tx2,marginTop:2}}>{detail}</div>
            </button>;
          })}
        </div>
      </div>;
    }

    function WorkoutSectionPreview({title,color,items,type='list'}){
      if(!items||items.length===0)return null;
      return <div style={{...S.card,padding:'12px',borderLeft:`3px solid ${color}`,marginBottom:10}}>
        <div style={{fontSize:10,color:color,fontWeight:700,letterSpacing:'0.6px',textTransform:'uppercase',marginBottom:8}}>{title}</div>
        {type==='timed'
          ?items.map((item,idx)=><div key={item.id||idx} style={{...S.row,padding:'7px 0',borderBottom:idx<items.length-1?`0.5px solid ${C.bd}`:'none'}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{item.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{item.duration}s</div>
            </div>
            <button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>startRest(item.duration,item.name)}>Timer</button>
          </div>)
          :items.map((group,groupIdx)=><div key={group.key||groupIdx} style={{padding:'8px 0',borderBottom:groupIdx<items.length-1?`0.5px solid ${C.bd}`:'none'}}>
            {group.items.length===2&&<div style={{fontSize:10,color:C.amberDk,fontWeight:700,marginBottom:6}}>Superset</div>}
            {group.items.map(({ex,idx},itemIdx)=>{
              const history=getExerciseHistorySummary(workoutHistory,ex.n);
              return <div key={`${group.key}-${ex.id||idx}`} style={{marginBottom:itemIdx<group.items.length-1?8:0}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{group.items.length===2?`${itemIdx===0?'A1':'A2'} · `:''}{ex.n}</div>
                    <div style={{fontSize:10,color:C.muted}}>{formatExercisePrescription(ex)}</div>
                    {history&&<div style={{fontSize:10,color:C.tx2,marginTop:3}}>Last: {history.lastSummary}</div>}
                  </div>
                  {wkSess&&<button style={{...S.btnGhost,fontSize:10,padding:'4px 8px',flexShrink:0}} onClick={()=>{
                    setPlayerIdx(warmupCount+idx);setTrainView('player');
                  }}>Player</button>}
                </div>
              </div>;
            })}
          </div>)
        }
      </div>;
    }

    function SetLogEditor({exercise,exerciseIndex,set,setIndex,compact=false}){
      const recoveryStyle=isRecoveryStyleExercise(exercise);
      const inputStyle={...S.inp,padding:compact?'6px 8px':'6px 8px',fontSize:11,minHeight:34};
      const visibleFields=getVisibleLogFields(exercise);
      const showField=field=>visibleFields.includes(field);
      const editorFields=[
        showField('weight')&&<FieldInput key="weight" value={set.weight||''} onChange={e=>updateExerciseSet(exerciseIndex,setIndex,{weight:e.target.value})} placeholder="Weight" style={inputStyle}/>,
        showField('reps')&&<FieldInput key="reps" value={set.reps||''} onChange={e=>updateExerciseSet(exerciseIndex,setIndex,{reps:e.target.value})} placeholder={recoveryStyle?'Reps or breaths':'Reps'} style={inputStyle}/>,
        showField('duration')&&<FieldInput key="duration" value={set.duration||''} onChange={e=>updateExerciseSet(exerciseIndex,setIndex,{duration:e.target.value})} placeholder={exercise.exerciseType==='breathing'?'Time':'Duration'} style={inputStyle}/>,
        showField('distance')&&<FieldInput key="distance" value={set.distance||''} onChange={e=>updateExerciseSet(exerciseIndex,setIndex,{distance:e.target.value})} placeholder="Distance" style={inputStyle}/>,
      ].filter(Boolean);
      return <div style={{background:C.surf,borderRadius:10,padding:compact?7:8,marginBottom:6,border:`1px solid ${set.done?(recoveryStyle?C.sage:C.navyL):'transparent'}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:editorFields.length||showField('notes')?6:0,gap:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.tx}}>
            {recoveryStyle?'Round':exercise.exerciseType==='cardio'?'Block':'Set'} {set.idx}
          </div>
          <button onClick={()=>markSetDone(exerciseIndex,setIndex)} style={{borderRadius:999,border:`1px solid ${set.done?(recoveryStyle?C.sage:C.navy):C.bd}`,background:set.done?(recoveryStyle?C.sageL:C.navyL):'transparent',color:set.done?(recoveryStyle?C.sageDk:C.navyDk):C.muted,fontSize:11,fontWeight:700,cursor:'pointer',padding:'5px 10px'}}>{getExerciseActionLabel(exercise,set.done)}</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:editorFields.length>1?'repeat(2,minmax(0,1fr))':'1fr',gap:6}}>
          {editorFields}
        </div>
        {!recoveryStyle&&showField('weight')&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
          {[-10,-5,2.5,5].map(delta=><button key={delta} style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>adjustSetWeight(exerciseIndex,setIndex,delta)}>{delta>0?`+${delta}`:delta} lb</button>)}
        </div>}
        {showField('notes')&&<FieldInput value={set.notes||''} onChange={e=>updateExerciseSet(exerciseIndex,setIndex,{notes:e.target.value})} placeholder={recoveryStyle?'Optional note':'Set notes'} style={{...inputStyle,marginTop:6}}/>}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
          {setIndex>0&&<button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>duplicatePreviousSet(exerciseIndex,setIndex)}>Copy Prev</button>}
          {!recoveryStyle&&<>
            <button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>startRest(15,'Quick rest +15s')}>+15s Rest</button>
            <button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>startRest(30,'Quick rest +30s')}>+30s Rest</button>
          </>}
        </div>
      </div>;
    }

    function SessionExerciseCard({ex,ei}){
      const history=getExerciseHistorySummary(workoutHistory,ex.n);
      const swapOptions=getSwapCandidates(ex);
      const exerciseDef=resolveExerciseDefinition(ex.exerciseId||ex.n);
      const hasDemo=hasExerciseDemo(exerciseDef.media);
      const isSelected=selectedExerciseIndex===ei;
      const recoveryStyle=isRecoveryStyleExercise(ex)||wkSess?.type==='recovery';
      return <div style={{...S.card,padding:recoveryStyle?'10px 12px':'12px',borderColor:isSelected?(recoveryStyle?C.sage:C.navy):C.bd,boxShadow:isSelected?`0 0 0 1px ${recoveryStyle?C.sageL:C.navyL}`:'none'}}>
        <div style={{display:'flex',gap:10,marginBottom:8}}>
          <ExerciseThumbnail exercise={ex} size={68} radius={12}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{...S.row,alignItems:'flex-start',marginBottom:4}}>
              <div style={{fontSize:14,fontWeight:700,color:C.tx,flex:1}}>
                {ex.n}
                {ex.swappedFrom&&ex.swappedFrom!==ex.n&&<div style={{fontSize:10,color:C.amberDk,fontWeight:600,marginTop:2}}>Swapped from {ex.plannedExerciseName||ex.swappedFrom}</div>}
              </div>
              <span style={S.pill(isSelected?(recoveryStyle?C.sageL:C.navyL):C.surf,isSelected?(recoveryStyle?C.sageDk:C.navyDk):C.muted)}>{isSelected?'Selected':getExerciseSetLabel(ex)}</span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{ex.category} · {ex.equipment}</div>
            <div style={{fontSize:11,color:C.tx2,marginBottom:4}}>{formatExercisePrescription(ex)}</div>
            <div style={{fontSize:11,color:C.tx2}}>{ex.coachingNotes||ex.instructions}</div>
            {history&&<div style={{fontSize:10,color:C.muted,marginTop:6}}>Last: {history.lastDate} · {history.lastSummary}</div>}
            {history&&<div style={{fontSize:10,color:C.muted}}>{recoveryStyle?'Best recent completion':'Best recent set'}: {history.bestSet}</div>}
          </div>
        </div>
        <div style={{marginBottom:6}}>
          {(ex.setLogs||[]).map((set,si)=><SetLogEditor key={si} exercise={ex} exerciseIndex={ei} set={set} setIndex={si}/>)}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px',borderColor:isSelected?(recoveryStyle?C.sage:C.navy):C.bd,color:isSelected?(recoveryStyle?C.sageDk:C.navyDk):C.muted}} onClick={()=>setWkSess(s=>s?{...s,currentExerciseIdx:ei}:s)}>{isSelected?'Open in detail':'Select'}</button>
          {!recoveryStyle&&<button style={{...S.btnSmall(C.navy),fontSize:11,padding:'6px 10px'}} onClick={()=>startRest(ex.defaultRest,`${ex.n} rest`)}>Start Rest</button>}
          {!recoveryStyle&&<button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>startRest(Math.max(30,Math.round(ex.defaultRest/2)),`${ex.n} short rest`)}>Short Rest</button>}
          {hasDemo
            ?<button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>setDemoExercise({exerciseId:ex.exerciseId,n:ex.n})}>Demo</button>
            :<span style={{...S.pill(C.surf,C.muted),marginRight:0}}>No demo available</span>}
          <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>setShowSwap(showSwap===ei?null:ei)}>Swap</button>
          <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>{setPlayerIdx(warmupCount+ei);setTrainView('player');}}>Player</button>
        </div>
        {showSwap===ei&&<div style={{marginTop:8}}>
          {swapOptions.map(sub=><button key={sub.exerciseId||sub.n} style={{...S.btnGhost,margin:'3px 3px 3px 0',fontSize:11}} onClick={()=>swapExercise(ei,sub.exerciseId||sub.n)}>{sub.n}</button>)}
        </div>}
      </div>;
    }

    if(localView==='overview'){
      return <div style={S.body}>
        <div style={{display:'flex',gap:4,marginBottom:12,overflowX:'auto'}}>
          {[
            {id:'today',label:'Today'},
            {id:'plan',label:'Plan'},
            {id:'library',label:'Workout Library'},
            {id:'history',label:'Logging'},
          ].map(item=><button key={item.id} style={{flexShrink:0,padding:'7px 12px',borderRadius:10,border:`0.5px solid ${trainSection===item.id?C.sage:C.bd}`,background:trainSection===item.id?C.sageL:'transparent',color:trainSection===item.id?C.sageDk:C.muted,fontSize:11,fontWeight:trainSection===item.id?600:400,cursor:'pointer'}} onClick={()=>setTrainSection(item.id)}>{item.label}</button>)}
        </div>

        {trainSection==='today'&&<>
          <div style={{...S.card,background:C.card,borderColor:C.bd}}>
            <div style={{...S.row,alignItems:'flex-start',marginBottom:12}}>
              <div>
                <span style={S.lbl}>Fitness Today</span>
                <div style={{fontSize:20,fontWeight:700,color:C.tx,marginBottom:2}}>Today's Workout</div>
                <div style={{fontSize:12,color:C.tx2}}>
                  {todaysStatus==='training'
                    ?(adjustedTodayWorkout?.name||'Planned session')
                    :todaysStatus==='recovery_override'
                      ?(adjustedTodayWorkout?.name||'Recovery replacement')
                      :todaysStatus==='suggested'
                        ?(adjustedTodayWorkout?.name||'Suggested session')
                      :'Rest day with optional recovery'}
                </div>
              </div>
              <div style={{...S.pill(todayWorkoutStatusMeta.bg,todayWorkoutStatusMeta.color),marginRight:0,marginBottom:0}}>{todayWorkoutStatusMeta.label}</div>
            </div>
            {suggestionLabel&&!workoutDecisionMade&&<div style={{background:C.surf,borderRadius:10,padding:'9px 10px',marginBottom:12}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Schedule</div>
              <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{suggestionLabel}</div>
              {suggestedPlanEntry?.plannedDate!==TODAY&&<div style={{fontSize:11,color:C.tx2,marginTop:2}}>The calendar keeps the original plan. Completion will be marked off-schedule unless you replan the week.</div>}
            </div>}
            {shouldPromptWorkoutDecision&&<WorkoutDecisionPrompt
              C={C}
              S={S}
              compact
              scheduledWorkout={scheduledTodayWorkout}
              recoveryWorkout={recoveryWorkoutOption}
              onAccept={()=>handleWorkoutDecision('accept')}
              onModify={()=>handleWorkoutDecision('modify')}
              onIgnore={()=>handleWorkoutDecision('ignore')}
            />}
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:12}}>
              <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Workout Name</div>
                <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{adjustedTodayWorkout?.name||restDayRecovery.name}</div>
              </div>
              <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Workout Type</div>
                <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{todayWorkoutType}</div>
              </div>
              <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Duration</div>
              <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{todayWorkoutDuration}</div>
              </div>
              <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Recovery Adjustment</div>
                <div style={{fontSize:13,fontWeight:700,color:C.tx}}>
                  {workoutDecisionMade&&dailyWorkoutRecommendation?.action==='ignore'
                    ?'No change'
                    :workoutDecisionMade&&dailyWorkoutRecommendation?.action==='accept'
                      ?'Scheduled workout confirmed'
                      :workoutDecisionMade&&dailyWorkoutRecommendation?.action==='modify'
                        ?'Recovery workout selected'
                        :describeWorkoutAdjustment(adjustedTodayWorkout)||adjustedTodayWorkout?.adjustmentReason||'No change'}
                </div>
              </div>
            </div>
            {todaysStatus==='training'&&adjustedTodayWorkout&&<div style={{background:C.card,borderRadius:12,padding:'12px 12px 10px',marginBottom:12}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{adjustedTodayWorkout.type==='run'?'Run session':adjustedTodayWorkout.type==='recovery'?'Recovery session':'Strength session'}</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:4}}>{adjustedTodayWorkout.dur||adjustedTodayWorkout.duration||'45 min'} · {adjustedTodayWorkout.intensity||adjustedTodayWorkout.adjustmentLabel||'Planned'}</div>
              {getWorkoutPaceLabel(adjustedTodayWorkout,paceProfile)&&<div style={{fontSize:12,color:C.tx2}}>Target pace: <strong style={{color:C.tx}}>{getWorkoutPaceLabel(adjustedTodayWorkout,paceProfile)}</strong></div>}
              {!getWorkoutPaceLabel(adjustedTodayWorkout,paceProfile)&&<div style={{fontSize:12,color:C.tx2}}>{describeWorkoutAdjustment(adjustedTodayWorkout)||adjustedTodayWorkout.adjustmentReason||adjustedTodayWorkout.purpose}</div>}
              {hasModifiedSession&&<div style={{fontSize:11,color:C.tx2,marginTop:8}}>This session keeps the planned workout type but trims volume so you can still train without forcing the full load.</div>}
              {modifiedSessionChanges.length>0&&<div style={{background:C.surf,borderRadius:10,padding:'9px 10px',marginTop:8}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Set reductions</div>
                {modifiedSessionChanges.map(change=><div key={change.name} style={{fontSize:12,color:C.tx2,marginTop:3}}>
                  <strong style={{color:C.tx}}>{change.name}</strong>: {change.originalSets} to {change.modifiedSets} sets
                </div>)}
              </div>}
            </div>}
            {todaysStatus==='recovery_override'&&adjustedTodayWorkout&&<div style={{background:C.card,borderRadius:12,padding:'12px 12px 10px',marginBottom:12}}>
              <div style={{fontSize:12,color:workoutDecisionMade?C.muted:C.red,marginBottom:4}}>{workoutDecisionMade?'Recovery workout selected':'Workout replaced due to low recovery'}</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:4}}>{adjustedTodayWorkout.name}</div>
              <div style={{fontSize:12,color:C.tx2,marginBottom:8}}>
                {workoutDecisionMade
                  ?'This is the final workout selected for today.'
                  :describeWorkoutAdjustment(adjustedTodayWorkout)||adjustedTodayWorkout.adjustmentReason||'Low recovery detected.'}
              </div>
              <div style={{background:C.surf,borderRadius:10,padding:'9px 10px'}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Original plan</div>
                <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{originalWorkoutLabel}</div>
              </div>
            </div>}
            {todaysStatus==='rest'&&<div style={{background:C.card,borderRadius:12,padding:'12px 12px 10px',marginBottom:12}}>
              <div style={{fontSize:12,color:C.amberDk,marginBottom:4}}>Rest day</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:4}}>Optional recovery or mobility</div>
              <div style={{fontSize:12,color:C.tx2,marginBottom:8}}>No primary training session is scheduled for today. Keep momentum with light movement if it helps.</div>
              <div style={{background:C.surf,borderRadius:10,padding:'9px 10px'}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Suggested session</div>
                <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{restDayRecovery.name}</div>
                <div style={{fontSize:11,color:C.tx2,marginTop:2}}>{restDayRecovery.duration}</div>
              </div>
            </div>}
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              {wkSess
                ?<button style={{...S.btnSmall(C.navy),flex:1}} onClick={()=>{setPlayerIdx(warmupCount+(wkSess.currentExerciseIdx||0));setTrainView('session');}}>Continue Workout</button>
                :wktDone
                  ?<button style={{...S.btnSmall(C.sage),flex:1}} onClick={()=>setTrainSection('history')}>View Summary</button>
                  :todaysStatus==='rest'
                    ?<button style={{...S.btnSmall(C.amber),flex:1}} onClick={()=>startRec(RECOVERY_SESSIONS.find(s=>s.id==='runner')||RECOVERY_SESSIONS[0])}>Start Recovery</button>
                    :<button style={{...S.btnSmall(adjustedTodayWorkout?.type==='recovery'?C.amber:C.navy),flex:1}} onClick={()=>adjustedTodayWorkout&&launchWorkout(adjustedTodayWorkout)}>{todaysStatus==='recovery_override'||adjustedTodayWorkout?.type==='recovery'?'Start Recovery Session':'Start Workout'}</button>
              }
              <button style={{...S.btnGhost,flex:1}} onClick={()=>setTrainSection('plan')}>View Plan</button>
            </div>
            {adjustedTodayWorkout&&<>
              <WorkoutSectionPreview title="Warm-Up" color={C.navy} items={todayWorkoutSections.warmup} type="timed"/>
              {todayWorkoutSections.main.length>0&&<WorkoutSectionPreview title="Main Workout" color={C.navy} items={todayWorkoutSections.main}/>}
              {todayWorkoutSections.accessory.length>0&&<WorkoutSectionPreview title="Accessory / Superset" color={C.amber} items={todayWorkoutSections.accessory}/>}
              <WorkoutSectionPreview title="Cooldown" color={C.sage} items={todayWorkoutSections.cooldown} type="timed"/>
              {todayWorkoutProgress.totalSets>0&&<div style={{background:C.surf,borderRadius:12,padding:'12px',marginBottom:14}}>
                <div style={{...S.row,marginBottom:5}}>
                  <span style={{fontSize:12,color:C.tx,textTransform:'capitalize'}}>{todayWorkoutProgressLabel}</span>
                  <span style={{fontSize:12,color:C.tx2}}>{todayWorkoutProgress.doneSets} / {todayWorkoutProgress.totalSets}</span>
                </div>
                <ProgressBar value={todayWorkoutProgress.doneSets} max={todayWorkoutProgress.totalSets} color={C.sage}/>
              </div>}
            </>}
            <div style={{background:C.surf,borderRadius:12,padding:'12px'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:10}}>Weekly Training Progress</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:10}}>
                {[
                  {label:'Workouts completed',value:`${weekAnalytics.sessionsLogged} / ${weekWorkoutGoal}`},
                  {label:'Miles completed',value:`${weekAnalytics.runMiles} / ${weekMilesGoal}`},
                  {label:'Strength sessions',value:String(weekAnalytics.strengthSessions)},
                  {label:'Recovery sessions',value:String(weekAnalytics.recoverySessions||0)},
                ].map(item=><div key={item.label} style={{background:C.card,border:`1px solid ${C.bd}`,borderRadius:10,padding:'10px'}}>
                  <div style={{fontSize:9,color:C.muted,marginBottom:4}}>{item.label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.tx}}>{item.value}</div>
                </div>)}
              </div>
              <div style={{marginBottom:10}}>
                <div style={{...S.row,marginBottom:5}}>
                  <span style={{fontSize:12,color:C.tx}}>Workouts</span>
                  <span style={{fontSize:12,color:C.tx2}}>{weekAnalytics.sessionsLogged} / {weekWorkoutGoal}</span>
                </div>
                <ProgressBar value={weekAnalytics.sessionsLogged} max={weekWorkoutGoal} color={C.navy}/>
              </div>
              <div>
                <div style={{...S.row,marginBottom:5}}>
                  <span style={{fontSize:12,color:C.tx}}>Miles</span>
                  <span style={{fontSize:12,color:C.tx2}}>{weekAnalytics.runMiles} / {weekMilesGoal}</span>
                </div>
                <ProgressBar value={weekAnalytics.runMiles} max={weekMilesGoal} color={C.sage}/>
              </div>
            </div>
          </div>
        </>}

        {trainSection==='plan'&&<>
          <div style={S.card}>
            <div style={{...S.row,marginBottom:8,alignItems:'flex-start'}}>
              <div style={{flex:1}}>
                <span style={S.lbl}>Program</span>
                <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:2}}>{PROGRAM_LIBRARY_META[fitnessProgram]?.title||'Training plan'}</div>
                <div style={{fontSize:12,color:C.tx2,marginBottom:8}}>{PROGRAM_LIBRARY_META[fitnessProgram]?.detail||'Structured weekly training.'}</div>
              </div>
              <button style={{...S.btnGhost,fontSize:11,flexShrink:0}} onClick={()=>setShowProgramPicker(p=>!p)}>{showProgramPicker?'Close':'Change'}</button>
            </div>
            {!showProgramPicker&&<>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
                {(PROGRAM_DETAIL_CARDS[fitnessProgram]?.sessions||[]).map((s,i)=><span key={i} style={{...S.pill(C.surf,C.tx2),fontWeight:400}}>{s}</span>)}
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                <span style={S.pill(C.surf,C.tx2)}>{PROGRAM_DETAIL_CARDS[fitnessProgram]?.duration||'30–60 min'}</span>
                <span style={S.pill(C.surf,C.tx2)}>{PROGRAM_DETAIL_CARDS[fitnessProgram]?.structure||((athlete?.programType||'4-day')==='5-day'?'5 days / week':'4 days / week')}</span>
                <span style={S.pill(C.surf,C.tx2)}>Rotation {resolvedWkType}</span>
              </div>
            </>}
            {showProgramPicker&&<div style={{marginTop:4}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:500,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:8}}>Select program</div>
              {['hyrox','strength','pilates','recovery'].map(id=>{
                const meta=PROGRAM_LIBRARY_META[id]||{};
                const detail=PROGRAM_DETAIL_CARDS[id]||{};
                const isActive=fitnessProgram===id;
                return <div key={id} style={{borderRadius:12,border:`1.5px solid ${isActive?C.sage:C.bd}`,background:isActive?C.sageL:C.card,padding:'10px 12px',marginBottom:6}}>
                  <div style={{...S.row,alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:isActive?C.sageDk:C.tx}}>{meta.title||id}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2,marginBottom:5}}>{detail.duration} · {detail.structure}</div>
                      <div style={{fontSize:11,color:C.tx2,marginBottom:5}}>{detail.note}</div>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                        {(detail.sessions||[]).map((s,i)=><span key={i} style={{...S.pill(isActive?C.card:C.surf,C.muted),fontSize:9,padding:'2px 7px'}}>{s}</span>)}
                      </div>
                    </div>
                    <button style={{...S.btnSmall(isActive?C.sage:C.navy),flexShrink:0}} onClick={()=>{updateProfile(p=>({...p,fitnessProgram:id,athleteProfile:{...p.athleteProfile,primaryProgram:id}}));setShowProgramPicker(false);}}>
                      {isActive?'Active':'Select'}
                    </button>
                  </div>
                </div>;
              })}
            </div>}
          </div>
          {(()=>{
            const programTitle=PROGRAM_LIBRARY_META[fitnessProgram]?.title||'Training plan';
            const isRaceFocused=profile.goalType==='race';
            const goalLabel=isRaceFocused?'Race Goal':'Primary Goal';
            const goalValue=fitnessProgram==='hyrox'
              ?'HYROX Tampa'
              :fitnessProgram==='running'
                ?'Running race build'
                :fitnessProgram==='strength'
                  ?'Strength progression'
                  :fitnessProgram==='pilates'
                    ?'Pilates consistency'
                    :'Recovery reset';
            const goalMeta=raceDate?`${formatDate(raceDate,'monthYear')} target`:`Built around ${programTitle.toLowerCase()}`;
            const phaseLabel=fitnessProgram==='hyrox'?'Current Phase':'Current Rotation';
            const phaseValue=fitnessProgram==='hyrox'
              ?`${PH.name} — Week ${CUR_WK}`
              :`${resolvedWkType} week`;
            const phaseMeta=fitnessProgram==='hyrox'
              ?PH.theme
              :PROGRAM_DETAIL_CARDS[fitnessProgram]?.note||'Complete planned sessions within the current weekly rotation.';
            return <div style={{...S.card,background:fitnessProgram==='hyrox'?PH.lClr:C.card,borderColor:fitnessProgram==='hyrox'?'transparent':C.bd}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'flex-start'}}>
                <div>
                  <div style={S.lbl}>{goalLabel}</div>
                  <div style={{fontSize:18,fontWeight:700,color:fitnessProgram==='hyrox'?PH.clr:C.tx,marginBottom:2}}>{goalValue}</div>
                  <div style={{fontSize:11,color:fitnessProgram==='hyrox'?PH.tClr:C.tx2}}>{goalMeta}</div>
                </div>
                {fitnessProgram==='hyrox'&&<div style={{textAlign:'right'}}>
                  <div style={{fontSize:26,fontWeight:700,color:PH.clr,lineHeight:1}}>{DTR}</div>
                  <div style={{fontSize:10,color:C.muted}}>days remaining</div>
                </div>}
              </div>
              <div style={{height:1,background:fitnessProgram==='hyrox'?PH.tClr:C.bd,opacity:0.18,margin:'12px 0'}}/>
              <div>
                <div style={{...S.lbl,color:fitnessProgram==='hyrox'?PH.tClr:C.muted}}>{phaseLabel}</div>
                <div style={{fontSize:18,fontWeight:700,color:fitnessProgram==='hyrox'?PH.clr:C.tx,marginBottom:2}}>{phaseValue}</div>
                <div style={{fontSize:12,color:fitnessProgram==='hyrox'?PH.tClr:C.tx2}}>{phaseMeta}</div>
              </div>
            </div>;
          })()}
          <div style={S.card}>
            <span style={S.lbl}>Weekly Schedule</span>
            {weekPlannedWorkouts.map((item,idx)=><div key={item.plannedDate} style={{...S.row,padding:'10px 0',borderBottom:idx<weekPlannedWorkouts.length-1?`0.5px solid ${C.bd}`:'none',alignItems:'flex-start',gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{item.plannedDayLabel}</div>
                <div style={{fontSize:12,color:C.tx,marginTop:2}}>{item.plannedName}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                  {item.status==='completed'?'Completed on plan'
                    :item.status==='moved'?`Completed ${item.moveLabel}`
                    :item.status==='missed'?'Missed'
                    :item.status==='today'?'Planned today'
                    :'Upcoming'}
                </div>
              </div>
              <span style={S.pill(
                item.status==='completed'||item.status==='moved'?C.sageL:item.status==='missed'?C.amberL:item.status==='today'?C.navyL:C.surf,
                item.status==='completed'||item.status==='moved'?C.sageDk:item.status==='missed'?C.amberDk:item.status==='today'?C.navyDk:C.muted
              )}>
                {item.status==='moved'?'Moved':item.status==='completed'?'Done':item.status==='missed'?'Open':item.status==='today'?'Today':'Planned'}
              </span>
            </div>)}
          </div>
          <div style={S.card}>
            <span style={S.lbl}>Training Load</span>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[{l:'Sessions',v:weekAnalytics.sessionsLogged},{l:'Run miles',v:weekAnalytics.runMiles},{l:'Total min',v:weekAnalytics.totalMinutes}].map(({l,v})=>
                <div key={l} style={{background:C.surf,borderRadius:10,padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:20,fontWeight:700,color:C.tx}}>{v}</div>
                  <div style={{fontSize:10,color:C.muted}}>{l}</div>
                </div>
              )}
            </div>
          </div>
        </>}

        {trainSection==='library'&&<div>
          {Object.values(EXERCISE_LIBRARY).slice(0,18).map(ex=>{
            const exerciseMeta=getExerciseMeta(ex.id);
            const hasDemo=hasExerciseDemo(ex.media);
            return <div key={ex.id} style={{...S.card,padding:'12px'}}>
            <div style={{display:'flex',gap:10}}>
              <img src={getExerciseThumbnail(ex.media)} alt={ex.name} loading="lazy" style={{width:64,height:64,borderRadius:12,objectFit:'cover',flexShrink:0,background:C.surf}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{ex.name}</div>
                <div style={{fontSize:10,color:C.muted,margin:'2px 0 6px'}}>{ex.category} · {ex.equipment}</div>
                <div style={{fontSize:11,color:C.tx2,marginBottom:6}}>{(ex.coachingCues||[]).slice(0,2).join(' · ')}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {(exerciseMeta.tags||[]).slice(0,3).map(tag=><span key={tag} style={S.pill(C.surf,C.muted)}>{tag}</span>)}
                  {hasDemo
                    ?<button style={{...S.btnGhost,fontSize:11,padding:'4px 8px'}} onClick={()=>setDemoExercise({exerciseId:ex.id,name:ex.name})}>Demo</button>
                    :<span style={{...S.pill(C.surf,C.muted),marginRight:0}}>No demo available</span>}
                </div>
              </div>
            </div>
          </div>;
          })}
          <div style={S.card}>
            <button
              type="button"
              onClick={()=>setShowPlannedWorkoutLibrary(open=>!open)}
              style={{...S.row,width:'100%',background:'none',border:'none',padding:0,cursor:'pointer',alignItems:'flex-start',textAlign:'left'}}
            >
              <div style={{flex:1}}>
                <span style={S.lbl}>Planned Workout Library</span>
                <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:4}}>{PROGRAM_LIBRARY_META[fitnessProgram]?.title||'Training library'}</div>
                <div style={{fontSize:12,color:C.tx2}}>{PROGRAM_LIBRARY_META[fitnessProgram]?.detail||'Available workouts for the selected program.'}</div>
              </div>
              <span style={{fontSize:16,color:C.muted,marginLeft:12}}>{showPlannedWorkoutLibrary?'−':'+'}</span>
            </button>
            {showPlannedWorkoutLibrary&&<div style={{marginTop:10}}>
              {workoutLibrarySessions.map(session=>{
                const previewSession=adjustWorkoutForRecovery(session,recoveryToday)||session;
                return <div key={session.libraryId} style={{padding:'10px 0',borderTop:`0.5px solid ${C.bd}`}}>
                  <div style={{...S.row,alignItems:'flex-start',gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{session.name}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{session.rotation} week · {session.daySlot.toUpperCase()} · {session.dur||session.duration||'30 min'} · {formatWorkoutTypeLabel(session)}</div>
                      <div style={{fontSize:11,color:C.tx2,marginTop:4}}>{session.purpose}</div>
                    </div>
                    <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px',flexShrink:0}} onClick={()=>launchWorkout(previewSession)}>Start</button>
                  </div>
                </div>;
              })}
            </div>}
          </div>
        </div>}

        {trainSection==='history'&&<div>
          {workoutHistory.filter(h=>h.type==='workout'||h.type==='run'||h.type==='recovery').slice().reverse().slice(0,10).map((entry,idx)=><div key={idx} style={S.card}>
            <div style={{...S.row,marginBottom:8}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{entry.name}</div>
                <div style={{fontSize:10,color:C.muted}}>{formatDate(entry.date,'primary')}</div>
              </div>
              <span style={S.pill(entry.type==='recovery'?C.amberL:entry.type==='run'?C.navyL:C.sageL,entry.type==='recovery'?C.amberDk:entry.type==='run'?C.navyDk:C.sageDk)}>
                {getHistoryEntryTypeLabel(entry)}
              </span>
            </div>
            {entry.type==='run'&&<div style={{fontSize:12,color:C.tx2}}>Distance: <strong style={{color:C.tx}}>{entry.data?.dist2||'—'} mi</strong>{entry.data?.durationMins?` · ${entry.data.durationMins} min`:''}</div>}
            {entry.type==='recovery'&&<div style={{fontSize:12,color:C.tx2}}>Duration: <strong style={{color:C.tx}}>{entry.data?.durationMins||'—'} min</strong> · {(entry.data?.moves||[]).length} moves</div>}
            {(entry.data?.exercises||[]).slice(0,3).map(ex=>{
              const summary=(ex.setLogs||[]).filter(s=>s.done).slice(0,2).map(s=>summarizeLoggedSet(s)).filter(Boolean).join(' · ');
              return <div key={ex.id||ex.n} style={{...S.row,padding:'6px 0',borderBottom:`0.5px solid ${C.bd}`}}>
                <span style={{fontSize:12,color:C.tx}}>{ex.n}{ex.swappedFrom&&ex.swappedFrom!==ex.n?` (vs ${ex.plannedExerciseName||ex.swappedFrom})`:''}</span>
                <span style={{fontSize:10,color:C.muted}}>{summary||getExerciseHistoryFallbackLabel(ex)}</span>
              </div>;
            })}
          </div>)}
          {workoutHistory.filter(h=>h.type==='workout'||h.type==='run'||h.type==='recovery').length===0&&<div style={{textAlign:'center',padding:'32px 0',color:C.muted,fontSize:13}}>No workout history yet.</div>}
        </div>}
      </div>;
    }

    if(localView==='session'&&wkSess){
      const grouped=buildExerciseGroups(wkSess.ex||[]);
      const workoutSessionDateLabel=wkSess.dateKey&&wkSess.dateKey!==TODAY?`Started ${wkSess.dateKey}`:'Today';
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{wkSess.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{wkSess.dur} · {wkSess.intensity} · {workoutSessionDateLabel}</div>
          </div>
          <div style={{display:'flex',gap:6}}>
            <span style={{...S.pill(activeWorkoutStatusMeta.bg,activeWorkoutStatusMeta.color),marginRight:0,marginBottom:0}}>{activeWorkoutStatusMeta.label}</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{setPlayerIdx(warmupCount+(wkSess.currentExerciseIdx||0));setTrainView('player');}}>Player</button>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{setWkSess(null);setPlayerIdx(0);setTrainView('overview');}}>Cancel</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:10}}>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Workout Type</div>
            <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{formatWorkoutTypeLabel(wkSess)}</div>
          </div>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Execution Progress</div>
            <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{activeWorkoutProgress.doneSets} / {activeWorkoutProgress.totalSets||0} {activeWorkoutProgressLabel}</div>
          </div>
        </div>
        <WorkoutSectionPreview title="Warm-Up" color={C.navy} items={activeWorkoutSections.warmup} type="timed"/>
        <WorkoutFlowRail label="Workout Flow" currentIndex={warmupCount+selectedExerciseIndex}/>
        {restTmr!==null&&<div style={{...S.card,textAlign:'center',padding:'12px',background:C.navyL,borderColor:C.navy}}>
          <div style={{fontSize:10,color:C.navyDk,marginBottom:4}}>{restLabel||'Rest Timer'}</div>
          <div style={{fontSize:28,fontWeight:700,color:C.navyDk}}>{restTmr}s</div>
          <div style={{display:'flex',gap:6,marginTop:10}}>
            <button style={{...S.btnSmall(C.navy),flex:1}} onClick={()=>setRestTmr(t=>Math.max((t||0)+30,30))}>Add 30 sec</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>{setRestTmr(null);setRestLabel('');}}>Skip Rest</button>
          </div>
        </div>}
        {grouped.map(group=>group.items.length===2
          ?<div key={group.key} style={{...S.card,padding:'12px',borderLeft:`3px solid ${C.amber}`}}>
            <div style={{fontSize:10,color:C.amberDk,fontWeight:700,letterSpacing:'0.6px',textTransform:'uppercase',marginBottom:8}}>Superset</div>
            {group.items.map(({ex,idx},n)=><div key={ex.id} style={{marginBottom:n===0?12:0}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{n===0?'A1':'A2'}</div>
              <SessionExerciseCard ex={ex} ei={idx}/>
            </div>)}
            <button style={{...S.btnSmall(C.amber),width:'100%'}} onClick={()=>startRest(Math.max(group.items[0].ex.defaultRest,group.items[1].ex.defaultRest),'Superset round rest')}>Start Round Rest</button>
          </div>
          :<SessionExerciseCard key={group.key} ex={group.items[0].ex} ei={group.items[0].idx}/>
        )}
        <WorkoutSectionPreview title="Cooldown" color={C.sage} items={activeWorkoutSections.cooldown} type="timed"/>
        <button style={S.btnSolid(wkSess?.type==='recovery'?C.sage:C.navy)} onClick={finishWk}>{completeWorkoutLabel}</button>
      </div>;
    }

    if(localView==='player'&&wkSess&&currentFlowItem){
      if(currentFlowItem.kind!=='exercise'){
        const phaseLabel=currentFlowItem.kind==='warmup'?'Warm-Up':'Cooldown';
        const phaseColor=currentFlowItem.kind==='warmup'?C.navy:C.sage;
        return <div style={S.body}>
          <div style={{...S.row,marginBottom:12}}>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>setTrainView('session')}>Back</button>
            <div style={{fontSize:10,color:C.muted}}>{phaseLabel}</div>
          </div>
          <WorkoutFlowRail label="Workout Flow" currentIndex={playerIdx}/>
          <div style={{...S.card,padding:'14px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{phaseLabel}</div>
            <div style={{fontSize:20,fontWeight:700,color:C.tx,marginBottom:10}}>{currentFlowItem.item.name}</div>
            <div style={{fontSize:40,fontWeight:300,color:phaseColor,margin:'12px 0'}}>{currentFlowItem.item.duration}s</div>
            <div style={{display:'flex',gap:8}}>
              <button style={{...S.btnSmall(phaseColor),flex:1}} onClick={()=>startRest(currentFlowItem.item.duration,currentFlowItem.item.name)}>Start Timer</button>
              <button style={{...S.btnGhost,flex:1}} onClick={()=>setPlayerIdx(i=>Math.min(playerFlow.length-1,i+1))}>Next</button>
            </div>
          </div>
        </div>;
      }
      const history=getExerciseHistorySummary(workoutHistory,currentExercise.n);
      const playerRecoveryStyle=isRecoveryStyleExercise(currentExercise)||wkSess?.type==='recovery';
      const playerAccent=playerRecoveryStyle?C.sage:C.navy;
      const playerAccentL=playerRecoveryStyle?C.sageL:C.navyL;
      const playerAccentDk=playerRecoveryStyle?C.sageDk:C.navyDk;
      const hasDemo=hasExerciseDemo(resolveExerciseDefinition(currentExercise.exerciseId||currentExercise.n).media);
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:10}}>
          <button style={{...S.btnGhost,fontSize:11}} onClick={()=>setTrainView('session')}>Back</button>
          <div style={{fontSize:10,color:C.muted}}>{wkSess.name}{wkSess.dateKey&&wkSess.dateKey!==TODAY?` · ${wkSess.dateKey}`:''}</div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{...S.row,marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:700,color:C.tx}}>Exercise {currentFlowItem.idx+1} of {(wkSess.ex||[]).length}</span>
            <span style={{fontSize:11,color:C.muted}}>{activeWorkoutProgress.doneSets}/{activeWorkoutProgress.totalSets||0} sets done</span>
          </div>
          <ProgressBar value={currentFlowItem.idx} max={Math.max(1,(wkSess.ex||[]).length)} color={playerAccent}/>
        </div>
        <WorkoutFlowRail label="Workout Flow" currentIndex={playerIdx}/>
        {restTmr!==null&&<div style={{...S.card,textAlign:'center',padding:'12px',background:playerAccentL,borderColor:playerAccent,marginBottom:10}}>
          <div style={{fontSize:10,color:playerAccentDk,marginBottom:4}}>{restLabel||'Rest Timer'}</div>
          <div style={{fontSize:32,fontWeight:700,color:playerAccentDk}}>{restTmr}s</div>
          <div style={{display:'flex',gap:6,marginTop:8}}>
            <button style={{...S.btnSmall(playerAccent),flex:1}} onClick={()=>setRestTmr(t=>Math.max((t||0)+30,30))}>+30s</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>{setRestTmr(null);setRestLabel('');}}>Skip</button>
          </div>
        </div>}
        <div style={{...S.card,padding:'14px'}}>
          <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:4}}>{currentExercise.n}</div>
          <div style={{fontSize:12,color:C.tx2,marginBottom:10}}>{formatExercisePrescription(currentExercise)}</div>
          <div style={{marginBottom:10}}>
            <ExerciseThumbnail exercise={currentExercise} size={'100%'} height={180} radius={14}/>
          </div>
          {(currentExercise.coachingNotes||currentExercise.instructions)&&<div style={{background:C.surf,borderRadius:10,padding:'9px 12px',marginBottom:10}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Coaching cue</div>
            <div style={{fontSize:12,color:C.tx,lineHeight:1.5}}>{currentExercise.coachingNotes||currentExercise.instructions}</div>
          </div>}
          {hasDemo
            ?<button style={{...S.btnSmall(playerAccent),marginBottom:12,display:'inline-flex'}} onClick={()=>setDemoExercise({exerciseId:currentExercise.exerciseId,n:currentExercise.n})}>Open Demo</button>
            :<div style={{fontSize:11,color:C.muted,marginBottom:12}}>No demo available</div>}
          {history&&<div style={{background:C.surf,borderRadius:12,padding:'10px',marginBottom:12}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{playerRecoveryStyle?'Recent completion':'Progression memory'}</div>
            <div style={{fontSize:12,color:C.tx}}>Last time: {history.lastSummary}</div>
            <div style={{fontSize:11,color:C.tx2}}>{playerRecoveryStyle?'Best recent completion':'Best recent set'}: {history.bestSet}</div>
          </div>}
          {(currentExercise.setLogs||[]).map((set,si)=><SetLogEditor key={si} exercise={currentExercise} exerciseIndex={currentFlowItem.idx} set={set} setIndex={si} compact/>)}
          <div style={{display:'flex',gap:6,marginTop:10}}>
            {!playerRecoveryStyle&&<button style={{...S.btnSmall(C.navy),flex:1}} onClick={()=>startRest(currentExercise.defaultRest,`${currentExercise.n} rest`)}>Start Rest</button>}
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setShowSwap(showSwap===currentFlowItem.idx?null:currentFlowItem.idx)}>Swap</button>
          </div>
          {showSwap===currentFlowItem.idx&&<div style={{marginTop:8}}>
            {getSwapCandidates(currentExercise).map(sub=><button key={sub.exerciseId||sub.n} style={{...S.btnGhost,margin:'3px 3px 3px 0',fontSize:11}} onClick={()=>swapExercise(currentFlowItem.idx,sub.exerciseId||sub.n)}>{sub.n}</button>)}
          </div>}
        </div>
        {nextFlowItem&&<div style={{...S.card,padding:'12px'}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Next</div>
          <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{nextFlowItem.title}</div>
          <div style={{fontSize:11,color:C.tx2}}>{nextFlowItem.kind==='exercise'?formatExercisePrescription(nextFlowItem.exercise):`${nextFlowItem.kind==='warmup'?'Warm-Up':'Cooldown'} · ${nextFlowItem.item.duration}s`}</div>
        </div>}
        <div style={{display:'flex',gap:8}}>
          <button style={{...S.btnGhost,flex:1}} disabled={playerIdx===0} onClick={()=>setPlayerIdx(i=>Math.max(0,i-1))}>Previous</button>
          <button style={{...S.btnSmall(C.sage),flex:1}} onClick={()=>setPlayerIdx(i=>Math.min(playerFlow.length-1,i+1))}>{playerIdx===playerFlow.length-1?'Stay Here':'Next'}</button>
        </div>
      </div>;
    }

    if(localView==='run'&&runSess){
      const runSessionDateLabel=runSess.dateKey&&runSess.dateKey!==TODAY?`Started ${runSess.dateKey}`:'Today';
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:12}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{runSess.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{runSess.rd?.label||'Run'} · {runSessionDateLabel}</div>
          </div>
          <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{setRunSess(null);setTrainView('overview');}}>Cancel</button>
        </div>
        <div style={S.card}>
          <div style={{fontSize:13,color:C.muted,marginBottom:8}}>{runSess.rd?.effort}</div>
          <div style={{fontSize:12,color:C.tx}}>Distance: <strong>{runSess.rd?.dist}</strong></div>
          {runSess.adjustmentLabel&&<div style={{fontSize:11,color:C.amberDk,marginTop:6}}>{describeWorkoutAdjustment(runSess)} · {runSess.adjustmentReason}</div>}
          {paceProfile&&<div style={{marginTop:8,display:'flex',gap:10}}>
            <span style={S.pill(C.sageL,C.sageDk)}>Easy: {paceProfile.easy}</span>
            {runSess.intensity==='Hard'&&<span style={S.pill(C.navyL,C.navyDk)}>Int: {paceProfile.interval}</span>}
          </div>}
        </div>
        {(runSess.warmup||[]).length>0&&<div style={S.card}>
          <span style={S.lbl}>Warm-Up</span>
          {(runSess.warmup||[]).map((item,idx)=><div key={item.id||idx} style={{...S.row,padding:'7px 0',borderBottom:idx<(runSess.warmup||[]).length-1?`0.5px solid ${C.bd}`:'none'}}>
            <span style={{fontSize:12,color:C.tx}}>{item.name}</span>
            <button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>startRest(item.duration,item.name)}>{item.duration}s</button>
          </div>)}
        </div>}
        <div style={S.card}>
          <span style={S.lbl}>Log completion</span>
          <FieldInput value={runDist} onChange={e=>setRunDist(e.target.value)} placeholder="Distance (miles)" style={{...S.inp,marginBottom:8}}/>
          <FieldInput value={runDuration} onChange={e=>setRunDuration(e.target.value)} placeholder="Duration (minutes)" style={{...S.inp,marginBottom:8}}/>
          <FieldInput value={runNotes} onChange={e=>setRunNotes(e.target.value)} placeholder="Notes (optional)" style={S.inp}/>
        </div>
        {(runSess.cooldown||[]).length>0&&<div style={S.card}>
          <span style={S.lbl}>Cooldown</span>
          {(runSess.cooldown||[]).map((item,idx)=><div key={item.id||idx} style={{...S.row,padding:'7px 0',borderBottom:idx<(runSess.cooldown||[]).length-1?`0.5px solid ${C.bd}`:'none'}}>
            <span style={{fontSize:12,color:C.tx}}>{item.name}</span>
            <button style={{...S.btnGhost,fontSize:10,padding:'4px 8px'}} onClick={()=>startRest(item.duration,item.name)}>{item.duration}s</button>
          </div>)}
        </div>}
        <button style={S.btnSolid(C.sage)} onClick={()=>finishRun({dist2:runDist,durationMins:runDuration,notes:runNotes})}>Complete Run</button>
      </div>;
    }

    if(localView==='recovery'&&recSess){
      const cur=recSess.moves[recIdx];
      const done=recSess._done;
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:12}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{recSess.name}</div>
          <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{setRecOn(false);setRecSess(null);setTrainView('overview');}}>Close</button>
        </div>
        {done?<div style={{...S.card,textAlign:'center',padding:'30px 14px'}}>
          <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:8}}>Session complete</div>
          <button style={S.btnSolid(C.sage)} onClick={()=>{setRecSess(null);setTrainView('overview');}}>Done</button>
        </div>:<div style={S.card}>
          <div style={{textAlign:'center',marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Move {recIdx+1} of {recSess.moves.length}{cur?.side?` — ${recSecond?'Right':'Left'} side`:''}</div>
            <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:8}}>{cur?.n}</div>
            <div style={{fontSize:48,fontWeight:300,color:recSess.clr,margin:'16px 0'}}>{recTmr}s</div>
            {cur?.note&&<div style={{fontSize:12,color:C.muted,marginBottom:16}}>{cur.note}</div>}
            <button style={S.btnSolid(recSess.clr)} onClick={()=>setRecOn(o=>!o)}>{recOn?'Pause':'Resume'}</button>
          </div>
          <div style={{...S.sep}}/>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {recSess.moves.map((m,i)=><div key={i} style={{width:28,height:28,borderRadius:6,background:i<recIdx?C.sage:i===recIdx?recSess.clr:C.surf,opacity:i<recIdx?0.5:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontSize:9,color:i<=recIdx?C.white:C.muted}}>{i+1}</span>
            </div>)}
          </div>
        </div>}
      </div>;
    }

    return null;
  }

  function MealsScreen(){
    const targets=macros;
    const todayCal=todayN.reduce((s,m)=>s+(m.cal||0),0);
    const todayPro=todayN.reduce((s,m)=>s+(m.pro||0),0);
    const todayCarb=todayN.reduce((s,m)=>s+(m.carb||0),0);
    const todayFat=todayN.reduce((s,m)=>s+(m.fat||0),0);
    const libraryFoods=DEFAULT_FOOD_LIBRARY;
    const customFoods=foodLibrary||[];
    const allLibraryFoods=resolveFoodLibrary(customFoods);
    const foods=allLibraryFoods;
    const pantryItems=(pantryInventory||[]).map(item=>typeof item==='string'?{id:`legacy_${item}`,baseFoodId:item,name:(libraryFoods.find(food=>food.id===item)||{}).name||item,defaultServing:(libraryFoods.find(food=>food.id===item)||{}).unitWeight||100,notes:''}:item);
    const recipeTemplates=(recipes&&recipes.length?recipes:DEFAULT_RECIPE_TEMPLATES);
    const quickTemplates=(quickMealTemplates&&quickMealTemplates.length?quickMealTemplates:DEFAULT_QUICK_MEAL_TEMPLATES);
    const foodMap=useMemo(()=>Object.fromEntries(foods.map(f=>[f.id,f])),[foods]);
    const mealTemplates=useMemo(()=>resolveMealTemplates(profile.mealTemplates,foods),[profile.mealTemplates,foods]);
    const todayMealPlan=getDailyMealPlanEntries(profile.dailyMealPlans,TODAY);
    const yesterdayMealPlan=getDailyMealPlanEntries(profile.dailyMealPlans,addDaysIso(TODAY,-1));
    const pantryFirstSuggestions=getPantryFirstMealSuggestions(mealTemplates,pantryItems).slice(0,4);
    const proteinRemaining=Math.max(0,targets.protein-todayPro);
    const nextProteinTemplate=mealTemplates.slice().sort((a,b)=>(b.macros?.pro||0)-(a.macros?.pro||0))[0]||null;
    const photoInputRef=useRef(null);
    const weeklyMeals=weekDatesGlobal.flatMap(ds=>nutr[ds]||[]);
    const weeklyProteinDays=weekDatesGlobal.filter(ds=>(nutr[ds]||[]).reduce((s,m)=>s+(m.pro||0),0)>=computeMacroTargets(isTrainingDayForDate(ds,athlete?.programType||'4-day',athlete?.preferredTrainingDays,athlete?.trainingWeekStart||'Mon')).protein*0.9).length;
    const weeklyHydrationDays=weekDatesGlobal.filter(ds=>(hydr[ds]||0)>=hydGoal*0.9).length;
    const pantryBaseIdByItemId=Object.fromEntries(pantryItems.map(item=>[item.id,item.baseFoodId||item.foodId||item.id]));
    const usageCountForFood=foodId=>weeklyMeals.filter(m=>m.foodId===foodId||m.foodIds?.includes(foodId)||m.itemIds?.includes(foodId)||pantryBaseIdByItemId[m.pantryItemId]===foodId).length;
    const usageCountForPantryItem=itemId=>weeklyMeals.filter(m=>m.pantryItemId===itemId).length;
    const topFoods=foods.map(food=>{
      const uses=usageCountForFood(food.id);
      return{food,uses};
    }).sort((a,b)=>b.uses-a.uses).slice(0,4);
    const recentFoods=foods.map(food=>{
      const uses=usageCountForFood(food.id);
      return{food,uses};
    }).filter(item=>item.uses>0).sort((a,b)=>b.uses-a.uses).slice(0,5);
    const sortedPantryItems=[...pantryItems].sort((a,b)=>{
      const useDiff=usageCountForPantryItem(b.id)-usageCountForPantryItem(a.id);
      if(useDiff)return useDiff;
      return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
    });
    const sortedRecipes=[...recipeTemplates].sort((a,b)=>{
      const ac=pantryCoverage(a,pantryItems).matched;
      const bc=pantryCoverage(b,pantryItems).matched;
      return bc-ac;
    });
    const [mealMode,setMealMode]=useState('pantry');
    const [pantrySearch,setPantrySearch]=useState('');
    const [librarySearch,setLibrarySearch]=useState('');
    const [nutritionOpen,setNutritionOpen]=useState({today:true,meals:false,pantry:false,library:false,recipes:false});
    const [pantryForm,setPantryForm]=useState({itemId:pantryItems[0]?.id||'',slot:'breakfast'});
    const [ingredientForm,setIngredientForm]=useState({foodId:foods[0]?.id||'',grams:'',units:'',slot:'breakfast'});
    const [quickMeal,setQuickMeal]=useState({name:'Quick meal',slot:'lunch',items:[{foodId:foods[0]?.id||'',grams:'120'},{foodId:foods[1]?.id||'',grams:'150'}]});
    const [recipeState,setRecipeState]=useState({slot:'dinner',recipeId:recipeTemplates[0]?.id||'',servings:'1',grams:''});
    const [showRecipeBuilder,setShowRecipeBuilder]=useState(false);
    const [recipeDraft,setRecipeDraft]=useState({name:'',prepTime:'20',servings:'2',totalCookedWeight:'',isMealPrep:false,instructions:'',ingredients:[{foodId:foods[0]?.id||'',grams:'150'},{foodId:foods[3]?.id||'',grams:'180'}]});
    const [mealPhoto,setMealPhoto]=useState(null);
    const selectedFood=foodMap[ingredientForm.foodId]||foods[0];
    const selectedRecipe=recipeTemplates.find(r=>r.id===recipeState.recipeId)||recipeTemplates[0];
    const selectedRecipeNutrition=selectedRecipe?computeRecipeNutrition(selectedRecipe,foods):null;
    const pantrySearchTerm=pantrySearch.trim().toLowerCase();
    const librarySearchTerm=librarySearch.trim().toLowerCase();
    const filteredLibraryFoods=allLibraryFoods.filter(food=>{
      if(!librarySearchTerm)return true;
      return [food.name,food.category,food.householdMeasure,(food.tags||[]).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(librarySearchTerm);
    });
    const filteredPantryItems=sortedPantryItems.filter(item=>{
      if(!pantrySearchTerm)return true;
      return [item.name,item.notes,item.category,(item.tags||[]).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(pantrySearchTerm);
    });
    const quickPantryItems=sortedPantryItems.slice(0,4);
    const recentMealTemplates=mealTemplates.slice(0,4);
    const suggestedQuickLogSlot=(function(){
      const hour=NOW.getHours();
      if(hour<11)return 'breakfast';
      if(hour<15)return 'lunch';
      if(hour<18)return 'snack';
      return 'dinner';
    })();

    useEffect(()=>{
      if(showManual)setMealMode('pantry');
    },[showManual]);
    useEffect(()=>{
      if(!mealShortcut)return;
      if(mealShortcut.slot)setPantryForm(f=>({...f,slot:mealShortcut.slot}));
      if(mealShortcut.slot)setIngredientForm(f=>({...f,slot:mealShortcut.slot}));
      if(mealShortcut.slot)setQuickMeal(q=>({...q,slot:mealShortcut.slot}));
      if(mealShortcut.slot)setRecipeState(r=>({...r,slot:mealShortcut.slot}));
      setMealMode(mealShortcut.mode||'pantry');
      setMealShortcut(null);
    },[mealShortcut]);

    function readMealPhoto(e){
      const file=e.target.files?.[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=()=>setMealPhoto(typeof reader.result==='string'?reader.result:null);
      reader.readAsDataURL(file);
    }

    function logIngredient(){
      const food=foodMap[ingredientForm.foodId];
      if(!food)return;
      const grams=gramsFromFoodInput(food,ingredientForm.grams,ingredientForm.units);
      if(!grams)return;
      const macros=scaleFoodMacros(food,grams);
      addMeal({
        meal:food.name,
        foodId:food.id,
        source:'ingredient',
        grams:Math.round(grams),
        cal:macros.cal,
        pro:macros.pro,
        carb:macros.carb,
        fat:macros.fat,
        fiber:macros.fiber,
        sodium:macros.sodium,
        photo:mealPhoto,
      },ingredientForm.slot);
      setIngredientForm(f=>({...f,grams:'',units:''}));
      setMealPhoto(null);
      setShowManual(false);
    }

    function saveDailyMealPlan(dateStr,entries){
      updateProfile(p=>({...p,dailyMealPlans:{...(p.dailyMealPlans||{}),[dateStr]:entries}}));
    }

    function planMealTemplate(template,slotOverride,dateStr=TODAY){
      if(!template)return;
      const slot=slotOverride||template.mealType||'lunch';
      const current=getDailyMealPlanEntries(profile.dailyMealPlans,dateStr);
      const entry={
        id:`meal-plan-${Date.now()}`,
        templateId:template.id,
        slot,
        date:dateStr,
        plannedFor:dateStr,
        status:'planned',
        createdAt:new Date().toISOString(),
        name:template.name,
      };
      saveDailyMealPlan(dateStr,[...current,entry]);
      trackGrowthEvent('meal_planned',{slot,date:dateStr});
      showNotif(`${template.name} planned for ${(MEAL_SLOTS.find(item=>item.id===slot)||{}).label||slot}`,'success');
    }

    function removePlannedMeal(entryId,dateStr=TODAY){
      saveDailyMealPlan(dateStr,getDailyMealPlanEntries(profile.dailyMealPlans,dateStr).filter(entry=>entry.id!==entryId));
    }

    function logMealTemplate(template,slotOverride,planEntry){
      const mealLog=buildMealLogFromTemplate(template,slotOverride,{plannedMealId:planEntry?.id||null});
      if(!mealLog)return;
      addMeal(mealLog,slotOverride||planEntry?.slot||template.mealType||'snack');
      if(planEntry){
        saveDailyMealPlan(TODAY,getDailyMealPlanEntries(profile.dailyMealPlans,TODAY).map(entry=>entry.id===planEntry.id?{...entry,status:'logged',loggedAt:new Date().toISOString()}:entry));
      }
    }

    function repeatMealPlan(target){
      const todaysEntries=getDailyMealPlanEntries(profile.dailyMealPlans,TODAY);
      if(todaysEntries.length===0){
        showNotif('Plan meals for today first.','warn');
        return;
      }
      if(target==='tomorrow'){
        saveDailyMealPlan(addDaysIso(TODAY,1),cloneMealPlanEntries(todaysEntries,addDaysIso(TODAY,1)));
        trackGrowthEvent('meal_planned',{slot:'multiple',date:addDaysIso(TODAY,1)});
        showNotif('Meal plan copied to tomorrow.','success');
        return;
      }
      if(target==='weekdays'){
        const nextEntries=['1','2','3','4','5'].map(offset=>{
          const dateStr=addDaysIso(TODAY,parseInt(offset,10));
          const day=new Date(dateStr+'T12:00:00').getDay();
          return day>=1&&day<=5?{dateStr,entries:cloneMealPlanEntries(todaysEntries,dateStr)}:null;
        }).filter(Boolean);
        updateProfile(p=>({
          ...p,
          dailyMealPlans:nextEntries.reduce((acc,item)=>({...acc,[item.dateStr]:item.entries}),{...(p.dailyMealPlans||{})}),
        }));
        trackGrowthEvent('meal_planned',{slot:'multiple',date:'weekdays'});
        showNotif('Meal plan repeated for upcoming weekdays.','success');
      }
    }

    function duplicateYesterdayPlan(){
      if(yesterdayMealPlan.length===0){
        showNotif('No meal plan found yesterday.','warn');
        return;
      }
      saveDailyMealPlan(TODAY,cloneMealPlanEntries(yesterdayMealPlan,TODAY));
      trackGrowthEvent('meal_planned',{slot:'multiple',date:TODAY});
      showNotif('Yesterday’s meal plan copied to today.','success');
    }

    function logQuickMeal(){
      const items=quickMeal.items.map(item=>{
        const food=foodMap[item.foodId];
        const grams=parseFloat(item.grams)||0;
        return food&&grams>0?{food,grams,macros:scaleFoodMacros(food,grams)}:null;
      }).filter(Boolean);
      if(items.length===0)return;
      const total=items.reduce((acc,item)=>({
        cal:acc.cal+item.macros.cal,
        pro:acc.pro+item.macros.pro,
        carb:acc.carb+item.macros.carb,
        fat:acc.fat+item.macros.fat,
        grams:acc.grams+item.grams,
      }),{cal:0,pro:0,carb:0,fat:0,grams:0});
      addMeal({
        meal:quickMeal.name||'Quick meal',
        source:'quick-meal',
        foodId:items[0]?.food.id||null,
        foodIds:items.map(item=>item.food.id),
        grams:Math.round(total.grams),
        cal:Math.round(total.cal),
        pro:roundMacro(total.pro),
        carb:roundMacro(total.carb),
        fat:roundMacro(total.fat),
        photo:mealPhoto,
      },quickMeal.slot);
      setMealPhoto(null);
    }

    function cookRecipe(){
      if(!selectedRecipe||!selectedRecipeNutrition)return;
      const servings=Math.max(parseFloat(recipeState.servings)||1,1);
      const grams=parseFloat(recipeState.grams)||0;
      if(selectedRecipeNutrition.perServing.grams<=0){
        showNotif('Recipe serving size is invalid. Update the recipe first.','warn');
        return;
      }
      const servingFactor=grams>0?(grams/Math.max(selectedRecipeNutrition.perServing.grams,1)):servings;
      addMeal({
        meal:selectedRecipe.name,
        recipeId:selectedRecipe.id,
        source:'recipe',
        grams:grams>0?Math.round(grams):Math.round(selectedRecipeNutrition.perServing.grams*servings),
        cal:Math.round(selectedRecipeNutrition.perServing.cal*servingFactor),
        pro:roundMacro(selectedRecipeNutrition.perServing.pro*servingFactor),
        carb:roundMacro(selectedRecipeNutrition.perServing.carb*servingFactor),
        fat:roundMacro(selectedRecipeNutrition.perServing.fat*servingFactor),
        photo:mealPhoto,
      },recipeState.slot);
      setMealPhoto(null);
    }

    function saveRecipeTemplate(){
      const rawInstructions=recipeDraft.instructions.split('\n').map(s=>s.trim()).filter(Boolean);
      if((recipeDraft.ingredients||[]).length>5){
        showNotif('Recipes are limited to 5 ingredients.','warn');
        return;
      }
      if(rawInstructions.length>5){
        showNotif('Recipes are limited to 5 steps.','warn');
        return;
      }
      const validIngredients=(recipeDraft.ingredients||[]).filter(item=>item.foodId&&(parseFloat(item.grams)||0)>0).slice(0,5);
      if(!recipeDraft.name||validIngredients.length===0)return;
      const prepTime=recipeDraft.isMealPrep?Math.max(parseInt(recipeDraft.prepTime)||30,20):Math.min(parseInt(recipeDraft.prepTime)||20,30);
      const entry={
        id:`recipe_${Date.now()}`,
        name:recipeDraft.name,
        ingredients:validIngredients.map(item=>({foodId:item.foodId,grams:parseFloat(item.grams)})),
        totalCookedWeight:parseFloat(recipeDraft.totalCookedWeight)||validIngredients.reduce((s,i)=>s+(parseFloat(i.grams)||0),0),
        servings:Math.max(parseInt(recipeDraft.servings)||1,1),
        prepTime,
        isMealPrep:!!recipeDraft.isMealPrep,
        instructions:rawInstructions,
      };
      updateProfile(p=>({...p,recipes:[...(p.recipes||[]),entry]}));
      setRecipeDraft({name:'',prepTime:'20',servings:'2',totalCookedWeight:'',isMealPrep:false,instructions:'',ingredients:[{foodId:foods[0]?.id||'',grams:'150'},{foodId:foods[3]?.id||'',grams:'180'}]});
      setShowRecipeBuilder(false);
      setRecipeState(s=>({...s,recipeId:entry.id}));
    }

    function pantryEntryFromFood(food,existing){
      const name=prompt('Pantry item name',existing?.name||food.name);
      if(name===null)return null;
      const defaultServingInput=prompt('Default serving size in grams',String(existing?.defaultServing||food.unitWeight||100));
      if(defaultServingInput===null)return null;
      const notes=prompt('Notes (optional)',existing?.notes||'');
      if(notes===null)return null;
      const category=prompt('Category (optional)',existing?.category||food.category||'');
      if(category===null)return null;
      const tagsInput=prompt('Tags (optional, comma separated)',existing?.tags?.join(', ')||'');
      if(tagsInput===null)return null;
      const caloriesInput=prompt('Calories per 100g override (optional)',existing?.caloriesOverride==null?'':String(existing.caloriesOverride));
      if(caloriesInput===null)return null;
      const proteinInput=prompt('Protein per 100g override (optional)',existing?.proteinOverride==null?'':String(existing.proteinOverride));
      if(proteinInput===null)return null;
      const carbsInput=prompt('Carbs per 100g override (optional)',existing?.carbohydratesOverride==null?'':String(existing.carbohydratesOverride));
      if(carbsInput===null)return null;
      const fatInput=prompt('Fat per 100g override (optional)',existing?.fatOverride==null?'':String(existing.fatOverride));
      if(fatInput===null)return null;
      return{
        id:existing?.id||`pantry_${Date.now()}`,
        baseFoodId:food.id,
        name:name.trim()||food.name,
        defaultServing:Math.max(parseFloat(defaultServingInput)||food.unitWeight||100,1),
        notes:(notes||'').trim(),
        category:(category||food.category||'').trim(),
        tags:(tagsInput||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,6),
        caloriesOverride:caloriesInput===''?null:Math.max(parseFloat(caloriesInput)||0,0),
        proteinOverride:proteinInput===''?null:Math.max(parseFloat(proteinInput)||0,0),
        carbohydratesOverride:carbsInput===''?null:Math.max(parseFloat(carbsInput)||0,0),
        fatOverride:fatInput===''?null:Math.max(parseFloat(fatInput)||0,0),
        updatedAt:TODAY,
      };
    }

    function buildPantryFood(item){
      const base=foodMap[item.baseFoodId]||{};
      return{
        id:item.id,
        name:item.name||base.name||'Pantry item',
        category:item.category||base.category||'Custom',
        calories:item.caloriesOverride==null?(base.calories||0):item.caloriesOverride,
        protein:item.proteinOverride==null?(base.protein||0):item.proteinOverride,
        carbohydrates:item.carbohydratesOverride==null?(base.carbohydrates||0):item.carbohydratesOverride,
        fat:item.fatOverride==null?(base.fat||0):item.fatOverride,
        fiber:base.fiber||0,
        sodium:base.sodium||0,
        unitWeight:item.defaultServing||base.unitWeight||100,
        unitLabel:'serving',
        householdMeasure:item.notes||base.householdMeasure||'Pantry serving',
      };
    }

    function addPantryFromFood(food){
      const existing=pantryItems.find(item=>item.baseFoodId===food.id);
      const entry=pantryEntryFromFood(food,existing);
      if(!entry)return;
      updateProfile(p=>{
        const current=(p.pantryInventory||[]).filter(item=>typeof item==='string'||((item.baseFoodId||item.foodId)!==food.id&&item.id!==entry.id));
        return {...p,pantryInventory:[...current.filter(item=>typeof item!=='string'),entry]};
      });
    }

    function editPantryItem(item){
      const base=foodMap[item.baseFoodId]||buildPantryFood(item);
      const updated=pantryEntryFromFood(base,item);
      if(!updated)return;
      updateProfile(p=>({...p,pantryInventory:(p.pantryInventory||[]).map(entry=>typeof entry==='string'?entry:(entry.id===item.id?updated:entry))}));
    }

    function deletePantryItem(itemId){
      if(!confirm('Remove this pantry item?'))return;
      updateProfile(p=>({...p,pantryInventory:(p.pantryInventory||[]).filter(entry=>typeof entry==='string'?true:entry.id!==itemId)}));
    }

    function addCustomFood(){
      const name=prompt('Food name');
      if(name===null||!name.trim())return;
      const caloriesInput=prompt('Calories per 100g','0');
      if(caloriesInput===null)return;
      const proteinInput=prompt('Protein per 100g','0');
      if(proteinInput===null)return;
      const carbsInput=prompt('Carbs per 100g','0');
      if(carbsInput===null)return;
      const fatInput=prompt('Fat per 100g','0');
      if(fatInput===null)return;
      const servingInput=prompt('Default serving size in grams','100');
      if(servingInput===null)return;
      const category=prompt('Category (optional)','Custom');
      if(category===null)return;
      const tagsInput=prompt('Tags (optional, comma separated)','');
      if(tagsInput===null)return;
      const householdMeasure=prompt('Household measure (optional)','');
      if(householdMeasure===null)return;
      const entry={
        id:`custom_food_${Date.now()}`,
        name:name.trim(),
        category:(category||'Custom').trim(),
        calories:Math.max(parseFloat(caloriesInput)||0,0),
        protein:Math.max(parseFloat(proteinInput)||0,0),
        carbohydrates:Math.max(parseFloat(carbsInput)||0,0),
        fat:Math.max(parseFloat(fatInput)||0,0),
        fiber:0,
        sodium:0,
        unitWeight:Math.max(parseFloat(servingInput)||100,1),
        unitLabel:'serving',
        householdMeasure:(householdMeasure||'').trim(),
        tags:(tagsInput||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,6),
      };
      updateProfile(p=>({...p,foodLibrary:[...(p.foodLibrary||[]),entry]}));
      setIngredientForm(f=>({...f,foodId:entry.id}));
      setLibrarySearch(entry.name);
      showNotif(`${entry.name} added to Add Foods. Add it to Pantry when you're ready.`,'success');
    }

    function quickLogPantryItem(item,slot=pantryForm.slot||ingredientForm.slot||suggestedQuickLogSlot){
      const pantryFood=buildPantryFood(item);
      const grams=item.defaultServing||pantryFood.unitWeight||100;
      if(!(grams>0)){
        showNotif('Set a default serving before using Quick Add.','warn');
        return;
      }
      const macros=scaleFoodMacros(pantryFood,grams);
      addMeal({
        meal:item.name,
        pantryItemId:item.id,
        source:'pantry',
        grams:Math.round(grams),
        cal:macros.cal,
        pro:macros.pro,
        carb:macros.carb,
        fat:macros.fat,
        fiber:macros.fiber,
        sodium:macros.sodium,
      },slot);
      showNotif(`${item.name} logged to ${(MEAL_SLOTS.find(s=>s.id===slot)||{label:slot}).label}`,'success',`${Math.round(grams)}g default serving`);
    }

    function logPantryFood(){
      const item=pantryItems.find(entry=>entry.id===pantryForm.itemId);
      if(!item)return;
      quickLogPantryItem(item,pantryForm.slot);
      setShowManual(false);
    }

    function logSavedMealTemplate(tpl){
      if(!tpl)return;
      const resolvedTemplate=mealTemplates.find(template=>template.id===tpl.id);
      if(resolvedTemplate){
        logMealTemplate(resolvedTemplate,tpl.slot||resolvedTemplate.mealType);
        return;
      }
      addMeal({
        meal:tpl.name,
        source:'saved-meal',
        foodId:(tpl.foodIds||tpl.itemIds||[])[0]||null,
        foodIds:tpl.foodIds||tpl.itemIds||[],
        cal:tpl.cal||0,
        pro:tpl.pro||0,
        carb:tpl.carb||0,
        fat:tpl.fat||0,
      },tpl.slot||'lunch');
    }
    function repeatLatestMealForSlot(slotId){
      const recentEntry=Object.entries(nutr||{})
        .flatMap(([date,entries])=>(entries||[]).filter(entry=>entry.slot===slotId).map(entry=>({...entry,date})))
        .sort((a,b)=>b.date.localeCompare(a.date)||((b.id||0)-(a.id||0)))[0];
      if(!recentEntry){
        showNotif(`No recent ${slotId} entry found.`,'warn');
        return;
      }
      addMeal({
        meal:recentEntry.meal,
        foodId:recentEntry.foodId,
        pantryItemId:recentEntry.pantryItemId,
        recipeId:recentEntry.recipeId,
        source:'repeat-last',
        foodIds:recentEntry.foodIds||recentEntry.itemIds||[],
        grams:recentEntry.grams||0,
        cal:recentEntry.cal||0,
        pro:recentEntry.pro||0,
        carb:recentEntry.carb||0,
        fat:recentEntry.fat||0,
        fiber:recentEntry.fiber||0,
        sodium:recentEntry.sodium||0,
        photo:recentEntry.photo||null,
      },slotId);
      showNotif(`Repeated ${recentEntry.meal}`,'success');
    }

    function toggleNutritionSection(id){
      setNutritionOpen(prev=>({...prev,[id]:!prev[id]}));
    }

    function openMealTemplate(tpl){
      setQuickMeal(q=>({...q,name:tpl.name,slot:tpl.slot||q.slot,items:(tpl.foodIds||tpl.itemIds||[]).slice(0,4).map(id=>({foodId:id,grams:'100'}))}));
      setMealMode('quick');
      setNutritionOpen(prev=>({...prev,today:true,meals:true}));
    }

    function SectionCard({id,title,subtitle,preview,actions,children}){
      const open=!!nutritionOpen[id];
      return <div style={S.card}>
        <div style={{...S.row,alignItems:'center',gap:G.md}}>
          <div onClick={()=>toggleNutritionSection(id)} style={{flex:1,minWidth:0,cursor:'pointer'}}>
            <div style={{...S.row,alignItems:'center',gap:G.md}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={S.cardTitle}>{title}</div>
                {subtitle&&<div style={{...S.micro,marginTop:2}}>{subtitle}</div>}
              </div>
              <div style={{fontSize:T.card,color:C.muted,flexShrink:0,lineHeight:1}}>{open?'−':'+'}</div>
            </div>
            {!open&&preview&&<div style={{marginTop:G.sm}}>{preview}</div>}
          </div>
          {actions&&open&&<div style={{display:'flex',gap:6,flexShrink:0}}>{actions}</div>}
        </div>
        {open&&<div style={{marginTop:G.md}}>{children}</div>}
      </div>;
    }

    const suggestedSlotMeta=MEAL_SLOTS.find(s=>s.id===suggestedQuickLogSlot)||MEAL_SLOTS[0];
    return <div style={S.body}>
      <div style={{...S.card,marginBottom:8}}>
        <div style={{...S.row,marginBottom:8,alignItems:'flex-start'}}>
          <div>
            <div style={S.lbl}>Protein Today</div>
            <div style={{fontSize:22,fontWeight:700,color:todayPro>=targets.protein?C.sageDk:todayPro>=targets.protein*0.5?C.amberDk:C.red,lineHeight:1.1}}>
              {Math.round(todayPro)}<span style={{fontSize:13,fontWeight:400,color:C.muted}}>g / {targets.protein}g</span>
            </div>
          </div>
          <span style={{...S.pill(todayPro>=targets.protein?C.sageL:todayPro>=targets.protein*0.5?C.amberL:C.redL,todayPro>=targets.protein?C.sageDk:todayPro>=targets.protein*0.5?C.amberDk:C.red),marginRight:0,marginBottom:0}}>
            {proteinRemaining>0?`${Math.round(proteinRemaining)}g left`:'Goal met'}
          </span>
        </div>
        <ProgressBar value={todayPro} max={targets.protein} color={todayPro>=targets.protein?C.sage:todayPro>=targets.protein*0.5?C.amber:C.red}/>
        {nextProteinTemplate&&proteinRemaining>0&&<div style={{background:C.surf,borderRadius:10,padding:'8px 10px',marginTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:9,color:C.muted,marginBottom:2}}>High-protein option</div>
            <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{nextProteinTemplate.name}</div>
          </div>
          <span style={S.pill(C.sageL,C.sageDk)}>+{Math.round(nextProteinTemplate.macros?.pro||0)}g</span>
        </div>}
      </div>
      <div style={{...S.card,marginBottom:8}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:6}}>Next Meal</div>
        <div style={{...S.row}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{suggestedSlotMeta.label}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{suggestedSlotMeta.window}</div>
            {nextProteinTemplate&&<div style={{fontSize:11,color:C.tx2,marginTop:3}}>Suggested: {nextProteinTemplate.name} · +{Math.round(nextProteinTemplate.macros?.pro||0)}g protein</div>}
          </div>
          <button style={S.btnSmall(C.sage)} onClick={()=>{setPantryForm(f=>({...f,slot:suggestedQuickLogSlot}));setIngredientForm(f=>({...f,slot:suggestedQuickLogSlot}));}}>Log</button>
        </div>
      </div>
      <SectionCard
        id="today"
        title="Daily Meal Plan"
        subtitle={`${todayMealPlan.length} planned · ${todayN.length} logged · ${todayPro}g protein`}
        preview={<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Protein</div>
            <div style={{fontSize:18,fontWeight:700,color:C.sage}}>{todayPro}g</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{proteinRemaining}g to target</div>
          </div>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Next best meal</div>
            <div style={{fontSize:14,fontWeight:700,color:C.navy}}>{nextProteinTemplate?.name||'Template'}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:2}}>{nextProteinTemplate?.macros?.pro||0}g protein</div>
          </div>
        </div>}
      >
        <div style={{background:C.surf,borderRadius:14,padding:'12px',marginBottom:12}}>
          <div style={{...S.row,marginBottom:10}}>
            <span style={S.lbl}>Quick Plan Actions</span>
            <span style={{fontSize:10,color:C.muted}}>Local-first planning</span>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button style={{...S.btnGhost,fontSize:10,padding:'6px 9px'}} onClick={()=>repeatMealPlan('tomorrow')}>Repeat tomorrow</button>
            <button style={{...S.btnGhost,fontSize:10,padding:'6px 9px'}} onClick={()=>repeatMealPlan('weekdays')}>Repeat weekdays</button>
            <button style={{...S.btnGhost,fontSize:10,padding:'6px 9px'}} onClick={duplicateYesterdayPlan}>Duplicate yesterday</button>
          </div>
        </div>
        <div style={{background:C.surf,borderRadius:14,padding:'12px',marginBottom:12}}>
          <div style={{...S.row,marginBottom:10}}>
            <span style={S.lbl}>Today’s Plan</span>
            <span style={{fontSize:10,color:C.muted}}>{todayMealPlan.length>0?`${todayMealPlan.length} meal blocks`:'Nothing planned yet'}</span>
          </div>
          {todayMealPlan.length===0&&<div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>Start from a template below, then log from the plan as you execute the day.</div>}
          {todayMealPlan.map(entry=>{
            const template=mealTemplates.find(item=>item.id===entry.templateId);
            const slot=MEAL_SLOTS.find(item=>item.id===entry.slot)||{label:entry.slot||'Meal'};
            const logged=entry.status==='logged';
            return <div key={entry.id} style={{padding:'10px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <div style={{...S.row,alignItems:'flex-start',gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{template?.name||entry.name||'Planned meal'}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{slot.label} · {(template?.macros?.pro||0)}P · {(template?.macros?.carb||0)}C · {(template?.servingSizeGrams||0)}g</div>
                </div>
                <span style={S.pill(logged?C.sageL:C.navyL,logged?C.sageDk:C.navyDk)}>{logged?'Logged':'Planned'}</span>
              </div>
              <div style={{display:'flex',gap:6,marginTop:8}}>
                {!logged&&template&&<button style={{...S.btnGhost,flex:1,fontSize:10,padding:'6px 8px'}} onClick={()=>logMealTemplate(template,entry.slot,entry)}>Log now</button>}
                {template&&<button style={{...S.btnGhost,flex:1,fontSize:10,padding:'6px 8px'}} onClick={()=>planMealTemplate(template,entry.slot,addDaysIso(TODAY,1))}>Plan tomorrow</button>}
                <button style={{...S.btnGhost,flex:1,fontSize:10,padding:'6px 8px',color:C.red,borderColor:C.red}} onClick={()=>removePlannedMeal(entry.id)}>Remove</button>
              </div>
            </div>;
          })}
        </div>
        {todayN.length===0&&<div style={{background:C.surf,borderRadius:12,padding:'10px 12px',marginBottom:12,fontSize:12,color:C.tx2,lineHeight:1.45}}>
          No meals logged yet. Use meal templates, pantry, or recipes to start today.
        </div>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{...S.row,marginBottom:8}}>
              <span style={S.lbl}>Today's Macros</span>
              <span style={{...S.micro,color:trainingFlags.isTrainingDay?C.sage:C.amber}}>{trainingFlags.isTrainingDay?'Training day':'Rest day'}</span>
            </div>
            {[{l:'Calories',v:todayCal,g:targets.calories,u:'kcal',c:C.amber},{l:'Protein',v:todayPro,g:targets.protein,u:'g',c:C.sage},{l:'Carbs',v:todayCarb,g:targets.carbs,u:'g',c:C.navy},{l:'Fat',v:todayFat,g:MACROS.fat,u:'g',c:C.tx2}].map(({l,v,g,u,c})=>
              <div key={l} style={{marginBottom:8}}>
                <div style={{...S.row,marginBottom:3}}>
                  <span style={S.bodyText}>{l}</span>
                  <span style={S.metaText}>{v} / {g}{u}</span>
                </div>
                <ProgressBar value={v} max={g} color={c}/>
              </div>
            )}
          </div>
          <div style={{display:'grid',gap:10}}>
            <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
              <div style={{marginBottom:12}}>
                <span style={S.lbl}>Hydration</span>
                <div style={{display:'flex',alignItems:'baseline',gap:4,marginTop:2}}>
                  <span style={{fontSize:28,fontWeight:700,color:C.tx,lineHeight:1}}>{todayH}</span>
                  <span style={{fontSize:T.body,fontWeight:600,color:C.tx2,lineHeight:1.2}}>oz</span>
                </div>
                <div style={{...S.metaText,marginTop:4}}>Target {hydGoal} oz</div>
              </div>
              <ProgressBar value={todayH} max={hydGoal} color={C.navy}/>
              <div style={{display:'flex',gap:6,marginTop:12}}>
                {[8,12,16].map(oz=><button key={oz} style={{...S.btnGhost,flex:1,fontSize:T.meta,padding:'8px 10px',color:C.tx2}} onClick={()=>addWater(oz)}>+{oz} oz</button>)}
              </div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
              <div style={{...S.row,marginBottom:8}}>
                <span style={S.lbl}>Weekly Consistency</span>
                <span style={S.micro}>7-day view</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div>
                  <div style={S.micro}>Protein target days</div>
                  <div style={{fontSize:18,fontWeight:700,color:C.sage}}>{weeklyProteinDays}/7</div>
                </div>
                <div>
                  <div style={S.micro}>Hydration target days</div>
                  <div style={{fontSize:18,fontWeight:700,color:C.navy}}>{weeklyHydrationDays}/7</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{background:C.surf,borderRadius:14,padding:'12px',marginBottom:12}}>
          <div style={{...S.row,marginBottom:10}}>
            <span style={S.lbl}>Meal Logging</span>
            <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>setShowRecipeBuilder(v=>!v)}>{showRecipeBuilder?'Close recipe builder':'New recipe'}</button>
          </div>
          <div style={{display:'flex',gap:5,overflowX:'auto',marginBottom:12}}>
            {[
              {id:'pantry',label:'Pantry'},
              {id:'quick',label:'Meals'},
              {id:'recipe',label:'Recipes'},
            ].map(item=><button key={item.id} onClick={()=>setMealMode(item.id)} style={{flexShrink:0,padding:'7px 12px',borderRadius:10,border:`0.5px solid ${mealMode===item.id?C.navy:C.bd}`,background:mealMode===item.id?C.navyL:'transparent',color:mealMode===item.id?C.navyDk:C.muted,fontSize:11,fontWeight:mealMode===item.id?600:400,cursor:'pointer'}}>{item.label}</button>)}
          </div>
          {quickPantryItems.length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Saved Foods</div>
            <div style={{display:'flex',gap:6,overflowX:'auto'}}>
              {quickPantryItems.map(item=><button key={item.id} style={{...S.btnGhost,flexShrink:0,fontSize:10,padding:'5px 8px'}} onClick={()=>quickLogPantryItem(item)}>{item.name}</button>)}
            </div>
          </div>}
          {quickPantryItems.length===0&&<div style={{fontSize:10,color:C.muted,marginBottom:8}}>No saved foods yet. Add your first food below to speed up logging.</div>}
          {mealMode==='pantry'&&<div>
          {pantryItems.length===0&&<div style={{background:C.card,borderRadius:12,padding:'10px 12px',marginBottom:8,fontSize:11,color:C.tx2}}>
            No pantry foods yet. Add foods to Pantry below to make logging one tap.
          </div>}
          {pantryItems.length>0&&<>
          <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Your foods</div>
          <FieldSelect value={pantryForm.itemId} onChange={e=>setPantryForm(f=>({...f,itemId:e.target.value}))} style={{...S.inp,marginBottom:8}}>
            {pantryItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </FieldSelect>
          <FieldSelect value={pantryForm.slot} onChange={e=>setPantryForm(f=>({...f,slot:e.target.value}))} style={{...S.inp,marginBottom:8}}>
            {MEAL_SLOTS.map(slot=><option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </FieldSelect>
          <button style={S.btnSolid(C.sage)} onClick={logPantryFood}>Log from Pantry</button>
          </>}
        </div>}
          {mealMode==='ingredient'&&<div>
          {recentFoods.length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Recent foods</div>
            <div style={{display:'flex',gap:6,overflowX:'auto'}}>
              {recentFoods.map(item=><button key={item.food.id} style={{...S.btnGhost,flexShrink:0,fontSize:10,padding:'5px 8px'}} onClick={()=>setIngredientForm(f=>({...f,foodId:item.food.id}))}>{item.food.name}</button>)}
            </div>
          </div>}
          <FieldSelect value={ingredientForm.foodId} onChange={e=>setIngredientForm(f=>({...f,foodId:e.target.value}))} style={{...S.inp,marginBottom:8}}>
            {foods.map(food=><option key={food.id} value={food.id}>{food.name}</option>)}
          </FieldSelect>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <FieldInput value={ingredientForm.grams} onChange={e=>setIngredientForm(f=>({...f,grams:e.target.value}))} placeholder="Grams" style={S.inp} type="number"/>
            <FieldInput value={ingredientForm.units} onChange={e=>setIngredientForm(f=>({...f,units:e.target.value}))} placeholder={selectedFood?.unitLabel?`${selectedFood.unitLabel}s`:'Units'} style={S.inp} type="number"/>
          </div>
          <FieldSelect value={ingredientForm.slot} onChange={e=>setIngredientForm(f=>({...f,slot:e.target.value}))} style={{...S.inp,marginBottom:8}}>
            {MEAL_SLOTS.map(slot=><option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </FieldSelect>
          {selectedFood&&<div style={{background:C.surf,borderRadius:12,padding:'10px 12px',marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:600,color:C.tx,marginBottom:3}}>{selectedFood.name}</div>
            <div style={{fontSize:10,color:C.muted}}>Per 100g · {selectedFood.calories} kcal · {selectedFood.protein}P · {selectedFood.carbohydrates}C · {selectedFood.fat}F</div>
            {selectedFood.householdMeasure&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{selectedFood.householdMeasure}</div>}
            {ingredientForm.grams&&(()=>{const g=gramsFromFoodInput(selectedFood,ingredientForm.grams,ingredientForm.units)||0;if(!g)return null;const m=scaleFoodMacros(selectedFood,g);return <div style={{marginTop:6,paddingTop:6,borderTop:`0.5px solid ${C.bd}`,display:'flex',gap:10}}>
              <div style={{flex:1}}><div style={{fontSize:9,color:C.muted}}>Protein</div><div style={{fontSize:13,fontWeight:700,color:C.sageDk}}>{Math.round(m.pro)}g</div></div>
              <div style={{flex:1}}><div style={{fontSize:9,color:C.muted}}>Calories</div><div style={{fontSize:13,fontWeight:700,color:C.tx}}>{Math.round(m.cal)}</div></div>
              <div style={{flex:1}}><div style={{fontSize:9,color:C.muted}}>Carbs</div><div style={{fontSize:13,fontWeight:700,color:C.tx}}>{Math.round(m.carb)}g</div></div>
              <div style={{flex:1}}><div style={{fontSize:9,color:C.muted}}>Fat</div><div style={{fontSize:13,fontWeight:700,color:C.tx}}>{Math.round(m.fat)}g</div></div>
            </div>;})()}
          </div>}
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>photoInputRef.current?.click()}>{mealPhoto?'Photo attached':'Attach Photo'}</button>
            {mealPhoto&&<button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>setMealPhoto(null)}>Remove Photo</button>}
          </div>
          <button style={S.btnSolid(C.sage)} onClick={logIngredient}>Log Food</button>
        </div>}
          {mealMode==='quick'&&<div>
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Saved meals</div>
            <div style={{display:'flex',gap:6,overflowX:'auto'}}>
              {quickTemplates.map(tpl=><button key={tpl.id} style={{...S.btnGhost,flexShrink:0,fontSize:10,padding:'5px 8px'}} onClick={()=>logSavedMealTemplate(tpl)}>
                {tpl.name}
              </button>)}
            </div>
          </div>
          <FieldInput value={quickMeal.name} onChange={e=>setQuickMeal(q=>({...q,name:e.target.value}))} placeholder="Meal name" style={{...S.inp,marginBottom:8}}/>
          {quickMeal.items.map((item,idx)=><div key={idx} style={{display:'grid',gridTemplateColumns:'1.4fr 0.8fr',gap:8,marginBottom:8}}>
            <FieldSelect value={item.foodId} onChange={e=>setQuickMeal(q=>({...q,items:q.items.map((entry,i)=>i===idx?{...entry,foodId:e.target.value}:entry)}))} style={S.inp}>
              {foods.map(food=><option key={food.id} value={food.id}>{food.name}</option>)}
            </FieldSelect>
            <FieldInput value={item.grams} onChange={e=>setQuickMeal(q=>({...q,items:q.items.map((entry,i)=>i===idx?{...entry,grams:e.target.value}:entry)}))} placeholder="Grams" style={S.inp} type="number"/>
          </div>)}
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <FieldSelect value={quickMeal.slot} onChange={e=>setQuickMeal(q=>({...q,slot:e.target.value}))} style={{...S.inp,flex:1}}>
              {MEAL_SLOTS.map(slot=><option key={slot.id} value={slot.id}>{slot.label}</option>)}
            </FieldSelect>
            <button style={{...S.btnGhost,flexShrink:0}} onClick={()=>setQuickMeal(q=>q.items.length>=4?q:{...q,items:[...q.items,{foodId:foods[0]?.id||'',grams:'100'}]})}>+ Food</button>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>photoInputRef.current?.click()}>{mealPhoto?'Photo attached':'Attach Photo'}</button>
            {mealPhoto&&<button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>setMealPhoto(null)}>Remove Photo</button>}
          </div>
          <button style={S.btnSolid(C.amber)} onClick={logQuickMeal}>Log Meal</button>
        </div>}
          {mealMode==='recipe'&&selectedRecipe&&selectedRecipeNutrition&&<div>
          <FieldSelect value={recipeState.recipeId} onChange={e=>setRecipeState(r=>({...r,recipeId:e.target.value,grams:'',servings:'1'}))} style={{...S.inp,marginBottom:8}}>
            {sortedRecipes.map(recipe=>{
              const coverage=pantryCoverage(recipe,pantryItems);
              return <option key={recipe.id} value={recipe.id}>{recipe.name}{coverage.ready?' · Pantry ready':''}</option>;
            })}
          </FieldSelect>
          <div style={{background:C.surf,borderRadius:12,padding:'10px 12px',marginBottom:8}}>
            <div style={{...S.row,marginBottom:4,alignItems:'flex-start'}}>
              <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{selectedRecipe.name}</div>
              <div style={{display:'flex',gap:4,flexShrink:0}}>
                {selectedRecipe.isMealPrep&&<span style={S.pill(C.amberL,C.amberDk)}>Batch prep</span>}
                <span style={{fontSize:10,color:C.muted}}>{selectedRecipe.prepTime} min</span>
              </div>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>
              Per serving · {selectedRecipeNutrition.perServing.cal} kcal · <strong style={{color:C.sageDk}}>{selectedRecipeNutrition.perServing.pro}g protein</strong> · {selectedRecipeNutrition.perServing.carb}g carbs · {selectedRecipeNutrition.perServing.fat}g fat
            </div>
            <div style={{fontSize:10,color:C.muted}}>
              {selectedRecipe.ingredients.map(ing=>`${foodMap[ing.foodId]?.name||ing.foodId} ${ing.grams}g`).join(' · ')}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
            <FieldSelect value={recipeState.slot} onChange={e=>setRecipeState(r=>({...r,slot:e.target.value}))} style={S.inp}>
              {MEAL_SLOTS.map(slot=><option key={slot.id} value={slot.id}>{slot.label}</option>)}
            </FieldSelect>
            <FieldInput value={recipeState.servings} onChange={e=>setRecipeState(r=>({...r,servings:e.target.value}))} placeholder="Servings" style={S.inp} type="number"/>
            <FieldInput value={recipeState.grams} onChange={e=>setRecipeState(r=>({...r,grams:e.target.value}))} placeholder="Or grams" style={S.inp} type="number"/>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>photoInputRef.current?.click()}>{mealPhoto?'Photo attached':'Attach Photo'}</button>
            {mealPhoto&&<button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>setMealPhoto(null)}>Remove Photo</button>}
          </div>
          <button style={S.btnSolid(C.sage)} onClick={cookRecipe}>Log Recipe</button>
        </div>}
        </div>
        {MEAL_SLOTS.map(slot=>{
        const slotMeals=todayN.filter(m=>m.slot===slot.id);
        const slotCal=slotMeals.reduce((s,m)=>s+(m.cal||0),0);
        return <div key={slot.id} style={{background:C.surf,borderRadius:12,padding:'10px 12px',marginBottom:10}}>
          <div style={{...S.row,marginBottom:8}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{slot.label}</div>
              <div style={{fontSize:10,color:C.muted}}>{slot.window}</div>
            </div>
            {slotCal>0&&<span style={S.pill(C.sageL,C.sageDk)}>{slotCal} kcal</span>}
          </div>
          {slotMeals.length===0&&<div style={{fontSize:11,color:C.muted,padding:'4px 0 8px'}}>No {slot.label.toLowerCase()} logged yet.</div>}
          {slotMeals.map(m=><div key={m.id} style={{...S.row,padding:'6px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {m.photo&&<img src={m.photo} alt={m.meal} style={{width:34,height:34,borderRadius:8,objectFit:'cover',flexShrink:0}}/>}
              <div>
              <div style={{fontSize:13,color:C.tx}}>{m.meal}</div>
              <div style={{fontSize:10,color:C.muted}}>{m.cal}kcal · {m.pro}g pro · {m.carb}g carb · {(m.fat||0)}g fat{m.grams?` · ${m.grams}g`:''}</div>
              </div>
            </div>
            <button onClick={()=>rmMeal(m.id)} style={{background:'none',border:'none',color:C.muted,fontSize:16,cursor:'pointer'}}>x</button>
          </div>)}
          <div style={{marginTop:8,display:'flex',gap:6}}>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>repeatLatestMealForSlot(slot.id)}>Repeat last</button>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>{setMealMode('pantry');setPantryForm(f=>({...f,slot:slot.id}));setShowManual(true);}}>Log from Pantry</button>
            <button style={{...S.btnGhost,flex:1,fontSize:11}} onClick={()=>{setMealMode('quick');setQuickMeal(q=>({...q,slot:slot.id}));}}>Log Meal</button>
          </div>
        </div>;
        })}
      </SectionCard>
      <SectionCard
        id="meals"
        title="Meal Templates"
        subtitle={`${mealTemplates.length} reusable templates`}
        preview={<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {recentMealTemplates.map(tpl=><span key={tpl.id} style={S.pill(C.navyL,C.navyDk)}>{tpl.name}</span>)}
        </div>}
      >
        <div style={{display:'grid',gap:10}}>
          {pantryFirstSuggestions.length>0&&<div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{...S.row,marginBottom:8}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:C.tx}}>Pantry-first suggestions</div>
                <div style={{fontSize:10,color:C.muted}}>Templates that best match what you already have</div>
              </div>
              <span style={S.pill(C.sageL,C.sageDk)}>Protein forward</span>
            </div>
            <div style={{display:'grid',gap:8}}>
              {pantryFirstSuggestions.map(({template,coverage})=><div key={template.id} style={{...S.row,background:C.card,borderRadius:10,padding:'8px 10px'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{template.name}</div>
                  <div style={{fontSize:10,color:C.muted}}>{coverage.matched}/{coverage.total} ingredients ready · {template.macros?.pro||0}g protein</div>
                </div>
                <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>planMealTemplate(template,template.mealType)}>Plan</button>
              </div>)}
            </div>
          </div>}
          {mealTemplates.map(tpl=><div key={tpl.id} style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
            <div style={{...S.row,marginBottom:6}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{tpl.name}</div>
                <div style={{fontSize:10,color:C.muted}}>{(tpl.ingredients||[]).map(item=>`${foodMap[item.foodId]?.name||item.foodId} ${item.grams}g`).join(' · ')}</div>
              </div>
              <span style={S.pill(C.navyL,C.navyDk)}>{tpl.mealType}</span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:8}}>{tpl.macros?.cal||0} kcal · {tpl.macros?.pro||0}P · {tpl.macros?.carb||0}C · {tpl.macros?.fat||0}F · {tpl.servingSizeGrams||0}g</div>
            {tpl.batchPrep&&<div style={{fontSize:10,color:C.tx2,marginBottom:8}}>Batch prep: {tpl.batchPrep.totalRecipeWeight}g total · {tpl.batchPrep.servings} servings · {tpl.batchPrep.macrosPerServing.pro}g protein / serving</div>}
            {(tpl.tags||[]).length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
              {tpl.tags.map(tag=><span key={tag} style={S.pill(C.surf,C.tx2)}>{tag}</span>)}
            </div>}
            <div style={{display:'flex',gap:6}}>
              <button style={{...S.btnGhost,flex:1,fontSize:10,padding:'5px 8px'}} onClick={()=>planMealTemplate(tpl,tpl.mealType)}>Plan today</button>
              <button style={{...S.btnGhost,flex:1,fontSize:10,padding:'5px 8px'}} onClick={()=>logMealTemplate(tpl,tpl.mealType)}>Log now</button>
              <button style={{...S.btnGhost,flex:1,fontSize:10,padding:'5px 8px'}} onClick={()=>planMealTemplate(tpl,tpl.mealType,addDaysIso(TODAY,1))}>Tomorrow</button>
            </div>
          </div>)}
          {topFoods.some(item=>item.uses>0)&&<div>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Most used this week</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {topFoods.filter(item=>item.uses>0).map(item=><span key={item.food.id} style={S.pill(C.navyL,C.navyDk)}>{item.food.name} · {item.uses}x</span>)}
            </div>
          </div>}
        </div>
      </SectionCard>
      <SectionCard
        id="pantry"
        title="Saved Foods"
        subtitle={`${pantryItems.length} foods you use often`}
        preview={<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {pantryItems.slice(0,3).map(item=><span key={item.id} style={S.pill(C.sageL,C.sageDk)}>{item.name}</span>)}
        </div>}
      >
        <FieldInput value={pantrySearch} onChange={e=>setPantrySearch(e.target.value)} placeholder="Search saved foods" style={{...S.inp,marginBottom:10}}/>
        {filteredPantryItems.length===0&&<div style={{fontSize:11,color:C.muted}}>No saved foods yet. Add one below or create a custom food.</div>}
        {filteredPantryItems.map(item=>{
          const pantryFood=buildPantryFood(item);
          return <div key={item.id} style={{padding:'9px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <div style={{...S.row,alignItems:'flex-start',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:C.tx,fontWeight:600}}>{item.name}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{pantryFood.calories} kcal / 100g · default {Math.round(item.defaultServing||pantryFood.unitWeight||100)}g</div>
                {item.notes&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>{item.notes}</div>}
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>quickLogPantryItem(item)}>Log Food</button>
                <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>editPantryItem(item)}>Edit</button>
                <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px',color:C.red,borderColor:C.red}} onClick={()=>deletePantryItem(item.id)}>Delete</button>
              </div>
            </div>
          </div>;
        })}
      </SectionCard>
      <SectionCard
        id="library"
        title="Add Foods"
        subtitle={`${allLibraryFoods.length} base foods`}
        preview={<div style={{fontSize:10,color:C.muted}}>Add foods to Pantry or create foods you own.</div>}
        actions={<button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={addCustomFood}>+ Add Custom Food</button>}
      >
        <FieldInput value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Search foods to add" style={{...S.inp,marginBottom:10}}/>
        <div style={{fontSize:10,color:C.muted,marginBottom:8}}>Base foods are standardized and read-only. Add them to Pantry to personalize serving sizes and notes.</div>
        {filteredLibraryFoods.slice(0,20).map(food=>{
          const inPantry=pantryItems.some(item=>(item.baseFoodId||item.foodId)===food.id);
          return <div key={food.id} style={{...S.row,padding:'8px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:C.tx}}>{food.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{food.category} · {food.calories} kcal / 100g · {food.householdMeasure}</div>
            </div>
            <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px',color:inPantry?C.sageDk:C.muted,borderColor:inPantry?C.sage:C.bd,background:inPantry?C.sageL:'transparent'}} onClick={()=>addPantryFromFood(food)}>{inPantry?'Update Pantry':'Add to Pantry'}</button>
          </div>;
        })}
        {filteredLibraryFoods.length===0&&<div style={{fontSize:11,color:C.muted}}>No library foods match your search.</div>}
      </SectionCard>
      <SectionCard
        id="recipes"
        title="Recipes"
        subtitle={`${recipeTemplates.length} saved recipes`}
        preview={<div style={{display:'grid',gap:6}}>
          {sortedRecipes.slice(0,2).map(recipe=>{
            const coverage=pantryCoverage(recipe,pantryItems);
            return <div key={recipe.id} style={{fontSize:11,color:C.tx}}>{recipe.name} <span style={{color:C.muted}}>· {coverage.matched}/{coverage.total} pantry</span></div>;
          })}
        </div>}
        actions={<button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>setShowRecipeBuilder(v=>!v)}>{showRecipeBuilder?'Close Builder':'New Recipe'}</button>}
      >
        {sortedRecipes.slice(0,6).map(recipe=>{
          const nutrition=computeRecipeNutrition(recipe,foods);
          const coverage=pantryCoverage(recipe,pantryItems);
          return <div key={recipe.id} style={{background:C.surf,borderRadius:12,padding:'10px 12px',marginBottom:10}}>
            <div style={{...S.row,marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{recipe.name}</div>
              <span style={S.pill(coverage.ready?C.sageL:C.amberL,coverage.ready?C.sageDk:C.amberDk)}>{coverage.matched}/{coverage.total} in pantry</span>
            </div>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{nutrition.perServing.cal} kcal · {nutrition.perServing.pro}P · {nutrition.perServing.carb}C · {nutrition.perServing.fat}F · {recipe.prepTime} min</div>
            <div style={{fontSize:10,color:C.muted,marginBottom:8}}>{recipe.ingredients.map(ing=>`${foodMap[ing.foodId]?.name||ing.foodId} ${ing.grams}g`).join(' · ')}</div>
            <div style={{display:'flex',gap:6}}>
              <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>{setRecipeState(r=>({...r,recipeId:recipe.id}));setMealMode('recipe');setNutritionOpen(prev=>({...prev,today:true,recipes:true}));}}>Log recipe</button>
            </div>
          </div>;
        })}
        {showRecipeBuilder&&<div style={{background:C.surf,borderRadius:14,padding:'12px'}}>
          <span style={S.lbl}>Simple Recipe Template</span>
          <FieldInput value={recipeDraft.name} onChange={e=>setRecipeDraft(r=>({...r,name:e.target.value}))} placeholder="Recipe name" style={{...S.inp,marginBottom:8}}/>
          {recipeDraft.ingredients.map((item,idx)=><div key={idx} style={{display:'grid',gridTemplateColumns:'1.4fr 0.8fr',gap:8,marginBottom:8}}>
            <FieldSelect value={item.foodId} onChange={e=>setRecipeDraft(r=>({...r,ingredients:r.ingredients.map((entry,i)=>i===idx?{...entry,foodId:e.target.value}:entry)}))} style={S.inp}>
              {foods.map(food=><option key={food.id} value={food.id}>{food.name}</option>)}
            </FieldSelect>
            <FieldInput value={item.grams} onChange={e=>setRecipeDraft(r=>({...r,ingredients:r.ingredients.map((entry,i)=>i===idx?{...entry,grams:e.target.value}:entry)}))} placeholder="Grams" style={S.inp} type="number"/>
          </div>)}
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setRecipeDraft(r=>r.ingredients.length>=5?r:{...r,ingredients:[...r.ingredients,{foodId:foods[0]?.id||'',grams:'100'}]})}>+ Ingredient</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setRecipeDraft(r=>({...r,isMealPrep:!r.isMealPrep}))}>{recipeDraft.isMealPrep?'Meal Prep':'Quick Recipe'}</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
            <FieldInput value={recipeDraft.prepTime} onChange={e=>setRecipeDraft(r=>({...r,prepTime:e.target.value}))} placeholder="Prep min" style={S.inp} type="number"/>
            <FieldInput value={recipeDraft.servings} onChange={e=>setRecipeDraft(r=>({...r,servings:e.target.value}))} placeholder="Servings" style={S.inp} type="number"/>
            <FieldInput value={recipeDraft.totalCookedWeight} onChange={e=>setRecipeDraft(r=>({...r,totalCookedWeight:e.target.value}))} placeholder="Cooked g" style={S.inp} type="number"/>
          </div>
          <FieldTextarea value={recipeDraft.instructions} onChange={e=>setRecipeDraft(r=>({...r,instructions:e.target.value}))} placeholder="One step per line, up to five." rows="4" style={{...S.inp,marginBottom:8,resize:'none'}}/>
          <button style={S.btnSolid(C.navy)} onClick={saveRecipeTemplate}>Save Recipe</button>
        </div>}
      </SectionCard>
      <FieldInput ref={photoInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={readMealPhoto}/>
    </div>;
  }

  function LifestyleScreen({activeTab='habits',onTabChange=()=>{},lifestyleOpen={daily:false,weekly:false},setLifestyleOpen=()=>{}}){
    const homeTab=LIFESTYLE_TAB_IDS.includes(activeTab)?activeTab:'habits';
    const choreKey=TODAY;
    const wkChoreKey=weekKey(NOW);
    const todayChores=choreHistory[choreKey]||{};
    const weekChores=choreHistory[wkChoreKey]||{};

    function toggleDailyChore(id){
      updateProfile(p=>({...p,choreHistory:{...p.choreHistory,[choreKey]:{...(p.choreHistory[choreKey]||{}),[id]:!(p.choreHistory[choreKey]||{})[id]}}}));
    }
    function toggleWeeklyChore(id){
      updateProfile(p=>({...p,choreHistory:{...p.choreHistory,[wkChoreKey]:{...(p.choreHistory[wkChoreKey]||{}),[id]:!(p.choreHistory[wkChoreKey]||{})[id]}}}));
    }
    function markMaintenance(id){
      updateProfile(p=>({...p,maintenanceHistory:{...p.maintenanceHistory,[id]:TODAY}}));
    }
    function addLifestyleItem(){
      const title=prompt('Item name?');if(!title)return;
      const notes=prompt('Notes (optional)','')||'';
      const id='ls_'+Date.now();
      const maxOrder=(lifestyleItems||[]).reduce((m,x)=>Math.max(m,x.order||0),0);
      updateProfile(p=>({...p,lifestyleItems:[...(p.lifestyleItems||[]),{id,title,notes,order:maxOrder+1,archived:false}]}));
    }
    function editLifestyleItem(item){
      const title=prompt('Item name?',item.title);if(!title)return;
      const notes=prompt('Notes (optional)',item.notes||'')||'';
      updateProfile(p=>({...p,lifestyleItems:(p.lifestyleItems||[]).map(x=>x.id===item.id?{...x,title,notes}:x)}));
    }
    function deleteLifestyleItem(id){
      updateProfile(p=>({...p,lifestyleItems:(p.lifestyleItems||[]).filter(x=>x.id!==id)}));
    }

    const activeItems=(lifestyleItems||[]).filter(i=>!i.archived).sort((a,b)=>(a.order||0)-(b.order||0));
    const dailyDone=activeItems.filter(i=>!!todayChores[i.id]).length;
    const weekDone=WEEKLY_CHORES.filter(c=>weekChores[c.id]).length;

    return <div style={S.body}>
      <div style={{display:'flex',gap:4,marginBottom:12,overflowX:'auto'}}>
        {[
          {id:'habits',label:'Habits'},
          {id:'lifestyle',label:'Lifestyle'},
          {id:'routine',label:'Routine'},
        ].map(t=><button key={t.id} style={{flexShrink:0,padding:'7px 12px',borderRadius:10,border:`0.5px solid ${homeTab===t.id?C.sage:C.bd}`,background:homeTab===t.id?C.sageL:'transparent',color:homeTab===t.id?C.sageDk:C.muted,fontSize:11,fontWeight:homeTab===t.id?600:400,cursor:'pointer'}} onClick={()=>onTabChange(t.id)}>{t.label}</button>)}
      </div>

      {homeTab==='habits'&&<div>
        <div style={{...S.row,marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:600,color:C.tx}}>Repeat behaviors</span>
          <button style={S.btnSmall(C.sage)} onClick={()=>{
            const name=prompt('Habit name?');if(!name)return;
            const freq=prompt('Frequency: daily / weekly / x_per_week','daily')||'daily';
            const target=freq==='x_per_week'?parseInt(prompt('Times per week?','3')||'3'):1;
            addHabit({name,frequencyType:freq,targetPerWeek:target});
          }}>+ Habit</button>
        </div>
        {(habits||[]).length===0&&<div style={{textAlign:'center',padding:'24px 0',color:C.muted,fontSize:13}}>No habits yet. Tap + Habit to add one.</div>}
        {(habits||[]).map(h=>{
          const done=(dailyLogs?.[TODAY]?.habitsCompleted||[]).includes(h.id);
          const streak=computeStreak(h,dailyLogs);
          const due=habitDueToday(h,dailyLogs);
          const wkDone=Object.keys(dailyLogs||{}).filter(d=>weekKey(new Date(d+'T12:00:00'))===weekKey(NOW)&&(dailyLogs[d]?.habitsCompleted||[]).includes(h.id)).length;
          return <div key={h.id} style={{...S.card,borderLeft:`3px solid ${done?C.sage:due?C.amber:C.bd}`}}>
            <div style={S.row}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:C.tx,marginBottom:2}}>{h.name}</div>
                <div style={{fontSize:10,color:C.muted}}>
                  {h.frequencyType==='daily'?'Daily':h.frequencyType==='weekly'?'Weekly':`${wkDone}/${h.targetPerWeek||1}x this week`}
                  {streak>0?` · ${streak}d streak`:''}
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {due&&<button onClick={()=>completeHabit(h.id)} style={{...S.btnSmall(done?C.muted:C.sage)}}>{done?'Done':'Mark done'}</button>}
                <button onClick={()=>openEditHabit(h)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>edit</button>
                <button onClick={()=>deleteHabit(h.id)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>x</button>
              </div>
            </div>
          </div>;
        })}
      </div>}

      {homeTab==='lifestyle'&&<div>
        <CollapsibleCard
          title="Daily Lifestyle"
          summary={`${dailyDone}/${activeItems.length} done today`}
          open={lifestyleOpen.daily}
          onToggle={()=>setLifestyleOpen(s=>({...s,daily:!s.daily}))}>
          <div style={{...S.row,marginBottom:8}}>
            <div style={{fontSize:11,color:C.muted}}>{dailyDone}/{activeItems.length} done</div>
            <button style={S.btnSmall(C.sage)} onClick={e=>{e.stopPropagation();addLifestyleItem();}}>+ Item</button>
          </div>
          <ProgressBar value={dailyDone} max={activeItems.length||1}/>
          <div style={{height:10}}/>
          {activeItems.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:C.muted,fontSize:13}}>No items yet. Tap + Item to add one.</div>}
          {activeItems.length>0&&<div style={S.card}>
            {activeItems.map((c,i)=>{
              const done=!!todayChores[c.id];
              return <div key={c.id} style={{...S.row,padding:'10px 0',borderBottom:i<activeItems.length-1?`0.5px solid ${C.bd}`:'none'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:done?C.muted:C.tx,textDecoration:done?'line-through':'none'}}>{c.title}</div>
                  {c.notes&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{c.notes}</div>}
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                  <button onClick={()=>editLifestyleItem(c)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>edit</button>
                  <button onClick={()=>deleteLifestyleItem(c.id)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>x</button>
                  <button onClick={()=>toggleDailyChore(c.id)} style={{width:26,height:26,borderRadius:6,border:`1.5px solid ${done?C.sage:C.bd}`,background:done?C.sage:'transparent',color:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{done?'✓':''}</button>
                </div>
              </div>;
            })}
          </div>}
        </CollapsibleCard>
        <CollapsibleCard
          title="Weekly Lifestyle"
          summary={`${weekDone}/${WEEKLY_CHORES.length} done this week`}
          open={lifestyleOpen.weekly}
          onToggle={()=>setLifestyleOpen(s=>({...s,weekly:!s.weekly}))}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{weekDone}/{WEEKLY_CHORES.length} done</div>
          <div style={S.card}>
            {WEEKLY_CHORES.map((c,i)=>{
              const done=!!weekChores[c.id];
              return <div key={c.id} style={{...S.row,padding:'10px 0',borderBottom:i<WEEKLY_CHORES.length-1?`0.5px solid ${C.bd}`:'none'}}>
                <div>
                  <div style={{fontSize:13,color:done?C.muted:C.tx,textDecoration:done?'line-through':'none'}}>{c.label}</div>
                  {c.dayHint&&<div style={{fontSize:10,color:C.muted}}>{['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][c.dayHint]}</div>}
                </div>
                <button onClick={()=>toggleWeeklyChore(c.id)} style={{width:26,height:26,borderRadius:6,border:`1.5px solid ${done?C.sage:C.bd}`,background:done?C.sage:'transparent',color:C.white,fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{done?'v':''}</button>
              </div>;
            })}
          </div>
        </CollapsibleCard>
      </div>}

      {homeTab==='routine'&&<div>
        <div style={S.card}>
          <span style={S.lbl}>Planning</span>
          <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:6}}>Daily and weekly structure</div>
          <div style={{fontSize:11,color:C.tx2,marginBottom:12}}>Keep routines and planning flows here, separate from body-state tracking.</div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <button style={{...S.btnSmall(C.navy),flex:1}} onClick={()=>openTab('home')}>Open Daily Flow</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>openTab('calendar')}>Open Calendar</button>
          </div>
          <button style={{...S.btnGhost,width:'100%',textAlign:'center'}} onClick={()=>setShowWeeklyPlanner(true)}>Open Weekly Planner</button>
        </div>
        <div style={S.card}>
          <span style={S.lbl}>Low-Recovery Options</span>
          {[
            'Pilates flow',
            'Mobility reset',
            'Light zone-2 cardio',
            'Stretching and foam rolling',
          ].map((item,idx)=><div key={item} style={{padding:'8px 0',borderBottom:idx<3?`0.5px solid ${C.bd}`:'none',fontSize:12,color:C.tx}}>{item}</div>)}
        </div>
      </div>}
    </div>;
  }

  function MaintenanceScreen(){
    function completeMaintenance(id){
      updateProfile(p=>({...p,maintenanceHistory:{...p.maintenanceHistory,[id]:TODAY},maintenanceMeta:{...(p.maintenanceMeta||{}),[id]:{...(p.maintenanceMeta||{})[id],dueDate:null}}}));
    }
    function snoozeMaintenance(id){
      const tomorrow=addDaysIso(TODAY,1);
      updateProfile(p=>({...p,maintenanceMeta:{...(p.maintenanceMeta||{}),[id]:{...(p.maintenanceMeta||{})[id],startDate:tomorrow,dueDate:tomorrow}}}));
    }
    function editMaintenance(item){
      const nextStartDate=prompt('Set start date (YYYY-MM-DD)',item.startDate||TODAY);
      if(!nextStartDate)return;
      const nextDueDate=prompt('Set next due date (YYYY-MM-DD)',item.dueDate||TODAY);
      if(!nextDueDate)return;
      updateProfile(p=>({...p,maintenanceMeta:{...(p.maintenanceMeta||{}),[item.id]:{...(p.maintenanceMeta||{})[item.id],startDate:nextStartDate,dueDate:nextDueDate}}}));
    }
    function formatMaintenanceStatus(item){
      if(item.status==='overdue')return item.daysOverdue>0?`Overdue ${item.daysOverdue}d`:'Overdue';
      if(item.status==='today')return 'Due today';
      if(item.status==='active')return item.dueSoon?`Due soon · ${item.daysUntil}d`:'Active';
      return item.daysUntilStart>0?`Starts in ${item.daysUntilStart}d`:`Upcoming in ${item.daysUntil}d`;
    }
    const mqOverdue=maintenanceQueue.filter(item=>item.status==='overdue');
    const mqToday=maintenanceQueue.filter(item=>item.status==='today');
    const mqActive=maintenanceQueue.filter(item=>item.status==='active');
    const mqUpcoming=maintenanceQueue.filter(item=>item.status==='upcoming');
    const [maintenanceOpen,setMaintenanceOpen]=useState({overdue:mqOverdue.length>0||mqToday.length>0,today:mqOverdue.length>0||mqToday.length>0,active:false,upcoming:false});
    function renderMaintGroup(groupLabel,items,openKey,accent){
      return <CollapsibleCard
        title={groupLabel}
        summary={items.length===0?'No items':`${items.length} item${items.length!==1?'s':''}`}
        open={maintenanceOpen[openKey]}
        onToggle={()=>setMaintenanceOpen(s=>({...s,[openKey]:!s[openKey]}))}
        accent={accent}
        cardStyle={{marginBottom:6}}>
        {items.length===0&&<div style={{fontSize:12,color:C.muted}}>No items in this group.</div>}
        {items.map((item,i)=><div key={item.id} style={{padding:'10px 0',borderBottom:i<items.length-1?`0.5px solid ${C.bd}`:'none'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:C.tx,fontWeight:600}}>{item.label}</div>
              <div style={{fontSize:10,color:item.status==='overdue'?C.red:C.muted,marginTop:2}}>{formatMaintenanceStatus(item)}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.category}</div>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <button style={S.btnSmall(item.status==='overdue'?C.red:C.sage)} onClick={()=>completeMaintenance(item.id)}>Complete</button>
              <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>snoozeMaintenance(item.id)}>Snooze</button>
              <button style={{...S.btnGhost,fontSize:10,padding:'5px 8px'}} onClick={()=>editMaintenance(item)}>Edit</button>
            </div>
          </div>
        </div>)}
      </CollapsibleCard>;
    }

    return <div style={S.body}>
      <div style={S.card}>
        <span style={S.lbl}>Maintenance</span>
        <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:6}}>Operational and personal upkeep</div>
        <div style={{fontSize:11,color:C.tx2}}>Refills, cleaning, replacements, restocks, and scheduled checkups stay here until you clear them.</div>
      </div>
      {renderMaintGroup('Overdue',mqOverdue,'overdue',mqOverdue.length>0?C.red:undefined)}
      {renderMaintGroup('Due Today',mqToday,'today',mqToday.length>0?C.amber:undefined)}
      {renderMaintGroup('Active',mqActive,'active',undefined)}
      {renderMaintGroup('Upcoming',mqUpcoming,'upcoming',undefined)}
    </div>;
  }

  function TasksScreen({activeTab='next',onTabChange=()=>{}}){
    const tasksTab=TASK_TAB_IDS.includes(activeTab)?activeTab:'next';
    const taskTemplates=resolveTaskTemplates(profile.taskTemplates);
    const taskBuckets=getTaskBuckets(taskHistory,TODAY);
    const allTasks=taskBuckets.all;
    const todayTasks=taskBuckets.next;
    const futureTasks=taskBuckets.scheduled;
    const overdueTasks=taskBuckets.overdue;
    const doneTasks=taskBuckets.done;
    const pendingInbox=(inboxItems||[]).filter(x=>x.status==='pending');
    const prioClr={1:C.sage,2:C.amber,3:C.red};
    const dueTodayUnscheduled=todayTasks.filter(task=>!task.scheduledTime);
    const [newTmplName,setNewTmplName]=useState('');
    const [newTmplSubtasks,setNewTmplSubtasks]=useState('');
    const [newTmplTags,setNewTmplTags]=useState('');
    const [newTmplPriority,setNewTmplPriority]=useState(1);
    const timeBlockedTasks=todayTasks.filter(t=>t.scheduledTime);
    const anytimeTasks=todayTasks.filter(t=>!t.scheduledTime);
    const energyNow=dailyLogs?.[TODAY]?.energyScore||null;
    const energyHigh=energyNow!=null?(energyNow>=7):(recoveryToday?.level==='High');
    const energyLow=energyNow!=null?(energyNow<=4):(recoveryToday?.level==='Low');
    const energyTaggedTasks=todayTasks.filter(t=>t.energyLevel&&!t.done);
    const suggestedByEnergy=energyTaggedTasks.length>0
      ?(energyHigh
        ?energyTaggedTasks.filter(t=>t.energyLevel==='high').slice(0,2)
        :energyLow
          ?energyTaggedTasks.filter(t=>t.energyLevel==='low').slice(0,2)
          :todayTasks.filter(t=>!t.done).sort((a,b)=>(b.priority||1)-(a.priority||1)).slice(0,1))
      :[];

    function openTaskComposer(overrides={}){
      setNewTask(createNewTaskDraft(TODAY,overrides));
      setTaskDraftText(overrides.text??'');
      setShowAddTask(true);
    }

    function addTask(){
      if(!taskDraftText.trim())return;
      const t={
        id:String(Date.now()),
        text:taskDraftText.trim(),
        date:newTask.date||TODAY,
        priority:newTask.priority,
        parentId:newTask.parentId,
        done:false,
        status:'active',
        bucket:newTask.bucket||((newTask.date||TODAY)>TODAY?'scheduled':'next'),
        contextTags:(newTask.contextTags||'').split(',').map(item=>item.trim()).filter(Boolean).slice(0,4),
        scheduledTime:newTask.scheduledTime||'',
        endTime:newTask.endTime||'',
        energyLevel:newTask.energyLevel||null,
        updatedAt:new Date().toISOString(),
      };
      updateProfile(p=>({...p,taskHistory:[...p.taskHistory,t]}));
      setNewTask(createNewTaskDraft(TODAY));
      setTaskDraftText('');
      setShowAddTask(false);
    }
    function toggleTask(id){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===id?{...t,done:!t.done,status:!t.done?'done':'active',updatedAt:new Date().toISOString()}:t)}));
    }
    function deleteTask(id){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.filter(t=>t.id!==id&&t.parentId!==id)}));
    }
    function scheduleTask(id,time){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===id?{...t,scheduledTime:time,bucket:'scheduled',updatedAt:new Date().toISOString()}:t)}));
    }
    function rollTask(id){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===id?{...t,date:TODAY,bucket:'next',status:'active',updatedAt:new Date().toISOString()}:t)}));
    }
    function deferTask(id){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===id?{...t,date:addDaysIso(TODAY,1),bucket:'scheduled',scheduledTime:t.scheduledTime||'',updatedAt:new Date().toISOString()}:t)}));
    }
    function dismissTask(id){
      updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===id?{...t,status:'dismissed',updatedAt:new Date().toISOString()}:t)}));
    }
    function addTaskFromTemplate(template){
      if(!template)return;
      const parentId=`task-${Date.now()}`;
      const parentTask={
        id:parentId,
        text:template.text||template.name,
        date:TODAY,
        priority:template.priority||1,
        parentId:null,
        done:false,
        status:'active',
        bucket:template.defaultBucket||'next',
        contextTags:template.contextTags||[],
        scheduledTime:'',
        templateId:template.id,
        updatedAt:new Date().toISOString(),
      };
      const subtasks=(template.subtasks||[]).map((text,idx)=>({
        id:`${parentId}-${idx}`,
        text,
        date:TODAY,
        priority:template.priority||1,
        parentId,
        done:false,
        status:'active',
        bucket:template.defaultBucket||'next',
        contextTags:template.contextTags||[],
        scheduledTime:'',
        templateId:template.id,
        updatedAt:new Date().toISOString(),
      }));
      updateProfile(p=>({...p,taskHistory:[...p.taskHistory,parentTask,...subtasks]}));
      showNotif(`${template.name} added`,'success');
    }
    function reuseTask(task){
      if(!task)return;
      const reuseId=`task-${Date.now()}`;
      const subtasks=allTasks
        .filter(item=>item.parentId===task.id&&item.status!=='dismissed')
        .map((item,idx)=>({
          ...item,
          id:`${reuseId}-${idx}`,
          parentId:reuseId,
          done:false,
          status:'active',
          date:TODAY,
          bucket:'next',
          scheduledTime:'',
          updatedAt:new Date().toISOString(),
        }));
      const nextTask={
        ...task,
        id:reuseId,
        parentId:null,
        done:false,
        status:'active',
        date:TODAY,
        bucket:'next',
        scheduledTime:'',
        updatedAt:new Date().toISOString(),
      };
      updateProfile(p=>({...p,taskHistory:[...p.taskHistory,nextTask,...subtasks]}));
      showNotif(`${task.text} added back to Next Up`,'success');
    }
    function saveNewTemplate(){
      if(!newTmplName.trim())return;
      const tmpl={
        id:`custom-${Date.now()}`,
        name:newTmplName.trim(),
        text:newTmplName.trim(),
        priority:newTmplPriority,
        contextTags:newTmplTags.split(',').map(s=>s.trim()).filter(Boolean),
        subtasks:newTmplSubtasks.split(',').map(s=>s.trim()).filter(Boolean),
        defaultBucket:'next',
      };
      updateProfile(p=>({...p,taskTemplates:[...(p.taskTemplates||[]),tmpl]}));
      setNewTmplName('');setNewTmplSubtasks('');setNewTmplTags('');setNewTmplPriority(1);
      showNotif(`Template "${tmpl.name}" saved`,'success');
    }
    function deleteTemplate(id){
      updateProfile(p=>({...p,taskTemplates:(p.taskTemplates||[]).filter(t=>t.id!==id)}));
      showNotif('Template removed','success');
    }

    function TaskRow({t,indent=0}){
      const subtasks=allTasks.filter(s=>s.parentId===t.id&&s.status!=='dismissed');
      const expanded=expandedTasks[t.id];
      const progress=getTaskProgress(t,allTasks);
      const overdue=!t.done&&t.date<TODAY;
      return <div>
        <div style={{...S.row,padding:'9px 0',paddingLeft:indent*16,borderBottom:`0.5px solid ${C.bd}`}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
            <button onClick={()=>toggleTask(t.id)} style={{width:22,height:22,borderRadius:6,border:`1.5px solid ${t.done?C.sage:prioClr[t.priority]||C.bd}`,background:t.done?C.sage:'transparent',color:C.white,fontSize:11,cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.done?'v':''}</button>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:t.done?C.muted:C.tx,textDecoration:t.done?'line-through':'none'}}>{t.text}</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:2}}>
                {t.rolledFrom&&<span style={{fontSize:9,color:C.amber}}>rolled over</span>}
                {overdue&&<span style={{fontSize:9,color:C.red}}>overdue</span>}
                {t.scheduledTime&&<span style={{fontSize:9,color:C.muted}}>{t.endTime?fmtTimeRange(t.scheduledTime,t.endTime):t.scheduledTime}</span>}
                {t.energyLevel&&<span style={{...S.pill(t.energyLevel==='high'?C.sageL:t.energyLevel==='medium'?C.amberL:C.surf,t.energyLevel==='high'?C.sageDk:t.energyLevel==='medium'?C.amberDk:C.muted),fontSize:8,padding:'2px 6px'}}>{t.energyLevel}</span>}
                {progress&&<span style={{fontSize:9,color:C.muted}}>{progress.completed}/{progress.total} subtasks</span>}
              </div>
              {(t.contextTags||[]).length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:5}}>
                {t.contextTags.map(tag=><span key={tag} style={S.pill(C.surf,C.tx2)}>{tag}</span>)}
              </div>}
            </div>
            {subtasks.length>0&&<button style={{background:'none',border:'none',color:C.muted,fontSize:11,cursor:'pointer'}} onClick={()=>setExpandedTasks(e=>({...e,[t.id]:!e[t.id]}))}>{subtasks.length} {expanded?'up':'dn'}</button>}
          </div>
          <div style={{display:'flex',gap:4,marginLeft:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {t.done&&<button onClick={()=>reuseTask(t)} style={{...S.btnGhost,fontSize:9,padding:'5px 6px'}}>Reuse</button>}
            {!t.done&&!t.scheduledTime&&t.date===TODAY&&<button onClick={()=>scheduleTask(t.id,getSuggestedTaskTime(t))} style={{...S.btnGhost,fontSize:9,padding:'5px 6px'}}>Suggest</button>}
            {overdue&&!t.done&&<button onClick={()=>rollTask(t.id)} style={{...S.btnGhost,fontSize:9,padding:'5px 6px'}}>Roll</button>}
            {overdue&&!t.done&&<button onClick={()=>deferTask(t.id)} style={{...S.btnGhost,fontSize:9,padding:'5px 6px'}}>Defer</button>}
            {!t.done&&<button onClick={()=>dismissTask(t.id)} style={{...S.btnGhost,fontSize:9,padding:'5px 6px'}}>Dismiss</button>}
            {!t.done&&t.status==='active'&&<button onClick={()=>{setFocusTaskId(t.id);setFocusTmrSec(null);setFocusTmrRunning(false);}} style={{...S.btnGhost,fontSize:9,padding:'5px 6px',borderColor:C.navy,color:C.navy}}>Focus</button>}
            <button onClick={()=>openTaskComposer({parentId:t.id,date:t.date||TODAY,bucket:t.bucket||'next',contextTags:(t.contextTags||[]).join(', '),scheduledTime:''})} style={{background:'none',border:'none',color:C.muted,fontSize:14,cursor:'pointer'}}>+</button>
            <button onClick={()=>deleteTask(t.id)} style={{background:'none',border:'none',color:C.muted,fontSize:14,cursor:'pointer'}}>x</button>
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
          <span style={{fontSize:11}}>Use Brain Dump on Home to capture ideas fast.</span>
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
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:6,marginBottom:8}}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(label=><div key={label} style={{fontSize:10,color:C.muted,textAlign:'center',fontWeight:600}}>{label}</div>)}
        </div>
        <div onTouchStart={handleCalendarTouchStart} onTouchEnd={handleCalendarTouchEnd} style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:6}}>
          {(calendarViewMode==='month'?monthGridDays:displayedWeekDays).map(dayDate=>{
            const dateStr=formatDateKey(dayDate);
            const calendarDay=getCalendarDay(dateStr);
            const isSelected=dateStr===selDay;
            const isToday=dateStr===TODAY;
            const isOutsideMonth=calendarViewMode==='month'
              ?dayDate.getMonth()!==displayedMonthStart.getMonth()
              :dayDate.getMonth()!==weekReferenceMonth;
            const dots=renderDots(calendarDay,calendarViewMode==='month'?2:4);
            return <button
              key={dateStr}
              onClick={()=>selectCalendarDate(dateStr)}
              style={{
                minHeight:calendarViewMode==='month'?74:86,
                borderRadius:14,
                border:`1px solid ${isSelected?C.navy:isToday?C.sage:C.bd}`,
                background:isSelected?C.navyL:C.card,
                color:isOutsideMonth?C.muted:C.tx,
                cursor:'pointer',
                padding:calendarViewMode==='month'?'8px 6px':'10px 6px',
                opacity:isOutsideMonth?0.7:1,
                display:'flex',
                flexDirection:'column',
                alignItems:'center',
                justifyContent:'space-between',
              }}>
              <div style={{fontSize:calendarViewMode==='month'?20:11,fontWeight:calendarViewMode==='month'?700:600}}>
                {calendarViewMode==='month'?calendarDay.dayNumber:formatDate(dateStr,'weekdayShort')}
              </div>
              {calendarViewMode==='week'&&<div style={{fontSize:24,fontWeight:800,lineHeight:1}}>{calendarDay.dayNumber}</div>}
              <div style={{display:'flex',gap:4,justifyContent:'center',minHeight:8,flexWrap:'wrap'}}>
                {dots.map(dot=><span key={dot.id} style={{width:6,height:6,borderRadius:'50%',background:dot.color,display:'inline-block'}} />)}
              </div>
            </button>;
          })}
        </div>
      </div>
      {/* Day header + actions */}
      <div style={{...S.row,marginBottom:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{formatDate(selDay,'primary')}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>
            {selectedCalendarDay.completionRate}% complete
            {selectedCalendarDay.recoveryStatus==='low'?' · recovery low':''}
            {selectedCalendarDay.hasWorkout?' · workout logged':''}
          </div>
        </div>
        <div style={{display:'flex',gap:5}}>
          <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={()=>openTab('home',{calendarFocusDay:selDay})}>Open Daily</button>
          {googleConnected&&<button style={S.btnSmall(C.navy)} onClick={syncGoogleCal}>Sync</button>}
          <button style={S.btnSmall(C.amber)} onClick={()=>{setBusyForm(f=>({...f,date:selDay}));setBusyModal('new');}}>+ Busy</button>
          <button style={S.btnSmall(C.sage)} onClick={()=>setCalModal('new')}>+ Event</button>
        </div>
      </div>

      {/* Quick busy presets */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:500,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:6}}>Quick busy blocks</div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {BUSY_PRESETS.map(p=><button key={p.label} style={{...S.btnGhost,fontSize:10,padding:'5px 10px',color:C.tx}} onClick={()=>applyPreset(p)}>{p.label}</button>)}
        </div>
      </div>

      {/* Week patterns */}
      {Object.keys(weekPatterns||{}).length>0&&<div style={{...S.card,marginBottom:10,padding:'10px 14px'}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:500,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:8}}>Saved patterns</div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {Object.keys(weekPatterns).map(name=><button key={name} style={S.btnSmall(C.navy)} onClick={()=>applyWeekPattern(name,selDay)}>{name}</button>)}
        </div>
      </div>}

      {/* Google hint */}
      {!googleConnected&&<ConnectGoogle onConnect={()=>openTab('settings',{settingsSection:'google'})}/>}

      {/* All-day events */}
      {allDayEvents.length>0&&<div style={{...S.card,marginBottom:8}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:6}}>All Day</div>
        {allDayEvents.map((ev,i)=><div key={ev.id} style={{...S.row,padding:'7px 0',borderBottom:i<allDayEvents.length-1?`0.5px solid ${C.bd}`:'none'}}>
          <div style={{width:44,flexShrink:0,fontSize:9,color:C.muted,textAlign:'center',paddingTop:2}}>All day</div>
          <div style={{flex:1,background:ev.color||C.navy,borderRadius:8,padding:'7px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:12,fontWeight:600,color:C.white}}>{ev.title}</div>
            {!ev.local&&<span style={{fontSize:9,color:'rgba(255,255,255,0.55)'}}>Google</span>}
          </div>
        </div>)}
      </div>}
      {/* Time list */}
      {allItems.length===0
        ?<div style={{textAlign:'center',padding:'28px 0',color:C.muted,fontSize:13}}>No events, tasks, or busy blocks. Use the buttons above to add.</div>
        :<div style={S.card}>
          {allItems.map((item,i)=>{
            const isLast=i===allItems.length-1;
            if(item.kind==='task'){
              const priBorder=item.priority===3?C.red:item.priority===2?C.amber:C.sage;
              return <div key={item.id} style={{...S.row,padding:'9px 0',borderBottom:isLast?'none':`0.5px solid ${C.bd}`,alignItems:'center',opacity:item.done?0.5:1}}>
                <div style={{width:44,flexShrink:0,fontSize:9,color:C.muted,textAlign:'center',paddingTop:2}}>Task</div>
                <div style={{flex:1,background:C.surf,borderRadius:8,padding:'7px 10px',borderLeft:`3px solid ${priBorder}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:C.tx,textDecoration:item.done?'line-through':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.text}</div>
                    {item.priority>1&&<div style={{fontSize:9,color:priBorder,marginTop:1}}>{'!'.repeat(item.priority)} priority</div>}
                  </div>
                  <button onClick={()=>updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===item.id?{...t,done:!t.done,status:!t.done?'done':'active',updatedAt:new Date().toISOString()}:t)}))} style={{width:22,height:22,borderRadius:5,border:`1.5px solid ${item.done?C.sage:C.bd}`,background:item.done?C.sage:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginLeft:8}}>
                    {item.done&&<svg width="11" height="11" viewBox="0 0 24 24" fill="var(--white)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                  </button>
                </div>
              </div>;
            }
            if(item.kind==='busy'){
              const cat=BUSY_CATEGORIES.find(c=>c.id===item.category)||{clr:C.muted,label:item.category};
              return <div key={item.id} style={{...S.row,padding:'9px 0',borderBottom:isLast?'none':`0.5px solid ${C.bd}`,alignItems:'flex-start'}}>
                <div style={{width:44,flexShrink:0}}>
                  <div style={{fontSize:10,color:C.muted}}>{fmtTimeRange(item.startTime,item.endTime).split(' – ')[0]}</div>
                  <div style={{fontSize:9,color:C.muted}}>{fmtTimeRange(item.startTime,item.endTime).split(' – ')[1]}</div>
                </div>
                <div style={{flex:1,background:C.surf,borderRadius:8,padding:'7px 10px',borderLeft:`3px solid ${cat.clr}`}}>
                  <div style={{...S.row}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:C.tx}}>{item.title}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                        {fmtTimeRange(item.startTime,item.endTime)} · <span style={{color:cat.clr}}>{cat.label}</span>
                        {item.recurring&&' · repeats'}
                      </div>
                      {item.notes&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.notes}</div>}
                    </div>
                    <button onClick={()=>deleteBusyBlock(item.id)} style={{background:'none',border:'none',color:C.muted,fontSize:14,cursor:'pointer',padding:'0 0 0 8px'}}>x</button>
                  </div>
                </div>
              </div>;
            }
            return <div key={item.id} style={{...S.row,padding:'9px 0',borderBottom:isLast?'none':`0.5px solid ${C.bd}`,alignItems:'flex-start'}}>
              <div style={{width:44,flexShrink:0,fontSize:10,color:C.muted,paddingTop:4}}>
                {(()=>{const h=item.startHour;return`${h>12?h-12:h||12}${h>=12?'pm':'am'}`;})()}
              </div>
              <div style={{flex:1,background:item.color||C.sage,borderRadius:8,padding:'7px 10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.white}}>{item.title}</div>
                  <div style={{fontSize:10,color:C.whiteSoft4}}>{item.durationMins}min</div>
                </div>
                {item.local&&<button onClick={()=>deleteEvent(selDay,item.id)} style={{background:'none',border:'none',color:C.whiteSoft5,fontSize:14,cursor:'pointer'}}>x</button>}
              </div>
            </div>;
          })}
        </div>
      }

      {/* Busy block summary for week (below day view) */}
      {selBusy.length>0&&<div style={{...S.card,marginTop:4}}>
        <div style={{...S.row,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:600,color:C.tx}}>Busy today</span>
          <span style={{fontSize:10,color:C.muted}}>{selBusy.length} block{selBusy.length>1?'s':''}</span>
        </div>
        <div style={{fontSize:11,color:C.muted}}>
          Free windows: {(()=>{
            const sorted=selBusy.sort((a,b)=>timeToMins(a.startTime)-timeToMins(b.startTime));
            const windows=[];let cursor=480; // 8am
            for(const b of sorted){const sm=timeToMins(b.startTime);if(sm-cursor>=30)windows.push(`${minsToTime(cursor)}–${minsToTime(sm)}`);cursor=Math.max(cursor,timeToMins(b.endTime));}
            if(1080-cursor>=30)windows.push(`${minsToTime(cursor)}–6pm`); // up to 6pm
            return windows.length?windows.join(', '):'None today';
          })()}
        </div>
      </div>}

      {/* Save pattern prompt */}
      <div style={{...S.card,marginTop:4,padding:'10px 14px'}}>
        <div style={{fontSize:11,fontWeight:500,color:C.tx,marginBottom:8}}>Save this week as a pattern</div>
        <div style={{display:'flex',gap:6}}>
          <FieldInput value={patternName} onChange={e=>setPatternName(e.target.value)} placeholder="Pattern name (e.g. Typical Mon)" style={{...S.inp,flex:1,padding:'7px 10px'}}/>
          <button style={S.btnSmall(C.navy)} onClick={()=>saveWeekPattern(selDay)}>Save</button>
        </div>
      </div>

      {/* Add Busy Block modal */}
      {busyModal==='new'&&<div style={{position:'fixed',inset:0,background:C.scrim,zIndex:500,display:'flex',alignItems:'flex-end'}}>
        <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'85vh',overflowY:'auto'}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:16}}>Add Busy Block</div>
          <span style={S.lbl}>Title</span>
          <FieldInput value={busyForm.title} onChange={e=>setBusyForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Team standup" style={{...S.inp,marginBottom:8}} autoFocus/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div><span style={S.lbl}>Start time</span>
              <FieldInput type="time" value={busyForm.startTime} onChange={e=>setBusyForm(f=>({...f,startTime:e.target.value}))} style={S.inp}/>
            </div>
            <div><span style={S.lbl}>End time</span>
              <FieldInput type="time" value={busyForm.endTime} onChange={e=>setBusyForm(f=>({...f,endTime:e.target.value}))} style={S.inp}/>
            </div>
          </div>
          <span style={S.lbl}>Category</span>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
            {BUSY_CATEGORIES.map(cat=><button key={cat.id} onClick={()=>setBusyForm(f=>({...f,category:cat.id}))} style={{padding:'5px 10px',borderRadius:8,border:`1.5px solid ${busyForm.category===cat.id?cat.clr:C.bd}`,background:busyForm.category===cat.id?cat.clr:'transparent',color:busyForm.category===cat.id?C.white:C.tx,fontSize:11,cursor:'pointer'}}>{cat.label}</button>)}
          </div>
          <div style={{...S.row,marginBottom:8}}>
            <span style={{fontSize:12,color:C.tx}}>Recurring (same day each week)</span>
            <button onClick={()=>setBusyForm(f=>({...f,recurring:!f.recurring}))} style={{width:40,height:24,borderRadius:12,background:busyForm.recurring?C.sage:C.surf,border:`1px solid ${C.bd}`,cursor:'pointer',position:'relative'}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:C.white,position:'absolute',top:2,transition:'left 0.2s',left:busyForm.recurring?'18px':'2px'}}/>
            </button>
          </div>
          {!busyForm.recurring&&<>
            <span style={S.lbl}>Date</span>
            <FieldInput type="date" value={busyForm.date} onChange={e=>setBusyForm(f=>({...f,date:e.target.value}))} style={{...S.inp,marginBottom:8}}/>
          </>}
          {busyForm.recurring&&<>
            <span style={S.lbl}>Day of week</span>
            <div style={{display:'flex',gap:5,marginBottom:8}}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d,i)=><button key={i} onClick={()=>setBusyForm(f=>({...f,dow:i}))} style={{width:34,height:34,borderRadius:8,border:`1.5px solid ${busyForm.dow===i?C.sage:C.bd}`,background:busyForm.dow===i?C.sage:'transparent',color:busyForm.dow===i?C.white:C.tx,fontSize:11,cursor:'pointer'}}>{d}</button>)}
            </div>
          </>}
          <span style={S.lbl}>Notes (optional)</span>
          <FieldInput value={busyForm.notes} onChange={e=>setBusyForm(f=>({...f,notes:e.target.value}))} placeholder="Optional context..." style={{...S.inp,marginBottom:14}}/>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnSolid(C.amber)} onClick={addBusyBlock}>Add Block</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setBusyModal(null)}>Cancel</button>
          </div>
        </div>
      </div>}

      {/* Add Event modal */}
      {calModal==='new'&&<div style={{position:'fixed',inset:0,background:C.scrim,zIndex:500,display:'flex',alignItems:'flex-end'}}>
        <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px',width:'100%',maxWidth:430,margin:'0 auto'}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:16}}>New Event — {selDay}</div>
          <FieldInput value={calForm.title} onChange={e=>setCalForm(f=>({...f,title:e.target.value}))} placeholder="Event title" style={{...S.inp,marginBottom:8}} autoFocus/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            <div><span style={S.lbl}>Start hour</span>
              <FieldInput type="number" min={0} max={23} value={calForm.hour} onChange={e=>setCalForm(f=>({...f,hour:parseInt(e.target.value)||9}))} style={S.inp}/>
            </div>
            <div><span style={S.lbl}>Duration (min)</span>
              <FieldInput type="number" min={15} step={15} value={calForm.dur} onChange={e=>setCalForm(f=>({...f,dur:parseInt(e.target.value)||60}))} style={S.inp}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnSolid(C.sage)} onClick={createLocalEvent}>Add Event</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setCalModal(null)}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>;
  }

  function FinanceScreen({activeView='overview',onViewChange=()=>{}}){
    const localFinView=FINANCE_VIEW_IDS.includes(activeView)?activeView:'overview';
    const [editTxId,setEditTxId]=useState(null);
    const [finOverviewOpen,setFinOverviewOpen]=useState({accounts:false,spending:false});
    const accountTypeLabel=type=>(ACCOUNT_TYPE_OPTIONS.find(option=>option.id===type)?.label)||'Other';
    const getTransactionAccountLabel=tx=>{
      const account=financialAccountMap.get(tx.accountId);
      if(account)return formatAccountLabel(account);
      return tx.accountId?String(tx.accountId).replace(/_/g,' '):'No account';
    };
    const TransactionRow=({transaction,showEditButton=false,isEditing=false,onToggleEdit})=>{
      const cat=financeCategoryMap.get(transaction.category)||{clr:C.muted,label:'Other'};
      return <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0,flex:'1 1 180px'}}>
          {!transaction.isReviewed&&<div style={{width:6,height:6,borderRadius:'50%',background:C.amber,flexShrink:0,marginTop:5}}/>}
          <div style={{fontSize:13,color:C.tx,fontWeight:500,lineHeight:1.35,minWidth:0,overflowWrap:'anywhere'}}>{transaction.merchant}</div>
        </div>
        <div style={{marginLeft:'auto',textAlign:'right',minWidth:84,flex:'0 0 auto'}}>
          <div style={{fontSize:13,fontWeight:700,color:transaction.isCredit?C.sage:C.tx,whiteSpace:'nowrap'}}>{transaction.isCredit?'+':'-'}{fmtMoneyD(transaction.amount)}</div>
          {showEditButton&&<button onClick={onToggleEdit} style={{background:'none',border:'none',color:C.muted,fontSize:10,cursor:'pointer',padding:0,marginTop:2}}>{isEditing?'close':'edit'}</button>}
        </div>
        <div style={{width:'100%',fontSize:10,color:C.muted,lineHeight:1.4,paddingLeft:transaction.isReviewed?0:12,overflowWrap:'anywhere'}}>
          {formatDate(transaction.date,'monthDayShort')} · <span style={{color:cat.clr}}>{cat.label}</span> · {getTransactionAccountLabel(transaction)}{transaction.isTransfer?' · transfer':''}
        </div>
      </div>;
    };

    // Filtered transactions
    const visibleTx=useMemo(()=>{
      let list=[...(transactions||[])].sort((a,b)=>b.date.localeCompare(a.date));
      if(finSearch)list=list.filter(t=>(t.merchant+(t.description||'')+(t.notes||'')).toLowerCase().includes(finSearch.toLowerCase()));
      if(finCatFilter)list=list.filter(t=>t.category===finCatFilter);
      return list;
    },[transactions,finSearch,finCatFilter]);

    const sub=()=>{
      const labels={overview:'Overview',transactions:'Feed',categories:'By Category',recurring:'Recurring',trends:'Trends'};
      return <div style={{display:'flex',gap:4,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
        {Object.entries(labels).map(([k,v])=><button key={k} onClick={()=>onViewChange(k)} style={{flexShrink:0,padding:'6px 12px',borderRadius:10,border:`0.5px solid ${localFinView===k?C.sage:C.bd}`,background:localFinView===k?C.sageL:'transparent',color:localFinView===k?C.sageDk:C.muted,fontSize:11,fontWeight:localFinView===k?600:400,cursor:'pointer'}}>{v}</button>)}
      </div>;
    };

    // Sticky + Transaction button rendered in every sub-view header
    const addBtn=<button style={{...S.btnSmall(C.sage),padding:'8px 16px',fontSize:13,fontWeight:600}} onClick={()=>setShowAddTx(true)}>+ Transaction</button>;

    // ── OVERVIEW ─────────────────────────────────────────────────────
    if(localFinView==='overview'){
      const totalBalance=activeFinancialAccounts.filter(a=>a.currentBalance!=null).reduce((s,a)=>s+a.currentBalance,0);
      const hasBalances=activeFinancialAccounts.some(a=>a.currentBalance!=null);
      const topCats=catSpend.slice(0,3);
      return <div style={S.body}>
        {/* Header row with sub-tabs and + button */}
        <div style={{...S.row,marginBottom:10,gap:8}}>
          <div style={{flex:1,overflowX:'auto'}}>{sub()}</div>
          {addBtn}
        </div>
        {/* Quick add templates */}
        <div style={S.card}>
          <span style={S.lbl}>Quick Add</span>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {QUICK_MERCHANTS.map(m=><button key={m.label} onClick={()=>quickAddMerchant(m)} style={{padding:'6px 10px',borderRadius:20,border:`0.5px solid ${C.bd}`,background:C.surf,color:C.tx,fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
              <span>{m.icon}</span><span>{m.label}</span>
            </button>)}
            <button onClick={duplicateLastTx} style={{padding:'6px 10px',borderRadius:20,border:`0.5px solid ${C.navy}`,background:'transparent',color:C.navy,fontSize:11,cursor:'pointer'}}>↩ Duplicate last</button>
          </div>
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Categories</span>
            <button style={{...S.btnGhost,fontSize:11,padding:'4px 8px'}} onClick={addCategory}>+ Add</button>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {financeCategories.filter(category=>category.id!=='transfer').map(category=><button key={category.id} onClick={()=>editCategory(category)} style={{padding:'6px 10px',borderRadius:20,border:`0.5px solid ${category.clr}`,background:C.surf,color:C.tx,fontSize:11,cursor:'pointer'}}>
              {category.label}
            </button>)}
          </div>
        </div>
        {/* Accounts */}
        <CollapsibleCard
          title="Accounts"
          summary={hasBalances?`${fmtMoney(totalBalance)} total · ${activeFinancialAccounts.length} account${activeFinancialAccounts.length!==1?'s':''}`:`${activeFinancialAccounts.length} account${activeFinancialAccounts.length!==1?'s':''}`}
          open={finOverviewOpen.accounts}
          onToggle={()=>setFinOverviewOpen(s=>({...s,accounts:!s.accounts}))}>
          {activeFinancialAccounts.map(a=><div key={a.id} style={{padding:'8px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <div style={{...S.row,alignItems:'flex-start',gap:10}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:13,color:C.tx,fontWeight:500,lineHeight:1.3,overflowWrap:'anywhere'}}>{formatAccountLabel(a)}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{accountTypeLabel(a.type)}{a.startingBalance!=null?` · start ${fmtMoney(a.startingBalance)}`:''}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {a.currentBalance!=null?<div style={{fontSize:14,fontWeight:700,color:C.sage}}>{fmtMoney(a.currentBalance)}</div>:<div style={{fontSize:11,color:C.muted}}>—</div>}
                <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:4}}>
                  <button style={{background:'none',border:'none',color:C.muted,fontSize:10,cursor:'pointer',padding:0}} onClick={()=>openEditAccount(a)}>edit</button>
                  <button style={{background:'none',border:'none',color:C.red,fontSize:10,cursor:'pointer',padding:0}} onClick={()=>archiveAccount(a.id)}>archive</button>
                </div>
              </div>
            </div>
          </div>)}
          {activeFinancialAccounts.length===0&&<div style={{fontSize:11,color:C.muted,marginBottom:8}}>No active accounts yet. Add one to start tracking transactions.</div>}
          {archivedFinancialAccounts.length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:`0.5px solid ${C.bd}`}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.7px',color:C.muted,textTransform:'uppercase',marginBottom:6}}>Archived</div>
            {archivedFinancialAccounts.map(a=><div key={a.id} style={{...S.row,padding:'6px 0',gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12,color:C.tx,lineHeight:1.3,overflowWrap:'anywhere'}}>{formatAccountLabel(a)}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{accountTypeLabel(a.type)}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button style={{background:'none',border:'none',color:C.navy,fontSize:10,cursor:'pointer',padding:0}} onClick={()=>restoreAccount(a.id)}>restore</button>
                <button style={{background:'none',border:'none',color:C.red,fontSize:10,cursor:'pointer',padding:0}} onClick={()=>deleteAccount(a.id)}>delete</button>
              </div>
            </div>)}
          </div>}
          <button style={{...S.btnGhost,width:'100%',marginTop:10}} onClick={openAddAccount}>+ Add account</button>
          {hasBalances&&<div style={{...S.row,marginTop:10,paddingTop:10,borderTop:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:12,fontWeight:600,color:C.tx}}>Total</span>
            <span style={{fontSize:18,fontWeight:700,color:C.tx}}>{fmtMoney(totalBalance)}</span>
          </div>}
          {!hasBalances&&activeFinancialAccounts.length>0&&<div style={{fontSize:11,color:C.muted,marginTop:6}}>Set balances in Settings → Finance if you want totals here.</div>}
        </CollapsibleCard>
        {/* Spend summary */}
        <CollapsibleCard
          title="Spending"
          summary={`${fmtMoney(weekSpend)} this week · ${fmtMoney(monthSpend)} this month`}
          open={finOverviewOpen.spending}
          onToggle={()=>setFinOverviewOpen(s=>({...s,spending:!s.spending}))}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            {[{l:'This week',v:weekSpend},{l:'This month',v:monthSpend}].map(({l,v})=>
              <div key={l} style={{background:C.surf,borderRadius:10,padding:'10px',textAlign:'center'}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{l}</div>
                <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{fmtMoney(v)}</div>
              </div>
            )}
          </div>
          {topCats.length>0&&topCats.map(c=><div key={c.id} style={{marginBottom:6}}>
            <div style={{...S.row,marginBottom:3}}>
              <span style={{fontSize:11,color:C.tx}}>{c.label}</span>
              <span style={{fontSize:11,color:C.muted}}>{fmtMoney(c.total)}</span>
            </div>
            <ProgressBar value={c.total} max={monthSpend} color={c.clr}/>
          </div>)}
        </CollapsibleCard>
        {/* Alerts */}
        {(unreviewed>0||billsDueSoon.length>0)&&<div style={S.card}>
          <span style={S.lbl}>Attention</span>
          {unreviewed>0&&<div style={{...S.row,padding:'8px 0',borderBottom:billsDueSoon.length?`0.5px solid ${C.bd}`:'none'}}>
            <span style={{fontSize:13,color:C.tx}}>{unreviewed} unreviewed transaction{unreviewed>1?'s':''}</span>
            <button style={S.btnSmall(C.amber)} onClick={()=>{setFinCatFilter(null);onViewChange('transactions');}}>Review</button>
          </div>}
          {billsDueSoon.map(r=><div key={r.merchant} style={{...S.row,padding:'8px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <div>
              <div style={{fontSize:13,color:C.tx}}>{r.merchant}</div>
              <div style={{fontSize:10,color:C.amber}}>Due {formatDate(r.nextExpectedDate,'monthDayLong')} · {fmtMoney(r.averageAmount)}</div>
            </div>
            <span style={{fontSize:10,color:C.muted}}>{r.frequency}</span>
          </div>)}
        </div>}
        {/* Recent transactions */}
        {(transactions||[]).length>0&&<div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Recent</span>
            <button style={{...S.btnGhost,fontSize:11,padding:'4px 8px'}} onClick={()=>onViewChange('transactions')}>All</button>
          </div>
          {[...(transactions||[])].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map((t,i,items)=><div key={t.transactionId} style={{padding:'8px 0',borderBottom:i<items.length-1?`0.5px solid ${C.bd}`:'none'}}>
            <TransactionRow transaction={t}/>
          </div>)}
        </div>}
        {(transactions||[]).length===0&&<div style={{textAlign:'center',padding:'30px 0',color:C.muted,fontSize:13}}>
          No transactions yet.<br/>Import a CSV or add manually.
          <div style={{marginTop:12,display:'flex',gap:8,justifyContent:'center'}}>
            <button style={S.btnSmall(C.navy)} onClick={()=>setShowImport(true)}>Import CSV</button>
            <button style={S.btnSmall(C.sage)} onClick={()=>setShowAddTx(true)}>+ Manual</button>
          </div>
        </div>}
      </div>;
    }

    // ── TRANSACTIONS ──────────────────────────────────────────────────
    if(localFinView==='transactions'){
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:8,gap:8}}>
          <div style={{flex:1,overflowX:'auto'}}>{sub()}</div>
          {addBtn}
        </div>
        <div style={{...S.row,marginBottom:8,gap:6}}>
          <FieldInput value={finSearch} onChange={e=>setFinSearch(e.target.value)} placeholder="Search transactions..." style={{...S.inp,flex:1,padding:'7px 10px'}}/>
          <button style={S.btnSmall(C.navy)} onClick={()=>setShowImport(true)}>Import CSV</button>
        </div>
        {/* Category filter chips */}
        <div style={{display:'flex',gap:4,overflowX:'auto',marginBottom:10,paddingBottom:2}}>
          <button onClick={()=>setFinCatFilter(null)} style={{flexShrink:0,padding:'4px 10px',borderRadius:20,border:`0.5px solid ${!finCatFilter?C.sage:C.bd}`,background:!finCatFilter?C.sageL:'transparent',color:!finCatFilter?C.sageDk:C.muted,fontSize:10,cursor:'pointer'}}>All</button>
          {financeCategories.map(c=><button key={c.id} onClick={()=>setFinCatFilter(finCatFilter===c.id?null:c.id)} style={{flexShrink:0,padding:'4px 10px',borderRadius:20,border:`0.5px solid ${finCatFilter===c.id?c.clr:C.bd}`,background:finCatFilter===c.id?c.clr:'transparent',color:finCatFilter===c.id?C.white:C.muted,fontSize:10,cursor:'pointer'}}>{c.label}</button>)}
        </div>
        {visibleTx.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:C.muted,fontSize:13}}>No transactions match.</div>}
        <div style={S.card}>
          {visibleTx.map((t,i)=>{
            const isEdit=editTxId===t.transactionId;
            return <div key={t.transactionId} style={{padding:'10px 0',borderBottom:i<visibleTx.length-1?`0.5px solid ${C.bd}`:'none'}}>
              <TransactionRow transaction={t} showEditButton isEditing={isEdit} onToggleEdit={()=>setEditTxId(isEdit?null:t.transactionId)}/>
              {isEdit&&<div style={{marginTop:8,padding:'10px',background:C.surf,borderRadius:10}}>
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                  {financeCategories.map(c=><button key={c.id} onClick={()=>{updateTxCategory(t.transactionId,c.id,true);setEditTxId(null);}} style={{padding:'4px 8px',borderRadius:6,border:`1px solid ${t.category===c.id?c.clr:C.bd}`,background:t.category===c.id?c.clr:'transparent',color:t.category===c.id?C.white:C.tx,fontSize:10,cursor:'pointer'}}>{c.label}</button>)}
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {!t.isReviewed&&<button style={S.btnSmall(C.sage)} onClick={()=>{reviewTx(t.transactionId);setEditTxId(null);}}>Mark reviewed</button>}
                  <button style={{...S.btnGhost,fontSize:11,color:C.red,borderColor:C.red}} onClick={()=>{deleteTx(t.transactionId);setEditTxId(null);}}>Delete</button>
                </div>
              </div>}
            </div>;
          })}
        </div>
      </div>;
    }

    // ── CATEGORIES ────────────────────────────────────────────────────
    if(localFinView==='categories'){
      const prev=formatDateKey(new Date(now.getFullYear(),now.getMonth()-1,1));
      const prevEnd=formatDateKey(new Date(now.getFullYear(),now.getMonth(),0));
      const prevTx=spendTx.filter(t=>t.date>=prev&&t.date<=prevEnd);
      const prevSpend=prevTx.reduce((s,t)=>s+t.amount,0);
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:10,gap:8}}><div style={{flex:1,overflowX:'auto'}}>{sub()}</div>{addBtn}</div>
        <div style={{...S.row,marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{formatDate(monthStart,'monthYear')}</span>
          <span style={{fontSize:13,fontWeight:700,color:C.tx}}>{fmtMoney(monthSpend)}</span>
        </div>
        {catSpend.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:C.muted,fontSize:13}}>No spending data yet.</div>}
        {catSpend.map(c=><div key={c.id} style={{...S.card,marginBottom:8}}>
          <div style={{...S.row,marginBottom:6}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:c.clr}}/>
              <span style={{fontSize:13,fontWeight:500,color:C.tx}}>{c.label}</span>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{fmtMoney(c.total)}</div>
              <div style={{fontSize:10,color:C.muted}}>{monthSpend>0?Math.round(c.total/monthSpend*100):0}% of spend</div>
            </div>
          </div>
          <ProgressBar value={c.total} max={monthSpend} color={c.clr}/>
          <button style={{...S.btnGhost,marginTop:8,fontSize:11,padding:'4px 8px'}} onClick={()=>{setFinCatFilter(c.id);onViewChange('transactions');}}>View transactions</button>
        </div>)}
        {prevSpend>0&&<div style={{...S.card,background:C.surf}}>
          <span style={S.lbl}>Prior month</span>
          <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{fmtMoney(prevSpend)}</div>
          <div style={{fontSize:11,color:monthSpend>prevSpend?C.red:C.sage,marginTop:4}}>
            {monthSpend>prevSpend?'+':`-`}{fmtMoney(Math.abs(monthSpend-prevSpend))} vs last month
          </div>
        </div>}
      </div>;
    }

    // ── RECURRING ─────────────────────────────────────────────────────
    if(localFinView==='recurring'){
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:10,gap:8}}><div style={{flex:1,overflowX:'auto'}}>{sub()}</div>{addBtn}</div>
        <div style={{...S.row,marginBottom:10}}>
          <span style={{fontSize:13,fontWeight:600,color:C.tx}}>Recurring Expenses</span>
          <span style={{fontSize:11,color:C.muted}}>{(recurringExpenses||[]).length} detected</span>
        </div>
        {(recurringExpenses||[]).length===0&&<div style={{textAlign:'center',padding:'24px 0',color:C.muted,fontSize:13}}>
          No recurring expenses detected yet.<br/>Import at least 2 months of transactions.
        </div>}
        {(recurringExpenses||[]).map((r,i)=>{
          const cat=financeCategoryMap.get(r.category)||{clr:C.muted,label:'Other'};
          const daysUntil=r.nextExpectedDate?Math.ceil((new Date(r.nextExpectedDate+'T12:00:00')-now)/86400000):null;
          const isDue=daysUntil!==null&&daysUntil<=7;
          return <div key={i} style={{...S.card,borderLeft:`3px solid ${isDue?C.amber:cat.clr}`}}>
            <div style={S.row}>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:C.tx}}>{r.merchant}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {fmtMoney(r.averageAmount)} · {r.frequency}
                  {r.nextExpectedDate&&<span style={{color:isDue?C.amber:C.muted}}> · due {formatDate(r.nextExpectedDate,'monthDayLong')}{isDue?` (${daysUntil}d)`:''}</span>}
                </div>
              </div>
              <span style={S.tag(cat.clr,C.surf)}>{cat.label||'Other'}</span>
            </div>
          </div>;
        })}
        <div style={{...S.card,background:C.surf,marginTop:4}}>
          <span style={S.lbl}>Recurring total</span>
          <div style={{fontSize:18,fontWeight:700,color:C.tx}}>{fmtMoney((recurringExpenses||[]).reduce((s,r)=>s+r.averageAmount,0))}/mo est.</div>
        </div>
      </div>;
    }

    // ── TRENDS ────────────────────────────────────────────────────────
    if(localFinView==='trends'){
      // Build last 4 weeks
      const weeks=Array.from({length:4},(_,i)=>{
        const d=new Date(weekMon);d.setDate(d.getDate()-i*7);
        const wk=formatDateKey(d);
        const wkEnd=new Date(d);wkEnd.setDate(d.getDate()+6);
        const total=spendTx.filter(t=>t.date>=wk&&t.date<=formatDateKey(wkEnd)).reduce((s,t)=>s+t.amount,0);
        return{label:formatDate(d,'monthDayShort'),total,wk};
      }).reverse();
      const maxWeek=Math.max(...weeks.map(w=>w.total),1);
      return <div style={S.body}>
        <div style={{...S.row,marginBottom:10,gap:8}}><div style={{flex:1,overflowX:'auto'}}>{sub()}</div>{addBtn}</div>
        <div style={S.card}>
          <span style={S.lbl}>Weekly spend — last 4 weeks</span>
          {weeks.map(w=><div key={w.wk} style={{marginBottom:10}}>
            <div style={{...S.row,marginBottom:4}}>
              <span style={{fontSize:11,color:C.tx}}>{w.label}</span>
              <span style={{fontSize:11,fontWeight:600,color:C.tx}}>{fmtMoney(w.total)}</span>
            </div>
            <ProgressBar value={w.total} max={maxWeek} color={C.navy}/>
          </div>)}
        </div>
        <div style={S.card}>
          <span style={S.lbl}>This month by category</span>
          {catSpend.length===0&&<div style={{fontSize:11,color:C.muted}}>No data yet.</div>}
          {catSpend.map(c=><div key={c.id} style={{marginBottom:8}}>
            <div style={{...S.row,marginBottom:3}}>
              <span style={{fontSize:11,color:C.tx}}>{c.label}</span>
              <span style={{fontSize:11,color:C.muted}}>{fmtMoney(c.total)}</span>
            </div>
            <ProgressBar value={c.total} max={monthSpend} color={c.clr}/>
          </div>)}
        </div>
        <div style={S.card}>
          <span style={S.lbl}>Income vs spend this month</span>
          {(()=>{
            const income=(transactions||[]).filter(t=>t.isCredit&&!t.isTransfer&&t.date>=monthStart).reduce((s,t)=>s+t.amount,0);
            const net=income-monthSpend;
            return <div>
              <div style={{...S.row,marginBottom:6}}>
                <span style={{fontSize:12,color:C.tx}}>Income</span><span style={{fontSize:14,fontWeight:700,color:C.sage}}>+{fmtMoney(income)}</span>
              </div>
              <div style={{...S.row,marginBottom:6}}>
                <span style={{fontSize:12,color:C.tx}}>Spend</span><span style={{fontSize:14,fontWeight:700,color:C.tx}}>-{fmtMoney(monthSpend)}</span>
              </div>
              <div style={{height:'0.5px',background:C.bd,margin:'6px 0'}}/>
              <div style={S.row}>
                <span style={{fontSize:12,fontWeight:600,color:C.tx}}>Net</span>
                <span style={{fontSize:16,fontWeight:700,color:net>=0?C.sage:C.red}}>{net>=0?'+':''}{fmtMoney(net)}</span>
              </div>
            </div>;
          })()}
        </div>
      </div>;
    }

    return <div style={S.body}>
      <div style={S.card}>
        <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:6}}>Finance view unavailable</div>
        <div style={{fontSize:11,color:C.muted}}>Resetting to Overview will restore the finance workspace.</div>
        <button style={{...S.btnGhost,marginTop:10}} onClick={()=>onViewChange('overview')}>Open Overview</button>
      </div>
    </div>;
  }

  // ── IMPORT CSV MODAL (rendered at App level) ──────────────────────
  function ImportModal(){
    const [csvText,setCsvText]=useState('');
    const [targetAccountId,setTargetAccountId]=useState(getDefaultAccountId(activeFinancialAccounts,true)||IMPORT_ACCOUNT_AUTO);
    const fileRef=useRef(null);
    const handleFile=e=>{
      const f=e.target.files?.[0];if(!f)return;
      const reader=new FileReader();
      reader.onload=ev=>setCsvText(ev.target.result||'');
      reader.readAsText(f);
    };
    return <div style={{position:'fixed',inset:0,background:C.scrim,zIndex:600,display:'flex',alignItems:'flex-end'}}>
      <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:12}}>Import Transactions</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
          Export CSV from Ally (Account → Transactions → Export) or Regions (Online Banking → Download). Paste the CSV text below or select the file.
        </div>
        {activeFinancialAccounts.length>0&&<>
          <span style={S.lbl}>Import Into</span>
          <FieldSelect value={targetAccountId} onChange={e=>setTargetAccountId(e.target.value)} style={{...S.inp,marginBottom:10}}>
            <option value={IMPORT_ACCOUNT_AUTO}>Match or create from CSV source</option>
            {activeFinancialAccounts.map(account=><option key={account.id} value={account.id}>{formatAccountLabel(account)}</option>)}
          </FieldSelect>
        </>}
        <FieldInput type="file" accept=".csv,.txt" ref={fileRef} onChange={handleFile} style={{display:'none'}}/>
        <button style={{...S.btnGhost,width:'100%',textAlign:'center',marginBottom:8}} onClick={()=>fileRef.current?.click()}>Select CSV file</button>
        <FieldTextarea value={csvText} onChange={e=>setCsvText(e.target.value)} placeholder="Or paste CSV text here..." style={{...S.inp,height:120,resize:'none',fontSize:11,marginBottom:12}}/>
        <div style={{display:'flex',gap:8}}>
          <button style={S.btnSolid(C.navy)} onClick={()=>importTransactions(csvText,targetAccountId===IMPORT_ACCOUNT_AUTO?'':targetAccountId)}>Import</button>
          <button style={{...S.btnGhost,flex:1}} onClick={()=>setShowImport(false)}>Cancel</button>
        </div>
      </div>
    </div>;
  }

  // ── ADD MANUAL TX MODAL (rendered at App level) ───────────────────
  function AddTxModal(){
    // Toggle helper renders a labeled switch
    function Toggle({label,on,onToggle,activeColor=C.sage}){
      return <div style={{...S.row,paddingBottom:10,borderBottom:`0.5px solid ${C.bd}`,marginBottom:10}}>
        <span style={{fontSize:13,color:C.tx}}>{label}</span>
        <button onClick={onToggle} style={{width:44,height:26,borderRadius:13,background:on?activeColor:C.surf,border:`1px solid ${C.bd}`,cursor:'pointer',position:'relative',flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:'50%',background:C.white,boxShadow:C.shadow,position:'absolute',top:3,transition:'left 0.18s',left:on?'20px':'3px'}}/>
        </button>
      </div>;
    }
    const lastTx=[...(transactions||[])].sort((a,b)=>b.date.localeCompare(a.date))[0];
    return <div style={{position:'fixed',inset:0,background:C.scrim,zIndex:600,display:'flex',alignItems:'flex-end'}}>
      <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px 32px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'88vh',overflowY:'auto'}}>
        {/* Header */}
        <div style={{...S.row,marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx}}>Add Transaction</div>
          {lastTx&&<button style={{...S.btnGhost,fontSize:11,padding:'4px 10px',color:C.navy,borderColor:C.navy}} onClick={duplicateLastTx}>↩ Dup last: {lastTx.merchant.substring(0,12)}</button>}
        </div>

        {/* Merchant */}
        <span style={S.lbl}>Merchant</span>
        <FieldInput value={txForm.merchant} onChange={e=>setTxForm(f=>({...f,merchant:e.target.value}))} placeholder="e.g. Aldi" style={{...S.inp,marginBottom:8}} autoFocus/>

        {/* Amount + Date */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <div>
            <span style={S.lbl}>Amount ($)</span>
            <FieldInput type="number" inputMode="decimal" value={txForm.amount} onChange={e=>setTxForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={S.inp}/>
          </div>
          <div>
            <span style={S.lbl}>Date</span>
            <FieldInput type="date" value={txForm.date} onChange={e=>setTxForm(f=>({...f,date:e.target.value}))} style={S.inp}/>
          </div>
        </div>

        {/* Account */}
        <span style={S.lbl}>Account</span>
        {activeFinancialAccounts.length>0
          ?<FieldSelect value={txForm.accountId} onChange={e=>setTxForm(f=>({...f,accountId:e.target.value}))} style={{...S.inp,marginBottom:8}}>
            {activeFinancialAccounts.map(a=><option key={a.id} value={a.id}>{formatAccountLabel(a)}</option>)}
          </FieldSelect>
          :<div style={{background:C.surf,border:`1px solid ${C.bd}`,borderRadius:12,padding:'12px',marginBottom:8}}>
            <div style={{fontSize:12,color:C.tx,marginBottom:8}}>Add an account before saving transactions.</div>
            <button style={S.btnSmall(C.navy)} onClick={()=>{setShowAddTx(false);openAddAccount();}}>+ Add account</button>
          </div>}

        {/* Category chips */}
        <span style={S.lbl}>Category</span>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:12}}>
          {financeCategories.filter(c=>c.id!=='transfer').map(c=><button key={c.id} onClick={()=>setTxForm(f=>({...f,category:c.id,isTransfer:false}))} style={{padding:'5px 10px',borderRadius:20,border:`1.5px solid ${txForm.category===c.id?c.clr:C.bd}`,background:txForm.category===c.id?c.clr:'transparent',color:txForm.category===c.id?C.white:C.tx,fontSize:11,cursor:'pointer',fontWeight:txForm.category===c.id?600:400}}>{c.label}</button>)}
        </div>

        {/* Toggles */}
        <Toggle label="Income / credit" on={txForm.isCredit} onToggle={()=>setTxForm(f=>({...f,isCredit:!f.isCredit}))} activeColor={C.sage}/>
        <Toggle label="Recurring bill or subscription" on={txForm.isRecurring} onToggle={()=>setTxForm(f=>({...f,isRecurring:!f.isRecurring}))} activeColor={C.navy}/>
        <Toggle label="Transfer between accounts (excluded from spend totals)" on={txForm.isTransfer} onToggle={()=>setTxForm(f=>({...f,isTransfer:!f.isTransfer,category:!f.isTransfer?'transfer':f.category}))} activeColor={C.amber}/>

        {/* Notes */}
        <FieldInput value={txForm.notes} onChange={e=>setTxForm(f=>({...f,notes:e.target.value}))} placeholder="Note (optional)..." style={{...S.inp,marginBottom:16}}/>

        {/* Actions */}
        <div style={{display:'flex',gap:8}}>
          <button style={{...S.btnSolid(C.sage),opacity:activeFinancialAccounts.length?1:0.6,pointerEvents:activeFinancialAccounts.length?'auto':'none'}} onClick={()=>addManualTx()}>Save Transaction</button>
          <button style={{...S.btnGhost,flex:0,padding:'11px 16px'}} onClick={()=>setShowAddTx(false)}>Cancel</button>
        </div>
      </div>
    </div>;
  }

  function AccountModal(){
    const isEdit=!!editingAccountId;
    return <div style={{position:'fixed',inset:0,background:C.scrim,zIndex:600,display:'flex',alignItems:'flex-end'}}>
      <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px 32px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:16}}>{isEdit?'Edit Account':'Add Account'}</div>
        <span style={S.lbl}>Account Name</span>
        <FieldInput value={accountForm.name} onChange={e=>setAccountForm(form=>({...form,name:e.target.value}))} placeholder="Checking" style={{...S.inp,marginBottom:8}} autoFocus/>
        <span style={S.lbl}>Institution</span>
        <FieldInput value={accountForm.institution} onChange={e=>setAccountForm(form=>({...form,institution:e.target.value}))} placeholder="Ally" style={{...S.inp,marginBottom:8}}/>
        <span style={S.lbl}>Type</span>
        <FieldSelect value={accountForm.type} onChange={e=>setAccountForm(form=>({...form,type:e.target.value}))} style={{...S.inp,marginBottom:8}}>
          {ACCOUNT_TYPE_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
        </FieldSelect>
        <span style={S.lbl}>Starting Balance (optional)</span>
        <FieldInput type="number" inputMode="decimal" value={accountForm.startingBalance} onChange={e=>setAccountForm(form=>({...form,startingBalance:e.target.value}))} placeholder="0.00" style={{...S.inp,marginBottom:12}}/>
        <div style={{...S.row,paddingBottom:10,borderBottom:`0.5px solid ${C.bd}`,marginBottom:16}}>
          <span style={{fontSize:13,color:C.tx}}>Active for new transactions</span>
          <button onClick={()=>setAccountForm(form=>({...form,isActive:!form.isActive}))} style={{width:44,height:26,borderRadius:13,background:accountForm.isActive?C.sage:C.surf,border:`1px solid ${C.bd}`,cursor:'pointer',position:'relative',flexShrink:0}}>
            <div style={{width:20,height:20,borderRadius:'50%',background:C.white,boxShadow:C.shadow,position:'absolute',top:3,transition:'left 0.18s',left:accountForm.isActive?'20px':'3px'}}/>
          </button>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button style={S.btnSolid(C.sage)} onClick={saveAccount}>{isEdit?'Save Account':'Add Account'}</button>
          <button style={{...S.btnGhost,flex:0,padding:'11px 16px'}} onClick={()=>setShowAccountModal(false)}>Cancel</button>
        </div>
      </div>
    </div>;
  }

  function SettingsScreen({activeSection=null,onSectionChange=()=>{}}){
    const [clientIdInput,setClientIdInput]=useState(profile.googleClientId||'');
    const restoreFileRef=useRef(null);
    function exportAllData(){
      const data=JSON.stringify(profile,null,2);
      const blob=new Blob([data],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=`personal-hub-backup-${TODAY}.json`;a.click();
      URL.revokeObjectURL(url);
      updateProfile(p=>({...p,securitySettings:{...p.securitySettings,dataExportHistory:[...(p.securitySettings?.dataExportHistory||[]),TODAY]}}));
      showNotif('Backup exported','success');
    }
    function restoreAllData(e){
      const file=e.target.files?.[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=ev=>{
        try{
          const parsed=JSON.parse(ev.target?.result||'{}');
          if(!confirm('Restore this backup and replace current local data?'))return;
          const restored=normalizeLoadedProfile(parsed);
          setProfile(restored);
          storage.setJSON(STORAGE_KEYS.profile,restored);
          showNotif('Backup restored','success');
        }catch{
          showNotif('Backup restore failed','error');
        }finally{
          e.target.value='';
        }
      };
      reader.readAsText(file);
    }
    const sections=[
      {id:'app', label:'App'},
      {id:'workcal', label:'Work Calendar'},
      {id:'finance', label:'Finance'},
      {id:'google',  label:'Google Integration'},
      {id:'fitness', label:'Fitness Profile'},
      {id:'goals',   label:'Goals and Targets'},
      {id:'meals',   label:'Meal Preferences'},
      {id:'notifications',label:'Notifications'},
      {id:'security',    label:'Security & Data'},
    ];
    return <div style={S.body}>
      {sections.map(sec=><div key={sec.id} style={S.card}>
        <button style={{...S.row,width:'100%',background:'none',border:'none',cursor:'pointer',padding:0}} onClick={()=>onSectionChange(activeSection===sec.id?null:sec.id)}>
          <span style={{fontSize:14,fontWeight:600,color:C.tx}}>{sec.label}</span>
          <span style={{color:C.muted,fontSize:16}}>{activeSection===sec.id?'^':'v'}</span>
        </button>
        {activeSection===sec.id&&<div style={{marginTop:12,paddingTop:12,borderTop:`0.5px solid ${C.bd}`}}>
          {sec.id==='app'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
              Install controls now live on the Home screen when this browser makes them available. PWA installability and service workers only work when the app is served from localhost or HTTPS, not when opened from file://.
            </div>
            {isInstalled
              ?<div style={{...S.card,padding:'10px 12px',background:C.sageL,borderColor:'transparent'}}>
                <div style={{fontSize:13,fontWeight:600,color:C.sageDk,marginBottom:4}}>Installed</div>
                <div style={{fontSize:11,color:C.tx2}}>This device is already running the standalone app.</div>
              </div>
              :<div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>
                  Installation is not available right now. Open the app from a supported browser on localhost or HTTPS, then use the browser install or Add to Home Screen action if prompted.
                </div>
            }
          </div>}
          {sec.id==='finance'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
              Manage balances for your saved accounts here. Add, edit, archive, and restore accounts from the Finance tab. Everything stays local.
            </div>
            <span style={S.lbl}>Account Balances</span>
            {normalizeFinancialAccounts(financialAccounts).map(a=><div key={a.id} style={{...S.card,padding:'10px 12px',marginBottom:6}}>
              <div style={{...S.row,marginBottom:6}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.tx}}>{formatAccountLabel(a)}</div>
                  <div style={{fontSize:10,color:C.muted}}>{(ACCOUNT_TYPE_OPTIONS.find(option=>option.id===a.type)?.label)||'Other'}{a.isActive===false?' · archived':''}</div>
                </div>
                {a.currentBalance!=null&&<div style={{fontSize:15,fontWeight:700,color:C.sage}}>{fmtMoney(a.currentBalance)}</div>}
              </div>
              <div style={{display:'flex',gap:6}}>
                <FieldInput placeholder="Balance" type="number" defaultValue={a.currentBalance??''} style={{...S.inp,flex:1,padding:'6px 8px',fontSize:12}} onBlur={e=>updateAccountBalance(a.id,e.target.value,a.maskedNumber)}/>
                <FieldInput placeholder="••••" style={{...S.inp,width:60,padding:'6px 8px',fontSize:12}} defaultValue={a.maskedNumber} onBlur={e=>updateAccountBalance(a.id,a.currentBalance,e.target.value)}/>
              </div>
            </div>)}
            <div style={{height:8}}/>
            <span style={S.lbl}>Import Transactions (CSV)</span>
            <div style={{fontSize:11,color:C.muted,marginBottom:8,lineHeight:1.5}}>
              Export from Ally: Account → Transactions → Export → CSV<br/>
              Export from Regions: Online Banking → Transactions → Download → CSV
            </div>
            <button style={S.btnSolid(C.navy)} onClick={()=>setShowImport(true)}>Import CSV</button>
            <div style={{height:8}}/>
            <div style={{fontSize:11,color:C.muted}}>
              {(transactions||[]).length} transactions stored · {unreviewed} unreviewed
            </div>
          </div>}
          {sec.id==='workcal'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
              Manually enter work-unavailable windows so the app can plan workouts, meals, and tasks around them. Busy blocks are locked — the planner treats them like fixed meetings.
            </div>
            <div style={{fontSize:11,fontWeight:600,color:C.tx,marginBottom:6}}>Priority order</div>
            {[
              {n:'1',l:'Fixed Google events',c:C.navy},
              {n:'2',l:'Manual busy blocks',c:C.amber},
              {n:'3',l:'Meal prep',c:C.sage},
              {n:'4',l:'Workout',c:C.sage},
              {n:'5',l:'Tasks',c:C.muted},
            ].map(r=><div key={r.n} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <span style={{width:18,height:18,borderRadius:'50%',background:r.c,color:C.white,fontSize:10,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{r.n}</span>
              <span style={{fontSize:12,color:C.tx}}>{r.l}</span>
            </div>)}
            <div style={{marginTop:12,fontSize:11,color:C.muted,lineHeight:1.5}}>
              Add busy blocks from the Calendar tab. Use the quick presets for common patterns, or save a weekly pattern and apply it each Sunday.
            </div>
            <div style={{marginTop:10,fontSize:11,fontWeight:500,color:C.tx,marginBottom:4}}>Current busy blocks</div>
            {(busyBlocks||[]).length===0
              ?<div style={{fontSize:11,color:C.muted}}>None yet. Go to Calendar to add blocks.</div>
              :<div style={{maxHeight:180,overflowY:'auto'}}>
                {(busyBlocks||[]).map(b=>{
                  const cat=BUSY_CATEGORIES.find(c=>c.id===b.category)||{clr:C.muted,label:b.category};
                  return <div key={b.id} style={{...S.row,padding:'6px 0',borderBottom:`0.5px solid ${C.bd}`}}>
                    <div>
                      <div style={{fontSize:12,color:C.tx}}>{b.title}</div>
                      <div style={{fontSize:10,color:C.muted}}>{b.recurring?`Every ${'SMTWTFS'[b.dow||0]}`:formatDate(b.date,'weekdayMonthDayShort')} · {fmtTimeRange(b.startTime,b.endTime)} · <span style={{color:cat.clr}}>{cat.label}</span></div>
                    </div>
                    <button onClick={()=>deleteBusyBlock(b.id)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer'}}>x</button>
                  </div>;
                })}
              </div>
            }
          </div>}
          {sec.id==='google'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.5}}>
              Enter your Google OAuth Client ID to enable Calendar + Tasks sync. Serve this file via python3 -m http.server 8080 and add http://localhost:8080 to your GCP authorized origins.
            </div>
            <span style={S.lbl}>Google Client ID</span>
            <FieldInput value={clientIdInput} onChange={e=>setClientIdInput(e.target.value)} placeholder="123456789.apps.googleusercontent.com" style={{...S.inp,marginBottom:8}}/>
            <button style={S.btnSolid(C.navy)} onClick={()=>{updateProfile({googleClientId:clientIdInput});GoogleAPI.init(clientIdInput);showNotif('Client ID saved','success');}}>Save Client ID</button>
            <div style={{height:8}}/>
            {googleConnected
              ?<div>
                <div style={{fontSize:12,color:C.sage,marginBottom:8,fontWeight:500}}>Google connected</div>
                <button style={{...S.btnGhost,fontSize:12}} onClick={disconnectGoogle}>Disconnect Google</button>
              </div>
              :<button style={S.btnSolid(C.sage)} onClick={connectGoogle}>Connect Google Account</button>
            }
          </div>}
          {sec.id==='fitness'&&<div>
            {(()=>{
              const primaryProgram=(athlete.primaryProgram&&['hyrox','running','strength'].includes(athlete.primaryProgram))
                ?athlete.primaryProgram
                :(['hyrox','running','strength'].includes(fitnessProgram)?fitnessProgram:'hyrox');
              const addOns=Array.isArray(athlete.secondaryAddOns)
                ?athlete.secondaryAddOns.filter(id=>FITNESS_ADD_ON_OPTIONS.some(option=>option.id===id))
                :[];
              const selectedDays=orderTrainingDays(
                Array.isArray(athlete.preferredTrainingDays)&&athlete.preferredTrainingDays.length
                  ?athlete.preferredTrainingDays
                  :getAnchoredTrainingDays(athlete.programType||'4-day',athlete.trainingWeekStart||'Mon'),
                athlete.trainingWeekStart||'Mon'
              );
              const raceWeeks=trainingCycle.weeksToRace;
              const derivedSquat=athlete.squat5RM
                ?[{label:'60%',value:Math.round(athlete.squat5RM*0.60)},{label:'70%',value:Math.round(athlete.squat5RM*0.70)},{label:'80%',value:Math.round(athlete.squat5RM*0.80)},{label:'85%',value:Math.round(athlete.squat5RM*0.85)}]
                :[];
              const derivedDeadlift=athlete.deadlift5RM
                ?[{label:'60%',value:Math.round(athlete.deadlift5RM*0.60)},{label:'70%',value:Math.round(athlete.deadlift5RM*0.70)},{label:'80%',value:Math.round(athlete.deadlift5RM*0.80)},{label:'85%',value:Math.round(athlete.deadlift5RM*0.85)}]
                :[];
              const previewDays=weekPlannedWorkouts.slice(0,Math.max(4,selectedDays.length));
              const setPrimaryProgram=nextProgram=>updateProfile(p=>({
                ...p,
                fitnessProgram:nextProgram,
                athleteProfile:{...p.athleteProfile,primaryProgram:nextProgram}
              }));
              const toggleAddOn=id=>updateProfile(p=>{
                const current=Array.isArray(p.athleteProfile?.secondaryAddOns)?p.athleteProfile.secondaryAddOns:[];
                const next=current.includes(id)?current.filter(item=>item!==id):[...current,id];
                return{...p,athleteProfile:{...p.athleteProfile,secondaryAddOns:next}};
              });
              const toggleTrainingDay=label=>updateProfile(p=>{
                const anchor=p.athleteProfile?.trainingWeekStart||'Mon';
                const current=orderTrainingDays(
                  Array.isArray(p.athleteProfile?.preferredTrainingDays)&&p.athleteProfile.preferredTrainingDays.length
                    ?p.athleteProfile.preferredTrainingDays
                    :getAnchoredTrainingDays(p.athleteProfile?.programType||'4-day',anchor),
                  anchor
                );
                const hasDay=current.includes(label);
                let next=current;
                if(hasDay&&current.length>4){
                  next=current.filter(day=>day!==label);
                }else if(!hasDay&&current.length<5){
                  next=orderTrainingDays([...current,label],anchor);
                }
                const nextProgramType=next.length>=5?'5-day':'4-day';
                return{...p,athleteProfile:{...p.athleteProfile,preferredTrainingDays:next,programType:nextProgramType}};
              });
              const setTrainingWeekStart=option=>updateProfile(p=>{
                const currentDays=Array.isArray(p.athleteProfile?.preferredTrainingDays)&&p.athleteProfile.preferredTrainingDays.length
                  ?p.athleteProfile.preferredTrainingDays
                  :getAnchoredTrainingDays(p.athleteProfile?.programType||'4-day',option);
                return{
                  ...p,
                  athleteProfile:{
                    ...p.athleteProfile,
                    trainingWeekStart:option,
                    preferredTrainingDays:orderTrainingDays(currentDays,option),
                  }
                };
              });
              return <>
                <div style={S.card}>
                  <span style={S.lbl}>Program Setup</span>
                  <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:10}}>Choose the training system</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Primary program drives the weekly plan. Add-ons layer on support work.</div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Primary Program</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {['hyrox','running','strength','pilates','recovery'].map(id=><button key={id} type="button" onClick={()=>setPrimaryProgram(id)} style={{padding:'7px 12px',borderRadius:9,border:`1.5px solid ${primaryProgram===id?C.sage:C.bd}`,background:primaryProgram===id?C.sageL:'transparent',color:primaryProgram===id?C.sageDk:C.muted,fontSize:12,cursor:'pointer',fontWeight:primaryProgram===id?600:400}}>{FITNESS_PROGRAM_OPTIONS.find(option=>option.id===id)?.label||id}</button>)}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Secondary Add-Ons</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {FITNESS_ADD_ON_OPTIONS.map(({id,label})=><button key={id} onClick={()=>toggleAddOn(id)} style={{padding:'7px 12px',borderRadius:9,border:`1.5px solid ${addOns.includes(id)?C.navy:C.bd}`,background:addOns.includes(id)?C.navyL:'transparent',color:addOns.includes(id)?C.navyDk:C.muted,fontSize:12,cursor:'pointer',fontWeight:addOns.includes(id)?600:400}}>{label}</button>)}
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <span style={S.lbl}>Schedule</span>
                  <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:10}}>Pick exact training days</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Select 4 or 5 specific days. The current planner supports either 4-day or 5-day structures.</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(label=><button key={label} onClick={()=>toggleTrainingDay(label)} style={{padding:'7px 10px',minWidth:44,borderRadius:9,border:`1.5px solid ${selectedDays.includes(label)?C.sage:C.bd}`,background:selectedDays.includes(label)?C.sageL:'transparent',color:selectedDays.includes(label)?C.sageDk:C.muted,fontSize:12,cursor:'pointer',fontWeight:selectedDays.includes(label)?600:400}}>{label}</button>)}
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                    <span style={S.pill(C.surf,C.tx2)}>{selectedDays.length} selected</span>
                    <span style={S.pill(C.surf,C.tx2)}>{selectedDays.length>=5?'5-day structure':'4-day structure'}</span>
                  </div>
                  <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Training Week Anchor</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {['Sun','Mon','Wed'].map(option=><button key={option} onClick={()=>setTrainingWeekStart(option)} style={{padding:'7px 12px',borderRadius:9,border:`1.5px solid ${(athlete.trainingWeekStart||'Mon')===option?C.sage:C.bd}`,background:(athlete.trainingWeekStart||'Mon')===option?C.sageL:'transparent',color:(athlete.trainingWeekStart||'Mon')===option?C.sageDk:C.muted,fontSize:12,cursor:'pointer',fontWeight:(athlete.trainingWeekStart||'Mon')===option?600:400}}>{option==='Sun'?'Sunday Start':option==='Mon'?'Monday Start':'Wednesday Start'}</button>)}
                  </div>
                </div>

                <div style={S.card}>
                  <span style={S.lbl}>Performance Inputs</span>
                  <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:10}}>Enter anchor metrics</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                    <div>
                      <span style={S.lbl}>5K Time</span>
                      <FieldInput type="number" step="0.1" inputMode="decimal" value={athlete.fiveKTime||''} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,fiveKTime:parseFloat(e.target.value)||null}}))} placeholder="28.5 min" style={S.inp}/>
                    </div>
                    <div>
                      <span style={S.lbl}>Wall Ball Max</span>
                      <FieldInput type="number" step="1" inputMode="numeric" value={athlete.wallBallMaxReps||''} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,wallBallMaxReps:parseInt(e.target.value)||null}}))} placeholder="40 reps" style={S.inp}/>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    <div>
                      <span style={S.lbl}>Back Squat 5RM</span>
                      <FieldInput type="number" step="5" inputMode="numeric" value={athlete.squat5RM||''} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,squat5RM:parseInt(e.target.value)||null}}))} placeholder="185 lb" style={S.inp}/>
                    </div>
                    <div>
                      <span style={S.lbl}>Deadlift 5RM</span>
                      <FieldInput type="number" step="5" inputMode="numeric" value={athlete.deadlift5RM||''} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,deadlift5RM:parseInt(e.target.value)||null}}))} placeholder="225 lb" style={S.inp}/>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <span style={S.lbl}>Race Timeline</span>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                    <div>
                      <span style={S.lbl}>Race Date</span>
                      <FieldInput type="date" value={raceDate||DEFAULT_RACE} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,raceDate:e.target.value}}))} style={S.inp}/>
                    </div>
                    <div>
                      <span style={S.lbl}>Plan Start</span>
                      <FieldInput type="date" value={planStartDate||DEFAULT_START} onChange={e=>updateProfile(p=>({...p,athleteProfile:{...p.athleteProfile,planStartDate:e.target.value}}))} style={S.inp}/>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                    <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Weeks to race</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{raceWeeks}</div>
                    </div>
                    <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Training phase</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{PH?.name||trainingCycle.phase?.name}</div>
                    </div>
                    <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                      <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Current week</div>
                      <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{CUR_WK}</div>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <span style={S.lbl}>Derived Outputs</span>
                  <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:10}}>Training targets and preview</div>
                  <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Running Pace Zones</div>
                  {paceProfile
                    ?<div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:12}}>
                      {[{label:'Easy',value:paceProfile.easy},{label:'Threshold',value:paceProfile.threshold},{label:'Interval',value:paceProfile.interval},{label:'5K Pace',value:paceProfile.race5k}].map(item=><div key={item.label} style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>{item.label}</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{item.value}</div>
                      </div>)}
                    </div>
                    :<div style={{fontSize:11,color:C.muted,marginBottom:12}}>Add a 5K time to generate pace zones.</div>}

                  <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Working Weights from 5RM</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                    <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Back Squat</div>
                      {derivedSquat.length>0?derivedSquat.map(item=><div key={item.label} style={{...S.row,padding:'2px 0'}}><span style={{fontSize:11,color:C.tx2}}>{item.label}</span><span style={{fontSize:11,color:C.tx,fontWeight:600}}>{item.value} lb</span></div>):<div style={{fontSize:11,color:C.muted}}>Add a squat 5RM</div>}
                    </div>
                    <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Deadlift</div>
                      {derivedDeadlift.length>0?derivedDeadlift.map(item=><div key={item.label} style={{...S.row,padding:'2px 0'}}><span style={{fontSize:11,color:C.tx2}}>{item.label}</span><span style={{fontSize:11,color:C.tx,fontWeight:600}}>{item.value} lb</span></div>):<div style={{fontSize:11,color:C.muted}}>Add a deadlift 5RM</div>}
                    </div>
                  </div>

                  <div style={{fontSize:11,color:C.tx,marginBottom:6,fontWeight:600}}>Weekly Training Preview</div>
                  <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
                    {previewDays.map((item,idx)=><div key={`${item.plannedDate}-${idx}`} style={{...S.row,padding:'7px 0',borderBottom:idx<previewDays.length-1?`0.5px solid ${C.bd}`:'none',alignItems:'flex-start',gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.tx}}>{item.plannedDayLabel}</div>
                        <div style={{fontSize:11,color:C.tx2,marginTop:2}}>{item.plannedName}</div>
                      </div>
                      <span style={S.pill(item.status==='today'?C.navyL:C.surf,item.status==='today'?C.navyDk:C.muted)}>{item.status==='today'?'Today':formatWorkoutTypeLabel(item)}</span>
                    </div>)}
                  </div>
                </div>
              </>;
            })()}
          </div>}
          {sec.id==='goals'&&<div>
            <span style={S.lbl}>Daily Calorie Goal (kcal)</span>
            <FieldInput type="number" value={calGoal} onChange={e=>updateProfile({calGoal:parseInt(e.target.value)||2000})} style={{...S.inp,marginBottom:8}}/>
            <span style={S.lbl}>Daily Protein Goal (g)</span>
            <FieldInput type="number" value={proGoal} onChange={e=>updateProfile({proGoal:parseInt(e.target.value)||140})} style={{...S.inp,marginBottom:8}}/>
            <span style={S.lbl}>Daily Water Goal (oz)</span>
            <FieldInput type="number" value={hydGoal} onChange={e=>updateProfile({hydGoal:parseInt(e.target.value)||72})} style={S.inp}/>
          </div>}
          {sec.id==='meals'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Training day macros: {MACROS.protein}g protein · {MACROS.carbsTraining}g carbs · {MACROS.fat}g fat</div>
            <div style={{fontSize:12,color:C.muted}}>Rest day macros: {MACROS.protein}g protein · {MACROS.carbsRest}g carbs · {MACROS.fat}g fat</div>
          </div>}
          {sec.id==='notifications'&&<div>
            <span style={S.lbl}>Morning Reminder</span>
            <FieldInput type="time" value={profile.notifications?.morningTime||'07:00'} onChange={e=>updateProfile(p=>({...p,notifications:{...p.notifications,morningTime:e.target.value}}))} style={{...S.inp,marginBottom:8}}/>
            <span style={S.lbl}>Evening Reminder</span>
            <FieldInput type="time" value={profile.notifications?.eveningTime||'21:00'} onChange={e=>updateProfile(p=>({...p,notifications:{...p.notifications,eveningTime:e.target.value}}))} style={S.inp}/>
          </div>}
          {sec.id==='security'&&<div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>All data is stored locally on this device. Nothing is transmitted except optional Google OAuth tokens (session-only) and Plaid connections when configured.</div>
            <div style={{...S.row,marginBottom:12,paddingBottom:12,borderBottom:`0.5px solid ${C.bd}`}}>
              <div>
                <div style={{fontSize:13,color:C.tx,fontWeight:500}}>Analytics tracking</div>
                <div style={{fontSize:10,color:C.muted}}>Correlations across energy, sleep, workouts, spend</div>
              </div>
              <button onClick={()=>updateProfile(p=>({...p,securitySettings:{...p.securitySettings,analyticsEnabled:!p.securitySettings?.analyticsEnabled}}))} style={{width:40,height:24,borderRadius:12,background:(securitySettings?.analyticsEnabled!==false)?C.sage:C.surf,border:`1px solid ${C.bd}`,cursor:'pointer',position:'relative',flexShrink:0}}>
                <div style={{width:18,height:18,borderRadius:'50%',background:C.white,position:'absolute',top:2,transition:'left 0.2s',left:(securitySettings?.analyticsEnabled!==false)?'18px':'2px'}}/>
              </button>
            </div>
            <div style={{fontSize:11,fontWeight:500,color:C.tx,marginBottom:8}}>Connected services</div>
            <div style={{...S.row,padding:'8px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <div style={{fontSize:12,color:C.tx}}>Google Calendar / Tasks</div>
              {googleConnected?<button style={{...S.btnSmall(C.red)}} onClick={disconnectGoogle}>Disconnect</button>:<span style={{fontSize:11,color:C.muted}}>Not connected</span>}
            </div>
            <div style={{...S.row,padding:'8px 0',borderBottom:`0.5px solid ${C.bd}`,marginBottom:12}}>
              <div style={{fontSize:12,color:C.tx}}>Financial data</div>
              <button style={{...S.btnSmall(C.amber)}} onClick={()=>{if(confirm('Delete all transaction data?'))updateProfile(p=>({...p,transactions:[],recurringExpenses:[],merchantRules:{}}));}}>Clear</button>
            </div>
            <FieldInput ref={restoreFileRef} type="file" accept=".json,application/json" onChange={restoreAllData} style={{display:'none'}}/>
            <button style={{...S.btnGhost,width:'100%',textAlign:'center',marginBottom:8,fontSize:12}} onClick={exportAllData}>Export all data (JSON)</button>
            <button style={{...S.btnGhost,width:'100%',textAlign:'center',marginBottom:8,fontSize:12}} onClick={()=>restoreFileRef.current?.click()}>Restore backup (JSON)</button>
            {(securitySettings?.dataExportHistory||[]).length>0&&<div style={{fontSize:10,color:C.muted,textAlign:'center'}}>Last export: {securitySettings.dataExportHistory.slice(-1)[0]}</div>}
          </div>}
        </div>}
      </div>)}
      <div style={{...S.card,borderColor:C.red}}>
        <span style={{...S.lbl,color:C.red}}>Data</span>
        <button style={{...S.btnGhost,color:C.red,borderColor:C.red,width:'100%',textAlign:'center',fontSize:12}} onClick={()=>{
          if(!confirm('Clear all data? This cannot be undone.'))return;
          Promise.all([
            storage.setJSON(STORAGE_KEYS.profile,DEFAULT_OPS),
            storage.remove(STORAGE_KEYS.navigation),
            storage.remove(STORAGE_KEYS.activeWorkout),
            storage.remove(STORAGE_KEYS.dailyCheckin),
            storage.remove(STORAGE_KEYS.growth),
          ]).then(()=>window.location.reload());
        }}>Reset All Data</button>
      </div>
      <div style={{textAlign:'center',padding:'16px 0',fontSize:10,color:C.muted}}>Personal Ops Hub · v1.0 · {TODAY}</div>
    </div>;
  }

  function NavIcon({id,active}){
    const clr=active?C.white:C.muted;
    // All paths are Material Design 24x24 viewBox
    const p={
      // House outline → filled on active
      home:'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
      // Calendar grid
      calendar:'M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z',
      // Checklist with dots
      tasks:'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 13h14v-2H7v2zm0-6v2h14V7H7zm0 10h14v-2H7v2z',
      // Inbox tray
      inbox:'M19 3H4.99C3.88 3 3 3.9 3 5l.01 14c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12h-4c0 1.66-1.34 3-3 3s-3-1.34-3-3H5V5h14v10z',
      // Dumbbell diagonal (Material Design fitness_center)
      training:'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 5.57 2 7.71 3.43 9.14 2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22 14.86 20.57 16.28 22 18.43 19.86 19.85 18.43 22 16.28 20.57 14.86z',
      // Fork and knife / restaurant
      meals:'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
      // Menu / more
      more:'M4 10.5c-.83 0-1.5.67-1.5 1.5S3.17 13.5 4 13.5s1.5-.67 1.5-1.5S4.83 10.5 4 10.5zm8 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm8 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z',
      // Heart pulse / ECG line (health monitoring)
      health:'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
      // Wallet
      finance:'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
      maintenance:'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.4l4.3 4.3-3 3-4.2-4.2c-1.1 2.4-.6 5.3 1.4 7.3 1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1 2.5-2.6z',
      // Line chart / show_chart
      insights:'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
      // Habit check circle
      habits:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
      // Gear / settings
      settings:'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    };
    return <svg width="24" height="24" viewBox="0 0 24 24" fill={clr}><path d={p[id]||''}/></svg>;
  }

  function HealthScreen({activeTab='recovery',onTabChange=()=>{}}){
    const hTab=HEALTH_TAB_IDS.includes(activeTab)?activeTab:'recovery';
    const todayLog=dailyLogs?.[TODAY]||{};
    const records=healthRecords||{cycle:{currentDay:null,phase:''},medications:[],appointments:[],labs:[],notes:''};

    // Last 7 days for vitals history
    const last7=Array.from({length:7},(_,i)=>{
      const d=new Date(NOW);d.setDate(d.getDate()-i);
      const ds=formatDateKey(d);
      return {ds,label:['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()],log:dailyLogs?.[ds]||null};
    }).reverse();
    const soreness=todayLog.soreness||3;
    const mobility=todayLog.mobility||3;
    const symptoms=todayLog.symptoms||'';
    const cycleDay=records.cycle?.currentDay||'';
    const cyclePhase=records.cycle?.phase||'';
    const HTABS=['recovery','wellness','body','care','library'];

    return <div style={S.body}>
      <div style={{display:'flex',gap:4,marginBottom:12,overflowX:'auto'}}>
        {HTABS.map(t=><button key={t} onClick={()=>onTabChange(t)} style={{flexShrink:0,padding:'7px 14px',borderRadius:10,border:`0.5px solid ${hTab===t?C.sage:C.bd}`,background:hTab===t?C.sageL:'transparent',color:hTab===t?C.sageDk:C.muted,fontSize:11,fontWeight:hTab===t?600:400,cursor:'pointer',textTransform:'capitalize'}}>{t}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
        <button style={{...S.btnGhost,fontSize:11,padding:'8px 10px'}} onClick={()=>openTab('training')}>Open Fitness</button>
        <button style={{...S.btnGhost,fontSize:11,padding:'8px 10px'}} onClick={()=>openTab('meals')}>Open Nutrition</button>
        <button style={{...S.btnGhost,fontSize:11,padding:'8px 10px'}} onClick={()=>openTab('habits')}>Open Lifestyle</button>
      </div>

      {hTab==='recovery'&&<div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:10}}>
            <div>
              <span style={S.lbl}>Recovery Today</span>
              <div style={{fontSize:17,fontWeight:700,color:C.tx}}>{recoveryToday.level}</div>
            </div>
            <span style={S.pill(recoveryToday.level==='Low'?C.redL:recoveryToday.level==='Moderate'?C.amberL:C.sageL,recoveryToday.level==='Low'?C.red:recoveryToday.level==='Moderate'?C.amberDk:C.sageDk)}>{recoveryToday.readiness}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Sleep</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{todayLog.sleepHours||'—'}h</div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Energy</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{todayLog.energyScore||'—'}/10</div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Soreness</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{soreness}/5</div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Mobility</div>
              <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{mobility}/5</div>
            </div>
          </div>
        </div>
        <div style={S.card}>
          <span style={S.lbl}>Body feedback</span>
          <div style={{fontSize:10,color:C.muted,marginBottom:8}}>Keep body-state inputs here. Behavior tracking lives in Lifestyle.</div>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            {[1,2,3,4,5].map(val=><button key={val} style={{...S.btnGhost,flex:1,fontSize:11,borderColor:soreness===val?C.red:C.bd,color:soreness===val?C.red:C.muted,background:soreness===val?C.redL:'transparent'}} onClick={()=>saveDailyLog({soreness:val})}>S{val}</button>)}
          </div>
          <div style={{display:'flex',gap:6}}>
            {[1,2,3,4,5].map(val=><button key={val} style={{...S.btnGhost,flex:1,fontSize:11,borderColor:mobility===val?C.navy:C.bd,color:mobility===val?C.navy:C.muted,background:mobility===val?C.navyL:'transparent'}} onClick={()=>saveDailyLog({mobility:val})}>M{val}</button>)}
          </div>
        </div>
      </div>}

      {hTab==='wellness'&&<div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Hydration today</span>
            <span style={{fontSize:12,color:C.muted}}>{todayH} / {hydGoal} oz</span>
          </div>
          <ProgressBar value={todayH} max={hydGoal} color={C.navy}/>
          <div style={{display:'flex',gap:5,marginTop:10,flexWrap:'wrap'}}>
            {[8,12,16,20].map(oz=><button key={oz} style={S.btnSmall(C.navy)} onClick={()=>updateProfile(p=>({...p,hydr:{...p.hydr,[TODAY]:Math.max(0,(p.hydr[TODAY]||0)+oz)}}))}>+{oz} oz</button>)}
          </div>
        </div>
        <div style={S.card}>
          <span style={S.lbl}>Energy and sleep — last 7 days</span>
          {last7.every(d=>!d.log)?<div style={{fontSize:12,color:C.muted,padding:'12px 0',textAlign:'center'}}>No data yet. Log your energy from the Home screen.</div>
          :<div>
            {last7.map(({ds,label,log})=><div key={ds} style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <div style={{width:28,flexShrink:0}}>
                <div style={{fontSize:9,color:C.muted}}>{label}</div>
                <div style={{fontSize:10,color:C.muted}}>{ds.slice(5)}</div>
              </div>
              {log?.energyScore?<div style={{flex:1,display:'flex',gap:6,alignItems:'center'}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',gap:2}}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n=><div key={n} style={{flex:1,height:6,borderRadius:2,background:n<=log.energyScore?C.sage:C.surf}}/>)}
                  </div>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:C.tx,width:20,textAlign:'right'}}>{log.energyScore}</span>
                {log.sleepHours&&<span style={{fontSize:10,color:C.muted,width:28,textAlign:'right'}}>{log.sleepHours}h</span>}
              </div>:<div style={{flex:1,fontSize:11,color:C.muted}}>not logged</div>}
            </div>)}
          </div>}
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Symptoms</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const next=prompt('Symptoms or notes for today?',symptoms)||'';
              saveDailyLog({symptoms:next});
            }}>Update</button>
          </div>
          <div style={{fontSize:12,color:C.tx}}>{symptoms||'No symptoms logged today.'}</div>
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Cycle</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const currentDay=prompt('Cycle day?',cycleDay)||'';
              const phase=prompt('Cycle phase?',cyclePhase)||'';
              updateProfile(p=>({...p,healthRecords:{...(p.healthRecords||{}),cycle:{currentDay,phase}}}));
            }}>Update</button>
          </div>
          <div style={{fontSize:12,color:C.tx}}>Day {cycleDay||'—'}{cyclePhase?` · ${cyclePhase}`:''}</div>
        </div>
      </div>}

      {hTab==='body'&&<div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Biometrics</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const weight=prompt('Body weight (lb)?',todayLog.weight||profile.userProfile?.weight||'')||'';
              const restingHr=prompt('Resting HR?',todayLog.restingHr||'')||'';
              const hrv=prompt('HRV?',todayLog.hrv||'')||'';
              saveDailyLog({weight:parseFloat(weight)||null,restingHr:parseInt(restingHr)||null,hrv:parseInt(hrv)||null});
            }}>Log</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Weight</div>
              <div style={{fontSize:15,fontWeight:700,color:C.tx}}>{todayLog.weight||profile.userProfile?.weight||'—'}</div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Resting HR</div>
              <div style={{fontSize:15,fontWeight:700,color:C.tx}}>{todayLog.restingHr||'—'}</div>
            </div>
            <div style={{background:C.surf,borderRadius:12,padding:'10px'}}>
              <div style={{fontSize:9,color:C.muted,marginBottom:4}}>HRV</div>
              <div style={{fontSize:15,fontWeight:700,color:C.tx}}>{todayLog.hrv||'—'}</div>
            </div>
          </div>
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Labs</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const label=prompt('Lab result label?');
              if(!label)return;
              const value=prompt('Value / note?')||'';
              updateProfile(p=>({...p,healthRecords:{...(p.healthRecords||{}),labs:[{id:Date.now(),label,value,date:TODAY},...((p.healthRecords?.labs)||[])].slice(0,8)}}));
            }}>Add</button>
          </div>
          {((records.labs)||[]).length===0?<div style={{fontSize:12,color:C.muted}}>No labs logged yet.</div>:(records.labs||[]).map((lab,idx)=><div key={lab.id||idx} style={{...S.row,padding:'8px 0',borderBottom:idx<(records.labs||[]).length-1?`0.5px solid ${C.bd}`:'none'}}>
            <div>
              <div style={{fontSize:12,color:C.tx}}>{lab.label}</div>
              <div style={{fontSize:10,color:C.muted}}>{lab.value} · {formatDate(lab.date,'monthDayShort')}</div>
            </div>
          </div>)}
        </div>
      </div>}

      {hTab==='care'&&<div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Medications</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const name=prompt('Medication or supplement name?');
              if(!name)return;
              const dose=prompt('Dose / instructions?')||'';
              updateProfile(p=>({...p,healthRecords:{...(p.healthRecords||{}),medications:[{id:Date.now(),name,dose},...((p.healthRecords?.medications)||[])].slice(0,10)}}));
            }}>Add</button>
          </div>
          {((records.medications)||[]).length===0?<div style={{fontSize:12,color:C.muted}}>No medications logged.</div>:(records.medications||[]).map((med,idx)=><div key={med.id||idx} style={{padding:'8px 0',borderBottom:idx<(records.medications||[]).length-1?`0.5px solid ${C.bd}`:'none'}}>
            <div style={{fontSize:12,color:C.tx}}>{med.name}</div>
            <div style={{fontSize:10,color:C.muted}}>{med.dose}</div>
          </div>)}
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:8}}>
            <span style={S.lbl}>Appointments</span>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>{
              const title=prompt('Appointment title?');
              if(!title)return;
              const date=prompt('Date?',TODAY)||TODAY;
              updateProfile(p=>({...p,healthRecords:{...(p.healthRecords||{}),appointments:[{id:Date.now(),title,date},...((p.healthRecords?.appointments)||[])].slice(0,10)}}));
            }}>Add</button>
          </div>
          {((records.appointments)||[]).length===0?<div style={{fontSize:12,color:C.muted}}>No appointments scheduled.</div>:(records.appointments||[]).map((appt,idx)=><div key={appt.id||idx} style={{...S.row,padding:'8px 0',borderBottom:idx<(records.appointments||[]).length-1?`0.5px solid ${C.bd}`:'none'}}>
            <span style={{fontSize:12,color:C.tx}}>{appt.title}</span>
            <span style={{fontSize:10,color:C.muted}}>{formatDate(appt.date,'primary')}</span>
          </div>)}
        </div>
      </div>}

      {hTab==='library'&&<div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>On-demand sessions for recovery days. Tap Start to launch in Training.</div>
        {['Pilates','Mobility','Recovery','Stretching'].map(cat=>{
          const sessions=RECOVERY_LIBRARY_SESSIONS.filter(s=>s.libraryCategory===cat);
          if(!sessions.length)return null;
          const accent=cat==='Pilates'?C.sage:cat==='Mobility'?C.amber:cat==='Recovery'?C.navy:C.sageDk;
          const accentL=cat==='Pilates'?C.sageL:cat==='Mobility'?C.amberL:cat==='Recovery'?C.navyL:C.sageL;
          return <div key={cat} style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:6,paddingLeft:2}}>{cat}</div>
            {sessions.map(session=><div key={session.id||session.name} style={{...S.card,padding:'12px',marginBottom:6,borderLeft:`3px solid ${accent}`}}>
              <div style={{...S.row,alignItems:'flex-start',gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{session.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{session.duration||session.dur} · {cat}</div>
                  <div style={{fontSize:11,color:C.tx2,marginTop:4,lineHeight:1.4}}>{session.purpose}</div>
                </div>
                <button style={{...S.btnSmall(accent),flexShrink:0}} onClick={()=>{
                  const hydrated=hydrateWorkoutSession({...session,warmup:getWarmupForCategory(session.warmupKey||'mobility'),cooldown:getCooldownForCategory(session.cooldownKey||'mobility')});
                  launchWorkout(hydrated);
                  openTab('training');
                }}>Start</button>
              </div>
            </div>)}
          </div>;
        })}
      </div>}
    </div>;
  }

  function InsightsScreen(){
    const [weekReviewCard,setWeekReviewCard]=useState(null);
    const growthEvents=Array.isArray(growthState.events)?growthState.events:[];
    const growthCount=type=>growthEvents.filter(event=>event.type===type).length;
    const activationSummary=[
      {label:'App opens',value:growthCount('app_open')},
      {label:'Onboarding shown',value:growthCount('onboarding_shown')},
      {label:'Install CTA shown',value:growthCount('install_cta_shown')},
      {label:'Installs accepted',value:growthCount('install_accepted')},
      {label:'First value reached',value:growthState.firstValueAt?1:0},
    ];
    function generateWeeklyReview(){
      const wkStart=weekKey(NOW);
      const wkEnd=addDaysIso(wkStart,7);
      const weekDays=Array.from({length:7},(_,i)=>addDaysIso(wkStart,i));
      const tasksCompleted=(taskHistory||[]).filter(t=>t.done&&t.updatedAt&&t.updatedAt.slice(0,10)>=wkStart&&t.updatedAt.slice(0,10)<wkEnd).length;
      const tasksTotal=(taskHistory||[]).filter(t=>!t.parentId&&t.date>=wkStart&&t.date<wkEnd).length;
      const workoutsCount=(workoutHistory||[]).filter(h=>h.date>=wkStart&&h.date<wkEnd).length;
      const dailyHabitCount=(habits||[]).filter(h=>h.frequencyType==='daily').length;
      const habitDueCounts=weekDays.length*dailyHabitCount;
      const habitDone=weekDays.reduce((s,d)=>s+((dailyLogs[d]?.habitsCompleted||[]).length),0);
      const habitRate=habitDueCounts>0?Math.round((habitDone/habitDueCounts)*100):null;
      const energyLogs=weekDays.map(d=>dailyLogs[d]?.energyScore).filter(Boolean);
      const avgEnergyWk=energyLogs.length?+(energyLogs.reduce((s,n)=>s+n,0)/energyLogs.length).toFixed(1):null;
      const snapshot={
        week:wkStart,
        weekLabel:`Week of ${wkStart}`,
        createdAt:new Date().toISOString(),
        workouts:workoutsCount,
        inboxPending:(inboxItems||[]).filter(x=>x.status==='pending').length,
        transactions:(transactions||[]).filter(t=>t.date>=wkStart&&t.date<wkEnd).length,
        habitsCompleted:weekDays.filter(d=>(dailyLogs[d]?.habitsCompleted||[]).length>0).length,
        tasksCompleted,
        tasksTotal,
        workoutsCount,
        habitRate,
        avgEnergy:avgEnergyWk,
      };
      updateProfile(p=>({...p,weeklySnapshots:[snapshot,...(p.weeklySnapshots||[])]}));
      setWeekReviewCard(snapshot);
      showNotif('Weekly review saved','success');
    }
    const logs=Object.values(dailyLogs||{}).filter(l=>l.energyScore);
    const withSleep7=logs.filter(l=>l.sleepHours>=7);
    const withSleep6=logs.filter(l=>l.sleepHours<6);
    const avgEnergy=logs.length?+(logs.reduce((s,l)=>s+l.energyScore,0)/logs.length).toFixed(1):null;
    const avgE7=withSleep7.length?+(withSleep7.reduce((s,l)=>s+l.energyScore,0)/withSleep7.length).toFixed(1):null;
    const avgE6=withSleep6.length?+(withSleep6.reduce((s,l)=>s+l.energyScore,0)/withSleep6.length).toFixed(1):null;
    const withWkt=logs.filter(l=>l.workoutDone);
    const withoutWkt=logs.filter(l=>!l.workoutDone);
    const avgEWkt=withWkt.length?+(withWkt.reduce((s,l)=>s+l.energyScore,0)/withWkt.length).toFixed(1):null;
    const avgENoWkt=withoutWkt.length?+(withoutWkt.reduce((s,l)=>s+l.energyScore,0)/withoutWkt.length).toFixed(1):null;
    const totalWorkouts=workoutHistory.length;
    const totalMiles=workoutHistory.filter(h=>h.type==='run').reduce((s,h)=>s+(parseFloat(h.data?.dist2)||0),0);
    const longestStreak=(habits||[]).reduce((best,h)=>Math.max(best,computeStreak(h,dailyLogs)),0);
    const snapshots=[...(profile.weeklySnapshots||[])].slice().reverse();
    const lowRecoveryRuns=workoutHistory.filter(h=>h.type==='run'&&h.data?.recoveryState==='Low');
    const strongRecoveryRuns=workoutHistory.filter(h=>h.type==='run'&&h.data?.recoveryState==='High');
    const avgRunDistance=(entries)=>entries.length?entries.reduce((s,h)=>s+(parseFloat(h.data?.dist2)||0),0)/entries.length:null;
    const lowVsHighRunDelta=avgRunDistance(strongRecoveryRuns)&&avgRunDistance(lowRecoveryRuns)
      ?Math.round((1-(avgRunDistance(lowRecoveryRuns)/avgRunDistance(strongRecoveryRuns)))*100)
      :null;
    const insightItems=[];
    if(avgE7&&avgE6){
      const diff=+(avgE7-avgE6).toFixed(1);
      insightItems.push(diff>0
        ?`Your energy is ${diff} points higher when sleep reaches 7+ hours.`
        :`Sleep consistency is not yet showing a clear energy benefit.`);
    }
    if(lowVsHighRunDelta!=null){
      insightItems.push(lowVsHighRunDelta>0
        ?`Low recovery days reduce logged run output by about ${lowVsHighRunDelta}% versus high recovery days.`
        :`Run output stays relatively stable even on lower recovery days.`);
    }
    if((athlete?.weakStations||[]).length>0){
      insightItems.push(`${athlete.weakStations[0]} is currently your weakest station. Build drills around it.`);
    }
    if(!insightItems.length){
      insightItems.push('Log more recovery and workout data to unlock stronger pattern detection.');
    }
    return <div style={S.body}>
      <div style={S.card}>
        <span style={S.lbl}>Activation Funnel</span>
        <div style={{fontSize:15,fontWeight:700,color:C.tx,marginBottom:10}}>Local growth metrics</div>
        {activationSummary.map((item,idx)=><div key={item.label} style={{...S.row,padding:'7px 0',borderBottom:idx<activationSummary.length-1?`0.5px solid ${C.bd}`:'none'}}>
          <span style={{fontSize:12,color:C.muted}}>{item.label}</span>
          <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{item.value}</span>
        </div>)}
        <div style={{display:'grid',gap:6,marginTop:12}}>
          {[
            {label:'Morning check-in',done:growthState.activationChecklist.checkInCompleted},
            {label:'Set priorities',done:growthState.activationChecklist.prioritiesSet},
            {label:'Complete one action',done:growthState.activationChecklist.actionCompleted},
          ].map(item=><div key={item.label} style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:C.tx2}}>
            <span style={{width:16,height:16,borderRadius:999,background:item.done?C.sage:C.surf,color:item.done?C.white:C.muted,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>{item.done?'✓':'•'}</span>
            <span>{item.label}</span>
          </div>)}
        </div>
      </div>
      <div style={S.card}>
        <div style={{...S.row,marginBottom:weekReviewCard?12:0}}>
          <div><span style={S.lbl}>Weekly Review</span><div style={{fontSize:14,fontWeight:600,color:C.tx}}>Capture this week's data</div></div>
          <button style={S.btnSmall(C.sage)} onClick={generateWeeklyReview}>Generate</button>
        </div>
        {weekReviewCard&&<div style={{background:C.surf,borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:6}}>{weekReviewCard.weekLabel}</div>
          <div style={{...S.row,padding:'4px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Tasks completed</span>
            <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{weekReviewCard.tasksCompleted} / {weekReviewCard.tasksTotal}</span>
          </div>
          <div style={{...S.row,padding:'4px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Workouts</span>
            <span style={{fontSize:13,fontWeight:600,color:C.sage}}>{weekReviewCard.workoutsCount}</span>
          </div>
          {weekReviewCard.habitRate!=null&&<div style={{...S.row,padding:'4px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Habit completion</span>
            <span style={{fontSize:13,fontWeight:600,color:weekReviewCard.habitRate>=70?C.sage:C.amber}}>{weekReviewCard.habitRate}%</span>
          </div>}
          {weekReviewCard.avgEnergy!=null&&<div style={{...S.row,padding:'4px 0'}}>
            <span style={{fontSize:11,color:C.muted}}>Avg energy</span>
            <span style={{fontSize:13,fontWeight:600,color:C.tx}}>{weekReviewCard.avgEnergy}/10</span>
          </div>}
        </div>}
      </div>
      <div style={S.card}>
        <span style={S.lbl}>Interpretation</span>
        <div style={{fontSize:15,fontWeight:700,color:C.tx,marginBottom:8}}>Auto-generated patterns</div>
        {insightItems.map((item,idx)=><div key={idx} style={{fontSize:12,color:C.tx,marginBottom:idx<insightItems.length-1?8:0}}>{item}</div>)}
      </div>
      {/* Health trends */}
      <div style={S.card}>
        <span style={S.lbl}>Health Trends</span>
        {logs.length<3?<div style={{fontSize:12,color:C.muted}}>Log energy for 3+ days to see correlations.</div>:<div>
          <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:12,color:C.muted}}>Avg energy score</span>
            <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{avgEnergy}/10</span>
          </div>
          {avgE7&&<div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Energy w/ 7+ hrs sleep</span>
            <span style={{fontSize:13,fontWeight:600,color:C.sage}}>{avgE7}</span>
          </div>}
          {avgE6&&<div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Energy w/ &lt;6 hrs sleep</span>
            <span style={{fontSize:13,fontWeight:600,color:C.red}}>{avgE6}</span>
          </div>}
          {avgEWkt&&<div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
            <span style={{fontSize:11,color:C.muted}}>Energy on workout days</span>
            <span style={{fontSize:13,fontWeight:600,color:C.sage}}>{avgEWkt}</span>
          </div>}
          {avgENoWkt&&<div style={{...S.row,padding:'7px 0'}}>
            <span style={{fontSize:11,color:C.muted}}>Energy on rest days</span>
            <span style={{fontSize:13,fontWeight:600,color:C.muted}}>{avgENoWkt}</span>
          </div>}
        </div>}
      </div>
      {/* Fitness summary */}
      <div style={S.card}>
        <span style={S.lbl}>Fitness</span>
        <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.muted}}>Total workouts logged</span>
          <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{totalWorkouts}</span>
        </div>
        <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.muted}}>Total miles run</span>
          <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{totalMiles.toFixed(1)}</span>
        </div>
        <div style={{...S.row,padding:'7px 0'}}>
          <span style={{fontSize:12,color:C.muted}}>Days to race</span>
          <span style={{fontSize:14,fontWeight:700,color:PH.clr}}>{DTR}</span>
        </div>
      </div>
      {/* Finance summary */}
      {(transactions||[]).length>0&&<div style={S.card}>
        <span style={S.lbl}>Finance Trends</span>
        <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.muted}}>This month spend</span>
          <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{fmtMoney(monthSpend)}</span>
        </div>
        <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.muted}}>Recurring total / mo</span>
          <span style={{fontSize:14,fontWeight:700,color:C.tx}}>{fmtMoney((recurringExpenses||[]).reduce((s,r)=>s+r.averageAmount,0))}</span>
        </div>
        {catSpend.slice(0,1).map(c=><div key={c.id} style={{...S.row,padding:'7px 0'}}>
          <span style={{fontSize:12,color:C.muted}}>Top category</span>
          <span style={{fontSize:13,fontWeight:600,color:c.clr}}>{c.label} {fmtMoney(c.total)}</span>
        </div>)}
      </div>}
      {/* Habits */}
      {(habits||[]).length>0&&<div style={S.card}>
        <span style={S.lbl}>Habit Trends</span>
        <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.muted}}>Longest current streak</span>
          <span style={{fontSize:14,fontWeight:700,color:C.sage}}>{longestStreak}d</span>
        </div>
        {(habits||[]).map(h=><div key={h.id} style={{...S.row,padding:'6px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <span style={{fontSize:12,color:C.tx}}>{h.name}</span>
          <span style={{fontSize:12,fontWeight:600,color:C.muted}}>{computeStreak(h,dailyLogs)}d</span>
        </div>)}
      </div>}
      <div style={S.card}>
        <span style={S.lbl}>History Timeline</span>
        {snapshots.length===0?<div style={{fontSize:12,color:C.muted}}>No weekly snapshots yet.</div>:snapshots.slice(0,8).map(s=><div key={s.week} style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
          <div>
            <div style={{fontSize:12,color:C.tx}}>Week of {s.week}</div>
            <div style={{fontSize:10,color:C.muted}}>{s.workouts} workouts · {s.transactions} transactions · {s.inboxPending} inbox items</div>
          </div>
          <span style={{fontSize:10,color:C.muted}}>{formatDate(s.createdAt,'monthDayShort')}</span>
        </div>)}
      </div>
      {/* Home maintenance */}
      <div style={S.card}>
        <span style={S.lbl}>Home Maintenance</span>
        {(()=>{
          const done=maintenanceQueue.filter(item=>item.lastCompleted);
          const overdue=maintenanceQueue.filter(item=>item.status==='overdue');
          return <div>
            <div style={{...S.row,padding:'7px 0',borderBottom:`0.5px solid ${C.bd}`}}>
              <span style={{fontSize:12,color:C.muted}}>Tasks completed</span>
              <span style={{fontSize:14,fontWeight:700,color:C.sage}}>{done.length}</span>
            </div>
            <div style={{...S.row,padding:'7px 0'}}>
              <span style={{fontSize:12,color:C.muted}}>Overdue</span>
              <span style={{fontSize:14,fontWeight:700,color:overdue.length>0?C.red:C.sage}}>{overdue.length}</span>
            </div>
          </div>;
        })()}
      </div>
    </div>;
  }

  function MoreScreen(){
    const openTaskCount=Array.isArray(taskHistory)?taskHistory.filter(t=>!t.done&&!t.parentId&&(t.status||'active')==='active').length:0;
    const financeReviewCount=typeof unreviewed==='number'?unreviewed:0;
    const urgentMaintenanceCount=Array.isArray(maintenanceAttentionItems)?maintenanceAttentionItems.length:0;
    const nextMaintenanceItem=Array.isArray(maintenanceAttentionItems)?maintenanceAttentionItems[0]:null;
    const secondarySections=[
      {
        title:'Recovery and Health',
        items:[
          {id:'health',label:'Recovery',detail:'Sleep, recovery, wellness, appointments, and biometrics.'},
          {id:'habits',label:'Lifestyle',detail:'Routines, repeated behaviors, and low-friction structure.'},
        ],
      },
      {
        title:'Operations',
        items:[
          {id:'maintenance',label:'Maintenance',detail:nextMaintenanceItem?`Next: ${nextMaintenanceItem.label} · ${getMaintenanceNextLabel(nextMaintenanceItem)}`:'No action due today.'},
          {id:'tasks',label:'Tasks',detail:`${openTaskCount} open task${openTaskCount!==1?'s':''} across your system.`},
          {id:'finance',label:'Finance',detail:`${financeReviewCount} transaction${financeReviewCount!==1?'s':''} waiting for review.`},
        ],
      },
      {
        title:'Review and Settings',
        items:[
          {id:'insights',label:'Insights',detail:'Patterns, history, and weekly review summaries.'},
          {id:'settings',label:'Settings',detail:'Backup, restore, preferences, and app controls.'},
        ],
      },
    ];

    return <div style={S.body}>
      <div style={S.card}>
        <div style={{...S.row,alignItems:'flex-start',marginBottom:8}}>
          <div>
            <span style={S.lbl}>More</span>
            <div style={{fontSize:18,fontWeight:700,color:C.tx}}>Secondary workspaces</div>
          </div>
          {urgentMaintenanceCount>0&&<span style={S.pill(C.redL,C.red)}>{urgentMaintenanceCount} urgent</span>}
        </div>
        <div style={{fontSize:12,color:C.tx2}}>Today, Calendar, Nutrition, and Fitness stay in the primary nav. Everything else lives here.</div>
      </div>

      {secondarySections.map(section=><div key={section.title} style={S.card}>
        <span style={S.lbl}>{section.title}</span>
        {section.items.map(item=><button key={item.id} onClick={()=>openTab(item.id)} style={{width:'100%',textAlign:'left',background:'transparent',border:'none',padding:'10px 0',cursor:'pointer',borderBottom:`0.5px solid ${C.bd}`}}>
          <div style={{...S.row,alignItems:'flex-start',gap:10}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:C.tx}}>{item.label}</div>
              <div style={{fontSize:11,color:C.tx2,marginTop:2}}>{item.detail}</div>
            </div>
            <div style={{fontSize:16,color:C.muted,flexShrink:0}}>›</div>
          </div>
        </button>)}
      </div>)}

      <div style={S.card}>
        <div style={{...S.row,marginBottom:10}}>
          <div>
            <span style={S.lbl}>Quick Planning</span>
            <div style={{fontSize:16,fontWeight:700,color:C.tx}}>Weekly setup and command access</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <button style={{...S.btnGhost,width:'100%'}} onClick={()=>setShowWeeklyPlanner(true)}>Open Weekly Planner</button>
          <button style={{...S.btnGhost,width:'100%'}} onClick={openBrainDump}>Open Brain Dump</button>
        </div>
      </div>
    </div>;
  }

  // Primary navigation: Today · Calendar · Nutrition · Fitness · More
  const NAV_ITEMS=[
    {id:'home',label:'Today'},
    {id:'calendar',label:'Calendar'},
    {id:'meals',label:'Nutrition'},
    {id:'training',label:'Fitness'},
    {id:'more',label:'More'},
  ];
  const MORE_TAB_IDS=new Set(['tasks','finance','habits','health','maintenance','insights','settings','more']);
  const TAB_TITLES={
    home:'Today',
    calendar:'Calendar',
    tasks:'Tasks',
    training:'Fitness',
    meals:'Nutrition',
    finance:'Finance',
    habits:'Lifestyle',
    health:'Recovery',
    maintenance:'Maintenance',
    insights:'Insights',
    settings:'Settings',
    more:'More',
  };
  const SCREENS={
    home:HomeScreenV2,
    calendar:()=>React.createElement(CalendarScreen,{focusDay:calendarFocusDay,onSelectDay:setCalendarFocusDay}),
    tasks:()=>React.createElement(TasksScreen,{activeTab:taskScreenTab,onTabChange:setTaskScreenTab}),
    training:TrainingScreen,
    meals:MealsScreen,
    finance:()=>React.createElement(FinanceScreen,{activeView:finView,onViewChange:setFinView}),
    habits:()=>React.createElement(LifestyleScreen,{activeTab:lifestyleScreenTab,onTabChange:setLifestyleScreenTab,lifestyleOpen,setLifestyleOpen}),
    health:()=>React.createElement(HealthScreen,{activeTab:healthScreenTab,onTabChange:setHealthScreenTab}),
    maintenance:MaintenanceScreen,
    insights:InsightsScreen,
    settings:()=>React.createElement(SettingsScreen,{activeSection:settingsSection,onSectionChange:setSettingsSection}),
    more:MoreScreen
  };
  const activePrimaryTab=MORE_TAB_IDS.has(tab)?'more':(NAV_ITEMS.some(item=>item.id===tab)?tab:null);
  const ActiveScreen=SCREENS[tab]||HomeScreenV2;
  const screenFallback=<div style={S.body}>
    <div style={S.card}>
      <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:6}}>Screen failed to render</div>
      <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Resetting to Today will recover the app if a screen throws during navigation.</div>
      <button style={S.btnGhost} onClick={()=>openTab('home')}>Back to Today</button>
    </div>
  </div>;

  const hr=NOW.getHours();
  const greeting=hr>=6&&hr<12?'Good morning':hr>=12&&hr<17?'Good afternoon':'Good evening';

  return (
    <div style={S.wrap}>
      <a href="#app-main" className="skip-link">Skip to content</a>
      <NotificationBanner
        message={notif}
        type={notifType}
        detail={notifDetail}
        actionLabel={notifAction?.label}
        onAction={notifAction?.handler}
        onDismiss={clearNotif}
      />
      <div style={S.hdr}>
        <div>
          {tab==='home'?<>
            <div style={{...S.micro,fontWeight:400}}>{`${greeting}, ${toTitleCaseLabel(profile.userProfile?.name||'there')}`}</div>
            <button
              style={{background:'none',border:'none',padding:0,marginTop:1,cursor:'pointer',fontSize:11,fontWeight:400,color:C.muted,opacity:0.68,lineHeight:1.35,textAlign:'left'}}
              title={formatDate(NOW,'primaryWithYear')}
              onClick={()=>{
                openTab('calendar',{calendarFocusDay:TODAY});
              }}
            >
              {formatDate(NOW,'primary')}
            </button>
          </>:<>
            <div style={S.sectionTitle}>
              {TAB_TITLES[tab]||TAB_TITLES.home}
            </div>
          </>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <button
            style={{background:C.surf,border:`1px solid ${C.bd}`,borderRadius:12,padding:'8px',cursor:'pointer',display:'flex',alignItems:'center',position:'relative'}}
            onClick={()=>openTab('tasks',{taskTab:'inbox'})}
            title="Inbox"
            aria-label={pendingInbox.length>0?`Inbox, ${pendingInbox.length} pending item${pendingInbox.length!==1?'s':''}`:'Inbox'}
          >
            {pendingInbox.length>0&&<div style={{position:'absolute',top:0,right:0,minWidth:16,height:16,borderRadius:999,background:C.red,color:C.white,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>{Math.min(pendingInbox.length,9)}</div>}
            <NavIcon id="inbox" active={tab==='tasks'}/>
          </button>
          <button
            style={{background:C.navy,border:'none',borderRadius:12,width:36,height:36,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}
            onClick={openBrainDump}
            title="Brain Dump"
            aria-label="Brain Dump"
          >
            <span style={{color:'var(--white)',fontSize:17,lineHeight:1}} aria-hidden="true">🧠</span>
          </button>
        </div>
      </div>
      <main id="app-main" ref={contentRef} tabIndex={-1} style={{overflowY:'auto',height:'calc(100vh - 64px - 64px)',paddingTop:64,paddingBottom:12}}>
        <ScreenErrorBoundary resetKey={tab} fallback={screenFallback}>
          <ActiveScreen focusDay={calendarFocusDay}/>
        </ScreenErrorBoundary>
      </main>
      <nav aria-label="Primary" style={S.nav}>
        {NAV_ITEMS.map(({id,label})=>(
          <button
            key={id}
            type="button"
            style={{...S.navBtn(activePrimaryTab===id,navFocusId===id),position:'relative',opacity:activePrimaryTab===id?1:0.58}}
            onFocus={()=>setNavFocusId(id)}
            onBlur={()=>setNavFocusId(current=>current===id?null:current)}
            onClick={()=>{
            if(id==='home'&&tab==='home'){
              contentRef.current?.scrollTo({top:0,behavior:'smooth'});
              return;
            }
            if(id==='calendar'){
              if(tab==='calendar')setCalendarFocusDay(TODAY);
            }
            setTab(id);
          }}
            title={label}
            aria-label={label}
            aria-current={activePrimaryTab===id?'page':undefined}
          >
            {id==='more'&&(maintenanceAttentionItems.length+pendingInbox.length)>0&&<div style={{position:'absolute',top:7,right:15,minWidth:16,height:16,borderRadius:999,background:C.red,color:C.white,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px',zIndex:2}}>{Math.min(maintenanceAttentionItems.length+pendingInbox.length,9)}</div>}
            <div style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%'}}>
            <NavIcon id={id} active={activePrimaryTab===id}/>
            </div>
          </button>
        ))}
      </nav>
      {showImport&&<ImportModal/>}
      {showAddTx&&<AddTxModal/>}
      {showAccountModal&&<AccountModal/>}
      {demoExercise&&<ExerciseDemoModal exercise={demoExercise} onClose={()=>setDemoExercise(null)}/>}
      {showWeeklyPlanner&&<div style={{position:'fixed',inset:0,background:C.scrim,zIndex:620,display:'flex',alignItems:'flex-end'}}>
        <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px 32px',width:'100%',maxWidth:430,margin:'0 auto',maxHeight:'85vh',overflowY:'auto'}}>
          <div style={{...S.row,marginBottom:12}}>
            <div>
              <div style={{fontSize:17,fontWeight:700,color:C.tx}}>Weekly Planner</div>
              <div style={{fontSize:11,color:C.muted}}>Turn the preview into a planning ritual.</div>
            </div>
            <button style={{...S.btnGhost,fontSize:11}} onClick={()=>setShowWeeklyPlanner(false)}>Close</button>
          </div>
          {[
            {title:'Training',body:`${weekAnalytics.sessionsLogged}/${plannerWeekWorkoutGoal} sessions logged. ${plannerWorkoutStatusGlobal}.`,action:'Open Training',onClick:()=>{setShowWeeklyPlanner(false);openTab('training');}},
            {title:'Tasks',body:`${plannerTaskCountGlobal} open tasks are assigned this week. Review and spread high-priority items across the next 7 days.`,action:'Open Tasks',onClick:()=>{setShowWeeklyPlanner(false);openTab('tasks');}},
            {title:'Meals',body:`Protein target met on ${plannerProteinDays}/7 days and hydration target on ${plannerHydrationDays}/7. Plan ${Math.max(0,7-plannerProteinDays)} more high-protein days.`,action:'Open Meals',onClick:()=>{setShowWeeklyPlanner(false);openTab('meals');}},
            {title:'Maintenance',body:plannerMaintenanceCount>0?`${plannerMaintenanceCount} open maintenance item${plannerMaintenanceCount!==1?'s':''}. Clear the next one before it slips.`:'No maintenance due right now.',action:'Open Maintenance',onClick:()=>{setShowWeeklyPlanner(false);openTab('maintenance');}},
            {title:'Inbox',body:`${(inboxItems||[]).filter(x=>x.status==='pending').length} inbox item${(inboxItems||[]).filter(x=>x.status==='pending').length!==1?'s':''} waiting. Process them into tasks, notes, or finance entries.`,action:'Review Inbox',onClick:()=>{setShowWeeklyPlanner(false);openTab('tasks',{taskTab:'inbox'});}},
          ].map(card=><div key={card.title} style={{...S.card,marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:4}}>{card.title}</div>
            <div style={{fontSize:11,color:C.tx2,marginBottom:10,lineHeight:1.5}}>{card.body}</div>
            <button style={{...S.btnSmall(C.sage),width:'100%'}} onClick={card.onClick}>{card.action}</button>
          </div>)}
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button style={{...S.btnSolid(C.navy),flex:1}} onClick={()=>{updateProfile(p=>({...p,lastWeeklyPlanKey:weekKey(NOW)}));setShowWeeklyPlanner(false);}}>Mark Planned</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>{updateProfile(p=>({...p,securitySettings:{...p.securitySettings,dataExportHistory:[...(p.securitySettings?.dataExportHistory||[]),TODAY]}}));showNotif('Weekly snapshot recorded','success');}}>Save Snapshot</button>
          </div>
        </div>
      </div>}

      {/* Morning check-in */}
      {showMorningCheckin&&<div
        style={{position:'fixed',inset:0,background:C.scrimStrong,zIndex:650,display:'flex',alignItems:'flex-end'}}
        onClick={closeMorningCheckin}
      >
        <div
          style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'20px 16px 32px',width:'100%',maxWidth:430,margin:'0 auto'}}
          onClick={e=>e.stopPropagation()}
        >
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:18}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:C.tx,marginBottom:4}}>Daily Check-In</div>
              <div style={{fontSize:12,color:C.muted}}>Answer quickly. Don&apos;t overthink.</div>
            </div>
            <button
              onClick={closeMorningCheckin}
              aria-label="Close daily check-in"
              style={{width:36,height:36,borderRadius:10,border:`1.5px solid ${C.bd}`,background:'transparent',color:C.tx,fontSize:14,fontWeight:700,cursor:'pointer',flexShrink:0}}
            >
              X
            </button>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase',color:C.muted,marginBottom:8}}>Mood</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:8}}>
              {[
                {value:1,face:'Awful',emoji:':('},
                {value:2,face:'Low',emoji:':/'},
                {value:3,face:'Okay',emoji:':|'},
                {value:4,face:'Good',emoji:':)'},
                {value:5,face:'Great',emoji:':D'},
              ].map(option=><button
                key={option.value}
                onClick={()=>setCheckInMood(option.value)}
                aria-pressed={checkInMood===option.value}
                style={{padding:'12px 6px',borderRadius:12,border:`2px solid ${checkInMood===option.value?C.amberDk:C.bd}`,background:checkInMood===option.value?C.amberL:C.bg,color:C.tx,cursor:'pointer'}}
              >
                <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{option.emoji}</div>
                <div style={{fontSize:10,fontWeight:600}}>{option.face}</div>
              </button>)}
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase',color:C.muted,marginBottom:8}}>Energy</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:8}}>
              {[0,1,2,3,4,5].map(level=><button
                key={level}
                onClick={()=>setCheckInEnergy(level)}
                aria-pressed={checkInEnergy===level}
                style={{height:44,borderRadius:12,border:`2px solid ${checkInEnergy===level?C.sage:C.bd}`,background:checkInEnergy===level?C.sageL:C.bg,color:checkInEnergy===level?C.sageDk:C.tx,fontSize:15,fontWeight:700,cursor:'pointer'}}
              >
                {level}
              </button>)}
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase',color:C.muted,marginBottom:8}}>Sleep (hours)</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[4,5,5.5,6,6.5,7,7.5,8,8.5,9].map(h=><button
                key={h}
                onClick={()=>setCheckInSleep(h)}
                aria-pressed={checkInSleep===h}
                style={{padding:'8px 10px',borderRadius:10,border:`2px solid ${checkInSleep===h?C.navy:C.bd}`,background:checkInSleep===h?C.navyL:C.bg,color:checkInSleep===h?C.navyDk:C.tx,fontSize:12,fontWeight:600,cursor:'pointer'}}
              >{h}h</button>)}
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase',color:C.muted,marginBottom:8}}>Stress / Load</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:8}}>
              {[0,1,2,3,4,5].map(level=><button
                key={level}
                onClick={()=>setCheckInStress(level)}
                aria-pressed={checkInStress===level}
                style={{height:44,borderRadius:12,border:`2px solid ${checkInStress===level?C.red:C.bd}`,background:checkInStress===level?C.redL:C.bg,color:checkInStress===level?C.red:C.tx,fontSize:15,fontWeight:700,cursor:'pointer'}}
              >
                {level}
              </button>)}
            </div>
          </div>

          {!showCheckInNote&&<button style={{...S.btnGhost,width:'100%',marginBottom:12}} onClick={()=>setShowCheckInNote(true)}>Add note</button>}
          {showCheckInNote&&<textarea
            value={checkInNote}
            onChange={e=>setCheckInNote(e.target.value)}
            placeholder="Optional note"
            rows={3}
            style={{...S.inp,minHeight:88,resize:'vertical',marginBottom:12}}
          />}

          <div style={{display:'flex',gap:8}}>
            <button style={S.btnSolid(C.sage)} onClick={saveMorningCheckin}>Save</button>
            <button style={{...S.btnGhost,flex:1}} onClick={closeMorningCheckin}>Skip for today</button>
          </div>
        </div>
      </div>}

      {/* Energy check-in modal */}
      {showEnergyIn&&<div style={{position:'fixed',inset:0,background:C.scrim,zIndex:600,display:'flex',alignItems:'flex-end'}}>
        <div style={{background:C.card,borderRadius:'20px 20px 0 0',padding:'24px 16px',width:'100%',maxWidth:430,margin:'0 auto'}}>
          <div style={{fontSize:16,fontWeight:700,color:C.tx,marginBottom:20}}>How are you today?</div>
          <span style={S.lbl}>Energy (1–10)</span>
          <div style={{display:'flex',gap:4,marginBottom:16,flexWrap:'wrap'}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=><button key={n} onClick={()=>setEnergyScore(n)} style={{width:36,height:36,borderRadius:8,border:`1.5px solid ${energyScore===n?C.sage:C.bd}`,background:energyScore===n?C.sage:'transparent',color:energyScore===n?C.white:C.tx,fontSize:13,fontWeight:600,cursor:'pointer'}}>{n}</button>)}
          </div>
          <span style={S.lbl}>Hours slept</span>
          <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
            {[5,5.5,6,6.5,7,7.5,8,8.5,9].map(h=><button key={h} onClick={()=>setSleepHours(h)} style={{padding:'6px 10px',borderRadius:8,border:`1.5px solid ${sleepHours===h?C.navy:C.bd}`,background:sleepHours===h?C.navy:'transparent',color:sleepHours===h?C.white:C.tx,fontSize:12,cursor:'pointer'}}>{h}h</button>)}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnSolid(C.sage)} onClick={logEnergyCheckin}>Save</button>
            <button style={{...S.btnGhost,flex:1}} onClick={()=>setShowEnergyIn(false)}>Cancel</button>
          </div>
        </div>
      </div>}

      {showBrainDumpModal&&<BrainDumpModal
        C={C}
        S={S}
        onClose={()=>setShowBrainDumpModal(false)}
        onSave={saveBrainDumpEntry}
      />}

      {/* Quarterly / Annual review modal */}
      {showReview&&(()=>{
        const type=getReviewType()||'quarterly';
        const year=NOW.getFullYear();
        const q=Math.ceil((NOW.getMonth()+1)/3);
        const totalWorkouts=workoutHistory.length;
        const totalMiles=workoutHistory.filter(h=>h.type==='run').reduce((s,h)=>s+(parseFloat(h.data?.dist2)||0),0);
        const yearSpend=(transactions||[]).filter(t=>!t.isCredit&&!t.isTransfer&&t.date.startsWith(String(year))).reduce((s,t)=>s+t.amount,0);
        const subTotal=(recurringExpenses||[]).reduce((s,r)=>s+(r.averageAmount*12),0);
        const bestHabit=(habits||[]).reduce((best,h)=>{const s=computeStreak(h,dailyLogs);return s>(best?.streak||0)?{...h,streak:s}:best;},null);
        return <div style={{position:'fixed',inset:0,background:C.bg,zIndex:700,overflowY:'auto'}}>
          <div style={{maxWidth:430,margin:'0 auto',padding:'16px 16px 80px'}}>
            <div style={{...S.row,marginBottom:20,paddingTop:'env(safe-area-inset-top)'}}>
              <div style={{fontSize:17,fontWeight:700,color:C.tx}}>{type==='annual'?`${year} Annual Review`:`Q${q} ${year} Review`}</div>
              <button style={S.btnGhost} onClick={()=>setShowReview(false)}>Close</button>
            </div>
            <div style={{...S.card,background:PH.lClr,borderColor:'transparent',marginBottom:12}}>
              <div style={{fontSize:11,color:PH.tClr,marginBottom:4}}>{type==='annual'?'Year in review':'Quarter in review'}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[{l:'Workouts',v:totalWorkouts},{l:'Miles run',v:totalMiles.toFixed(1)},{l:'Spend YTD',v:fmtMoney(yearSpend)},{l:'Subscriptions/yr',v:fmtMoney(subTotal)}].map(({l,v})=>
                  <div key={l}>
                    <div style={{fontSize:9,color:PH.tClr}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:700,color:PH.clr}}>{v}</div>
                  </div>
                )}
              </div>
            </div>
            {bestHabit&&<div style={S.card}>
              <span style={S.lbl}>Most consistent habit</span>
              <div style={{fontSize:16,fontWeight:600,color:C.tx}}>{bestHabit.name}</div>
              <div style={{fontSize:12,color:C.muted}}>{bestHabit.streak}d current streak</div>
            </div>}
            <div style={S.card}>
              <span style={S.lbl}>Home maintenance</span>
              <div style={{fontSize:13,color:C.tx}}>{Object.keys(maintenanceHistory||{}).length} tasks completed this period</div>
            </div>
          </div>
        </div>;
      })()}

      {/* Focus Mode overlay */}
      {focusTaskId&&(()=>{
        const focusTask=taskHistory.find(t=>t.id===focusTaskId)||null;
        if(!focusTask)return null;
        const tmrMins=focusTmrSec!==null?Math.floor(focusTmrSec/60):null;
        const tmrSecs=focusTmrSec!==null?focusTmrSec%60:null;
        const tmrPct=focusTmrSec!==null?focusTmrSec/(25*60):1;
        return <div style={{position:'fixed',inset:0,background:C.navy,zIndex:999,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',letterSpacing:'1px',textTransform:'uppercase',marginBottom:16}}>Focus Mode</div>
          <div style={{fontSize:22,fontWeight:800,color:C.white,textAlign:'center',lineHeight:1.3,marginBottom:32,maxWidth:320}}>{focusTask.text}</div>
          {focusTmrSec!==null&&<div style={{marginBottom:32,textAlign:'center'}}>
            <div style={{fontSize:60,fontWeight:800,color:C.white,letterSpacing:'-2px'}}>{String(tmrMins).padStart(2,'0')}:{String(tmrSecs).padStart(2,'0')}</div>
            <div style={{width:200,height:4,background:'rgba(255,255,255,0.2)',borderRadius:99,marginTop:10,overflow:'hidden',margin:'10px auto 0'}}>
              <div style={{width:`${tmrPct*100}%`,height:'100%',background:C.white,borderRadius:99,transition:'width 1s linear'}}/>
            </div>
          </div>}
          <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:280}}>
            {focusTmrSec===null&&<button style={{...S.btnSolid(),background:C.sage,border:'none'}} onClick={()=>{setFocusTmrSec(25*60);setFocusTmrRunning(true);}}>Start 25-min Timer</button>}
            {focusTmrSec!==null&&<button style={{...S.btnSolid(),background:focusTmrRunning?C.amberDk:C.sage,border:'none'}} onClick={()=>setFocusTmrRunning(r=>!r)}>{focusTmrRunning?'Pause':'Resume'}</button>}
            <button style={{...S.btnSolid(),background:C.sage,border:'none'}} onClick={()=>{updateProfile(p=>({...p,taskHistory:p.taskHistory.map(t=>t.id===focusTask.id?{...t,done:true,status:'done',updatedAt:new Date().toISOString()}:t)}));setFocusTaskId(null);setFocusTmrSec(null);setFocusTmrRunning(false);showNotif('Task completed!','success');}}>Done — Mark Complete</button>
            <button style={{...S.btnGhost,color:C.white,borderColor:'rgba(255,255,255,0.3)'}} onClick={()=>{setFocusTaskId(null);setFocusTmrSec(null);setFocusTmrRunning(false);}}>Exit Focus</button>
          </div>
        </div>;
      })()}

      {/* Workout player overlay */}
      {showWorkoutPlayer&&wkSess&&<WorkoutPlayer
        C={C}
        S={S}
        wkSess={wkSess}
        onComplete={()=>{finishWk();setShowWorkoutPlayer(false);}}
        onCancel={()=>{setWkSess(null);setTrainView('overview');setShowWorkoutPlayer(false);}}
      />}

      {/* Flow Engine overlay */}
      {showFlow&&(
        <FlowRoot
          dayType={flowDayType}
          onDayType={handleFlowDayType}
          calendarCache={calendarCache}
          todayKey={TODAY}
          now={NOW}
          onClose={()=>setShowFlow(false)}
        />
      )}

    </div>
  );
}

function mountApp(){
  try{
    const rootElement=document.getElementById('root');
    if(!rootElement)throw new Error('Root element #root was not found.');
    const root=rootElement.__appRoot??createRoot(rootElement);
    rootElement.__appRoot=root;
    root.render(React.createElement(App));
  }catch(error){
    console.error('App render failed:',error);
    const loading=document.getElementById('loading');
    if(loading)loading.textContent='App failed to load. Refresh to retry.';
  }
}

mountApp();
