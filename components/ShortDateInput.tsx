'use client';

import React,{useEffect,useId,useRef,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {normalizeShortDate,shortDate} from '@/lib/date-only';

interface Props {
  value:string;onChange:(value:string)=>void;label:string;disabled?:boolean;
  id?:string;inputRef?:React.RefObject<HTMLInputElement | null>;describedBy?:string;invalid?:boolean;
  onCommit?:(value:string,source:'input'|'blur'|'calendar')=>void;
}
export function ShortDateInput({value,onChange,label,disabled,id,inputRef,describedBy,invalid,onCommit}:Props) {
  const generated=useId(),nativeRef=useRef<HTMLInputElement>(null),ownRef=useRef<HTMLInputElement>(null);
  const fieldRef=inputRef || ownRef,fieldId=id || generated;
  const [text,setText]=useState(()=>shortDate(value)),[touched,setTouched]=useState(false);
  const preserveDraft=!!onCommit;
  useEffect(()=>{if(!preserveDraft || fieldRef.current!==document.activeElement){setText(shortDate(value));setTouched(false);}},[value,preserveDraft,fieldRef]);
  const parsed=normalizeShortDate(text),error=touched && !!text && parsed===null;
  function input(raw:string,composing:boolean){setText(raw);setTouched(false);const iso=normalizeShortDate(raw);onChange(iso===null?raw:iso);if(!composing && iso && /^(?:\d{6}|\d{2}[-./]\d{2}[-./]\d{2}|\d{4}-\d{2}-\d{2})$/.test(raw.trim()))onCommit?.(iso,'input');}
  function choose(iso:string){setText(shortDate(iso));setTouched(false);onChange(iso);onCommit?.(iso,'calendar');}
  return <span className="short-date-field">
    <input ref={fieldRef} id={fieldId} type="text" inputMode="numeric" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={10} placeholder="YY-MM-DD" aria-label={label} aria-describedby={error?`${fieldId}-hint`:describedBy} aria-invalid={invalid || error} disabled={disabled} value={text} onInput={e=>input(e.currentTarget.value,!!(e.nativeEvent as InputEvent).isComposing)} onChange={e=>input(e.target.value,!!(e.nativeEvent as InputEvent).isComposing)} onBlur={e=>{setTouched(true);if(parsed!==null)setText(shortDate(parsed));if(e.relatedTarget instanceof Node && e.currentTarget.closest('form')?.contains(e.relatedTarget)){if(onCommit)onChange(parsed===null?text:parsed);return;}onCommit?.(parsed===null?text:parsed,'blur');}}/>
    <button type="button" className="short-date-picker" disabled={disabled} aria-label={`${label} 달력 열기`} title="달력에서 선택" onClick={e=>{e.preventDefault();const picker=nativeRef.current;if(!picker)return;try{if(typeof picker.showPicker==='function')picker.showPicker();else fieldRef.current?.focus();}catch{fieldRef.current?.focus();}}}><CalendarDays size={14} aria-hidden="true"/></button>
    <input ref={nativeRef} type="date" className="short-date-native" aria-hidden="true" tabIndex={-1} disabled={disabled} value={normalizeShortDate(value) || ''} onChange={e=>choose(e.target.value)} onInput={e=>choose(e.currentTarget.value)}/>
    <span id={`${fieldId}-hint`} className="sr-only">{error?'올바른 날짜를 입력해주세요. ':''}예: 26-08-20 또는 260820. 연도 00~99는 2000~2099년입니다.</span>
  </span>;
}
