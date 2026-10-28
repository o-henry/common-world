import * as THREE from 'three';

export const TEAMS = [
  {name:'Claude',color:'#d98664'}, {name:'OpenAI',color:'#e8e3dc'},
  {name:'Gemini',color:'#b29ac5'}, {name:'Grok',color:'#656570'},
  {name:'DeepSeek',color:'#7fa5cb'}, {name:'Local',color:'#a4af83'},
];

// The dual of an icosphere gives a closed network of pentagonal/hexagonal plots.
export function createWorld({detail=2}={}) {
  if(!Number.isInteger(detail)||detail<1||detail>10)throw new RangeError('World detail must be an integer from 1 to 10.');
  const geometry=new THREE.IcosahedronGeometry(1,detail),pos=geometry.attributes.position;
  const points=[], lookup=new Map(),triangles=[];
  for(let i=0;i<pos.count;i+=3){
    const ids=[];
    for(let j=0;j<3;j++){
      const p=new THREE.Vector3().fromBufferAttribute(pos,i+j).normalize();
      const key=p.toArray().map(n=>n.toFixed(5)).join(',');
      if(!lookup.has(key)){lookup.set(key,points.length);points.push({normal:p,faces:[],neighbors:new Set()});}
      ids.push(lookup.get(key));
    }
    const center=ids.reduce((v,k)=>v.add(points[k].normal),new THREE.Vector3()).normalize();
    triangles.push(center);
    for(const id of ids){points[id].faces.push(center);for(const other of ids)if(other!==id)points[id].neighbors.add(other);}
  }
  geometry.dispose();
  const seeds=[[-.7,.4,.5],[.75,.5,.2],[-.55,-.6,.35],[.8,-.5,.15],[0,.2,-1],[0,1,0]].map(v=>new THREE.Vector3(...v).normalize());
  const bias=[.19,.04,.09,.02,-.12,-.09];
  const cells=points.map((p,id)=>{
    const n=p.normal,up=Math.abs(n.y)>.95?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    const right=new THREE.Vector3().crossVectors(up,n).normalize(),top=new THREE.Vector3().crossVectors(n,right).normalize();
    const corners=[...p.faces].sort((a,b)=>Math.atan2(a.dot(top),a.dot(right))-Math.atan2(b.dot(top),b.dot(right)));
    const scores=seeds.map((seed,k)=>n.dot(seed)+bias[k]);
    return {id,normal:n,right,top,corners,neighbors:[...p.neighbors],owner:scores.indexOf(Math.max(...scores))};
  });
  const nearest=(p,filter=()=>true)=>cells.filter(filter).sort((a,b)=>b.normal.dot(p)-a.normal.dot(p))[0];
  const home=nearest(new THREE.Vector3(.14,.03,1).normalize(),c=>c.owner===0&&c.neighbors.some(id=>cells[id].owner===1));
  const target=cells[home.neighbors.filter(id=>cells[id].owner===1).sort((a,b)=>cells[b].normal.z-cells[a].normal.z)[0]];
  const music=nearest(new THREE.Vector3(-.48,.52,1).normalize(),c=>c.id!==home.id&&c.id!==target.id);
  const code=nearest(new THREE.Vector3(-.45,-.42,1).normalize(),c=>![home.id,target.id,music.id].includes(c.id));
  const calendar=nearest(new THREE.Vector3(.55,-.45,1).normalize(),c=>![home.id,target.id,music.id,code.id].includes(c.id));
  return {cells,home:home.id,target:target.id,works:[
    {id:'lumen',cellId:home.id,title:'Lumen Hop',author:'nari',ai:'Claude',cover:'/assets/lumen-hop-cover.png',description:'작은 로봇의 달빛 점프.',kind:'game',version:1},
    {id:'velvet',cellId:music.id,title:'Velvet Loop',author:'mori',ai:'Gemini',cover:'/assets/velvet-loop-cover.png',description:'손끝에서 시작되는 작은 리듬.',kind:'music',version:1},
    {id:'quiet',cellId:code.id,title:'Quiet Code',author:'jun',ai:'DeepSeek',cover:'/assets/quiet-code-cover.png',description:'코드에 집중하는 조용한 작업실.',kind:'code',version:1},
    {id:'together',cellId:calendar.id,title:'Together',author:'hae',ai:'OpenAI',cover:'/assets/together-cover.png',description:'서로의 빈 시간이 만나는 순간.',kind:'schedule',version:1},
    {id:'moonstep',cellId:target.id,title:'Moonstep',author:'sol',ai:'OpenAI',cover:'/assets/lumen-hop-cover.png',description:'같은 달 아래, 또 다른 도약.',kind:'game',version:1},
  ]};
}

// Resolve the shared cell ID even when an unclaimed cell has no separate mesh.
// Testing the spherical polygon avoids choosing a neighbor near an irregular edge.
export function cellAtNormal(cells,point){
  const direction=point.clone().normalize();
  if(!cells.length||!Number.isFinite(direction.x)||direction.lengthSq()<.5)return undefined;
  let nearest=cells[0],best=-Infinity;
  for(const cell of cells){const dot=cell.normal.dot(direction);if(dot>best){nearest=cell;best=dot;}}
  const inside=cell=>cell.corners.every((a,i)=>{
    const cross=new THREE.Vector3().crossVectors(a,cell.corners[(i+1)%cell.corners.length]);
    return cross.dot(direction)>=-1e-10;
  });
  if(inside(nearest))return nearest.id;
  const neighbors=nearest.neighbors.map(id=>cells[id]);
  return (neighbors.find(inside)||cells.find(inside)||nearest).id;
}

function capGeometry(cell,radius,inset=.014){
  const {normal:n,right,top}=cell,vertices=[],uv=[],normals=[];
  const corners=cell.corners.map(c=>c.clone().lerp(n,inset).normalize());
  const extent=Math.max(...corners.map(v=>Math.max(Math.abs(v.dot(right)),Math.abs(v.dot(top)))))*1.02;
  const add=v=>{const p=v.clone().normalize();vertices.push(p.x*radius,p.y*radius,p.z*radius);normals.push(p.x,p.y,p.z);uv.push(.5+p.dot(right)/(extent*2),.5+p.dot(top)/(extent*2));};
  const tri=(a,b,c,depth)=>{if(depth){const ab=a.clone().add(b).normalize(),bc=b.clone().add(c).normalize(),ca=c.clone().add(a).normalize();tri(a,ab,ca,depth-1);tri(ab,b,bc,depth-1);tri(ca,bc,c,depth-1);tri(ab,bc,ca,depth-1);}else{add(a);add(b);add(c);}};
  for(let i=0;i<corners.length;i++)tri(n,corners[i],corners[(i+1)%corners.length],2);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
}

export function mountWorld(container,world,{onSelect,onEmpty,onError}){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch(e){onError(e);return null;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.domElement.setAttribute('aria-label','작품 구체. 드래그로 회전하고 작품 표지를 눌러 선택하세요.');renderer.domElement.setAttribute('role','img');container.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-3.2,3.2,3.2,-3.2,.1,50);camera.position.set(0,.1,10);camera.lookAt(0,0,0);
  const group=new THREE.Group();scene.add(group);
  scene.add(new THREE.HemisphereLight(0xfffcf1,0x766275,2.25));
  const light=new THREE.DirectionalLight(0xfff3da,3.2);light.position.set(-4,6,6);scene.add(light);
  const fill=new THREE.DirectionalLight(0xc9d5ff,.55);fill.position.set(4,0,-2);scene.add(fill);
  const unclaimed=world.cells.some(cell=>cell.owner<0);
  const base=new THREE.Mesh(new THREE.SphereGeometry(2.584,64,48),new THREE.MeshStandardMaterial({color:unclaimed?'#d2c7b7':'#897777',roughness:1}));group.add(base);
  const materials=TEAMS.map(t=>new THREE.MeshStandardMaterial({color:t.color,roughness:.84,metalness:0}));
  const plots=new Map(),covers=[],textures=new Set(),workAt=new Map(world.works.map(w=>[w.cellId,w]));
  const coverAt=new Map(),textureByUrl=new Map();let disposed=false;
  const loader=new THREE.TextureLoader();
  function ensurePlot(cell,owner){
    if(!plots.has(cell.id)){
      const mesh=new THREE.Mesh(capGeometry(cell,2.6),materials[owner].clone());mesh.userData.cellId=cell.id;group.add(mesh);plots.set(cell.id,mesh);
    }
    return plots.get(cell.id);
  }
  for(const cell of world.cells){
    if(TEAMS[cell.owner])ensurePlot(cell,cell.owner);
    const work=workAt.get(cell.id);
    if(work){const material=new THREE.MeshStandardMaterial({color:'white',roughness:.9,polygonOffset:true,polygonOffsetFactor:-1});const cover=new THREE.Mesh(capGeometry(cell,2.607,.13),material);cover.userData.cellId=cell.id;group.add(cover);covers.push(cover);coverAt.set(cell.id,cover);}
  }
  const outlineMaterial=new THREE.LineBasicMaterial({color:0xfff0cc,transparent:true,opacity:.95});
  const selection=new THREE.LineLoop(new THREE.BufferGeometry(),outlineMaterial);group.add(selection);
  const factionBorders=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xfff6e6,transparent:true,opacity:.8}));group.add(factionBorders);
  const edgeMap=new Map();
  for(const cell of world.cells)for(let i=0;i<cell.corners.length;i++){
    const a=cell.corners[i],b=cell.corners[(i+1)%cell.corners.length],key=[a,b].map(v=>v.toArray().map(n=>n.toFixed(5)).join(',')).sort().join('|');
    if(!edgeMap.has(key))edgeMap.set(key,{a,b,cells:[]});edgeMap.get(key).cells.push(cell.id);
  }
  let borderLines=[];
  function outline(cell,r=2.62){const p=[];for(let i=0;i<cell.corners.length;i++){const a=cell.corners[i],b=cell.corners[(i+1)%cell.corners.length];for(let j=0;j<10;j++)p.push(a.clone().lerp(b,j/10).lerp(cell.normal,.055).normalize().multiplyScalar(r));}return new THREE.BufferGeometry().setFromPoints(p);}
  function select(id,focus=false){const cell=world.cells[id];if(!cell)return;selection.geometry.dispose();selection.geometry=outline(cell);if(focus)group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(cell.normal,new THREE.Vector3(.12,.04,1).normalize()));draw();}
  function borders(ids){for(const line of borderLines){group.remove(line);line.geometry.dispose();line.material.dispose();}borderLines=ids.map(id=>{const line=new THREE.LineLoop(outline(world.cells[id],2.625),new THREE.LineBasicMaterial({color:0x672f5f}));group.add(line);return line;});draw();}
  function updateOwners(owners){
    for(const cell of world.cells){
      const owner=owners[cell.id],team=TEAMS[owner];
      if(team){const mesh=ensurePlot(cell,owner);mesh.visible=true;mesh.material.color.set(team.color);}
      else if(plots.has(cell.id))plots.get(cell.id).visible=false;
    }
    const points=[];for(const edge of edgeMap.values())if(edge.cells.length===2&&owners[edge.cells[0]]!==owners[edge.cells[1]]&&(TEAMS[owners[edge.cells[0]]]||TEAMS[owners[edge.cells[1]]])){
      for(let i=0;i<8;i++)points.push(edge.a.clone().lerp(edge.b,i/8).normalize().multiplyScalar(2.612),edge.a.clone().lerp(edge.b,(i+1)/8).normalize().multiplyScalar(2.612));
    }
    factionBorders.geometry.dispose();factionBorders.geometry=new THREE.BufferGeometry().setFromPoints(points);draw();
  }
  function draw(){if(!disposed)renderer.render(scene,camera);}
  function setWorks(works,selectedId){
    workAt.clear();for(const work of works)workAt.set(work.cellId,work);
    const selected=works.find(w=>w.id===selectedId);if(selected)workAt.set(selected.cellId,selected);
    for(const work of works)if(!coverAt.has(work.cellId)){
      const cover=new THREE.Mesh(capGeometry(world.cells[work.cellId],2.607,.13),new THREE.MeshStandardMaterial({color:'white',roughness:.9,polygonOffset:true,polygonOffsetFactor:-1}));
      cover.userData.cellId=work.cellId;group.add(cover);covers.push(cover);coverAt.set(work.cellId,cover);
    }
    for(const [cellId,mesh]of coverAt){mesh.visible=workAt.has(cellId);}
    for(const [cellId,cover]of coverAt){const work=workAt.get(cellId);if(!work||cover.userData.url===work.cover)continue;cover.userData.url=work.cover;
      const apply=texture=>{if(disposed||cover.userData.url!==work.cover)return;cover.material.map=texture;cover.material.needsUpdate=true;draw();};
      const cached=textureByUrl.get(work.cover);
      if(cached){if(cached.texture)apply(cached.texture);else cached.waiting.push(apply);continue;}
      const pending={texture:null,waiting:[apply]};textureByUrl.set(work.cover,pending);
      const texture=loader.load(work.cover,loaded=>{
        if(disposed)return;
        loaded.colorSpace=THREE.SRGBColorSpace;loaded.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
        const image=loaded.image;if(image.width>image.height){loaded.repeat.x=image.height/image.width;loaded.offset.x=(1-loaded.repeat.x)/2;}
        pending.texture=loaded;for(const attach of pending.waiting)attach(loaded);pending.waiting=[];
      },undefined,()=>{pending.waiting=[];if(!disposed)onError(new Error('작품 표지 일부를 불러오지 못했습니다.'));});
      textures.add(texture);
    }
  }
  function resize(){const {width,height}=container.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);const a=width/height,half=2.98;camera.left=-half*a;camera.right=half*a;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();draw();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let drag=null;
  function pick(e){
    const b=renderer.domElement.getBoundingClientRect();if(!b.width||!b.height)return undefined;
    pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);group.updateMatrixWorld(true);
    const hit=ray.intersectObjects([...covers.filter(mesh=>mesh.visible),...[...plots.values()].filter(mesh=>mesh.visible),base],false)[0];
    if(!hit)return undefined;
    return hit.object===base?cellAtNormal(world.cells,group.worldToLocal(hit.point.clone())):hit.object.userData.cellId;
  }
  const down=e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};renderer.domElement.setPointerCapture(e.pointerId);};
  const move=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;if(drag.moved){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(dy*.005,dx*.005,0,'XYZ'));group.quaternion.premultiply(q);draw();}drag.x=e.clientX;drag.y=e.clientY;};
  const up=e=>{if(!drag)return;const click=!drag.moved;drag=null;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);if(click){const id=pick(e);if(id!==undefined){const work=workAt.get(id);if(work)onSelect(work.id);else onEmpty(id);}}};
  const cancel=()=>{drag=null;};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  const contextLost=e=>{e.preventDefault();onError(new Error('3D 표시가 중단됐습니다. 아래 작품 목록으로 계속 이용할 수 있습니다.'));};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  setWorks(world.works,'lumen');updateOwners(world.cells.map(c=>c.owner));select(world.home,false);resize();
  return {select,borders,updateOwners,setWorks,turn(direction){group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),direction*.3));draw();},dispose(){disposed=true;observer.disconnect();for(const [name,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['webglcontextlost',contextLost]])renderer.domElement.removeEventListener(name,fn);scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.dispose();});for(const t of textures)t.dispose();materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();}};
}
