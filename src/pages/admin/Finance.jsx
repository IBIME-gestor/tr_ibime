import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { FinanceRecords, Students, Schools } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { school:'', nivel:'', grado:'' };
const money = (n) => `$${Number(n || 0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function Finance() {
  const { profile } = useAuth();
  const [records,setRecords]=useState([]); const [students,setStudents]=useState([]); const [schoolRows,setSchoolRows]=useState([]); const [filters,setFilters]=useState(EMPTY); const [loading,setLoading]=useState(true);
  async function load(){ setLoading(true); try { const [r,s,sch]=await Promise.all([FinanceRecords.list(),Students.list(),Schools.list()]); setRecords(r); setStudents(s); setSchoolRows(sch); } catch(e){ console.error(e); setRecords([]); } finally { setLoading(false); } }
  useEffect(()=>{load();},[]);
  const schools=useMemo(()=>schoolRows.map(s=>s.name).filter(Boolean),[schoolRows]);
  const niveles=useMemo(()=>[...new Set(students.filter(s=>!filters.school||s.schoolName===filters.school).map(s=>s.nivel).filter(Boolean))].sort(),[students,filters.school]);
  const grados=useMemo(()=>[...new Set(students.filter(s=>(!filters.school||s.schoolName===filters.school)&&(!filters.nivel||s.nivel===filters.nivel)).map(s=>s.grado).filter(Boolean))].sort(),[students,filters]);
  const filtered=useMemo(()=>records.filter(r=>(!filters.school||r.schoolName===filters.school)&&(!filters.nivel||r.nivel===filters.nivel)&&(!filters.grado||r.grado===filters.grado)),[records,filters]);
  const totals=useMemo(()=>filtered.reduce((a,r)=>({amount:a.amount+Number(r.montoEstimado||0),cobrado:a.cobrado+(r.cobrado?Number(r.montoEstimado||0):0),done:a.done+(r.solicitudAtendida?1:0),confirmed:a.confirmed+(r.servicioConfirmado?1:0),concept:a.concept+(r.conceptoCargado?1:0)}),{amount:0,cobrado:0,done:0,confirmed:0,concept:0}),[filtered]);
  async function toggle(id,key,value){
    const record=records.find(r=>r.id===id); if(!record) return;
    try {
      if(key==='cobrado' && value && !record.pagoId){
        if(Number(record.montoEstimado||0)<=0){ alert('El registro no tiene un monto mayor a cero.'); return; }
        const paymentId=await Students.registerPayment(record.studentId,{amount:Number(record.montoEstimado||0),method:'finanzas',note:`Cargo ${record.conceptName||'Servicio'} · ${record.periodoInicio||''} al ${record.periodoFin||''}`,nextDueDate:record.periodoFin||null,byName:profile?.name,routeId:record.routeId,unitId:record.unitId,listId:record.listId});
        await FinanceRecords.update(id,{cobrado:true,pagoId:paymentId,cobradoAt:new Date().toISOString(),cobradoBy:profile?.name||''});
        setRecords(prev=>prev.map(r=>r.id===id?{...r,cobrado:true,pagoId:paymentId}:r));
      } else {
        await FinanceRecords.update(id,{[key]:value,[`${key}At`]:new Date().toISOString(),[`${key}By`]:profile?.name||''});
        setRecords(prev=>prev.map(r=>r.id===id?{...r,[key]:value}:r));
      }
    } catch(e){ console.error(e); alert('No se pudo actualizar el checklist.'); }
  }
  function service(r){ if(r.tipoServicio==='completo') return 'Completo E+S'; if(r.tipoServicio==='medio') return `Medio ${r.medioServicio==='entrada'?'E':'S'} · ${(r.diasSemana||[]).map(d=>['','L','M','X','J','V'][d]).join(' ')}`; return `Diario · ${(r.fechasDiarias||[]).map(x=>x.slice(8,10)).join(', ')}`; }
  function exportExcel(){ const data=filtered.map(r=>({Plantel:r.schoolName,Nivel:r.nivel,Grado:r.grado,Alumno:r.studentName,Matrícula:r.matricula,Ruta:r.routeName,'Tipo servicio':service(r),Concepto:r.conceptName,'Monto estimado':Number(r.montoEstimado||0),'Solicitud atendida':r.solicitudAtendida?'Sí':'No','Servicio confirmado':r.servicioConfirmado?'Sí':'No','Concepto cargado':r.conceptoCargado?'Sí':'No',Cobrado:r.cobrado?'Sí':'No'})); const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Finanzas'); XLSX.writeFile(wb,'finanzas_ruta_segura.xlsx'); }
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5"><div><h1 className="admin-h1">Finanzas</h1><p className="text-sm text-navy-400 mt-1">Control de solicitudes y cargos por plantel, nivel y grado. El checklist alimenta Caja y reportes.</p></div><div className="flex gap-2"><button onClick={load} className="btn-admin-ghost"><RefreshCw size={14}/> Actualizar</button><button onClick={exportExcel} className="btn-admin-ghost"><Download size={14}/> Excel</button></div></div>
    <div className="admin-card mb-5"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label className="admin-label">Plantel</label><select value={filters.school} onChange={e=>setFilters({school:e.target.value,nivel:'',grado:''})} className="admin-select"><option value="">Todos</option>{schools.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="admin-label">Nivel</label><select value={filters.nivel} onChange={e=>setFilters({...filters,nivel:e.target.value,grado:''})} className="admin-select"><option value="">Todos</option>{niveles.map(x=><option key={x}>{x}</option>)}</select></div><div><label className="admin-label">Grado</label><select value={filters.grado} onChange={e=>setFilters({...filters,grado:e.target.value})} className="admin-select"><option value="">Todos</option>{grados.map(x=><option key={x}>{x}</option>)}</select></div></div></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">{[['Solicitudes',filtered.length],['Estimado',money(totals.amount)],['Cobrado',money(totals.cobrado)],['Conceptos cargados',`${totals.concept}/${filtered.length||0}`],['Servicios confirmados',`${totals.confirmed}/${filtered.length||0}`]].map(([l,v])=><div key={l} className="admin-card"><p className="text-xs text-navy-400">{l}</p><p className="font-display font-bold text-lg mt-1">{v}</p></div>)}</div>
    <div className="admin-card p-0 overflow-hidden"><div className="px-4 py-3 border-b border-navy-100 text-xs text-navy-400">Marca cada etapa conforme se atiende en la otra plataforma de cargos. Al marcar <strong>Cobrado</strong> desde aquí se debe registrar el pago en Caja; por seguridad, esta pantalla muestra el estatus y la acción de cobro se mantiene centralizada en la lista/Caja.</div><div className="overflow-x-auto"><table className="table-admin text-xs min-w-[1100px]"><thead><tr><th>Plantel</th><th>Nivel</th><th>Grado</th><th>Alumno</th><th>Matrícula</th><th>Ruta</th><th>Servicio</th><th>Concepto</th><th>Monto</th><th>Solicitud</th><th>Confirmado</th><th>Concepto</th><th>Cobrado</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{r.schoolName||'—'}</td><td>{r.nivel||'—'}</td><td>{r.grado||'—'}</td><td className="font-medium">{r.studentName}</td><td>{r.matricula}</td><td>{r.routeName}</td><td>{service(r)}</td><td>{r.conceptName}</td><td className="font-medium">{money(r.montoEstimado)}</td>{[['solicitudAtendida','Solicitud'],['servicioConfirmado','Confirmado'],['conceptoCargado','Concepto'],['cobrado','Cobrado']].map(([k])=><td key={k} className="text-center"><button onClick={()=>toggle(r.id,k,!r[k])} className={`w-7 h-7 rounded border inline-flex items-center justify-center ${r[k]?'bg-go/15 border-go/40 text-go':'border-navy-200 text-navy-300'}`} title={r[k]?'Desmarcar':'Marcar'}><Check size={14}/></button></td>)}</tr>)}</tbody></table></div>{!loading&&!filtered.length&&<p className="p-6 text-center text-sm text-navy-400">No hay registros con los filtros seleccionados. Las nuevas listas generarán aquí sus solicitudes.</p>}</div>
  </div>;
}
