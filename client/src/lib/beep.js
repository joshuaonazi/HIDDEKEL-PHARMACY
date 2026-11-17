// Short audio feedback for scans (high = added, low = problem). Cashiers can mute it from the sales screen.
let ctx
export const soundEnabled = () => localStorage.getItem('hp_sound') !== 'off'
export const setSoundEnabled = (on) => localStorage.setItem('hp_sound', on ? 'on' : 'off')

export function beep(kind = 'ok') {
  if (!soundEnabled()) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = kind === 'ok' ? 880 : 220
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (kind === 'ok' ? 0.08 : 0.25))
  } catch {
    // Audio is optional; ignore any browser restriction
  }
}
