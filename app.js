const app = document.querySelector('#app');
let selectedRole = 'boef';
let game = null;

const roles = { boef: ['🕶️', 'Boef'], vanger: ['🧭', 'Vanger'], leider: ['🎯', 'Leider'] };
const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function home() {
  app.innerHTML = \`<div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div>
    <section class="hero"><h1>Ga op <em>jacht.</em></h1><p class="lead">Een spannend spel voor buiten. Maak een besloten sessie, verdeel de rollen en vind de boeven voordat de tijd op is.</p></section>
    <section class="card"><h2>Nieuw spel</h2><p>Jij bepaalt het speelgebied, de duur en wie welke rol krijgt.</p><button class="primary" onclick="createScreen()">Start een sessie <span>→</span></button></section>
    <section class="card"><h2>Heb je een code?</h2><p>Vul hem in en sluit je aan bij de rest van je team.</p><button class="secondary" onclick="joinScreen()">Meedoen met code <span>→</span></button></section>
    <p class="tiny">Alleen delen met mensen die je kent · Locatie is altijd optioneel</p>\`;
}
function back(){ home(); }
function createScreen() {
  app.innerHTML = \`<button class="back" onclick="back()">← Terug</button><h1 class="form-title">Maak het spel<br>jullie eigen.</h1><p class="form-copy">Begin klein: we kunnen het speelgebied en de spelregels later verfijnen.</p>
  <label>Naam van het spel</label><input id="gameName" value="Jachtseizoen in de buurt" maxlength="40">
  <label>Speelduur</label><select id="duration"><option value="45">45 minuten</option><option value="60" selected>1 uur</option><option value="90">1 uur en 30 minuten</option></select>
  <label>Jouw rol</label><div class="choice-grid">\${Object.entries(roles).map(([id,[emoji,name]])=>\`<button class="role \${id===selectedRole?'selected':''}" onclick="chooseRole('\\${id}')">\${emoji}<br>\${name}</button>\`).join('')}</div>
  <button class="primary" style="margin-top:26px" onclick="startGame()">Maak sessie <span>→</span></button>\`;
}
function chooseRole(role){ selectedRole = role; createScreen(); }
function startGame(){ const name = document.querySelector('#gameName').value.trim() || 'Jachtseizoen'; game = { name, role:selectedRole, code:code(), minutes:Number(document.querySelector('#duration').value) }; gameScreen(); }
function joinScreen(){ app.innerHTML = \`<button class="back" onclick="back()">← Terug</button><h1 class="form-title">Sluit je aan.</h1><p class="form-copy">Vraag de vierlettercode aan de spelleider.</p><label>Jouw naam</label><input id="playerName" placeholder="Bijvoorbeeld: Koen"><label>Sessiecode</label><input id="joinCode" placeholder="ABCD" maxlength="4" style="text-transform:uppercase;letter-spacing:.15em"><button class="primary" style="margin-top:26px" onclick="joinGame()">Ga naar het spel <span>→</span></button>\`; }
function joinGame(){ const c = document.querySelector('#joinCode').value.trim().toUpperCase(); if(c.length !== 4){ alert('Vul een code van vier letters in.'); return; } game = {name:'Jachtseizoen', code:c, role:'vanger', minutes:60}; gameScreen(); }
function gameScreen(){ const [emoji,role] = roles[game.role]; app.innerHTML = \`<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">\${game.code}</span></header><div class="status"><span class="dot"></span> Spel is klaar om te starten</div><section class="timer"><small>Jouw rol: \${emoji} \${role}</small><div class="clock" id="clock">\${String(game.minutes).padStart(2,'0')}:00</div></section><div class="map"><span class="pin"></span><span class="map-label">Speelgebied volgt hier</span></div><section class="card mission"><span class="mission-icon">📸</span><div><h2>Eerste opdracht</h2><p>Maak een foto-hint zodra het spel begint. In de volgende stap koppelen we dit aan Supabase.</p></div></section><button class="primary" onclick="beginCountdown()">Start het spel <span>▶</span></button><p class="tiny">Sessiecode: \${game.code} · Deel deze alleen met je groep.</p>\`; }
function beginCountdown(){ let seconds = game.minutes * 60; const clock = document.querySelector('#clock'); const update = () => { const m=Math.floor(seconds/60); const s=seconds%60; clock.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }; update(); const timer=setInterval(()=>{seconds--;update();if(seconds<=0){clearInterval(timer);alert('De tijd is om!');}},1000); document.querySelector('.status').innerHTML='<span class="dot"></span> Spel is bezig'; }
home();
