const app = document.querySelector('#app');
let selectedRole = 'boef';
let game = null;
let isLeader = false;
let clockTimer = null;
let stateTimer = null;
let currentUserId = null;
let hints = [];
let ownPlayerId = null;
let hintTimer = null;
let knownHintIds = new Set();
const ACTIVE_SESSION_KEY = 'jachtseizoen-active-session';

function rememberSession() {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
    gameId: game.id,
    role: selectedRole
  }));
}

function forgetSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function savedSession() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY));
  } catch (error) {
    forgetSession();
    return null;
  }
}

const roles = {
  boef: ['🕶️', 'Boef'],
  vanger: ['🧭', 'Vanger']
};

function one(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function ensureAnonymousSession() {
  const current = await window.supabaseClient.auth.getSession();
  if (current.data.session) {
    currentUserId = current.data.session.user.id;
    return;
  }

  const result = await window.supabaseClient.auth.signInAnonymously();
  if (result.error) throw result.error;
  currentUserId = result.data.session.user.id;
}

function stopTimers() {
  clearInterval(clockTimer);
  clearInterval(stateTimer);
  clearInterval(hintTimer);
  clockTimer = null;
  stateTimer = null;
  hintTimer = null;
}

function home() {
  stopTimers();
  app.innerHTML = '<div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div>'
    + '<section class="hero"><h1>Ga op <em>jacht.</em></h1><p class="lead">Een spannend spel voor buiten. Maak een besloten sessie, verdeel de rollen en vind de boeven voordat de tijd op is.</p></section>'
    + '<section class="card"><h2>Nieuw spel</h2><p>Als spelleider maak jij de sessie. Je kunt zelf gewoon als boef of vanger meespelen.</p><button class="primary" onclick="createScreen()">Maak een sessie <span>→</span></button></section>'
    + '<section class="card"><h2>Heb je een code?</h2><p>Vul hem in en sluit je aan bij de rest van je team.</p><button class="secondary" onclick="joinScreen()">Meedoen met code <span>→</span></button></section>'
    + '<p class="tiny">Alleen delen met mensen die je kent · Locatie is altijd optioneel</p>';
}

function back() {
  home();
}

function roleButtons() {
  return Object.keys(roles).map(function (id) {
    const role = roles[id];
    const active = id === selectedRole ? ' selected' : '';
    return '<button class="role' + active + '" onclick="chooseRole(\'' + id + '\')">' + role[0] + '<br>' + role[1] + '</button>';
  }).join('');
}

function createScreen() {
  app.innerHTML = '<button class="back" onclick="back()">← Terug</button>'
    + '<h1 class="form-title">Maak het spel<br>jullie eigen.</h1>'
    + '<p class="form-copy">Jij bent de spelleider en kunt zelf gewoon meespelen.</p>'
    + '<label>Jouw naam</label><input id="hostName" placeholder="Bijvoorbeeld: Koen" maxlength="20">'
    + '<label>Naam van het spel</label><input id="gameName" value="Jachtseizoen in de buurt" maxlength="40">'
    + '<label>Speelduur</label><select id="duration"><option value="45">45 minuten</option><option value="60" selected>1 uur</option><option value="90">1 uur en 30 minuten</option></select>'
    + '<label>Jouw speelrol</label><div class="choice-grid">' + roleButtons() + '</div>'
    + '<button class="primary" style="margin-top:26px" onclick="createGame()">Maak sessie <span>→</span></button>';
}

function chooseRole(role) {
  selectedRole = role;
  createScreen();
}

async function createGame() {
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

    const savedGame = one(result.data);
    if (!savedGame || !savedGame.id) throw new Error('De sessie is niet opgeslagen.');

    game = savedGame;
    isLeader = true;
    rememberSession();
    sessionScreen();
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
    + '<label>Jouw speelrol</label><select id="joinRole"><option value="vanger">🧭 Vanger</option><option value="boef">🕶️ Boef</option></select>'
    + '<label>Sessiecode</label><input id="joinCode" placeholder="ABCD" maxlength="4" style="text-transform:uppercase;letter-spacing:.15em">'
    + '<button class="primary" style="margin-top:26px" onclick="joinGame()">Ga naar de lobby <span>→</span></button>';
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

    const savedGame = one(result.data);
    if (!savedGame || !savedGame.id) throw new Error('Deze sessie kon niet worden gevonden.');

    game = savedGame;
    selectedRole = role;
    isLeader = savedGame.created_by === currentUserId;
    rememberSession();
    sessionScreen();
  } catch (error) {
    alert('Deelnemen lukt nog niet: ' + (error.message || 'onbekende fout'));
    button.disabled = false;
    button.innerHTML = 'Ga naar de lobby <span>→</span>';
  }
}

function sessionScreen() {
  stopTimers();

  if (game.status === 'playing' && game.ends_at) {
    gameScreen();
    return;
  }

  const leaderAction = isLeader
    ? '<button class="primary" style="margin-top:20px" onclick="startSharedGame()">Start het spel <span>▶</span></button><button class="secondary" onclick="stopGame()">Stop sessie <span>■</span></button>'
    : '<p class="tiny">Wachten tot de spelleider het spel start…</p>';

  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<section class="timer"><small>Spel wordt voorbereid</small><div class="clock">KLAAR?</div></section>'
    + '<section class="card mission"><span class="mission-icon">👥</span><div><h2>De lobby is open</h2><p>Deel code <strong>' + game.join_code + '</strong> met je groep. Iedereen ziet de gedeelde start zodra de spelleider begint.</p></div></section>'
    + leaderAction
    + '<p class="tiny">Jouw speelrol: ' + roles[selectedRole][0] + ' ' + roles[selectedRole][1] + '</p>';

  watchGame();
}

async function startSharedGame() {
  const button = document.querySelector('.primary');
  button.disabled = true;
  button.textContent = 'Spel starten…';

  try {
    const result = await window.supabaseClient.rpc('start_game', { p_game_id: game.id });
    if (result.error) throw result.error;
    game = one(result.data);
    sessionScreen();
  } catch (error) {
    alert('Het spel starten lukt niet: ' + (error.message || 'onbekende fout'));
    button.disabled = false;
    button.innerHTML = 'Start het spel <span>▶</span>';
  }
}

async function refreshGameState() {
  const result = await window.supabaseClient.rpc('get_game_state', { p_game_id: game.id });
  if (!result.error) {
    const nextGame = one(result.data);
    if (nextGame && nextGame.status !== game.status) {
      game = nextGame;
      sessionScreen();
    }
  }
}

function watchGame() {
  clearInterval(stateTimer);
  stateTimer = setInterval(refreshGameState, 2000);
}

function gameScreen() {
  stopTimers();
  const role = roles[selectedRole];
  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<div class="status"><span class="dot"></span> Spel is bezig</div>'
    + '<section class="timer"><small>Jouw rol: ' + role[0] + ' ' + role[1] + '</small><div class="clock" id="clock">--:--</div></section>'
    + '<div class="map"><span class="pin"></span><span class="map-label">Speelgebied volgt hier</span></div>'
    + '<section id="hint-panel" class="card mission"><span class="mission-icon">📸</span><div><h2>Foto-hints</h2><p>Hints worden geladen…</p></div></section>'
    + (isLeader ? '<button class="secondary" onclick="stopGame()">Stop spel en verwijder foto-hints <span>■</span></button>' : '')
    + '<p class="tiny">Deze klok komt uit de gedeelde eindtijd van de sessie.</p>';

  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  loadHints(false);
  hintTimer = setInterval(function () { loadHints(true); }, 4000);
}

function currentHintRound() {
  return Math.floor((Date.now() - new Date(game.start_at).getTime()) / 300000);
}

function secondsUntilNextHint() {
  const start = new Date(game.start_at).getTime();
  const elapsed = Date.now() - start;
  return Math.max(0, Math.ceil((300000 - (elapsed % 300000)) / 1000));
}

function hintTime(seconds) {
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

async function loadHints(announce) {
  const own = await window.supabaseClient
    .from('players')
    .select('id')
    .eq('game_id', game.id)
    .eq('user_id', currentUserId)
    .maybeSingle();

  if (!own.error && own.data) ownPlayerId = own.data.id;

  const result = await window.supabaseClient
    .from('game_hints')
    .select('id, player_id, round_number, image_path, created_at')
    .eq('game_id', game.id)
    .order('created_at', { ascending: false });

  if (result.error) return;

  const nextHints = result.data || [];
  if (announce && selectedRole === 'vanger') {
    const newHint = nextHints.find(function (hint) { return !knownHintIds.has(hint.id); });
    if (newHint) alert('Nieuwe foto-hint van een boef!');
  }

  hints = nextHints;
  knownHintIds = new Set(nextHints.map(function (hint) { return hint.id; }));
  renderHintPanel();
}

function renderHintPanel() {
  const panel = document.querySelector('#hint-panel');
  if (!panel) return;

  const round = currentHintRound();
  const ownHint = hints.find(function (hint) {
    return hint.player_id === ownPlayerId && hint.round_number === round;
  });

  if (selectedRole === 'boef') {
    if (round < 1) {
      panel.innerHTML = '<span class="mission-icon">📸</span><div><h2>Volgende foto-hint over ' + hintTime(secondsUntilNextHint()) + '</h2><p>Na vijf minuten moet iedere boef een foto-hint delen.</p></div>';
    } else if (ownHint) {
      panel.innerHTML = '<span class="mission-icon">✅</span><div><h2>Foto-hint gedeeld</h2><p>Goed gedaan. De volgende hint is over ' + hintTime(secondsUntilNextHint()) + ' nodig.</p></div>';
    } else {
      panel.innerHTML = '<span class="mission-icon">📸</span><div><h2>Foto-hint vereist</h2><p>Maak nu een foto. De vangers krijgen meteen een melding.</p><input id="hint-file" type="file" accept="image/*" capture="environment" style="display:none" onchange="uploadHint(this.files[0])"><button class="secondary" onclick="document.querySelector(\'#hint-file\').click()">Maak foto-hint <span>📷</span></button></div>';
    }
    return;
  }

  const latest = hints[0];
  if (!latest) {
    panel.innerHTML = '<span class="mission-icon">📸</span><div><h2>Foto-hints</h2><p>Er zijn nog geen hints. Zodra een boef een foto deelt, krijg jij een melding.</p></div>';
    return;
  }

  panel.innerHTML = '<span class="mission-icon">🔔</span><div><h2>Laatste foto-hint</h2><p>Een boef deelde een hint. Tik op bekijken om de foto te openen.</p><button class="secondary" onclick="showLatestHint()">Bekijk foto-hint <span>→</span></button></div>';
}

async function uploadHint(file) {
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 6000000) {
    alert('Kies een foto van maximaal 6 MB.');
    return;
  }

  const path = game.id + '/' + currentUserId + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const upload = await window.supabaseClient.storage.from('game-hints').upload(path, file, {
    contentType: file.type,
    upsert: false
  });

  if (upload.error) {
    alert('Foto uploaden lukt niet: ' + upload.error.message);
    return;
  }

  const saved = await window.supabaseClient.rpc('submit_hint', {
    p_game_id: game.id,
    p_image_path: path
  });

  if (saved.error) {
    alert('Foto-hint plaatsen lukt niet: ' + saved.error.message);
    return;
  }

  await loadHints(false);
}

async function showLatestHint() {
  if (!hints[0]) return;
  const signed = await window.supabaseClient.storage.from('game-hints').createSignedUrl(hints[0].image_path, 60);
  if (signed.error) {
    alert('De foto kon niet worden geopend.');
    return;
  }
  window.open(signed.data.signedUrl, '_blank', 'noopener');
}

async function stopGame(autoStop) {
  if (!autoStop && !confirm('Weet je zeker dat je het spel wilt stoppen? Foto-hints worden verwijderd.')) return;

  const paths = hints.map(function (hint) { return hint.image_path; });
  const result = await window.supabaseClient.rpc('end_game', { p_game_id: game.id });

  if (result.error) {
    if (!autoStop) alert('Stoppen lukt niet: ' + result.error.message);
    return;
  }

  if (paths.length) {
    await window.supabaseClient.storage.from('game-hints').remove(paths);
  }

  forgetSession();
  game = null;
  home();
}

function updateClock() {
  const clock = document.querySelector('#clock');
  if (!clock || !game.ends_at) return;

  const seconds = Math.max(0, Math.ceil((new Date(game.ends_at).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  clock.textContent = String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
  renderHintPanel();

  if (seconds === 0) {
    clearInterval(clockTimer);
    clock.textContent = 'TIJD OM';
    stopGame(true);
  }
}

async function initialize() {
  app.innerHTML = '<p class="tiny">Veilige spelverbinding wordt gemaakt…</p>';
  try {
    await ensureAnonymousSession();
    const stored = savedSession();
    if (!stored) {
      home();
      return;
    }

    selectedRole = stored.role;
    const result = await window.supabaseClient.rpc('get_game_state', { p_game_id: stored.gameId });
    if (result.error || !result.data || one(result.data).status === 'ended') {
      forgetSession();
      home();
      return;
    }

    game = one(result.data);
    isLeader = game.created_by === currentUserId;
    sessionScreen();
  } catch (error) {
    app.innerHTML = '<section class="card"><h2>Verbinding mislukt</h2><p>Controleer of tijdelijk anoniem deelnemen in Supabase aanstaat en vernieuw daarna de pagina.</p></section>';
  }
}

initialize();
