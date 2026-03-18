import React from 'react';
import WorkoutDecisionPrompt from './WorkoutDecisionPrompt.jsx';

export default function DailyExecutionPanel({
  C,
  S,
  FieldInput,
  dailyExecutionEntry,
  installAvailable,
  isInstalled,
  openInstallPrompt,
  openCommandBar,
  energyFive,
  sleepHoursToday,
  sleepWhole,
  sleepMinutes,
  pendingInbox,
  shouldPromptWorkoutDecision,
  scheduledTodayWorkout,
  recoveryWorkoutOption,
  handleWorkoutDecision,
  updatePriorityTask,
  movePriorityTask,
  removePriorityTask,
  compactNextMealLabel,
  nextPlannedMeal,
  mealSlots,
  openMeals,
  workoutTitle,
  workoutDuration,
  workoutMeta,
  wktDone,
  openTodayWorkoutAction,
  nextTaskItem,
  toggleTaskDone,
  habitsSummary,
  habitsBadge,
  openHabitsModal,
  todayLog,
  selectedDateLabel,
  isViewingToday,
  setShowMorningCheckin,
  openBrainDump,
  addPriorityTask,
  setDailyExecutionMode,
  openCalendar,
}){
  const headingId=React.useId();
  const detailId=React.useId();
  const hasExecutionItems=dailyExecutionEntry.priorities.some(task=>task.text.trim());
  const visibleTasks=dailyExecutionEntry.mode==='execution'
    ?dailyExecutionEntry.agenda
    :dailyExecutionEntry.priorities;

  return <section aria-labelledby={headingId} aria-describedby={detailId} style={{...S.card,paddingBottom:14,boxShadow:C.shadowStrong}}>
    <div style={{...S.row,alignItems:'flex-start',marginBottom:12}}>
      <div>
        <div style={S.lbl}>Daily Execution</div>
        <h2 id={headingId} style={{fontSize:20,fontWeight:800,color:C.tx,lineHeight:1.15,margin:0}}>Plan first, execute once the list is real</h2>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>{selectedDateLabel}{!isViewingToday?' · selected date':''}</div>
        <div id={detailId} style={{fontSize:11,color:C.muted,marginTop:4}}>{dailyExecutionEntry.mode==='planning'?'Editable priorities with reorder and cleanup.':'Execution mode keeps the same tasks in one checklist.'}</div>
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
        <span style={S.pill(dailyExecutionEntry.mode==='execution'?C.sageL:C.navyL,dailyExecutionEntry.mode==='execution'?C.sageDk:C.navyDk)}>{dailyExecutionEntry.mode==='execution'?'Execution':'Planning'}</span>
        {installAvailable&&!isInstalled&&<button type="button" style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={openInstallPrompt}>Install</button>}
        <button type="button" style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={openCommandBar}>Quick Capture</button>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
      <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Energy</div>
        <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{energyFive==null?'—':`${energyFive}/5`}</div>
      </div>
      <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Sleep</div>
        <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{sleepHoursToday?`${sleepWhole}h ${String(sleepMinutes).padStart(2,'0')}m`:'—'}</div>
      </div>
      <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Inbox</div>
        <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{pendingInbox.length}</div>
      </div>
    </div>
    {shouldPromptWorkoutDecision&&<WorkoutDecisionPrompt
      C={C}
      S={S}
      scheduledWorkout={scheduledTodayWorkout}
      recoveryWorkout={recoveryWorkoutOption}
      onAccept={()=>handleWorkoutDecision('accept')}
      onModify={()=>handleWorkoutDecision('modify')}
      onIgnore={()=>handleWorkoutDecision('ignore')}
    />}
    <div style={{display:'grid',gap:8,marginBottom:12}}>
      {visibleTasks.map((task,index,items)=><div key={task.id} style={{display:'grid',gridTemplateColumns:'auto 1fr auto',gap:8,alignItems:'center',background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <button
          type="button"
          aria-pressed={task.completed}
          aria-label={`${task.completed?'Mark incomplete':'Mark complete'} for ${task.text?.trim()||`priority ${index+1}`}`}
          style={{width:22,height:22,borderRadius:999,border:`1px solid ${task.completed?C.sage:C.bd}`,background:task.completed?C.sage:'transparent',color:task.completed?C.white:C.muted,cursor:'pointer',fontSize:12,fontWeight:700}}
          onClick={()=>updatePriorityTask(task.id,{completed:!task.completed})}
        >
          {task.completed?'✓':''}
        </button>
        {dailyExecutionEntry.mode==='planning'
          ?<FieldInput
            id={`daily-priority-${task.id}`}
            aria-label={`Priority ${index+1}`}
            value={task.text||''}
            placeholder={`Priority ${index+1}`}
            style={{...S.inp,margin:0,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}
            onChange={e=>updatePriorityTask(task.id,{text:e.target.value})}
          />
          :<div style={{minHeight:42,display:'flex',alignItems:'center',padding:'0 4px',fontSize:14,fontWeight:600,color:C.tx,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}>
            {task.text||`Agenda item ${index+1}`}
          </div>}
        <div style={{display:'flex',gap:6}}>
          <button type="button" aria-label={`Move ${task.text?.trim()||`priority ${index+1}`} up`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,-1)} disabled={index===0}>↑</button>
          <button type="button" aria-label={`Move ${task.text?.trim()||`priority ${index+1}`} down`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,1)} disabled={index===items.length-1}>↓</button>
          {dailyExecutionEntry.mode==='planning'&&<button type="button" aria-label={`Remove ${task.text?.trim()||`priority ${index+1}`}`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>removePriorityTask(task.id)}>Remove</button>}
        </div>
      </div>)}
      {visibleTasks.length===0&&<div style={{background:C.surf,borderRadius:12,padding:'14px 12px'}}>
        <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:4}}>{dailyExecutionEntry.mode==='planning'?'No priorities yet':'No agenda items yet'}</div>
        <div style={{fontSize:11,color:C.muted}}>{dailyExecutionEntry.mode==='planning'?'Add the tasks that define the day.':'Switch back to planning if you need to rebuild the list.'}</div>
      </div>}
    </div>
    <div style={{display:'grid',gap:8,marginBottom:12}}>
      <div style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px',alignItems:'center'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Next meal</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{compactNextMealLabel}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{nextPlannedMeal?`${(mealSlots.find(slot=>slot.id===nextPlannedMeal.slot)||{}).label||nextPlannedMeal.slot} planned`:'Use templates or quick logging'}</div>
        </div>
        <button type="button" style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={openMeals}>{nextPlannedMeal?'Open plan':'Plan meal'}</button>
      </div>
      <div style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px',alignItems:'center'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Today’s workout</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{workoutTitle}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{workoutDuration} · {wktDone?'Completed':workoutMeta}</div>
        </div>
        <button type="button" style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={openTodayWorkoutAction}>{wktDone?'View':'Start'}</button>
      </div>
      <div style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px',alignItems:'center'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Task flow</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{nextTaskItem?.text||'Nothing queued'}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{nextTaskItem?`${nextTaskItem.scheduledTime||'Unscheduled'} · Priority ${nextTaskItem.priority||1}`:'Capture or schedule a task'}</div>
        </div>
        {nextTaskItem&&<button type="button" style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>toggleTaskDone(nextTaskItem.id)}>Done</button>}
      </div>
      <button type="button" style={{...S.btnGhost,width:'100%',justifyContent:'space-between',padding:'10px 12px'}} onClick={openHabitsModal}>
        <div style={{textAlign:'left'}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Habits</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{habitsSummary}</div>
        </div>
        {habitsBadge&&<span style={{...S.pill(habitsBadge==='done'?C.sageL:C.navyL,habitsBadge==='done'?C.sageDk:C.navyDk),marginRight:0,marginBottom:0}}>{habitsBadge==='done'?'✓':habitsBadge}</span>}
      </button>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" style={{...S.btnGhost,flex:1}} onClick={()=>setShowMorningCheckin(true)}>{todayLog.checkInDone?'Review check-in':'Morning check-in'}</button>
      <button type="button" style={{...S.btnGhost,flex:1,position:'relative'}} onClick={openBrainDump}>
        Brain Dump
        {pendingInbox.length>0&&<span style={{position:'absolute',top:6,right:8,minWidth:16,height:16,borderRadius:999,background:C.red,color:C.white,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>{Math.min(pendingInbox.length,9)}</span>}
      </button>
    </div>
    <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
      <button type="button" style={{...S.btnGhost,flex:1}} onClick={addPriorityTask}>Add Item</button>
      {dailyExecutionEntry.mode==='planning'
        ?<button type="button" style={{...S.btnSolid(C.navy),flex:1,opacity:hasExecutionItems?1:0.45,pointerEvents:hasExecutionItems?'auto':'none'}} onClick={()=>setDailyExecutionMode('execution')} disabled={!hasExecutionItems}>Move to Execution</button>
        :<button type="button" style={{...S.btnGhost,flex:1}} onClick={()=>setDailyExecutionMode('planning')}>Return to Planning</button>}
      <button type="button" style={{...S.btnGhost,flex:1}} onClick={openCalendar}>Open Calendar</button>
    </div>
  </section>;
}
