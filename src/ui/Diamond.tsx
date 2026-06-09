interface Props {
  /** [一塁, 二塁, 三塁] に走者がいるか */
  bases: [boolean, boolean, boolean];
  outs: number;
}

/** 塁状況とアウトカウントの簡易ビジュアル */
export function Diamond({ bases, outs }: Props) {
  const [first, second, third] = bases;
  return (
    <div className="diamond">
      <div className="diamond__field">
        <span className={`base base--second ${second ? 'base--on' : ''}`} />
        <span className={`base base--third ${third ? 'base--on' : ''}`} />
        <span className={`base base--first ${first ? 'base--on' : ''}`} />
        <span className="base base--home" />
      </div>
      <div className="outs">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`out ${i < outs ? 'out--on' : ''}`} />
        ))}
        <span className="outs__label">OUT</span>
      </div>
    </div>
  );
}
