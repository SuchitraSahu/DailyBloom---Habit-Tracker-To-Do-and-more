// ---------- util & persistence ----------
function genId(){ return 'id_' + Math.random().toString(36).slice(2,9); }
const LS_KEY = 'meplus_clone_v2';

let state = {
  points: 0,
  streak: 0,               // global = sum of routine streaks
  lastStreakDate: null,
  dailyTarget: 3,
  theme: 'pink',
  pointsLog: [],
  moodLogs: [],
  routines: [
    { id: genId(), name: 'Morning Routine', color: '#FFD54F', icon: '☀️', tasks: [ {id:genId(), title:'Stretch 5 min', doneDates:[]}, {id:genId(), title:'Drink water', doneDates:[] } ], streak:0, lastCompleted:null },
    { id: genId(), name: 'Work Priorities', color: '#80DEEA', icon: '💼', tasks: [ {id:genId(), title:'Top ticket', doneDates:[] } ], streak:0, lastCompleted:null },
  ]
};

// load saved
const raw = localStorage.getItem(LS_KEY);
if(raw){ try{ state = JSON.parse(raw); } catch(e){ console.warn('bad state', e); } }

// DOM refs
const groupsList = document.getElementById('groupsList');
const taskRoutine = document.getElementById('taskRoutine');
const pointsEl = document.getElementById('points');
const streakEl = document.getElementById('streak');
const taskText = document.getElementById('taskText');
const addTaskBtn = document.getElementById('addTask');
const taskListContainer = document.getElementById('taskListContainer');
const dailyTargetInput = document.getElementById('dailyTarget');
const dailyProgress = document.getElementById('dailyProgress');
const pointsLogEl = document.getElementById('pointsLog');
const themeSelect = document.getElementById('themeSelect');

// mood modal
const moodModal = document.getElementById('moodModal');
const openMood = document.getElementById('openMood');
const closeMood = document.getElementById('closeMood');
const saveMood = document.getElementById('saveMood');
const moodNote = document.getElementById('moodNote');

// pomodoro
let timer = null;
let timeLeft = 25 * 60;
const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('startTimer');
const resetBtn = document.getElementById('resetTimer');
const treeStatus = document.getElementById('treeStatus');

// init UI
applyTheme(state.theme);
dailyTargetInput.value = state.dailyTarget;
renderUI();

// ---------- persistence ----------
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

// ---------- UI rendering ----------
function renderUI(){
  // groups in sidebar & taskRoutine select
  groupsList.innerHTML = '';
  taskRoutine.innerHTML = '';
  state.routines.forEach(r=>{
    const g = document.createElement('div'); g.className='group-item';
    g.onclick = ()=> selectRoutine(r.id);
    const b = document.createElement('div'); b.className='group-bullet'; b.style.background = r.color; b.textContent = r.icon;
    const txt = document.createElement('div'); txt.innerHTML = `<div style="font-weight:700">${r.name}</div><div class="small">${r.tasks.length} tasks • Streak: ${r.streak}d</div>`;
    g.appendChild(b); g.appendChild(txt); groupsList.appendChild(g);

    const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; taskRoutine.appendChild(opt);
  });

  // main list: routines & their tasks
  taskListContainer.innerHTML = '';
  state.routines.forEach(r=>{
    const card = document.createElement('div'); card.className='routine';
    const title = document.createElement('h4');
    title.innerHTML = `<span style="display:flex;gap:10px;align-items:center"><span class="group-bullet" style="background:${r.color}">${r.icon}</span><span>${r.name}</span></span><span class="small">Streak: ${r.streak} days</span>`;
    card.appendChild(title);

    r.tasks.forEach(t=>{
      const task = document.createElement('div'); task.className='task';
      const left = document.createElement('div'); left.style.display='flex'; left.style.gap='10px'; left.style.alignItems='center';
      const cb = document.createElement('input'); cb.type='checkbox';
      cb.checked = doneToday(t);
      cb.onchange = ()=> toggleTask(r.id, t.id, cb.checked);
      const meta = document.createElement('div'); meta.className='meta';
      const titleEl = document.createElement('div'); titleEl.className='title'; titleEl.textContent = t.title;
      const sub = document.createElement('div'); sub.className='sub'; sub.textContent = `Completed ${t.doneDates ? t.doneDates.length : 0} times`;
      meta.appendChild(titleEl); meta.appendChild(sub);
      left.appendChild(cb); left.appendChild(meta);

      const actions = document.createElement('div');
      const editBtn = document.createElement('button'); editBtn.textContent='Edit'; editBtn.className='btn alt'; editBtn.style.padding='6px 8px'; editBtn.onclick = ()=> editTask(r.id, t.id);
      actions.appendChild(editBtn);

      task.appendChild(left); task.appendChild(actions);
      card.appendChild(task);
    });

    taskListContainer.appendChild(card);
  });

  // stats
  pointsEl.textContent = state.points;
  // global streak is sum of routine streaks (ensure it's current)
  state.streak = state.routines.reduce((s, rr)=> s + (rr.streak || 0), 0);
  streakEl.textContent = `${state.streak} 🔥`;
  dailyProgress.textContent = computeDailyProgress();
  renderPointsLog();

  save();
}

function renderPointsLog(){
  pointsLogEl.innerHTML = '';
  (state.pointsLog || []).slice().reverse().forEach(entry=>{
    const li = document.createElement('li');
    const time = new Date(entry.ts).toLocaleString();
    li.textContent = `${entry.text} • ${entry.value>0?'+':''}${entry.value} pts (${time})`;
    pointsLogEl.appendChild(li);
  });
}

// ---------- helpers ----------
function computeDailyProgress(){
  const today = new Date().toISOString().slice(0,10);
  let count = 0;
  state.routines.forEach(r=> r.tasks.forEach(t=> { if(t.doneDates && t.doneDates.includes(today)) count++; }));
  return count;
}
function doneToday(task){
  const today = new Date().toISOString().slice(0,10);
  return task.doneDates && task.doneDates.includes(today);
}

function logPoints(text, value){
  state.points = Math.max(0, (state.points || 0) + value);
  state.pointsLog = state.pointsLog || [];
  state.pointsLog.push({ text, value, ts: new Date().toISOString() });
  renderUI();
}

// ---------- task toggle & streak logic ----------
function toggleTask(rid, tid, isDone){
  const today = new Date().toISOString().slice(0,10);
  const r = state.routines.find(x=>x.id===rid);
  if(!r) return;
  const t = r.tasks.find(x=>x.id===tid);
  if(!t) return;

  // was routine completed before this toggle? (before adding/removing this task for today)
  const routineCompletedBefore = r.tasks.some(tt => tt.doneDates && tt.doneDates.includes(today));

  if(isDone){
    t.doneDates = t.doneDates || [];
    if(!t.doneDates.includes(today)) t.doneDates.push(today);

    logPoints(`Completed: ${t.title}`, +10);

    if(!routineCompletedBefore){
      updateRoutineStreak(r);
    }

    // daily target notification hook
    if(computeDailyProgress() >= (Number(dailyTargetInput.value) || state.dailyTarget)){
      notify('Daily target reached 🎉', 'You hit your daily target — nice!');
    }

  } else {
    // uncheck: remove today's mark and subtract points
    t.doneDates = (t.doneDates || []).filter(d=>d!==today);
    logPoints(`Unchecked: ${t.title}`, -10);
    // NOTE: unchecking does not retroactively change routine.lastCompleted or streak (keeps historical record).
  }

  renderUI();
}

function updateRoutineStreak(r){
  const todayISO = new Date().toISOString().slice(0,10);
  if(!r.lastCompleted){
    r.streak = 1;
    r.lastCompleted = todayISO;
  } else {
    const prevISO = r.lastCompleted;
    // compute integer day diff
    const diffDays = Math.round((new Date(todayISO) - new Date(prevISO)) / (1000*60*60*24));
    if(diffDays === 1){
      r.streak = (r.streak || 0) + 1;
    } else if(diffDays === 0){
      // same day, no change
    } else {
      // missed at least one day -> streak breaks
      r.streak = 1;
    }
    r.lastCompleted = todayISO;
  }

  // after updating routine streak, recompute global streak sum
  state.streak = state.routines.reduce((s, rr)=> s + (rr.streak || 0), 0);
}

// ---------- add task / group / edit ----------
addTaskBtn.onclick = ()=>{
  const text = (taskText.value || '').trim();
  const rid = taskRoutine.value;
  if(!text || !rid) return;
  const r = state.routines.find(x=>x.id===rid);
  if(!r) return;
  r.tasks.push({ id: genId(), title: text, doneDates: []});
  taskText.value = '';
  renderUI();
};

document.getElementById('addGroupBtn').onclick = ()=>{
  const name = prompt('Routine name? (e.g. Evening Routine)');
  if(!name) return;
  const color = prompt('Color hex? (e.g. #ffd54f)') || '#ffd54f';
  const icon = prompt('One emoji icon? (e.g. 🌙)') || '🔆';
  state.routines.push({ id: genId(), name, color, icon, tasks:[], streak:0, lastCompleted:null });
  renderUI();
};

function selectRoutine(id){
  const cards = [...taskListContainer.children];
  const idx = state.routines.findIndex(r=>r.id===id);
  if(idx>=0 && cards[idx]) cards[idx].scrollIntoView({behavior:'smooth', block:'center'});
}

function editTask(rid, tid){
  const r = state.routines.find(x=>x.id===rid);
  const t = r.tasks.find(x=>x.id===tid);
  const newTitle = prompt('Edit task title', t.title);
  if(newTitle !== null) t.title = newTitle.trim();
  renderUI();
}

// ---------- mood modal ----------
openMood.onclick = ()=>{ moodModal.classList.remove('hidden'); }
closeMood.onclick = ()=>{ moodModal.classList.add('hidden'); }
saveMood.onclick = ()=>{
  const note = moodNote.value.trim();
  const sel = [...document.querySelectorAll('.moodBtn')].find(b=>b.dataset.val && b.classList.contains('selected'));
  const rating = sel ? Number(sel.dataset.val) : null;
  if(!rating && !note){ alert('Please select a mood or write a note'); return; }
  state.moodLogs = state.moodLogs || [];
  state.moodLogs.push({ date: new Date().toISOString(), rating, note });
  moodNote.value = '';
  document.querySelectorAll('.moodBtn').forEach(b=>b.classList.remove('selected'));
  moodModal.classList.add('hidden'); alert('Saved mood ❤️');
};

document.querySelectorAll('.moodBtn').forEach(b=>{
  b.onclick = ()=>{ document.querySelectorAll('.moodBtn').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); };
});

// ---------- theme handling ----------
themeSelect.value = state.theme || 'pink';
themeSelect.onchange = (e)=> {
  const t = e.target.value;
  state.theme = t;
  applyTheme(t);
  save();
};
function applyTheme(theme){
  document.body.setAttribute('data-theme', theme || 'pink');
}

// ---------- daily target handling ----------
dailyTargetInput.onchange = (e) => {
  const v = Number(e.target.value) || 1;
  state.dailyTarget = v;
  save();
  renderUI();
};

// ---------- notifications ----------
function requestNotificationPermission(){ if('Notification' in window && Notification.permission === 'default'){ Notification.requestPermission(); } }
function notify(title, body){ if('Notification' in window && Notification.permission === 'granted'){ new Notification(title, { body }); } }
requestNotificationPermission();

// ---------- points log rendering handled in renderPointsLog ----------

// ---------- Pomodoro (Forest) ----------
function updateTimerDisplay(){
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
}

startBtn.onclick = ()=>{
  if(timer) return;
  treeStatus.textContent = 'Tree is growing... 🌱';
  timer = setInterval(()=>{
    timeLeft--;
    updateTimerDisplay();
    if(timeLeft <= 0){
      clearInterval(timer);
      timer = null;
      treeStatus.textContent = 'Congrats! Your tree grew 🌳';
      logPoints('Pomodoro complete', +20);
      timeLeft = 25*60;
      updateTimerDisplay();
    }
  }, 1000);
};

resetBtn.onclick = ()=>{
  if(timer) clearInterval(timer);
  timer = null;
  timeLeft = 25*60;
  updateTimerDisplay();
  treeStatus.textContent = 'Oh no! Your tree died 💀';
  logPoints('Pomodoro failed', -10);
};

updateTimerDisplay();

// expose for debugging
window._meplus_state = state;
