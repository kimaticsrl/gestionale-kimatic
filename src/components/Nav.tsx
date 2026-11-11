"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Voce = { href: string; label: string; colore?: string; n?: number } | "sep";

export default function Nav({ voci }: { voci: Voce[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sezioni">
      {voci.map((v, i) =>
        v === "sep" ? <div key={i} className="sep" role="presentation" /> : (
          <Link key={v.href} href={v.href} aria-current={path === v.href ? "page" : undefined}
            style={v.colore ? ({ "--c": v.colore } as React.CSSProperties) : undefined}>
            {v.colore && <span className="sw" />}{v.label}
            {v.n !== undefined && <span className="n">{v.n}</span>}
          </Link>
        )
      )}
    </nav>
  );
}
