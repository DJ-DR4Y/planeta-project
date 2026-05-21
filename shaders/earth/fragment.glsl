uniform float uTime;
uniform vec3  uEmissiveColor;
uniform float uEmissiveIntensity;
uniform vec3  uColorMult;
varying vec3  vNormal;
varying vec3  vPosition;
varying vec3  vWorldPos;

// ── 3D Simplex Noise ──────────────────────────────────────
// Simplex noise uses a tetrahedral lattice instead of a cubic one.
// This eliminates all axis-aligned grid artifacts (visible lines)
// that appear in classic value/gradient noise on high-res geometry.
// Implementation: Ian McEwan / ashima arts (MIT licence)
vec3 _mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 _mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 _permute(vec4 x) { return _mod289(((x*34.0)+1.0)*x); }
vec4 _taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314*r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = _mod289(i);
  vec4 p = _permute(_permute(_permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4  j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4  x_ = floor(j * ns.z);
  vec4  y_ = floor(j - 7.0 * x_);
  vec4  x  = x_ * ns.x + ns.yyyy;
  vec4  y  = y_ * ns.x + ns.yyyy;
  vec4  h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = _taylorInvSqrt(vec4(
                dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
// Wrapper: maps snoise [-1,1] → [0,1] for drop-in FBM use
float sn(vec3 p) { return snoise(p) * 0.5 + 0.5; }

// 6-octave FBM — terrain & moisture
float fbm(vec3 p) {
  float v=0.0, amp=0.5, freq=1.0;
  for(int i=0;i<6;i++){v+=sn(p*freq)*amp;freq*=2.1;amp*=0.48;}
  return v;
}
// 4-octave FBM — domain warp & bump normals
float fbmB(vec3 p) {
  float v=0.0, amp=0.5, freq=1.0;
  for(int i=0;i<4;i++){v+=sn(p*freq)*amp;freq*=2.2;amp*=0.45;}
  return v;
}

// ── 2D biome: elevation × moisture ────────────────────────
vec3 biome(float elev, float moist, float lat, vec3 sp) {
  float pol = abs(lat);

  vec3 deepSea   = vec3(0.01, 0.06, 0.22);
  vec3 shallowS  = vec3(0.04, 0.24, 0.46);
  vec3 sand      = vec3(0.78, 0.70, 0.46); // beach / dry shore
  vec3 desert    = vec3(0.79, 0.60, 0.27); // arid inland
  vec3 savanna   = vec3(0.54, 0.49, 0.21); // dry transition
  vec3 grassland = vec3(0.22, 0.52, 0.16);
  vec3 forest    = vec3(0.07, 0.30, 0.10);
  vec3 jungle    = vec3(0.04, 0.37, 0.08); // dense tropical
  vec3 steppe    = vec3(0.46, 0.40, 0.26); // dry highland
  vec3 rock      = vec3(0.40, 0.35, 0.28);
  vec3 snowCap   = vec3(0.92, 0.95, 1.00);
  vec3 tundra    = vec3(0.55, 0.51, 0.43); // exposed polar soil

  vec3 col;

  if (elev < 0.0) {
    // Ocean — deep navy → shallow teal
    col = mix(deepSea, shallowS, smoothstep(-0.30, 0.0, elev));

  } else if (elev < 0.04) {
    // Shoreline: low moisture → desert sand touching ocean (rare)
    //            high moisture → lush green coast
    vec3 dryShore = sand;
    vec3 wetShore = mix(sand, grassland, smoothstep(0.45, 0.78, moist));
    vec3 shoreCol = mix(dryShore, wetShore, smoothstep(0.18, 0.62, moist));
    col = mix(shallowS, shoreCol, smoothstep(0.0, 0.04, elev));

  } else if (elev < 0.14) {
    // Lowland: moisture axis drives desert ↔ jungle
    // Low moist = arid (desert/savanna); high moist = forested (forest/jungle)
    vec3 dryLow = mix(desert, savanna,   smoothstep(0.10, 0.38, moist));
    vec3 wetLow = mix(grassland, jungle, smoothstep(0.52, 0.85, moist));
    // Start from shore color at min elev so boundary is smooth
    vec3 shoreEnd = mix(sand, mix(sand, grassland, smoothstep(0.45, 0.78, moist)),
                        smoothstep(0.18, 0.62, moist));
    vec3 midLow   = mix(dryLow, wetLow, smoothstep(0.28, 0.58, moist));
    col = mix(shoreEnd, midLow, smoothstep(0.04, 0.10, elev));

  } else if (elev < 0.28) {
    // Highland: dry → steppe → rock ; wet → temperate forest → rock
    vec3 hiBase = mix(steppe, forest, smoothstep(0.28, 0.66, moist));
    col = mix(hiBase, rock, smoothstep(0.16, 0.28, elev));

  } else {
    // Peaks: rock → snow
    col = mix(rock, snowCap, smoothstep(0.28, 0.44, elev));
  }

  // ── Polar caps: noisy edge + tundra fringe ────────────
  // Use high-freq noise to perturb the boundary so it looks
  // like exposed ground patches, not a smooth gradient
  float pn = sn(sp * 11.0 + vec3(0.3, 1.7, 2.9)) * 0.07
           + sn(sp * 22.0 + vec3(4.1, 0.8, 3.5)) * 0.03; // two scales

  // Tundra fringe (brownish soil) before the snow
  col = mix(col,    tundra,  smoothstep(0.72, 0.80, pol + pn));
  // Sharp snow cap edge (narrow smoothstep = crisper line)
  col = mix(col,    snowCap, smoothstep(0.79, 0.87, pol + pn));

  return col;
}

void main() {
  vec3  p   = normalize(vPosition);
  float lat = p.y;

  // ── Domain warp: organic continent shapes ─────────────
  // Two independent warp fields distort the lookup point,
  // creating bays, peninsulas and irregular coastlines
  float wx = fbmB(p * 1.2 + vec3(0.00, 0.00, 0.00)) - 0.5;
  float wy = fbmB(p * 1.2 + vec3(5.20, 1.30, 8.40)) - 0.5;
  vec3  wp = normalize(p + vec3(wx, wy, wx * wy) * 0.55);

  // ── Terrain elevation ──────────────────────────────────
  // Frequency 1.0 (was 1.8) → larger continent blobs
  // Offset -0.43 (was -0.48) → ~43% ocean, ~57% land
  float continent = fbm(wp * 1.0 + vec3(3.7, 1.2, 0.5)) - 0.43;
  // Medium ridges give mountain ranges
  float ridges    = (fbm(p  * 4.5 + vec3(0.0, 2.1, 4.3)) - 0.5) * 0.18;
  // High-freq micro for surface grain
  float micro     = (fbmB(p * 8.0 + vec3(1.3, 5.7, 0.2)) - 0.5) * 0.06;
  float elev      = continent + ridges + micro;

  // ── Moisture ───────────────────────────────────────────
  float moist = fbm(p * 2.2 + vec3(-5.1, 3.8, 1.4));
  moist = clamp(moist + smoothstep(0.07, 0.0, elev) * step(0.0, elev) * 0.16, 0.0, 1.0);

  // ── Bump normals (mountain relief) ────────────────────
  vec3  t1  = normalize(cross(p, vec3(0.0, 1.0, 0.01)));
  vec3  t2  = normalize(cross(t1, p));
  float eps = 0.018;
  vec3  bS  = vec3(1.1, 0.7, 2.3);
  float b0  = fbmB(p          * 6.5 + bS);
  float b1  = fbmB((p+t1*eps) * 6.5 + bS);
  float b2  = fbmB((p+t2*eps) * 6.5 + bS);
  float land = smoothstep(0.0, 0.07, elev);
  vec3  bN   = normalize(vNormal
                + (b1-b0) * t1 * 6.5 * land
                + (b2-b0) * t2 * 6.5 * land);

  // ── Biome ──────────────────────────────────────────────
  vec3 albedo = biome(elev, moist, lat, p);

  // ── Lighting ───────────────────────────────────────────
  vec3  L     = normalize(vec3(5.0, 5.0, 5.0));
  float dFlat = max(dot(vNormal, L), 0.0);
  float dBump = max(dot(bN,      L), 0.0);
  float diff  = mix(dFlat, dBump, land);

  // Ocean specular (Blinn-Phong) — water shimmer
  vec3  viewDir = normalize(cameraPosition - vWorldPos);
  vec3  H       = normalize(L + viewDir);
  float spec    = pow(max(dot(vNormal, H), 0.0), 90.0)
                  * (1.0 - land) * 0.55;

  // Coastal rim: slight brightness at shoreline = visible elevation
  float shore   = smoothstep(0.0, 0.05, elev) * smoothstep(0.12, 0.04, elev);

  vec3 color = albedo * (0.18 + diff * 0.82);
  color += vec3(spec * 0.55, spec * 0.75, spec);  // blue-tinted water glint
  color += shore * 0.055;                         // coast highlight
  color += uEmissiveColor * uEmissiveIntensity * 0.35;
  color *= uColorMult;

  gl_FragColor = vec4(color, 1.0);
}
