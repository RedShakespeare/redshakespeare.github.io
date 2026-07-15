import JASSUB from 'jassub';
import subsrt from 'subsrt';
import playerState from '../lib/player-state.js';

const selector = '.sil-video-player[data-sil-video-player]';
const rates = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
const VIEWPORT_CLICK_DELAY = 300;
const FEEDBACK_HIDE_DELAY = 900;
const PLAYBACK_FEEDBACK_HIDE_DELAY = 600;
const TOUCH_GESTURE_THRESHOLD = 12;
const TOUCH_SEEK_SECONDS = 60;
const TOUCH_DOUBLE_SEEK_SECONDS = 15;
const TOUCH_CLICK_FALLBACK_DELAY = 750;
const GESTURE_CLICK_SUPPRESS_DELAY = 500;
const WHEEL_PIXEL_STEP = 100;
const WHEEL_RESET_DELAY = 250;
const { FULLSCREEN_UI_HIDE_DELAY, VOLUME_CLOSE_DELAY, volumeLevel } = playerState;
const instances = new Map();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remaining}` : `${minutes}:${remaining}`;
}

function luminance(value) {
  const hex = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgb = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  let channels;
  if (hex) {
    const source = hex[1].length === 3 ? hex[1].split('').map(part => part + part).join('') : hex[1];
    channels = [0, 2, 4].map(offset => Number.parseInt(source.slice(offset, offset + 2), 16));
  } else if (rgb) {
    channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return channels ? (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255 : 1;
}

function isDarkTheme() {
  const target = document.body || document.documentElement;
  return luminance(getComputedStyle(target).backgroundColor) < 0.5;
}

function setRangeFill(input, value, maximum) {
  const percent = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  input.style.setProperty('--sil-video-range-fill', `${percent}%`);
}

function setBufferedRanges(input, media, maximum) {
  if (!(maximum > 0) || !media.buffered || media.buffered.length === 0) {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  const ranges = [];
  try {
    for (let index = 0; index < media.buffered.length; index += 1) {
      const start = clamp(media.buffered.start(index) / maximum * 100, 0, 100);
      const end = clamp(media.buffered.end(index) / maximum * 100, start, 100);
      if (end <= start) continue;
      const previous = ranges[ranges.length - 1];
      if (previous && start <= previous[1] + 0.001) previous[1] = Math.max(previous[1], end);
      else ranges.push([start, end]);
    }
  } catch {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  if (ranges.length === 0) {
    input.style.removeProperty('--sil-video-range-buffered');
    return;
  }
  const stops = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Number(range[0].toFixed(3));
    const end = Number(range[1].toFixed(3));
    stops.push(
      `var(--sil-video-rail) ${cursor}%`,
      `var(--sil-video-rail) ${start}%`,
      `var(--sil-video-buffered) ${start}%`,
      `var(--sil-video-buffered) ${end}%`
    );
    cursor = end;
  }
  stops.push(`var(--sil-video-rail) ${cursor}%`, 'var(--sil-video-rail) 100%');
  input.style.setProperty('--sil-video-range-buffered', `linear-gradient(to right,${stops.join(',')})`);
}

function parseModel(player) {
  const source = player.dataset.silVideoModel;
  if (!source) throw new Error('播放器配置缺失。');
  const bytes = Uint8Array.from(atob(source), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function initialise(player) {
  if (instances.has(player) || player.dataset.silVideoReady === 'true') return;
  const video = player.querySelector('.sil-video-player__video');
  const stage = player.querySelector('[data-sil-video-stage]');
  const viewport = player.querySelector('[data-sil-video-viewport]');
  const mediaLayer = player.querySelector('[data-sil-video-media-layer]');
  const feedback = player.querySelector('[data-sil-video-feedback]');
  const feedbackText = player.querySelector('[data-sil-video-feedback-text]');
  const progress = player.querySelector('[data-sil-video-progress]');
  const volume = player.querySelector('[data-sil-video-volume]');
  const current = player.querySelector('[data-sil-video-current]');
  const duration = player.querySelector('[data-sil-video-duration]');
  const status = player.querySelector('[data-sil-video-status]');
  const play = player.querySelector('[data-sil-video-action="play"]');
  const mute = player.querySelector('[data-sil-video-action="mute"]');
  const rate = player.querySelector('[data-sil-video-action="rate"]');
  const repeat = player.querySelector('[data-sil-video-action="repeat"]');
  const subtitles = player.querySelector('[data-sil-video-action="subtitles"]');
  const subtitleMenu = player.querySelector('[data-sil-video-subtitle-menu]');
  const fullscreen = player.querySelector('[data-sil-video-action="fullscreen"]');
  const volumeControl = player.querySelector('.sil-video-player__volume-control');
  if (!video || !stage || !viewport || !mediaLayer || !feedback || !feedbackText || !progress || !volume || !current || !duration || !status || !play || !mute || !rate || !repeat || !subtitles || !subtitleMenu || !fullscreen || !volumeControl) return;

  let model;
  try {
    model = parseModel(player);
  } catch (error) {
    status.textContent = error.message;
    player.dataset.silVideoError = 'true';
    return;
  }

  const cleanups = [];
  let subtitleRenderer = null;
  let subtitleAbort = null;
  let subtitleToken = 0;
  let selectedSubtitle = -1;
  let lastVolume = video.volume || 0.8;
  let volumeCloseTimer = null;
  let fullscreenUiTimer = null;
  let viewportClickTimer = null;
  let viewportClickTouch = false;
  let viewportClickWakeOnly = false;
  let recentTouchTap = null;
  let feedbackTimer = null;
  let wheelResetTimer = null;
  let wheelPixelDelta = 0;
  let gesture = null;
  let suppressViewportClickUntil = 0;
  let brightness = 1;
  let wasFullscreen = false;

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    cleanups.push(() => target.removeEventListener(event, handler, options));
  }

  function setStatus(message = '', error = false) {
    status.textContent = message;
    if (error) player.dataset.silVideoError = 'true';
    else delete player.dataset.silVideoError;
  }

  function focusWithoutScroll(target) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  function fullscreenActive() {
    return document.fullscreenElement === stage;
  }

  function shortcutSurfaceFocused() {
    const focused = document.activeElement;
    return focused === player || focused === stage || focused === video || focused === viewport;
  }

  async function lockLandscape() {
    try {
      await window.screen?.orientation?.lock?.('landscape');
    } catch {
      // Orientation locking is best-effort and commonly unavailable outside Android fullscreen.
    }
  }

  function unlockOrientation() {
    try {
      window.screen?.orientation?.unlock?.();
    } catch {
      // The browser may expose orientation information without allowing explicit unlocks.
    }
  }

  function controlsKeepFullscreenUiOpen() {
    const focused = document.activeElement;
    const controlFocused = focused && focused !== video && focused !== stage && stage.contains(focused) && focused.matches(':focus-visible');
    return player.dataset.silVideoVolumeOpen === 'true' || !subtitleMenu.hidden || controlFocused;
  }

  function clearFullscreenUiTimer() {
    if (fullscreenUiTimer !== null) window.clearTimeout(fullscreenUiTimer);
    fullscreenUiTimer = null;
  }

  function scheduleFullscreenUiHide() {
    clearFullscreenUiTimer();
    delete stage.dataset.silVideoUiHidden;
    if (!fullscreenActive() || video.paused || video.ended || controlsKeepFullscreenUiOpen()) return;
    fullscreenUiTimer = window.setTimeout(() => {
      fullscreenUiTimer = null;
      if (fullscreenActive() && !video.paused && !video.ended && !controlsKeepFullscreenUiOpen()) stage.dataset.silVideoUiHidden = 'true';
    }, FULLSCREEN_UI_HIDE_DELAY);
  }

  function showFullscreenUi() {
    delete stage.dataset.silVideoUiHidden;
    scheduleFullscreenUiHide();
  }

  function syncPlaying() {
    const playing = !video.paused && !video.ended;
    player.dataset.silVideoPlaying = playing ? 'true' : 'false';
    player.dataset.silVideoEnded = video.ended ? 'true' : 'false';
    play.setAttribute('aria-label', video.ended ? '重播' : playing ? '暂停' : '播放');
    play.setAttribute('aria-pressed', playing ? 'true' : 'false');
    if (playing) scheduleFullscreenUiHide();
    else {
      clearFullscreenUiTimer();
      delete stage.dataset.silVideoUiHidden;
    }
  }

  function syncTime() {
    const maximum = Number.isFinite(video.duration) ? video.duration : Number(progress.max) || 0;
    const position = Number.isFinite(video.currentTime) ? Math.min(video.currentTime, maximum || video.currentTime) : 0;
    progress.max = String(maximum || 100);
    progress.value = String(position);
    current.textContent = formatTime(position);
    progress.setAttribute('aria-valuetext', formatTime(position));
    setRangeFill(progress, position, maximum);
  }

  function syncBuffered() {
    const maximum = Number.isFinite(video.duration) ? video.duration : Number(progress.max);
    setBufferedRanges(progress, video, maximum);
  }

  function syncDuration() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    progress.max = String(video.duration);
    duration.textContent = formatTime(video.duration);
    syncTime();
    syncBuffered();
  }

  function syncVolume() {
    const muted = video.muted || video.volume === 0;
    const level = volumeLevel(video.volume, muted);
    player.dataset.silVideoMuted = muted ? 'true' : 'false';
    player.dataset.silVideoVolumeLevel = level;
    mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
    mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
    volume.value = String(video.muted ? 0 : video.volume);
    setRangeFill(volume, Number(volume.value), 1);
  }

  function syncRepeat() {
    repeat.setAttribute('aria-pressed', video.loop ? 'true' : 'false');
    repeat.setAttribute('aria-label', video.loop ? '循环播放' : '播放一次');
    player.dataset.silVideoLoop = video.loop ? 'true' : 'false';
  }

  function syncFullscreen() {
    const active = fullscreenActive();
    player.dataset.silVideoFullscreen = active ? 'true' : 'false';
    fullscreen.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    if (active) {
      wasFullscreen = true;
      focusWithoutScroll(stage);
      lockLandscape();
      scheduleFullscreenUiHide();
    } else {
      clearFullscreenUiTimer();
      delete stage.dataset.silVideoUiHidden;
      if (wasFullscreen) {
        wasFullscreen = false;
        unlockOrientation();
        focusWithoutScroll(player);
      }
    }
    window.requestAnimationFrame(() => {
      if (subtitleRenderer) subtitleRenderer.resize(true).catch(() => {});
    });
  }

  async function togglePlay(showPlayback = false) {
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      try {
        await video.play();
        setStatus();
        if (showPlayback) showPlaybackFeedback('play');
      } catch {
        setStatus('视频播放失败，请使用下载链接。', true);
      }
    } else {
      video.pause();
      if (showPlayback) showPlaybackFeedback('pause');
    }
  }

  async function toggleFullscreen() {
    if (fullscreenActive()) await document.exitFullscreen();
    else await stage.requestFullscreen();
  }

  function clearViewportClickTimer() {
    if (viewportClickTimer !== null) window.clearTimeout(viewportClickTimer);
    viewportClickTimer = null;
    viewportClickTouch = false;
    viewportClickWakeOnly = false;
  }

  function takeTouchTap(event) {
    const recent = recentTouchTap && Date.now() - recentTouchTap.time <= TOUCH_CLICK_FALLBACK_DELAY ? recentTouchTap : null;
    if (!recent) recentTouchTap = null;
    const touch = event.pointerType === 'touch' || Boolean(recent);
    if (!touch) return null;
    recentTouchTap = null;
    return {
      x: Number.isFinite(event.clientX) ? event.clientX : recent?.x || 0,
      uiWasHidden: recent?.uiWasHidden || false
    };
  }

  function handleViewportClick(event) {
    if (Date.now() < suppressViewportClickUntil) return;
    const touchTap = takeTouchTap(event);
    if (viewportClickTimer !== null) {
      const doubleTouch = viewportClickTouch && Boolean(touchTap);
      clearViewportClickTimer();
      if (doubleTouch) {
        if (!touchTap.uiWasHidden) focusWithoutScroll(stage);
        const bounds = viewport.getBoundingClientRect();
        seek(touchTap.x - bounds.left < bounds.width / 2 ? -TOUCH_DOUBLE_SEEK_SECONDS : TOUCH_DOUBLE_SEEK_SECONDS);
      } else {
        focusWithoutScroll(stage);
        toggleFullscreen();
      }
      return;
    }
    viewportClickTouch = Boolean(touchTap);
    viewportClickWakeOnly = Boolean(touchTap?.uiWasHidden && fullscreenActive());
    if (!viewportClickWakeOnly) focusWithoutScroll(stage);
    viewportClickTimer = window.setTimeout(() => {
      const wakeOnly = viewportClickWakeOnly;
      viewportClickTimer = null;
      viewportClickTouch = false;
      viewportClickWakeOnly = false;
      if (wakeOnly) {
        focusWithoutScroll(stage);
        showFullscreenUi();
      } else {
        togglePlay(true);
      }
    }, VIEWPORT_CLICK_DELAY);
  }

  function showFeedback(kind, message, delay = FEEDBACK_HIDE_DELAY, label = '') {
    if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    feedback.dataset.silVideoFeedbackKind = kind;
    feedback.dataset.silVideoFeedbackVisible = 'true';
    feedbackText.textContent = message;
    if (label) feedback.setAttribute('aria-label', label);
    else feedback.removeAttribute('aria-label');
    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      delete feedback.dataset.silVideoFeedbackVisible;
    }, delay);
  }

  function showPlaybackFeedback(action) {
    const playing = action === 'play';
    showFeedback(`playback-${action}`, '', PLAYBACK_FEEDBACK_HIDE_DELAY, playing ? '播放' : '暂停');
  }

  function showVolumeFeedback() {
    const effectiveVolume = video.muted ? 0 : video.volume;
    showFeedback('volume', `${Math.round(effectiveVolume * 100)}%`);
  }

  function showProgressFeedback(position = video.currentTime) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    showFeedback('progress', `${formatTime(position)}/${formatTime(video.duration)}`);
  }

  function setBrightness(value, announce = true) {
    brightness = clamp(value, 0, 2);
    mediaLayer.style.setProperty('--sil-video-brightness', String(brightness));
    if (announce) showFeedback('brightness', `${Math.round(brightness * 100)}%`);
  }

  function toggleMute() {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = Math.max(0.05, lastVolume || 0.8);
    } else {
      lastVolume = video.volume;
      video.muted = true;
    }
    showVolumeFeedback();
  }

  function adjustVolume(delta) {
    if (delta > 0 && video.muted) video.muted = false;
    video.volume = Math.max(0, Math.min(1, video.volume + delta));
    if (video.volume > 0) lastVolume = video.volume;
    video.muted = video.volume === 0;
    showVolumeFeedback();
  }

  function setGestureVolume(value) {
    video.volume = clamp(value, 0, 1);
    video.muted = video.volume === 0;
    if (video.volume > 0) lastVolume = video.volume;
    syncVolume();
    showVolumeFeedback();
  }

  function seek(delta) {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    syncTime();
    showProgressFeedback();
  }

  function pointerIsPrimaryTouch(event) {
    return event.pointerType === 'touch' && event.isPrimary !== false;
  }

  function startGesture(event) {
    if (!pointerIsPrimaryTouch(event)) {
      recentTouchTap = null;
      return;
    }
    if (gesture) return;
    recentTouchTap = null;
    const bounds = viewport.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    gesture = {
      pointerId: event.pointerId,
      bounds,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      targetTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      startVolume: video.muted ? 0 : video.volume,
      startBrightness: brightness,
      uiWasHidden: fullscreenActive() && stage.dataset.silVideoUiHidden === 'true',
      mode: ''
    };
    try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || !pointerIsPrimaryTouch(event)) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.mode) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < TOUCH_GESTURE_THRESHOLD) return;
      gesture.mode = Math.abs(deltaX) >= Math.abs(deltaY)
        ? 'progress'
        : gesture.startX - gesture.bounds.left < gesture.bounds.width / 2 ? 'brightness' : 'volume';
      clearViewportClickTimer();
      suppressViewportClickUntil = Date.now() + GESTURE_CLICK_SUPPRESS_DELAY;
    }
    if (event.cancelable) event.preventDefault();
    if (gesture.mode === 'progress') {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      gesture.targetTime = clamp(gesture.startTime + deltaX / gesture.bounds.width * TOUCH_SEEK_SECONDS, 0, video.duration);
      showProgressFeedback(gesture.targetTime);
    } else if (gesture.mode === 'brightness') {
      setBrightness(gesture.startBrightness - deltaY / gesture.bounds.height * 2);
    } else if (gesture.mode === 'volume') {
      setGestureVolume(gesture.startVolume - deltaY / gesture.bounds.height);
    }
  }

  function finishGesture(event, commit) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    try { viewport.releasePointerCapture(completed.pointerId); } catch { /* Pointer capture may already be lost. */ }
    if (!completed.mode) {
      recentTouchTap = { time: Date.now(), x: event.clientX, uiWasHidden: completed.uiWasHidden };
      return;
    }
    suppressViewportClickUntil = Date.now() + GESTURE_CLICK_SUPPRESS_DELAY;
    if (commit && completed.mode === 'progress' && Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = completed.targetTime;
      syncTime();
      showProgressFeedback(completed.targetTime);
    }
  }

  function clearWheelResetTimer() {
    if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
    wheelResetTimer = null;
  }

  function scheduleWheelReset() {
    clearWheelResetTimer();
    wheelResetTimer = window.setTimeout(() => {
      wheelResetTimer = null;
      wheelPixelDelta = 0;
    }, WHEEL_RESET_DELAY);
  }

  function handleWheel(event) {
    if (!shortcutSurfaceFocused() || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    let steps = 0;
    if (event.deltaMode === 0) {
      wheelPixelDelta += event.deltaY;
      steps = Math.trunc(wheelPixelDelta / WHEEL_PIXEL_STEP);
      wheelPixelDelta -= steps * WHEEL_PIXEL_STEP;
      scheduleWheelReset();
    } else {
      clearWheelResetTimer();
      wheelPixelDelta = 0;
      steps = Math.sign(event.deltaY);
    }
    if (steps !== 0) adjustVolume(-steps * 0.05);
  }

  function handleStagePointerActivity(event) {
    const pendingHiddenTouchTap = pointerIsPrimaryTouch(event) && gesture && gesture.pointerId === event.pointerId && gesture.uiWasHidden && !gesture.mode;
    if (!pendingHiddenTouchTap) showFullscreenUi();
  }

  function setVolumeOpen(open) {
    if (volumeCloseTimer !== null) window.clearTimeout(volumeCloseTimer);
    volumeCloseTimer = null;
    player.dataset.silVideoVolumeOpen = open ? 'true' : 'false';
    showFullscreenUi();
  }

  function scheduleVolumeClose() {
    if (volumeCloseTimer !== null) window.clearTimeout(volumeCloseTimer);
    volumeCloseTimer = window.setTimeout(() => {
      volumeCloseTimer = null;
      const focused = document.activeElement;
      const keyboardFocused = focused && volumeControl.contains(focused) && focused.matches(':focus-visible');
      if (!keyboardFocused) setVolumeOpen(false);
    }, VOLUME_CLOSE_DELAY);
  }

  function setSubtitleMenuOpen(open) {
    subtitleMenu.hidden = !open;
    subtitles.setAttribute('aria-expanded', open ? 'true' : 'false');
    showFullscreenUi();
  }

  function syncSubtitleButtons() {
    subtitleMenu.querySelectorAll('[data-sil-video-track]').forEach(button => {
      button.setAttribute('aria-checked', Number(button.dataset.silVideoTrack) === selectedSubtitle ? 'true' : 'false');
    });
    subtitles.setAttribute('aria-pressed', selectedSubtitle >= 0 ? 'true' : 'false');
  }

  async function subtitleText(track, signal) {
    const response = await fetch(track.url, { signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`字幕请求返回 ${response.status}`);
    const bytes = await response.arrayBuffer();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    return track.format === 'srt' ? subsrt.convert(source, { from: 'srt', to: 'ass' }) : source;
  }

  async function selectSubtitle(index) {
    const token = ++subtitleToken;
    subtitleAbort?.abort();
    subtitleAbort = new AbortController();
    setSubtitleMenuOpen(false);
    if (index < 0) {
      selectedSubtitle = -1;
      syncSubtitleButtons();
      if (subtitleRenderer) {
        try {
          await subtitleRenderer.ready;
          await subtitleRenderer.renderer.freeTrack();
        } catch {
          // A failed renderer is already reported when it is created.
        }
      }
      setStatus();
      return;
    }
    const track = model.subtitles[index];
    if (!track) return;
    setStatus(`正在加载${track.label}字幕…`);
    try {
      const content = await subtitleText(track, subtitleAbort.signal);
      if (token !== subtitleToken) return;
      if (subtitleRenderer) {
        await subtitleRenderer.ready;
        await subtitleRenderer.renderer.setTrack(content);
      } else {
        const availableFonts = { 'liberation sans': model.runtime.defaultFont, ...(model.fonts || {}) };
        subtitleRenderer = new JASSUB({
          video,
          subContent: content,
          workerUrl: model.runtime.worker,
          wasmUrl: model.runtime.wasm,
          modernWasmUrl: model.runtime.modernWasm,
          availableFonts,
          defaultFont: model.fallbackFont || 'liberation sans',
          queryFonts: false
        });
        await subtitleRenderer.ready;
      }
      if (token !== subtitleToken) return;
      selectedSubtitle = index;
      syncSubtitleButtons();
      setStatus();
    } catch (error) {
      if (error.name === 'AbortError' || token !== subtitleToken) return;
      selectedSubtitle = -1;
      syncSubtitleButtons();
      setStatus(`字幕加载失败：${error.message}`, true);
    }
  }

  function buildSubtitleMenu() {
    subtitleMenu.replaceChildren();
    const tracks = Array.isArray(model.subtitles) ? model.subtitles : [];
    const choices = [{ label: '关闭字幕', index: -1 }, ...tracks.map((track, index) => ({ label: track.label, index, lang: track.srclang }))];
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sil-video-player__subtitle-option';
      button.dataset.silVideoTrack = String(choice.index);
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', choice.index === -1 ? 'true' : 'false');
      if (choice.lang) button.lang = choice.lang;
      button.textContent = choice.label;
      listen(button, 'click', () => selectSubtitle(choice.index));
      subtitleMenu.append(button);
    }
    subtitles.disabled = tracks.length === 0;
    const defaultIndex = tracks.findIndex(track => track.default);
    if (defaultIndex >= 0) selectSubtitle(defaultIndex);
  }

  listen(play, 'click', () => togglePlay());
  listen(viewport, 'click', handleViewportClick);
  listen(viewport, 'dblclick', event => event.preventDefault());
  listen(viewport, 'pointerdown', startGesture);
  listen(viewport, 'pointermove', moveGesture);
  listen(viewport, 'pointerup', event => finishGesture(event, true));
  listen(viewport, 'pointercancel', event => finishGesture(event, false));
  listen(viewport, 'lostpointercapture', event => finishGesture(event, false));
  listen(viewport, 'wheel', handleWheel, { passive: false });
  listen(mute, 'click', event => {
    if (event.pointerType === 'touch') setVolumeOpen(player.dataset.silVideoVolumeOpen !== 'true');
    toggleMute();
  });
  listen(volumeControl, 'pointerenter', () => setVolumeOpen(true));
  listen(volumeControl, 'pointerleave', event => { if (event.pointerType !== 'touch') scheduleVolumeClose(); });
  listen(volumeControl, 'focusin', () => setVolumeOpen(true));
  listen(volumeControl, 'focusout', event => { if (!volumeControl.contains(event.relatedTarget)) scheduleVolumeClose(); });
  listen(volume, 'input', () => {
    setVolumeOpen(true);
    video.muted = false;
    video.volume = Number(volume.value);
    if (video.volume > 0) lastVolume = video.volume;
    showVolumeFeedback();
  });
  listen(progress, 'input', () => {
    if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, Number(progress.value)));
    syncTime();
    showProgressFeedback();
  });
  listen(rate, 'click', () => {
    const index = rates.findIndex(value => Math.abs(value - video.playbackRate) < 0.001);
    video.playbackRate = rates[(index + 1) % rates.length];
    rate.textContent = `${video.playbackRate}×`;
    rate.setAttribute('aria-label', `播放速度 ${video.playbackRate} 倍`);
  });
  listen(repeat, 'click', () => { video.loop = !video.loop; syncRepeat(); });
  listen(subtitles, 'click', () => setSubtitleMenuOpen(subtitleMenu.hidden));
  listen(subtitleMenu, 'keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setSubtitleMenuOpen(false);
    subtitles.focus();
  });
  listen(fullscreen, 'click', toggleFullscreen);
  listen(stage, 'pointermove', handleStagePointerActivity);
  listen(stage, 'pointerdown', handleStagePointerActivity);
  listen(stage, 'focusin', showFullscreenUi);
  listen(document, 'pointerdown', event => {
    if (player.dataset.silVideoVolumeOpen === 'true' && !volumeControl.contains(event.target)) setVolumeOpen(false);
  });
  listen(player, 'keydown', event => {
    if (fullscreenActive()) showFullscreenUi();
    const shortcutTarget = event.target === player || event.target === stage || event.target === video || event.target === viewport;
    if (!shortcutTarget) return;
    const key = event.key.toLowerCase();
    if (event.key === ' ' || key === 'spacebar') {
      event.preventDefault();
      togglePlay();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!fullscreenActive()) toggleFullscreen();
    } else if (event.key === 'Escape') {
      if (fullscreenActive()) document.exitFullscreen();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustVolume(0.05);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustVolume(-0.05);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(-5);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(5);
    } else if (key === 'm') {
      event.preventDefault();
      toggleMute();
    }
  });
  listen(video, 'loadstart', () => {
    progress.style.removeProperty('--sil-video-range-buffered');
    setStatus('正在加载视频…');
  });
  listen(video, 'emptied', () => progress.style.removeProperty('--sil-video-range-buffered'));
  listen(video, 'loadedmetadata', () => { syncDuration(); setStatus(); });
  listen(video, 'durationchange', syncDuration);
  listen(video, 'progress', syncBuffered);
  listen(video, 'canplay', syncBuffered);
  listen(video, 'canplaythrough', syncBuffered);
  listen(video, 'suspend', syncBuffered);
  listen(video, 'timeupdate', syncTime);
  listen(video, 'play', syncPlaying);
  listen(video, 'pause', syncPlaying);
  listen(video, 'ended', syncPlaying);
  listen(video, 'volumechange', syncVolume);
  listen(video, 'error', () => setStatus('视频加载失败，请使用下载链接。', true));
  listen(document, 'fullscreenchange', syncFullscreen);

  video.controls = false;
  player.dataset.silVideoReady = 'true';
  player.dataset.silVideoEnhanced = 'true';
  buildSubtitleMenu();
  syncPlaying();
  syncTime();
  syncDuration();
  syncVolume();
  setBrightness(1, false);
  syncRepeat();
  syncFullscreen();

  instances.set(player, {
    refreshTheme() { player.dataset.silVideoTheme = isDarkTheme() ? 'dark' : 'light'; },
    async destroy() {
      subtitleToken += 1;
      subtitleAbort?.abort();
      if (volumeCloseTimer !== null) window.clearTimeout(volumeCloseTimer);
      clearViewportClickTimer();
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      clearWheelResetTimer();
      clearFullscreenUiTimer();
      for (const cleanup of cleanups) cleanup();
      if (subtitleRenderer) {
        try { await subtitleRenderer.destroy(); } catch { /* The page is already being discarded. */ }
      }
      instances.delete(player);
    }
  });
  instances.get(player).refreshTheme();
}

function refresh() {
  document.querySelectorAll(selector).forEach(player => {
    initialise(player);
    instances.get(player)?.refreshTheme();
  });
}

function destroyRemoved(node) {
  if (!(node instanceof Element)) return;
  const players = node.matches(selector) ? [node] : Array.from(node.querySelectorAll(selector));
  for (const player of players) instances.get(player)?.destroy();
}

function observeMutations(records) {
  let added = false;
  for (const record of records) {
    for (const node of record.removedNodes) destroyRemoved(node);
    if (Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches(selector) || node.querySelector(selector)))) added = true;
  }
  if (added) refresh();
}

window.addEventListener('resize', refresh);
document.addEventListener('inside', refresh);
document.addEventListener('inside:theme', refresh);
new MutationObserver(observeMutations).observe(document.body, { childList: true, subtree: true });
refresh();
