(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const track = $('film-track');
  if (!track) return;
  const cards = [...track.querySelectorAll('.film-card')];
  if (!cards.length) return;
  const pages = [...document.querySelectorAll('[data-film-page]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // A second copy lets the last poster glide into the first without a rewind.
  // Copies retain the public destinations but stay out of the reading/tab order.
  const copies = cards.map((card, index) => {
    const copy = card.cloneNode(true);
    copy.classList.add('film-copy-card');
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    copy.dataset.originalIndex = String(index);
    track.appendChild(copy);
    return copy;
  });
  let playing = false, hovering = false, focused = false, inView = true;
  let frame = 0, previousTime = null, position = track.scrollLeft, cycle = 0, offsets = [], index = -1;
  let navigation = null, reducedElapsed = 0;
  const normalize = value => cycle ? ((value % cycle) + cycle) % cycle : 0;
  const blocked = () => document.visibilityState !== 'visible' || !inView ||
    !$('overview').classList.contains('active') || hovering || focused;

  function updateStatus() {
    const left = normalize(position);
    let current = offsets.length - 1;
    while (current > 0 && offsets[current] > left + 1) current--;
    if (current === index) return;
    index = current;
    $('film-status').textContent = `${index + 1} / ${cards.length}`;
    pages.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.filmPage) === Math.floor(index / 10))));
    // Warm the next posters before they enter the viewport.
    for (let ahead = 0; ahead < 3; ahead++) {
      const next = (index + ahead) % cards.length;
      for (const card of [cards[next], copies[next]]) {
        const image = card.querySelector('img');
        if (image) image.loading = 'eager';
      }
    }
  }

  function measure() {
    const fraction = cycle ? normalize(position) / cycle : 0;
    const origin = cards[0].offsetLeft;
    offsets = cards.map(card => card.offsetLeft - origin);
    cycle = copies[0].offsetLeft - origin;
    position = fraction * cycle;
    navigation = null;
    track.classList.remove('is-moving');
    track.scrollLeft = position;
    index = -1;
    updateStatus();
  }

  function writePosition(value) {
    position = normalize(value);
    track.scrollLeft = position;
    updateStatus();
  }

  function schedule() {
    if (!frame && document.visibilityState === 'visible' && inView && $('overview').classList.contains('active') &&
      (navigation || playing && !hovering && !focused)) frame = requestAnimationFrame(tick);
  }

  function tick(time) {
    frame = 0;
    const elapsed = previousTime === null ? 0 : Math.max(0, Math.min(64, time - previousTime));
    previousTime = time;
    if (navigation) {
      navigation.elapsed += elapsed;
      const progress = Math.min(1, navigation.elapsed / navigation.duration);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      writePosition(navigation.from + (navigation.to - navigation.from) * eased);
      if (progress === 1) { navigation = null; track.classList.remove('is-moving'); }
    } else if (playing && !blocked()) {
      if (motion.matches) {
        reducedElapsed += elapsed;
        if (reducedElapsed >= 4800) { reducedElapsed = 0; writePosition(offsets[(index + 1) % cards.length]); }
      } else writePosition(position + 32 * elapsed / 1000);
    }
    schedule();
  }

  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }

  function setPlaying(value) {
    playing = value;
    track.classList.toggle('is-playing', playing && !motion.matches);
    $('film-toggle').textContent = playing ? 'Pause' : 'Play';
    $('film-toggle').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} course strip`);
    $('film-toggle').setAttribute('aria-pressed', String(playing));
    $('film-status').setAttribute('aria-live', playing ? 'off' : 'polite');
    stopFrame();
    schedule();
  }

  function move(target, direction = 0) {
    setPlaying(false);
    navigation = null;
    const next = (target + cards.length) % cards.length;
    let from = normalize(track.scrollLeft), to = offsets[next];
    if (direction > 0 && to < from) to += cycle;
    if (direction < 0 && to > from) from += cycle;
    if (motion.matches) writePosition(to);
    else {
      track.classList.add('is-moving');
      navigation = { from, to, elapsed: 0, duration: 650 };
      schedule();
    }
  }

  function userScroll() {
    navigation = null;
    track.classList.remove('is-moving');
    setPlaying(false);
  }

  $('film-prev').addEventListener('click', () => move(index - 1, -1));
  $('film-next').addEventListener('click', () => move(index + 1, 1));
  $('film-toggle').addEventListener('click', () => {
    navigation = null;
    track.classList.remove('is-moving');
    position = normalize(track.scrollLeft);
    setPlaying(!playing);
  });
  pages.forEach(button => button.addEventListener('click', () => move(Number(button.dataset.filmPage) * 10)));
  track.addEventListener('pointerenter', () => { hovering = true; stopFrame(); });
  track.addEventListener('pointerleave', () => { hovering = false; schedule(); });
  track.addEventListener('focusin', event => {
    focused = true;
    stopFrame();
    const copy = event.target.closest('.film-copy-card');
    if (copy) {
      const original = Number(copy.dataset.originalIndex);
      navigation = null;
      track.classList.remove('is-moving');
      writePosition(offsets[original]);
      cards[original].focus({ preventScroll: true });
    }
  });
  track.addEventListener('focusout', event => {
    if (!track.contains(event.relatedTarget)) { focused = false; previousTime = null; schedule(); }
  });
  track.addEventListener('pointerdown', userScroll, { passive: true });
  track.addEventListener('wheel', userScroll, { passive: true });
  track.addEventListener('scroll', () => {
    if (navigation || playing && !blocked()) return;
    position = normalize(track.scrollLeft);
    updateStatus();
  }, { passive: true });
  track.addEventListener('keydown', event => {
    const targets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: cards.length - 1 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    move(targets[event.key], event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0);
  });
  const restart = () => { stopFrame(); schedule(); };
  document.addEventListener('visibilitychange', restart);
  window.addEventListener('hashchange', restart);
  window.addEventListener('pageshow', restart);
  window.addEventListener('resize', () => { stopFrame(); measure(); schedule(); });
  motion.addEventListener?.('change', () => { navigation = null; track.classList.remove('is-moving'); reducedElapsed = 0; setPlaying(playing); });
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    restart();
  }).observe(track);
  measure();
  setPlaying(false);
})();
