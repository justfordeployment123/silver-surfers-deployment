'use client';

export function ReadableAssessmentAnswer({ text }) {
  let rows;
  try { rows = JSON.parse(text); } catch { return <div style={{whiteSpace:'pre-wrap'}}>{text}</div>; }
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => row && typeof row.function === 'string')) return <div>{text}</div>;
  const labels = {function:'Function',hoursPerWeek:'Hours per week',pain:'Pain (1-5)',handledBy:'Handled by',toolsUsed:'Tool used',satisfied:'Satisfied?',notes:'Explanation'};
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{keys.map(key => <th key={key} style={{textAlign:'left',padding:8,borderBottom:'1px solid var(--sandd)'}}>{labels[key] || key}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{keys.map(key => <td key={key} style={{padding:8,borderBottom:'1px solid var(--sandd)'}}>{String(row[key] || 'Not applicable')}</td>)}</tr>)}</tbody></table></div>;
}

export default function AdminReportEditor({ value, onChange, disabled }) {
  const report = value || {};
  const field = (label, text, change) => <label style={{display:'grid',gap:6,marginBottom:12}}>{label}<textarea className="ap-inp" disabled={disabled} value={text || ''} onChange={event => change(event.target.value)} style={{minHeight:72}} /></label>;
  const set = (key, next) => onChange({...report,[key]:next});
  const pair = (key, title) => <fieldset style={{border:'1px solid var(--sandd)',padding:14,marginBottom:16}}><legend>{title}</legend>{['estimate','explanation'].map(part => <div key={part}>{field(part === 'estimate' ? 'Estimate' : 'Explanation',report[key]?.[part],text => set(key,{...report[key],[part]:text}))}</div>)}</fieldset>;
  const list = (key,title,fields) => <fieldset style={{border:'1px solid var(--sandd)',padding:14,marginBottom:16}}><legend>{title}</legend>{(report[key] || []).map((item,index) => <div key={index} style={{borderBottom:'1px solid var(--sandd)',marginBottom:14}}>{fields.map(([name,label]) => <div key={name}>{name === 'impact' || name === 'effort' ? <label>{label}<select className="ap-inp" disabled={disabled} value={item[name] || 'medium'} onChange={event => set(key,report[key].map((row,i) => i === index ? {...row,[name]:event.target.value} : row))}>{['low','medium','high'].map(option => <option key={option}>{option}</option>)}</select></label> : field(label,item[name],text => set(key,report[key].map((row,i) => i === index ? {...row,[name]:text} : row)))}</div>)}<button type="button" disabled={disabled} onClick={() => set(key,report[key].filter((_,i) => i !== index))}>Remove item</button></div>)}<button type="button" disabled={disabled} onClick={() => set(key,[...(report[key] || []),Object.fromEntries(fields.map(([name]) => [name,name === 'impact' || name === 'effort' ? 'medium' : '']))])}>Add item</button></fieldset>;
  return <div>{field('Summary',report.summary,text => set('summary',text))}{pair('hoursReclaimable','Hours You Could Reclaim')}{list('impactEffortPrioritization','Where to Focus First',[['item','Priority'],['impact','Impact'],['effort','Effort'],['rationale','Reason']])}{list('toolRecommendations','Recommended Tools',[['tool','Tool'],['reason','Reason']])}{pair('estimatedFinancialReturn','Estimated Financial Return')}</div>;
}
