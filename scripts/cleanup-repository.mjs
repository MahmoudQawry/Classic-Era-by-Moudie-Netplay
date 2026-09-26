import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

const safeGeneratedPaths = [
  ".expo",
  "dist",
  "coverage",
  "android/.gradle",
  "android/app/build",
  "modules/moudie-emulator/android/build",
  "modules/moudie-emulator/android/.cxx",
];

const mediaRoots = ["assets/images", "assets/videos"];
const sourceRoots = ["app","components","lib","modules","plugins","scripts","tests","server","shared","cloudflare-netplay","app.config.ts","package.json","README.md"];
const textExtensions = new Set([".ts",".tsx",".js",".jsx",".json",".md",".xml",".kt",".java",".gradle",".properties",".yml",".yaml",".sh",".py",".css",".cpp",".h",".hpp"]);

function walk(dir:string): string[] {
  if(!existsSync(dir)) return [];
  const out:string[]=[];
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const p=join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

const sourceFiles = sourceRoots.flatMap((p)=>{
  const full=join(root,p);
  if(!existsSync(full)) return [];
  return full.endsWith("/") ? walk(full) : (full.includes(".") ? [full] : walk(full));
}).filter((p)=>textExtensions.has(p.slice(p.lastIndexOf("."))));
const sourceText = sourceFiles.map((p)=>{try{return require("node:fs").readFileSync(p,"utf8")}catch{return ""}}).join("\n");
const mediaCandidates = mediaRoots.flatMap((r)=>walk(join(root,r))).filter((p)=>!sourceText.includes(p.replace(root+"/","")) && !sourceText.includes(p.replace(root+"/","@/")));
const generated = safeGeneratedPaths.filter((p)=>existsSync(join(root,p)));

console.log(JSON.stringify({mode:apply?"apply":"dry-run",generated,mediaCandidates},null,2));
if(apply){
  for(const p of generated) rmSync(join(root,p),{recursive:true,force:true});
  // Media is deliberately never auto-deleted by this script: binary references can
  // live in native manifests or config generated during prebuild. Candidates are
  // reported for a human-reviewed cleanup commit instead.
  console.log("Removed safe generated build/cache directories. Media candidates require review.");
}
