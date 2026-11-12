export function righeReport(rapporti: unknown[], da: string, a: string): any[];
export function creaExcel(ExcelJS: unknown, righe: unknown[], da: string, a: string): Promise<Blob>;
export function riepilogo(righe: unknown[]): any[];
export function festivo(iso: string): string;
export function nomiTecnici(s: string): string[];
export function pdfReport(jsPDF: unknown, r: unknown, logo: string | null): { output(t: "blob"): Blob };
