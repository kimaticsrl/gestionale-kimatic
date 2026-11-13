// Finché il modulo non è stato attivato nel database (0024 e 0025), si continua a usare la versione su claude.ai.
export default function NonAttivo({ nome, link }: { nome: string; link: string | null }) {
  return (
    <>
      <header><h1>{nome}</h1></header>
      <div className="box">
        <h2>In arrivo nel nuovo gestionale</h2>
        <p className="tag">Il modulo è pronto ma non ancora attivato. Nel frattempo continua a usare la versione attuale su claude.ai.</p>
        {link && <a className="btn" href={link} target="_blank" rel="noopener">Apri la versione attuale ↗</a>}
      </div>
    </>
  );
}
