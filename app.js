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
    + '<label>Speelduur</label><select id="duration"><option value="45">45 minuten</option><option value="60" selected>1 uur</option><option value="90">1 uur en 30 minuten</option></select>'
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
  const startAddress = document.querySelector('#startAddress').value;
  const startCity = document.querySelector('#startCity').value;

  selectedRole = role;
  createScreen();

  document.querySelector('#hostName').value = playerName;
  document.querySelector('#gameName').value = gameName;
  document.querySelector('#duration').value = duration;
  document.querySelector('#startAddress').value = startAddress;
  document.querySelector('#startCity').value = startCity;
}

async function createGame() {
  const name = document.querySelector('#gameName').value.trim() || 'Jachtseizoen';
  const playerName = document.querySelector('#hostName').value.trim();
  const duration = Number(document.querySelector('#duration').value);
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
      p_role: selectedRole
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
  const result = await window.supabaseClient.rpc('get_game_state', { p_game_id: game.id });
  if (!result.error) {
    const nextGame = one(result.data);
    if (nextGame && nextGame.status !== game.status) {
      game = nextGame;
      sessionScreen();
      return;
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

function gameScreen() {
  stopTimers();
  const role = roles[selectedRole];
  app.innerHTML = '<header class="game-header"><div class="brand"><span class="brand-badge">↗</span> Jachtseizoen</div><span class="code">' + game.join_code + '</span></header>'
    + '<div class="status"><span class="dot"></span> Spel is bezig</div>'
    + '<section class="timer"><small>Jouw rol: ' + role[0] + ' ' + role[1] + '</small><div class="clock" id="clock">--:--</div></section>'
    + '<div id="game-map" class="area-map"></div>'
    + '<section id="hint-panel" class="card mission"><span class="mission-icon">📸</span><div><h2>Foto-hints</h2><p>Hints worden geladen…</p></div></section>'
    + (isLeader ? '<button class="secondary" onclick="stopGame()">Stop spel en verwijder foto-hints <span>■</span></button>' : '')
    + '<p class="tiny">Deze klok komt uit de gedeelde eindtijd van de sessie.</p>';

  initPlayAreaMap('game-map', false);
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
