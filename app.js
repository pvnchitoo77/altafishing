/* AltaFishing: primera entrega autónoma. Datos guardados localmente en el navegador. */
(() => {
  'use strict';
  const STORAGE_KEY = 'altafishing.v1';
  const emptyState = () => ({ catches: [], sessions: [], spots: [], posts: [], environmentCache: {}, profile: { name: 'Pescador/a', country: '', region: '', city: '', bio: '', targetSpecies: '', onboardingComplete: false } });
  let state = loadState();
  let activeFilter = 'all';
  let noticeTimer;
  let onboardingStep = 0;
  let onboardingDraft = { name: '', environment: '', seaType: '', freshwaterType: '', interests: [], latitude: null, longitude: null, locationGranted: false, acceptTerms: false, acceptPrivacy: false };
  let map;
  let spotMarkers = [];
  let selectedPoint = null;
  let selectedName = '';
  let currentMarineData = null;
  let currentWeatherData = null;
  let selectedForecastDate = state.profile.selectedForecastDate || '';
  let selectedWeatherHour = state.profile.selectedWeatherHour || '12:00';
  let locationRequestId = 0;
  let tideClockTimer = null;
  if (Number.isFinite(Number(state.profile.latitude)) && Number.isFinite(Number(state.profile.longitude))) {
    selectedPoint = { latitude: Number(state.profile.latitude), longitude: Number(state.profile.longitude) };
    selectedName = state.profile.lastLocationName || 'Mi ubicación';
  }
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function providerButton(provider, icon, label) {
    return `<button class="provider-button" type="button" data-auth-provider="${provider}"><span class="provider-icon provider-${provider}">${icon}</span><span>${label}</span></button>`;
  }

  function renderOnboarding() {
    const content = $('#onboarding-content');
    $('#onboarding-step-label').textContent = `PASO ${onboardingStep + 1} DE 5`;
    $('#onboarding-progress-fill').style.width = `${(onboardingStep + 1) * 20}%`;
    $('#onboarding-back').hidden = onboardingStep === 0;
    const next = $('#onboarding-next');
    next.textContent = onboardingStep === 0 ? 'Continuar como invitado' : onboardingStep === 4 ? 'Aceptar y comenzar' : 'Continuar';
    if (onboardingStep === 0) content.innerHTML = `<p class="eyebrow">BIENVENIDO/A A ALTAFISHING</p><h1>¿Cómo te quieres registrar?</h1><p class="lead">Elige cómo crear tu cuenta. Puedes entrar con Google o empezar como invitado y guardar tus datos en este dispositivo.</p><div class="provider-grid">${providerButton('apple','●','Apple')}${providerButton('google','G','Google')}${providerButton('facebook','f','Facebook')}${providerButton('gmail','M','Gmail')}</div><div id="onboarding-auth-note" class="onboarding-hint">Google y Gmail inician sesión con tu cuenta de Google. Apple y Facebook todavía no están habilitados.</div>`;
    if (onboardingStep === 1) content.innerHTML = `<p class="eyebrow">TU PERFIL</p><h1>¿Cómo quieres aparecer?</h1><p class="lead">Usa tu nombre o un apodo. Podrás cambiarlo en cualquier momento.</p><label class="onboarding-field">Nombre o apodo<input id="onboard-name" maxlength="48" autocomplete="nickname" placeholder="Ej. MarAzul" value="${escapeHtml(onboardingDraft.name)}" /></label>`;
    if (onboardingStep === 2) {
      const chip = (value, label, current, target = 'environment') => `<button type="button" class="choice-chip ${current === value ? 'selected' : ''}" ${target === 'environment' ? `data-environment="${value}"` : `data-water-type="${value}" data-target="${target}"`}>${label}</button>`;
      let subs = '';
      if (onboardingDraft.environment === 'mar' || onboardingDraft.environment === 'ambos') subs += `<div class="onboard-question"><strong>En el mar, ¿dónde pescas la mayor parte del tiempo?</strong><div class="choice-row">${chip('costero','Costero',onboardingDraft.seaType,'seaType')}${chip('altamar','Altamar',onboardingDraft.seaType,'seaType')}</div></div>`;
      if (onboardingDraft.environment === 'dulce' || onboardingDraft.environment === 'ambos') subs += `<div class="onboard-question"><strong>En agua dulce, ¿dónde pescas la mayor parte del tiempo?</strong><div class="choice-row">${chip('rio','Río',onboardingDraft.freshwaterType,'freshwaterType')}${chip('lago','Lago',onboardingDraft.freshwaterType,'freshwaterType')}</div></div>`;
      content.innerHTML = `<p class="eyebrow">TU ENTORNO</p><h1>¿Cuál es tu entorno de pesca principal?</h1><p class="lead">Selecciona una opción y cuéntanos en qué tipo de agua sueles pescar.</p><div class="choice-row">${chip('mar','Pesca de mar',onboardingDraft.environment)}${chip('dulce','Agua dulce',onboardingDraft.environment)}${chip('ambos','Ambos',onboardingDraft.environment)}</div>${subs}`;
    }
    if (onboardingStep === 3) {
      const choices = [['sol-luna','Sol y Luna','☼'],['olas','Olas','≈'],['clima','Clima','☁'],['peces-mareas','Actividad de peces y mareas','♧']];
      content.innerHTML = `<p class="eyebrow">PRONÓSTICOS</p><h1>¿Qué pronósticos te interesan?</h1><p class="lead">Elige los que quieres priorizar. Podrás cambiarlos en el perfil.</p><div class="interest-grid">${choices.map(([value,label,icon]) => `<label class="interest-choice"><input type="checkbox" data-interest="${value}" ${onboardingDraft.interests.includes(value) ? 'checked' : ''}/><span class="interest-icon">${icon}</span><span>${label}</span></label>`).join('')}</div>`;
    }
    if (onboardingStep === 4) content.innerHTML = `<p class="eyebrow">ANTES DE EMPEZAR</p><h1>Configura tu experiencia</h1><p class="lead">Lee y acepta los documentos para crear tu perfil local. La ubicación es opcional: la pediremos solo si la autorizas para centrar el mapa y personalizar el pronóstico.</p><div class="legal-checks"><label><input id="accept-terms" type="checkbox" ${onboardingDraft.acceptTerms ? 'checked' : ''}/> Acepto los <a href="./docs/TERMINOS_Y_CONDICIONES.md" target="_blank">Términos y condiciones</a>.</label><label><input id="accept-privacy" type="checkbox" ${onboardingDraft.acceptPrivacy ? 'checked' : ''}/> He leído la <a href="./docs/PRIVACIDAD.md" target="_blank">Política de privacidad</a>.</label></div><div class="location-consent"><strong>Ubicación mientras usas la app (opcional)</strong><p>Sirve para centrar el mapa y consultar condiciones de tu zona. No hacemos seguimiento continuo. Puedes continuar buscando lugares manualmente.</p><button id="request-location" type="button" class="button button-outline">${onboardingDraft.locationGranted ? 'Ubicación autorizada' : 'Permitir ubicación ahora'}</button><span id="location-consent-result">${onboardingDraft.locationGranted ? 'Ubicación guardada en este dispositivo.' : 'Aún no se ha solicitado.'}</span></div>`;
    updateOnboardingNext();
  }

  function updateOnboardingNext() {
    const next = $('#onboarding-next');
    if (onboardingStep === 1) onboardingDraft.name = $('#onboard-name')?.value.trim() || '';
    if (onboardingStep === 4) { onboardingDraft.acceptTerms = $('#accept-terms')?.checked || false; onboardingDraft.acceptPrivacy = $('#accept-privacy')?.checked || false; }
    const valid = onboardingStep !== 1 || onboardingDraft.name.length > 0 ? onboardingStep !== 2 || (onboardingDraft.environment && (!['mar','ambos'].includes(onboardingDraft.environment) || onboardingDraft.seaType) && (!['dulce','ambos'].includes(onboardingDraft.environment) || onboardingDraft.freshwaterType)) ? onboardingStep !== 4 || (onboardingDraft.acceptTerms && onboardingDraft.acceptPrivacy) : false : false;
    next.disabled = !valid;
  }

  function moveOnboarding(direction) {
    updateOnboardingNext();
    if (direction > 0 && $('#onboarding-next').disabled) return;
    if (onboardingStep === 4 && direction > 0) {
      state.profile = { ...state.profile, name: onboardingDraft.name, registrationMethod: state.profile.authUserId ? (state.profile.registrationMethod || 'google') : 'guest', environment: onboardingDraft.environment, seaType: onboardingDraft.seaType, freshwaterType: onboardingDraft.freshwaterType, forecastInterests: onboardingDraft.interests, onboardingComplete: true, acceptedTermsAt: new Date().toISOString(), termsVersion: '1.0', privacyVersion: '1.0', ...(onboardingDraft.locationGranted ? { latitude: onboardingDraft.latitude, longitude: onboardingDraft.longitude, locationPermission: 'granted' } : {}) };
      if (onboardingDraft.locationGranted) { selectedPoint = { latitude: onboardingDraft.latitude, longitude: onboardingDraft.longitude }; selectedName = 'Mi ubicación'; }
      $('#onboarding-dialog').close(); saveState(); showNotice('Perfil listo. Puedes editarlo cuando quieras.'); return;
    }
    onboardingStep = Math.max(0, Math.min(4, onboardingStep + direction)); renderOnboarding();
  }

  function requestOnboardingLocation() {
    const result = $('#location-consent-result');
    if (!navigator.geolocation) { result.textContent = 'Este navegador no ofrece ubicación. Puedes continuar manualmente.'; return; }
    result.textContent = 'Esperando tu respuesta al permiso del dispositivo…';
    navigator.geolocation.getCurrentPosition(position => { onboardingDraft.latitude = position.coords.latitude; onboardingDraft.longitude = position.coords.longitude; onboardingDraft.locationGranted = true; result.textContent = 'Ubicación autorizada y guardada localmente.'; $('#request-location').textContent = 'Ubicación autorizada'; updateOnboardingNext(); }, error => { result.textContent = error.code === 1 ? 'Permiso denegado. Puedes elegir una ubicación en el mapa.' : 'No pudimos obtener la ubicación. Puedes continuar manualmente.'; });
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return emptyState();
      return { ...emptyState(), ...stored, catches: Array.isArray(stored.catches) ? stored.catches : [], sessions: Array.isArray(stored.sessions) ? stored.sessions : [], spots: Array.isArray(stored.spots) ? stored.spots : [], posts: Array.isArray(stored.posts) ? stored.posts : [], profile: { ...emptyState().profile, ...(stored.profile || {}) } };
    } catch (error) {
      console.error('No se pudieron leer los datos locales de AltaFishing.', error);
      return emptyState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      return true;
    } catch (error) {
      console.error('No se pudieron guardar los datos locales de AltaFishing.', error);
      showNotice('No se pudo guardar. Revisa el espacio disponible en el navegador.', true);
      return false;
    }
  }

  function showNotice(message, isError = false) {
    const notice = $('#notice');
    notice.textContent = message;
    notice.classList.toggle('error', isError);
    notice.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('show'), 2800);
  }

  function navigate(page) {
    const known = ['inicio', 'mapa', 'mareas', 'diario', 'comunidad', 'nudos', 'planes', 'perfil'];
    if (!known.includes(page)) return;
    $('#more-dialog')?.close();
    $$('.page').forEach(node => node.classList.toggle('active', node.id === `page-${page}`));
    $$('[data-page]').forEach(node => node.classList.toggle('active', node.dataset.page === page));
    $('#crumb').textContent = page.toUpperCase();
    history.replaceState(null, '', `#${page}`);
    if (page === 'mapa' && !map) initializeMap();
    else if (page === 'mapa') setTimeout(() => map.resize(), 100);
    if (page === 'comunidad') renderCommunity();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function dateLabel(value) {
    if (!value) return 'Fecha sin indicar';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Fecha sin indicar' : new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function render() {
    $('#home-catches').textContent = state.catches.length;
    $('#home-sessions').textContent = state.sessions.length;
    $('#home-spots').textContent = state.spots.length;
    const biggest = state.catches.filter(item => Number(item.lengthCm) > 0).sort((a, b) => Number(b.lengthCm) - Number(a.lengthCm))[0];
    $('#home-record').textContent = biggest ? `${biggest.lengthCm} cm` : '—';
    $('#home-record-note').textContent = biggest ? `${escapeHtml(biggest.species)} · mejor longitud` : 'Aún por descubrir';
    $('#profile-name-display').textContent = state.profile.name || 'Pescador/a';
    const profileLocation = [state.profile.city, state.profile.region, state.profile.country].filter(Boolean).join(', ');
    $('#profile-location-display').textContent = profileLocation || 'Añade tu ubicación';
    $('#profile-avatar').innerHTML = state.profile.photo ? `<img src="${escapeHtml(state.profile.photo)}" alt="Foto de perfil" />` : escapeHtml((state.profile.name || 'P').trim().slice(0, 1).toUpperCase());
    $('#profile-catches').textContent = state.catches.length;
    $('#profile-sessions').textContent = state.sessions.length;
    $('#profile-spots').textContent = state.spots.length;
    const frequent = state.catches.reduce((counts, item) => { counts[item.species] = (counts[item.species] || 0) + 1; return counts; }, {});
    const topSpecies = Object.entries(frequent).sort((a, b) => b[1] - a[1])[0];
    $('#profile-species').textContent = topSpecies ? topSpecies[0] : '—';
    renderRecent(); renderDiary(); renderSpots(); renderMarkers(); updateCounts(); renderCommunity(); renderKnots(); renderAuthUi();
  }

  function renderRecent() {
    const recent = [...state.catches].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
    $('#recent-list').innerHTML = recent.length ? recent.map(item => `<div class="diary-entry">${item.fishPhoto || item.lurePhoto ? `<div class="entry-thumbs">${item.fishPhoto ? `<img src="${escapeHtml(item.fishPhoto)}" alt="Pez capturado"/>` : ''}${item.lurePhoto ? `<img src="${escapeHtml(item.lurePhoto)}" alt="Señuelo usado"/>` : ''}</div>` : '<div class="entry-symbol">♧</div>'}<div class="entry-main"><strong>${escapeHtml(item.species)}</strong><p>${escapeHtml(item.spot || item.locationName || 'Lugar no indicado')} · ${dateLabel(item.date)}</p></div><div class="entry-meta">${item.lengthCm ? `<strong>${escapeHtml(item.lengthCm)} cm</strong>` : 'Sin medida'}</div></div>`).join('') : `<div class="empty-row"><div class="empty-icon">↗</div><div><strong>Tu primera captura empieza aquí.</strong><span>Guarda especie, lugar y los detalles que quieras recordar.</span></div></div>`;
  }

  function allEntries() {
    const catches = state.catches.map(item => ({ ...item, kind: 'catch', id: item.id, dateValue: item.date || item.createdAt }));
    const sessions = state.sessions.map(item => ({ ...item, kind: 'session', id: item.id, dateValue: item.startAt }));
    const rows = activeFilter === 'catches' ? catches : activeFilter === 'sessions' ? sessions : [...catches, ...sessions];
    const direction = $('#diary-sort').value === 'oldest' ? 1 : -1;
    return rows.sort((a, b) => direction * (new Date(a.dateValue) - new Date(b.dateValue)));
  }

  function renderDiary() {
    const entries = allEntries();
    $('#diary-list').innerHTML = entries.length ? entries.map(item => item.kind === 'catch' ? `<article class="diary-entry">${item.fishPhoto || item.lurePhoto ? `<div class="entry-thumbs">${item.fishPhoto ? `<img src="${escapeHtml(item.fishPhoto)}" alt="Pez capturado"/>` : ''}${item.lurePhoto ? `<img src="${escapeHtml(item.lurePhoto)}" alt="Señuelo usado"/>` : ''}</div>` : '<div class="entry-symbol">♧</div>'}<div class="entry-main"><strong>${escapeHtml(item.species)}</strong><p>${escapeHtml(item.spot || item.locationName || 'Lugar no indicado')} · ${escapeHtml(item.technique || 'Técnica no indicada')}</p>${item.latitude != null ? `<small class="entry-coords">${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}</small>` : ''}</div><div class="entry-meta"><strong>${item.lengthCm ? `${escapeHtml(item.lengthCm)} cm` : 'Sin medida'}</strong>${dateLabel(item.date)}${item.weightKg ? `<br/>${escapeHtml(item.weightKg)} kg` : ''}</div><button class="entry-delete" data-delete="catch" data-id="${escapeHtml(item.id)}" aria-label="Eliminar captura">×</button></article>` : `<article class="diary-entry"><div class="entry-symbol">◷</div><div class="entry-main"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.spot || 'Zona no indicada')} · Salida de pesca</p></div><div class="entry-meta"><strong>${item.status === 'active' ? 'En curso' : 'Finalizada'}</strong>${dateLabel(item.startAt)}</div>${item.status === 'active' ? `<button class="entry-delete finish-session" data-id="${escapeHtml(item.id)}" aria-label="Finalizar salida">✓</button>` : `<button class="entry-delete" data-delete="session" data-id="${escapeHtml(item.id)}" aria-label="Eliminar salida">×</button>`}</article>`).join('') : `<div class="empty-state"><div class="empty-icon">▤</div><h3>${activeFilter === 'sessions' ? 'Aún no hay salidas registradas' : activeFilter === 'catches' ? 'Aún no hay capturas registradas' : 'Tu diario está listo para empezar'}</h3><p>Los datos se guardan en este navegador. Puedes registrar una captura o iniciar una salida cuando quieras.</p><button class="button button-primary" data-action="${activeFilter === 'sessions' ? 'new-session' : 'new-catch'}">＋ ${activeFilter === 'sessions' ? 'Iniciar salida' : 'Registrar captura'}</button></div>`;
  }

  function updateCounts() {
    $('#count-catches').textContent = state.catches.length;
    $('#count-sessions').textContent = state.sessions.length;
    $('#count-all').textContent = state.catches.length + state.sessions.length;
  }

  function renderSpots() {
    $('#spots-list').innerHTML = state.spots.length ? state.spots.map(spot => `<div class="spot-row"><div class="spot-pin">⌖</div><div><strong>${escapeHtml(spot.name)}</strong><small>${escapeHtml([spot.type, spot.area].filter(Boolean).join(' · ') || 'Ubicación no indicada')}</small></div><button class="entry-delete" data-delete="spot" data-id="${escapeHtml(spot.id)}" aria-label="Eliminar spot">×</button></div>`).join('') : `<div class="empty-row"><div class="empty-icon">⌖</div><div><strong>Aún no has guardado lugares.</strong><span>Añade un spot personal para tenerlo en tu lista.</span></div></div>`;
  }

  function renderMarkers() {
    if (!map || !window.maplibregl) return;
    spotMarkers.forEach(marker => marker.remove());
    spotMarkers = [];
    state.spots.filter(spot => Number.isFinite(Number(spot.latitude)) && Number.isFinite(Number(spot.longitude))).forEach(spot => {
      const marker = new maplibregl.Marker({ color: '#258ca8' }).setLngLat([Number(spot.longitude), Number(spot.latitude)]).setPopup(new maplibregl.Popup().setText(spot.name)).addTo(map);
      spotMarkers.push(marker);
    });
  }

  function renderCommunity() {
    const feed = $('#community-feed');
    if (!feed) return;
    feed.innerHTML = state.posts.length ? [...state.posts].reverse().map(post => {
      const votes = post.ratings && !Array.isArray(post.ratings) ? Object.values(post.ratings).map(Number) : (post.ratings || []).map(Number);
      const average = votes.length ? (votes.reduce((sum, rating) => sum + rating, 0) / votes.length).toFixed(1) : '—';
      const fishPhoto = post.fishPhoto || post.photo;
      const vote = state.profile.authUserId ? post.ratings?.[state.profile.authUserId] : null;
      return `<article class="community-post panel"><div class="post-photo-pair">${fishPhoto ? `<figure><img class="post-photo" src="${escapeHtml(fishPhoto)}" alt="Pez capturado: ${escapeHtml(post.species || '')}"/><figcaption>Pez</figcaption></figure>` : '<div class="post-photo-placeholder">Foto del pez no disponible</div>'}${post.lurePhoto ? `<figure><img class="post-photo" src="${escapeHtml(post.lurePhoto)}" alt="Señuelo utilizado"/><figcaption>Señuelo</figcaption></figure>` : ''}</div><div class="post-body"><div class="eyebrow">${escapeHtml(post.author || 'Pescador/a')}</div><h3>${escapeHtml(post.species)}</h3><p>${escapeHtml(post.spot || 'Spot no indicado')} · ${dateLabel(post.date)}</p>${post.notes ? `<p>${escapeHtml(post.notes)}</p>` : ''}<div class="rating-row"><span>Valoración del pez / spot</span><strong>★ ${average} · ${votes.length} votos</strong><div class="rating-buttons">${state.profile.authUserId ? vote ? `<span class="vote-confirmation">Tu voto: ${vote}/5</span>` : [1,2,3,4,5].map(score => `<button data-rate="${score}" data-id="${escapeHtml(post.id)}" aria-label="Valorar ${score} de 5">★</button>`).join('') : '<button class="button button-outline" data-action="social-login">Inicia sesión para calificar</button>'}</div></div></div></article>`;
    }).join('') : `<div class="empty-state"><div class="empty-icon">◎</div><h3>La comunidad empieza con una historia.</h3><p>Publica una captura para probar la vista local. Para compartir entre personas necesitamos configurar nube, permisos y moderación.</p><button class="button button-primary" data-action="new-post">＋ Publicar captura</button></div>`;
  }

  function renderKnots() {
    const guides = [
      ['Nudo palomar', 'Unión sencilla entre línea y anzuelo. Video tutorial pendiente de alojamiento.'],
      ['Nudo FG', 'Conexión de trenzado con líder. Video tutorial pendiente de alojamiento.'],
      ['Nudo uni', 'Nudo versátil para terminales. Video tutorial pendiente de alojamiento.'],
      ['Nudo rapala', 'Lazo para dar movilidad al señuelo. Video tutorial pendiente de alojamiento.']
    ];
    const container = $('#knot-guides');
    if (container) container.innerHTML = guides.map(([name, description]) => `<article class="panel knot-card"><div class="video-placeholder"><span>▶</span><small>VIDEO NO CONECTADO</small></div><div class="eyebrow">NUDOS DE PESCA</div><h3>${name}</h3><p class="muted">${description}</p></article>`).join('');
  }

  function field(label, name, type = 'text', options = {}) {
    const full = options.full ? ' full' : '';
    if (options.select) return `<div class="field${full}"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" ${options.required ? 'required' : ''}><option value="">Seleccionar</option>${options.select.map(value => `<option>${escapeHtml(value)}</option>`).join('')}</select></div>`;
    if (type === 'textarea') return `<div class="field${full}"><label for="field-${name}">${label}</label><textarea id="field-${name}" name="${name}" placeholder="${options.placeholder || ''}">${escapeHtml(options.value || '')}</textarea></div>`;
    return `<div class="field${full}"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" ${options.required ? 'required' : ''} ${options.readonly ? 'readonly' : ''} ${options.step ? `step="${options.step}"` : ''} ${options.min ? `min="${options.min}"` : ''} ${options.max ? `max="${options.max}"` : ''} placeholder="${options.placeholder || ''}" value="${options.value || ''}" /></div>`;
  }

  function openDialog(type) {
    if (type === 'post' && !state.profile.authUserId) { showNotice('Para publicar una captura necesitas iniciar sesión. El acceso seguro aún no está configurado.', true); return; }
    const dialog = $('#record-dialog'); const fields = $('#dialog-fields');
    const today = new Date().toISOString().slice(0, 10);
    if (type === 'catch') {
      $('#dialog-kicker').textContent = 'TU BITÁCORA · NUEVA CAPTURA'; $('#dialog-title').textContent = 'Registrar captura'; $('#dialog-submit').textContent = 'Guardar captura';
      fields.innerHTML = `<div class="form-grid">${field('Especie *', 'species', 'text', { required: true, placeholder: 'Ej. Corvina' })}${field('Fecha', 'date', 'date', { value: today, required: true })}${field('Longitud (cm)', 'lengthCm', 'number', { min: '0', placeholder: 'Opcional' })}${field('Peso (kg)', 'weightKg', 'number', { min: '0', placeholder: 'Opcional' })}${field('Foto del pez', 'fishPhoto', 'file')}${field('Foto del señuelo usado', 'lurePhoto', 'file')}${field('Lugar / spot', 'spot', 'text', { placeholder: 'Ej. Playa o sector' })}${field('Técnica', 'technique', 'text', { placeholder: 'Ej. Spinning' })}${selectedPoint ? `<div class="profile-footnote field full">Ubicación seleccionada: ${selectedPoint.latitude.toFixed(5)}, ${selectedPoint.longitude.toFixed(5)} · ${escapeHtml(selectedName)}</div>` : '<div class="profile-footnote field full">La ubicación es opcional. Elige un punto en el mapa antes de registrar si quieres guardarla.</div>'}${field('Destino', 'destination', 'text', { placeholder: 'Liberado, retenido…' })}${field('Notas', 'notes', 'textarea', { full: true, placeholder: 'Detalles que quieras recordar' })}</div>`;
      $('#record-form').dataset.type = type;
    } else if (type === 'session') {
      $('#dialog-kicker').textContent = 'TU BITÁCORA · NUEVA JORNADA'; $('#dialog-title').textContent = 'Iniciar salida'; $('#dialog-submit').textContent = 'Iniciar salida';
      fields.innerHTML = `<div class="form-grid">${field('Nombre de la salida *', 'name', 'text', { required: true, placeholder: 'Ej. Mañana en Lenga' })}${field('Zona principal', 'spot', 'text', { placeholder: 'Ej. Lenga' })}${field('Técnica', 'technique', 'text', { placeholder: 'Ej. Surfcasting' })}${field('Notas', 'notes', 'textarea', { full: true, placeholder: 'Plan o detalles de la jornada' })}</div>`;
      $('#record-form').dataset.type = type;
    } else if (type === 'spot') {
      $('#dialog-kicker').textContent = 'TU MAPA · LUGAR PERSONAL'; $('#dialog-title').textContent = 'Guardar spot'; $('#dialog-submit').textContent = 'Guardar spot';
      fields.innerHTML = `<div class="form-grid">${field('Nombre del lugar *', 'name', 'text', { required: true, placeholder: 'Ej. Punta de la playa' })}${field('Tipo de entorno', 'type', 'text', { placeholder: 'Playa, roquerío, muelle…' })}${field('País o zona', 'area', 'text', { value: selectedName })}${field('Latitud', 'latitude', 'number', { step: 'any', value: selectedPoint?.latitude ?? '', readonly: true })}${field('Longitud', 'longitude', 'number', { step: 'any', value: selectedPoint?.longitude ?? '', readonly: true })}${field('Descripción', 'notes', 'textarea', { full: true, placeholder: 'Notas privadas sobre este lugar' })}<p class="profile-footnote field full">Los spots permanecen privados en este navegador.</p></div>`;
      $('#record-form').dataset.type = type;
    } else if (type === 'profile') {
      $('#dialog-kicker').textContent = 'TU PERFIL'; $('#dialog-title').textContent = 'Editar perfil'; $('#dialog-submit').textContent = 'Guardar perfil';
      fields.innerHTML = `<div class="form-grid">${field('Nombre para mostrar *', 'name', 'text', { required: true, value: state.profile.name })}${field('Foto de perfil (máx. 1 MB)', 'photo', 'file', { full: true })}${field('País', 'country', 'text', { value: state.profile.country })}${field('Región / estado / provincia', 'region', 'text', { value: state.profile.region })}${field('Ciudad o zona habitual', 'city', 'text', { value: state.profile.city })}${field('Entorno de pesca (mar, agua dulce o ambos)', 'environment', 'text', { value: state.profile.environment })}${field('Zona habitual (costero, altamar, río, lago)', 'fishingArea', 'text', { value: state.profile.seaType || state.profile.freshwaterType })}${field('Especie favorita', 'targetSpecies', 'text', { value: state.profile.targetSpecies })}${field('Pronósticos de interés (separados por coma)', 'forecastInterestsText', 'text', { value: (state.profile.forecastInterests || []).join(', ') })}${field('Sobre ti', 'bio', 'textarea', { full: true, value: state.profile.bio })}</div>`;
      $('#record-form').dataset.type = type;
    } else if (type === 'post') {
      $('#dialog-kicker').textContent = 'COMUNIDAD · PUBLICACIÓN LOCAL'; $('#dialog-title').textContent = 'Compartir captura'; $('#dialog-submit').textContent = 'Publicar';
      fields.innerHTML = `<div class="form-grid">${field('Especie *', 'species', 'text', { required: true, placeholder: 'Ej. Corvina' })}${field('Fecha', 'date', 'date', { value: today })}${field('Spot / localidad', 'spot', 'text', { placeholder: 'Opcional; evita revelar un lugar sensible' })}${field('Foto del pez *', 'fishPhoto', 'file', { required: true })}${field('Foto del señuelo (opcional)', 'lurePhoto', 'file', { full: true })}${field('Descripción', 'notes', 'textarea', { full: true, placeholder: 'Cuenta cómo fue la jornada' })}<p class="profile-footnote field full">Solo una cuenta iniciada puede publicar. Comparte el señuelo aparte y evita revelar spots sensibles.</p></div>`;
      $('#record-form').dataset.type = type;
    }
    dialog.showModal();
  }

  async function handleSubmit(event) {
    if (event.target === $('#location-search')) { event.preventDefault(); searchLocation(); return; }
    if (event.target !== $('#record-form')) return;
    event.preventDefault();
    const form = event.target; const values = Object.fromEntries(new FormData(form).entries()); const type = form.dataset.type;
    let photo = ''; let fishPhoto = ''; let lurePhoto = '';
    try {
      if ((type === 'profile') && values.photo instanceof File && values.photo.size) {
        if (values.photo.size > 1_000_000) { showNotice('La imagen debe pesar menos de 1 MB en esta versión local.', true); return; }
        photo = await readImage(values.photo);
      }
      if (type === 'catch') {
        for (const key of ['fishPhoto', 'lurePhoto']) if (values[key] instanceof File && values[key].size) {
          if (values[key].size > 1_000_000) { showNotice('Cada imagen debe pesar menos de 1 MB en esta versión local.', true); return; }
          if (key === 'fishPhoto') fishPhoto = await readImage(values[key]); else lurePhoto = await readImage(values[key]);
        }
      }
      if (type === 'post') {
        if (!(values.fishPhoto instanceof File) || !values.fishPhoto.size) { showNotice('La foto del pez es obligatoria para publicar.', true); return; }
        for (const key of ['fishPhoto', 'lurePhoto']) if (values[key] instanceof File && values[key].size) {
          if (values[key].size > 1_000_000) { showNotice('Cada imagen debe pesar menos de 1 MB en esta versión local.', true); return; }
          if (key === 'fishPhoto') fishPhoto = await readImage(values[key]); else lurePhoto = await readImage(values[key]);
        }
      }
    } catch (error) { showNotice('No se pudo leer la imagen. Prueba con otro archivo.', true); return; }
    if (type === 'catch') state.catches.push({ ...values, fishPhoto, lurePhoto, latitude: selectedPoint?.latitude ?? null, longitude: selectedPoint?.longitude ?? null, locationName: selectedPoint ? selectedName : '', id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    if (type === 'session') state.sessions.push({ ...values, id: crypto.randomUUID(), startAt: new Date().toISOString(), status: 'active' });
    if (type === 'spot') state.spots.push({ ...values, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    if (type === 'profile') {
      const { forecastInterestsText, fishingArea, ...profileValues } = values;
      state.profile = { ...state.profile, ...profileValues, ...(photo ? { photo } : {}), name: values.name.trim() || 'Pescador/a', forecastInterests: (forecastInterestsText || '').split(',').map(value => value.trim()).filter(Boolean) };
      if (['costero', 'altamar'].includes(fishingArea)) state.profile.seaType = fishingArea;
      if (['rio', 'lago'].includes(fishingArea)) state.profile.freshwaterType = fishingArea;
    }
    if (type === 'post') state.posts.push({ species: values.species, date: values.date, spot: values.spot, notes: values.notes, fishPhoto, lurePhoto, author: state.profile.name, userId: state.profile.authUserId, ratings: {}, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    $('#record-dialog').close(); form.reset();
    if (saveState()) showNotice(type === 'catch' ? 'Captura guardada en este dispositivo.' : type === 'session' ? 'Salida iniciada. Ya aparece en tu diario.' : type === 'spot' ? 'Spot guardado de forma privada.' : type === 'post' ? 'Publicación guardada solo en este navegador.' : 'Perfil actualizado.');
  }

  function readImage(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  }

  function localDate(offsetDays = 0) {
    const date = new Date(); date.setDate(date.getDate() + offsetDays);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function localDateFrom(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatHour12(value) {
    const hour = Number(String(value).slice(0, 2));
    const minute = String(value).slice(3, 5) || '00';
    return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  function formatDay(date, timezone = 'UTC') {
    return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  }

  function selectForecastDate(date) {
    selectedForecastDate = date;
    selectedWeatherHour = '12:00';
    state.profile.selectedForecastDate = date;
    state.profile.selectedWeatherHour = selectedWeatherHour;
    saveState();
    renderDaySelectors();
    renderWeatherHours();
    renderTideDays();
    updateWeatherReadout();
  }

  function renderDaySelectors() {
    const weatherDates = [...new Set(currentWeatherData?.hourly?.time?.map(time => time.slice(0, 10)) || [])].slice(0, 5);
    const tideDates = [...new Set(currentMarineData?.hourly?.time?.map(time => time.slice(0, 10)) || [])].slice(0, 5);
    const dates = weatherDates.length ? weatherDates : tideDates;
    if (!dates.length) return;
    if (!dates.includes(selectedForecastDate)) selectedForecastDate = dates[0];
    const timezone = currentWeatherData?.timezone || currentMarineData?.timezone || 'UTC';
    const renderStrip = (selector, availableDates) => {
      const strip = $(selector);
      if (!strip) return;
      strip.innerHTML = availableDates.map(date => `<button class="day-chip ${date === selectedForecastDate ? 'selected' : ''}" type="button" data-select-date="${date}" aria-pressed="${date === selectedForecastDate}"><span>${escapeHtml(formatDay(date, timezone))}</span><strong>${date.slice(8, 10)}</strong></button>`).join('');
    };
    renderStrip('#weather-day-strip', weatherDates);
    renderStrip('#tide-day-strip', tideDates);
    const label = $('#weather-selected-date');
    if (label) label.textContent = `${formatDay(selectedForecastDate, timezone)} · ${selectedForecastDate}`;
  }

  function hourlyWeatherAt(time) {
    const hourly = currentWeatherData?.hourly;
    if (!hourly || !selectedForecastDate) return -1;
    const candidates = hourly.time.map((stamp, index) => ({ stamp, index })).filter(item => item.stamp.startsWith(selectedForecastDate));
    if (!candidates.length) return -1;
    const selectedMinutes = Number(selectedWeatherHour.slice(0, 2)) * 60 + Number(selectedWeatherHour.slice(3, 5));
    return candidates.reduce((best, item) => {
      const [hour, minute] = item.stamp.slice(11, 16).split(':').map(Number);
      const distance = Math.abs(hour * 60 + minute - selectedMinutes);
      return distance < best.distance ? { index: item.index, distance } : best;
    }, { index: candidates[0].index, distance: Infinity }).index;
  }

  function windColor(speed) {
    if (speed < 10) return '#6379bd';
    if (speed < 20) return '#2787a5';
    if (speed < 35) return '#45a45e';
    if (speed < 55) return '#c6a437';
    if (speed < 70) return '#b56c9a';
    return '#4a87a6';
  }

  function renderWeatherHours() {
    const strip = $('#weather-hour-strip');
    const hourly = currentWeatherData?.hourly;
    if (!strip || !hourly || !selectedForecastDate) return;
    const rows = hourly.time.map((stamp, index) => ({ stamp, index })).filter(item => item.stamp.startsWith(selectedForecastDate) && Number(item.stamp.slice(11, 13)) % 3 === 0);
    strip.innerHTML = rows.map(({ stamp, index }) => {
      const hour = stamp.slice(11, 16); const speed = Number(hourly.wind_speed_10m?.[index]);
      return `<button class="weather-hour ${hour === selectedWeatherHour ? 'selected' : ''}" type="button" data-select-hour="${hour}" aria-pressed="${hour === selectedWeatherHour}" style="--wind-color:${windColor(speed)}"><span>${formatHour12(hour)}</span><strong>${Number.isFinite(speed) ? Math.round(speed) : '—'}</strong><small>km/h</small></button>`;
    }).join('');
    strip.scrollLeft = Math.max(0, strip.querySelector('.weather-hour.selected')?.offsetLeft || 0);
  }

  function updateWeatherReadout() {
    const hourly = currentWeatherData?.hourly;
    const index = hourlyWeatherAt();
    if (!hourly || index < 0) return;
    const get = (key) => Number(hourly[key]?.[index]);
    const wind = get('wind_speed_10m');
    const date = selectedForecastDate;
    const time = selectedWeatherHour;
    $('#forecast-results').innerHTML = `<div class="weather-detail-grid"><article><span>VIENTO</span><strong>${Number.isFinite(wind) ? `${Math.round(wind)} km/h` : '—'}</strong><small>Ráfagas ${Number.isFinite(get('wind_gusts_10m')) ? `${Math.round(get('wind_gusts_10m'))} km/h` : '—'}</small></article><article><span>TEMPERATURA</span><strong>${Number.isFinite(get('temperature_2m')) ? `${Math.round(get('temperature_2m'))} °C` : '—'}</strong><small>Hora seleccionada</small></article><article><span>HUMEDAD</span><strong>${Number.isFinite(get('relative_humidity_2m')) ? `${Math.round(get('relative_humidity_2m'))}%` : '—'}</strong><small>Relativa</small></article><article><span>PRECIPITACIÓN</span><strong>${Number.isFinite(get('precipitation_probability')) ? `${Math.round(get('precipitation_probability'))}%` : '—'}</strong><small>${Number.isFinite(get('precipitation')) ? `${get('precipitation').toFixed(1)} mm` : 'Sin dato'}</small></article><article><span>NUBOSIDAD</span><strong>${Number.isFinite(get('cloud_cover')) ? `${Math.round(get('cloud_cover'))}%` : '—'}</strong><small>Cobertura estimada</small></article><article><span>DIRECCIÓN DEL VIENTO</span><strong>${Number.isFinite(get('wind_direction_10m')) ? `${Math.round(get('wind_direction_10m'))}°` : '—'}</strong><small>Rumbo</small></article></div>`;
    $('#home-wind').textContent = Number.isFinite(wind) ? `${Math.round(wind)}` : '—';
    $('#home-temp').textContent = Number.isFinite(get('temperature_2m')) ? `${Math.round(get('temperature_2m'))}°` : '—';
    $('#home-humidity').textContent = Number.isFinite(get('relative_humidity_2m')) ? `${Math.round(get('relative_humidity_2m'))}%` : '—';
    const marineIndex = currentMarineData?.hourly?.time?.findIndex(stamp => stamp.startsWith(`${date}T${time}`)) ?? -1;
    const waves = marineIndex >= 0 ? Number(currentMarineData.hourly.wave_height?.[marineIndex]) : NaN;
    $('#home-wave').textContent = Number.isFinite(waves) ? `${waves.toFixed(1)} m` : '—';
    $('#home-weather-note').textContent = `${selectedName} · ${formatDay(date, currentWeatherData.timezone)} a las ${formatHour12(time)} · pronóstico de modelo, no observación en vivo.`;
    $('#home-weather-status').textContent = 'PRONÓSTICO';
    $('#forecast-source').textContent = `Fuente: Open-Meteo · ${currentWeatherData.timezone || 'hora local del lugar'} · datos horarios para ${date}.`;
  }

  function selectWeatherHour(hour) {
    selectedWeatherHour = hour;
    state.profile.selectedWeatherHour = hour;
    saveState();
    renderWeatherHours();
    updateWeatherReadout();
  }

  function initializeMap() {
    const feedback = $('#map-feedback');
    if (!window.maplibregl) { feedback.textContent = window.mapLibraryFailed ? 'No se pudo descargar el motor del mapa. Revisa la conexión o el bloqueador de contenido y recarga.' : 'El motor del mapa no está disponible todavía. Espera un momento y vuelve a abrir Mapa.'; return; }
    try {
      const savedCamera = state.profile.mapCamera;
      map = new maplibregl.Map({ container: 'world-map', style: 'https://tiles.openfreemap.org/styles/positron', center: savedCamera?.center || (selectedPoint ? [selectedPoint.longitude, selectedPoint.latitude] : [0, 20]), zoom: savedCamera?.zoom ?? (selectedPoint ? 7 : 1.7), attributionControl: true });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.on('click', event => setLocation({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, name: 'Punto seleccionado en el mapa' }));
      map.on('moveend', () => { const center = map.getCenter(); state.profile.mapCamera = { center: [center.lng, center.lat], zoom: map.getZoom() }; saveState(); });
      map.on('load', () => { feedback.textContent = 'Mapa mundial listo. Busca una ciudad o pulsa para elegir un punto.'; renderMarkers(); if (selectedPoint) setLocation({ ...selectedPoint, name: selectedName }); });
      map.on('error', event => { console.error('Error del mapa AltaFishing:', event?.error || event); feedback.textContent = `El mapa no pudo cargar los mosaicos: ${event?.error?.message || 'servicio cartográfico no disponible'}. Prueba de nuevo con conexión.`; });
      window.setTimeout(() => { if (!map?.loaded()) feedback.textContent = 'El mapa tarda en responder. Comprueba que tu red permita tiles.openfreemap.org y unpkg.com.'; }, 12000);
    } catch (error) { console.error('No se pudo iniciar MapLibre.', error); feedback.textContent = `No se pudo iniciar el mapa: ${error.message}`; return; }
  }

  async function searchLocation() {
    const query = $('#location-query').value.trim(); if (!query) return;
    const feedback = $('#map-feedback'); feedback.textContent = 'Buscando ubicaciones…';
    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search'); url.search = new URLSearchParams({ name: query, count: '6', language: 'es', format: 'json' });
      const response = await fetch(url); if (!response.ok) throw new Error(`Búsqueda no disponible (${response.status}).`);
      const results = (await response.json()).results || [];
      $('#location-results').innerHTML = results.map((place, index) => `<button class="location-result" data-place="${index}">${escapeHtml(place.name)}${place.admin1 ? `, ${escapeHtml(place.admin1)}` : ''}${place.country ? ` · ${escapeHtml(place.country)}` : ''}</button>`).join('');
      window.locationSearchResults = results;
      feedback.textContent = results.length ? 'Elige una ubicación para ver el pronóstico.' : 'No encontramos ese lugar. Prueba con ciudad y país.';
    } catch (error) { feedback.textContent = `No se pudo buscar: ${error.message}`; }
  }

  async function setLocation(place) {
    selectedPoint = { latitude: Number(place.latitude), longitude: Number(place.longitude) };
    selectedName = place.name || `${selectedPoint.latitude.toFixed(3)}, ${selectedPoint.longitude.toFixed(3)}`;
    currentMarineData = null; currentWeatherData = null; clearInterval(tideClockTimer);
    $('#selected-location-name').textContent = selectedName;
    $('#selected-location-coords').textContent = `${selectedPoint.latitude.toFixed(4)}, ${selectedPoint.longitude.toFixed(4)}`;
    $('#tide-location-name').textContent = selectedName;
    $('#forecast-results').innerHTML = '<p class="muted">Cargando pronóstico…</p>';
    $('#tide-results').innerHTML = '<p class="muted">Cargando estimación marina…</p>';
    $('#home-wind').textContent = '—'; $('#home-temp').textContent = '—'; $('#home-humidity').textContent = '—'; $('#home-wave').textContent = '—';
    $('#home-weather-status').textContent = 'ACTUALIZANDO';
    const requestId = ++locationRequestId;
    state.profile.lastLocationName = selectedName;
    state.profile.latitude = selectedPoint.latitude; state.profile.longitude = selectedPoint.longitude;
    saveState();
    if (map) { map.flyTo({ center: [selectedPoint.longitude, selectedPoint.latitude], zoom: 9 }); if (window.selectedLocationMarker) window.selectedLocationMarker.remove(); window.selectedLocationMarker = new maplibregl.Marker({ color: '#bd6865' }).setLngLat([selectedPoint.longitude, selectedPoint.latitude]).setPopup(new maplibregl.Popup().setText(selectedName)).addTo(map).togglePopup(); }
    $('#location-results').replaceChildren();
    await Promise.all([loadWeather(requestId), loadTides(requestId)]);
  }

  async function loadWeather(requestId = locationRequestId) {
    if (!selectedPoint) return;
    $('#forecast-results').innerHTML = '<p class="muted">Cargando pronóstico…</p>';
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({ latitude: selectedPoint.latitude, longitude: selectedPoint.longitude, hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,cloud_cover', daily: 'sunrise,sunset', temperature_unit: 'celsius', wind_speed_unit: 'kmh', forecast_days: '5', timezone: 'auto' });
      const response = await fetch(url); if (!response.ok) throw new Error(`Pronóstico no disponible (${response.status}).`);
      const data = await response.json();
      if (requestId !== locationRequestId) return;
      currentWeatherData = data;
      renderDaySelectors(); renderWeatherHours(); renderTideDays(); updateWeatherReadout();
      $('#home-weather-title').textContent = selectedName;
      $('#map-feedback').textContent = 'Pronóstico horario actualizado. Elige un día y una hora en la barra.';
    } catch (error) { if (requestId === locationRequestId) $('#forecast-results').innerHTML = `<p class="muted">${escapeHtml(error.message)} Comprueba tu conexión e inténtalo de nuevo.</p>`; }
  }

  async function loadTides(requestId = locationRequestId) {
    if (!selectedPoint) return;
    $('#tide-results').innerHTML = '<p class="muted">Cargando estimación marina…</p>';
    try {
      const url = new URL('https://marine-api.open-meteo.com/v1/marine');
      url.search = new URLSearchParams({ latitude: selectedPoint.latitude, longitude: selectedPoint.longitude, hourly: 'sea_level_height_msl,wave_height', forecast_days: '5', timezone: 'auto' });
      const response = await fetch(url); if (!response.ok) throw new Error(`Estimación marina no disponible (${response.status}).`);
      const data = await response.json(); const hourly = data.hourly;
      if (requestId !== locationRequestId) return;
      currentMarineData = data;
      renderDaySelectors(); renderWeatherHours(); updateWeatherReadout(); renderTideDays();
      updateTideClock();
      clearInterval(tideClockTimer); tideClockTimer = setInterval(updateTideClock, 1000);
      $('#tide-location-name').textContent = `${selectedName} · estimación del modelo`;
    } catch (error) { if (requestId === locationRequestId) $('#tide-results').innerHTML = `<p class="muted">${escapeHtml(error.message)} Comprueba tu conexión e inténtalo de nuevo.</p>`; }
  }

  function tideExtrema(rows) {
    const points = [];
    for (let index = 1; index < rows.length - 1; index += 1) {
      const before = rows[index - 1].level; const current = rows[index].level; const after = rows[index + 1].level;
      if (!Number.isFinite(current)) continue;
      if (current >= before && current > after) points.push({ ...rows[index], stage: 'high' });
      else if (current <= before && current < after) points.push({ ...rows[index], stage: 'low' });
    }
    return points;
  }

  function tideTimeNumber(value) {
    const [date, time = '00:00'] = value.split('T');
    const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
    return Date.UTC(year, month - 1, day, hour, minute);
  }

  function localParts(timeZone) {
    const pieces = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const values = Object.fromEntries(pieces.map(piece => [piece.type, piece.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}:${values.second}`, stamp: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}` };
  }

  function smoothCurve(points) {
    if (!points.length) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const middle = (points[index].x + points[index + 1].x) / 2;
      path += ` Q ${points[index].x} ${points[index].y} ${middle} ${(points[index].y + points[index + 1].y) / 2}`;
    }
    const last = points[points.length - 1]; path += ` T ${last.x} ${last.y}`;
    return path;
  }

  function renderTideDays() {
    if (!currentMarineData?.hourly) return;
    const { hourly, timezone = 'UTC' } = currentMarineData;
    const grouped = new Map();
    hourly.time.forEach((time, index) => {
      const day = time.slice(0, 10); if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push({ time, level: Number(hourly.sea_level_height_msl[index]), index });
    });
    const today = localParts(timezone).date;
    const days = [...grouped.entries()].filter(([date]) => date >= today).slice(0, 5);
    renderDaySelectors();
    const selectedDay = days.find(([date]) => date === selectedForecastDate) || days[0];
    $('#tide-results').innerHTML = selectedDay ? (() => {
      const [date, rows] = selectedDay;
      const values = rows.map(row => row.level).filter(Number.isFinite);
      if (!values.length) return '<p class="muted">No hay curva disponible para este día.</p>';
      const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(max - min, 0.1);
      const points = rows.map((row, index) => ({ x: 38 + index * (724 / Math.max(rows.length - 1, 1)), y: 198 - ((row.level - min) / span) * 132, row }));
      const curve = smoothCurve(points); const area = `${curve} L ${points.at(-1).x} 208 L ${points[0].x} 208 Z`;
      const extrema = tideExtrema(rows);
      const markers = extrema.map(point => { const location = points.find(item => item.row.index === point.index); const high = point.stage === 'high'; return `<g class="${high ? 'svg-high' : 'svg-low'}"><circle cx="${location.x}" cy="${location.y}" r="5"/><text x="${location.x}" y="${location.y + (high ? -13 : 22)}" text-anchor="middle">${formatHour12(point.time.slice(11,16))} · ${point.level.toFixed(2)}m</text></g>`; }).join('');
      const ticks = [0, 6, 12, 18, 24].map(hour => { const x = 38 + (hour / 24) * 724; return `<line x1="${x}" y1="70" x2="${x}" y2="208"/><text x="${x}" y="228" text-anchor="middle">${formatHour12(`${hour === 24 ? '00' : String(hour).padStart(2,'0')}:00`)}</text>`; }).join('');
      const sun = currentWeatherData?.daily; const sunIndex = sun?.time?.indexOf(date) ?? -1;
      const sunrise = sunIndex >= 0 ? sun.sunrise[sunIndex].slice(11, 16) : null; const sunset = sunIndex >= 0 ? sun.sunset[sunIndex].slice(11, 16) : null;
      const clock = localParts(timezone).time; const clockMinutes = Number(clock.slice(0,2))*60 + Number(clock.slice(3,5)); const nowX = 38 + (clockMinutes / 1440) * 724;
      const dateLabelText = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
      const summary = extrema.map(point => `<span class="tide-summary ${point.stage}"><i></i>${point.stage === 'high' ? 'Pleamar' : 'Bajamar'} ${formatHour12(point.time.slice(11,16))} · ${point.level.toFixed(2)} m</span>`).join('');
      const nowMarker = date === today ? `<line x1="${nowX}" y1="45" x2="${nowX}" y2="208" class="chart-now"/>` : '';
      return `<article class="tide-day-card"><div class="tide-day-header"><div><span class="eyebrow">MAREA · ${escapeHtml(timezone)}</span><h3>${escapeHtml(dateLabelText)}</h3></div><span class="tide-day-note">Modelo · ${min.toFixed(2)} a ${max.toFixed(2)} m</span></div><div class="tide-chart-wrap"><svg class="tide-chart" viewBox="0 0 800 250" role="img" aria-label="Curva modelada del nivel del mar para ${escapeHtml(dateLabelText)}"><defs><linearGradient id="tide-fill-${date}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#42bce5" stop-opacity=".28"/><stop offset="100%" stop-color="#42bce5" stop-opacity=".03"/></linearGradient></defs><rect x="38" y="50" width="724" height="158" rx="6" class="chart-night"/>${sunrise && sunset ? `<rect x="${38+Number(sunrise.slice(0,2))*724/24}" y="50" width="${Math.max((Number(sunset.slice(0,2))-Number(sunrise.slice(0,2)))*724/24,0)}" height="158" class="chart-daylight"/>` : ''}<g class="chart-grid">${ticks}</g><path d="${area}" fill="url(#tide-fill-${date})"/><path d="${curve}" class="tide-curve" fill="none"/>${markers}${nowMarker}</svg><div class="sun-times">${sunrise ? `☀ Salida ${formatHour12(sunrise)} · Puesta ${formatHour12(sunset)}` : 'Sol: sin dato disponible'} <span>🐟 Actividad: sin modelo validado</span></div></div><div class="tide-summary-row">${summary || '<span class="muted">No se detectaron pleamares o bajamares en este intervalo.</span>'}</div></article>`;
    })() : '<p class="muted">No se recibieron datos para los próximos cinco días.</p>';
    updateTideClock();
  }

  function updateTideClock() {
    if (!currentMarineData?.hourly) return;
    const { hourly, timezone = 'UTC' } = currentMarineData; const now = localParts(timezone); const target = `${now.date}T${now.time.slice(0,5)}`;
    const todayRows = hourly.time.map((time, index) => ({ time, level: Number(hourly.sea_level_height_msl[index]), index })).filter(row => row.time.startsWith(now.date));
    if (!todayRows.length) return;
    const extrema = tideExtrema(todayRows); const future = extrema.filter(point => point.time > target);
    const nextHigh = future.find(point => point.stage === 'high'); const nextLow = future.find(point => point.stage === 'low');
    const before = [...extrema].reverse().find(point => point.time <= target); const next = future[0];
    const minuteTarget = tideTimeNumber(target); const beforeMinute = before ? tideTimeNumber(before.time) : tideTimeNumber(`${now.date}T00:00`); const nextMinute = next ? tideTimeNumber(next.time) : tideTimeNumber(`${now.date}T23:59`);
    const progress = Math.max(0, Math.min(1, (minuteTarget - beforeMinute) / Math.max(nextMinute - beforeMinute, 1)));
    const stage = next?.stage === 'high' ? 'Subiendo' : next?.stage === 'low' ? 'Bajando' : 'Sin giro previsto hoy';
    const currentIndex = Math.max(0, todayRows.findLastIndex(row => row.time <= target));
    const currentRow = todayRows[currentIndex]; const nextRow = todayRows[Math.min(currentIndex + 1, todayRows.length - 1)];
    const between = Math.max(0, Math.min(1, (tideTimeNumber(target) - tideTimeNumber(currentRow.time)) / Math.max(tideTimeNumber(nextRow.time) - tideTimeNumber(currentRow.time), 1)));
    const currentLevel = currentRow.level + (nextRow.level - currentRow.level) * between;
    const nextHighText = nextHigh ? `${formatHour12(nextHigh.time.slice(11,16))} · ${nextHigh.level.toFixed(2)} m` : 'No hay más hoy';
    const nextLowText = nextLow ? `${formatHour12(nextLow.time.slice(11,16))} · ${nextLow.level.toFixed(2)} m` : 'No hay más hoy';
    $('#clock-next-high').textContent = nextHighText; $('#clock-next-low').textContent = nextLowText;
    $('#tide-clock-time').textContent = formatHour12(now.time); $('#tide-clock-date').textContent = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date());
    $('#tide-current-stage').textContent = stage; $('#tide-current-level').textContent = `Nivel modelado: ${Number.isFinite(currentLevel) ? `${currentLevel.toFixed(2)} m` : 'sin dato'} · ${selectedName}`;
    $('#clock-rising').classList.toggle('active', next?.stage === 'high'); $('#clock-falling').classList.toggle('active', next?.stage === 'low');
    $('#tide-clock-hand').style.transform = `rotate(${(progress * 360).toFixed(1)}deg)`;
    const progressRing = $('#tide-progress');
    progressRing.style.setProperty('--phase-progress', `${(progress * 100).toFixed(1)}%`);
    progressRing.classList.toggle('falling', next?.stage === 'low');
    $('#tide-clock-source').textContent = `Hora de ${timezone}. El indicador refleja el próximo giro modelado de hoy; el pronóstico no es una observación en vivo.`;
  }

  function deleteItem(kind, id) {
    const labels = { catch: 'esta captura', session: 'esta salida', spot: 'este spot' };
    if (!window.confirm(`¿Quieres eliminar ${labels[kind]}? Esta acción no se puede deshacer.`)) return;
    const key = kind === 'catch' ? 'catches' : kind === 'session' ? 'sessions' : 'spots';
    state[key] = state[key].filter(item => item.id !== id);
    if (saveState()) showNotice('Registro eliminado.');
  }

  function finishSession(id) {
    const session = state.sessions.find(item => item.id === id);
    if (!session) return;
    session.status = 'finished'; session.endAt = new Date().toISOString();
    if (saveState()) showNotice('Salida finalizada y guardada.');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'AltaFishing', exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `altafishing-datos-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
    showNotice('Exportación descargada.');
  }

  /* Inicio de sesión con Supabase Auth (Google). La clave "publishable" es pública por diseño; nunca pongas aquí la service_role. */
  const SUPABASE_URL = 'https://kuyseuemspelufcnsfya.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Oj3oX2mL6OiLCLer5P8U2g_AML85hpL';
  const COMMUNITY_GUEST_TEXT = 'Para publicar o calificar se requiere una cuenta. Inicia sesión con Google para activarlo.';
  const sb = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

  async function signInWithGoogle() {
    if (!sb) { showNotice('No se pudo cargar el servicio de acceso. Revisa tu conexión y recarga la página.', true); return; }
    const redirectTo = location.origin + location.pathname.replace(/index\.html$/, '');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) showNotice(`No se pudo iniciar sesión: ${error.message}`, true);
  }

  function clearSession() {
    if (!state.profile.authUserId) return;
    const { authUserId, email, ...rest } = state.profile;
    state.profile = { ...rest, registrationMethod: 'guest' };
    saveState();
  }

  async function signOutUser() {
    if (sb) await sb.auth.signOut();
    clearSession();
    showNotice('Sesión cerrada. Tus datos locales siguen en este dispositivo.');
  }

  function applySession(session) {
    const user = session?.user;
    if (!user) return;
    const meta = user.user_metadata || {};
    const displayName = String(meta.full_name || meta.name || (user.email || '').split('@')[0] || '').slice(0, 48);
    const changed = state.profile.authUserId !== user.id;
    state.profile = { ...state.profile, authUserId: user.id, email: user.email || '', registrationMethod: user.app_metadata?.provider || 'google' };
    if (displayName && (!state.profile.name || state.profile.name === 'Pescador/a')) state.profile.name = displayName;
    if (!state.profile.photo && meta.avatar_url) state.profile.photo = meta.avatar_url;
    if (!state.profile.onboardingComplete && displayName && !onboardingDraft.name) onboardingDraft.name = displayName;
    const dialog = $('#onboarding-dialog');
    if (dialog.open && onboardingStep === 0) { onboardingStep = 1; renderOnboarding(); }
    if (changed) { saveState(); showNotice('Sesión iniciada con Google.'); } else renderAuthUi();
  }

  function renderAuthUi() {
    const signedIn = Boolean(state.profile.authUserId);
    $$('[data-auth-toggle]').forEach(button => { button.textContent = signedIn ? 'Cerrar sesión' : 'Iniciar sesión con Google'; button.dataset.action = signedIn ? 'sign-out' : 'social-login'; });
    const status = $('#community-account-status');
    if (status) status.textContent = signedIn ? `Sesión iniciada como ${state.profile.name || 'tu cuenta'}. Ya puedes publicar y calificar.` : COMMUNITY_GUEST_TEXT;
  }

  if (sb) sb.auth.onAuthStateChange((event, session) => {
    if (session?.user) applySession(session);
    else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') clearSession();
  });

  document.addEventListener('click', event => {
    const page = event.target.closest('[data-page]');
    if (page) { navigate(page.dataset.page); return; }
    const go = event.target.closest('[data-go]');
    if (go) { navigate(go.dataset.go); return; }
    const dateChoice = event.target.closest('[data-select-date]');
    if (dateChoice) { selectForecastDate(dateChoice.dataset.selectDate); return; }
    const hourChoice = event.target.closest('[data-select-hour]');
    if (hourChoice) { selectWeatherHour(hourChoice.dataset.selectHour); return; }
    const action = event.target.closest('[data-action]');
    if (action) {
      const actionName = action.dataset.action;
      if (actionName === 'new-catch') openDialog('catch');
      if (actionName === 'new-session') openDialog('session');
      if (actionName === 'new-spot') openDialog('spot');
      if (actionName === 'edit-profile') openDialog('profile');
      if (actionName === 'new-post') openDialog('post');
      if (actionName === 'social-login') signInWithGoogle();
      if (actionName === 'sign-out') signOutUser();
      if (actionName === 'show-more') $('#more-dialog').showModal();
      if (actionName === 'export-data') exportData();
      if (actionName === 'clear-data' && window.confirm('Esto borrará las capturas, salidas, spots y nombre guardados en este navegador. ¿Quieres continuar?')) { if (sb) sb.auth.signOut(); state = emptyState(); localStorage.removeItem(STORAGE_KEY); render(); showNotice('Datos locales eliminados.'); }
      return;
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) { activeFilter = filter.dataset.filter; $$('.filter-tab').forEach(tab => tab.classList.toggle('active', tab === filter)); renderDiary(); return; }
    const deletion = event.target.closest('[data-delete]');
    if (deletion) { deleteItem(deletion.dataset.delete, deletion.dataset.id); return; }
    const finish = event.target.closest('.finish-session');
    if (finish) finishSession(finish.dataset.id);
    const place = event.target.closest('[data-place]');
    if (place) { const result = window.locationSearchResults?.[Number(place.dataset.place)]; if (result) setLocation({ latitude: result.latitude, longitude: result.longitude, name: [result.name, result.admin1, result.country].filter(Boolean).join(', ') }); return; }
    const rating = event.target.closest('[data-rate]');
    if (rating) {
      const voterId = state.profile.authUserId;
      const post = state.posts.find(item => item.id === rating.dataset.id);
      if (!voterId) { showNotice('Inicia sesión para calificar. El acceso aún no está conectado.', true); return; }
      if (post) {
        if (Array.isArray(post.ratings)) post.ratings = Object.fromEntries(post.ratings.map((score, index) => [`legacy-${index}`, score]));
        post.ratings ||= {};
        if (post.ratings[voterId] != null) { showNotice('Ya calificaste esta publicación. Cada cuenta vota una sola vez.'); return; }
        post.ratings[voterId] = Number(rating.dataset.rate);
        if (saveState()) showNotice('Calificación guardada.');
      }
      return;
    }
    if (event.target.closest('.dialog-cancel')) $('#record-dialog').close();
    if (event.target.closest('.more-close')) $('#more-dialog').close();
  });

  document.addEventListener('submit', handleSubmit);
  $('#diary-sort').addEventListener('change', renderDiary);
  $('#onboarding-next').addEventListener('click', () => moveOnboarding(1));
  $('#onboarding-back').addEventListener('click', () => moveOnboarding(-1));
  $('#onboarding-content').addEventListener('input', updateOnboardingNext);
  $('#onboarding-content').addEventListener('change', event => {
    if (event.target.matches('[data-interest]')) { const interest = event.target.dataset.interest; onboardingDraft.interests = event.target.checked ? [...new Set([...onboardingDraft.interests, interest])] : onboardingDraft.interests.filter(item => item !== interest); }
    updateOnboardingNext();
  });
  $('#onboarding-content').addEventListener('click', event => {
    const provider = event.target.closest('[data-auth-provider]');
    if (provider) {
      const name = provider.dataset.authProvider;
      if (name === 'google' || name === 'gmail') { signInWithGoogle(); return; }
      $('#onboarding-auth-note').textContent = `${name === 'apple' ? 'Apple' : 'Facebook'} todavía no está habilitado. Usa Google o continúa como invitado; los botones no crean una cuenta falsa.`;
      return;
    }
    const environment = event.target.closest('[data-environment]');
    if (environment) { onboardingDraft.environment = environment.dataset.environment; onboardingDraft.seaType = ''; onboardingDraft.freshwaterType = ''; renderOnboarding(); return; }
    const waterType = event.target.closest('[data-water-type]');
    if (waterType) { onboardingDraft[waterType.dataset.target] = waterType.dataset.waterType; renderOnboarding(); return; }
    if (event.target.closest('#request-location')) requestOnboardingLocation();
  });
  $('#onboarding-dialog').addEventListener('cancel', event => { if (!state.profile.onboardingComplete) event.preventDefault(); });
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'inicio'));
  navigate(location.hash.slice(1) || 'inicio');
  render();
  if (!state.profile.onboardingComplete) { renderOnboarding(); $('#onboarding-dialog').showModal(); }
})();
