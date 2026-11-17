// Riquadro in cui gira la pagina originale di un modulo (servita da /pagine/<modulo>/index.html).
export function Riquadro({ modulo, titolo, alto = 0 }: { modulo: string; titolo: string; alto?: number }) {
  return (
    <iframe src={`/pagine/${modulo}/index.html`} title={titolo}
      style={{ width: "100%", height: `calc(100vh - ${56 + alto}px)`, border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
