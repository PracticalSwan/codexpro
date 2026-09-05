import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";
import { withFileWriteLocks } from "./fsOps.js";

export interface ArchiveEntry { name:string; compressedBytes:number; expandedBytes:number; method:number; directory:boolean; localOffset:number; flags:number; externalAttributes:number; }
export interface ArchiveManifest { path:string; format:"zip"; entries:ArchiveEntry[]; compressedBytes:number; expandedBytes:number; }

function unsafeName(raw:string):boolean{
  const name=raw.replaceAll("\\","/");
  if(!name||name.includes("\0")||name.startsWith("/")||/^[A-Za-z]:/.test(name)) return true;
  const parts=name.split("/").filter(Boolean);
  if(parts.some(part=>part===".."||part==="."||part.includes(":"))) return true;
  const normalized=path.posix.normalize(name);
  return normalized===".."||normalized.startsWith("../")||path.posix.isAbsolute(normalized);
}
function findEocd(buffer:Buffer):number{
  const min=Math.max(0,buffer.length-(22+65535));
  for(let i=buffer.length-22;i>=min;i--) if(buffer.readUInt32LE(i)===0x06054b50)return i;
  throw new CodexProError("Invalid ZIP archive: end-of-central-directory record not found.");
}
function unixFileType(versionMadeBy:number, external:number):number{
  const host=(versionMadeBy>>>8)&0xff;if(host!==3)return 0;
  const mode=(external>>>16)&0xffff;return mode&0o170000;
}
export function parseZipBuffer(config:CodexProConfig,buffer:Buffer):ArchiveEntry[]{
  if(buffer.length>config.maxArchiveCompressedBytes)throw new CodexProError(`Archive exceeds compressed size limit (${config.maxArchiveCompressedBytes} bytes).`);
  const eocd=findEocd(buffer);const disk=buffer.readUInt16LE(eocd+4),cdDisk=buffer.readUInt16LE(eocd+6);if(disk!==0||cdDisk!==0)throw new CodexProError("Multi-disk ZIP archives are unsupported.");
  const count=buffer.readUInt16LE(eocd+10),cdSize=buffer.readUInt32LE(eocd+12),cdOffset=buffer.readUInt32LE(eocd+16);
  if(count===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff)throw new CodexProError("ZIP64 archives are unsupported by the bounded archive reader.");
  if(count>config.maxArchiveEntries)throw new CodexProError(`Archive has too many entries (${count}); limit is ${config.maxArchiveEntries}.`);
  if(cdOffset+cdSize>buffer.length||cdOffset<0)throw new CodexProError("Invalid ZIP central directory bounds.");
  const entries:ArchiveEntry[]=[];const seen=new Set<string>();let pos=cdOffset,total=0;
  for(let index=0;index<count;index++){
    if(pos+46>buffer.length||buffer.readUInt32LE(pos)!==0x02014b50)throw new CodexProError("Invalid ZIP central-directory entry.");
    const versionMadeBy=buffer.readUInt16LE(pos+4),flags=buffer.readUInt16LE(pos+8),method=buffer.readUInt16LE(pos+10),compressedBytes=buffer.readUInt32LE(pos+20),expandedBytes=buffer.readUInt32LE(pos+24),nameLen=buffer.readUInt16LE(pos+28),extraLen=buffer.readUInt16LE(pos+30),commentLen=buffer.readUInt16LE(pos+32),externalAttributes=buffer.readUInt32LE(pos+38),localOffset=buffer.readUInt32LE(pos+42);
    if([compressedBytes,expandedBytes,localOffset].includes(0xffffffff))throw new CodexProError("ZIP64 entries are unsupported.");
    if(pos+46+nameLen+extraLen+commentLen>buffer.length)throw new CodexProError("Invalid ZIP entry bounds.");
    const rawName=buffer.subarray(pos+46,pos+46+nameLen).toString("utf8");const name=rawName.replaceAll("\\","/");
    if(unsafeName(name))throw new CodexProError(`Archive contains unsafe traversal/absolute path: ${rawName}`);
    const normalized=name.endsWith("/")?`${path.posix.normalize(name).replace(/\/$/,"")}/`:path.posix.normalize(name);
    if(seen.has(normalized.toLowerCase()))throw new CodexProError(`Archive contains duplicate destination path: ${normalized}`);seen.add(normalized.toLowerCase());
    if(flags&1)throw new CodexProError(`Encrypted ZIP entries are unsupported: ${normalized}`);
    if(method!==0&&method!==8)throw new CodexProError(`Unsupported ZIP compression method ${method}: ${normalized}`);
    const fileType=unixFileType(versionMadeBy,externalAttributes);const directory=name.endsWith("/")||fileType===0o040000;
    if(fileType!==0&&fileType!==0o100000&&fileType!==0o040000)throw new CodexProError(`Archive symlink/hardlink/special member is blocked: ${normalized}`);
    const ratio=expandedBytes/Math.max(1,compressedBytes);if(expandedBytes>0&&ratio>config.maxArchiveCompressionRatio)throw new CodexProError(`Archive compression ratio exceeds limit for ${normalized}.`);
    total+=expandedBytes;if(total>config.maxArchiveExpandedBytes)throw new CodexProError(`Archive expanded size exceeds limit (${config.maxArchiveExpandedBytes} bytes).`);
    entries.push({name:normalized,compressedBytes,expandedBytes,method,directory,localOffset,flags,externalAttributes});pos+=46+nameLen+extraLen+commentLen;
  }
  return entries;
}
export function extractZipEntry(buffer:Buffer,entry:ArchiveEntry,config:CodexProConfig):Buffer{
  const pos=entry.localOffset;if(pos+30>buffer.length||buffer.readUInt32LE(pos)!==0x04034b50)throw new CodexProError(`Invalid local ZIP header for ${entry.name}.`);
  const nameLen=buffer.readUInt16LE(pos+26),extraLen=buffer.readUInt16LE(pos+28),start=pos+30+nameLen+extraLen,end=start+entry.compressedBytes;if(end>buffer.length)throw new CodexProError(`ZIP entry data exceeds archive bounds: ${entry.name}`);
  const raw=buffer.subarray(start,end);let out:Buffer;if(entry.method===0)out=Buffer.from(raw);else{try{out=inflateRawSync(raw,{maxOutputLength:Math.min(config.maxArchiveExpandedBytes,entry.expandedBytes+1)});}catch{throw new CodexProError(`Failed to decompress ZIP entry: ${entry.name}`);}}
  if(out.length!==entry.expandedBytes)throw new CodexProError(`ZIP entry expanded size mismatch: ${entry.name}`);return out;
}
async function readArchive(config:CodexProConfig,guard:PathGuard,workspace:Workspace,archivePath:string){const r=guard.resolve(workspace,archivePath);const stat=await fsp.lstat(r.absPath);if(!stat.isFile()||stat.isSymbolicLink())throw new CodexProError("Archive must be a regular file.");if(stat.size>config.maxArchiveCompressedBytes)throw new CodexProError(`Archive exceeds compressed size limit (${config.maxArchiveCompressedBytes} bytes).`);const buffer=await fsp.readFile(r.absPath);const entries=parseZipBuffer(config,buffer);return{r,buffer,entries};}
export async function inspectArchive(config:CodexProConfig,guard:PathGuard,workspace:Workspace,archivePath:string):Promise<ArchiveManifest>{const{r,buffer,entries}=await readArchive(config,guard,workspace,archivePath);return{path:r.relPath,format:"zip",entries,compressedBytes:buffer.length,expandedBytes:entries.reduce((n,e)=>n+e.expandedBytes,0)};}
export async function extractArchive(config:CodexProConfig,guard:PathGuard,workspace:Workspace,options:{archivePath:string;destination:string}){
  const {buffer,entries}=await readArchive(config,guard,workspace,options.archivePath);
  const destination=guard.resolve(workspace,options.destination,{forWrite:true});
  for(const entry of entries) guard.resolve(workspace,path.posix.join(destination.relPath,entry.name),{forWrite:true});
  return withFileWriteLocks([destination.absPath], async()=>{
    if(fs.existsSync(destination.absPath)) throw new CodexProError(`Archive destination already exists: ${destination.relPath}`);
    const parent=path.dirname(destination.absPath);
    let parentStat; try{parentStat=await fsp.stat(parent);}catch{throw new CodexProError("Archive destination parent must already exist for transactional extraction.");}
    if(!parentStat.isDirectory()) throw new CodexProError("Archive destination parent is not a directory.");
    const temp=path.join(parent,`.codexpro-archive-${process.pid}-${randomBytes(8).toString("hex")}`);
    await fsp.mkdir(temp,{recursive:false}); let renamed=false;
    try{
      for(const entry of entries){
        const target=path.join(temp,...entry.name.split("/").filter(Boolean));
        if(entry.directory){await fsp.mkdir(target,{recursive:true});continue;}
        await fsp.mkdir(path.dirname(target),{recursive:true});
        await fsp.writeFile(target,extractZipEntry(buffer,entry,config),{flag:"wx"});
      }
      await fsp.rename(temp,destination.absPath); renamed=true;
      return {path:destination.relPath,entries:entries.length,expandedBytes:entries.reduce((n,e)=>n+e.expandedBytes,0)};
    }finally{if(!renamed)await fsp.rm(temp,{recursive:true,force:true}).catch(()=>undefined);}
  });
}
