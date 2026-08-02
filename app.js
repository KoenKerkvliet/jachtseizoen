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
let lobbyPlayers = [];
let areaMap = null;
let areaLayer = null;
let areaPointLayer = null;
let areaPoints = [];
let isDrawingArea = false;
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
  if (areaMap) { areaMap.remove(); areaMap = null; areaLayer = null; areaPointLayer = null; }
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
    + '<label>Speelduur</label><select id="duration"><option value="30">30 minuten</option><option value="45">45 minuten</option><option value="60" selected>1 uur</option><option value="90">1 uur en 30 minuten</option><option value="120">2 uur</option></select>'
    + '<label>Foto-opdracht</label><select id="hintInterval"><option value="3">Elke 3 minuten</option><option value="5">Elke 5 minuten</option><option value="7" selected>Elke 7 minuten</option><option value="10">Elke 10 minuten</option></select>'
    + '<label>Startadres</label><input id="startAddress" placeholder="Bijvoorbeeld: Dorpsstraat 12" maxlength="80">'
    + '<label>Plaats</label><input id="startCity" placeholder="Bijvoorbeeld: Utrecht" maxlength="60">'
    + '<p class="map-note">De kaart focust op dit adres. Het adres wordt alleen binnen de sessie gedeeld.</p>'
    + '<label>Jouw speelrol</label><div class="choice-grid">' + roleButtons() + '</div>'
    + '<button class="primary" style="margin-top:26px" onclick="createGame()">Maak sessie <span>→</span></button>';
}

function chooseRole(role) {
  const playerName = document.querySelector('#hostName').value;
  const gameName = document.querySelector('#gameName').value;
  const duration = document.querySelector('#duration').value;
  const hintInterval = document.querySelector('#hintInterval').value;
  const startAddress = document.querySelector('#startAddress').value;
  const startCity = document.querySelector('#startCity').value;

  selectedRole = role;
  createScreen();

  document.querySelector('#hostName').value = playerName;
  document.querySelector('#gameName').value = gameName;
  document.querySelector('#duration').value = duration;
  document.querySelector('#hintInterval').value = hintInterval;
  document.querySelector('#startAddress').value = startAddress;
  document.querySelector('#startCity').value = startCity;
}

async function createGame() {
  const name = document.querySelector('#gameName').value.trim() || 'Jachtseizoen';
  const playerName = document.querySelector('#hostName').value.trim();
  const duration = Number(document.querySelector('#duration').value);
  const hintInterval = Number(document.querySelector('#hintInterval').value);
  const startAddress = document.querySelector('#startAddress').value.trim();
  const startCity = document.querySelector('#startCity').value.trim();
  const button = document.querySelector('.primary');

  if (playerName.length < 2) {
    alert('Vul je naam in.');
    return;
  }

  if (startAddress.length < 4 || startCity.length < 2) {
    alert('Vul een straat met huisnummer en plaats in.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Adres zoeken…';

  try {
    await ensureAnonymousSession();
    const location = await geocodeStartAddress(startAddress, startCity);
    button.textContent = 'Sessie maken…';
    const result = await window.supabaseClient.rpc('create_game', {
      p_title: name,
      p_duration_minutes: duration,
      p_display_name: playerName,
      p_role: selectedRole,
      p_hint_interval_minutes: hintInterval
    });
    if (result.error) throw result.error;

    const savedGame = one(result.data);
    if (!savedGame || !savedGame.id) throw new Error('De sessie is niet opgeslagen.');

    const locationResult = await window.supabaseClient.rpc('set_start_location', {
      p_game_id: savedGame.id,
      p_address: startAddress + ', ' + startCity,
      p_lat: location.lat,
      p_lng: location.lng
    });
    if (locationResult.error) throw locationResult.error;

    game = one(locationResult.data);
    isLeader = true;
    rememberSession();
    sessionScreen();
  } catch (error) {
    alert('Sessie maken lukt nog niet: ' + (error.message || 'onbekende fout'));
    button.disabled = false;
    button.innerHTML = 'Maak sessie <span>→</span>';
  }
}

async function geocodeStartAddress(address, city) {
  const query = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'nl',
    q: address + ', ' + city
  });

  const response = await fetch('https://nominatim.openstreetmap.org/search?' + query.toString(), {
    headers: { 'Accept': 'application/json' }
  });
  if (!response.ok) throw new Error('Adres zoeken lukt tijdelijk niet.');
  const results = await response.json();
  if (!results.length) throw new Error('Adres niet gevonden. Controleer straat, huisnummer en plaats.');
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
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

  if (game.status === 'ended') {
    gameOverScreen();
    return;
  }

  if (game.status === 'playing' && game.ends_at) {
    gameScreen();
    return;
  }

  const hasArea = Array.isArray(game.play_area) && game.play_area.length >= 3;
  const leaderAction = isLeader
    ? (hasArea
      ? '<button class="primary" style="margin-top:20px" onclick="startSharedGame()">Start het spel <span>▶</span></button>'
      : '<button class="primary" style="margin-top:20px" disabled>Maak eerst een speelgebied</button>')
      + '<button class="secondary" onclick="stopGame()">Stop sessie <span>■</span></button>'
    : '<section class="card mission" style="margin-top:20px"><span class="mission-icon">⏳</span><div><h2>Bijna zover</h2><p>De spelleider start het spel zodra iedereen klaar is.</p></div></section>';

  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<section class="timer"><small>Spel wordt voorbereid</small><div class="clock">KLAAR?</div></section>'
    + '<section class="card mission"><span class="mission-icon">👥</span><div><h2>De lobby is open</h2><p>Deel code <strong>' + game.join_code + '</strong> met je groep. Iedereen ziet de gedeelde start zodra de spelleider begint.</p></div></section>'
    + '<section class="card"><h2>Speelgebied</h2><p class="map-note">' + (hasArea ? 'Dit gebied is opgeslagen voor alle spelers.' : (isLeader ? 'Tik op de kaart om een organische grens te tekenen.' : 'De spelleider tekent het speelgebied.')) + '</p><div id="area-map" class="area-map"></div>' + (isLeader ? '<div class="map-tools"><button class="secondary" onclick="toggleAreaDrawing()">Teken / wijzig</button><button class="secondary" onclick="undoAreaPoint()">Punt terug</button></div><button class="primary" style="margin-top:10px" onclick="savePlayArea()">Gebied opslaan <span>✓</span></button>' : '') + '</section>'
    + '<section id="lobby-players" class="card"><h2>Deelnemers</h2><p>Deelnemers laden…</p></section>'
    + leaderAction
    + '<button class="back" style="margin-top:22px" onclick="leaveLobby()">← Lobby verlaten</button>'
    + '<p class="tiny">Jouw speelrol: ' + roles[selectedRole][0] + ' ' + roles[selectedRole][1] + '</p>';

  initPlayAreaMap('area-map', isLeader);
  loadLobbyPlayers();
  watchGame();
}

function initPlayAreaMap(elementId, editable) {
  const element = document.getElementById(elementId);
  if (!element || !window.L) return;

  if (areaMap) areaMap.remove();
  areaMap = L.map(element, { zoomControl: true }).setView([52.1326, 5.2913], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(areaMap);

  areaPoints = Array.isArray(game.play_area) ? game.play_area.map(function (point) { return [point[0], point[1]]; }) : [];
  isDrawingArea = false;
  renderPlayArea();

  const startPoint = Number.isFinite(Number(game.start_lat)) && Number.isFinite(Number(game.start_lng))
    ? [Number(game.start_lat), Number(game.start_lng)]
    : null;

  if (areaPoints.length >= 3) {
    areaMap.fitBounds(areaPoints, { padding: [24, 24] });
  } else if (startPoint) {
    areaMap.setView(startPoint, 16);
  } else if (editable) {
    areaMap.setView([52.0907, 5.1214], 13);
  }

  if (startPoint) {
    L.marker(startPoint).addTo(areaMap).bindPopup('Startlocatie');
  }

  if (editable) {
    areaMap.on('click', function (event) {
      if (!isDrawingArea) return;
      areaPoints.push([event.latlng.lat, event.latlng.lng]);
      renderPlayArea();
    });
  }
}

function renderPlayArea() {
  if (!areaMap) return;
  if (areaLayer) areaMap.removeLayer(areaLayer);
  if (areaPointLayer) areaMap.removeLayer(areaPointLayer);
  if (!areaPoints.length) return;

  areaLayer = areaPoints.length >= 3
    ? L.polygon(areaPoints, { color: '#174c3f', fillColor: '#4fc27d', fillOpacity: 0.2, weight: 3 }).addTo(areaMap)
    : L.polyline(areaPoints, { color: '#174c3f', weight: 3 }).addTo(areaMap);

  if (isDrawingArea) {
    areaPointLayer = L.layerGroup(areaPoints.map(function (point) {
      return L.circleMarker(point, { radius: 6, color: '#ff6b5b', fillOpacity: 1 });
    })).addTo(areaMap);
  }
}

function toggleAreaDrawing() {
  isDrawingArea = !isDrawingArea;
  if (isDrawingArea) alert('Tik op de kaart langs de grens van het speelgebied. Plaats minimaal drie punten en klik daarna op Gebied opslaan.');
  renderPlayArea();
}

function undoAreaPoint() {
  if (!isLeader || !areaPoints.length) return;
  areaPoints.pop();
  renderPlayArea();
}

async function savePlayArea() {
  if (areaPoints.length < 3) {
    alert('Plaats minimaal drie punten op de kaart.');
    return;
  }

  const result = await window.supabaseClient.rpc('set_play_area', {
    p_game_id: game.id,
    p_area: areaPoints
  });

  if (result.error) {
    alert('Speelgebied opslaan lukt niet: ' + result.error.message);
    return;
  }

  game = one(result.data);
  isDrawingArea = false;
  sessionScreen();
}

function leaveLobby() {
  stopTimers();
  forgetSession();
  game = null;
  isLeader = false;
  home();
}

async function loadLobbyPlayers() {
  const result = await window.supabaseClient
    .from('players')
    .select('display_name, role, user_id, joined_at')
    .eq('game_id', game.id)
    .order('joined_at', { ascending: true });

  if (result.error) {
    const panel = document.querySelector('#lobby-players');
    if (panel) panel.innerHTML = '<h2>Deelnemers</h2><p>Deelnemers laden lukt niet. Vernieuw na het uitvoeren van de lobby-herstelstap.</p>';
    return;
  }
  lobbyPlayers = result.data || [];
  renderLobbyPlayers();
}

function renderLobbyPlayers() {
  const panel = document.querySelector('#lobby-players');
  if (!panel) return;

  const rows = lobbyPlayers.map(function (player) {
    const isHost = player.user_id === game.created_by;
    const icon = player.role === 'boef' ? '🕶️' : player.role === 'vanger' ? '🧭' : '🎯';
    const role = player.role === 'boef' ? 'Boef' : player.role === 'vanger' ? 'Vanger' : 'Leider';
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line)"><strong>' + icon + ' ' + player.display_name + '</strong><span style="color:#587169;font-size:.9rem">' + role + (isHost ? ' · Spelleider' : '') + '</span></div>';
  }).join('');

  panel.innerHTML = '<h2>Deelnemers (' + lobbyPlayers.length + ')</h2>' + rows;
}

async function startSharedGame() {
  const button = document.querySelector('.primary');
  const playersResult = await window.supabaseClient
    .from('players')
    .select('role')
    .eq('game_id', game.id);

  const rolesInGame = (playersResult.data || []).map(function (player) { return player.role; });
  if (!rolesInGame.includes('boef') || !rolesInGame.includes('vanger')) {
    alert('Er moet minimaal één boef én één vanger in de lobby zitten voordat je start.');
    return;
  }

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
  if (!game) return;

  const previousStatus = game.status;
  const previousHealth = Number(game.boef_health_quarters);
  const healthResult = await window.supabaseClient.rpc('sync_game_health', { p_game_id: game.id });
  const healthGame = !healthResult.error && healthResult.data ? one(healthResult.data) : null;

  if (healthGame && healthGame.status !== previousStatus) {
    game = healthGame;
    sessionScreen();
    return;
  }

  if (healthGame) {
    game = healthGame;
    if (Number(game.boef_health_quarters) !== previousHealth) renderHealth();
  }

  const result = await window.supabaseClient.rpc('get_game_state', { p_game_id: game.id });
  if (!result.error) {
    const nextGame = one(result.data);
    if (nextGame && nextGame.status !== previousStatus) {
      game = nextGame;
      sessionScreen();
      return;
    }
    if (nextGame) {
      game = nextGame;
      if (Number(game.boef_health_quarters) !== previousHealth) renderHealth();
    }
  }

  if (game && game.status === 'lobby') {
    loadLobbyPlayers();
  }
}

function watchGame() {
  clearInterval(stateTimer);
  stateTimer = setInterval(refreshGameState, 2000);
}

function gameOverScreen() {
  stopTimers();
  const vangersWin = Number(game.boef_health_quarters) <= 0;
  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<section class="timer"><small>Spel afgelopen</small><div class="clock">' + (vangersWin ? 'GEVONDEN!' : 'KLAAR!') + '</div></section>'
    + '<section class="card"><h2>' + (vangersWin ? 'De vangers winnen' : 'De sessie is beëindigd') + '</h2><p>' + (vangersWin ? 'De boevenkracht is helemaal op doordat foto-hints te laat waren.' : 'Bedankt voor het spelen.') + '</p><button class="primary" onclick="leaveLobby()">Terug naar start <span>→</span></button></section>';
}

function gameScreen() {
  stopTimers();
  const role = roles[selectedRole];
  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<div class="status"><span class="dot"></span> Spel is bezig</div>'
    + '<section class="timer"><small>Jouw rol: ' + role[0] + ' ' + role[1] + '</small><div class="clock" id="clock">--:--</div></section>'
    + '<div id="game-map" class="area-map"></div>'
    + '<section id="health-panel" class="card"></section>'
    + '<section id="hint-panel" class="card mission"><span class="mission-icon">📸</span><div><h2>Foto-hints</h2><p>Hints worden geladen…</p></div></section>'
    + (isLeader ? '<button class="secondary" onclick="stopGame()">Stop spel en verwijder foto-hints <span>■</span></button>' : '')
    + '<p class="tiny">Deze klok komt uit de gedeelde eindtijd van de sessie.</p>';

  initPlayAreaMap('game-map', false);
  renderHealth();
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
  loadHints(false);
  hintTimer = setInterval(function () { loadHints(true); }, 4000);
  watchGame();
}

function hearts(quarters) {
  const total = Math.max(0, Math.min(12, Number(quarters) || 0));
  const assets = ['data:image/webp;base64,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','data:image/webp;base64,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','data:image/webp;base64,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','data:image/webp;base64,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','data:image/webp;base64,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'];
  let markup = '<div class="heart-meter" aria-label="Boevenkracht: ' + total + ' van 12 kwart harten">';
  for (let index = 0; index < 3; index += 1) {
    const fill = Math.max(0, Math.min(4, total - (index * 4)));
    markup += '<img src="assets/hearts/' + assets[fill] + '" alt="">';
  }
  return markup + '</div>';
}

function renderHealth() {
  const panel = document.querySelector('#health-panel');
  if (!panel || !game) return;
  const health = Number(game.boef_health_quarters) || 0;
  panel.innerHTML = '<h2>Boevenkracht</h2>' + hearts(health)
    + '<p>' + (health <= 0 ? 'De boeven zijn af — de vangers winnen.' : 'Te late foto-hints kosten een kwart hart per 30 seconden.') + '</p>';
}

function hintIntervalMs() {
  return Number(game.hint_interval_minutes || 7) * 60000;
}

function currentHintRound() {
  return Math.floor((Date.now() - new Date(game.start_at).getTime()) / hintIntervalMs());
}

function secondsUntilNextHint() {
  const start = new Date(game.start_at).getTime();
  const elapsed = Date.now() - start;
  return Math.max(0, Math.ceil((hintIntervalMs() - (elapsed % hintIntervalMs())) / 1000));
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
