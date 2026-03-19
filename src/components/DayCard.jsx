import React from 'react';

function getTaskTitle(task){
  return task?.title || task?.text || '';
}

function TaskRow({ C, S, FieldInput, task, index, count, mode, updatePriorityTask, movePriorityTask, removePriorityTask }){
  const title = getTaskTitle(task);
  const [controlsVisible, setControlsVisible] = React.useState(false);

  return (
    <div
      style={{display:'grid',gridTemplateColumns:mode==='execution'?'auto 1fr':'1fr auto',gap:8,alignItems:'center',background:C.surf,borderRadius:12,padding:'10px 12px'}}
      onMouseEnter={()=>setControlsVisible(true)}
      onMouseLeave={()=>setControlsVisible(false)}
    >
      {mode==='execution' && (
        <input
          type="checkbox"
          checked={!!task.completed}
          aria-label={`${task.completed?'Mark incomplete':'Mark complete'} for ${title.trim()||`task ${index+1}`}`}
          onChange={e=>updatePriorityTask(task.id,{completed:e.target.checked})}
          style={{width:18,height:18,accentColor:C.sage,margin:0}}
        />
      )}

      {mode==='planning'
        ? <FieldInput
            id={`day-task-${task.id}`}
            aria-label={`Task ${index+1}`}
            value={title}
            placeholder={`Task ${index+1}`}
            style={{...S.inp,margin:0}}
            onChange={e=>updatePriorityTask(task.id,{title:e.target.value,text:e.target.value})}
            onFocus={()=>setControlsVisible(true)}
            onBlur={()=>setControlsVisible(false)}
          />
        : <div style={{minHeight:36,display:'flex',alignItems:'center',padding:'0 4px',fontSize:14,fontWeight:600,color:C.tx,textDecoration:task.completed?'line-through':'none',opacity:task.completed?0.65:1}}>
            {title || `Task ${index+1}`}
          </div>}

      {mode==='planning' && (
        <div style={{display:'flex',gap:6,opacity:controlsVisible?1:0,transition:'opacity 160ms ease',pointerEvents:controlsVisible?'auto':'none'}}>
          <button type="button" aria-label={`Move ${title.trim()||`task ${index+1}`} up`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onMouseDown={e=>e.preventDefault()} onClick={()=>movePriorityTask(task.id,-1)} disabled={index===0}>↑</button>
          <button type="button" aria-label={`Move ${title.trim()||`task ${index+1}`} down`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onMouseDown={e=>e.preventDefault()} onClick={()=>movePriorityTask(task.id,1)} disabled={index===count-1}>↓</button>
          <button type="button" aria-label={`Remove ${title.trim()||`task ${index+1}`}`} style={{...S.btnGhost,fontSize:10,padding:'6px 8px'}} onMouseDown={e=>e.preventDefault()} onClick={()=>removePriorityTask(task.id)}>Remove</button>
        </div>
      )}
    </div>
  );
}

export default function DayCard({
  C,
  S,
  FieldInput,
  dayEntry,
  selectedDateLabel,
  isViewingToday,
  updatePriorityTask,
  movePriorityTask,
  removePriorityTask,
  addPriorityTask,
  setDailyExecutionMode,
}){
  const headingId = React.useId();
  const [isAddingTask, setIsAddingTask] = React.useState(false);
  const [newTaskTitle, setNewTaskTitle] = React.useState('');
  const mode = dayEntry.mode === 'execution' ? 'execution' : 'planning';
  const tasks = mode === 'execution' ? dayEntry.agenda : dayEntry.priorities;
  const hasTasks = dayEntry.priorities.some(task => getTaskTitle(task).trim());

  function submitInlineTask(){
    const title = newTaskTitle.trim();
    if(!title) return;
    addPriorityTask({ title, text:title, completed:false });
    setNewTaskTitle('');
    setIsAddingTask(false);
  }

  return (
    <section style={{...S.card,padding:'14px 14px 12px',display:'grid',gap:10}}>
      <div style={{...S.row,alignItems:'flex-start',gap:10}}>
        <div style={{minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',color:C.muted,marginBottom:4}}>Today</div>
          <h2 id={headingId} style={{fontSize:20,fontWeight:800,color:C.tx,lineHeight:1.1,margin:0}}>{selectedDateLabel}</h2>
          <div style={{fontSize:11,color:C.muted,marginTop:4}}>
            {mode==='planning' ? 'Add tasks, then start the day in this same card.' : 'Check tasks off without leaving this card.'}
            {!isViewingToday ? ' Selected date.' : ''}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gap:8}}>
        {tasks.length===0 && (
          <div style={{background:C.surf,borderRadius:12,padding:'14px 12px'}}>
            <div style={{fontSize:14,fontWeight:700,color:C.tx,marginBottom:4}}>No tasks yet</div>
            <div style={{fontSize:11,color:C.muted}}>Use the inline add flow to build the list for the day.</div>
          </div>
        )}

        {tasks.map((task,index)=> (
          <TaskRow
            key={task.id}
            C={C}
            S={S}
            FieldInput={FieldInput}
            task={task}
            index={index}
            count={tasks.length}
            mode={mode}
            updatePriorityTask={updatePriorityTask}
            movePriorityTask={movePriorityTask}
            removePriorityTask={removePriorityTask}
          />
        ))}

        {mode==='planning' && (
          isAddingTask
            ? <FieldInput
                id="day-card-inline-task"
                aria-label="Add a task"
                autoFocus
                value={newTaskTitle}
                placeholder="New task"
                style={{...S.inp,margin:0}}
                onChange={e=>setNewTaskTitle(e.target.value)}
                onBlur={()=>{
                  if(!newTaskTitle.trim()){
                    setIsAddingTask(false);
                  }
                }}
                onKeyDown={e=>{
                  if(e.key==='Enter'){
                    e.preventDefault();
                    submitInlineTask();
                  }
                  if(e.key==='Escape'){
                    setNewTaskTitle('');
                    setIsAddingTask(false);
                  }
                }}
              />
            : <button type="button" style={{...S.btnGhost,justifyContent:'flex-start'}} onClick={()=>setIsAddingTask(true)}>+ Add Task</button>
        )}
      </div>

      {mode==='planning' && (
        <button type="button" style={{...S.btnSolid(C.navy),opacity:hasTasks?1:0.45,pointerEvents:hasTasks?'auto':'none'}} onClick={()=>setDailyExecutionMode('execution')} disabled={!hasTasks}>Start Day</button>
      )}
    </section>
  );
}
