import React from 'react';

export default function WorkoutDecisionPrompt({
  C,
  S,
  scheduledWorkout,
  recoveryWorkout,
  onAccept,
  onModify,
  onIgnore,
  compact=false,
}){
  const padding=compact?'10px 12px':'12px';
  const borderRadius=compact?10:14;

  return <div style={{background:C.redL,border:`1px solid ${C.red}`,borderRadius,padding,marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:4}}>Recovery is low. Do you want to continue with your scheduled workout?</div>
    <div style={{fontSize:11,color:C.tx2,marginBottom:compact?8:10}}>
      {scheduledWorkout?.name||'Scheduled workout'} vs {recoveryWorkout?.name||'Recovery workout'}
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button style={{...S.btnSmall(C.navy),flex:1}} onClick={onAccept}>Continue Scheduled Workout</button>
      <button style={{...S.btnSmall(C.sage),flex:1}} onClick={onModify}>Switch to Recovery Workout</button>
      <button style={{...S.btnGhost,flex:1}} onClick={onIgnore}>Ignore</button>
    </div>
  </div>;
}
