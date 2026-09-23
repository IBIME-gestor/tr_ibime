import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Download, CalendarClock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FinanceRecords, Students, Schools, RouteLists } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { school:'', nivel:'', grado:'', service:'' };
const money = (n) => `$${Number(n || 0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const firstDayOfMonth = () => { const d = new Date(); d.setDate(1); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };

function addDays(dateString, days) {
  if (!dateString) return '';
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  const local = new Date(d);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0,10);
}

function effectiveStatus(record) {
  if (record.cobrado) return 'corriente';
  const due = record.agreementDueDate || record.fechaVencimiento || addDays(record.periodoFin, record.paymentDays || 0);
  if (record.paymentStatus === 'acuerdo' && due && due >= today()) return 'acuerdo';
  if (!due || due >= today()) return 'corriente';
  return due < firstDayOfMonth() ? 'mora' : 'atraso';
}

const STATUS = {
  corriente: { label:'Corriente', cls:'badge-go' },
  acuerdo: { label:'Acuerdo', cls:'badge-amber' },
  atraso: { label:'Atraso', cls:'badge-stop' },
  mora: { label:'Mora', cls:'badge-stop' },
};

export default function Finance() {
  const { profile, user } = useAuth();
  const [records,setRecords]=useState([]); const [students,setStudents]=useState([]); const [schoolRows,setSchoolRows]=useState([]);
  const [filters,setFilters]=useState(EMPTY); const [loading,setLoading]=useState(true); const [module,setModule]=useState('corriente');

  async function load(){ setLoading(true); try { const [r,s,sch,lists]=await Promise.all([FinanceRecords.list(),Students.list(),Schools.list(),RouteLists.list()]);
      // Reparación segura: solo reconstruye registros de Finanzas que están en $0, usando el monto que ya existe en las listas.
      // No modifica listas, alumnos, pagos ni registros que ya tengan un monto.
      // Modo actual de Finanzas: solo muestra registros cuyo listId
      // corresponde a una lista que actualmente existe en RouteLists.
      // Esto evita que pruebas/listas eliminadas vuelvan a aparecer en Finanzas.
      // Más adelante podremos agregar un modo Histórico que consulte también
      // los registros financieros que ya no tengan una lista activa.
      // Finanzas no se valida solamente contra la existencia de la lista.
      // Debe existir LA MISMA COMBINACIÓN lista + alumno dentro de las filas
      // actuales de RouteLists. Así, si eliminaste un alumno de una lista,
      // su registro financiero anterior tampoco vuelve a aparecer.
      const activeListIds = new Set((lists || []).map(list => list.id).filter(Boolean));
      const listRows = new Map();
      (lists || []).forEach(list => (list.rows || []).forEach(row => {
        if (list.id && row?.studentId) {
          listRows.set(`${list.id}_${row.studentId}`, { list, row });
        }
      }));
      const activeFinanceRecords = (r || []).filter(rec => {
        if (!rec?.listId || !rec?.studentId) return false;
        if (!activeListIds.has(rec.listId)) return false;
        return listRows.has(`${rec.listId}_${rec.studentId}`);
      });
      const repaired = [];
      for (const rec of activeFinanceRecords) {
        const source = listRows.get(rec.id || `${rec.listId}_${rec.studentId}`);
        const amount = Number(rec.montoEstimado || 0);
        const sourceAmount = Number(source?.row?.estimatedAmount || 0);
        if (source && amount <= 0 && sourceAmount > 0) {
          const patch = { montoEstimado: sourceAmount, conceptId: source.row.pricingConceptId || rec.conceptId || '', conceptName: source.row.concept || rec.conceptName || '', tipoServicio: source.row.tipoServicio || rec.tipoServicio || '', medioServicio: source.row.medioServicio || rec.medioServicio || '', diasSemana: source.row.diasSemana || rec.diasSemana || [], fechasDiarias: source.row.fechasDiarias || rec.fechasDiarias || [], paymentDays: Number(source.row.paymentDays || rec.paymentDays || 0) };
          await FinanceRecords.update(rec.id, patch);
          repaired.push({...rec, ...patch});
        } else repaired.push(rec);
      }
      setRecords(repaired); setStudents(s); setSchoolRows(sch);
    } catch(e){ console.error(e); setRecords([]); } finally { setLoading(false); } }
  useEffect(()=>{load();},[]);

  const studentMap=useMemo(()=>new Map(students.map(s=>[s.id,s])),[students]);
  const schoolMap=useMemo(()=>new Map(schoolRows.map(s=>[s.id,s])),[schoolRows]);
  const enriched=useMemo(()=>records.map(r=>{ const st=studentMap.get(r.studentId)||{}; const school=schoolMap.get(st.schoolId); return {...r, _student:st, currentSchoolId:st.schoolId||r.schoolId||'', currentSchoolName:school?.name||st.schoolName||r.schoolName||'', currentNivel:st.nivel||r.nivel||'', currentGrado:st.grado||r.grado||'', currentStatus:effectiveStatus(r)}; }),[records,studentMap,schoolMap]);
  const schools=useMemo(()=>[...new Set(enriched.map(r=>r.currentSchoolName).filter(Boolean))].sort(),[enriched]);
  const niveles=useMemo(()=>[...new Set(enriched.filter(r=>!filters.school||r.currentSchoolName===filters.school).map(r=>r.currentNivel).filter(Boolean))].sort(),[enriched,filters.school]);
  const grados=useMemo(()=>[...new Set(enriched.filter(r=>(!filters.school||r.currentSchoolName===filters.school)&&(!filters.nivel||r.currentNivel===filters.nivel)).map(r=>r.currentGrado).filter(Boolean))].sort(),[enriched,filters]);
  const filtered=useMemo(()=>enriched.filter(r=>(!filters.school||r.currentSchoolName===filters.school)&&(!filters.nivel||r.currentNivel===filters.nivel)&&(!filters.grado||r.currentGrado===filters.grado)&&(!filters.service||r.tipoServicio===filters.service)&&r.currentStatus===module),[enriched,filters,module]);
  const counts=useMemo(()=>enriched.reduce((a,r)=>({...a,[r.currentStatus]:(a[r.currentStatus]||0)+1}),{corriente:0,acuerdo:0,atraso:0,mora:0}),[enriched]);
  const totals=useMemo(()=>filtered.reduce((a,r)=>({amount:a.amount+Number(r.montoEstimado||0),cobrado:a.cobrado+(r.cobrado?Number(r.montoEstimado||0):0)}),{amount:0,cobrado:0}),[filtered]);

  async function markAgreement(record) {
    const current = record.agreementDueDate || record.fechaVencimiento || addDays(record.periodoFin,record.paymentDays||0);
    const due = window.prompt('Fecha límite del acuerdo (AAAA-MM-DD):', current || today());
    if (!due) return;
    try {
      await FinanceRecords.update(record.id,{paymentStatus:'acuerdo',agreementDueDate:due,agreementUpdatedAt:new Date().toISOString(),agreementUpdatedBy:profile?.name||''});
      setRecords(prev=>prev.map(r=>r.id===record.id?{...r,paymentStatus:'acuerdo',agreementDueDate:due}:r));
    } catch(e){console.error(e);window.alert('No se pudo guardar el acuerdo.');}
  }

  async function markCurrent(record) {
    try { await FinanceRecords.update(record.id,{paymentStatus:'corriente',agreementDueDate:'',paymentStatusUpdatedAt:new Date().toISOString(),paymentStatusUpdatedBy:profile?.name||''}); setRecords(prev=>prev.map(r=>r.id===record.id?{...r,paymentStatus:'corriente',agreementDueDate:''}:r)); }
    catch(e){console.error(e);window.alert('No se pudo actualizar el estatus.');}
  }

  async function markPaid(record, checked = true){
    const amount=Number(record.montoEstimado||0);
    if (!checked) {
      try {
        // No eliminamos paymentId: así, si fue un error y se vuelve a marcar,
        // se reutiliza el mismo registro y no se genera un cobro duplicado.
        await FinanceRecords.update(record.id,{cobrado:false,cobradoAt:'',cobradoBy:''});
        if (record.listId && record.studentId) {
          const activeList = await RouteLists.get(record.listId);
          if (activeList) {
            const updatedRows = (activeList.rows || []).map(row =>
              row.studentId === record.studentId ? { ...row, paid:false } : row
            );
            await RouteLists.update(record.listId, { rows: updatedRows });
          }
        }
        setRecords(prev=>prev.map(r=>r.id===record.id?{...r,cobrado:false,cobradoAt:'',cobradoBy:''}:r));
      } catch(e) { console.error(e); window.alert('No se pudo desmarcar el pago.'); }
      return;
    }
    if(record.cobrado) return;
    if(!(amount>0)){window.alert('El registro no tiene un monto mayor a cero.');return;}
    if(!window.confirm(`Registrar pago de ${money(amount)} para ${record.studentName}?`)) return;
    try{
      let paymentId = record.pagoId || '';
      if (!paymentId) {
        paymentId=await Students.registerPayment(record.studentId,{amount,method:'finanzas',note:`Cargo ${record.conceptName||'Servicio'} · ${record.periodoInicio||''} al ${record.periodoFin||''}`,nextDueDate:addDays(record.periodoFin,record.paymentDays||0),byName:profile?.name,byUid:user?.uid,routeId:record.routeId,unitId:record.unitId,listId:record.listId});
      }
      await FinanceRecords.update(record.id,{cobrado:true,pagoId:paymentId,cobradoAt:new Date().toISOString(),cobradoBy:profile?.name||'',paymentStatus:'corriente',agreementDueDate:''});

      if (record.listId && record.studentId) {
        const activeList = await RouteLists.get(record.listId);
        if (activeList) {
          const updatedRows = (activeList.rows || []).map(row =>
            row.studentId === record.studentId ? { ...row, paid:true, paymentId } : row
          );
          await RouteLists.update(record.listId, { rows: updatedRows });
        }
      }

      setRecords(prev=>prev.map(r=>r.id===record.id?{...r,cobrado:true,pagoId:paymentId,paymentStatus:'corriente',agreementDueDate:''}:r));
    }catch(e){console.error(e);window.alert('No se pudo registrar el pago.');}
  }

  async function setChecklist(record, field, value) {
    try {
      await FinanceRecords.update(record.id, { [field]: value, [`${field}At`]: new Date().toISOString(), [`${field}By`]: profile?.name || '' });
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, [field]: value } : r));
    } catch (e) { console.error(e); window.alert('No se pudo guardar el seguimiento.'); }
  }

  function service(r){ if(r.tipoServicio==='completo') return 'Completo E+S'; if(r.tipoServicio==='medio') return `Medio ${r.medioServicio==='entrada'?'E':'S'} · ${(r.diasSemana||[]).map(d=>['','L','M','X','J','V'][d]).join(' ')}`; return `Diario · ${(r.fechasDiarias||[]).map(x=>x.slice(8,10)).join(', ')}`; }
  function exportExcel(){ const data=filtered.map(r=>({Estatus:STATUS[r.currentStatus]?.label||r.currentStatus,Plantel:r.currentSchoolName,Nivel:r.currentNivel,Grado:r.currentGrado,Alumno:r.studentName,Matrícula:r.matricula,Ruta:r.routeName,Operador:r.operatorName||'',Servicio:service(r),Concepto:r.conceptName,'Monto estimado':Number(r.montoEstimado||0),'Vencimiento':r.agreementDueDate||r.fechaVencimiento||addDays(r.periodoFin,r.paymentDays||0),Cobrado:r.cobrado?'Sí':'No'})); const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Finanzas'); XLSX.writeFile(wb,'finanzas_ruta_segura.xlsx'); }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5"><div><h1 className="admin-h1">Finanzas</h1><p className="text-sm text-navy-400 mt-1">El Plantel, nivel y grado se toman del expediente actual del alumno. El estatus de pago se calcula por vencimiento y por mes.</p></div><div className="flex gap-2"><button onClick={load} className="btn-admin-ghost"><RefreshCw size={14}/> Actualizar</button><button onClick={exportExcel} className="btn-admin-ghost"><Download size={14}/> Excel</button></div></div>
    <div className="admin-card mb-5"><div className="grid grid-cols-1 md:grid-cols-4 gap-3"><div><label className="admin-label">Plantel</label><select value={filters.school} onChange={e=>setFilters({school:e.target.value,nivel:'',grado:'',service:filters.service})} className="admin-select"><option value="">Todos</option>{schools.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="admin-label">Nivel</label><select value={filters.nivel} onChange={e=>setFilters({...filters,nivel:e.target.value,grado:''})} className="admin-select"><option value="">Todos</option>{niveles.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="admin-label">Grado</label><select value={filters.grado} onChange={e=>setFilters({...filters,grado:e.target.value})} className="admin-select"><option value="">Todos</option>{grados.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="admin-label">Servicio</label><select value={filters.service} onChange={e=>setFilters({...filters,service:e.target.value})} className="admin-select"><option value="">Todos</option><option value="completo">Completo</option><option value="medio">Medio</option><option value="diario">Diario</option></select></div></div></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">{Object.entries(STATUS).map(([key,v])=><button key={key} onClick={()=>setModule(key)} className={`admin-card text-left transition ${module===key?'ring-2 ring-navy-400':''}`}><p className="text-xs text-navy-400">{v.label}</p><p className="font-display font-bold text-lg mt-1">{counts[key]||0}</p></button>)}</div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5"><div className="admin-card"><p className="text-xs text-navy-400">Registros en {STATUS[module].label}</p><p className="font-display font-bold text-lg mt-1">{filtered.length}</p></div><div className="admin-card"><p className="text-xs text-navy-400">Estimado</p><p className="font-display font-bold text-lg mt-1">{money(totals.amount)}</p></div><div className="admin-card"><p className="text-xs text-navy-400">Cobrado</p><p className="font-display font-bold text-lg mt-1">{money(totals.cobrado)}</p></div></div>
    <div className="admin-card p-0 overflow-hidden"><div className="px-4 py-3 border-b border-navy-100 text-xs text-navy-400">Vencimiento: fin de periodo + plazo configurado en Tarifas y Conceptos. Si vence dentro del mes aparece en <b>Atraso</b>; si llega el siguiente mes sin pago pasa a <b>Mora</b>.</div><div className="overflow-x-auto"><table className="table-admin text-xs min-w-[1250px]"><thead><tr><th>Estatus</th><th>Plantel</th><th>Nivel</th><th>Grado</th><th>Alumno</th><th>Matrícula</th><th>Ruta</th><th>Operador</th><th>Servicio</th><th>Concepto</th><th>Monto</th><th>Vencimiento</th><th>Seguimiento</th><th>Acciones</th></tr></thead><tbody>{filtered.map(r=>{const st=STATUS[r.currentStatus]||STATUS.corriente;const due=r.agreementDueDate||r.fechaVencimiento||addDays(r.periodoFin,r.paymentDays||0);return <tr key={r.id}><td><span className={st.cls}>{st.label}</span></td><td>{r.currentSchoolName||'—'}</td><td>{r.currentNivel||'—'}</td><td>{r.currentGrado||'—'}</td><td className="font-medium">{r.studentName}</td><td>{r.matricula}</td><td>{r.routeName}</td><td>{r.operatorName||'—'}</td><td>{service(r)}</td><td>{r.conceptName}</td><td className="font-medium">{money(r.montoEstimado)}</td><td>{due||'—'}</td><td><div className="flex flex-wrap gap-2 items-center text-[10px]"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!r.solicitudAtendida} onChange={e=>setChecklist(r,'solicitudAtendida',e.target.checked)}/>Atención</label><label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!r.servicioConfirmado} onChange={e=>setChecklist(r,'servicioConfirmado',e.target.checked)}/>Confirmado</label><label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!r.conceptoCargado} onChange={e=>setChecklist(r,'conceptoCargado',e.target.checked)}/>Concepto</label><label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!r.cobrado} onChange={e=>markPaid(r,e.target.checked)}/>Pagado</label></div></td><td className="whitespace-nowrap"><button title="Registrar pago" onClick={()=>markPaid(r)} className="w-7 h-7 rounded border border-go/40 text-go inline-flex items-center justify-center mr-1"><Check size={14}/></button>{r.currentStatus!=='acuerdo'&&<button title="Crear acuerdo" onClick={()=>markAgreement(r)} className="w-7 h-7 rounded border border-navy-200 text-navy-500 inline-flex items-center justify-center mr-1"><CalendarClock size={14}/></button>}{r.currentStatus==='acuerdo'&&<button title="Quitar acuerdo" onClick={()=>markCurrent(r)} className="w-7 h-7 rounded border border-navy-200 text-navy-500 inline-flex items-center justify-center"><RefreshCw size={13}/></button>}</td></tr>})}</tbody></table></div>{!loading&&!filtered.length&&<p className="p-6 text-center text-sm text-navy-400">No hay alumnos en este módulo con los filtros seleccionados.</p>}</div>
  </div>;
}
