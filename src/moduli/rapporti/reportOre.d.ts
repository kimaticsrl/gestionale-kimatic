export function righeReport(rapporti: unknown[], da: string, a: string, paeseDi?: ((r: any) => string) | null): any[];
export function estero(paese: string, indirizzo?: string): boolean;
export function creaExcel(ExcelJS: unknown, righe: unknown[], da: string, a: string): Promise<Blob>;
export function riepilogo(righe: unknown[]): any[];
export function festivo(iso: string): string;
export function nomiTecnici(s: string): string[];
export function pdfReport(jsPDF: unknown, r: unknown, logo: string | null, paeseDi?: (r: any) => string): { output(t: "blob"): Blob };
export const nomeMese: (m: string) => string;
