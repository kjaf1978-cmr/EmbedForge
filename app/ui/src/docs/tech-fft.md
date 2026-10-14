# Technical reference: FFT and harmonics

The **FFT** button of the waveform viewer shows the spectrum of a transient over the visible
range, with the strongest component of each trace and its total harmonic distortion (THD).
Source: `sim/fft.ts`; display: `components/schematic/Plot.tsx`.

## 1. The discrete Fourier transform

A signal x(t) over a time T, sampled at N even instants t_n = n·T/N, has the discrete Fourier
transform

    X[k] = Σ_{n=0}^{N−1} x[n]·w[n]·e^(−j·2π·k·n/N)        k = 0 … N/2

Bin k stands for the frequency f_k = k/T; the bins are Δf = 1/T apart (the *resolution*), and the
highest frequency is the Nyquist frequency N/(2T). A sine of amplitude A at a bin frequency
gives |X[k]| = A·N·G/2, where G is the window's coherent gain (the average of w). The app shows
peak amplitudes,

    A_k = 2·|X[k]| / (N·G)

in dBV (0 dBV = 1 V) or dBA.

## 2. The fast Fourier transform

The FFT computes the same X[k] in O(N·log N) operations instead of O(N²): the radix-2
Cooley–Tukey algorithm splits a transform of length N into two of length N/2 (even and odd
samples) and combines them with "butterflies" X[a] = E + W·O, X[b] = E − W·O, where
W = e^(−j·2π·k/len) is the twiddle factor. log₂N stages of N/2 butterflies give the result; the
samples are first put in bit-reversed order so the butterflies work in place.

@code sim/fft.ts fft

## 3. Window

The DFT treats the record as one period of a periodic signal. When the visible range is not a
whole number of periods, the jump at the record's ends spreads energy over all frequencies
(*leakage*). A window w[n] tapers the record to zero at both ends. The app uses the **Hann
window**

    w[n] = 0.5 − 0.5·cos(2π·n/N)          coherent gain G = 0.5

whose main lobe is ±2 bins wide and whose side lobes fall by 18 dB per octave (first side lobe
−31 dB). A tone then occupies about five bins.

## 4. Sampling the waveform

The simulator's time points are not evenly spaced, so the waveform is sampled at N even instants
over the visible range by linear interpolation between its points. N is a power of two at least
twice the number of waveform points in view (8192 to 2²⁰), so the FFT is finer than the waveform
itself and no detail is lost. If the waveform holds more points than 2²⁰/2, each sample is the
*average* of the waveform over its interval (from the waveform's running integral) instead of a
point value. That acts as an anti-alias filter: frequencies above the Nyquist frequency are
attenuated instead of folding back into the spectrum.

@code sim/fft.ts spectrum

## 5. Amplitude and frequency of a component

A tone exactly on a bin appears in that bin with its full amplitude. A tone between two bins is
split over the main lobe; its highest bin is up to 1.42 dB low (*scalloping loss* of the Hann
window), and the bin frequency is up to Δf/2 off. The app therefore measures each component over
the main lobe (±2 bins around its peak):

- **amplitude** from the energy of the lobe. For the Hann window, the sum of the squared bin
  amplitudes of a tone of amplitude A is 1.5·A², wherever the tone lies between the bins, so
  A = √(Σ A_k² / 1.5);
- **frequency** as the centre of the lobe, weighted by energy: f = Σ f_k·A_k² / Σ A_k².

@code sim/fft.ts component

## 6. Total harmonic distortion

THD compares the harmonics of the strongest component (the fundamental, at f₁) with the
fundamental itself:

    THD = √(A₂² + A₃² + … + A₁₀²) / A₁ · 100 %

Each harmonic h is looked up at h·f₁ (from the measured fundamental frequency, not the nearest
bin) and measured over its main lobe like the fundamental. Harmonics above 10 and components
that are not harmonics (noise, other tones) are not included.

@code sim/fft.ts thd

## 7. Accuracy and limits

Measured on exact signals and against ngspice (see [Verification](#doc:tech-verification)):

| Property | Result |
|---|---|
| amplitude, tone on or between bins | within 0.01 dB |
| frequency of a tone between bins | within a small fraction of a bin (1050 Hz → 1050.1 Hz at 100 Hz bins) |
| square-wave harmonics 4/(π·n) | within 0.001 dB |
| a tone 40 dB below another | −40.00 dB; leakage floor about −120 dB |
| harmonics of a clipped sine against ngspice's FFT | within 0.01 dB |

Limits:

- **Resolution** Δf = 1/T: two tones closer than about 2Δf are not separated. Show more periods
  for a finer resolution.
- **Short records:** with only a few periods in view, the leakage of a tone that is not a whole
  number of periods reaches the harmonic positions; for 10.5 periods a pure sine shows about
  0.06 % THD. With 20 or more periods it is below 0.01 %.
- **The waveform's own resolution:** the FFT cannot show more than the simulation computed. For
  harmonics up to a frequency f, use a time step below 1/(20·f).
- **Transient start:** include only the settled part of the waveform (zoom in before pressing
  FFT); a start-up transient adds a spread of low frequencies.
