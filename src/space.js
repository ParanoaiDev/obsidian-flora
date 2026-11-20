/* ------------------------------------------------------------------ */
/* Space Neurons — заметки хранилища как космос: чёрная дыра с          */
/* искривлённым светом или белая звезда, кометы, кольца, бусины света   */
/* по связям. Свой WebGL2-рендер с HDR-свечением, без зависимостей.     */
/* ------------------------------------------------------------------ */
const FSpace = (function () {
  "use strict";
  const GOLD = 2.399963229728653;
  const FOV = (44 * Math.PI) / 180;
  const THEMES = ["hole", "star"];
  const COLORS = [
    ["auto", null], ["white", "#ffffff"], ["green", "#5df2a0"], ["ice", "#9fdcff"],
    ["violet", "#b49bff"], ["amber", "#ffc46b"], ["rose", "#ff8fa8"],
  ];
  const DEFAULTS = {
    theme: "hole", color: "auto", glow: 1, glowSize: 0.6, nodeSize: 1.4, links: 0.5, rings: -1,
    beads: 500, beadSpeed: 1.5, spin: 0.4, comets: true, pulse: true, stars: true, names: true, sky: "auto", jets: true, debris: true,
    ai: false, saveGpu: true, quality: "high",
  };
  const GN = (function () { const v = [0.6, 0.8, -0.1], l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); })();   // плоскость Млечного Пути
  const SKIES = ["auto", "nebula", "milky", "dark"];
  const QUALITY = { fast: { scale: 0.6, steps: 60, mips: 4, dust: 3000 }, high: { scale: 0.85, steps: 110, mips: 5, dust: 7000 }, max: { scale: 1, steps: 170, mips: 6, dust: 12000 } };
  const AIG = "\x01ai", ROOTG = "\x01root", OTHERG = "\x01other";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lin = (hex) => NG.hexRgb(hex).map((c) => Math.pow(c / 255, 2.2));
  const links = (n) => floraNum(n) + " " + plural(n, ["связь", "связи", "связей"], ["link", "links"]);
  const notes = (n) => floraNum(n) + " " + plural(n, ["заметка", "заметки", "заметок"], ["note", "notes"]);

  /* ---------- матрицы (по столбцам) ---------- */
  function persp(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  }
  function lookAt(o, e, c) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let sx = -fz, sy = 0, sz = fx;
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    o[0] = sx; o[1] = ux; o[2] = -fx; o[3] = 0;
    o[4] = sy; o[5] = uy; o[6] = -fy; o[7] = 0;
    o[8] = sz; o[9] = uz; o[10] = -fz; o[11] = 0;
    o[12] = -(sx * e[0] + sy * e[1] + sz * e[2]); o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); o[14] = fx * e[0] + fy * e[1] + fz * e[2]; o[15] = 1;
    return { r: [sx, sy, sz], u: [ux, uy, uz], f: [fx, fy, fz] };
  }
  function mul(o, a, b) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  }
  function rotY(o, a) { o.fill(0); const c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1; }

  /* ---------- раскладка: группы — облака вокруг центра ---------- */
  function gauss(rnd) { const u = Math.max(1e-6, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
  function layout(m, theme) {
    const N = m.N, G = m.groups.length, P = new Float32Array(N * 3);
    const star = theme === "star";
    // чем больше хранилище, тем крупнее дыра, чтобы облако её не съело
    const hk = clamp(Math.pow(Math.max(1, N) / 500, 0.25), 1, 1.8);
    const Rg = (star ? 52 + 7 * Math.sqrt(G) : 104 + 9 * Math.sqrt(G)) * Math.sqrt(hk);
    const minR = (star ? 42 : 92) * hk;
    const C = m.groups.map((g, i) => {
      if (G === 1) return [0, 0, 0];
      const y = 1 - (2 * (i + 0.5)) / G, r = Math.sqrt(1 - y * y), th = i * GOLD + 0.7;
      return [Math.cos(th) * r * Rg, y * Rg * (star ? 0.95 : 0.62), Math.sin(th) * r * Rg];
    });
    for (let i = 0; i < N; i++) {
      const g = m.gi[i], rnd = NG.rand(m.nodes[i].id + "|" + theme);
      const n = m.groups[g].count;
      const sg = (G === 1 ? Rg * 0.7 : (star ? 7 : 10) + 2.3 * Math.sqrt(n)) * (0.55 + 0.45 * rnd());
      P[3 * i] = C[g][0] + gauss(rnd) * sg;
      P[3 * i + 1] = C[g][1] + gauss(rnd) * sg * (star ? 1 : 0.8);
      P[3 * i + 2] = C[g][2] + gauss(rnd) * sg;
    }
    // связанные заметки слегка тянутся друг к другу
    const Q = new Float32Array(N * 3);
    for (let it = 0; it < 3; it++) {
      Q.set(P);
      for (let i = 0; i < N; i++) {
        const a = m.adj[i], k = a.length;
        if (!k) continue;
        let x = 0, y = 0, z = 0;
        for (const j of a) { x += Q[3 * j]; y += Q[3 * j + 1]; z += Q[3 * j + 2]; }
        const w = Math.min(0.3, 0.06 * k);
        P[3 * i] += (x / k - Q[3 * i]) * w; P[3 * i + 1] += (y / k - Q[3 * i + 1]) * w; P[3 * i + 2] += (z / k - Q[3 * i + 2]) * w;
      }
    }
    // пустота вокруг дыры или звезды
    for (let i = 0; i < N; i++) {
      let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      let r = Math.hypot(x, y, z);
      if (r < 1e-3) { const rnd = NG.rand(m.nodes[i].id); x = rnd() - 0.5; y = rnd() - 0.5; z = rnd() - 0.5; r = Math.hypot(x, y, z) || 1; }
      if (r < minR) { const k = (minR + (minR - r) * 0.35) / r; P[3 * i] = x * k; P[3 * i + 1] = y * k; P[3 * i + 2] = z * k; }
    }
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(Math.hypot(P[3 * i], P[3 * i + 1], P[3 * i + 2]));
    rs.sort((a, b) => a - b);
    const R = rs.length ? rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.95))] : 0;
    // у плоскости диска оставляем тонкий просвет, чтобы диск было видно с ребра
    if (!star) for (let i = 0; i < N; i++) {
      const y = P[3 * i + 1], rx = Math.hypot(P[3 * i], P[3 * i + 2]), gap = 14 * hk;
      if (Math.abs(y) < gap && rx < 200 * hk) P[3 * i + 1] = (y < 0 ? -1 : 1) * (gap + Math.abs(y) * 0.6);
    }
    return { P, R: Math.max(R, star ? 40 : 130), hs: 8 * hk };
  }

  /* ---------- шейдеры ---------- */
  const HEAD = "#version 300 es\nprecision highp float;\n";
  const NOISE = "float h3(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}\n" +
    "float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}\n" +
    "float fbm(vec3 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}\n";
  const OCC = "float occ(vec3 w){vec3 tn=w-u_cam;float dn=length(tn);vec3 dir=tn/dn;float tc=dot(-u_cam,dir);float pr=length(-u_cam-dir*tc);return (u_occ>0.0&&dn>tc&&tc>0.0)?smoothstep(u_occ*0.85,u_occ*1.25,pr):1.0;}\n";
  // небо: звёзды трёх величин, Млечный Путь с пылью или туманность; то же небо дыра искривляет
  const SKY = "uniform vec3 u_tint,u_tint2,u_gn;uniform float u_neb,u_time,u_pix,u_stars;uniform int u_bg,u_oct;\n" +
    "vec3 h33(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}\n" +
    "float fbs(vec3 p){float a=0.5,s=0.0;for(int i=0;i<6;i++){if(i>=u_oct)break;s+=a*n3(p);p=p*2.07+vec3(1.7,9.2,3.1);a*=0.5;}return s;}\n" +
    "vec3 starL(vec3 d,float sc,float pr,float br){vec3 id=floor(d*sc);vec3 h=h33(id);if(h.x>pr)return vec3(0.0);\n" +
    " vec3 sd=normalize(id+0.5+(h33(id+17.0)-0.5)*0.3);float a=length(d-sd);float mg=pow(h.y,7.0);float r=min(u_pix*(0.75+1.2*mg),0.28/sc);\n" +
    " float tw=0.82+0.18*sin(u_time*(1.3+h.z*3.0)+h.z*61.0);float I=exp(-a*a/(r*r))*(0.2+9.0*mg)*br*tw;\n" +
    " vec3 c=h.z<0.3?vec3(0.62,0.74,1.0):h.z<0.8?vec3(1.0,0.97,0.92):vec3(1.0,0.78,0.52);return mix(c,vec3(1.0),0.35)*I;}\n" +
    "vec3 sky(vec3 d){vec3 col=vec3(0.0);\n" +
    " float lat=dot(d,u_gn);float band=exp(-lat*lat*9.0);\n" +
    " if(u_stars>0.5){float k=u_bg==1?1.0+band*3.0:1.0;col+=starL(d,300.0,0.0022,1.0)+starL(d,640.0,0.0011*k,0.6)+starL(d,130.0,0.0045,1.5);}\n" +
    " if(u_bg==2)return col;\n" +
    " vec3 q=vec3(fbs(d*1.6),fbs(d*1.6+vec3(5.2,1.3,2.8)),fbs(d*1.6+vec3(1.7,9.2,4.1)));\n" +
    " float n=fbs(d*2.3+q*2.4+vec3(0.0,u_time*0.004,0.0));\n" +
    " if(u_bg==1){float core=exp(-lat*lat*42.0);float dust=smoothstep(0.40,0.74,fbs(d*5.5+q*1.6))*exp(-lat*lat*26.0);\n" +
    "  float grain=n3(d*90.0)*0.4+n3(d*260.0)*0.35+pow(n3(d*700.0),4.0)*1.2;\n" +
    "  vec3 glow=mix(u_tint2,u_tint,clamp(core*0.9+0.3*q.x,0.0,1.0))*(band*(0.45+0.55*n)*(0.75+0.5*grain)+core*0.7);\n" +
    "  glow*=1.0-0.9*dust;col*=1.0-0.6*dust;\n" +
    "  col+=glow*u_neb+vec3(0.85,0.38,0.62)*pow(smoothstep(0.55,0.95,n),2.0)*0.35*u_neb*band;\n" +
    " }else{float smoke=smoothstep(0.32,1.0,n);float dark=smoothstep(0.42,0.78,fbs(d*3.6+q*3.0));\n" +
    "  vec3 c=mix(u_tint2,u_tint,smoothstep(0.25,0.85,q.y))*smoke*(1.0-0.75*dark);\n" +
    "  c+=u_tint*pow(smoothstep(0.62,1.0,n),3.0)*0.9;col=col*(1.0-0.55*dark*smoke)+c*u_neb;}\n" +
    " return col;}\n";
  const SH = {
    full: HEAD + "out vec2 v_uv;void main(){vec2 p=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);v_uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}",
    sky: HEAD + NOISE + SKY + "in vec2 v_uv;out vec4 o;uniform vec3 u_r,u_u,u_f;uniform vec2 u_tan;\n" +
      "void main(){vec2 q=v_uv*2.0-1.0;vec3 d=normalize(u_f+q.x*u_tan.x*u_r+q.y*u_tan.y*u_u);o=vec4(sky(d),1.0);}",
    // чёрная дыра: луч из камеры гнётся вокруг горизонта (rs = 1), диск в плоскости y = 0
    holeV: HEAD + "layout(location=0) in vec2 a_c;uniform mat4 u_vp;uniform vec3 u_r,u_u;uniform float u_size;out vec3 v_w;\n" +
      "void main(){vec3 w=(a_c.x*u_r+a_c.y*u_u)*u_size;v_w=w;gl_Position=u_vp*vec4(w,1.0);}",
    holeF: HEAD + NOISE + SKY + "in vec3 v_w;out vec4 o;uniform vec3 u_cam,u_hot,u_warm;uniform float u_bright,u_hs,u_bb;uniform int u_steps;\n" +
      "const float RB=28.0,RIN=2.6,ROUT=24.0;\n" +
      // цвет раскалённого газа по температуре (со смещением частоты)
      "vec3 bbc(float t){t=clamp(t,0.0,2.2);vec3 c=mix(vec3(0.85,0.16,0.03),vec3(1.0,0.46,0.14),smoothstep(0.2,0.75,t));c=mix(c,vec3(1.0,0.78,0.55),smoothstep(0.7,1.1,t));c=mix(c,vec3(1.0,0.96,0.9),smoothstep(1.05,1.45,t));return mix(c,vec3(0.74,0.85,1.0),smoothstep(1.5,2.1,t)*0.75);}\n" +
      "vec3 dcol(float t){return u_bb>0.5?bbc(t):mix(u_warm*0.55,u_hot,clamp(t*0.8,0.0,1.0));}\n" +
      "vec3 disk(vec3 p,vec3 v,out float a){float r=length(p.xz);float th=atan(p.z,p.x);float om=pow(r,-1.5);\n" +
      " float sw=th+u_time*om*1.5;vec2 cs=vec2(cos(sw),sin(sw));\n" +
      " float ring=n3(vec3(cs*0.9,r*6.0))*0.5+n3(vec3(cs*1.7,r*15.0))*0.3+n3(vec3(cs*3.2,r*38.0))*0.2;\n" +
      " float sp=sw+2.2*log(r);float clump=fbm(vec3(cos(sp)*1.8,sin(sp)*1.8,r*0.9));\n" +
      " float gaps=smoothstep(0.3,0.62,n3(vec3(cs*0.6,r*2.2+7.0)))*smoothstep(0.15,0.5,n3(vec3(cs*1.1,r*5.5+3.0)));\n" +
      " float dens=clamp((ring*1.15+clump*0.85-0.5)*(0.12+0.88*gaps)*1.8,0.0,1.7);\n" +
      " float x=clamp((r-RIN)/(ROUT-RIN),0.0,1.0);float edge=smoothstep(0.0,0.012,x)*pow(1.0-x,1.7);\n" +
      " float Tm=pow(RIN/r,0.75)*pow(max(0.0,1.0-sqrt(RIN*0.97/r)),0.25)*1.9;\n" +
      " vec3 vd=normalize(vec3(-p.z,0.0,p.x));float b=sqrt(0.5/r);float ct=dot(vd,-normalize(v));\n" +
      " float D=sqrt(1.0-b*b)/(1.0-b*ct);float g=sqrt(max(0.0,1.0-1.0/r))*D;\n" +
      " float I=(0.025+pow(Tm,2.6)*3.6)*pow(g,3.5);\n" +
      " a=clamp(edge*min(dens,1.0)*(0.15+0.85*smoothstep(0.35,0.9,1.0-x)),0.0,0.985);\n" +
      " return dcol(Tm*g)*I*dens*edge*u_bright;}\n" +
      "void main(){vec3 ro=u_cam/u_hs;vec3 rd=normalize(v_w-u_cam);float b=dot(ro,rd),c=dot(ro,ro)-RB*RB,h=b*b-c;if(h<0.0)discard;\n" +
      " float t0=max(0.0,-b-sqrt(h));vec3 p=ro+rd*t0,v=rd;vec3 hh=cross(p,v);float h2=dot(hh,hh);float b0=sqrt(h2);\n" +
      " vec3 acc=vec3(0.0);float al=0.0;float rmin=1e9;float gl=0.0;bool hit=false;float sc=100.0/float(u_steps);vec3 pm=p,vm=v;\n" +
      " for(int i=0;i<220;i++){if(i>=u_steps)break;float r=length(p);if(r<rmin){rmin=r;pm=p;vm=v;}if(r<1.0){hit=true;break;}\n" +
      "  if(r>RB+0.05&&dot(p,v)>0.0)break;float dt=clamp((r-0.95)*0.14,0.02,2.0)*sc;\n" +
      // светящийся газ над и под диском
      "  float rx=length(p.xz);float hg=0.06+0.075*rx;gl+=(1.0-al)*exp(-p.y*p.y/(hg*hg))*smoothstep(RIN*0.85,RIN*1.35,rx)*pow(RIN/max(rx,RIN),1.7)*(1.0-smoothstep(ROUT*0.5,ROUT,rx))*dt;\n" +
      "  v+=-0.75*h2*p/pow(r,5.0)*dt;vec3 np=p+v*dt;float r2=length(np);v+=-0.75*h2*np/pow(max(r2,0.5),5.0)*dt;\n" +
      "  if(p.y*np.y<0.0){float f=p.y/(p.y-np.y);vec3 q=mix(p,np,f);float rq=length(q.xz);\n" +
      "   if(rq>RIN&&rq<ROUT){float da;vec3 dc=disk(q,v,da);acc+=(1.0-al)*dc;al+=(1.0-al)*da;if(al>0.985)break;}}\n" +
      "  p=np;}\n" +
      " acc+=dcol(0.95)*gl*0.05*u_bright;\n" +
      // фотонное кольцо у края тени
      " float pr=(b0-2.598);float ra=1.0+0.75*dot(normalize(vec3(-pm.z,0.0,pm.x)+1e-5),-normalize(vm));acc+=(1.0-al)*dcol(1.15)*(exp(-pr*pr*1400.0)*1.15+exp(-pr*pr*40.0)*0.16)*ra*ra*u_bright;\n" +
      " if(hit)al=1.0;else{acc+=(1.0-al)*dcol(0.7)*0.35*u_bright*exp(-(rmin-1.45)*2.4);\n" +
      "  float w=1.0-smoothstep(RB*0.5,RB*0.98,b0);acc+=(1.0-al)*w*sky(normalize(v));al+=(1.0-al)*w;}\n" +
      " o=vec4(acc,al);}",
    // джеты из полюсов: лента, повёрнутая к камере
    jetV: HEAD + "uniform mat4 u_vp;uniform vec3 u_cam,u_r;uniform float u_hs,u_segs,u_len;out vec2 v_q;out vec3 v_w;\n" +
      "void main(){int ns=int(u_segs)*6;int id=gl_VertexID;int jet=id/ns;int rem=id-jet*ns;int sg=rem/6;int k=rem-sg*6;\n" +
      " float tt=(k==1||k==4||k==5)?1.0:0.0;float sd=(k==2||k==3||k==5)?1.0:-1.0;float t=(float(sg)+tt)/u_segs;float s=jet==0?1.0:-1.0;\n" +
      " vec3 p=vec3(0.0,s*u_hs*(3.0+t*u_len),0.0);vec3 tc=u_cam-p;vec3 sv=cross(vec3(0.0,1.0,0.0),tc);float sl=length(sv);sv=sl>1e-3?sv/sl:u_r;\n" +
      " float w=u_hs*(0.5+0.1*t*u_len);vec3 wp=p+sv*sd*w;v_q=vec2(sd,t);v_w=wp;gl_Position=u_vp*vec4(wp,1.0);}",
    jetF: HEAD + NOISE + "in vec2 v_q;in vec3 v_w;out vec4 o;uniform float u_time,u_jet,u_occ;uniform vec3 u_cam,u_tint;\n" + OCC +
      "void main(){float x=v_q.x,t=v_q.y;float n=n3(vec3(x*1.6,t*16.0-u_time*2.2,0.0))*0.6+n3(vec3(x*4.0,t*46.0-u_time*5.0,3.0))*0.4;\n" +
      " float core=exp(-x*x*30.0)*0.8;float sh=exp(-x*x*5.0)*0.4;float fall=pow(1.0-t,2.4)*smoothstep(0.0,0.05,t)*(1.0+exp(-t*18.0)*3.0);\n" +
      " float knots=0.35+1.1*pow(n3(vec3(0.0,t*9.0-u_time*1.3,7.0)),2.0);float I=(core*(0.4+0.9*n)*knots+sh*n*n)*fall*u_jet;o=vec4(u_tint*I*occ(v_w),0.0);}",
    // обломки на орбитах: внутренние летят быстрее внешних
    dustV: HEAD + "layout(location=0) in vec3 a_p;layout(location=1) in vec4 a_c;layout(location=2) in vec2 a_m;\n" +
      "uniform mat4 u_vp;uniform float u_time,u_hs,u_px,u_occ;uniform vec3 u_cam;out vec4 v_c;out float v_k;out float v_s;\n" + OCC +
      "void main(){float r=a_p.x;float th=a_p.y+u_time*pow(r,-1.5)*1.5;vec3 w=u_hs*vec3(r*cos(th),a_p.z*r,r*sin(th));\n" +
      " gl_Position=u_vp*vec4(w,1.0);float px=a_c.a*u_hs*u_px/max(gl_Position.w,0.5);float sz=clamp(px,0.8,6.0);gl_PointSize=sz*2.6;v_k=1.0/2.6;v_s=0.0;\n" +
      " float tw=0.75+0.25*sin(u_time*(0.7+a_m.x*2.0)+a_m.x*40.0);v_c=vec4(a_c.rgb,a_m.y*tw*occ(w)*min(1.0,px/0.8));}",
    // белая звезда в центре
    coreF: HEAD + "in vec3 v_w;out vec4 o;uniform vec3 u_tint;uniform float u_size,u_glow,u_gs,u_time;\n" +
      "void main(){vec2 q=v_w.xy;float r=length(v_w)/u_size;if(r>1.0)discard;float fl=1.0+0.04*sin(u_time*2.3)+0.03*sin(u_time*5.1);\n" +
      " float c=smoothstep(0.13,0.11,r)*7.0*fl+exp(-r*r*260.0)*1.2+exp(-r*(22.0-10.0*u_gs))*0.8*u_glow+exp(-r*5.0)*0.05*u_glow;c*=(1.0-r*r);\n" +
      " o=vec4(u_tint*c,0.0);}",
    pointV: HEAD + "layout(location=0) in vec3 a_p;layout(location=1) in vec4 a_c;layout(location=2) in vec2 a_m;\n" +
      "uniform mat4 u_vp,u_m;uniform float u_px,u_size,u_gs,u_time,u_pulse,u_dim,u_occ,u_min;uniform vec3 u_cam;out vec4 v_c;out float v_k;out float v_s;\n" + OCC +
      "void main(){vec4 w=u_m*vec4(a_p,1.0);gl_Position=u_vp*w;float px=a_c.a*u_size*u_px/max(gl_Position.w,0.5);\n" +
      " float sz=clamp(px,u_min,28.0);float sp=min(sz*(2.0+3.2*u_gs)+smoothstep(6.0,16.0,sz)*sz*1.5,160.0);gl_PointSize=sp;v_k=sz/sp;v_s=smoothstep(6.0,16.0,sz)*0.3;\n" +
      " float pulse=u_pulse*pow(max(0.0,sin(u_time*(0.25+a_m.x*0.5)+a_m.x*91.0)),80.0)*2.5;\n" +
      " float b=a_m.y>1.5?2.2:(a_m.y<0.5?u_dim:(a_m.y>1.2?1.5:1.0));\n" +
      " v_c=vec4(a_c.rgb,b*(1.0+pulse)*occ(w.xyz)*min(1.0,px/u_min));}",
    pointF: HEAD + "in vec4 v_c;in float v_k;in float v_s;out vec4 o;uniform float u_halo;\n" +
      "void main(){vec2 q=gl_PointCoord*2.0-1.0;float r2=dot(q,q);if(r2>1.0)discard;float k=max(v_k,0.02);float r=sqrt(r2);\n" +
      " float core=exp(-r2/(k*k)*2.2);float halo=exp(-r*(5.0+4.0*k))*(1.0-r2)*u_halo;\n" +
      " float spk=(exp(-abs(q.y)/k*6.0)+exp(-abs(q.x)/k*6.0))*pow(1.0-r,3.0)*v_s;\n" +
      " o=vec4(v_c.rgb*(core*1.3+halo+spk)*v_c.a,0.0);}",
    // сглаженные линии: каждая связь — лента из отрезков вдоль мягкой дуги
    ribV: HEAD + "layout(location=0) in vec3 a_a;layout(location=1) in vec3 a_b;layout(location=2) in vec4 a_c;layout(location=3) in vec2 a_x;\n" +
      "uniform mat4 u_vp,u_m;uniform vec2 u_res;uniform float u_segs,u_w,u_alpha,u_occ;uniform vec3 u_cam;out vec4 v_c;out float v_d;out float v_w;\n" + OCC +
      "void main(){int id=gl_VertexID;int sg=id/6;int k=id-sg*6;float tt=(k==1||k==4||k==5)?1.0:0.0;float sd=(k==2||k==3||k==5)?1.0:-1.0;\n" +
      " float t=(float(sg)+tt)/u_segs;vec3 mid=(a_a+a_b)*0.5;float len=length(a_b-a_a);float ml=length(mid);\n" +
      " vec3 c=mid+(ml>1e-3?mid/ml:vec3(0.0,1.0,0.0))*len*a_x.x;\n" +
      " vec3 p=mix(mix(a_a,c,t),mix(c,a_b,t),t);vec3 tg=2.0*(1.0-t)*(c-a_a)+2.0*t*(a_b-c);\n" +
      " vec4 w=u_m*vec4(p,1.0);vec4 c0=u_vp*w;vec4 c1=u_vp*(u_m*vec4(p+tg*0.01,1.0));\n" +
      " if(c0.w<0.5){gl_Position=vec4(2.0,2.0,2.0,1.0);v_c=vec4(0.0);v_d=0.0;v_w=1.0;return;}\n" +
      " vec2 s0=c0.xy/c0.w*u_res*0.5;vec2 s1=c1.xy/max(c1.w,0.01)*u_res*0.5;vec2 dr=s1-s0;float dl=length(dr);dr=dl>1e-6?dr/dl:vec2(1.0,0.0);\n" +
      " float wp=u_w*a_x.y;float wd=max(wp,1.0);float hf=wd*0.5+1.0;c0.xy+=vec2(-dr.y,dr.x)*sd*hf/(u_res*0.5)*c0.w;gl_Position=c0;\n" +
      " v_d=sd*hf;v_w=wd;float ends=0.65+0.35*abs(t*2.0-1.0);\n" +
      " v_c=vec4(a_c.rgb,a_c.a*u_alpha*occ(w.xyz)*ends*(wp/wd));}",
    ribF: HEAD + "in vec4 v_c;in float v_d;in float v_w;out vec4 o;void main(){float a=clamp(v_w*0.5+0.5-abs(v_d),0.0,1.0);o=vec4(v_c.rgb*v_c.a*a,0.0);}",
    beadV: HEAD + "layout(location=0) in vec3 a_a;layout(location=1) in vec3 a_b;layout(location=2) in vec4 a_s;\n" +
      "uniform mat4 u_vp,u_m;uniform float u_px,u_time,u_speed,u_size,u_occ,u_bend;uniform vec3 u_tint,u_cam;out vec4 v_c;out float v_k;out float v_s;\n" + OCC +
      "void main(){float f=fract(a_s.x+u_time*u_speed*a_s.y);vec3 mid=(a_a+a_b)*0.5;float ml=length(mid);vec3 c=mid+(ml>1e-3?mid/ml:vec3(0,1,0))*length(a_b-a_a)*u_bend;\n" +
      " vec4 w=u_m*vec4(mix(mix(a_a,c,f),mix(c,a_b,f),f),1.0);gl_Position=u_vp*w;\n" +
      " float px=clamp(a_s.z*u_size*u_px/max(gl_Position.w,0.5),1.0,16.0);gl_PointSize=px*3.0;v_k=1.0/3.0;v_s=0.0;\n" +
      " v_c=vec4(u_tint,sin(3.14159*f)*a_s.w*occ(w.xyz));}",
    // хвост кометы — сужающаяся лента
    tailV: HEAD + "layout(location=0) in vec4 a_o;layout(location=1) in vec3 a_n;\n" +
      "uniform mat4 u_vp;uniform vec2 u_res;uniform float u_time,u_segs,u_w,u_occ;uniform vec3 u_tint,u_cam;out vec4 v_c;out float v_d;out float v_w;\n" + OCC +
      "vec3 orb(float u){vec3 n=normalize(a_n);vec3 e1=normalize(cross(n,abs(n.y)<0.9?vec3(0,1,0):vec3(1,0,0)));vec3 e2=cross(n,e1);\n" +
      " float an=a_o.z+u_time*a_o.y-u*a_o.w*sign(a_o.y);float rr=a_o.x*(1.0+0.06*sin(an+a_o.z));return rr*(cos(an)*e1+sin(an)*e2);}\n" +
      "void main(){int id=gl_VertexID;int sg=id/6;int k=id-sg*6;float tt=(k==1||k==4||k==5)?1.0:0.0;float sd=(k==2||k==3||k==5)?1.0:-1.0;\n" +
      " float u=(float(sg)+tt)/u_segs;vec3 p=orb(u);vec4 c0=u_vp*vec4(p,1.0);vec4 c1=u_vp*vec4(orb(u+0.004),1.0);\n" +
      " if(c0.w<0.5){gl_Position=vec4(2.0,2.0,2.0,1.0);v_c=vec4(0.0);v_d=0.0;v_w=1.0;return;}\n" +
      " vec2 s0=c0.xy/c0.w*u_res*0.5;vec2 s1=c1.xy/max(c1.w,0.01)*u_res*0.5;vec2 dr=s1-s0;float dl=length(dr);dr=dl>1e-6?dr/dl:vec2(1.0,0.0);\n" +
      " float wp=u_w*(pow(1.0-u,1.4)*1.6+0.25);float wd=max(wp,1.0);float hf=wd*0.5+1.0;c0.xy+=vec2(-dr.y,dr.x)*sd*hf/(u_res*0.5)*c0.w;gl_Position=c0;\n" +
      " v_d=sd*hf;v_w=wd;v_c=vec4(u_tint,pow(1.0-u,1.8)*0.95*occ(p)*(wp/wd));}",
    cometV: HEAD + "layout(location=0) in vec4 a_o;layout(location=1) in vec3 a_n;layout(location=2) in float a_u;\n" +
      "uniform mat4 u_vp;uniform float u_time,u_px,u_occ;uniform vec3 u_tint,u_cam;out vec4 v_c;out float v_k;out float v_s;\n" + OCC +
      "void main(){vec3 n=normalize(a_n);vec3 e1=normalize(cross(n,abs(n.y)<0.9?vec3(0,1,0):vec3(1,0,0)));vec3 e2=cross(n,e1);\n" +
      " float an=a_o.z+u_time*a_o.y;float rr=a_o.x*(1.0+0.06*sin(an+a_o.z));vec3 w=rr*(cos(an)*e1+sin(an)*e2);\n" +
      " gl_Position=u_vp*vec4(w,1.0);gl_PointSize=clamp(2.2*u_px/gl_Position.w,2.5,18.0)*3.0;v_k=1.0/3.0;v_s=0.3;\n" +
      " v_c=vec4(u_tint,1.5*occ(w));}",
    bright: HEAD + "in vec2 v_uv;out vec4 o;uniform sampler2D u_t;void main(){vec3 c=texture(u_t,v_uv).rgb;float b=max(c.r,max(c.g,c.b));o=vec4(c*max(0.0,b-0.9)/max(b,1e-4),1.0);}",
    down: HEAD + "in vec2 v_uv;out vec4 o;uniform sampler2D u_t;uniform vec2 u_px;\n" +
      "void main(){vec3 c=texture(u_t,v_uv+u_px*vec2(-1,-1)).rgb+texture(u_t,v_uv+u_px*vec2(1,-1)).rgb+texture(u_t,v_uv+u_px*vec2(-1,1)).rgb+texture(u_t,v_uv+u_px*vec2(1,1)).rgb;o=vec4(c*0.25,1.0);}",
    up: HEAD + "in vec2 v_uv;out vec4 o;uniform sampler2D u_t;uniform vec2 u_px;\n" +
      "void main(){vec3 c=texture(u_t,v_uv).rgb*4.0;c+=(texture(u_t,v_uv+vec2(u_px.x,0)).rgb+texture(u_t,v_uv-vec2(u_px.x,0)).rgb+texture(u_t,v_uv+vec2(0,u_px.y)).rgb+texture(u_t,v_uv-vec2(0,u_px.y)).rgb)*2.0;\n" +
      " c+=texture(u_t,v_uv+u_px).rgb+texture(u_t,v_uv-u_px).rgb+texture(u_t,v_uv+vec2(u_px.x,-u_px.y)).rgb+texture(u_t,v_uv+vec2(-u_px.x,u_px.y)).rgb;o=vec4(c/16.0,1.0);}",
    comp: HEAD + "in vec2 v_uv;out vec4 o;uniform sampler2D u_s,u_b;uniform float u_bk;\n" +
      "vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}\n" +
      "void main(){vec3 c=texture(u_s,v_uv).rgb+texture(u_b,v_uv).rgb*u_bk;c=aces(c*1.1);vec2 q=v_uv-0.5;c*=1.0-dot(q,q)*0.55;\n" +
      " c=pow(c,vec3(1.0/2.2));float d=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)/255.0;o=vec4(c+d,1.0);}",
  };

  /* ------------------------------------------------------------------ */
  class Scene {
    constructor(host, opts) {
      this.host = host; this.opts = opts || {};
      this.doc = host.ownerDocument; this.win = this.doc.defaultView || window;
      this.s = Object.assign({}, DEFAULTS, this.opts.settings || {});
      if (THEMES.indexOf(this.s.theme) < 0) this.s.theme = DEFAULTS.theme;
      if (!QUALITY[this.s.quality]) this.s.quality = DEFAULTS.quality;
      if (SKIES.indexOf(this.s.sky) < 0) this.s.sky = "auto";
      this.reduced = !!(this.win.matchMedia && this.win.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.motionOn = !this.reduced;
      this.time = 0; this.spinA = 0; this.spinK = 1; this.ease = 6;
      this.cam = { yaw: 0.35, pitch: 0.1, dist: 340, x: 0, y: 0, z: 0 };
      this.camTo = Object.assign({}, this.cam);
      this.m = null; this.sel = -1; this.hover = -1; this.focusG = -1; this.mixT = 1;
      this.V = new Float32Array(16); this.Pm = new Float32Array(16); this.VP = new Float32Array(16); this.M = new Float32Array(16);
      this.I = new Float32Array(16); this.I[0] = this.I[5] = this.I[10] = this.I[15] = 1;
      this.pointers = new Map(); this.labelPool = [];
      this.fps = 60; this._fpsN = 0; this._fpsT = 0;
      this._build();
      try { this._initGL(); } catch (e) { this._fail(e); return; }
      this._bind();
      this.resize();
      this._tick = (now) => this._frame(now);
      this.raf = this.win.requestAnimationFrame(this._tick);
    }

    /* ---------- DOM ---------- */
    _el(tag, cls, parent, text) {
      const e = this.doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    _ico(el, name) { if (el && this.opts.icon) { el.textContent = ""; this.opts.icon(el, name); } return el; }
    _btn(parent, icon, label, title) {
      const b = this._el("button", "ng-ctl-btn", parent);
      b.type = "button";
      b.setAttribute("aria-label", title || label);
      if (title) b.title = title;
      if (icon) this._ico(this._el("span", "ng-ctl-ico", b), icon);
      if (label) this._el("span", "ng-ctl-text", b, label); else b.classList.add("is-icon");
      return b;
    }
    _save() { if (this.opts.onSave) this.opts.onSave(Object.assign({}, this.s)); }

    _build() {
      const host = this.host;
      host.classList.add("fsn");
      host.tabIndex = 0;
      this.c = this._el("canvas", "fsn-canvas", host);
      this.labels = this._el("div", "fsn-labels", host);
      this.tip = this._el("div", "fsn-tip", host);

      const head = this._el("div", "fsn-head", host);
      this._el("div", "fsn-brand", head, "Space Neurons");
      this.meta = this._el("div", "fsn-meta", head);
      this.hello = this._el("div", "fsn-hello", head);
      this.card = this._el("div", "fsn-card ng-glass-dark", head);
      this.card.hidden = true;

      const top = this._el("div", "ng-ctl fsn-themes", host);
      const tg = this._el("div", "ng-ctl-group", top);
      this.themeBtns = [["hole", L("Чёрная дыра", "Black hole")], ["star", L("Звезда", "Star")]].map(([id, label]) => {
        const b = this._btn(tg, id === "hole" ? "circle-dot" : "sun", label, label);
        b.onclick = () => this.setTheme(id);
        return [id, b];
      });

      const bar = this._el("div", "ng-ctl fsn-ctl", host);
      const g1 = this._el("div", "ng-ctl-group", bar);
      this.bOver = this._btn(g1, "layout-dashboard", L("Обзор", "Overview"), L("Обзор хранилища: цифры, группы, недавние", "Vault overview: numbers, groups, recent"));
      this.bOver.onclick = () => this.toggleOverview();
      this.bPanel = this._btn(g1, "sliders-horizontal", L("Настроить", "Customize"), L("Цвет, свечение, кометы и качество", "Colour, glow, comets and quality"));
      this.bPanel.onclick = () => this._togglePanel();
      this.panel = this._el("div", "fsn-panel ng-glass-dark", host);
      this.panel.hidden = true;

      const dock = this._el("div", "ng-ctl fsn-dock", host);
      const dg = this._el("div", "ng-ctl-group", dock);
      this._btn(dg, "minus", "", L("Отдалить (−)", "Zoom out (−)")).onclick = () => this.zoom(1.35);
      this._btn(dg, "plus", "", L("Приблизить (+)", "Zoom in (+)")).onclick = () => this.zoom(1 / 1.35);
      this._btn(dg, "rotate-ccw", "", L("Сбросить вид (F)", "Reset view (F)")).onclick = () => this.fit();
      this.bPlay = this._btn(dg, "pause", "", L("Пауза (пробел)", "Pause (Space)"));
      this.bPlay.onclick = () => this.setMotion(!this.motionOn);
      this.bFull = this._btn(dg, "maximize", "", L("Во весь экран", "Full screen"));
      this.bFull.onclick = () => this.toggleFull();

      this.count = this._el("div", "fsn-count", host);
      this._el("div", "fsn-hint", host, L("Левая кнопка — вращать · правая — двигать · колесо — масштаб · двойной клик по нейрону открывает заметку",
        "Left drag to spin · right drag to move · scroll to zoom · double-click a neuron to open the note"));
      this.over = this._el("div", "fsn-over", host);
      this.over.hidden = true;
      this._buildPanel();
      this._syncTop();
    }

    _syncTop() {
      for (const [id, b] of this.themeBtns) { b.classList.toggle("is-on", this.s.theme === id); b.setAttribute("aria-pressed", String(this.s.theme === id)); }
      this._ico(this.bPlay.querySelector(".ng-ctl-ico"), this.motionOn ? "pause" : "play");
      this.bPanel.classList.toggle("is-on", !this.panel.hidden);
      this.bOver.classList.toggle("is-on", !this.over.hidden);
    }

    _buildPanel() {
      const p = this.panel, s = this.s;
      p.textContent = "";
      this._el("div", "fsn-panel-title", p, L("Настроить", "Customize"));
      const row = (label) => { const r = this._el("div", "fsn-row", p); this._el("span", "fsn-row-name", r, label); return r; };
      const sw = this._el("div", "fsn-sw", row(L("Цвет", "Colour")));
      const swb = COLORS.map(([id, hex]) => {
        const b = this._el("button", "fsn-sw-btn" + (hex ? "" : " is-auto"), sw);
        b.type = "button";
        b.title = id === "auto" ? L("Как в картине", "As in the scene") : hex;
        b.setAttribute("aria-label", b.title);
        if (hex) b.style.setProperty("--fsn-sw", hex);
        b.onclick = () => { s.color = id; syncSw(); this._save(); this._recolor(); this._buildDust(); };
        return [id, b];
      });
      const syncSw = () => swb.forEach(([id, b]) => b.classList.toggle("is-on", s.color === id));
      syncSw();
      const slider = (label, key, min, max, step, fmt, after) => {
        const r = row(label);
        const inp = this._el("input", "fsn-range", r);
        inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
        const val = this._el("span", "fsn-row-val", r);
        const get = () => (key === "rings" ? this._rings() : s[key]);
        inp.value = get(); val.textContent = fmt(get());
        inp.oninput = () => { s[key] = Number(inp.value); val.textContent = fmt(s[key]); this.dirty = true; if (after) after(false); };
        inp.onchange = () => { this._save(); if (after) after(true); };
      };
      const f2 = (v) => Number(v).toFixed(2);
      slider(L("Свечение", "Glow"), "glow", 0, 2, 0.05, f2);
      slider(L("Размер свечения", "Glow size"), "glowSize", 0, 1, 0.05, f2);
      slider(L("Размер нейронов", "Node size"), "nodeSize", 0.4, 3, 0.05, f2);
      slider(L("Связи", "Links"), "links", 0, 1.5, 0.05, f2);
      slider(L("Кольца", "Rings"), "rings", 0, 1, 0.05, f2);
      slider(L("Бусины света", "Light beads"), "beads", 0, 2000, 50, (v) => String(Math.round(v)), (done) => { if (done) this._buildBeads(); });
      slider(L("Скорость бусин", "Bead speed"), "beadSpeed", 0, 4, 0.1, f2);
      slider(L("Вращение", "Spin"), "spin", 0, 2, 0.05, f2);
      const toggle = (label, key, after) => {
        const b = this._el("button", "fsn-tg", row(label));
        b.type = "button";
        const sync = () => { b.textContent = s[key] ? L("Вкл", "On") : L("Выкл", "Off"); b.classList.toggle("is-on", !!s[key]); b.setAttribute("aria-pressed", String(!!s[key])); };
        b.onclick = () => { s[key] = !s[key]; sync(); this._save(); this.dirty = true; if (after) after(); };
        sync();
      };
      toggle(L("Кометы", "Comets"), "comets");
      toggle(L("Пульс нейронов", "Pulse"), "pulse");
      toggle(L("Звёзды", "Stars"), "stars");
      toggle(L("Названия групп", "Group names"), "names");
      if (s.theme === "hole") {
        toggle(L("Джеты", "Jets"), "jets");
        toggle(L("Обломки на орбитах", "Orbiting debris"), "debris");
      }
      if (this.opts.aiAvailable) toggle(L("Проекты с ИИ", "AI projects"), "ai", () => { if (this.opts.onAI) this.opts.onAI(s.ai); });
      toggle(L("Беречь видеокарту в фоне", "Save GPU in background"), "saveGpu");
      const sky = this._el("div", "fsn-seg is-wrap", row(L("Фон", "Background")));
      const skb = [["auto", L("Авто", "Auto")], ["nebula", L("Туманность", "Nebula")], ["milky", L("Млечный Путь", "Milky Way")], ["dark", L("Тьма", "Dark")]].map(([id, label]) => {
        const b = this._el("button", "fsn-seg-btn", sky, label);
        b.type = "button";
        b.onclick = () => { s.sky = id; syncS(); this._save(); this.dirty = true; };
        return [id, b];
      });
      const syncS = () => skb.forEach(([id, b]) => b.classList.toggle("is-on", s.sky === id));
      syncS();
      const seg = this._el("div", "fsn-seg", row(L("Качество", "Quality")));
      const qb = [["fast", L("Быстро", "Fast")], ["high", L("Высокое", "High")], ["max", L("Макс", "Max")]].map(([id, label]) => {
        const b = this._el("button", "fsn-seg-btn", seg, label);
        b.type = "button";
        b.onclick = () => { s.quality = id; syncQ(); this._save(); this._buildDust(); this.resize(); };
        return [id, b];
      });
      const syncQ = () => qb.forEach(([id, b]) => b.classList.toggle("is-on", s.quality === id));
      syncQ();
      const reset = this._el("button", "fsn-reset", p, L("Вернуть как было", "Reset to default"));
      reset.type = "button";
      reset.onclick = () => {
        const keep = { theme: s.theme, ai: s.ai };
        Object.assign(s, DEFAULTS, keep);
        this._save(); this._buildPanel(); this._recolor(); this.resize();
      };
    }
    _togglePanel(force) {
      const on = force != null ? force : this.panel.hidden;
      this.panel.hidden = !on;
      if (on) this.over.hidden = true;
      this._syncTop();
    }
    _skyMode() { const k = this.s.sky; return k === "nebula" ? 0 : k === "milky" ? 1 : k === "dark" ? 2 : this.s.theme === "star" ? 1 : 0; }
    _rings() { return this.s.rings >= 0 ? this.s.rings : this.s.theme === "star" ? 0.25 : 0.06; }

    _fail(e) {
      console.error("Space Neurons:", e);
      this.failed = true;
      const n = this._el("div", "fsn-fail ng-glass-dark", this.host);
      this._el("div", "fsn-fail-title", n, L("Не удалось включить WebGL 2", "Could not start WebGL 2"));
      this._el("div", "fsn-fail-text", n, L("Space Neurons рисует космос видеокартой. Проверьте, что в Obsidian включено аппаратное ускорение.", "Space Neurons draws with the GPU. Check that hardware acceleration is on in Obsidian."));
      if (this.opts.onReady) this.opts.onReady();
    }

    /* ---------- WebGL ---------- */
    _prog(vs, fs) {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    _initGL() {
      const gl = this.c.getContext("webgl2", { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("no webgl2");
      this.gl = gl;
      this.hdr = !!gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");
      this.P = {
        sky: this._prog(SH.full, SH.sky), hole: this._prog(SH.holeV, SH.holeF), core: this._prog(SH.holeV, SH.coreF),
        point: this._prog(SH.pointV, SH.pointF), rib: this._prog(SH.ribV, SH.ribF), bead: this._prog(SH.beadV, SH.pointF),
        comet: this._prog(SH.cometV, SH.pointF), tail: this._prog(SH.tailV, SH.ribF),
        jet: this._prog(SH.jetV, SH.jetF), dust: this._prog(SH.dustV, SH.pointF),
        bright: this._prog(SH.full, SH.bright), down: this._prog(SH.full, SH.down), up: this._prog(SH.full, SH.up), comp: this._prog(SH.full, SH.comp),
      };
      this.vEmpty = gl.createVertexArray();
      const quad = (this.vQuad = gl.createVertexArray());
      gl.bindVertexArray(quad);
      this.qBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.qBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.B = {};
      this._buildComets();
      this._buildDust();
    }
    _vao(name, layout, data, inst) {
      const gl = this.gl;
      let o = this.B[name];
      if (!o) { o = this.B[name] = { vao: gl.createVertexArray(), buf: gl.createBuffer(), n: 0, cap: -1 }; }
      gl.bindVertexArray(o.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.buf);
      if (o.cap === data.length) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      else { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); o.cap = data.length; }
      const stride = layout.reduce((a, b) => a + b, 0) * 4;
      let off = 0;
      layout.forEach((sz, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, sz, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(i, inst ? 1 : 0); off += sz * 4; });
      gl.bindVertexArray(null);
      o.n = data.length / (stride / 4);
      return o;
    }
    _target(w, h, hdr) {
      const gl = this.gl, tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (hdr && this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }
    _freeTargets() {
      const gl = this.gl;
      for (const t of this.T || []) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      this.T = null;
    }
    resize() {
      if (!this.gl) return;
      const r = this.host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const Q = QUALITY[this.s.quality];
      const dpr = Math.min(this.win.devicePixelRatio || 1, this.s.quality === "max" ? 2 : 1.5);
      const k = dpr * Q.scale * (this.slow ? 0.75 : 1);
      const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
      if (this.T && this.T[0].w === W && this.T[0].h === H && this.w === w && this.h === h) return;
      this.w = w; this.h = h;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this._freeTargets();
      const T = [this._target(W, H, true)];
      let bw = W >> 1, bh = H >> 1;
      for (let i = 0; i < Q.mips && bw > 2 && bh > 2; i++) { T.push(this._target(bw, bh, true)); bw >>= 1; bh >>= 1; }
      this.T = T;
      this.dirty = true;
    }

    /* ---------- декорации: звёзды, кометы, кольца ---------- */
    _buildComets() {
      const rnd = NG.rand("fsn-comets"), C = 11, H = new Float32Array(C * 8);
      for (let c = 0; c < C; c++) {
        let nx = rnd() - 0.5, ny = rnd() * 0.9 + 0.4, nz = rnd() - 0.5;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const o = [1.15 + rnd() * 1.25, (0.05 + rnd() * 0.09) * (rnd() < 0.5 ? -1 : 1), rnd() * 6.283, 0.5 + rnd() * 0.9];
        H.set([o[0], o[1], o[2], o[3], nx, ny, nz, 0], c * 8);
      }
      this._vao("cometH", [4, 3, 1], H);
      const I = new Float32Array(C * 7);
      for (let c = 0; c < C; c++) I.set(H.subarray(c * 8, c * 8 + 7), c * 7);
      this._vao("cometI", [4, 3], I, true);
    }
    // обломки и газ на орбитах вокруг дыры; радиусы в радиусах горизонта
    _buildDust() {
      if (!this.gl) return;
      const n = QUALITY[this.s.quality].dust, rnd = NG.rand("fsn-dust"), D = new Float32Array(n * 9), tint = this._tint();
      for (let i = 0; i < n; i++) {
        const belt = rnd() < 0.3;
        const r = belt ? 13 + gauss(rnd) * 2.2 : 3.4 + Math.pow(rnd(), 0.9) * 32;
        const th = rnd() * 6.2832, yk = gauss(rnd) * (rnd() < 0.12 ? 0.05 : 0.012);
        const t = Math.min(1.4, Math.pow(2.6 / Math.max(r, 2.6), 0.75) * 1.7);
        let col = t > 1 ? [1, 0.95, 0.86] : [1, 0.3 + 0.62 * t, 0.1 + 0.6 * t * t];
        if (tint) col = tint.map((c, k) => c * 0.7 + col[k] * 0.3);
        const b = (0.2 + 0.8 * rnd()) * Math.pow(Math.min(1, 7 / r), 0.7) * (belt ? 1.1 : 0.85);
        D.set([Math.max(3.1, r), th, yk, col[0], col[1], col[2], 0.04 + 0.12 * Math.pow(rnd(), 3), rnd(), b], i * 9);
      }
      this._vao("dust", [3, 4, 2], D);
    }
    _buildRings() {
      const R = this.lay ? this.lay.R : 100, rnd = NG.rand("fsn-rings|" + this.s.theme), N = 20, S = 160;
      const D = new Float32Array(N * S * 12);
      let q = 0;
      for (let i = 0; i < N; i++) {
        const rr = R * (0.55 + rnd() * 0.9);
        let nx = (rnd() - 0.5) * 1.1, ny = 1, nz = (rnd() - 0.5) * 1.1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        // два вектора в плоскости кольца
        let ax = nz, ay = 0, az = -nx;
        const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
        if (al < 1e-3) { ax = 1; ay = 0; az = 0; }
        const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;
        const a0 = 0.25 + rnd() * 0.5, ph = rnd() * 6.28;
        const at = (t) => { const an = t * 6.2832, c = Math.cos(an) * rr, s = Math.sin(an) * rr; return [ax * c + bx * s, ay * c + by * s, az * c + bz * s]; };
        for (let k = 0; k < S; k++) {
          const p0 = at(k / S), p1 = at((k + 1) / S), an = ((k + 0.5) / S) * 6.2832;
          D.set([p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1, 1, 1, a0 * (0.3 + 0.7 * Math.abs(Math.sin(an * 1.5 + ph))), 0, 0.9], q); q += 12;
        }
      }
      this._vao("rings", [3, 3, 4, 2], D, true);
    }

    /* ---------- данные ---------- */
    // g: { nodes: [{ id, title, folder, tags, mtime, ctime, ai? }], edges: [{ a, b }] }
    setData(g) {
      if (this.failed) return;
      const nodes = g.nodes, N = nodes.length, index = new Map(nodes.map((n, i) => [n.id, i]));
      const adj = nodes.map(() => []), adjE = nodes.map(() => []), edges = [], seen = new Set();
      for (const e of g.edges) {
        const a = index.get(e.a), b = index.get(e.b);
        if (a == null || b == null || a === b) continue;
        const k = a < b ? a + ":" + b : b + ":" + a;
        if (seen.has(k)) continue;
        seen.add(k);
        adjE[a].push(edges.length); adjE[b].push(edges.length);
        edges.push([a, b]); adj[a].push(b); adj[b].push(a);
      }
      // группы — верхние папки: самые крупные отдельно, остальные вместе
      const top = (n) => (n.ai ? AIG : n.folder ? n.folder.split("/")[0] : ROOTG);
      const cnt = new Map();
      for (const n of nodes) { const k = top(n); cnt.set(k, (cnt.get(k) || 0) + 1); }
      const keys = [...cnt.keys()].filter((k) => k !== AIG).sort((a, b) => cnt.get(b) - cnt.get(a));
      const MAXG = 14, main = new Set(keys.slice(0, keys.length > MAXG ? MAXG - 1 : MAXG));
      if (cnt.has(AIG)) main.add(AIG);
      const gname = (k) => (k === AIG ? L("Проекты с ИИ", "AI projects") : k === ROOTG ? L("Корень хранилища", "Vault root") : k === OTHERG ? L("Другое", "Other") : k);
      const gk = nodes.map((n) => (main.has(top(n)) ? top(n) : OTHERG));
      const gc = new Map();
      for (const k of gk) gc.set(k, (gc.get(k) || 0) + 1);
      const order = [...gc.keys()].sort((a, b) => (a === OTHERG) - (b === OTHERG) || gc.get(b) - gc.get(a));
      const gix = new Map(order.map((k, i) => [k, i]));
      const groups = order.map((k) => ({ key: k, name: gname(k), count: gc.get(k), links: 0, c: [0, 0, 0] }));
      const gi = new Int32Array(N);
      for (let i = 0; i < N; i++) gi[i] = gix.get(gk[i]);
      for (const [a, b] of edges) { groups[gi[a]].links++; if (gi[b] !== gi[a]) groups[gi[b]].links++; }
      const deg = adj.map((a) => a.length);
      const old = this.m && this.sel >= 0 ? this.m.nodes[this.sel].id : null;
      this.m = { nodes, N, edges, adj, adjE, deg, groups, gi, index };
      this.sel = old != null && index.has(old) ? index.get(old) : -1;
      this.hover = -1; this.focusG = -1;
      this._place(!this._readyOnce);
      if (this.sel < 0) this._showCard(-1); else this._fillCard(this.sel);
      this.count.textContent = notes(N) + " · " + floraNum(groups.length) + " " + plural(groups.length, ["группа", "группы", "групп"], ["group", "groups"]) + " · " + links(edges.length);
      if (!this._readyOnce) {
        this._readyOnce = true;
        if (!this.reduced && this.s.theme === "hole") {
          // открытие: камера издалека и сверху медленно подлетает к дыре
          Object.assign(this.cam, { dist: this.camTo.dist * 2.3, pitch: 0.62, yaw: this.camTo.yaw - 1.1 });
          this.ease = 0.55;
        }
        if (this.opts.onReady) this.win.setTimeout(() => this.opts.onReady(), 60);
      }
      if (!this.over.hidden) this._fillOverview();
    }

    // раскладка под текущую картину; при смене картины нейроны перелетают
    _place(instant) {
      const m = this.m;
      if (!m) return;
      const lay = layout(m, this.s.theme);
      const cur = this.Pcur && this.Pcur.length === lay.P.length && !instant ? this.Pcur : null;
      this.lay = lay;
      this.Pto = lay.P;
      this.Pfrom = cur ? new Float32Array(cur) : null;
      this.mixT = cur ? 0 : 1;
      this.Pcur = new Float32Array(cur || lay.P);
      for (const g of m.groups) g.c = [0, 0, 0];
      for (let i = 0; i < m.N; i++) { const g = m.groups[m.gi[i]]; g.c[0] += lay.P[3 * i] / g.count; g.c[1] += lay.P[3 * i + 1] / g.count; g.c[2] += lay.P[3 * i + 2] / g.count; }
      this._recolor();
      this._buildRings();
      if (instant) this.fit(true);
    }

    _tint() {
      const c = COLORS.find((x) => x[0] === this.s.color);
      return c && c[1] ? lin(c[1]) : null;
    }
    _recolor() {
      const m = this.m;
      if (!m || !this.gl) return;
      const tint = this._tint(), star = this.s.theme === "star";
      const base = tint || (star ? [1, 1, 1] : lin("#f6efe4"));
      const P = this.Pcur, N = m.N, D = new Float32Array(N * 9);
      const hl = this.sel >= 0 ? new Set([this.sel, ...m.adj[this.sel]]) : null;
      const fg = this.focusG, dens = clamp(Math.sqrt(900 / Math.max(1, N)), 0.55, 1);
      for (let i = 0; i < N; i++) {
        const n = m.nodes[i], rnd = NG.rand(n.id + "#c");
        const k = (0.5 + 0.5 * rnd()) * dens;
        const tw = rnd(), col = n.ai && n.color && !tint ? lin(n.color) : tint ? base : [base[0] * (tw < 0.2 ? 0.82 : 1), base[1] * (tw < 0.2 ? 0.9 : tw > 0.85 ? 0.92 : 1), base[2] * (tw > 0.85 ? 0.8 : 1)];
        const size = (1 + 0.85 * Math.log2(1 + m.deg[i])) * (n.ai ? 1.5 : 1);
        const h = hl ? (i === this.sel ? 2 : hl.has(i) ? 1.3 : 0) : fg >= 0 ? (m.gi[i] === fg ? 1.3 : 0) : 1;
        D.set([P[3 * i], P[3 * i + 1], P[3 * i + 2], col[0] * k, col[1] * k, col[2] * k, size, rnd(), h], i * 9);
      }
      this._vao("nodes", [3, 4, 2], D);
      const E = m.edges.length, LD = new Float32Array(Math.max(1, E) * 12), bend = star ? 0.08 : 0.16;
      const lc = tint || (star ? [1, 1, 1] : lin("#eadfcc"));
      for (let e = 0; e < E; e++) {
        const [a, b] = m.edges[e];
        const al = hl ? (a === this.sel || b === this.sel ? 1.6 : 0.12) : fg >= 0 ? (m.gi[a] === fg || m.gi[b] === fg ? 0.8 : 0.1) : 0.5;
        LD.set([P[3 * a], P[3 * a + 1], P[3 * a + 2], P[3 * b], P[3 * b + 1], P[3 * b + 2], lc[0], lc[1], lc[2], al, bend, al > 1 ? 1.7 : 1], e * 12);
      }
      this._vao("links", [3, 3, 4, 2], E ? LD : new Float32Array(0), true);
      this._buildBeads();
      this.dirty = true;
    }
    _buildBeads() {
      const m = this.m;
      if (!m || !this.gl) return;
      const E = m.edges.length, nb = E ? Math.round(this.s.beads) : 0, P = this.Pcur;
      const D = new Float32Array(Math.max(1, nb) * 10), rnd = NG.rand("fsn-beads");
      const own = this.sel >= 0 ? m.adjE[this.sel] : this.focusG >= 0 ? null : null;
      let q = 0;
      for (let k = 0; k < nb; k++) {
        let e = (rnd() * E) | 0;
        if (own && own.length && rnd() < 0.7) e = own[(rnd() * own.length) | 0];
        let [a, b] = m.edges[e];
        if (rnd() < 0.5) { const t = a; a = b; b = t; }
        const len = Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]) || 1;
        D.set([P[3 * a], P[3 * a + 1], P[3 * a + 2], P[3 * b], P[3 * b + 1], P[3 * b + 2], rnd(), 6 / len, 0.7 + rnd() * 0.6, 0.6 + rnd() * 0.6], q); q += 10;
      }
      this._vao("beads", [3, 3, 4], nb ? D : new Float32Array(0));
    }

    /* ---------- картины ---------- */
    setTheme(id) {
      if (THEMES.indexOf(id) < 0 || id === this.s.theme) return;
      this.s.theme = id;
      this._save();
      this._syncTop();
      this._buildPanel();
      this._place(false);
      this.fit();
    }

    /* ---------- камера ---------- */
    fit(instant) {
      const R = this.lay ? this.lay.R : 120, star = this.s.theme === "star";
      const narrow = this.w && this.h && this.w < this.h * 1.2 ? (this.h * 1.2) / this.w : 1;
      const hs = this.lay ? this.lay.hs : 8;
      const d = ((star ? R * 1.25 : Math.max(R * 1.02, hs * 19)) / Math.tan(FOV / 2)) * narrow;
      Object.assign(this.camTo, { x: 0, y: 0, z: 0, dist: clamp(d, 60, 2400), pitch: star ? 0.32 : 0.16 });
      if (instant) Object.assign(this.cam, this.camTo);
      this.focusG = -1;
      if (this.sel >= 0) this.select(-1); else this._recolor();
    }
    zoom(k) { this.camTo.dist = clamp(this.camTo.dist * k, this._minDist(), 3000); this.dirty = true; }
    _minDist() { return this.s.theme === "star" || this.focusG >= 0 || this.sel >= 0 ? 25 : 9 * (this.lay ? this.lay.hs : 8); }
    _rot(p) { const a = this.spinA, c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
    _world(i) { const P = this.Pcur; return this._rot([P[3 * i], P[3 * i + 1], P[3 * i + 2]]); }
    focusGroup(g) {
      const m = this.m;
      if (!m || !m.groups[g]) return;
      this.sel = -1; this._showCard(-1);
      this.focusG = g;
      const G = m.groups[g], w = this._rot(G.c);
      Object.assign(this.camTo, { x: w[0], y: w[1], z: w[2], dist: clamp(80 + 30 * Math.sqrt(G.count), 110, 700) });
      this._recolor();
    }
    select(i, fly) {
      const m = this.m;
      if (!m) return;
      this.sel = i;
      if (i >= 0) {
        this.focusG = -1;
        if (fly) { const w = this._world(i); Object.assign(this.camTo, { x: w[0], y: w[1], z: w[2], dist: Math.min(this.camTo.dist, 160) }); }
        this._fillCard(i);
      } else this._showCard(-1);
      this._recolor();
    }
    _showCard(i) { this.card.hidden = i < 0; this.hello.hidden = i >= 0; }
    _fillCard(i) {
      const m = this.m, n = m.nodes[i], c = this.card;
      c.textContent = "";
      this._showCard(i);
      const close = this._el("button", "fsn-card-x", c);
      close.type = "button"; close.setAttribute("aria-label", L("Закрыть", "Close"));
      this._ico(close, "x");
      close.onclick = () => this.select(-1);
      this._el("div", "fsn-card-kicker", c, n.ai ? L("Проект с ИИ", "AI project") + (n.aiName ? " · " + n.aiName : "") : m.groups[m.gi[i]].name);
      this._el("div", "fsn-card-title", c, n.title);
      const path = n.ai ? n.path : n.folder;
      if (path && path !== m.groups[m.gi[i]].name) this._el("div", "fsn-card-path", c, path);
      const meta = [links(m.deg[i])];
      if (n.ai && n.sessions) meta.push(floraNum(n.sessions) + " " + plural(n.sessions, ["сессия", "сессии", "сессий"], ["session", "sessions"]));
      if (n.mtime) meta.push((n.ai ? L("работа ", "worked on ") : L("изменена ", "edited ")) + ago(n.mtime));
      this._el("div", "fsn-card-meta", c, meta.join(" · "));
      if (n.tags && n.tags.length) {
        const t = this._el("div", "fsn-card-tags", c);
        for (const tag of n.tags.slice(0, 6)) this._el("span", "fsn-chip", t, "#" + tag);
      }
      const nb = m.adj[i].slice().sort((a, b) => m.deg[b] - m.deg[a]).slice(0, 7);
      if (nb.length) {
        this._el("div", "fsn-card-h", c, L("Связана с", "Linked to"));
        const list = this._el("div", "fsn-card-list", c);
        for (const j of nb) {
          const b = this._el("button", "fsn-card-link", list, m.nodes[j].title);
          b.type = "button";
          b.onclick = () => this.select(j, true);
        }
      }
      const act = this._el("div", "fsn-card-actions", c);
      const open = this._el("button", "fsn-card-btn is-main", act, n.ai ? L("Открыть в «Проектах с ИИ»", "Open in AI projects") : L("Открыть заметку", "Open note"));
      open.type = "button";
      open.onclick = (ev) => { if (this.opts.onOpen) this.opts.onOpen(n, ev); };
      const fly = this._el("button", "fsn-card-btn", act, L("Показать", "Fly to"));
      fly.type = "button";
      fly.onclick = () => this.select(i, true);
    }

    setMotion(on) {
      this.motionOn = !!on;
      this._syncTop();
      this.dirty = true;
    }
    toggleFull() {
      const d = this.doc;
      if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
      else if (this.host.requestFullscreen) this.host.requestFullscreen().catch(() => {});
    }

    /* ---------- ввод ---------- */
    _bind() {
      const c = this.c, off = (this._off = []);
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
      on(c, "contextmenu", (e) => e.preventDefault());
      on(c, "pointerdown", (e) => {
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
        this._moved = 0; this.ease = 6;
        this.host.focus({ preventScroll: true });
      });
      on(c, "pointermove", (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) { this._hoverAt(e); return; }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        this._moved += Math.abs(dx) + Math.abs(dy);
        const T = this.camTo;
        if (this.pointers.size >= 2) {
          const pts = [...this.pointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this._pinch) T.dist = clamp(T.dist * (this._pinch / Math.max(1, d)), this._minDist(), 3000);
          this._pinch = d;
          return;
        }
        if (p.b === 2 || p.b === 1 || p.shift) {
          const k = T.dist * 0.0016, B = this.basis;
          if (B) { T.x += (-dx * B.r[0] + dy * B.u[0]) * k; T.y += (-dx * B.r[1] + dy * B.u[1]) * k; T.z += (-dx * B.r[2] + dy * B.u[2]) * k; }
        } else {
          T.yaw -= dx * 0.006;
          T.pitch = clamp(T.pitch + dy * 0.005, -1.5, 1.5);
        }
        this.dirty = true;
      });
      const up = (e) => {
        const p = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) this._pinch = 0;
        if (!p || this._moved >= 5 || p.b !== 0 || e.type === "pointercancel") return;
        const i = this._pick(e), now = performance.now(), lc = this._lastClick;
        if (lc && lc.i === i && now - lc.t < 380) {
          this._lastClick = null;
          if (i >= 0) { if (this.opts.onOpen) this.opts.onOpen(this.m.nodes[i], e); } else this.fit();
          return;
        }
        this._lastClick = { i, t: now };
        if (i >= 0) this.select(i); else if (this.sel >= 0) this.select(-1);
      };
      on(c, "pointerup", up); on(c, "pointercancel", up);
      on(c, "pointerleave", () => { this.hover = -1; this.tip.classList.remove("is-on"); });
      on(c, "wheel", (e) => { e.preventDefault(); this.ease = 6; this.zoom(Math.exp(clamp(e.deltaY, -120, 120) * 0.0022)); }, { passive: false });
      on(this.host, "keydown", (e) => {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape") this.toggleOverview(false); return; }
        if (e.key === " ") { e.preventDefault(); this.setMotion(!this.motionOn); }
        else if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") { if (this.sel >= 0) this.select(this.sel, true); else this.fit(); }
        else if (e.key === "+" || e.key === "=") this.zoom(1 / 1.25);
        else if (e.key === "-") this.zoom(1.25);
        else if (e.key === "Escape") {
          if (!this.over.hidden) this.toggleOverview(false);
          else if (!this.panel.hidden) this._togglePanel(false);
          else if (this.sel >= 0) this.select(-1);
          else if (this.focusG >= 0) this.fit();
        }
      });
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this.host); }
      on(this.doc, "fullscreenchange", () => this._ico(this.bFull.querySelector(".ng-ctl-ico"), this.doc.fullscreenElement ? "minimize" : "maximize"));
    }
    _proj(w) {
      const M = this.VP, x = w[0], y = w[1], z = w[2];
      const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (cw <= 0.5) return null;
      return [((M[0] * x + M[4] * y + M[8] * z + M[12]) / cw * 0.5 + 0.5) * this.w, (0.5 - ((M[1] * x + M[5] * y + M[9] * z + M[13]) / cw) * 0.5) * this.h, cw];
    }
    _pick(e) {
      const m = this.m;
      if (!m || !this.basis) return -1;
      const r = this.c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const px = this.h / (2 * Math.tan(FOV / 2));
      let best = -1, bd = 1e9;
      for (let i = 0; i < m.N; i++) {
        const p = this._proj(this._world(i));
        if (!p) continue;
        const size = (1 + 0.85 * Math.log2(1 + m.deg[i])) * this.s.nodeSize * (this.s.theme === "star" ? 0.4 : 0.55) * px / p[2];
        const lim = Math.max(7, size * 0.9), d = Math.hypot(p[0] - mx, p[1] - my);
        if (d < lim) { const sc = d / lim + p[2] * 1e-4; if (sc < bd) { bd = sc; best = i; } }
      }
      return best;
    }
    _hoverAt(e) {
      this._hoverE = e;
      if (this._hoverT) return;
      this._hoverT = this.win.requestAnimationFrame(() => {
        this._hoverT = 0;
        const ev = this._hoverE, i = this._pick(ev), t = this.tip;
        this.c.classList.toggle("is-hot", i >= 0);
        this.hover = i;
        if (i < 0) { t.classList.remove("is-on"); return; }
        const n = this.m.nodes[i];
        t.textContent = "";
        this._el("div", "fsn-tip-title", t, n.title);
        this._el("div", "fsn-tip-meta", t, (n.ai ? L("Проект с ИИ", "AI project") : n.folder || L("Корень хранилища", "Vault root")) + " · " + links(this.m.deg[i]));
        const r = this.host.getBoundingClientRect();
        t.style.setProperty("--x", Math.min(ev.clientX - r.left + 14, this.w - 250) + "px");
        t.style.setProperty("--y", ev.clientY - r.top + 14 + "px");
        t.classList.add("is-on");
      });
    }

    /* ---------- подписи групп ---------- */
    _labels() {
      const m = this.m, pool = this.labelPool;
      let used = 0;
      const put = (x, y, cls, title, sub, fn, o) => {
        let l = pool[used];
        if (!l) {
          l = pool[used] = this._el("button", "fsn-label", this.labels);
          l.type = "button";
          l._t = this._el("span", "fsn-label-t", l); l._s = this._el("span", "fsn-label-s", l);
          l.onclick = () => l._fn && l._fn();
        }
        used++;
        const k = "fsn-label " + cls;
        if (l.className !== k) l.className = k;
        if (l._t.textContent !== title) l._t.textContent = title;
        if (l._s.textContent !== (sub || "")) l._s.textContent = sub || "";
        l._fn = fn;
        l.style.setProperty("--x", x.toFixed(1) + "px"); l.style.setProperty("--y", y.toFixed(1) + "px"); l.style.setProperty("--o", String(o == null ? 1 : o));
        l.hidden = false;
      };
      if (m && this.mixT >= 1) {
        const star = this.s.theme === "star";
        if (this.opts.vaultName) {
          const c = this._proj([0, 0, 0]), dz = this.cam.dist;
          if (c) put(c[0], c[1] + (star ? 16 : 2.6 * (this.lay ? this.lay.hs : 7) * 1.9) * (this.h / (2 * Math.tan(FOV / 2))) / dz, "is-center", this.opts.vaultName, "", () => this.fit(), 0.9);
        }
        if (this.s.names && this.sel < 0) m.groups.forEach((g, gi) => {
          const p = this._proj(this._rot(g.c));
          if (!p || p[0] < -60 || p[0] > this.w + 60 || p[1] < -30 || p[1] > this.h + 30) return;
          put(p[0], p[1], "is-group", g.name, notes(g.count), () => this.focusGroup(gi), this.focusG >= 0 && this.focusG !== gi ? 0.35 : 1);
        });
        if (this.sel >= 0) {
          const p = this._proj(this._world(this.sel));
          if (p) put(p[0], p[1] - 24, "is-sel", m.nodes[this.sel].title, "", () => this.select(this.sel, true));
          for (const j of m.adj[this.sel].slice().sort((a, b) => m.deg[b] - m.deg[a]).slice(0, 6)) { const q = this._proj(this._world(j)); if (q) put(q[0], q[1] - 16, "is-nb", m.nodes[j].title, "", () => this.select(j, true), 0.85); }
        }
      }
      for (let i = used; i < pool.length; i++) if (!pool[i].hidden) pool[i].hidden = true;
    }

    /* ---------- обзор ---------- */
    toggleOverview(force) {
      const on = force != null ? force : this.over.hidden;
      this.over.hidden = !on;
      if (on) { this.panel.hidden = true; this._fillOverview(); }
      this._syncTop();
      if (on) { const q = this.over.querySelector("input"); if (q) q.focus(); } else this.host.focus({ preventScroll: true });
    }
    _fillOverview() {
      const m = this.m, o = this.over;
      o.textContent = "";
      o.onclick = (e) => { if (e.target === o) this.toggleOverview(false); };
      const box = this._el("div", "fsn-ov ng-glass-dark", o);
      if (!m) return;
      const loc = FLORA_LANG === "ru" ? "ru-RU" : "en-US";
      const now = Date.now(), DAY = 864e5, nodes = m.nodes.filter((n) => !n.ai), N = nodes.length || 1;
      const root = L("Корень хранилища", "Vault root");
      const head = this._el("div", "fsn-ov-head", box);
      this._el("div", "fsn-ov-title", head, L("Обзор", "Overview"));
      this._el("div", "fsn-ov-date", head, new Date(now).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }));
      const x = this._el("button", "fsn-ov-x", head);
      x.type = "button"; x.setAttribute("aria-label", L("Закрыть", "Close"));
      this._ico(x, "x");
      x.onclick = () => this.toggleOverview(false);
      // поиск
      const sb = this._el("div", "fsn-ov-search", box);
      this._ico(this._el("span", "fsn-ov-search-ico", sb), "search");
      const q = this._el("input", "fsn-ov-q", sb);
      q.type = "text"; q.spellcheck = false; q.placeholder = L("Найти заметку", "Search every note");
      q.setAttribute("aria-label", q.placeholder);
      const res = this._el("div", "fsn-ov-res", box);
      res.hidden = true;
      q.oninput = () => {
        const t = q.value.trim().toLowerCase();
        res.textContent = ""; res.hidden = !t;
        if (!t) return;
        const hits = [];
        for (let i = 0; i < m.N && hits.length < 8; i++) if (m.nodes[i].title.toLowerCase().includes(t)) hits.push(i);
        if (!hits.length) this._el("div", "fsn-ov-none", res, L("Ничего не нашлось", "Nothing found"));
        for (const i of hits) {
          const b = this._el("button", "fsn-ov-hit", res);
          b.type = "button";
          this._el("span", "fsn-ov-hit-t", b, m.nodes[i].title);
          this._el("span", "fsn-ov-hit-s", b, m.groups[m.gi[i]].name);
          b.onclick = () => { this.toggleOverview(false); this.select(i, true); };
        }
      };
      q.onkeydown = (e) => { if (e.key === "Enter") { const b = res.querySelector("button"); if (b) b.click(); } };
      // плитки
      const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
      const days = (nD) => { const a = new Array(nD).fill(0); for (const n of nodes) { if (!n.mtime) continue; const d = Math.floor((day0.getTime() + DAY - n.mtime) / DAY); if (d >= 0 && d < nD) a[nD - 1 - d]++; } return a; };
      const weeks = (nW) => { const a = new Array(nW).fill(0); for (const n of nodes) { if (!n.ctime) continue; const w = Math.floor((now - n.ctime) / (7 * DAY)); if (w >= 0 && w < nW) a[nW - 1 - w]++; } return a; };
      const newW = nodes.filter((n) => n.ctime && now - n.ctime < 7 * DAY).length;
      const edW = nodes.filter((n) => n.mtime && now - n.mtime < 7 * DAY).length;
      let orph = 0;
      const hist = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < m.N; i++) { if (m.nodes[i].ai) continue; const d = m.deg[i]; if (!d) orph++; hist[d === 0 ? 0 : d === 1 ? 1 : d === 2 ? 2 : d <= 4 ? 3 : d <= 8 ? 4 : 5]++; }
      const tiles = this._el("div", "fsn-ov-tiles", box);
      const tile = (cls, num, name, sub, badge, bars) => {
        const t = this._el("div", "fsn-tile " + cls, tiles);
        const top = this._el("div", "fsn-tile-top", t);
        this._el("div", "fsn-tile-num", top, floraNum(num));
        if (badge) this._el("div", "fsn-tile-badge", top, badge);
        this._el("div", "fsn-tile-name", t, name);
        this._el("div", "fsn-tile-sub", t, sub);
        const sp = this._el("div", "fsn-spark", t), mx = Math.max(1, ...bars);
        bars.forEach((v, i) => { const b = this._el("span", "fsn-spark-bar" + (i === bars.length - 1 ? " is-last" : ""), sp); b.style.setProperty("--h", Math.max(6, (v / mx) * 100) + "%"); });
      };
      tile("is-a", nodes.length, L("Заметки", "Notes"), L("создано по неделям", "created per week"), newW ? "+" + floraNum(newW) + " " + L("за неделю", "this week") : "", weeks(8));
      tile("is-b", m.edges.length, L("Связи", "Links"), L("между заметками", "between notes"), (m.edges.length / N).toFixed(1) + " " + L("на заметку", "per note"), m.groups.map((g) => g.links).sort((a, b) => a - b).slice(-8));
      tile("is-c", orph, L("Без связей", "Unlinked"), L("заметки по числу связей", "notes by number of links"), Math.round((orph / N) * 100) + "%", hist);
      tile("is-d", edW, L("Изменено за неделю", "Edited this week"), L("по дням", "per day"), Math.round((edW / N) * 100) + "%", days(7));
      // график и списки
      const mid = this._el("div", "fsn-ov-mid", box);
      const chart = this._el("div", "fsn-ov-card is-chart", mid);
      this._el("div", "fsn-ov-h", chart, L("Правки по дням", "Edits per day"));
      this._el("div", "fsn-ov-sub", chart, L("по последнему изменению, 30 дней", "by last edit, last 30 days"));
      const d30 = days(30), mx = Math.max(1, ...d30);
      const plot = this._el("div", "fsn-plot", chart);
      const ax = this._el("div", "fsn-plot-y", plot);
      for (const v of [mx, Math.round(mx / 2), 0]) this._el("span", "", ax, String(v));
      const bars = this._el("div", "fsn-plot-bars", plot);
      d30.forEach((v, i) => { const b = this._el("span", "fsn-plot-bar", bars); b.style.setProperty("--h", (v / mx) * 100 + "%"); b.title = new Date(now - (29 - i) * DAY).toLocaleDateString(loc) + ": " + v; });
      const xs = this._el("div", "fsn-plot-x", chart);
      for (const t of [now - 29 * DAY, now - 15 * DAY, now]) this._el("span", "", xs, new Date(t).toLocaleDateString(loc, { day: "numeric", month: "short" }));
      const list = (cls, title, sub, rows) => {
        const c = this._el("div", "fsn-ov-card " + cls, mid);
        this._el("div", "fsn-ov-h", c, title);
        this._el("div", "fsn-ov-sub", c, sub);
        const mx2 = Math.max(1, ...rows.map((r) => r[1]));
        for (const [name, v, fn] of rows) {
          const b = this._el("button", "fsn-bar-row", c);
          b.type = "button";
          const t = this._el("div", "fsn-bar-top", b);
          this._el("span", "fsn-bar-name", t, name);
          this._el("span", "fsn-bar-val", t, floraNum(v));
          this._el("div", "fsn-bar-fill", this._el("div", "fsn-bar-track", b)).style.setProperty("--w", (v / mx2) * 100 + "%");
          b.onclick = fn;
        }
      };
      list("is-groups", L("Группы", "Groups"), L("заметок в группе · клик — полететь туда", "notes per group · click to fly there"),
        m.groups.slice(0, 7).map((g, i) => [g.name, g.count, () => { this.toggleOverview(false); this.focusGroup(i); }]));
      list("is-hubs", L("Самые связанные", "Most linked"), L("связей с другими · клик — показать", "links to other notes · click to show"),
        m.deg.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]).slice(0, 7).filter((r) => r[0] > 0).map(([d, i]) => [m.nodes[i].title, d, () => { this.toggleOverview(false); this.select(i, true); }]));
      // недавние
      const low = this._el("div", "fsn-ov-low", box);
      const recent = (title, key, pre) => {
        const c = this._el("div", "fsn-ov-card", low);
        this._el("div", "fsn-ov-k", c, title);
        nodes.filter((n) => n[key]).sort((a, b) => b[key] - a[key]).slice(0, 5).forEach((n) => {
          const b = this._el("button", "fsn-rec", c);
          b.type = "button";
          this._el("div", "fsn-rec-t", b, n.title);
          this._el("div", "fsn-rec-s", b, (n.folder || root) + " · " + pre + ago(n[key]));
          b.onclick = () => { this.toggleOverview(false); this.select(m.index.get(n.id), true); };
        });
      };
      recent(L("Недавно изменены", "Recently edited"), "mtime", L("изменена ", "edited "));
      recent(L("Новые заметки", "Newest notes"), "ctime", L("создана ", "created "));
    }

    /* ---------- кадр ---------- */
    _frame(now) {
      if (this.destroyed) return;
      this.raf = this.win.requestAnimationFrame(this._tick);
      const bg = this.s.saveGpu && (this.doc.hidden || (this.doc.hasFocus && !this.doc.hasFocus()));
      if (bg && this._last && now - this._last < 95) return;
      const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0.016;
      this._last = now;
      if (!this.m || !this.T) return;
      // камера
      const C = this.cam, T = this.camTo, k = 1 - Math.exp(-dt * this.ease);
      this.ease = Math.min(6, this.ease + dt * (this.ease < 6 ? 0.45 : 0));
      let moving = false;
      for (const key of ["yaw", "pitch", "dist", "x", "y", "z"]) {
        const d = T[key] - C[key];
        if (Math.abs(d) > (key === "dist" ? 0.05 : 1e-4)) { C[key] += d * k; moving = true; } else C[key] = T[key];
      }
      // перелёт нейронов при смене картины
      if (this.mixT < 1) {
        this.mixT = Math.min(1, this.mixT + dt / 1.4);
        const t = this.mixT, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const A = this.Pfrom, B = this.Pto, P = this.Pcur;
        for (let i = 0; i < P.length; i++) P[i] = A[i] + (B[i] - A[i]) * e;
        if (t >= 1) { P.set(B); this.Pfrom = null; }
        this._recolor();
      }
      const live = this.motionOn;
      if (live) {
        this.time += dt;
        const hold = this.sel >= 0 || this.focusG >= 0 || this.pointers.size ? 0 : 1;
        this.spinK += (hold - this.spinK) * Math.min(1, dt * 2);
        this.spinA += dt * this.s.spin * 0.07 * this.spinK;
      }
      if (!live && !moving && !this.dirty) return;
      this.dirty = false;
      this._fpsN++;
      if (now - this._fpsT > 1000) { this.fps = Math.round((this._fpsN * 1000) / (now - this._fpsT)); this._fpsN = 0; this._fpsT = now; this._meta(); if (!bg) this._adapt(); }
      this._draw();
      this._labels();
    }
    _meta() {
      const t = (this.opts.vaultName ? this.opts.vaultName + " · " : "") + this.fps + L(" к/с", " fps");
      if (this.meta.textContent !== t) this.meta.textContent = t;
    }
    // если кадры не успевают, временно уменьшаем разрешение
    _adapt() {
      if (this.s.quality === "max" || !this.motionOn) return;
      const was = !!this.slow;
      this.slowN = this.fps < 28 ? (this.slowN || 0) + 1 : this.fps > 50 ? 0 : this.slowN || 0;
      const now = was ? this.slowN > 0 || this.fps < 50 : this.slowN >= 2;
      if (now !== was) { this.slow = now; this.resize(); }
    }

    _draw() {
      const gl = this.gl, s = this.s, C = this.cam, T = this.T, P = this.P;
      const star = s.theme === "star";
      const W = T[0].w, H = T[0].h;
      const cp = Math.cos(C.pitch), eye = [C.x + C.dist * cp * Math.sin(C.yaw), C.y + C.dist * Math.sin(C.pitch), C.z + C.dist * cp * Math.cos(C.yaw)];
      const B = (this.basis = lookAt(this.V, eye, [C.x, C.y, C.z]));
      persp(this.Pm, FOV, this.w / this.h, 0.5, 8000);
      mul(this.VP, this.Pm, this.V);
      rotY(this.M, this.spinA);
      const tint = this._tint(), t = this.time;
      const px = H / (2 * Math.tan(FOV / 2)), pxCss = this.h / (2 * Math.tan(FOV / 2));
      const hs = this.lay ? this.lay.hs : 7;
      const occ = star ? 0 : 2.6 * hs * 1.02;
      const R = this.lay ? this.lay.R : 100;

      gl.bindFramebuffer(gl.FRAMEBUFFER, T[0].fb);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      // небо: звёзды, Млечный Путь или туманность
      const th = Math.tan(FOV / 2), sk = this._skyMode();
      const T1 = tint || (sk === 1 ? [1, 0.88, 0.72] : [0.95, 0.8, 0.62]);
      const T2 = tint ? tint.map((c) => c * 0.35 + 0.08) : sk === 1 ? [0.42, 0.52, 0.8] : [0.26, 0.31, 0.43];
      const setSky = (v) => {
        gl.uniform1i(v.u_bg, sk); gl.uniform1i(v.u_oct, s.quality === "fast" ? 3 : s.quality === "max" ? 6 : 5);
        gl.uniform1f(v.u_neb, sk === 1 ? 0.085 : 0.095); gl.uniform3fv(v.u_tint, T1); gl.uniform3fv(v.u_tint2, T2);
        gl.uniform3fv(v.u_gn, GN); gl.uniform1f(v.u_time, t); gl.uniform1f(v.u_pix, (2 * th) / H); gl.uniform1f(v.u_stars, s.stars ? 1 : 0);
      };
      let u = P.sky.u;
      gl.useProgram(P.sky.p);
      gl.bindVertexArray(this.vEmpty);
      gl.uniform3fv(u.u_r, B.r); gl.uniform3fv(u.u_u, B.u); gl.uniform3fv(u.u_f, B.f);
      gl.uniform2f(u.u_tan, th * (this.w / this.h), th);
      setSky(u);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      const usePoint = (prog, M) => {
        gl.useProgram(prog.p);
        const v = prog.u;
        gl.uniformMatrix4fv(v.u_vp, false, this.VP); gl.uniformMatrix4fv(v.u_m, false, M);
        gl.uniform1f(v.u_px, px); gl.uniform1f(v.u_time, t); gl.uniform3fv(v.u_cam, eye);
        return v;
      };
      gl.bindVertexArray(this.vQuad);
      if (!star) {
        // чёрная дыра поверх неба: тень закрывает то, что за ней, а звёзды вокруг искривлены
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        u = P.hole.u;
        gl.useProgram(P.hole.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP);
        gl.uniform3fv(u.u_r, B.r); gl.uniform3fv(u.u_u, B.u);
        gl.uniform1f(u.u_size, 28 * hs * 1.45);
        gl.uniform3fv(u.u_cam, eye); gl.uniform1f(u.u_hs, hs); gl.uniform1f(u.u_bb, tint ? 0 : 1);
        setSky(u);
        gl.uniform1f(u.u_bright, 0.55 + 0.45 * s.glow);
        gl.uniform1i(u.u_steps, QUALITY[s.quality].steps);
        gl.uniform3fv(u.u_hot, tint ? tint.map((c) => 0.6 + 0.4 * c) : [1, 0.93, 0.82]);
        gl.uniform3fv(u.u_warm, tint ? tint.map((c) => c * 0.8) : [0.95, 0.5, 0.2]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        u = P.core.u;
        gl.useProgram(P.core.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP);
        gl.uniform3fv(u.u_r, B.r); gl.uniform3fv(u.u_u, B.u);
        gl.uniform1f(u.u_size, 70);
        gl.uniform3fv(u.u_tint, tint ? tint.map((x) => 0.5 + 0.5 * x) : [1, 1, 1]);
        gl.uniform1f(u.u_glow, s.glow); gl.uniform1f(u.u_gs, s.glowSize); gl.uniform1f(u.u_time, t);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (!star && s.debris && this.B.dust) {
        u = P.dust.u;
        gl.useProgram(P.dust.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniform1f(u.u_time, t); gl.uniform1f(u.u_hs, hs); gl.uniform1f(u.u_px, px);
        gl.uniform3fv(u.u_cam, eye); gl.uniform1f(u.u_occ, occ); gl.uniform1f(u.u_halo, 0.35);
        gl.bindVertexArray(this.B.dust.vao); gl.drawArrays(gl.POINTS, 0, this.B.dust.n);
      }
      if (!star && s.jets) {
        u = P.jet.u;
        gl.useProgram(P.jet.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniform3fv(u.u_cam, eye); gl.uniform3fv(u.u_r, B.r);
        gl.uniform1f(u.u_hs, hs); gl.uniform1f(u.u_segs, 40); gl.uniform1f(u.u_len, 34); gl.uniform1f(u.u_time, t);
        gl.uniform1f(u.u_jet, 0.24 * (0.5 + 0.5 * s.glow)); gl.uniform1f(u.u_occ, occ);
        gl.uniform3fv(u.u_tint, tint ? tint.map((c) => 0.4 + 0.6 * c) : [0.55, 0.72, 1.0]);
        gl.bindVertexArray(this.vEmpty); gl.drawArrays(gl.TRIANGLES, 0, 2 * 40 * 6);
      }
      // сглаженные ленты: связи и кольца
      const lw = Math.max(0.7, (H / 1000) * 1.15);
      const rib = (buf, M, alpha, segs, width) => {
        u = P.rib.u;
        gl.useProgram(P.rib.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniformMatrix4fv(u.u_m, false, M);
        gl.uniform3fv(u.u_cam, eye); gl.uniform1f(u.u_occ, occ); gl.uniform1f(u.u_alpha, alpha);
        gl.uniform2f(u.u_res, W, H); gl.uniform1f(u.u_segs, segs); gl.uniform1f(u.u_w, width);
        gl.bindVertexArray(buf.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, segs * 6, buf.n);
      };
      const ra = this._rings();
      if (ra > 0 && this.B.rings) rib(this.B.rings, this.M, ra * 0.4, 1, lw * 0.9);
      // кометы на дальних орбитах: сужающийся хвост и яркая голова
      if (s.comets) {
        const S = new Float32Array(16); S[0] = S[5] = S[10] = R; S[15] = 1;
        const VPs = new Float32Array(16);
        mul(VPs, this.VP, S);
        const ct = tint ? tint.map((c) => 0.5 + 0.5 * c) : [1, 0.97, 0.92];
        u = P.tail.u;
        gl.useProgram(P.tail.p);
        gl.uniformMatrix4fv(u.u_vp, false, VPs);
        gl.uniform2f(u.u_res, W, H); gl.uniform1f(u.u_time, t); gl.uniform1f(u.u_segs, 48); gl.uniform1f(u.u_w, lw * 1.5);
        gl.uniform3fv(u.u_tint, ct); gl.uniform3fv(u.u_cam, eye.map((x) => x / R)); gl.uniform1f(u.u_occ, occ / R);
        gl.bindVertexArray(this.B.cometI.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 48 * 6, this.B.cometI.n);
        u = P.comet.u;
        gl.useProgram(P.comet.p);
        gl.uniformMatrix4fv(u.u_vp, false, VPs);
        gl.uniform1f(u.u_time, t); gl.uniform1f(u.u_px, px); gl.uniform3fv(u.u_tint, ct);
        gl.uniform3fv(u.u_cam, eye.map((x) => x / R)); gl.uniform1f(u.u_occ, occ / R); gl.uniform1f(u.u_halo, 0.8);
        gl.bindVertexArray(this.B.cometH.vao); gl.drawArrays(gl.POINTS, 0, this.B.cometH.n);
      }
      // связи
      if (s.links > 0 && this.B.links && this.B.links.n) rib(this.B.links, this.M, s.links * (star ? 0.3 : 0.22) * (this.m.N > 2000 ? 0.6 : 1), this.m.edges.length > 6000 ? 6 : 12, lw);
      // бусины света
      if (this.B.beads && this.B.beads.n) {
        u = usePoint(P.bead, this.M);
        gl.uniform1f(u.u_speed, s.beadSpeed * 0.25); gl.uniform1f(u.u_size, 0.9 * s.nodeSize); gl.uniform1f(u.u_occ, occ);
        gl.uniform1f(u.u_bend, star ? 0.08 : 0.16);
        gl.uniform3fv(u.u_tint, tint ? tint.map((c) => 0.6 + 0.4 * c) : star ? [1, 1, 1] : [1, 0.92, 0.8]);
        gl.uniform1f(u.u_halo, 0.6);
        gl.bindVertexArray(this.B.beads.vao); gl.drawArrays(gl.POINTS, 0, this.B.beads.n);
      }
      // нейроны
      if (this.B.nodes) {
        u = usePoint(P.point, this.M);
        gl.uniform1f(u.u_size, s.nodeSize * (star ? 0.4 : 0.55)); gl.uniform1f(u.u_min, 1.2);
        gl.uniform1f(u.u_gs, s.glowSize); gl.uniform1f(u.u_pulse, s.pulse ? 1 : 0);
        gl.uniform1f(u.u_dim, 0.18); gl.uniform1f(u.u_occ, occ); gl.uniform1f(u.u_halo, 0.12 + 0.28 * s.glow);
        gl.bindVertexArray(this.B.nodes.vao); gl.drawArrays(gl.POINTS, 0, this.B.nodes.n);
      }

      // свечение: яркое → вниз по уровням → обратно
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vEmpty);
      const full = (prog, src, dst, pw, ph) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.useProgram(prog.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(prog.u.u_t, 0);
        if (prog.u.u_px) gl.uniform2f(prog.u.u_px, pw, ph);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      if (T.length > 1) {
        full(P.bright, T[0], T[1], 0, 0);
        for (let i = 2; i < T.length; i++) full(P.down, T[i - 1], T[i], 1 / T[i - 1].w, 1 / T[i - 1].h);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = T.length - 1; i > 1; i--) full(P.up, T[i], T[i - 1], 1 / T[i].w, 1 / T[i].h);
        gl.disable(gl.BLEND);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.c.width, this.c.height);
      u = P.comp.u;
      gl.useProgram(P.comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T[0].tex); gl.uniform1i(u.u_s, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (T[1] || T[0]).tex); gl.uniform1i(u.u_b, 1);
      gl.uniform1f(u.u_bk, T.length > 1 ? 0.32 * (0.4 + s.glow) : 0);
      const TS = T[Math.min(3, T.length - 1)];
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, TS.tex); gl.uniform1i(u.u_b2, 2);
      gl.uniform1f(u.u_sk, !star && T.length > 3 ? 0.05 * s.glow : 0); gl.uniform1f(u.u_ax, 1.6 / TS.w);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
      this.pxCss = pxCss;
    }

    destroy() {
      this.destroyed = true;
      this.win.cancelAnimationFrame(this.raf);
      if (this._hoverT) this.win.cancelAnimationFrame(this._hoverT);
      if (this._ro) this._ro.disconnect();
      for (const off of this._off || []) off();
      if (this.gl) {
        this._freeTargets();
        const ext = this.gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
      this.host.textContent = "";
      this.host.classList.remove("fsn");
    }
  }

  function ago(t) {
    if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return L("только что", "just now");
    const u = s < 3600 ? [Math.round(s / 60), ["минуту", "минуты", "минут"], ["minute", "minutes"]]
      : s < 86400 ? [Math.round(s / 3600), ["час", "часа", "часов"], ["hour", "hours"]]
      : s < 86400 * 60 ? [Math.round(s / 86400), ["день", "дня", "дней"], ["day", "days"]]
      : [Math.round(s / (86400 * 30)), ["месяц", "месяца", "месяцев"], ["month", "months"]];
    return L(u[0] + " " + plural(u[0], u[1]) + " назад", u[0] + " " + plural(u[0], u[1], u[2]) + " ago");
  }

  return { Scene, DEFAULTS, ago, layout, util: { persp, lookAt, mul, gauss, clamp, lin, SH, HEAD, NOISE } };
})();

/* ------------------------------------------------------------------ */
/* Вкладка Obsidian                                                    */
/* ------------------------------------------------------------------ */
const SPACE_VIEW = "flora-space";

class SpaceNeuronsView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scene = null;
    this._timer = null;
  }
  getViewType() { return SPACE_VIEW; }
  getDisplayText() { return "Space Neurons"; }
  getIcon() { return "orbit"; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("ng-view"); el.addClass("fsn-view");
    const wrap = el.createDiv({ cls: "ng-wrap" });
    const stage = wrap.createDiv({ cls: "fsn-stage" });
    const loader = floraLoader(wrap);
    loader.set(L("Собираю созвездия", "Gathering the constellations"));
    this._loader = loader;
    const shownAt = performance.now();
    const st = this.plugin.settings;
    this.prevVisit = st.spaceVisit || 0;
    st.spaceVisit = Date.now();
    this.plugin.saveSettings();
    this.scene = new FSpace.Scene(stage, {
      settings: st.space,
      icon: (e, name) => { if (typeof obsidian.setIcon === "function") obsidian.setIcon(e, name); },
      vaultName: typeof this.app.vault.getName === "function" ? this.app.vault.getName() : "",
      aiAvailable: typeof FloraAI !== "undefined" && FloraAI.available(),
      onOpen: (n, ev) => this.openNode(n, ev),
      onAI: () => this.refresh(true),
      onSave: (s) => {
        this.plugin.settings.space = Object.assign({}, s);
        window.clearTimeout(this._saveT);
        this._saveT = window.setTimeout(() => this.plugin.saveSettings(), 400);
      },
      onReady: () => window.setTimeout(() => { loader.done(); stage.addClass("is-ready"); }, Math.max(0, 900 - (performance.now() - shownAt))),
    });
    await this.refresh(true);
    this.greet();

    const later = () => { window.clearTimeout(this._timer); this._timer = window.setTimeout(() => this.refresh(false), 1500); };
    this.registerEvent(this.app.metadataCache.on("resolved", later));
    this.registerEvent(this.app.vault.on("create", later));
    this.registerEvent(this.app.vault.on("delete", later));
    this.registerEvent(this.app.vault.on("rename", later));
  }

  async onClose() {
    window.clearTimeout(this._timer);
    window.clearTimeout(this._saveT);
    if (this._loader) { this._loader.remove(); this._loader = null; }
    if (this.scene) this.scene.destroy();
    this.scene = null;
  }
  onResize() { if (this.scene) this.scene.resize(); }

  // приветствие: что изменилось с прошлого раза
  greet() {
    const sc = this.scene;
    if (!sc || !sc.hello || !this.g) return;
    const el = sc.hello, doc = el.ownerDocument;
    const add = (cls, text) => { const d = doc.createElement("div"); d.className = cls; d.textContent = text; el.appendChild(d); };
    const h = new Date().getHours();
    el.textContent = "";
    add("fsn-hello-t", h < 5 ? L("Доброй ночи.", "Good night.") : h < 12 ? L("Доброе утро.", "Good morning.") : h < 17 ? L("Добрый день.", "Good afternoon.") : L("Добрый вечер.", "Good evening."));
    const last = this.prevVisit;
    if (!last) { add("fsn-hello-p", L("Это ваше хранилище в виде космоса: каждая заметка — нейрон, каждая ссылка — нить света.", "This is your vault as space: every note is a neuron, every link a thread of light.")); return; }
    add("fsn-hello-s", L("С прошлого раза прошло ", "Since you were last here · ") + FSpace.ago(last).replace(L(" назад", " ago"), ""));
    const list = this.g.nodes.filter((n) => !n.ai);
    const born = list.filter((n) => n.ctime > last).length, edited = list.filter((n) => n.mtime > last && !(n.ctime > last)).length;
    if (!born && !edited) { add("fsn-hello-p", L("Всё на своих местах, нового ничего не появилось.", "Everything is where you left it; nothing new came in.")); return; }
    const parts = [];
    if (born) parts.push(floraNum(born) + " " + plural(born, ["новая заметка", "новые заметки", "новых заметок"], ["new note", "new notes"]));
    if (edited) parts.push(floraNum(edited) + " " + plural(edited, ["заметка изменена", "заметки изменены", "заметок изменено"], ["note edited", "notes edited"]));
    add("fsn-hello-p", parts.join(", ") + ".");
  }

  collect() {
    const g = Flora3DView.prototype.collect.call(this);
    for (const n of g.nodes) {
      const f = this.app.vault.getAbstractFileByPath(n.id);
      if (f && f.stat) { n.mtime = f.stat.mtime; n.ctime = floraBorn(f, this.app.metadataCache.getFileCache(f)) || f.stat.ctime; }
    }
    return g;
  }

  // проекты с ИИ — по желанию, из кэша последней синхронизации
  async collectAI(g) {
    if (typeof FloraAI === "undefined" || !FloraAI.available()) return;
    const cache = await this.plugin.aiLoad();
    if (!cache || !cache.files || !Object.keys(cache.files).length) {
      if (!this._aiWarned) { this._aiWarned = true; new obsidian.Notice(L("Проектов с ИИ пока нет: откройте «Проекты с ИИ» и нажмите «Синхронизировать».", "No AI projects yet: open AI projects and press Sync.")); }
      return;
    }
    const recs = Object.values(cache.files).map((x) => x && x.rec).filter(Boolean);
    const B = FloraAI.build({ sessions: recs.filter((r) => r.ai), memories: recs.filter((r) => !r.ai) });
    const shown = this.plugin.settings.aiChats === false ? B.projects.filter((p) => !p.chat) : B.projects;
    const folder = this.plugin.settings.aiFolder || "Flora AI";
    const have = new Set(g.nodes.map((n) => n.id));
    for (const p of shown) {
      const ais = [...new Set(p.sessions.map((S) => S.ai))];
      const look = typeof AI_LOOK !== "undefined" ? AI_LOOK[ais[0]] : null;
      const id = "p:" + p.key;
      g.nodes.push({ id, title: p.name, folder: "", tags: [], ai: true, color: look ? look.from : "#ffc29e",
        aiName: ais.map((a) => (FloraAI.AIS[a] ? FloraAI.AIS[a].name : a)).join(", "), path: p.path || "", sessions: p.sessions.length, mtime: p.t1 || 0, ctime: p.t0 || 0 });
      // проект, уже выгруженный в заметку, связан с ней
      const note = obsidian.normalizePath(folder + "/" + p.name + ".md");
      if (have.has(note)) g.edges.push({ a: id, b: note, w: 1 });
    }
    for (const l of cache.links || []) if (l && l.a && l.b && l.a.startsWith("p:") && l.b.startsWith("p:")) g.edges.push({ a: l.a, b: l.b, w: 1 });
  }

  async refresh(force) {
    if (!this.scene || this.scene.failed) return;
    try {
      const g = this.collect();
      const s = this.plugin.settings.space || {};
      if (s.ai) await this.collectAI(g);
      if (!this.scene) return;
      const sig = g.nodes.length + "|" + g.edges.length + "|" + g.nodes.map((n) => n.id + "#" + n.folder).join("\n") + "|" + g.edges.map((e) => e.a + ">" + e.b).join("\n");
      if (!force && sig === this._sig) return;
      this._sig = sig;
      this.g = g;
      this.scene.setData(g);
    } catch (e) {
      console.error("Space Neurons:", e);
    }
  }

  async openNode(n, ev) {
    if (n.ai) { this.plugin.openAI(); return; }
    const f = this.app.vault.getAbstractFileByPath(n.id);
    if (!(f instanceof obsidian.TFile)) return;
    let target = null;
    if (!obsidian.Keymap.isModEvent(ev)) {
      this.app.workspace.iterateRootLeaves((l) => {
        if (!target && l !== this.leaf && l.view && l.view.getViewType() === "markdown") target = l;
      });
    }
    if (!target) target = this.app.workspace.getLeaf("tab");
    await target.openFile(f);
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }
}
