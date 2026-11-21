import type uPlot from 'uplot';
import { LINK_TIMEOUT_MS, RSSI_WEAK_DBM, TIP_OVER_ANGLE_DEG, VBAT_CRITICAL_V, VBAT_FULL_V, VBAT_WARN_V } from '../../config/tasa';
import { deriveAnchorState, tiltFromAcc } from '../../domain/anchorState';
import { pusherBit } from '../../protocol/anchorFrames';
import { anchor, connectSource, isSimulated, useApp } from '../../store/app';
import { isWebBluetoothSupported } from '../../transport/Transport';
import { Icon, Status } from '../components/Icon';
import { Readout } from '../components/Readout';
import { axisStyle, cssVar, UPlotChart } from '../components/UPlotChart';
import { axisValues, fmt, fmtAge } from '../format';
import { useNow, useResolvedTheme } from '../hooks';
import { AnchorSimControls } from './AnchorSimControls';
import { AnchorTopView, PUSHER_POS_LABEL } from './AnchorTopView';
import { TiltGauge } from './TiltGauge';

const toneOf = (code: string): 'good' | 'warn' | 'crit' | undefined => {
  if (code === 'TRIGGERED') return 'good';
  if (code === 'PARTIAL' || code === 'UNDETERMINED') return 'crit';
  if (code === 'ARMED' || code === 'ARMED_PIN') return 'warn';
  return undefined;
};

function AccelChart() {
  const theme = useResolvedTheme();
  return (
    <UPlotChart
      ariaLabel="Przyspieszenie osiowe na żywo, ostatnie 10 s"
      height={170}
      deps={[theme]}
      version={() => anchor.liveVersion}
      getData={() => {
        const t = anchor.liveT;
        const last = t.length ? t[t.length - 1] : 0;
        return [t.map((v) => v - last), anchor.liveAz] as uPlot.AlignedData;
      }}
      build={(width, height) => ({
        width,
        height,
        legend: { show: true, live: true },
        cursor: { y: false, drag: { x: false, y: false } },
        scales: { x: { time: false, range: [-10, 0] }, y: { auto: true, range: (_u, lo, hi) => [Math.min(-0.2, lo - 0.1), Math.max(1.4, hi + 0.1)] } },
        axes: [
          { ...axisStyle(), label: 'czas względem ostatniej ramki [s]', values: axisValues },
          { ...axisStyle(), label: 'a osiowe [g]', size: 52, values: axisValues },
        ],
        series: [
          { label: 't [s]', value: (_u, v) => (v === null ? '—' : fmt(v, 2)) },
          { label: 'a osiowe [g]', stroke: cssVar('--s1'), width: 2, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 3)) },
        ],
      })}
    />
  );
}

function NotConnected() {
  return (
    <div className="empty">
      <strong>Brak połączenia z modułem kotwicy</strong>
      <span>Moduł łączy się przez Bluetooth LE (XIAO ESP32-S3). Bez sprzętu użyj symulatora.</span>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={() => connectSource('anchor', 'simulator')}>
          Połącz z symulatorem
        </button>
        <button type="button" className="btn" disabled={!isWebBluetoothSupported()} onClick={() => connectSource('anchor', 'bluetooth')}>
          Połącz przez Bluetooth
        </button>
        <button type="button" className="btn ghost" onClick={() => useApp.getState().setTab('connections')}>
          Inne połączenia
        </button>
      </div>
    </div>
  );
}

export function AnchorPanel() {
  const now = useNow();
  const tel = anchor.tel;
  const age = anchor.telAt === null ? null : now - anchor.telAt;
  const st = deriveAnchorState(tel, age);
  const connected = anchor.status === 'connected' || anchor.status === 'connecting';
  const tone = st.stale ? undefined : toneOf(st.code);
  const tilt = tel ? (tel.tilt ?? (tel.acc ? tiltFromAcc(tel.acc) : null)) : null;
  const tiltSource = tel?.tilt !== null && tel?.tilt !== undefined ? 'z firmware' : 'z akcelerometru (statycznie)';
  const status = anchor.statusFrame;
  const frameAge = anchor.age(now);
  const vbat = status?.vbat ?? null;
  const vbatPct = vbat === null ? null : Math.max(0, Math.min(100, ((vbat - 3.3) / (VBAT_FULL_V - 3.3)) * 100));
  const tiltAlarm = tilt !== null && tilt >= TIP_OVER_ANGLE_DEG && !st.stale;

  return (
    <div className="grid anchor-layout">
      <section className="sheet state-block" data-tone={tone} data-stale={st.stale ? 'true' : 'false'} aria-live="polite">
        <div className="sheet-head">
          <h2>Stan kotwicy</h2>
          <span className="provenance">
            {tel ? `ramka #${tel.seq ?? '—'}, t µC ${fmt(tel.t_us / 1e6, 3)} s` : 'brak ramki telemetry'}
          </span>
        </div>
        {!connected && !tel ? (
          <NotConnected />
        ) : (
          <>
            {st.stale && tel && (
              <div className="stale-note">
                <Icon name="crit" /> Dane nieaktualne: ostatnia ramka {fmtAge(age)} temu (limit {LINK_TIMEOUT_MS} ms)
              </div>
            )}
            <div className="state-word">{st.label}</div>
            <p style={{ color: 'var(--ink-2)' }}>{st.reason}</p>
            {tiltAlarm && (
              <p>
                <Status tone="crit">Przechył {fmt(tilt, 1)}° przekracza kąt przewrócenia {fmt(TIP_OVER_ANGLE_DEG, 1)}°</Status>
              </p>
            )}
            <table className="pusher-table" aria-label="Czujniki Halla popychaczy">
              <thead>
                <tr>
                  <th>Popychacz</th>
                  <th>START</th>
                  <th>KONIEC</th>
                  <th>Położenie</th>
                </tr>
              </thead>
              <tbody>
                {st.pushers.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>P{i + 1}</td>
                    <td><span className="bit" data-on={tel ? String(pusherBit(tel.hs, i + 1)) : undefined}>{tel ? (pusherBit(tel.hs, i + 1) ? 1 : 0) : '–'}</span></td>
                    <td><span className="bit" data-on={tel ? String(pusherBit(tel.he, i + 1)) : undefined}>{tel ? (pusherBit(tel.he, i + 1) ? 1 : 0) : '–'}</span></td>
                    <td>
                      {tel ? (
                        p === 'fault' ? <Status tone="crit">błąd czujnika</Status> : st.notAtEnd.includes(i + 1) ? <Status tone="crit">{PUSHER_POS_LABEL[p]}, nie w KONIEC</Status> : PUSHER_POS_LABEL[p]
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 8 }}>
              Zawleczka: {st.pin === null ? 'moduł nie wysyła stanu (brak czujnika)' : st.pin === 1 ? 'obecna' : 'usunięta'}. Tarcza: {st.disk === null ? '—' : st.disk === 1 ? 'obrócona' : 'zamknięta'}.
            </p>
          </>
        )}
      </section>

      <section className="sheet" aria-label="Widok kotwicy z góry">
        <div className="sheet-head">
          <h2>Widok z góry</h2>
          <span className="provenance">schemat, odległości nie w skali</span>
        </div>
        <AnchorTopView st={st} hs={tel?.hs ?? null} he={tel?.he ?? null} />
        <div className="legend" style={{ marginTop: 8 }}>
          <span><i className="swatch" style={{ background: 'var(--ink)' }} /> popychacz w START (sprężyna napięta)</span>
          <span><i className="swatch" style={{ background: 'var(--s1)' }} /> w KONIEC</span>
          <span><i className="swatch" style={{ background: 'var(--warn)' }} /> położenie pośrednie</span>
          <span><i className="swatch" style={{ background: 'var(--crit)' }} /> błąd czujnika</span>
          <span><i className="swatch" style={{ borderRadius: 1, width: 6, height: 14, background: 'var(--ink)' }} /> czujnik Halla aktywny</span>
        </div>
        {isSimulated('anchor') && (
          <div style={{ marginTop: 12 }}>
            <AnchorSimControls compact />
          </div>
        )}
      </section>

      <section className="sheet" aria-label="IMU i łączność">
        <div className="sheet-head">
          <h2>IMU i łączność</h2>
          <span className="provenance">{anchor.hello ? `${anchor.hello.dev ?? 'moduł'}, fw ${anchor.hello.fw ?? '—'}` : 'brak ramki hello'}</span>
        </div>
        <AccelChart />
        <p className="chart-caption">Przyspieszenie osiowe z ramek telemetry ({anchor.hello?.tel_hz ?? '—'} Hz); szczyt przy kontakcie mierzy okno szybkie w panelu "Aktywacja".</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <TiltGauge tilt={tilt} stale={st.stale} source={tiltSource} />
          <div>
            <Status tone={tilt === null ? 'muted' : tiltAlarm ? 'crit' : 'good'}>
              {tilt === null ? 'przechył nieokreślony' : tiltAlarm ? 'alarm przechyłu' : 'przechył w normie'}
            </Status>
            <p className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 4 }}>Próg: kąt przewrócenia {fmt(TIP_OVER_ANGLE_DEG, 1)}°.</p>
          </div>
        </div>
        <div className="readouts" style={{ marginTop: 12 }}>
          <Readout
            label="Ostatnia ramka"
            value={fmtAge(frameAge)}
            tone={anchor.status === 'connected' && (frameAge === null || frameAge > LINK_TIMEOUT_MS) ? 'crit' : undefined}
            sub={frameAge !== null && frameAge > LINK_TIMEOUT_MS ? 'utrata łączności' : `limit ${LINK_TIMEOUT_MS} ms`}
          />
          <Readout
            label="Akumulator"
            value={fmt(vbat, 2)}
            unit="V"
            tone={vbat === null ? undefined : vbat <= VBAT_CRITICAL_V ? 'crit' : vbat <= VBAT_WARN_V ? 'warn' : undefined}
            sub={vbatPct === null ? 'brak ramki status' : (
              <span className="meter" data-tone={vbat! <= VBAT_CRITICAL_V ? 'crit' : vbat! <= VBAT_WARN_V ? 'warn' : undefined} style={{ display: 'block' }}>
                <i style={{ width: `${vbatPct}%` }} />
              </span>
            )}
          />
          <Readout
            label="Sygnał radiowy"
            value={status?.rssi ?? '—'}
            unit="dBm"
            tone={status?.rssi !== null && status?.rssi !== undefined && status.rssi < RSSI_WEAK_DBM ? 'warn' : undefined}
            sub={status?.rssi === null || status?.rssi === undefined ? 'moduł nie podaje RSSI' : status.rssi < RSSI_WEAK_DBM ? 'słaby sygnał' : 'pomiar modułu'}
          />
          <Readout label="Ramki / luki / błędy" value={`${anchor.frames} / ${anchor.seqGaps} / ${anchor.parseErrors}`} sub="luki z pola seq" />
        </div>
      </section>
    </div>
  );
}
