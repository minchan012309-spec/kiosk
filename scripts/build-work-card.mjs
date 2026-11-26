// Builds a single offline HTML file (fonts embedded) for students to fill in and save as PDF.
import { readFileSync, writeFileSync } from "node:fs";
const font = (f) => "data:font/woff;base64," + readFileSync(new URL(`../apps/web/public/fonts/${f}`, import.meta.url)).toString("base64");
const html = readFileSync(new URL("../work-card/template.html", import.meta.url), "utf8")
  .replace("__FONT_DUNGGEUNMO__", font("DungGeunMo.woff"))
  .replace("__FONT_YANGJIN__", font("yangjin.woff"));
writeFileSync(new URL("../work-card/PC-CLUB-작품안내-양식.html", import.meta.url), html);
console.log("work-card/PC-CLUB-작품안내-양식.html", (html.length / 1048576).toFixed(1) + "MB");
