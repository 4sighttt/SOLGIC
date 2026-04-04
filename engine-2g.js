// engine-2g.js  —  SOLGIC 2G solver engine
// Interface: function infer2G(io) -> {ok, checkLines, mine:[], safe:[], sol}
// io format: {mode:'2G', size:n, mines:k, board:[[{t,v},...],...]}
// Tile types: t='e' unknown, t='n' number(v=k), t='f' flagged mine, t='q' opened safe

'use strict';

const ENGINE_2G_VERSION = 'engine-2g v203';

function infer2G(io){
      const n=io.size|0, minesTarget=io.mines|0;
      const inb=(x,y)=>x>=0&&y>=0&&x<n&&y<n;
      const N8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      const N4=[[0,-1],[-1,0],[1,0],[0,1]];
      const lbl=(x,y)=>String.fromCharCode(65+x)+String(y+1);

      if(minesTarget%4!==0){
        return {ok:false,checkLines:[ENGINE_2G_VERSION, `mines=${minesTarget} must be divisible by 4`],safe:[],mine:[],sol:0};
      }
      const numGroupsTotal=minesTarget/4|0;

      const N=n*n;
      const idx=(x,y)=>y*n+x;
      const xy=(i)=>[i%n,(i/n)|0];

      const neigh8=Array.from({length:N},()=>[]);
      const neigh4=Array.from({length:N},()=>[]);
      for(let i=0;i<N;i++){
        const[x,y]=xy(i);
        for(const[dx,dy]of N8){const xx=x+dx,yy=y+dy;if(inb(xx,yy))neigh8[i].push(idx(xx,yy));}
        for(const[dx,dy]of N4){const xx=x+dx,yy=y+dy;if(inb(xx,yy))neigh4[i].push(idx(xx,yy));}
      }

      const asnCell=new Int8Array(N).fill(-1);
      const isNum=new Uint8Array(N);
      const numVal=new Int16Array(N).fill(-1);

      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const c=io.board[y][x],ii=idx(x,y);
        if(c.t==='f'){asnCell[ii]=1;}
        else if(c.t==='q'){asnCell[ii]=0;}
        else if(c.t==='n'){asnCell[ii]=0;isNum[ii]=1;numVal[ii]=c.v|0;}
      }

      // available for groups = unknown(-1) + fixed mines(1)
      const mineAvail=new Set();
      const unknownSet=new Set();
      const fixedMineSet=new Set();
      for(let i=0;i<N;i++){
        if(asnCell[i]===-1){mineAvail.add(i);unknownSet.add(i);}
        else if(asnCell[i]===1){mineAvail.add(i);fixedMineSet.add(i);}
      }

      const numCons=[];
      const numNeighSet=new Set();
      for(let i=0;i<N;i++){
        if(!isNum[i]) continue;
        let fixedM=0; const vs=[];
        for(const j of neigh8[i]){
          if(asnCell[j]===1)fixedM++;
          else if(asnCell[j]===-1){vs.push(j);numNeighSet.add(j);}
        }
        numCons.push({v:numVal[i]|0,fixedM,vs});
      }

      // =====================================================================
      // 전처리: 숫자 제약 전파로 확정 안전 셀 계산 (preCheckSafe 탐색 전)
      // 확정 안전 셀은 mineAvail에서 제거하여 hasValidGroupFor 탐색 정확도 향상
      // =====================================================================
      const preConstraintSafe = new Set();
      {
        const tmpSafe = new Set();
        const tmpMine = new Set();
        for(let i=0;i<N;i++){
          if(asnCell[i]===0) tmpSafe.add(i);
          else if(asnCell[i]===1) tmpMine.add(i);
        }
        let changed = true;
        while(changed){
          changed = false;
          for(const c of numCons){
            let m = c.fixedM;
            const unk = [];
            for(const j of c.vs){
              if(tmpMine.has(j)) m++;
              else if(!tmpSafe.has(j)) unk.push(j);
            }
            const rem = c.v - m;
            if(rem < 0 || rem > unk.length) continue;
            if(rem === 0){
              for(const j of unk){ if(!tmpSafe.has(j)){ tmpSafe.add(j); preConstraintSafe.add(j); changed=true; } }
            }
            if(rem === unk.length && rem > 0){
              for(const j of unk){ if(!tmpMine.has(j)){ tmpMine.add(j); changed=true; } }
            }
          }
        }
        for(const j of preConstraintSafe) mineAvail.delete(j);
      }

      // =====================================================================
      // 전처리: 셀 단위 2G 유효성 검사 (allGroups 열거 이전에 실행)
      // 미지 셀 C가 지뢰가 되려면 C를 포함하는 유효한 4칸 연결 그룹이 존재해야 함.
      // 숫자 제약 조기 차단으로 H6 같은 케이스를 빠르게 SAFE 확정.
      // =====================================================================
      const preCheckSafe = new Set();
      {
        // 플래그 연결 컴포넌트 계산
        const flagVisited = new Set();
        const flagComponents = [];
        for(const start of fixedMineSet){
          if(flagVisited.has(start)) continue;
          const comp = new Set();
          const q = [start]; flagVisited.add(start);
          while(q.length){
            const cur = q.shift(); comp.add(cur);
            for(const nb of neigh4[cur]){
              if(!flagVisited.has(nb) && fixedMineSet.has(nb)){
                flagVisited.add(nb); q.push(nb);
              }
            }
          }
          flagComponents.push(comp);
        }
        const cellToComp = new Map();
        for(const comp of flagComponents)
          for(const c of comp) cellToComp.set(c, comp);

        // 그룹(4칸 배열) 유효성 검사
        function isValidGroup(group){
          const gset = new Set(group);
          const flagsIn = group.filter(c => fixedMineSet.has(c));
          if(flagsIn.length > 0){
            const comp = cellToComp.get(flagsIn[0]);
            if(!comp) return false;
            for(const f of flagsIn)
              if(cellToComp.get(f) !== comp) return false;
            const outside = [...comp].filter(c => !gset.has(c));
            if(outside.length + group.length > 4) return false;
          }
          for(const c of group){
            for(const nb of neigh4[c]){
              if(gset.has(nb)) continue;
              if(!fixedMineSet.has(nb)) continue;
              const nbComp = cellToComp.get(nb);
              if(flagsIn.length > 0){
                if(nbComp !== cellToComp.get(flagsIn[0])) return false;
              } else {
                if(nbComp && nbComp.size + group.length > 4) return false;
              }
            }
          }
          // 숫자 제약 초과 금지
          for(const c of numCons){
            let m = c.fixedM;
            for(const j of c.vs) if(gset.has(j)) m++;
            if(m > c.v) return false;
          }
          return true;
        }

        // 가정 지뢰 Set 기준으로 숫자 제약 전파 → 확정 safe 셀 반환
        function propagateSafe(assumedMines){
          const tmpSafe = new Set();
          const tmpMine = new Set(assumedMines);
          for(let i=0;i<N;i++){
            if(asnCell[i]===0) tmpSafe.add(i);
            else if(asnCell[i]===1) tmpMine.add(i);
          }
          let changed = true;
          while(changed){
            changed = false;
            for(const c of numCons){
              let m = c.fixedM;
              const unk = [];
              for(const j of c.vs){
                if(tmpMine.has(j)) m++;
                else if(!tmpSafe.has(j)) unk.push(j);
              }
              const rem = c.v - m;
              if(rem < 0) return null; // 모순
              if(rem > unk.length) return null; // 모순
              if(rem === 0){
                for(const j of unk){ if(!tmpSafe.has(j)){ tmpSafe.add(j); changed=true; } }
              }
              if(rem === unk.length && rem > 0){
                for(const j of unk){ if(!tmpMine.has(j)){ tmpMine.add(j); changed=true; } }
              }
            }
          }
          return tmpSafe;
        }

        // 셀 C를 포함하는 유효한 4칸 연결 그룹 존재 여부 탐색
        // assumedMines: 이미 지뢰로 가정된 셀들 (재귀 호출용)
        // extraSafe: 이미 safe로 확정된 셀들 (재귀 호출용, mineAvail 필터링)
        // visitedComps: 이미 검사한 컴포넌트 시작 셀 (무한재귀 방지)
        function hasValidGroupFor(startCell, assumedMines, extraSafe, visitedComps){
          const aMines = assumedMines || new Set();
          const eSafe = extraSafe || new Set();
          const visited = visitedComps || new Set();
          if(visited.has(startCell)) return true; // 이미 검사 완료로 간주
          visited.add(startCell);
          let found = false;
          function dfs(cells, cset){
            if(found) return;
            for(const con of numCons){
              let m = con.fixedM;
              for(const j of con.vs) if(cset.has(j)||aMines.has(j)) m++;
              if(m > con.v) return;
            }
            if(cells.length === 4){
              if(!isValidGroup(cells)) return;
              // assumedMines(가정 그룹)와의 4방향 인접 충돌 체크
              // isValidGroup은 fixedMineSet만 체크하므로 가정 그룹과의 충돌은 별도 체크
              if(aMines.size > 0){
                const gset = new Set(cells);
                for(const c of cells){
                  for(const nb of neigh4[c]){
                    if(gset.has(nb)) continue;
                    if(aMines.has(nb) && !fixedMineSet.has(nb)){
                      // nb가 가정 그룹의 일부 → 두 그룹이 인접 → 2G 위반
                      return;
                    }
                  }
                }
              }
              const newMines = new Set([...aMines, ...cells]);
              const propSafe = propagateSafe(newMines);
              if(propSafe === null) return;
              // 인접한 미완성 fixedMine 컴포넌트 검사
              for(const comp of flagComponents){
                if(comp.size >= 4) continue;
                const compStart = [...comp][0];
                if(visited.has(compStart)) continue; // 이미 검사됨
                if(!hasValidGroupFor(compStart, newMines, propSafe, new Set(visited))) return;
              }
              found = true;
              return;
            }
            for(const c of cells){
              for(const nb of neigh4[c]){
                if(cset.has(nb)) continue;
                if(!mineAvail.has(nb)) continue;
                if(eSafe.has(nb)) continue;
                if(aMines.has(nb)) continue; // 이미 다른 그룹에 사용된 셀 제외
                cset.add(nb); cells.push(nb);
                dfs(cells, cset);
                cells.pop(); cset.delete(nb);
                if(found) return;
              }
            }
          }
          dfs([startCell], new Set([startCell]));
          return found;
        }

        for(const cell of unknownSet){
          if(!hasValidGroupFor(cell)) preCheckSafe.add(cell);
        }
      }

      // Enumerate all 4-cell connected groups from mineAvail
      // 숫자 제약 조기 차단으로 열거량 감소
      const allGroups=[];
      {
        const seen=new Set();
        function dfs4(cells,cellSet,minNext){
          // 조기 차단: 현재 셀 조합이 숫자 제약 초과 시 중단
          for(const con of numCons){
            let m = con.fixedM;
            for(const j of con.vs) if(cellSet.has(j)) m++;
            if(m > con.v) return;
          }
          if(cells.length===4){
            const key=cells.slice().sort((a,b)=>a-b).join(',');
            if(!seen.has(key)){seen.add(key);allGroups.push(cells.slice());}
            return;
          }
          for(const c of cells){
            for(const j of neigh4[c]){
              if(j>minNext&&mineAvail.has(j)&&!cellSet.has(j)){
                cells.push(j);cellSet.add(j);
                dfs4(cells,cellSet,minNext);
                cells.pop();cellSet.delete(j);
              }
            }
          }
        }
        for(const start of mineAvail){
          dfs4([start],new Set([start]),start);
        }
      }

      // Sort: groups with numNeigh cells first
      allGroups.sort((a,b)=>{
        const sa=a.filter(c=>numNeighSet.has(c)).length;
        const sb=b.filter(c=>numNeighSet.has(c)).length;
        return sb-sa;
      });

      // Precompute conflict sets: for each group index, which other group indices
      // conflict with it (overlap OR orthogonal adjacency)
      const conflictWith = Array.from({length:allGroups.length}, ()=>new Set());
      for(let i=0;i<allGroups.length;i++){
        for(let j=i+1;j<allGroups.length;j++){
          const gi=allGroups[i], gj=allGroups[j];
          let conflict=false;
          for(const c of gi){ if(gj.includes(c)){conflict=true;break;} }
          if(!conflict){
            outer: for(const c of gi){
              for(const nb of neigh4[c]){ if(gj.includes(nb)){conflict=true;break outer;} }
            }
          }
          if(conflict){ conflictWith[i].add(j); conflictWith[j].add(i); }
        }
      }

      // Split groups into frontier (touches numNeigh cell) and background
      const frontierGroups = allGroups.filter(g=>g.some(c=>numNeighSet.has(c)||fixedMineSet.has(c)));
      const bgGroups       = allGroups.filter(g=>!g.some(c=>numNeighSet.has(c)||fixedMineSet.has(c)));

      // Build conflict sets within frontier and cross (frontier->bg)
      const fConflict = Array.from({length:frontierGroups.length},()=>new Set());
      for(let i=0;i<frontierGroups.length;i++){
        for(let j=i+1;j<frontierGroups.length;j++){
          if(conflictWith[allGroups.indexOf(frontierGroups[i])].has(allGroups.indexOf(frontierGroups[j]))){
            fConflict[i].add(j); fConflict[j].add(i);
          }
        }
      }
      const bgConflict = Array.from({length:bgGroups.length},()=>new Set());
      for(let i=0;i<bgGroups.length;i++){
        for(let j=i+1;j<bgGroups.length;j++){
          if(conflictWith[allGroups.indexOf(bgGroups[i])].has(allGroups.indexOf(bgGroups[j]))){
            bgConflict[i].add(j); bgConflict[j].add(i);
          }
        }
      }
      const crossConflict = Array.from({length:frontierGroups.length},()=>[]);
      for(let fi=0;fi<frontierGroups.length;fi++){
        for(let bi=0;bi<bgGroups.length;bi++){
          if(conflictWith[allGroups.indexOf(frontierGroups[fi])].has(allGroups.indexOf(bgGroups[bi]))){
            crossConflict[fi].push(bi);
          }
        }
      }

      // preCheckSafe: 위로 이동됨 (allGroups 열거 이전에 실행)

      // Count bg selections of size k given initially-blocked bg indices
      function countBgWays(k, initBlocked){
        if(k===0) return {ways:1, cellCount:new Int32Array(N)};
        const bgBl=new Uint8Array(bgGroups.length);
        for(const bi of initBlocked) bgBl[bi]=1;
        let ways=0;
        const cellCount=new Int32Array(N);
        function btBg(gidx,rem){
          if(rem===0){ ways++; return; }
          if(bgGroups.length-gidx<rem) return;
          if(!bgBl[gidx]){
            const nb=[]; for(const ci of bgConflict[gidx]){ if(!bgBl[ci]){bgBl[ci]=1;nb.push(ci);} }
            const before=ways;
            btBg(gidx+1,rem-1);
            const added=ways-before;
            if(added>0) for(const c of bgGroups[gidx]) cellCount[c]+=added;
            for(const ci of nb) bgBl[ci]=0;
          }
          btBg(gidx+1,rem);
        }
        btBg(0,k);
        return {ways, cellCount};
      }

      // Frontier BT + bg combinatorics
      const mineSet=new Set();
      const mineCount=new Int32Array(N);
      let sol=0;
      const NODE_BUDGET=500000;
      let nodes=0;
      let uncoveredFixed=fixedMineSet.size;
      const fBlocked=new Uint8Array(frontierGroups.length);
      const bgBlockedByF=new Uint8Array(bgGroups.length);

      function checkPartial(){
        for(const c of numCons){
          let m=c.fixedM,rem=0;
          for(const j of c.vs){ if(mineSet.has(j))m++; else if(unknownSet.has(j))rem++; }
          if(m>c.v||m+rem<c.v) return false;
        }
        return true;
      }
      function checkFull(){
        for(const c of numCons){
          let m=c.fixedM;
          for(const j of c.vs) if(mineSet.has(j))m++;
          if(m!==c.v) return false;
        }
        return true;
      }

      function commitFrontier(rem){
        const bl=[];
        for(let bi=0;bi<bgGroups.length;bi++) if(bgBlockedByF[bi]) bl.push(bi);
        const {ways:w, cellCount}=countBgWays(rem,bl);
        sol+=w;
        for(const cell of mineSet) if(unknownSet.has(cell)) mineCount[cell]+=w;
        for(let i=0;i<N;i++) if(cellCount[i]>0 && unknownSet.has(i)) mineCount[i]+=cellCount[i];
      }

      function btGroups(gidx,rem){
        if(nodes++>NODE_BUDGET) return 'budget';
        if(uncoveredFixed===0&&checkFull()){ commitFrontier(rem); return; }
        if(gidx>=frontierGroups.length||rem===0) return;

        const g=frontierGroups[gidx];
        if(!fBlocked[gidx]){
          let newUncov=0;
          for(const c of g) if(fixedMineSet.has(c)) newUncov++;
          for(const c of g) mineSet.add(c);
          uncoveredFixed-=newUncov;
          const nb=[]; for(const ci of fConflict[gidx]){ if(!fBlocked[ci]){fBlocked[ci]=1;nb.push(ci);} }
          const nbg=[]; for(const bi of crossConflict[gidx]){ if(!bgBlockedByF[bi]){bgBlockedByF[bi]=1;nbg.push(bi);} }

          if(checkPartial()){
            const r=btGroups(gidx+1,rem-1);
            if(r==='budget'){
              for(const ci of nb) fBlocked[ci]=0;
              for(const bi of nbg) bgBlockedByF[bi]=0;
              uncoveredFixed+=newUncov;
              for(const c of g) mineSet.delete(c);
              return 'budget';
            }
          }
          for(const ci of nb) fBlocked[ci]=0;
          for(const bi of nbg) bgBlockedByF[bi]=0;
          uncoveredFixed+=newUncov;
          for(const c of g) mineSet.delete(c);
        }
        return btGroups(gidx+1,rem);
      }

      // 숫자 제약이 충분하지 않으면 전수 탐색 스킵 (브라우저 멈춤 방지)
      // frontier/bg 그룹 수가 임계값 초과 시 논리 엔진만 실행
      const BT_FRONTIER_LIMIT = 20;
      const BT_BG_LIMIT = 30;
      const skipBT = frontierGroups.length > BT_FRONTIER_LIMIT || bgGroups.length > BT_BG_LIMIT;
      const r = skipBT ? 'budget' : btGroups(0,numGroupsTotal);
      const checkLines=[ENGINE_2G_VERSION];

      // 전처리 결과 반영 (preCheckSafe)
      const preCheckSafeLabels=[];
      for(const cell of preCheckSafe){
        const[cx,cy]=xy(cell);
        preCheckSafeLabels.push(lbl(cx,cy));
      }
      if(preCheckSafeLabels.length){
        checkLines.push(`preCheck safe: ${preCheckSafeLabels.join(', ')}`);
      }

      const mine=[],safe=[];

      // 전처리 확정 안전 셀 먼저 추가
      for(const cell of preCheckSafe){
        const[x,y]=xy(cell);
        safe.push(lbl(x,y));
      }

      // =====================================================================
      // Unified deduction loop: sharedZone + logicDeductions 교대 반복
      // sharedZone은 숫자 제약 간 subset 관계로 지뢰/안전 확정
      // logicDeductions는 가정-전파-모순 검출로 추가 확정
      // 두 엔진을 교대로 실행하여 연쇄 전파 극대화
      // =====================================================================
      function runSharedZone(mineArr, safeArr){
        const alreadySafe=new Set(safeArr.map(s=>{const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;return idx(p,q);}));
        const alreadyMine=new Set(mineArr.map(s=>{const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;return idx(p,q);}));
        let changed=false;
        let szChanged=true;
        while(szChanged){
          szChanged=false;
          for(let a=0;a<numCons.length;a++){
            for(let b=0;b<numCons.length;b++){
              if(a===b) continue;
              const A=numCons[a], B=numCons[b];
              const remA=A.v-A.fixedM-(A.vs.filter(c=>alreadyMine.has(c)).length);
              const remB=B.v-B.fixedM-(B.vs.filter(c=>alreadyMine.has(c)).length);
              if(remB<=0||remA<0) continue;
              const Avs=A.vs.filter(c=>asnCell[c]===-1&&!alreadyMine.has(c)&&!alreadySafe.has(c));
              const Bvs=B.vs.filter(c=>asnCell[c]===-1&&!alreadyMine.has(c)&&!alreadySafe.has(c));
              if(Avs.length===0||Bvs.length===0) continue;
              const shared=Avs.filter(c=>Bvs.includes(c));
              if(shared.length===0) continue;
              const A_only=Avs.filter(c=>!Bvs.includes(c));
              const B_only=Bvs.filter(c=>!Avs.includes(c));
              if(B_only.length>0){
                let triggerSafe=false;
                if(A_only.length===0&&remA>=remB) triggerSafe=true;
                if(!triggerSafe&&remA-remB>=A_only.length) triggerSafe=true;
                if(triggerSafe){
                  for(const cell of B_only){
                    if(!alreadySafe.has(cell)&&!alreadyMine.has(cell)){
                      const[x,y]=xy(cell); safeArr.push(lbl(x,y));
                      alreadySafe.add(cell); szChanged=true; changed=true;
                    }
                  }
                }
              }
              if(B_only.length>0){
                // A의 shared 최대 기여 = min(shared.length, remA)
                // B_only 최소 필요 = max(0, remB - shared_max)
                const shared_max=Math.min(shared.length,remA);
                const B_only_needed=Math.max(0,remB-shared_max);
                if(B_only_needed>0&&B_only_needed===B_only.length){
                  for(const cell of B_only){
                    if(!alreadySafe.has(cell)&&!alreadyMine.has(cell)){
                      const[x,y]=xy(cell); mineArr.push(lbl(x,y));
                      alreadyMine.add(cell); szChanged=true; changed=true;
                    }
                  }
                }
              }
            }
          }
        }
        return changed;
      }

      // 통합 루프: groupCompletion → groupExpansion → logicDeductions → groupCoverage 교대
      {
        let outerChanged=true;
        while(outerChanged){
          outerChanged=false;
          if(runSharedZone(mine,safe)) outerChanged=true;
          if(groupCompletionDeductions(mine,safe)) outerChanged=true;
          if(groupExpansionSafeDeductions(mine,safe)) outerChanged=true;
          const pm=mine.length, ps=safe.length;
          logicDeductions(mine,safe);
          if(mine.length>pm||safe.length>ps) outerChanged=true;
          if(groupCoverageDeductions(mine,safe)) outerChanged=true;
        }
        // 중복 제거
        const mineDedup=[...new Set(mine)]; mine.length=0; for(const x of mineDedup) mine.push(x);
        const safeDedup=[...new Set(safe)]; safe.length=0; for(const x of safeDedup) safe.push(x);
      }

      if(r==='budget'){
        checkLines.push('OK (budget exceeded)');
        checkLines.push(`groups=${allGroups.length} nodes>${NODE_BUDGET}`);
        checkLines.push(`deduce: mine=${mine.length} safe=${safe.length}`);
        return { ok:true, checkLines, fixedMines:fixedMineSet.size, safe, mine, sol:0 };
      } else if(sol===0){
        return {ok:false,checkLines:[ENGINE_2G_VERSION,'contradiction: no solutions'],safe:[],mine:[],sol:0};
      } else {
        checkLines.push('OK');
        checkLines.push(`solutions=${sol}`);
      }

      if(sol>0){
        for(const cell of unknownSet){
          if(preCheckSafe.has(cell)) continue; // 이미 추가됨
          const[x,y]=xy(cell);
          if(mineCount[cell]===sol) mine.push(lbl(x,y));
          else if(mineCount[cell]===0) safe.push(lbl(x,y));
        }
      }

      // Assumption-based deduction:
      // (A) "cell must be mine" => at least one selected group must contain cell => if impossible => SAFE
      // (B) "cell must be safe" => no selected group may contain cell => if impossible => MINE
      const ASSUME_BUDGET = 300000;

      // =====================================================================
      // Constraint Propagation Logic Layer (논리 추론 전파)
      // 가정(assumption) → 연쇄 제약 전파 → 모순 검출 → 확정
      //
      // 작동 원리:
      //  1. 특정 셀에 대해 "지뢰" 또는 "안전" 가정
      //  2. 숫자 제약(numCons)을 반복 전파:
      //     - rem==0인 숫자의 미지 이웃 → 모두 SAFE 확정
      //     - rem==unknown_count인 숫자의 미지 이웃 → 모두 MINE 확정
      //  3. 전파 중 rem<0 또는 rem>unknown_count → 모순
      //  4. 모순 발생 시 가정의 반대값이 확정됨
      // =====================================================================
      function propagateConstraints(initMines, initSafes){
        // initMines, initSafes: Set of cell indices to assume
        // Returns: {contradiction:bool, mines:Set, safes:Set}

        const mines = new Set(initMines);
        const safes = new Set(initSafes);

        // asnCell 기반 이미 확정된 것 반영
        for(let i=0;i<N;i++){
          if(asnCell[i]===1) mines.add(i);
          else if(asnCell[i]===0) safes.add(i);
        }

        let changed = true;
        while(changed){
          changed = false;

          // 각 제약의 현재 상태 계산
          const cons = [];
          for(const c of numCons){
            let mineCount = c.fixedM;
            const unknowns = [];
            for(const j of c.vs){
              if(mines.has(j)) mineCount++;
              else if(!safes.has(j)) unknowns.push(j);
            }
            const rem = c.v - mineCount;
            if(rem < 0) return {contradiction:true, mines, safes};
            if(rem > unknowns.length) return {contradiction:true, mines, safes};
            cons.push({...c, unknowns, rem});
          }

          // Rule 1: rem==0 => unknowns 모두 SAFE
          // Rule 2: rem==unknowns.length => unknowns 모두 MINE
          for(const c of cons){
            if(c.rem === 0){
              for(const j of c.unknowns){ if(!safes.has(j)){safes.add(j);changed=true;} }
            }
            if(c.rem === c.unknowns.length && c.rem > 0){
              for(const j of c.unknowns){ if(!mines.has(j)){mines.add(j);changed=true;} }
            }
          }

          // Rule 3 (subset): A.unknowns ⊆ B.unknowns
          //   A가 remA개를 shared에서 소모 → B에서 B_only에 (B.rem - A.rem)개 필요
          //   B_only_needed == B_only.length => B_only 모두 MINE
          //   B_only_needed == 0 (A.rem==B.rem) => B_only 모두 SAFE
          //   B_only_needed < 0 또는 > B_only.length => 모순
          for(let a=0;a<cons.length;a++){
            for(let b=0;b<cons.length;b++){
              if(a===b) continue;
              const A=cons[a], B=cons[b];
              if(A.unknowns.length===0||B.unknowns.length===0) continue;
              const Aset = new Set(A.unknowns);
              // A ⊆ B 확인 (A_only empty)
              const A_only = A.unknowns.filter(c=>!new Set(B.unknowns).has(c));
              if(A_only.length !== 0) continue;
              // A.unknowns ⊆ B.unknowns 확정
              const B_only = B.unknowns.filter(c=>!Aset.has(c));
              const needed = B.rem - A.rem;
              if(needed < 0) return {contradiction:true, mines, safes};
              if(needed > B_only.length) return {contradiction:true, mines, safes};
              if(needed === 0){
                for(const j of B_only){ if(!safes.has(j)){safes.add(j);changed=true;} }
              }
              if(needed === B_only.length && needed > 0){
                for(const j of B_only){ if(!mines.has(j)){mines.add(j);changed=true;} }
              }
            }
          }

          // mine/safe 충돌 검사
          for(const m of mines){
            if(safes.has(m)) return {contradiction:true, mines, safes};
          }

          // 2G 연결성 검사는 propagateConstraints 내부에서 수행하지 않음.
          // 가정-전파 중간 상태에서의 연결성 검사는 오탐을 유발함.
          // 대신 외부 groupCompletionDeductions/groupCoverageDeductions에서 처리.
        }
        return {contradiction:false, mines, safes};
      }

      // =====================================================================
      // groupCompletionDeductions: 확장 후보 1개인 컴포넌트 → 강제 지뢰
      // =====================================================================
      function groupCompletionDeductions(mineArr, safeArr){
        const kmSet=new Set([...fixedMineSet]);
        for(const s of mineArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;kmSet.add(idx(p,q));}
        const ksSet=new Set();
        for(let i=0;i<N;i++) if(asnCell[i]===0) ksSet.add(i);
        for(const s of safeArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;ksSet.add(idx(p,q));}

        let changed=false;
        const visited=new Set();
        for(const start of kmSet){
          if(visited.has(start)) continue;
          const comp=[],compSet=new Set();
          const bq=[start]; visited.add(start);
          while(bq.length){
            const cur=bq.shift(); comp.push(cur); compSet.add(cur);
            for(const nb of neigh4[cur]){
              if(!visited.has(nb)&&kmSet.has(nb)){visited.add(nb);bq.push(nb);}
            }
          }
          if(comp.length>=4) continue;
          const otherMines=new Set([...kmSet].filter(i=>!compSet.has(i)));
          const directCandidates=new Set();
          for(const c of comp){
            for(const nb of neigh4[c]){
              if(compSet.has(nb)||ksSet.has(nb)||otherMines.has(nb)) continue;
              let adjOther=false;
              for(const nb2 of neigh4[nb]){
                if(!compSet.has(nb2)&&otherMines.has(nb2)){adjOther=true;break;}
              }
              if(adjOther) continue;
              if(unknownSet.has(nb)) directCandidates.add(nb);
            }
          }
          if(directCandidates.size===1){
            const only=[...directCandidates][0];
            if(!kmSet.has(only)){
              const[x,y]=xy(only); const lb=lbl(x,y);
              if(!mineArr.includes(lb)){mineArr.push(lb);changed=true;}
            }
          }
        }
        return changed;
      }

      // =====================================================================
      // groupCoverageDeductions: 모든 완성 경로가 반드시 통과하는 셀 집합 분석
      // 컴포넌트의 모든 유효 4칸 완성이 숫자 제약의 특정 셀을 반드시 포함하면
      // 그 제약의 나머지 unknowns는 SAFE.
      // =====================================================================
      function groupCoverageDeductions(mineArr, safeArr){
        const kmSet=new Set([...fixedMineSet]);
        for(const s of mineArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;kmSet.add(idx(p,q));}
        const ksSet=new Set();
        for(let i=0;i<N;i++) if(asnCell[i]===0) ksSet.add(i);
        for(const s of safeArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;ksSet.add(idx(p,q));}

        let changed=false;
        const visited=new Set();

        for(const start of kmSet){
          if(visited.has(start)) continue;
          const comp=[],compSet=new Set();
          const bq=[start]; visited.add(start);
          while(bq.length){
            const cur=bq.shift(); comp.push(cur); compSet.add(cur);
            for(const nb of neigh4[cur]){
              if(!visited.has(nb)&&kmSet.has(nb)){visited.add(nb);bq.push(nb);}
            }
          }
          if(comp.length>=4) continue;

          const otherMines=new Set([...kmSet].filter(i=>!compSet.has(i)));

          // 모든 유효 4칸 완성 열거 (숫자 제약 초과 체크 포함)
          const allCompletions=[];
          const ENUM_LIMIT=1000;
          let enumNodes=0;

          function enumGroups(current,currentSet){
            if(enumNodes++>ENUM_LIMIT) return;
            if(current.length===4){
              // 숫자 제약 초과 체크
              for(const c of numCons){
                let m=c.fixedM;
                for(const j of c.vs) if(currentSet.has(j)) m++;
                if(m>c.v) return;
              }
              allCompletions.push([...current]);
              return;
            }
            for(const c of current){
              for(const nb of neigh4[c]){
                if(currentSet.has(nb)) continue;
                if(ksSet.has(nb)) continue;
                if(otherMines.has(nb)) continue;
                let adjOther=false;
                for(const nb2 of neigh4[nb]){
                  if(!currentSet.has(nb2)&&otherMines.has(nb2)){adjOther=true;break;}
                }
                if(adjOther) continue;
                if(!unknownSet.has(nb)&&!kmSet.has(nb)) continue;
                // 중간 단계 숫자 제약 초과 조기 차단
                let overLimit=false;
                for(const c2 of numCons){
                  let m=c2.fixedM;
                  for(const j of c2.vs) if(currentSet.has(j)||j===nb) m++;
                  if(m>c2.v){overLimit=true;break;}
                }
                if(overLimit) continue;
                currentSet.add(nb); current.push(nb);
                enumGroups(current,currentSet);
                current.pop(); currentSet.delete(nb);
              }
            }
          }
          enumGroups([...comp],new Set(compSet));

          if(allCompletions.length===0) continue;

          // 각 숫자 제약에 대해 커버리지 분석
          for(const c of numCons){
            let fixM=c.fixedM;
            const unkList=[];
            for(const j of c.vs){
              if(kmSet.has(j)) fixM++;
              else if(!ksSet.has(j)&&asnCell[j]===-1) unkList.push(j);
            }
            const rem=c.v-fixM;
            if(rem<=0||rem>unkList.length) continue;

            // Pattern 1: inAll - 모든 완성에 공통으로 포함된 셀 → rem=1이면 나머지 SAFE
            const inAll=unkList.filter(j=>allCompletions.every(g=>g.includes(j)));
            if(inAll.length>0 && rem===1){
              for(const j of unkList){
                if(!inAll.includes(j)&&!ksSet.has(j)){
                  const[x,y]=xy(j); const lb=lbl(x,y);
                  if(!safeArr.includes(lb)){safeArr.push(lb);changed=true;}
                }
              }
              continue;
            }

            // Pattern 2: hitting set - 모든 완성이 unkList에서 최소 1개를 포함하고
            // 그 포함된 셀들의 합집합이 unkList의 진부분집합이면 → 나머지 SAFE
            if(rem===1){
              const coverSets=allCompletions.map(g=>unkList.filter(j=>g.includes(j)));
              if(coverSets.some(s=>s.length===0)) continue;
              const appearsInAny=new Set(coverSets.flat());
              const notInAny=unkList.filter(j=>!appearsInAny.has(j));
              for(const j of notInAny){
                if(!ksSet.has(j)){
                  const[x,y]=xy(j); const lb=lbl(x,y);
                  if(!safeArr.includes(lb)){safeArr.push(lb);changed=true;}
                }
              }
            }
          }
        }
        return changed;
      }

      // =====================================================================
      // groupExpansionSafeDeductions:
      // 크기 k(<4)인 지뢰 컴포넌트 C에 대해:
      //   dangerZone = compSet ∪ compAdjSet (C와 직접 인접한 unknown 포함)
      //   Y ∉ compAdjSet (직접 확장 후보 아님) 이고
      //   Y의 4방향 이웃 중 dangerZone 외부로 탈출 가능한 경로가 없으면,
      //   Y를 포함하는 4칸 그룹을 만들 때 반드시 C와 4방향 인접 → 2G 위반
      //   → Y = 확정 안전
      //
      // 탈출 가능 경로: Y 이웃 Z가 (unknown OR 다른kmSet) 이고 dangerZone 외부
      //   단, Z가 다른 kmSet 셀이면 Z-컴포넌트와 합류하는 것이므로 탈출로 인정
      //   (Z가 C와 별도 컴포넌트 → Z 포함 그룹이 C와 인접하지 않을 수 있음)
      // =====================================================================
      function groupExpansionSafeDeductions(mineArr, safeArr){
        const kmSet=new Set([...fixedMineSet]);
        for(const s of mineArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;kmSet.add(idx(p,q));}
        const ksSet=new Set();
        for(let i=0;i<N;i++) if(asnCell[i]===0) ksSet.add(i);
        for(const s of safeArr){const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;ksSet.add(idx(p,q));}

        let changed=false;
        const visited=new Set();

        for(const start of kmSet){
          if(visited.has(start)) continue;
          const comp=[],compSet=new Set();
          const bq=[start]; visited.add(start);
          while(bq.length){
            const cur=bq.shift(); comp.push(cur); compSet.add(cur);
            for(const nb of neigh4[cur]){
              if(!visited.has(nb)&&kmSet.has(nb)){visited.add(nb);bq.push(nb);}
            }
          }
          if(comp.length>=4) continue;

          // compAdjSet: C와 직접 4방향 인접한 unknown 셀 (직접 확장 후보)
          const compAdjSet=new Set();
          for(const c of comp){
            for(const nb of neigh4[c]){
              if(!compSet.has(nb)&&unknownSet.has(nb)&&!ksSet.has(nb)&&!kmSet.has(nb)){
                compAdjSet.add(nb);
              }
            }
          }
          // dangerZone: compSet ∪ compAdjSet
          const dangerZone=new Set([...compSet,...compAdjSet]);

          // Y ∉ compAdjSet인 unknown 셀에 대해 SAFE 판정
          for(const y of unknownSet){
            if(ksSet.has(y)||kmSet.has(y)) continue;
            if(compAdjSet.has(y)) continue; // 직접 확장 후보는 대상 아님

            // Y가 dangerZone과 인접하지 않으면 이 컴포넌트와 무관
            let adjDanger=false;
            for(const nb of neigh4[y]){if(dangerZone.has(nb)){adjDanger=true;break;}}
            if(!adjDanger) continue;

            // Y의 4방향 이웃 중 dangerZone 외부로 탈출 가능한 경로 확인
            // 탈출 가능: unknown이고 dangerZone 외부 (kmSet인 경우도 포함 — 별도 컴포넌트 방향)
            let hasEscapePath=false;
            for(const nb of neigh4[y]){
              if(ksSet.has(nb)) continue;          // 안전칸 → 탈출 안됨
              if(dangerZone.has(nb)) continue;     // dangerZone 내부 → 탈출 안됨
              // unknown 또는 다른 kmSet 셀이면 탈출 가능
              if(unknownSet.has(nb)||kmSet.has(nb)){
                hasEscapePath=true;
                break;
              }
            }

            if(!hasEscapePath){
              const lb=lbl(...xy(y));
              if(!safeArr.includes(lb)){safeArr.push(lb);changed=true;}
            }
          }
        }
        return changed;
      }

      // 논리 추론: 각 미지 셀에 대해 가정 → 전파 → 모순이면 반대값 확정
      function logicDeductions(knownMines, knownSafes){
        // baseMines/baseSafes를 고정 기준으로 사용 → 누적 오탐 방지
        const toIdx=s=>{const p=s.charCodeAt(0)-65;const q=parseInt(s.slice(1))-1;return idx(p,q);};
        const baseMines=new Set(knownMines.map(toIdx));
        const baseSafes=new Set(knownSafes.map(toIdx));
        const detMines=new Set(baseMines);
        const detSafes=new Set(baseSafes);

        let changed = true;
        while(changed){
          changed = false;
          // 숫자 제약 이웃 셀에 대해서만 가정 추론 (무관한 셀은 모순 발생 불가)
          for(const cell of unknownSet){
            if(!numNeighSet.has(cell)) continue;
            if(detMines.has(cell)||detSafes.has(cell)) continue;

            // (A) 가정: cell이 지뢰 → 모순이면 SAFE
            {
              const initM = new Set(detMines); initM.add(cell);
              const res = propagateConstraints(initM, new Set(detSafes));
              if(res.contradiction){
                detSafes.add(cell);
                const[cx,cy]=xy(cell);
                if(!knownSafes.includes(lbl(cx,cy))) knownSafes.push(lbl(cx,cy));
                changed = true;
                continue;
              }
            }

            // (B) 가정: cell이 안전 → 모순이면 MINE
            {
              const initS = new Set(detSafes); initS.add(cell);
              const res = propagateConstraints(new Set(detMines), initS);
              if(res.contradiction){
                detMines.add(cell);
                const[cx,cy]=xy(cell);
                if(!knownMines.includes(lbl(cx,cy))) knownMines.push(lbl(cx,cy));
                changed = true;
              }
            }
          }
        }
      }

      // 논리 추론 실행 (전역탐색 결과와 합산)
      const preMine = mine.length, preSafe = safe.length;
      logicDeductions(mine, safe);
      const logicMine = mine.length - preMine, logicSafe = safe.length - preSafe;

      function existsSolAssuming(forcedMineCell, forcedSafeCell){
        // Returns true | false | 'budget'
        // Build filtered frontier and bg groups
        const fGroups = frontierGroups.filter(g=>!(forcedSafeCell>=0&&g.includes(forcedSafeCell)));
        const bGroups = bgGroups.filter(g=>!(forcedSafeCell>=0&&g.includes(forcedSafeCell)));

        // coveringFIdx: frontier groups covering forcedMineCell
        // coveringBIdx: bg groups covering forcedMineCell
        const coveringFIdx=new Set();
        const coveringBIdx=new Set();
        if(forcedMineCell>=0){
          for(let i=0;i<fGroups.length;i++) if(fGroups[i].includes(forcedMineCell)) coveringFIdx.add(i);
          for(let i=0;i<bGroups.length;i++) if(bGroups[i].includes(forcedMineCell)) coveringBIdx.add(i);
          // Must be coverable by at least one group somewhere
          if(coveringFIdx.size===0 && coveringBIdx.size===0) return false;
        }

        // Build conflict sets
        const afConf=Array.from({length:fGroups.length},()=>new Set());
        for(let i=0;i<fGroups.length;i++){for(let j=i+1;j<fGroups.length;j++){
          const oi=frontierGroups.indexOf(fGroups[i]),oj=frontierGroups.indexOf(fGroups[j]);
          if(oi>=0&&oj>=0&&fConflict[oi].has(oj)){afConf[i].add(j);afConf[j].add(i);}
        }}
        const abConf=Array.from({length:bGroups.length},()=>new Set());
        for(let i=0;i<bGroups.length;i++){for(let j=i+1;j<bGroups.length;j++){
          const oi=bgGroups.indexOf(bGroups[i]),oj=bgGroups.indexOf(bGroups[j]);
          if(oi>=0&&oj>=0&&bgConflict[oi].has(oj)){abConf[i].add(j);abConf[j].add(i);}
        }}
        const aCross=Array.from({length:fGroups.length},()=>[]);
        for(let fi=0;fi<fGroups.length;fi++){
          const ofi=frontierGroups.indexOf(fGroups[fi]);
          for(let bi=0;bi<bGroups.length;bi++){
            const obi=bgGroups.indexOf(bGroups[bi]);
            if(ofi>=0&&obi>=0&&crossConflict[ofi].includes(obi)) aCross[fi].push(bi);
          }
        }

        // fmCover for fixed mines (frontier only)
        const fmCover=new Map();
        for(const fm of fixedMineSet){
          const s=new Set();
          for(let i=0;i<fGroups.length;i++) if(fGroups[i].includes(fm)) s.add(i);
          if(s.size===0) return false;
          fmCover.set(fm,s);
        }

        // existsBg: check if k bg groups can be selected (with initBl blocked),
        // and if mustCoverBIdx is set, at least one selected group must be in mustCoverBIdx
        function existsBg(k, initBl, mustCoverBIdx, alreadyCoveredByFrontier){
          if(alreadyCoveredByFrontier) mustCoverBIdx=null; // already covered in frontier
          if(k===0) return mustCoverBIdx===null || mustCoverBIdx.size===0;
          const bgBl=new Uint8Array(bGroups.length);
          for(const bi of initBl) bgBl[bi]=1;
          if(mustCoverBIdx!==null){
            let can=false; for(const ci of mustCoverBIdx){if(!bgBl[ci]){can=true;break;}} if(!can) return false;
          }
          let found=false;
          function btBg(gidx,rem,covered){
            if(found) return;
            if(mustCoverBIdx!==null&&!covered){
              let can=false; for(const ci of mustCoverBIdx){if(ci>=gidx&&!bgBl[ci]){can=true;break;}} if(!can) return;
            }
            if(rem===0){ if(mustCoverBIdx===null||covered) found=true; return; }
            if(bGroups.length-gidx<rem) return;
            if(!bgBl[gidx]){
              const nb=[]; for(const ci of abConf[gidx]){if(!bgBl[ci]){bgBl[ci]=1;nb.push(ci);}}
              btBg(gidx+1,rem-1,covered||(mustCoverBIdx!==null&&mustCoverBIdx.has(gidx)));
              for(const ci of nb) bgBl[ci]=0;
            }
            if(!found) btBg(gidx+1,rem,covered);
          }
          btBg(0,k,false);
          return found;
        }

        const lms=new Set(), covFixed=new Set();
        const afBl=new Uint8Array(fGroups.length), abBF=new Uint8Array(bGroups.length);
        let lun=fixedMineSet.size, ln=0;

        function checkFullA(){
          for(const c of numCons){let m=c.fixedM;for(const j of c.vs)if(lms.has(j))m++;if(m!==c.v)return false;}
          return true;
        }

        function btA(gidx, rem, covForced){
          if(ln++>ASSUME_BUDGET) return 'budget';
          // Early prune: forcedMineCell must still be coverable by frontier
          if(forcedMineCell>=0 && !covForced && coveringFIdx.size>0){
            let can=false; for(const ci of coveringFIdx){if(ci>=gidx&&!afBl[ci]){can=true;break;}}
            // If can't cover via frontier, bg must cover — don't prune here, let existsBg handle it
            // Only prune if bg also can't cover (all bg covering groups are blocked)
            if(!can){
              let bgCan=false; for(const ci of coveringBIdx){if(!abBF[ci]){bgCan=true;break;}}
              if(!bgCan) return false;
            }
          }
          for(const[fm,s] of fmCover){
            if(covFixed.has(fm)) continue;
            let can=false; for(const ci of s){if(ci>=gidx&&!afBl[ci]){can=true;break;}} if(!can) return false;
          }
          if(lun===0&&checkFullA()){
            const bl=[]; for(let bi=0;bi<bGroups.length;bi++) if(abBF[bi]) bl.push(bi);
            const mustCov = (forcedMineCell>=0 && coveringBIdx.size>0) ? coveringBIdx : null;
            return existsBg(rem, bl, mustCov, covForced);
          }
          if(gidx>=fGroups.length||rem===0) return false;
          const g=fGroups[gidx];
          if(!afBl[gidx]){
            const nf=[]; for(const c of g) if(fixedMineSet.has(c)&&!covFixed.has(c)) nf.push(c);
            for(const c of g) lms.add(c); for(const c of nf) covFixed.add(c); lun-=nf.length;
            const nb=[]; for(const ci of afConf[gidx]){if(!afBl[ci]){afBl[ci]=1;nb.push(ci);}}
            const nbg=[]; for(const bi of aCross[gidx]){if(!abBF[bi]){abBF[bi]=1;nbg.push(bi);}}
            let ok=true;
            for(const c of numCons){
              let m=c.fixedM,avail=0;
              for(const j of c.vs){if(lms.has(j))m++;else if(unknownSet.has(j))avail++;}
              if(m>c.v||m+avail<c.v){ok=false;break;}
            }
            if(ok){
              const nc=covForced||coveringFIdx.has(gidx);
              const res=btA(gidx+1,rem-1,nc);
              if(res===true) return true;
              if(res==='budget') return 'budget';
            }
            for(const ci of nb) afBl[ci]=0; for(const bi of nbg) abBF[bi]=0;
            lun+=nf.length; for(const c of nf) covFixed.delete(c); for(const c of g) lms.delete(c);
          }
          return btA(gidx+1,rem,covForced);
        }

        return btA(0,numGroupsTotal,false);
      }

      // Collect already-determined cells to skip
      const alreadyDet = new Set();
      for(const s of mine){ const p=s.charCodeAt(0)-65; const q=parseInt(s.slice(1))-1; alreadyDet.add(idx(p,q)); }
      for(const s of safe){ const p=s.charCodeAt(0)-65; const q=parseInt(s.slice(1))-1; alreadyDet.add(idx(p,q)); }

      let assumeSafe = 0, assumeMine = 0;

      if(r !== 'budget'){
        for(const cell of unknownSet){
          if(alreadyDet.has(cell)) continue;
          const[cx,cy]=xy(cell);

          // (A) Assume cell is mine => if no solution => SAFE
          const resMine = existsSolAssuming(cell, -1);
          if(resMine === false){
            safe.push(lbl(cx,cy));
            alreadyDet.add(cell);
            assumeSafe++;
            continue;
          }

          // (B) Assume cell is safe => if no solution => MINE
          const resSafe = existsSolAssuming(-1, cell);
          if(resSafe === false){
            mine.push(lbl(cx,cy));
            alreadyDet.add(cell);
            assumeMine++;
          }
        }
      }

      checkLines.push(`deduce: mine=${mine.length} safe=${safe.length}` +
        (assumeSafe||assumeMine ? ` (assumption: +${assumeSafe}safe +${assumeMine}mine)` : ''));
      return {ok:true,checkLines,mine,safe,sol};
}
