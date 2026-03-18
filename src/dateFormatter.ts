const DATE_KEY_RE=/^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_FORMATTERS={
  long:new Intl.DateTimeFormat('en-US',{weekday:'long'}),
  short:new Intl.DateTimeFormat('en-US',{weekday:'short'}),
};

const MONTH_FORMATTERS={
  long:new Intl.DateTimeFormat('en-US',{month:'long'}),
  short:new Intl.DateTimeFormat('en-US',{month:'short'}),
  longYear:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}),
};

function getOrdinalSuffix(day:number){
  const remainder=day%100;
  if(remainder>=11&&remainder<=13)return'th';
  if(day%10===1)return'st';
  if(day%10===2)return'nd';
  if(day%10===3)return'rd';
  return'th';
}

export function toDate(dateLike:unknown){
  if(dateLike instanceof Date)return new Date(dateLike.getTime());
  if(typeof dateLike==='string'&&DATE_KEY_RE.test(dateLike)){
    const [year,month,day]=dateLike.split('-').map(Number);
    return new Date(year,month-1,day,12,0,0,0);
  }
  const parsed=new Date(String(dateLike));
  return Number.isNaN(parsed.getTime())?null:parsed;
}

export function getDateParts(dateLike:unknown){
  const date=toDate(dateLike);
  if(!date)return null;
  const day=date.getDate();
  return{
    dayOfWeek:WEEKDAY_FORMATTERS.long.format(date),
    dayOfWeekShort:WEEKDAY_FORMATTERS.short.format(date),
    monthName:MONTH_FORMATTERS.long.format(date),
    monthShort:MONTH_FORMATTERS.short.format(date),
    day,
    dayOrdinal:`${day}${getOrdinalSuffix(day)}`,
    year:date.getFullYear(),
  };
}

export function formatDate(dateLike:unknown,variant='primary'){
  const parts=getDateParts(dateLike);
  if(!parts)return'';
  if(variant==='primary')return`${parts.dayOfWeek}, ${parts.monthName} ${parts.dayOrdinal}`;
  if(variant==='primaryWithYear')return`${parts.dayOfWeek}, ${parts.monthName} ${parts.dayOrdinal}, ${parts.year}`;
  if(variant==='weekdayShort')return parts.dayOfWeekShort;
  if(variant==='weekdayMonthDayShort')return`${parts.dayOfWeekShort}, ${parts.monthShort} ${parts.day}`;
  if(variant==='monthDayShort')return`${parts.monthShort} ${parts.day}`;
  if(variant==='monthYear')return`${parts.monthName} ${parts.year}`;
  if(variant==='monthYearShort')return MONTH_FORMATTERS.longYear.format(toDate(dateLike) as Date);
  if(variant==='monthDayLong')return`${parts.monthName} ${parts.dayOrdinal}`;
  return`${parts.dayOfWeek}, ${parts.monthName} ${parts.dayOrdinal}`;
}

export function formatDateRange(startLike:unknown,endLike:unknown,variant='monthDayShort'){
  const start=formatDate(startLike,variant);
  const end=formatDate(endLike,variant);
  if(!start||!end)return'';
  return `${start} – ${end}`;
}
