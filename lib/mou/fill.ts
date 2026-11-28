import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { MOU_TEMPLATE_BASE64 } from "@/lib/mou/template-data";
import { groupIndian, inrInWords, paymentSentence, toRoman, type PaymentTerms } from "@/lib/mou/format";

export type MouFields = {
  companyName: string;
  shortName?: string;
  address: string;
  statePin: string;
  tagName: string;
  brandName: string;
  deliverables: string[];
  amountInr: number;
  paymentTerms: PaymentTerms;
  signingAuthority: string;
  designation: string;
};

export type MouResult = { buffer: Buffer; needsReview: boolean; fileName: string };

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

export function buildMouDocx(f: MouFields): MouResult {
  const pay = paymentSentence(f.paymentTerms, f.amountInr);
  const company = clean(f.companyName);
  const zip = new PizZip(Buffer.from(MOU_TEMPLATE_BASE64, "base64"));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{", end: "}" } });
  doc.render({
    company_name: company,
    company_name_caps: company.toUpperCase(),
    short_name: clean(f.shortName || f.brandName || company),
    address: clean(f.address),
    state_pin: clean(f.statePin),
    tag_name: clean(f.tagName),
    brand_name: clean(f.brandName),
    deliverables_text: f.deliverables.map((d, i) => `(${toRoman(i + 1)}) ${clean(d)}`).join("\n"),
    amount_numeric: groupIndian(f.amountInr),
    amount_words: inrInWords(f.amountInr),
    payment_sentence: pay.text,
    signing_authority: clean(f.signingAuthority),
    designation: clean(f.designation),
  });
  const buffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  const safe = company.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Sponsor";
  return { buffer, needsReview: pay.needsReview, fileName: `MoU_Saarang2027_${safe}.docx` };
}