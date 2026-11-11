/**
 * Tono de campanita (dos notas ascendentes, suaves, de menos de 1.5 s), generado
 * con Web Audio: no necesita archivo de audio. Los navegadores solo dejan sonar
 * después de que la persona toca la pantalla al menos una vez (unlockAudio).
 */
let ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function note(c, freq, start, dur, vol) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  gain.connect(c.destination);

  const body = c.createOscillator(); // tono principal, redondo
  body.type = 'sine';
  body.frequency.value = freq;
  body.connect(gain);

  const shimmer = c.createOscillator(); // armónico suave que da el brillo de "campana"
  shimmer.type = 'triangle';
  shimmer.frequency.value = freq * 2;
  const shimmerGain = c.createGain();
  shimmerGain.gain.value = 0.12;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(gain);

  [body, shimmer].forEach((o) => { o.start(start); o.stop(start + dur + 0.05); });
}

/** urgent = el mismo "ding-dong" dos veces y vibración más marcada. */
export function playChime({ urgent = false, volume = 0.3 } = {}) {
  const c = getCtx();
  if (c) {
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime + 0.02;
    const reps = urgent ? 2 : 1;
    for (let i = 0; i < reps; i += 1) {
      const t = t0 + i * 1.15;
      note(c, 659.25, t, 0.9, volume); // mi
      note(c, 830.61, t + 0.2, 1.2, volume); // sol sostenido
    }
  }
  try { if (navigator.vibrate) navigator.vibrate(urgent ? [150, 80, 150, 80, 150] : [120, 60, 120]); } catch { /* sin vibración */ }
}
