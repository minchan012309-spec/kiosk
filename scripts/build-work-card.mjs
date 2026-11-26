// Builds a single offline HTML file (fonts embedded) for students to fill in and save as PDF.
import { readFileSync, writeFileSync } from "node:fs";
const font = (f) => "data:font/woff;base64," + readFileSync(new URL(`../apps/web/public/fonts/${f}`, import.meta.url)).toString("base64");
const logoUrl = "https://gtvgeqdxcoiplhhufvgg.supabase.co/storage/v1/object/public/club-branding/62f89678-726a-45fc-aaf0-fe9fb60529a4.png";
// Supabase logo URL (needs internet when opened; click the logo in the form to replace it offline).
const logo = "https://gtvgeqdxcoiplhhufvgg.supabase.co/storage/v1/object/public/club-branding/62f89678-726a-45fc-aaf0-fe9fb60529a4.png";
const html = readFileSync(new URL("../work-card/template.html", import.meta.url), "utf8")
  .replace("__FONT_DUNGGEUNMO__", font("DungGeunMo.woff"))
  .replace("__FONT_YANGJIN__", font("yangjin.woff"))
  .replace("__LOGO__", logo);
writeFileSync(new URL("../work-card/PC-CLUB-작품안내-양식.html", import.meta.url), html);
console.log("work-card/PC-CLUB-작품안내-양식.html", (html.length / 1048576).toFixed(1) + "MB");
