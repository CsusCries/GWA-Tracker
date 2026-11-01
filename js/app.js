const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ord=y=>['','1st','2nd','3rd','4th'][y]||y+'th';
let STUDENTS=[],TEACHERS=[],REGS=[];
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),2200)}
// All data calls go through api() in js/db.js. Swap that file for real fetch() calls when you add a database.
const gwaTag=g=>g==null?'<span class="gwa">No grades</span>':`<span class="gwa ${g<=1.75?'hon':g>2.75?'risk':''}">GWA ${g.toFixed(2)}</span>`;

const TITLES={dashboard:'Admin Dashboard',students:'Student Records',teachers:'Faculty Directory',registrations:'Registration Requests'};
function show(tab){document.querySelectorAll('.tab').forEach(s=>s.hidden=s.id!==tab);
 document.querySelectorAll('.nav [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 $('#pageTitle').textContent=TITLES[tab];history.replaceState(null,'','#'+tab);({dashboard:loadStats,students:loadStudents,teachers:loadTeachers,registrations:loadRegs})[tab]()}
document.querySelectorAll('.nav [data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));

// ---------- Dashboard ----------
async function loadStats(){try{const s=await api('/stats');
 $('#sTotal').textContent=s.total;$('#sMale').textContent=s.male;$('#sFemale').textContent=s.female;$('#sTeachers').textContent=s.teachers;$('#sPending').textContent=s.pending;$('#sAvg').textContent=s.average_gwa?.toFixed(2)??'–';
 const pm=s.total?s.male/s.total*100:0;$('#barM').style.width=pm+'%';$('#barF').style.width=(s.total?100-pm:0)+'%';
 $('#barTxt').textContent=`${s.male} male (${pm.toFixed(0)}%) · ${s.female} female (${(s.total?100-pm:0).toFixed(0)}%)`;
 $('#hon').textContent=s.honors;$('#risk').textContent=s.at_risk;
 $('#years').innerHTML=Object.entries(s.by_year).map(([y,b])=>`<button data-year="${y}"><b style="font-size:16px">${ord(+y)} Year</b><div style="font-size:26px;font-weight:800;margin:6px 0">${b.total}</div>
  <div class="bar"><i style="width:${b.total?b.Male/b.total*100:0}%"></i><i style="width:${b.total?b.Female/b.total*100:0}%"></i></div><span class="legend">${b.Male} male · ${b.Female} female</span></button>`).join('');
 $('#years').querySelectorAll('button').forEach(b=>b.onclick=()=>{openYear=+b.dataset.year;$('#q').value='';$('#ln').value='';$('#fg').value='';show('students')});
 $('#top').innerHTML=s.top.map((t,i)=>`<tr><td>${i+1}</td><td><b>${esc(t.first_name+' '+t.last_name)}</b></td><td>${esc(t.student_id)}</td><td>${ord(t.year)} · ${esc(t.section)}</td><td>${gwaTag(t.gwa)}</td><td><button class="btn sm" data-edit="${t.id}">View</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No grades yet</td></tr>';
 $('#top').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editStudent(+b.dataset.edit));
 $('#online').textContent='System online';
}catch(e){$('#online').textContent='Offline'}}
document.querySelectorAll('.stat').forEach(b=>b.onclick=()=>{if(b.dataset.go==='students'){$('#fg').value=b.dataset.gender||'';if(b.dataset.sort)$('#fs').value=b.dataset.sort;$('#q').value='';$('#ln').value=''}show(b.dataset.go)});

// ---------- Students ----------
let openYear=null;
async function loadStudents(){try{STUDENTS=await api('/students');renderStudents()}catch(e){toast(e.message)}}
function renderStudents(){
 const q=$('#q').value.trim().toLowerCase(),ln=$('#ln').value.trim().toLowerCase(),g=$('#fg').value,sort=$('#fs').value;
 const list=STUDENTS.filter(s=>(!g||s.gender===g)&&(!ln||s.last_name.toLowerCase().includes(ln))&&(!q||[s.first_name,s.last_name,s.first_name+' '+s.last_name,s.email,s.student_id,ord(s.year)+' year','year '+s.year,'section '+s.section,s.gender,s.gender==='Male'?'boy':'girl'].some(v=>v.toLowerCase().includes(q))));
 const cmp=sort==='gwa'?(a,b)=>(a.gwa??9)-(b.gwa??9):(a,b)=>a.last_name.localeCompare(b.last_name)||a.first_name.localeCompare(b.first_name);
 const filtering=q||ln||g;let html='';
 for(const y of [1,2,3,4]){const ys=list.filter(s=>s.year===y);if(!ys.length&&filtering)continue;
  const secs=[...new Set(['A','B','C',...ys.map(s=>s.section)])].sort();
  html+=`<details class="year" data-y="${y}" ${(filtering||openYear===y||openYear===null&&y===1)?'open':''}><summary>${ord(y)} Year (${ys.length})</summary><div class="sections">`+
  secs.map(sec=>{const ss=ys.filter(s=>s.section===sec);if(!ss.length&&filtering)return'';return `<div class="section"><div class="section-h">Section ${esc(sec)}<span class="count">${ss.length}</span></div>`+
   [['Male','Boys'],['Female','Girls']].map(([gd,lab])=>{const p=ss.filter(s=>s.gender===gd).sort(cmp);if(g&&g!==gd)return'';
    return `<div class="ghead">${lab} (${p.length})</div>`+(p.map(s=>`<div class="person"><div><b>${esc(s.first_name+' '+s.last_name)}</b><small>Student ID: ${esc(s.student_id)}</small><small>Email: ${esc(s.email)}</small>${gwaTag(s.gwa)}</div>
     <div class="acts"><button class="btn sm" data-edit="${s.id}">Edit</button><button class="btn ghost sm" data-del="${s.id}">Delete</button></div></div>`).join('')||'<div class="empty" style="padding:6px">None</div>')}).join('')+'</div>'}).join('')+'</div></details>'}
 $('#tree').innerHTML=html||'<p class="empty">No students match your search.</p>';
 $('#tree').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editStudent(+b.dataset.edit));
 $('#tree').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delStudent(+b.dataset.del));
 $('#tree').querySelectorAll('details').forEach(d=>d.ontoggle=()=>{if(d.open&&!filtering)openYear=+d.dataset.y});
}
['#q','#ln'].forEach(s=>$(s).oninput=renderStudents);['#fg','#fs'].forEach(s=>$(s).onchange=renderStudents);

let editingId=null;
function gradeRow(g={}){const d=document.createElement('div');d.className='grow';
 d.innerHTML=`<input placeholder="Subject" value="${esc(g.subject)}" data-k="subject"><input type="number" min="0.5" step="0.5" placeholder="Units" value="${g.units??3}" data-k="units"><input type="number" min="1" max="5" step="0.25" placeholder="Grade" value="${g.grade??''}" data-k="grade"><button type="button" class="btn danger sm" title="Remove">✕</button>`;
 d.querySelector('button').onclick=()=>{d.remove();liveGwa()};d.oninput=liveGwa;$('#grades').append(d)}
function readGrades(){return[...$('#grades').children].map(r=>Object.fromEntries([...r.querySelectorAll('input')].map(i=>[i.dataset.k,i.value])))}
function liveGwa(){let w=0,u=0;readGrades().forEach(g=>{const gr=+g.grade,un=+g.units||0;if(g.subject&&gr){w+=gr*un;u+=un}});$('#liveGwa').textContent=u?(w/u).toFixed(2):'–'}
$('#addGrade').onclick=()=>gradeRow({});
async function editStudent(id){const f=$('#fStudent');f.reset();$('#dsErr').textContent='';$('#grades').innerHTML='';editingId=id;
 if(id){const s=await api('/students/'+id);for(const k of['first_name','last_name','student_id','email','gender','year','section'])f.elements[k].value=s[k];
  s.grades.forEach(gradeRow);$('#dsTitle').textContent='Edit Student';$('#gradesBox').hidden=false}
 else{$('#dsTitle').textContent='Add Student';$('#gradesBox').hidden=true}
 liveGwa();$('#dStudent').showModal()}
$('#addStudent').onclick=()=>editStudent(null);
$('#fStudent').onsubmit=async e=>{if(e.submitter?.value!=='save')return;e.preventDefault();
 const body=Object.fromEntries(new FormData(e.target));if(editingId)body.grades=readGrades();
 try{await api('/students'+(editingId?'/'+editingId:''),{method:editingId?'PUT':'POST',body});$('#dStudent').close();toast(editingId?'Student updated':'Student added');refresh()}catch(err){$('#dsErr').textContent=err.message}};
async function delStudent(id){const s=STUDENTS.find(x=>x.id===id);if(!confirm(`Delete ${s?s.first_name+' '+s.last_name:'this student'}? This also removes their grades.`))return;
 try{await api('/students/'+id,{method:'DELETE'});toast('Student deleted');refresh()}catch(e){toast(e.message)}}

// ---------- Teachers ----------
async function loadTeachers(){try{TEACHERS=await api('/teachers');renderTeachers()}catch(e){toast(e.message)}}
function renderTeachers(){const q=$('#tq').value.trim().toLowerCase();
 const l=TEACHERS.filter(t=>!q||[t.name,t.email,t.department,t.subject].some(v=>(v||'').toLowerCase().includes(q)));
 $('#tlist').innerHTML=l.map(t=>`<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.email)}</td><td>${esc(t.department||'—')}</td><td>${esc(t.subject||'—')}</td><td style="white-space:nowrap"><button class="btn sm" data-e="${t.id}">Edit</button> <button class="btn ghost sm" data-d="${t.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No teachers found</td></tr>';
 $('#tlist').querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editTeacher(+b.dataset.e));
 $('#tlist').querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this teacher?'))return;await api('/teachers/'+b.dataset.d,{method:'DELETE'});toast('Teacher deleted');loadTeachers()})}
$('#tq').oninput=renderTeachers;
let tEdit=null;
function editTeacher(id){const f=$('#fTeacher');f.reset();$('#dtErr').textContent='';tEdit=id;const t=TEACHERS.find(x=>x.id===id);
 if(t)for(const k of['name','email','department','subject'])f.elements[k].value=t[k]||'';$('#dtTitle').textContent=t?'Edit Teacher':'Add Teacher';$('#dTeacher').showModal()}
$('#addTeacher').onclick=()=>editTeacher(null);
$('#fTeacher').onsubmit=async e=>{if(e.submitter?.value!=='save')return;e.preventDefault();
 try{await api('/teachers'+(tEdit?'/'+tEdit:''),{method:tEdit?'PUT':'POST',body:Object.fromEntries(new FormData(e.target))});$('#dTeacher').close();toast('Teacher saved');loadTeachers()}catch(err){$('#dtErr').textContent=err.message}};

// ---------- Registrations ----------
async function loadRegs(){try{REGS=await api('/registrations');renderRegs()}catch(e){toast(e.message)}}
function renderRegs(){const f=$('#rf').value,l=REGS.filter(r=>!f||r.status===f);
 $('#rlist').innerHTML=l.map(r=>`<tr><td><b>${esc(r.first_name+' '+r.last_name)}</b></td><td>${esc(r.role)}</td><td>${esc(r.email)}</td>
  <td>${r.role==='Student'?`${esc(r.gender||'')} · ${ord(r.year||1)} Year · Sec ${esc(r.section||'Auto')}`:esc(r.subject||'—')}</td><td><span class="tag ${r.status}">${r.status}</span></td>
  <td style="white-space:nowrap">${r.status==='Pending'?`<button class="btn sm" data-a="approve" data-id="${r.id}">Approve</button> <button class="btn danger sm" data-a="reject" data-id="${r.id}">Reject</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No registrations</td></tr>';
 $('#rlist').querySelectorAll('[data-a]').forEach(b=>b.onclick=async()=>{try{await api(`/registrations/${b.dataset.id}/${b.dataset.a}`,{method:'POST'});toast(b.dataset.a==='approve'?'Approved and added':'Registration rejected');loadRegs()}catch(e){toast(e.message)}})}
$('#rf').onchange=renderRegs;
$('#regRole').onchange=e=>{const s=e.target.value==='Student';$('#regStu').hidden=!s;$('#regTea').hidden=s};
$('#addReg').onclick=()=>{$('#fReg').reset();$('#regRole').onchange({target:$('#regRole')});$('#drErr').textContent='';$('#dReg').showModal()};
$('#fReg').onsubmit=async e=>{if(e.submitter?.value!=='save')return;e.preventDefault();
 try{await api('/registrations',{method:'POST',body:Object.fromEntries(new FormData(e.target))});$('#dReg').close();toast('Registration submitted');$('#rf').value='Pending';loadRegs()}catch(err){$('#drErr').textContent=err.message}};

function refresh(){const t=location.hash.slice(1);show(TITLES[t]?t:'dashboard')}

// ---------- Login (front-end only, NOT secure: replace with real auth when you add a backend) ----------
function showApp(on){$('#app').hidden=!on;$('#loginView').hidden=on;if(on)refresh()}
$('#loginForm').onsubmit=e=>{e.preventDefault();
 if(DB.login($('#u').value,$('#p').value)){$('#loginErr').textContent='';e.target.reset();showApp(true)}
 else $('#loginErr').textContent='Invalid username or password.'};
$('#logoutBtn').onclick=()=>{DB.logout();history.replaceState(null,'',location.pathname);showApp(false)};
showApp(DB.isLoggedIn());
