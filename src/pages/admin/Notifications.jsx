import { useEffect, useMemo, useState } from 'react';
import { Bell, Code2, Eye, RefreshCw, Send, Settings, Upload, Users, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { FinanceRecords, Notifications, Schools, Students } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';

const EMPTY_TEMPLATE = `<!doctype html>\n<html><body>\n<p>Hola {{nombreResponsable}},</p>\n<p>Información de {{nombreAlumno}}:</p>\n<p>Periodo: {{periodo}}</p>\n<p>Concepto: {{concepto}}</p>\n<p>Monto: {{monto}}</p>\n<p>Saldo: {{saldo}}</p>\n<p>Vencimiento: {{fechaVencimiento}}</p>\n<p>Ruta Segura · IBIME Transporte Escolar</p>\n</body></html>`;

const FIELDS = [
  ['nombreAlumno','Nombre del alumno'], ['matricula','Matrícula'], ['nombreResponsable','Responsable'],
  ['correo','Correo destinatario'], ['correoAlumno','Correo del alumno'], ['correoResponsable','Correo del responsable'],
  ['plantel','Plantel'], ['nivel','Nivel'], ['grado','Grado'], ['ruta','Ruta'], ['operador','Operador'],
  ['tipoServicio','Tipo de servicio'], ['medioServicio','Entrada/Salida'], ['concepto','Concepto'], ['monto','Monto'],
  ['montoPagado','Monto pagado'], ['saldo','Saldo'], ['estatusPago','Estatus de pago'], ['fechaVencimiento','Fecha de vencimiento'],
  ['periodoInicio','Inicio del periodo'], ['periodoFin','Fin del periodo'], ['diasAtraso','Días de atraso'], ['telefono','Teléfono'],
];

function money(n) { return `$${Number(n || 0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function daysOverdue(date) { if (!date) return 0; const a = new Date(`${date}T12:00:00`); const b = new Date(); a.setHours(12,0,0,0); b.setHours(12,0,0,0); return Math.max(0, Math.floor((b-a)/86400000)); }
function effectiveStatus(r, student) {
  if (r?.cobrado || student?.lastPaymentAt || student?.paymentStatus === 'al_corriente' && r?.montoEstimado > 0 && r?.paymentStatus === 'corriente') return 'pagado';
  if (student?.paymentStatus === 'sin_pago') return 'mora';
  if (student?.paymentStatus === 'desfase') return 'atraso';
  const due = r?.agreementDueDate || r?.fechaVencimiento;
  if (due && due < new Date().toISOString().slice(0,10)) return 'mora';
  return 'pendiente';
}

function buildRecipient(student, finance, school, route) {
  const to = String(student.parentEmail || student.studentEmail || '').trim().toLowerCase();
  const status = effectiveStatus(finance, student);
  const due = finance?.agreementDueDate || finance?.fechaVencimiento || '';
  const amount = Number(finance?.montoEstimado || student?.billingAmount || 0);
  const paid = finance?.cobrado ? amount : Number(student?.lastPaymentAmount || 0);
  return {
    id: student.id, to, status,
    data: {
      nombreAlumno: student.name || '', matricula: student.matricula || '', nombreResponsable: student.familiarResponsable || '',
      correo: to, correoAlumno: student.studentEmail || '', correoResponsable: student.parentEmail || '', plantel: school?.name || '',
      nivel: student.nivel || '', grado: student.grado || '', ruta: route?.name || '', operador: finance?.operatorName || '',
      tipoServicio: finance?.tipoServicio || student.tipoServicio || '', medioServicio: finance?.medioServicio || student.medioServicio || '',
      concepto: finance?.conceptName || '', monto: money(amount), montoPagado: money(paid), saldo: money(Math.max(0, amount-paid)),
      estatusPago: status, fechaVencimiento: due, periodoInicio: finance?.periodoInicio || '', periodoFin: finance?.periodoFin || '',
      diasAtraso: String(daysOverdue(due)), telefono: student.telefono || '',
    }
  };
}

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [students,setStudents]=useState([]); const [records,setRecords]=useState([]); const [schools,setSchools]=useState([]); const [routes,setRoutes]=useState([]);
  const [loading,setLoading]=useState(true); const [campaigns,setCampaigns]=useState([]); const [tab,setTab]=useState('crear');
  const [name,setName]=useState(''); const [subject,setSubject]=useState(''); const [html,setHtml]=useState(EMPTY_TEMPLATE); const [audience,setAudience]=useState('todos');
  const [schoolId,setSchoolId]=useState(''); const [scriptUrl,setScriptUrl]=useState(localStorage.getItem('rutaSeguraAppsScriptUrl') || '');
  const [preview,setPreview]=useState(null); const [sending,setSending]=useState(false); const [notice,setNotice]=useState('');

  async function load(){
    setLoading(true);
    try { const [s,r,sch,rt,c]=await Promise.all([Students.list(),FinanceRecords.list(),Schools.list(),(await import('../../firebase/services')).Routes.list(),Notifications.list()]); setStudents(s);setRecords(r);setSchools(sch);setRoutes(rt);setCampaigns(c); }
    catch(e){console.error(e);setNotice('No se pudieron cargar los datos de Notificaciones.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const schoolMap=useMemo(()=>new Map(schools.map(x=>[x.id,x])),[schools]); const routeMap=useMemo(()=>new Map(routes.map(x=>[x.id,x])),[routes]);
  const financeMap=useMemo(()=>{ const m=new Map(); records.forEach(r=>{ if(r.studentId && !m.has(r.studentId)) m.set(r.studentId,r); }); return m; },[records]);
  const recipients=useMemo(()=>students.map(s=>buildRecipient(s,financeMap.get(s.id),schoolMap.get(s.schoolId),routeMap.get(s.routeId))).filter(x=>x.to && (!schoolId || students.find(s=>s.id===x.id)?.schoolId===schoolId)),[students,financeMap,schoolMap,routeMap,schoolId]);
  const selected=useMemo(()=>recipients.filter(r=>audience==='todos'||r.status===audience|| (audience==='pueden_pagar' && financeMap.get(r.id)?.conceptoCargado && !financeMap.get(r.id)?.cobrado)),[recipients,audience,financeMap]);
  const previewRecipient=selected[0] || recipients[0];

  useEffect(()=>{ setPreview(previewRecipient || null); },[previewRecipient]);

  function interpolate(source,data){ return String(source||'').replace(/{{\s*([\w]+)\s*}}/g,(_,k)=>data[k] == null ? '' : String(data[k])); }
  function insertField(key){ const marker=`{{${key}}}`; setHtml(v=>`${v}${v.endsWith('\\n')?'':'\\n'}${marker}`); }

  async function saveSettings(){ localStorage.setItem('rutaSeguraAppsScriptUrl',scriptUrl.trim()); setNotice('Configuración guardada en este navegador.'); }

  async function sendCampaign(){
    if(!scriptUrl.trim()) { setNotice('Configura primero la URL de tu Web App de Apps Script.'); setTab('config'); return; }
    if(!subject.trim() || !html.trim() || !selected.length) { setNotice('Falta asunto, plantilla o destinatarios.'); return; }
    if(!window.confirm(`Se prepararán ${selected.length} correos. ¿Continuar?`)) return;
    setSending(true); setNotice('Preparando campaña…');
    try {
      const campaignId = `camp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      const payload = { action:'sendCampaign', campaignId, name:name.trim()||subject.trim(), subject, html, createdBy:profile?.name||'', createdAt:new Date().toISOString(), recipients:selected };
      await Notifications.create({ id:campaignId, name:payload.name, subject, audience, schoolId, recipientCount:selected.length, status:'enviando', createdBy:profile?.name||'', createdAt:payload.createdAt, sent:0, failed:0, pending:selected.length });
      const form=document.createElement('form'); form.method='POST'; form.action=scriptUrl.trim(); form.target='rutaSeguraMailFrame'; form.style.display='none';
      const input=document.createElement('input'); input.name='payload'; input.value=JSON.stringify(payload); form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove();
      setNotice('Campaña entregada a Apps Script. Puedes actualizar el historial para ver los resultados.'); setTab('historial'); await load();
    } catch(e){ console.error(e); setNotice(`No se pudo enviar la campaña: ${e.message}`); }
    finally{setSending(false);}
  }

  async function syncCampaign(c){
    if(!scriptUrl.trim()) { setNotice('Configura la URL de Apps Script para sincronizar resultados.'); return; }
    setNotice('Consultando resultados…');
    try {
      const callback=`rsCb_${Date.now()}`;
      const result=await new Promise((resolve,reject)=>{
        const script=document.createElement('script'); const timer=setTimeout(()=>{script.remove();delete window[callback];reject(new Error('Tiempo de espera agotado'));},10000);
        window[callback]=(data)=>{clearTimeout(timer);script.remove();delete window[callback];resolve(data);};
        script.src=`${scriptUrl.replace(/\/$/,'')}?action=status&campaignId=${encodeURIComponent(c.id)}&callback=${callback}`; document.body.appendChild(script);
      });
      if(!result?.ok) throw new Error(result?.error || 'Apps Script no devolvió datos');
      await Notifications.update(c.id,{sent:Number(result.sent||0),failed:Number(result.failed||0),pending:Number(result.pending||0),status:result.pending>0?'enviando':'terminada',syncedAt:new Date().toISOString()});
      await load(); setNotice('Resultados actualizados.');
    } catch(e){console.error(e);setNotice(`No se pudo sincronizar: ${e.message}`);}
  }

  return <div>
    <iframe name="rutaSeguraMailFrame" title="Envío de correo" className="hidden" />
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><div><h1 className="admin-h1">Notificaciones</h1><p className="text-sm text-navy-400 mt-1">Correo personalizado con Google Apps Script + Google Workspace, sin servicio de correo de terceros.</p></div><button onClick={load} className="btn-admin-ghost"><RefreshCw size={14}/> Actualizar</button></div>
    <div className="flex gap-2 border-b border-navy-100 mb-5"><button className={`px-3 py-2 text-sm ${tab==='crear'?'font-semibold text-navy-900 border-b-2 border-navy-800':'text-navy-400'}`} onClick={()=>setTab('crear')}><Bell size={14} className="inline mr-1"/>Crear envío</button><button className={`px-3 py-2 text-sm ${tab==='historial'?'font-semibold text-navy-900 border-b-2 border-navy-800':'text-navy-400'}`} onClick={()=>setTab('historial')}><Clock3 size={14} className="inline mr-1"/>Historial</button><button className={`px-3 py-2 text-sm ${tab==='config'?'font-semibold text-navy-900 border-b-2 border-navy-800':'text-navy-400'}`} onClick={()=>setTab('config')}><Settings size={14} className="inline mr-1"/>Configuración</button></div>
    {notice && <div className="admin-card mb-4 text-sm">{notice}</div>}
    {tab==='config' && <div className="admin-card max-w-3xl"><h2 className="font-semibold text-navy-900 mb-2">Google Apps Script</h2><p className="text-sm text-navy-500 mb-4">Pega la URL de la Web App de Apps Script. La aplicación no guarda contraseñas ni credenciales de Google.</p><label className="admin-label">URL de Web App</label><input value={scriptUrl} onChange={e=>setScriptUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" className="admin-input"/><button onClick={saveSettings} className="btn-admin-primary mt-3">Guardar configuración</button><div className="mt-5 p-3 bg-navy-50 rounded-lg text-xs text-navy-500">La plantilla, destinatarios y resultados se gestionan por campaña. Apps Script usa tu cuenta de Workspace para Gmail y una hoja de Google para el registro.</div></div>}
    {tab==='crear' && <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5"><div className="space-y-5"><div className="admin-card"><div className="grid md:grid-cols-2 gap-3"><div><label className="admin-label">Nombre interno</label><input value={name} onChange={e=>setName(e.target.value)} className="admin-input" placeholder="Aviso de pago septiembre"/></div><div><label className="admin-label">Asunto</label><input value={subject} onChange={e=>setSubject(e.target.value)} className="admin-input" placeholder="Información de pago {{nombreAlumno}}"/></div><div><label className="admin-label">Destinatarios</label><select value={audience} onChange={e=>setAudience(e.target.value)} className="admin-select"><option value="todos">Todos</option><option value="pagado">Ya pagaron</option><option value="mora">Morosos</option><option value="atraso">En atraso</option><option value="pueden_pagar">Tienen concepto y pueden pagar</option></select></div><div><label className="admin-label">Plantel</label><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="admin-select"><option value="">Todos</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div></div>
    <div className="admin-card"><div className="flex flex-wrap items-center justify-between gap-2 mb-3"><div><h2 className="font-semibold">Plantilla HTML</h2><p className="text-xs text-navy-400">Sube/pega tu HTML y usa los campos de la derecha.</p></div><label className="btn-admin-ghost cursor-pointer"><Upload size={14}/> Subir HTML<input type="file" accept=".html,.htm,text/html" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)f.text().then(setHtml)}}/></label></div><textarea value={html} onChange={e=>setHtml(e.target.value)} className="admin-input font-mono text-xs min-h-[330px]"/></div>
    <div className="admin-card"><div className="flex items-center justify-between mb-3"><div><h2 className="font-semibold">Destinatarios</h2><p className="text-xs text-navy-400">Solo se incluyen alumnos con correo.</p></div><div className="flex items-center gap-2 text-sm"><Users size={15}/><b>{selected.length}</b> seleccionados</div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs"><div className="p-3 rounded bg-navy-50"><b>{recipients.length}</b><br/>con correo</div><div className="p-3 rounded bg-navy-50"><b>{selected.filter(x=>x.status==='pagado').length}</b><br/>pagados</div><div className="p-3 rounded bg-navy-50"><b>{selected.filter(x=>x.status==='atraso').length}</b><br/>atraso</div><div className="p-3 rounded bg-navy-50"><b>{selected.filter(x=>x.status==='mora').length}</b><br/>mora</div></div></div>
    <button disabled={sending||!selected.length} onClick={sendCampaign} className="btn-admin-primary w-full justify-center"><Send size={15}/>{sending?'Preparando…':`Enviar ${selected.length} correos`}</button></div>
    <div className="space-y-5"><div className="admin-card"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold flex items-center gap-2"><Code2 size={15}/>Campos</h2><span className="text-xs text-navy-400">clic para insertar</span></div><div className="grid grid-cols-1 gap-1 max-h-[440px] overflow-auto">{FIELDS.map(([key,label])=><button key={key} onClick={()=>insertField(key)} className="text-left px-2 py-1.5 rounded hover:bg-navy-50 text-xs"><code>{`{{${key}}}`}</code> · {label}</button>)}</div></div><div className="admin-card"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold flex items-center gap-2"><Eye size={15}/>Vista previa</h2><button onClick={()=>setPreview(previewRecipient)} className="text-xs link-action">Actualizar</button></div>{previewRecipient?<><p className="text-xs text-navy-400 mb-2">Ejemplo: {previewRecipient.data.nombreAlumno} · {previewRecipient.to}</p><iframe title="Vista previa" sandbox="allow-same-origin" srcDoc={interpolate(html,previewRecipient.data)} className="w-full h-[420px] border border-navy-100 rounded bg-white"/></>:<p className="text-sm text-navy-400">No hay destinatarios con correo.</p>}</div></div></div>}
    {tab==='historial' && <div className="admin-card p-0 overflow-hidden"><div className="px-4 py-3 border-b border-navy-100"><h2 className="font-semibold">Historial de campañas</h2></div><div className="overflow-x-auto"><table className="table-admin text-xs min-w-[900px]"><thead><tr><th>Campaña</th><th>Asunto</th><th>Destinatarios</th><th>Enviados</th><th>Fallidos</th><th>Pendientes</th><th>Estado</th><th></th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td className="font-medium">{c.name}</td><td>{c.subject}</td><td>{c.recipientCount||0}</td><td className="text-go"><CheckCircle2 size={13} className="inline mr-1"/>{c.sent||0}</td><td className="text-stop"><XCircle size={13} className="inline mr-1"/>{c.failed||0}</td><td>{c.pending||0}</td><td>{c.status||'—'}</td><td><button onClick={()=>syncCampaign(c)} className="btn-admin-ghost"><RefreshCw size={12}/> Sincronizar</button></td></tr>)}</tbody></table></div>{!campaigns.length&&<p className="p-8 text-center text-sm text-navy-400">Aún no hay campañas.</p>}</div>}
  </div>;
}
