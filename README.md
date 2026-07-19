# 寂 JI — Studio

A browser-based DAW with a zen-minimal dark aesthetic, fusing the workflows of
FL Studio (channel rack, step sequencer, piano roll, patterns), Ableton Live
(session clip grid, quantized launching, racks of effects) and Logic
(arrangement timeline, automation, full mixer with sends and buses).

No dependencies, no build step, 100% Web Audio API. Every built-in sample is
synthesized procedurally at load time — the whole pack is original and
royalty-free.

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(any static file server works — ES modules just need to be served over HTTP)

## Views

| View | Lineage | What it does |
|---|---|---|
| **RACK** | FL Studio | Channel rack + step sequencer. Click steps to place hits, drag to paint, scroll-wheel a lit step to set velocity. Click a channel name to open its instrument. Right-click a name to delete. `▸n` cycles the channel's mixer track. |
| **PIANO ROLL** | FL Studio | Click-drag to draw notes, drag to move, drag the right edge to resize, right-click to delete. Snap, scale highlighting (major/minor/pentatonic/dorian + root), velocity lane below. |
| **SESSION** | Ableton Live | 8 slots × 6 scenes. Right-click a cell to assign a pattern, click to launch (quantized to the next bar), `▸` launches a whole scene, `■` stops. |
| **ARRANGE** | Logic | Drop patterns onto 8 lanes of a 64-bar timeline. Drag to move, right edge to loop-extend, right-click to delete. Automation lanes for any mixer volume/pan — click to add points, right-click to remove. |
| **MIXER** | Logic | 10 insert tracks + 2 return buses (reverb / delay) + master. Per strip: insert chain, send knobs, pan, fader, peak meter, mute/solo. Master ships with a limiter. |

## Instruments (few but deep)

- **SUB** — subtractive poly: 2 osc, up to 7-voice unison detune, resonant filter with envelope, full ADSR
- **FM** — 2-modulator FM with mod-envelope decay (e-pianos, bells, metallic plucks)
- **808** — sine bass with pitch punch, glide between notes, drive, sub oscillator
- **SMP** — pitched sampler (root note, start offset, loop, filter)
- **DRM** — one-shot drum channel (pitch, decay choke)

Presets for all of them live in the browser sidebar — click to add as a channel.

## Effects

EQ-3 · Compressor · Convolution reverb · Tempo-synced delay · Saturation ·
Chorus · Limiter · **Autofilter + LFO** · **Gate/Stutter** (Gross-Beat-style,
phase-locked to the transport) · **Pump** (one-knob sidechain) · **OTT-style
multiband**.

## Samples

18 procedurally synthesized one-shots (kicks, snares, claps, 6-oscillator
metallic hats, toms, Karplus–Strong koto plucks, risers, impacts, vinyl
crackle). Drag and drop your own audio files onto the sidebar to import.

## Transport & saving

- `Space` play/stop · `Z–M` rows play the selected channel (`[` `]` shift octave)
- **PAT** loops the current pattern, **SONG** plays the arrangement; launching a
  session cell switches to session mode
- Auto-saves to the browser every few seconds; **SAVE/OPEN** for `.jiproj`
  files; **EXPORT WAV** renders the arrangement offline to a 16-bit WAV
