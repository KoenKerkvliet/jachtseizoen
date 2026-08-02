const app = document.querySelector('#app');
let selectedRole = 'boef';
let game = null;

const roles = {
  boef: ['🕶️', 'Boef'],
  vanger: ['🧭', 'Vanger'],
  leider: ['🎯', 'Leider']
};

async function ensureAnonymousSession() {
  const current = await window.supabaseClient.auth.getSession();
  if (current.data.session) return;

  const result = await window.supabaseClient.auth.signInAnonymously();
  if (result.error) throw result.error;
}

function home() {
  app.innerHTML = '<div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div>'
    + '<section class="hero"><h1>Ga op <em>jacht.</em></h1><p class="lead">Een spannend spel voor buiten. Maak een besloten sessie, verdeel de rollen en vind de boeven voordat de tijd op is.</p></section>'
    + '<section class="card"><h2>Nieuw spel</h2><p>Jij bepaalt het speelgebied, de duur en wie welke rol krijgt.</p><button class="primary" onclick="createScreen()">Start een sessie <span>→</span></button></section>'
    + '<section class="card"><h2>Heb je een code?</h2><p>Vul hem in en sluit je aan bij de rest van je team.</p><button class="secondary" onclick="joinScreen()">Meedoen met code <span>→</span></button></section>'
    + '<p class="tiny">Alleen delen met mensen die je kent · Locatie is altijd optioneel</p>';
}

function back() {
  home();
}

function createScreen() {
  const roleButtons = Object.keys(roles).map(function (id) {
    const role = roles[id];
    const active = id === selectedRole ? ' selected' : '';
    return '<button class="role' + active + '" onclick="chooseRole(\'' + id + '\')">' + role[0] + '<br>' + role[1] + '</button>';
  }).join('');

  app.innerHTML = '<button class="back" onclick="back()">← Terug</button>'
    + '<h1 class="form-title">Maak het spel<br>jullie eigen.</h1>'
    + '<p class="form-copy">Begin klein: we kunnen het speelgebied en de spelregels later verfijnen.</p>'
    + '<label>Jouw naam</label><input id="hostName" placeholder="Bijvoorbeeld: Koen" maxlength="20">'
    + '<label>Naam van het spel</label><input id="gameName" value="Jachtseizoen in de buurt" maxlength="40">'
    + '<label>Speelduur</label><select id="duration"><option value="45">45 minuten</option><option value="60" selected>1 uur</option><option value="90">1 uur en 30 minuten</option></select>'
    + '<label>Jouw rol</label><div class="choice-grid">' + roleButtons + '</div>'
    + '<button class="primary" style="margin-top:26px" onclick="startGame()">Maak sessie <span>→</span></button>';
}

function chooseRole(role) {
  selectedRole = role;
  createScreen();
}

async function startGame() {
  const name = document.querySelector('#gameName').value.trim() || 'Jachtseizoen';
  const playerName = document.querySelector('#hostName').value.trim();
  const duration = Number(document.querySelector('#duration').value);
  const button = document.querySelector('.primary');

  if (playerName.length < 2) {
    alert('Vul je naam in.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Sessie maken…';

  try {
    await ensureAnonymousSession();

    const result = await window.supabaseClient.rpc('create_game', {
      p_title: name,
      p_duration_minutes: duration,
      p_display_name: playerName,
      p_role: selectedRole
    });

    if (result.error) throw result.error;

    const savedGame = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!savedGame || !savedGame.join_code) {
      throw new Error('De sessie is niet opgeslagen. Probeer het opnieuw.');
    }

    game = {
      name: savedGame.title,
      role: selectedRole,
      code: savedGame.join_code,
      minutes: savedGame.duration_minutes
    };
    gameScreen();
  } catch (error) {
    alert('Sessie maken lukt nog niet: ' + (error.message || 'onbekende fout'));
    button.disabled = false;
    button.innerHTML = 'Maak sessie <span>→</span>';
  }
}

function joinScreen() {
  app.innerHTML = '<button class="back" onclick="back()">← Terug</button>'
    + '<h1 class="form-title">Sluit je aan.</h1><p class="form-copy">Vraag de vierlettercode aan de spelleider.</p>'
    + '<label>Jouw naam</label><input id="playerName" placeholder="Bijvoorbeeld: Koen" maxlength="20">'
    + '<label>Jouw rol</label><select id="joinRole"><option value="vanger">🧭 Vanger</option><option value="boef">🕶️ Boef</option><option value="leider">🎯 Spelleider</option></select>'
    + '<label>Sessiecode</label><input id="joinCode" placeholder="ABCD" maxlength="4" style="text-transform:uppercase;letter-spacing:.15em">'
    + '<button class="primary" style="margin-top:26px" onclick="joinGame()">Ga naar het spel <span>→</span></button>';
}

async function joinGame() {
  const gameCode = document.querySelector('#joinCode').value.trim().toUpperCase();
  const playerName = document.querySelector('#playerName').value.trim();
  const role = document.querySelector('#joinRole').value;
  const button = document.querySelector('.primary');

  if (gameCode.length !== 4 || playerName.length < 2) {
    alert('Vul je naam en een code van vier tekens in.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Verbinden…';

  try {
    await ensureAnonymousSession();

    const result = await window.supabaseClient.rpc('join_game', {
      p_join_code: gameCode,
      p_display_name: playerName,
      p_role: role
    });

    if (result.error) throw result.error;

    const savedGame = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!savedGame || !savedGame.join_code) {
      throw new Error('Deze sessie kon niet worden gevonden.');
    }

    game = {
      name: savedGame.title,
      code: savedGame.join_code,
      role: role,
      minutes: savedGame.duration_minutes
    };
    gameScreen();
  } catch (error) {
    alert('Deelnemen lukt nog niet: ' + (error.message || 'onbekende fout'));
    button.disabled = false;
    button.innerHTML = 'Ga naar het spel <span>→</span>';
  }
}

function gameScreen() {
  const role = roles[game.role];
  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.code + '</span></header>'
    + '<div class="status"><span class="dot"></span> Spel is klaar om te starten</div>'
    + '<section class="timer"><small>Jouw rol: ' + role[0] + ' ' + role[1] + '</small><div class="clock" id="clock">' + String(game.minutes).padStart(2, '0') + ':00</div></section>'
    + '<div class="map"><span class="pin"></span><span class="map-label">Speelgebied volgt hier</span></div>'
    + '<section class="card mission"><span class="mission-icon">📸</span><div><h2>Eerste opdracht</h2><p>Maak een foto-hint zodra het spel begint. Nu de verbinding klaarstaat, voegen we dit na de databaseopzet toe.</p></div></section>'
    + '<button class="primary" onclick="beginCountdown()">Start het spel <span>▶</span></button>'
    + '<p class="tiny">Sessiecode: ' + game.code + ' · Deel deze alleen met je groep.</p>';
}

function beginCountdown() {
  let seconds = game.minutes * 60;
  const clock = document.querySelector('#clock');
  const update = function () {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    clock.textContent = String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
  };
  update();
  const timer = setInterval(function () {
    seconds -= 1;
    update();
    if (seconds <= 0) {
      clearInterval(timer);
      alert('De tijd is om!');
    }
  }, 1000);
  document.querySelector('.status').innerHTML = '<span class="dot"></span> Spel is bezig';
}

async function initialize() {
  app.innerHTML = '<p class="tiny">Veilige spelverbinding wordt gemaakt…</p>';
  try {
    await ensureAnonymousSession();
    home();
  } catch (error) {
    app.innerHTML = '<section class="card"><h2>Verbinding mislukt</h2><p>Controleer of tijdelijk anoniem deelnemen in Supabase aanstaat en vernieuw daarna de pagina.</p></section>';
  }
}

initialize();
