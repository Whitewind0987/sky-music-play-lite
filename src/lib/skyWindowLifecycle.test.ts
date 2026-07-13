import { describe, expect, it } from "vitest";
import { reconcileSkyWindow } from "./skyWindowLifecycle";
import type { CandidateWindow } from "../types/experimentalInput";
const sky=(hwnd="1"):CandidateWindow=>({hwnd,title:"Sky",class_name:"TgcMainWindow",process_name:"Sky.exe",process_id:7});
const other:CandidateWindow={hwnd:"9",title:"Other",class_name:"Other",process_name:"Other.exe",process_id:9};
const base={appliedRevision:0,candidateWindows:[] as CandidateWindow[],experimentalInputEnabled:true,experimentalInputMode:"target-window-message" as const,selectedWindowHwnd:null,selectedWindowSnapshot:undefined};
describe("reconcileSkyWindow",()=>{
  it("binds available Sky when no target is selected",()=>expect(reconcileSkyWindow({...base,monitor:{revision:1,window:sky()}}).bindWindow).toEqual(sky()));
  it("binds current Sky from a stale saved Sky snapshot",()=>expect(reconcileSkyWindow({...base,selectedWindowHwnd:"old",selectedWindowSnapshot:{className:"TgcMainWindow",processName:"SKY.EXE"},monitor:{revision:1,window:sky("new")}}).bindWindow?.hwnd).toBe("new"));
  it("never overrides a manual non-Sky target",()=>expect(reconcileSkyWindow({...base,candidateWindows:[other],selectedWindowHwnd:"9",monitor:{revision:1,window:sky()}}).bindWindow).toBeNull());
  it("clears and stops only a selected Sky on loss",()=>expect(reconcileSkyWindow({...base,candidateWindows:[sky()],selectedWindowHwnd:"1",monitor:{revision:2,window:null}})).toMatchObject({clear:true,stopTargetPlayback:true,candidateWindows:[]}));
  it("preserves a manual target and arbitrary candidates on loss",()=>expect(reconcileSkyWindow({...base,candidateWindows:[other,sky()],selectedWindowHwnd:"9",monitor:{revision:2,window:null}})).toMatchObject({clear:false,stopTargetPlayback:false,candidateWindows:[other]}));
  it("replaces Sky atomically without auto-resume",()=>expect(reconcileSkyWindow({...base,candidateWindows:[sky("old")],selectedWindowHwnd:"old",monitor:{revision:2,window:sky("new")}})).toMatchObject({stopTargetPlayback:true,bindWindow:sky("new")}));
  it("ignores stale revisions",()=>expect(reconcileSkyWindow({...base,appliedRevision:3,monitor:{revision:2,window:sky()}}).ignored).toBe(true));
  it("does not force binding while disabled or in foreground mode",()=>{expect(reconcileSkyWindow({...base,experimentalInputEnabled:false,monitor:{revision:1,window:sky()}}).bindWindow).toBeNull();expect(reconcileSkyWindow({...base,experimentalInputMode:"foreground",monitor:{revision:1,window:sky()}}).bindWindow).toBeNull();});
});
