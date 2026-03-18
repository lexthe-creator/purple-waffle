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
  todayLog,
  setShowMorningCheckin,
  openBrainDump,
  addPriorityTask,
  setDailyExecutionMode,
  openCalendar,
}){
  const visibleTasks=dailyExecutionEntry.mode==='execution'
    ?dailyExecutionEntry.agenda
    :dailyExecutionEntry.priorities;

  return <div style={{...S.card,paddingBottom:14,boxShadow:C.shadowStrong}}>
    <div style={{...S.row,alignItems:'flex-start',marginBottom:12}}>
      <div>
        <div style={S.lbl}>Daily Execution</div>
        <div style={{fontSize:20,fontWeight:800,color:C.tx,lineHeight:1.15}}>Plan first, execute once the list is real</div>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>{dailyExecutionEntry.mode==='planning'?'Editable priorities with reorder and cleanup.':'Execution mode keeps the same tasks in one checklist.'}</div>
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
        <span style={S.pill(dailyExecutionEntry.mode==='execution'?C.sageL:C.navyL,dailyExecutionEntry.mode==='execution'?C.sageDk:C.navyDk)}>{dailyExecutionEntry.mode==='execution'?'Execution':'Planning'}</span>
        {installAvailable&&!isInstalled&&<button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={openInstallPrompt}>Install</button>}
        <button style={{...S.btnGhost,fontSize:11,padding:'6px 10px'}} onClick={openCommandBar}>Quick Capture</button>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
      <div style={{background:C.surf,borderRadius:12,padding:'10px 12px'}}>
        <div style={{fontSize:9,color:C.muted,marginBottom:4}}>Energy</div>
        <div style={{fontSize:16,fontWeight:700,color:C.tx}}>{energyFive}/5</div>
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
        <button style={{width:22,height:22,borderRadius:999,border:`1px solid ${task.completed?C.sage:C.bd}`,background:task.completed?C.sage:'transparent',color:task.completed?C.white:C.muted,cursor:'pointer',fontSize:12,fontWeight:700}} onClick={()=>updatePriorityTask(task.id,{completed:!task.completed})}>{task.completed?'✓':''}</button>
        <FieldInput
          value={task.text||''}
          placeholder={dailyExecutionEntry.mode==='planning'?`Priority ${index+1}`:`Agenda item ${index+1}`}
          style={{...S.inp,margin:0,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}
          onChange={e=>updatePriorityTask(task.id,{text:e.target.value})}
        />
        <div style={{display:'flex',gap:6}}>
          <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,-1)} disabled={index===0}>↑</button>
          <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>movePriorityTask(task.id,1)} disabled={index===items.length-1}>↓</button>
          <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>removePriorityTask(task.id)}>Remove</button>
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
        <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={openMeals}>{nextPlannedMeal?'Open plan':'Plan meal'}</button>
      </div>
      <div style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px',alignItems:'center'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Today’s workout</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{workoutTitle}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{workoutDuration} · {wktDone?'Completed':workoutMeta}</div>
        </div>
        <button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={openTodayWorkoutAction}>{wktDone?'View':'Start'}</button>
      </div>
      <div style={{...S.row,background:C.surf,borderRadius:12,padding:'10px 12px',alignItems:'center'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>Task flow</div>
          <div style={{fontSize:13,fontWeight:700,color:C.tx}}>{nextTaskItem?.text||'Nothing queued'}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{nextTaskItem?`${nextTaskItem.scheduledTime||'Unscheduled'} · Priority ${nextTaskItem.priority||1}`:'Capture or schedule a task'}</div>
        </div>
        {nextTaskItem&&<button style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onClick={()=>toggleTaskDone(nextTaskItem.id)}>Done</button>}
      </div>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button style={{...S.btnGhost,flex:1}} onClick={()=>setShowMorningCheckin(true)}>{todayLog.checkInDone?'Review check-in':'Morning check-in'}</button>
      <button style={{...S.btnGhost,flex:1,position:'relative'}} onClick={openBrainDump}>
        Brain Dump
        {pendingInbox.length>0&&<span style={{position:'absolute',top:6,right:8,minWidth:16,height:16,borderRadius:999,background:C.red,color:C.white,fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>{Math.min(pendingInbox.length,9)}</span>}
      </button>
    </div>
    <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
      <button style={{...S.btnGhost,flex:1}} onClick={addPriorityTask}>Add Item</button>
      {dailyExecutionEntry.mode==='planning'
        ?<button style={{...S.btnSolid(C.navy),flex:1}} onClick={()=>setDailyExecutionMode('execution')} disabled={dailyExecutionEntry.priorities.filter(task=>task.text.trim()).length===0}>Move to Execution</button>
        :<button style={{...S.btnGhost,flex:1}} onClick={()=>setDailyExecutionMode('planning')}>Return to Planning</button>}
      <button style={{...S.btnGhost,flex:1}} onClick={openCalendar}>Open Calendar</button>
    </div>
  </div>;
}
