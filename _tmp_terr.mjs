function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function smooth(t){return t*t*t*(t*(t*6-15)+10);}
function valueNoise(x,y,seed){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
  const v00=hash2(xi,yi,seed),v10=hash2(xi+1,yi,seed),v01=hash2(xi,yi+1,seed),v11=hash2(xi+1,yi+1,seed);
  const u=smooth(xf),v=smooth(yf);
  return v00*(1-u)*(1-v)+v10*u*(1-v)+v01*(1-u)*v+v11*u*v;
}
function fbm(x,y,seed,octaves){let sum=0,amp=0.5,freq=1,norm=0;for(let i=0;i<octaves;i++){sum+=amp*valueNoise(x*freq,y*freq,seed+i*1013);norm+=amp;amp*=0.5;freq*=2;}return sum/norm;}
function gen(extent,res,seed=1337){
  const h=new Float32Array(res*res);const half=extent/2;const NS=1/380;
  for(let i=0;i<res;i++){const z=half-(i/(res-1))*extent;for(let j=0;j<res;j++){const x=-half+(j/(res-1))*extent;const east=x/half,north=z/half;const bowl=Math.sqrt(east*east*0.85+north*north*0.55);const rim=smooth(Math.min(1,Math.max(0,(bowl-0.28)/0.72)));let hh=1400+320*rim;const relief=fbm(x*NS,z*NS,seed,5)-0.5;hh+=relief*70*(0.25+0.75*rim);h[i*res+j]=hh;}}
  return h;
}
function sampleHeight(h,extent,res,x,z){
  const half=extent/2;
  const u=((x+half)/extent)*(res-1), v=((half-z)/extent)*(res-1);
  const uc=Math.min(res-1,Math.max(0,u)), vc=Math.min(res-1,Math.max(0,v));
  const j0=Math.floor(uc), i0=Math.floor(vc), j1=Math.min(res-1,j0+1), i1=Math.min(res-1,i0+1);
  const fu=uc-j0, fv=vc-i0;
  const h00=h[i0*res+j0],h01=h[i0*res+j1],h10=h[i1*res+j0],h11=h[i1*res+j1];
  const top=h00+(h01-h00)*fu, bottom=h10+(h11-h10)*fu;
  return top+(bottom-top)*fv;
}
const EXTENT=4608, RES=129;
const field=gen(EXTENT,RES);
const centre=sampleHeight(field,EXTENT,RES,0,0);
const east=sampleHeight(field,EXTENT,RES,EXTENT*0.45,0);
console.log('centre',centre.toFixed(2),'east',east.toFixed(2),'diff', (east-centre).toFixed(2));
console.log('test asserts east > centre+60:', east > centre+60);
let mn=Infinity,mx=-Infinity;
for(let dx=-150;dx<=150;dx+=50)for(let dz=-150;dz<=150;dz+=50){const hh=sampleHeight(field,EXTENT,RES,dx,dz);mn=Math.min(mn,hh);mx=Math.max(mx,hh);}
console.log('CBD range', (mx-mn).toFixed(2), 'test asserts <45:', (mx-mn)<45);