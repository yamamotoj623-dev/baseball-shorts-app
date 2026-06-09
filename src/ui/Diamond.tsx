interface Props {
  /** [一塁, 二塁, 三塁] に走者がいるか */
  bases: [boolean, boolean, boolean];
  outs: number;
  /** [ボール, ストライク]。打席進行中以外は undefined */
  count?: [number, number];
}

/** 塁状況 + BSO カウントのスコアボード風ビジュアル */
export function Diamond({ bases, outs, count }: Props) {
  const [first, second, third] = bases;
  const balls = count?.[0] ?? 0;
  const strikes = count?.[1] ?? 0;
  return (
    <div className="diamond">
      <div className="diamond__field">
        <span className={`base base--second ${second ? 'base--on' : ''}`} />
        <span className={`base base--third ${third ? 'base--on' : ''}`} />
        <span className={`base base--first ${first ? 'base--on' : ''}`} />
        <span className="base base--home" />
      </div>
      <div className="bso">
        <LampRow label="B" max={3} lit={balls} color="ball" />
        <LampRow label="S" max={2} lit={strikes} color="strike" />
        <LampRow label="O" max={2} lit={Math.min(outs, 2)} color="out" />
      </div>
    </div>
  );
}

function LampRow({ label, max, lit, color }: { label: string; max: number; lit: number; color: string }) {
  return (
    <div className="bso__row">
      <span className="bso__label">{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`lamp lamp--${color} ${i < lit ? 'lamp--on' : ''}`} />
      ))}
    </div>
  );
}
